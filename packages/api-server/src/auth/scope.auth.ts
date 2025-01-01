import { type FastifyReply, type FastifyRequest } from 'fastify'
import { ForbiddenError } from 'http-errors-enhanced'
import { requestUserProfile, requestParameter } from '../utils/auth.utils.js'

/*=*/
export function hasDomainPrivilege (scopes: string[]) {
  return async function handler (request: FastifyRequest, reply: FastifyReply) {
    const auth = requestUserProfile(request)
    const domainId = requestParameter(request, 'domainId')

    if (auth.scopes[domainId] == null)
      throw new ForbiddenError('Insufficient domain privilege');

    const pass = scopes
      .map(scope => auth.scopes[domainId].includes(scope))
      .reduce((a, i) => a && i, true);

      console.log('userscopes: ', auth.scopes);

    if (!pass)
      throw new ForbiddenError('Insufficient domain privilege');
  }
}

export function hasContestPrivilege (scopes: string[]) {
  return async function handler (request: FastifyRequest, reply: FastifyReply) {
    const auth = requestUserProfile(request)

    const domainId = requestParameter(request, 'domainId')
    const contestId = requestParameter(request, 'contestId')
    const userScopes = auth.scopes

    scopes.forEach((scope) => {
      const contestScope = `contest-${contestId}.${scope}`
      if (userScopes[domainId] == null || !Boolean(userScopes[domainId].includes(contestScope))) {
        throw new ForbiddenError('Insufficient contest privilege')
      }
    })
  }
}

export function hasNoPrivilege (request: FastifyRequest, reply: FastifyReply, done): void {
  const auth = requestUserProfile(request)

  const domainId = requestParameter(request, 'domainId')
  if (domainId in auth.scopes) {
    throw new ForbiddenError('User must not be a privileged member of this domain')
  }

  done()
}
