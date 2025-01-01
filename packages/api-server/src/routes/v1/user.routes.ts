import { Type } from '@sinclair/typebox'
import { type UserPublicProfile, UserPublicProfileSchema, NewUserSchema, UserPrivateProfileSchema, SubmissionSchema, TeamInvitationSchema } from '@argoncs/types' /*=*/
import { emailExists, fetchUser, registerUser, queryUsers, userIdExists, usernameExists, fetchUserInvitations } from '../../services/user.services.js'
import { ownsResource } from '../../auth/ownership.auth.js'
import { type FastifyTypeBox } from '../../types.js' /*=*/
import { NotFoundError, badRequestSchema, conflictSchema, forbiddenSchema, notFoundSchema, unauthorizedSchema } from 'http-errors-enhanced'
import { completeTeamInvitation } from '../../services/team.services.js'
import { hasDomainPrivilege } from '../../auth/scope.auth.js'
import { isTeamMember } from '../../auth/team.auth.js'
import { fetchSubmission } from '@argoncs/common'
import { isSuperAdmin } from '../../auth/role.auth.js'
import { userAuthHook } from '../../hooks/authentication.hooks.js'
import { submissionInfoHook } from '../../hooks/submission.hooks.js'
import gravatarUrl from 'gravatar-url'
import { querySubmissions } from '../../services/submission.services.js'
import {fetchContestProblem} from '../../services/contest.services.js'

async function userProfileRoutes (profileRoutes: FastifyTypeBox): Promise<void> {
  profileRoutes.get(
    '/public',
    {
      schema: {
        response: {
          200: UserPublicProfileSchema,
          400: badRequestSchema,
          404: notFoundSchema
        },
        params: Type.Object({ userId: Type.String() })
      }
    },
    async (request, reply) => {
      const { userId } = request.params
      const { username, name, id, email } = await fetchUser({ userId })
      const publicProfile: UserPublicProfile = { username, name, id }
      await reply.status(200).send(publicProfile)
    }
  )

  profileRoutes.get(
    '/private',
    {
      schema: {
        response: {
          200: UserPrivateProfileSchema,
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        },
        params: Type.Object({ userId: Type.String() })
      },
      onRequest: [userAuthHook, profileRoutes.auth([
        [ownsResource],
        [isSuperAdmin]]) as any]
    },
    async (request, reply) => {
      const { userId } = request.params
      const { username, name, email, scopes, role, teams, year, id } = await fetchUser({ userId })
      return await reply.status(200).send({ id, username, name, email, scopes, role, teams, year })
    }
  )
}

