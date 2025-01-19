import { Type } from '@sinclair/typebox'
import { type FastifyTypeBox } from '../../types.js' /*=*/
import {
  ContestProblemListSchema,
  ContestSchema,
  NewTeamSchema,
  TeamMembersSchema,
  NewSubmissionSchema,
  SubmissionSchema,
  TeamScoreSchema,
  NewContestSchema,
  TeamInvitationSchema,
  ProblemSchema
} from '@argoncs/types'
import {
  UnauthorizedError,
  badRequestSchema,
  conflictSchema,
  forbiddenSchema,
  methodNotAllowedSchema,
  notFoundSchema,
  unauthorizedSchema,
  BadRequestError
} from 'http-errors-enhanced'
import {
  contestBegan,
  contestEnded,
  contestNotBegan,
  contestPublished,
  registeredForContest,
  contestRunning
} from '../../auth/contest.auth.js'
import {
  hasContestPrivilege,
  hasDomainPrivilege,
  hasNoPrivilege
} from '../../auth/scope.auth.js'
import {
  fetchContest,
  fetchContestProblemList,
  fetchContestRanklist,
  deleteContest,
  removeProblemFromContest,
  updateContest,
  publishContest,
  fetchPublishedContests,
  fetchContestProblem,
  fetchContestParticipants
} from '../../services/contest.services.js'
import {
  createTeam,
  createTeamInvitation,
  deleteTeam,
  deleteTeamInvitation,
  fetchTeam,
  fetchTeamInvitations,
  fetchTeamMembers,
  makeTeamCaptain,
  removeTeamMember
} from '../../services/team.services.js'
import { isTeamCaptain } from '../../auth/team.auth.js'
import { createSubmission, querySubmissions, rejudgeProblem } from '../../services/submission.services.js'
import { hasVerifiedEmail } from '../../auth/email.auth.js'
import { userAuthHook } from '../../hooks/authentication.hooks.js'
import { contestInfoHook } from '../../hooks/contest.hooks.js'
import { fetchUser } from '../../services/user.services.js'
import { createPolygonUploadSession } from '../../services/testcase.services.js'

