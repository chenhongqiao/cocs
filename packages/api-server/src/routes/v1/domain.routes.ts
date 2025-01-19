import { Type } from '@sinclair/typebox'
import {
  ContestSchema,
  NewContestSchema,
  NewDomainSchema,
  DomainMembersSchema,
  DomainSchema,
} from '@argoncs/types'
import {
  addOrUpdateDomainMember,
  createDomain,
  fetchDomain,
  fetchDomainMembers,
  updateDomain
} from '../../services/domain.services.js'
import { isSuperAdmin } from '../../auth/role.auth.js'
import { hasDomainPrivilege } from '../../auth/scope.auth.js'
import { type FastifyTypeBox } from '../../types.js' /*=*/
import { badRequestSchema, forbiddenSchema, notFoundSchema, unauthorizedSchema } from 'http-errors-enhanced'
import { createContest, fetchDomainContests } from '../../services/contest.services.js'
import { userAuthHook } from '../../hooks/authentication.hooks.js'
/*=*/

async function domainMemberRoutes (memberRoutes: FastifyTypeBox): Promise<void> {
  memberRoutes.post(
    '/',
    {
      schema: {
        params: Type.Object({ domainId: Type.String() }),
        body: Type.Object({
          userId: Type.String(),
          scopes: Type.Array(Type.String())
        }),
        response: {
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, memberRoutes.auth([
        [isSuperAdmin],
        [hasDomainPrivilege(['domain.manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { domainId } = request.params
      const { userId, scopes } = request.body

      await addOrUpdateDomainMember({ domainId, userId, scopes })
      return await reply.status(204).send()
    }
  )

  memberRoutes.get(
    '/',
    {
      schema: {
        params: Type.Object({ domainId: Type.String() }),
        response: {
          200: DomainMembersSchema,
          400: badRequestSchema,
          404: notFoundSchema
        }
      }
    },
    async (request, reply) => {
      const { domainId } = request.params
      const members = await fetchDomainMembers({ domainId })
      return await reply.status(200).send(members) 
    }
  )
}

async function domainContestRoutes (contestRoutes: FastifyTypeBox): Promise<void> {
  contestRoutes.post(
    '/',
    {
      schema: {
        params: Type.Object({ domainId: Type.String() }),
        body: NewContestSchema,
        response: {
          201: Type.Object({ contestId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, contestRoutes.auth([
        [hasDomainPrivilege(['contest.manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const newContest = request.body
      const { domainId } = request.params
      const result = await createContest({ newContest, domainId })
      return await reply.status(201).send(result)
    }
  )

  contestRoutes.get(
    '/',
    {
      schema: {
        params: Type.Object({ domainId: Type.String() }),
        response: {
          200: Type.Array(ContestSchema),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema
        }
      },
      onRequest: [userAuthHook, contestRoutes.auth([
        [hasDomainPrivilege(['contest.read'])]
      ]) as any]
    },
    async (request, reply) => {
      const { domainId } = request.params
      const contests = await fetchDomainContests({ domainId })
      return await reply.status(200).send(contests)
    }
  )
}

export async function domainRoutes (routes: FastifyTypeBox): Promise<void> {
  routes.post(
    '/',
    {
      schema: {
        body: NewDomainSchema,
        response: {
          201: Type.Object({ domainId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema
        }
      },
      onRequest: [userAuthHook, routes.auth(
        [isSuperAdmin]
      ) as any]
    },
    async (request, reply) => {
      const newDomain = request.body
      const { domainId } = await createDomain({ newDomain })
      const userId = request.user!.id
      const scopes = ["domain.manage", "contest.manage", "contest.read", "contest.test"]; 
      await addOrUpdateDomainMember({ domainId, userId, scopes })

      return await reply.status(201).send({ domainId })
    }
  )

  routes.get(
    '/:domainId',
    {
      schema: {
        params: Type.Object({ domainId: Type.String() }),
        response: {
          200: DomainSchema,
          400: badRequestSchema,
          404: notFoundSchema
        }
      }
    },
    async (request, reply) => {
      const { domainId } = request.params
      const domain = await fetchDomain({ domainId })
      return domain
    }
  )

  routes.put(
    '/:domainId',
    {
      schema: {
        body: NewDomainSchema,
        params: Type.Object({ domainId: Type.String() }),
        response: {
          200: Type.Object({ modified: Type.Boolean() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          403: forbiddenSchema,
          404: notFoundSchema
        }
      },
      onRequest: [userAuthHook, routes.auth([
        [isSuperAdmin],
        [hasDomainPrivilege(['domain.manage'])]
      ]) as any]
    },
    async (request, reply) => {
      const { domainId } = request.params
      const { modified } = await updateDomain({ domainId, domain: request.body })
      return await reply.status(200).send({ modified })
    }
  )

  await routes.register(domainMemberRoutes, { prefix: '/:domainId/members' })
  await routes.register(domainContestRoutes, { prefix: '/:domainId/contests' })
}
