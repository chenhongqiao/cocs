/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type FastifyRequest, type FastifyReply } from 'fastify'
import { ForbiddenError, NotFoundError } from 'http-errors-enhanced'
import { fetchContest } from '../services/contest.services.js'
import { requestUserProfile, requestParameter } from '../utils/auth.utils.js'

export async function contestPublished (request: FastifyRequest, reply: FastifyReply) {
  const contestId = requestParameter(request, 'contestId')

  const contest = await fetchContest({ contestId })
  if (!Boolean(contest.published)) {
    throw new NotFoundError('Contest not found')
  }
}

export async function registeredForContest (request: FastifyRequest, reply: FastifyReply) {
  const auth = requestUserProfile(request)

  const contestId = requestParameter(request, 'contestId')

  if (auth.teams[contestId] == null || typeof auth.teams[contestId] !== 'string') {
    throw new ForbiddenError('Contest registration is required')
  }
}

export async function contestBegan (request: FastifyRequest, reply: FastifyReply) {
  const contestId = requestParameter(request, 'contestId')

  const contest = await fetchContest({ contestId })
  const now = new Date()
  if ((new Date(contest.startTime)).getTime() > now.getTime()) {
    throw new ForbiddenError('Contest has not started')
  }
}

export async function contestEnded (request: FastifyRequest, reply: FastifyReply) {
  const contestId = requestParameter(request, 'contestId')

  const contest = await fetchContest({ contestId })
  const now = new Date()
  if ((new Date(contest.endTime)).getTime() > now.getTime()) {
    throw new ForbiddenError('Contest has not ended')
  }
}

export async function contestNotBegan (request: FastifyRequest, reply: FastifyReply) {
  const contestId = requestParameter(request, 'contestId')

  const contest = await fetchContest({ contestId })
  const now = new Date()
  if ((new Date(contest.startTime)).getTime() <= now.getTime()) {
    throw new ForbiddenError('Contest has began')
  }
}

export async function contestRunning (request: FastifyRequest, reply: FastifyReply) {
  const contestId = requestParameter(request, 'contestId')

  const contest = await fetchContest({ contestId })
  const now = new Date()
  if ((new Date(contest.startTime)).getTime() > now.getTime() || now.getTime() > (new Date(contest.endTime)).getTime()) {
    throw new ForbiddenError('Contest is not running')
  }
}
