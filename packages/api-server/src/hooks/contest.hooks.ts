import { type FastifyRequest, type FastifyReply } from 'fastify' /*=*/
import { fetchContest } from '../services/contest.services.js'
import { requestParameter } from '../utils/auth.utils.js'
import { contestIdByPath } from '../services/path.services.js'

/*
 * Injects `domainId` and `contestId` into request parameters.
 * - Request.params must have contest ID.
 */
export async function contestInfoHook (request: FastifyRequest, reply: FastifyReply): Promise<void> {

  const contestId = requestParameter(request, 'contestId')
  try {
    requestParameter(request, 'domainId')
  } catch {
    const contest = await fetchContest({ contestId })
    // @ts-expect-error property will be checked later
    request.params.domainId = contest.domainId
    // @ts-expect-error property will be checked later
    request.params.contestId = contest.id
  }
}

/*
 * Injects `domainId` and `contestId` into request parameters.
 * - Request.params must have contest path.
 */
export async function contestPathInfoHook (request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const contestPath = requestParameter(request, 'contestPath')
  const contestId = await contestIdByPath({ contestPath })
  const contest = await fetchContest({ contestId })

  // @ts-expect-error property will be checked later
  request.params.domainId = contest.domainId
  // @ts-expect-error property will be checked later
  request.params.contestId = contest.id
}
