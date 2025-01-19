import { fastify } from 'fastify'

import fastifyHttpErrorsEnhanced from '@chenhongqiao/fastify-http-errors-enhanced'
import fastifyAuth from '@fastify/auth'
import fastifyCors from '@fastify/cors'

//import { testcaseRoutes } from './routes/testcase.routes.js'
import { heartbeatRoutes } from './routes/heartbeat.routes.js'

import { connectCacheRedis, connectMinIO, connectMongoDB, connectRabbitMQ, sentry } from '@argoncs/common'

import fastifySensible from '@fastify/sensible'
import assert from 'assert'
import { polygonRoutes } from './routes/polygon.routes.js'

const app = fastify({
  logger: {
    enabled: true
  }
})

sentry.init({
  dsn: 'https://5fe68d06e15e4b979262554199e83b18@o1044666.ingest.sentry.io/4505311047319552',
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version
})

export async function startUploadServer (): Promise<void> {
  assert(process.env.MINIO_URL != null)
  assert(process.env.MONGO_URL != null)
  assert(process.env.RABBITMQ_URL != null)
  assert(process.env.CACHEREDIS_URL != null)

  await connectMinIO(process.env.MINIO_URL)
  await connectMongoDB(process.env.MONGO_URL)
  await connectRabbitMQ(process.env.RABBITMQ_URL)
  await connectCacheRedis(process.env.CACHEREDIS_URL)

  await app.register(fastifyHttpErrorsEnhanced, {
    handle404Errors: false,
    convertValidationErrors: true,
    preHandler (err: any) {
      if (!('statusCode' in err) && !('validation' in err)) {
        sentry.captureException(err)
      }
      return err
    }
  })
  await app.register(fastifyAuth)
  await app.register(fastifySensible)
  await app.register(fastifyCors, {
    origin: [/\.teamscode\.org$/, /\.argoncs\.io$/, 'http://localhost:3000', 'http://localhost:8000', 'http://13.93.218.61:8000'],
    allowedHeaders: ['Content-Type', 'Set-Cookie'],
    credentials: true
  })

  await app.register(heartbeatRoutes, { prefix: '/heartbeat' })
  await app.register(polygonRoutes, { prefix: '/polygon' })

  try {
    const port: number = parseInt(process.env.UPLOAD_SERVER_PORT ?? '8001')
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    sentry.captureException(err)
    app.log.error(err)
    throw err
  }
}