async function contestProblemRoutes (problemRoutes: FastifyTypeBox): Promise<void> {
  problemRoutes.addHook('onRequest', contestInfoHook)
  problemRoutes.get(
    '/',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: ContestProblemListSchema,
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [problemRoutes.auth([
        [userAuthHook, hasDomainPrivilege(['contest.read'])], // Domain scope
        [userAuthHook, hasContestPrivilege(['read'])], // Contest privilege
        [contestBegan], // Regular participant
        [contestEnded] // Past contest
      ]) as any]
    },
    async (request, reply) => {
      const { contestId } = request.params
      const problemList = await fetchContestProblemList({ contestId })
      return await reply.status(200).send(problemList)
    }
  )

  problemRoutes.get(
    '/:problemId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), problemId: Type.String() }),
        response: {
          200: ProblemSchema,
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [problemRoutes.auth([
        [userAuthHook, hasDomainPrivilege(['contest.read'])], // Domain scope
        [userAuthHook, hasContestPrivilege(['read'])], // Contest privilege
        [contestBegan], // Regular participant
        [contestEnded] // Past contest
      ]) as any]
    },
    async (request, reply) => {
      const { contestId, problemId } = request.params
      const problem = await fetchContestProblem({ problemId })
      return await reply.status(200).send(problem)
    }
  )

  problemRoutes.delete(
    '/:problemId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), problemId: Type.String() }),
        response: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, problemRoutes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId, problemId } = request.params
      await removeProblemFromContest({ contestId, problemId })
      return await reply.status(204).send()
    }
  )

  problemRoutes.post(
    '/:problemId/submissions',
    {
      schema: {
        body: NewSubmissionSchema,
        params: Type.Object({ contestId: Type.String(), problemId: Type.String() }),
        response: {
          202: Type.Object({ submissionId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, problemRoutes.auth([
        [hasDomainPrivilege(['contest.test'])], // Domain testers
        [hasContestPrivilege(['test'])], // Contest tester
        [contestRunning, registeredForContest]]) as any // Users
      ]
    },
    async (request, reply) => {
      if (request.user == null) 
        throw new UnauthorizedError("not logged in");

      const submission = request.body
      const { contestId, problemId } = request.params
      const created = await createSubmission({
        submission,
        problemId,
        userId: (request.user).id,
        contestId,
        teamId: request.user.teams[contestId] ?? undefined
      })
      return await reply.status(202).send(created)
    }
  )

  problemRoutes.post(
    '/:problemId/rejudge',
    {
      schema: {
        response: {
          202: Type.Object({ rejudges: Type.Number() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        },
        params: Type.Object({ problemId: Type.String() })
      },
      onRequest: [userAuthHook, problemRoutes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ])]
    },
    async (request, reply) => {
      // @ts-ignore
      const { problemId } = request.params;
      const rejudges = await rejudgeProblem({ problemId })
      return await reply.status(202).send({ rejudges })
    }
  )

  problemRoutes.get(
    '/polygon-upload-session',
    {
      schema: {
        response: {
          200: Type.Object({ uploadId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        },
        params: Type.Object({ contestId: Type.String() })
      },
      onRequest: [userAuthHook, problemRoutes.auth([
        [hasDomainPrivilege(['contest.manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId } = request.params
      const { uploadId } = await createPolygonUploadSession({ contestId })
      await reply.status(200).send({ uploadId })
    }
  )

  problemRoutes.get(
    '/:problemId/polygon-upload-session',
    {
      schema: {
        response: {
          200: Type.Object({ uploadId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        },
        params: Type.Object({ contestId: Type.String(), problemId: Type.String() }),
      },
      onRequest: [userAuthHook, problemRoutes.auth([
        [hasDomainPrivilege(['contest.manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId, problemId } = request.params
      const { uploadId } = await createPolygonUploadSession({ contestId, replaceId: problemId })
      await reply.status(200).send({ uploadId })
    }
  )
}

async function contestTeamRoutes (teamRoutes: FastifyTypeBox): Promise<void> {
  teamRoutes.addHook('onRequest', contestInfoHook)

  /* Create new team
   * - Sets current user as captain
   */
  teamRoutes.post(
    '/',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        body: NewTeamSchema,
        response: {
          201: Type.Object({ teamId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema,
          409: conflictSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [hasNoPrivilege, contestPublished, contestNotBegan, hasVerifiedEmail]
      ]) as any]
    },
    async (request, reply) => {
      if (request.user == null) {
        throw new UnauthorizedError('User not logged in')
      }

      const newTeam = request.body
      const { contestId } = request.params
      const result = await createTeam({ newTeam, contestId, userId: request.user.id })
      return await reply.status(201).send(result)
    }
  )

  teamRoutes.get(
    '/:teamId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String() }),
        response: {
          200: Type.Object({
            name: Type.String(),
            id: Type.String(),
            contestId: Type.String(),
            captain: Type.String(),
            members: Type.Array(Type.Object({
              name: Type.String(),
              id: Type.String()
            }))
          }),
          400: badRequestSchema,
          404: notFoundSchema
        }
      }
    },
    async (request, reply) => {
      const { contestId, teamId } = request.params
      const team = await fetchTeam({ teamId, contestId })
      const members = await Promise.all(team.members.map(async member => {
        const { name, id } = await fetchUser({userId: member});
        return { name, id };
      }));
      const _team = { ...team, members }
      return await reply.status(200).send(_team)
    }
  )

  teamRoutes.delete(
    '/:teamId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String() }),
        resposne: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema,
          405: methodNotAllowedSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [contestPublished, isTeamCaptain]
      ]) as any]
    },
    async (request, reply) => {
      const { teamId, contestId } = request.params
      await deleteTeam({ teamId, contestId })

      return await reply.status(204).send()
    }
  )

  teamRoutes.post(
    '/:teamId/invitations',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String() }),
        body: Type.Object({ userId: Type.String() }),
        response: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema,
          409: conflictSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [contestPublished, contestNotBegan, isTeamCaptain]
      ]) as any]
    },
    async (request, reply) => {
      const { userId } = request.body
      const { teamId, contestId } = request.params
      await createTeamInvitation({ teamId, contestId, userId })

      return await reply.status(204).send()
    }
  )

  teamRoutes.get(
    '/:teamId/invitations',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String() }),
        response: {
          200: Type.Array(TeamInvitationSchema),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [contestPublished, contestNotBegan, isTeamCaptain]
      ]) as any]
    },
    async (request, reply) => {
      const { teamId, contestId } = request.params
      const invitations = await fetchTeamInvitations({ teamId, contestId })

      return await reply.status(200).send(invitations)
    }
  )

  teamRoutes.delete(
    '/:teamId/invitations/:invitationId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String(), invitationId: Type.String() }),
        response: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [contestPublished, contestNotBegan, isTeamCaptain]
      ]) as any]
    },
    async (request, reply) => {
      const { teamId, contestId, invitationId } = request.params
      await deleteTeamInvitation({ teamId, contestId, invitationId })

      return await reply.status(204).send()
    }
  )

  teamRoutes.get(
    '/:teamId/members',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String() }),
        response: {
          200: TeamMembersSchema,
          400: badRequestSchema,
          404: notFoundSchema
        }
      }
    },
    async (request, reply) => {
      const { contestId, teamId } = request.params
      const members = await fetchTeamMembers({ teamId, contestId })
      return await reply.status(200).send(members)
    }
  )

  teamRoutes.delete(
    '/:teamId/members/:userId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String(), userId: Type.String() }),
        response: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema,
          405: methodNotAllowedSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [isTeamCaptain]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId, teamId, userId } = request.params
      await removeTeamMember({ teamId, contestId, userId })
      return await reply.status(204).send()
    }
  )

  teamRoutes.put(
    '/:teamId/captain',
    {
      schema: {
        params: Type.Object({ contestId: Type.String(), teamId: Type.String() }),
        body: Type.Object({ userId: Type.String() }),
        response: {
          200: Type.Object({ modified: Type.Boolean() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, teamRoutes.auth([
        [isTeamCaptain]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId, teamId } = request.params
      const { userId } = request.body
      const result = await makeTeamCaptain({ teamId, contestId, userId })
      return await reply.status(200).send(result)
    }
  )
}

async function contestRanklistRoutes (ranklistRoutes: FastifyTypeBox): Promise<void> {
  ranklistRoutes.get(
    '/',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: Type.Object({
            ranklist: Type.Array(Type.Any()),
            problems: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })) 
          }),
          400: badRequestSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, ranklistRoutes.auth([
        [contestBegan]
      ]) as any]
    },

    async (request, reply) => {
      const { contestId } = request.params
      const ranklist = await fetchContestRanklist({ contestId })
      const { problems } = await fetchContestProblemList({ contestId });
      
      return await reply.status(200).send({ problems, ranklist });
    }
  )
}

