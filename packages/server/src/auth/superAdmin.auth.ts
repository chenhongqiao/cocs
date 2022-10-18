import { UserRole } from '@project-carbon/shared'
import { FastifyReply, FastifyRequest } from 'fastify'

export function verifySuperAdmin (request: FastifyRequest, reply: FastifyReply, done): void {
  if (request.user.role !== UserRole.Admin) {
    reply.statusCode = 403
    return done(new Error('You are not allowed to perform this action.'))
  }

  return done()
}