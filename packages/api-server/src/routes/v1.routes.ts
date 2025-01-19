import { type FastifyTypeBox } from '../types.js'
import { heartbeatRoutes } from './v1/heartbeat.routes.js'
import { domainRoutes } from './v1/domain.routes.js'
import { userRoutes } from './v1/user.routes.js'
import { judgerRoutes } from './v1/judger.routes.js'
import { contestRoutes } from './v1/contest.routes.js'
import { userSessionRoutes, currentSessionRoutes } from './v1/session.routes.js'
import { pathRoutes } from './v1/path.routes.js'

export async function v1APIRoutes (app: FastifyTypeBox): Promise<void> {
  await app.register(heartbeatRoutes, { prefix: '/heartbeat' })
  await app.register(userSessionRoutes, { prefix: '/sessions' })
  await app.register(currentSessionRoutes, { prefix: '/current-session' })
  await app.register(userRoutes, { prefix: '/users' })
  await app.register(domainRoutes, { prefix: '/domains' })
  await app.register(judgerRoutes, { prefix: '/judger' })
  await app.register(pathRoutes, { prefix: '/path' })
  await app.register(contestRoutes, { prefix: '/contests' })
}