export async function contestRoutes (routes: FastifyTypeBox): Promise<void> {

  /* get published contests */
  routes.get(
    '/',
    {
      schema: {
        response: {
          200: Type.Array(ContestSchema),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
    },
    async (request, reply) => {
      const contests = await fetchPublishedContests({limit: 20}); 
      return await reply.status(200).send(contests)
    })

  routes.get(
    '/:contestId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: ContestSchema,
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, routes.auth([
        [userAuthHook, hasDomainPrivilege(['contest.read'])],
        [userAuthHook, hasContestPrivilege(['read'])],
        [contestPublished]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId } = request.params
      const contest = await fetchContest({ contestId })
      return await reply.status(200).send(contest)
    })

  routes.put(
    '/:contestId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        body: NewContestSchema,
        response: {
          200: Type.Object({ modified: Type.Boolean() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, userAuthHook, routes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId } = request.params
      const newContest = request.body
      const status = await updateContest({ contestId, newContest })
      return await reply.status(200).send(status)
    })

  routes.delete(
    '/:contestId',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: Type.Object({ modified: Type.Boolean() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, userAuthHook, routes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId } = request.params
      const status = await deleteContest({ contestId })
      return await reply.status(200).send(status)
    })

  routes.get(
    '/:contestId/submissions',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: Type.Any(),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, userAuthHook, routes.auth([
        [hasDomainPrivilege(['contest.test'])], // Domain testers
        [hasContestPrivilege(['test'])], // Contest tester
        [contestRunning, registeredForContest], // Participant
        [contestEnded] // Past
      ]) as any]
    },
    async (request, reply) => {
      
      if (request.user == null) throw new UnauthorizedError('User not logged in')

      const { contestId } = request.params
      const contestRunning = await fetchContest({ contestId })
        .then(contest => contest.startTime < Date.now() && contest.endTime > Date.now());
      const tester = request.user.teams[contestId] == undefined;
      const submissions = tester ?
        await querySubmissions({ query: { contestId, userId: request.user.id } }) :
        await querySubmissions({ query: { contestId, teamId: request.user.teams[contestId] }, notestcases: contestRunning })
      
      console.log('submissions queried: ', submissions.length);
      return await reply.status(200).send(JSON.stringify(submissions))
    })

  routes.get(
    '/:contestId/all-submissions',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: Type.Any(),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, userAuthHook, routes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ]) as any]
    },
    async (request, reply) => {
      if (request.user == null) {
        throw new UnauthorizedError('User not logged in')
      }

      const { contestId } = request.params
      const query = { contestId }
      const submissions = await querySubmissions({ query })
      return await reply.status(200).send(JSON.stringify(submissions));
    })

  routes.get(
    '/:contestId/all-participants',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          200: Type.Any(),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, userAuthHook, routes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ]) as any]
    },
    async (request, reply) => {
      if (request.user == null) {
        throw new UnauthorizedError('User not logged in')
      }

      const { contestId } = request.params
      const users = await fetchContestParticipants({ contestId })
      return await reply.status(200).send(JSON.stringify(users));
    })

  routes.post(
    '/:contestId/publish',
    {
      schema: {
        params: Type.Object({ contestId: Type.String() }),
        response: {
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [contestInfoHook, userAuthHook, routes.auth([
        [hasDomainPrivilege(['contest.manage'])],
        [hasContestPrivilege(['manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { contestId } = request.params
      await publishContest({ contestId, published: true })
      return await reply.status(204).send()
    })

  await routes.register(contestProblemRoutes, { prefix: '/:contestId/problems' })
  await routes.register(contestTeamRoutes, { prefix: '/:contestId/teams' })
  await routes.register(contestRanklistRoutes, { prefix: '/:contestId/ranklist' })
}
