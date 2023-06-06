import Fastify from 'fastify'
import jwt from '@fastify/jwt'

import { testcaseRoutes } from './routes/testcase.routes'
import { heartbeatRoutes } from './routes/heartbeat.routes'

import { sentry } from '@argoncs/common'
import { version } from '../package.json'

import sensible from '@fastify/sensible'

const app = Fastify({
  logger: {
    enabled: true
  }
})

sentry.init({
  dsn: 'https://5fe68d06e15e4b979262554199e83b18@o1044666.ingest.sentry.io/4505311047319552',
  environment: process.env.NODE_ENV,
  release: version
})

export async function startUploadServer (): Promise<void> {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? ''
  })

  await app.register(sensible)

  await app.register(testcaseRoutes, { prefix: '/testcases' })
  await app.register(heartbeatRoutes, { prefix: '/heartbeat' })

  try {
    const port: number = parseInt(process.env.UPLOAD_SERVER_PORT ?? '8001')
    await app.listen({ port })
  } catch (err) {
    sentry.captureException(err, { extra: err.context })
    app.log.error(err)
    throw err
  }
}
