import Fastify from 'fastify'
import fastifyStatic from '@fastify/static';
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const fastify = Fastify({
  logger: true
})

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'build'),
  prefix: '/static'
})

fastify.get('/:page', async function handler (request, reply) {
  const { page } = request.params
  const fd = await fs.open(path.join(__dirname, `build/${page}.html`))
  const stream = fd.createReadStream()
  reply.type('text/html').send(stream)
  return reply
})

// Run the server!
fastify.listen(
  { port: 8080, host: '0.0.0.0' },
  function (err, address) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
    fastify.log.info({msg: `up at: ${address}`})
  }
)