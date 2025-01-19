import { type UserPrivateProfile } from '@argoncs/types'
import { type FastifyRequest } from 'fastify' /*=*/
import { InternalServerError, UnauthorizedError } from 'http-errors-enhanced'

export function requestParameter (request: FastifyRequest, key: string): string {
  if (request.params == null || typeof request.params !== 'object') {
    throw new InternalServerError('Unable to locate the required parameter')
  }
  if (!(key in request.params)) {
    throw new InternalServerError('Unable to locate the required parameter')
  }

  const value: string = request.params[key]
  if (value == null || typeof value !== 'string') {
    throw new InternalServerError('Unable to locate the required parameter')
  }
  return value
}

export function requestUserProfile (request: FastifyRequest): UserPrivateProfile {
  if (request.user == null) {
    throw new UnauthorizedError('User not logged in')
  }

  return request.user
}

export function requestSessionToken (request: FastifyRequest): { token: string } {
  const cookie = request.cookies.session_token
  if (cookie == null) {
    throw new UnauthorizedError('User not logged in')
  }
  const sessionToken = request.unsignCookie(cookie)
  if (!sessionToken.valid || sessionToken.value == null) {
    throw new UnauthorizedError('Session token is invalid')
  }
  return { token: sessionToken.value }
}