async function userSubmissionRoutes (submissionRoutes: FastifyTypeBox): Promise<void> {
  submissionRoutes.get(
    '/',
    {
      schema: {
        params: Type.Object({ userId: Type.String() }),
        response: {
          200: Type.Array(Type.Intersect([
            Type.Object({ problemName: Type.String(), problemId: Type.String() }),
            SubmissionSchema
          ])),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, submissionRoutes.auth([
        [ownsResource],
        [isSuperAdmin]
      ]) as any]
    },
    async (request, reply) => {
      const { userId } = request.params
      const submissions = await querySubmissions({ query: { userId } })
      const _submissions = await Promise.all(submissions.map(async submission => {
        const { name: problemName } = await fetchContestProblem({ problemId: submission.problemId });
        return { ...submission, problemName };
      }));
      // NOTE: having some issues with the _submissions object being GC'ed before returning
      // When you print _submissions, the object is present, but on the HTTP response it only shows 'PROBLEM NAME'.
      // I'm guessing this is something to do with ownership, not the typing.
      // I've just made it stringify it first so that GC won't mess with it.
      // NOTE: Doing JSON.parse(JSON.stringify(x)) doesn't work either for some reason.
      return await reply.status(200).send(JSON.stringify(_submissions))
    }
  )

  submissionRoutes.get(
    '/:submissionId',
    {
      schema: {
        params: Type.Object({ userId: Type.String(), submissionId: Type.String() }),
        response: {
          200: SubmissionSchema,
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, submissionInfoHook, submissionRoutes.auth([
        [isTeamMember], // User viewing submissions from other team members
        [hasDomainPrivilege(['problem.manage'])], // Admin viewing all submissions to problems in their domain
        [ownsResource] // User viewing their own submission
      ]) as any]
    },
    async (request, reply) => {
      const { submissionId } = request.params
      const submission = await fetchSubmission({ submissionId })

      return await reply.status(200).send(submission)
    })
}


async function userInviteRoutes (inviteRoutes: FastifyTypeBox): Promise<void> {

  /* Returns all pending invites to user
   */
  inviteRoutes.get(
    '/',
    {
      schema: {
        params: Type.Object({ userId: Type.String() }),
        response: {
          200: Type.Array(TeamInvitationSchema),
          400: badRequestSchema,
          401: unauthorizedSchema
        },
        onRequest: [userAuthHook]
      }
    },
    async (request, reply) => {
      const { userId } = request.params;
      const invites = await fetchUserInvitations({ userId });
      return await reply.status(200).send(invites.slice(0,10))
    }
  )

  /* Accept Invite
   */
  inviteRoutes.post(
    '/:invitationId',
    {
      schema: {
        params: Type.Object({ userId: Type.String(), invitationId: Type.String() }),
        response: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema,
          409: conflictSchema
        }
      },
      onRequest: [userAuthHook, inviteRoutes.auth([[ownsResource]]) as any]
    },
    async (request, reply) => {

      const { invitationId, userId } = request.params
      await completeTeamInvitation({ invitationId, userId })

      return await reply.status(204).send()
    }
  )

}

export async function userRoutes (routes: FastifyTypeBox): Promise<void> {
  /* Update User */
  routes.post(
    '/',
    {
      schema: {
        body: NewUserSchema,
        response: {
          201: Type.Object({ userId: Type.String() }),
          400: badRequestSchema,
          409: conflictSchema
        }
      }
    },
    async (request, reply) => {
      const user = request.body
      const registered = await registerUser({ newUser: user })
      return await reply.status(201).send(registered)
    }
  )

  routes.head(
    '/:userId',
    {
      schema: {
        response: {
          400: badRequestSchema,
          404: notFoundSchema
        },
        params: Type.Object({ userId: Type.String() })
      }
    },
    async (request, reply) => {
      const { userId } = request.params
      const exists = userId.includes('@') ? await emailExists({ email: userId }) : (userId.length === 21 ? await userIdExists({ userId }) : await usernameExists({ username: userId }))
      if (exists) {
        await reply.status(200).send()
      } else {
        throw new NotFoundError('User not found')
      }
    }
  )

  /* Search for user 
   */
  routes.get(
    '/',
    {
      schema: {
        response: {
          200: Type.Array(UserPublicProfileSchema),
          400: badRequestSchema,
          401: unauthorizedSchema
        },
        querystring: Type.Object({
          query: Type.String(),
          noteam: Type.Optional(Type.String())
        })
      },
      onRequest: [userAuthHook]
    },
    async (request, reply) => {
      const { query, noteam } = request.query as { query: string, noteam: undefined | string }
      let users = await queryUsers({ query })
      if (noteam != null) {
        users = users.filter((user) => user.teams[noteam] == null)
      }
      const profiles: UserPublicProfile[] = users.map((user) => {
        const { id, username, name, email } = user
        const gravatar = email != null ? gravatarUrl(email) : undefined
        return { id, username, name, gravatar }
      })
      return await reply.status(200).send(profiles.slice(0, 10))
    }
  )


  await routes.register(userProfileRoutes, { prefix: '/:userId/profiles' })
  await routes.register(userSubmissionRoutes, { prefix: '/:userId/submissions' })
  await routes.register(userInviteRoutes, { prefix: '/:userId/invitations' })
}
