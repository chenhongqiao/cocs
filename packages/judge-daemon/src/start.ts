import { destroySandbox, initSandbox } from './services/sandbox.services.js'
import { gradeSubmission } from './services/grading.services.js'
import { compileChecker, compileSubmission } from './services/compile.services.js'

import { type GradingTask, type CompilingTask, JudgerTaskType, type GradingResultMessage, JudgerResultType, type CompilingResultMessage, CompilingCheckerTask, CompilingCheckerResultMessage } from '@argoncs/types'
import { rabbitMQ, judgerTasksQueue, judgerExchange, judgerResultsKey, sentry, connectRabbitMQ, connectMinIO } from '@argoncs/common'

import os = require('node:os')
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import assert from 'assert'
import { prepareStorage } from './services/storage.services.js'

const logger = pino()

const availableBoxes = new Set()
const judgerId = randomUUID()

sentry.init({
  dsn: 'https://e30481557cee442a91f73c1bcc25b714@o1044666.ingest.sentry.io/4505311016910848',
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version
})

export async function startJudger (): Promise<void> 
{
  assert(process.env.RABBITMQ_URL != null)
  assert(process.env.MINIO_URL != null)

  await connectRabbitMQ(process.env.RABBITMQ_URL)
  await connectMinIO(process.env.MINIO_URL)

  try {
    const fd = await fs.open(path.join(process.cwd(), 'testlib.h'))
    fd.close()
  } catch (err) {
    console.log('testlib.h not found')
  }

  console.log('CWD: ', process.cwd()); 
  await prepareStorage({ dir: process.cwd() + '/argon-cache' })

  const cores = os.cpus().length

  logger.info(`${cores} CPU cores detected`)

  const destroyQueue: Array<Promise<{ boxId: number }>> = []
  for (let id = 1; id <= cores; id ++) {
    destroyQueue.push(destroySandbox({ boxId: id }))
    availableBoxes.add(id)
  }
  await Promise.all(destroyQueue)

  logger.info(`Judger ${judgerId} start receiving tasks`)

  await rabbitMQ.prefetch(availableBoxes.size)

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  await rabbitMQ.consume(judgerTasksQueue, async (message) => {
    if (message == null) return;

    const boxId = availableBoxes.values().next().value

    if (boxId == null) {
      rabbitMQ.reject(message, true)
      logger.info('Received a task when no box is available')
      return
    }

    try {
      const task: GradingTask | CompilingTask | CompilingCheckerTask = JSON.parse(message.content.toString())

      logger.info(task, `Processing a new task: ${task}`)
      availableBoxes.delete(boxId)
      await initSandbox({ boxId })

      if (task.type === JudgerTaskType.CompilingChecker) {
        const result: CompilingCheckerResultMessage = {
          type: JudgerResultType.CompilingChecker,
          result: await compileChecker({ task, boxId }),
          problemId: task.problemId,
        }
        rabbitMQ.publish(judgerExchange, judgerResultsKey, Buffer.from(JSON.stringify(result)))
      } else 
      if (task.type === JudgerTaskType.Grading) {
        const result: GradingResultMessage = {
          type: JudgerResultType.Grading,
          result: await gradeSubmission({ task, boxId }),
          submissionId: task.submissionId,
          testcaseIndex: task.testcaseIndex
        }
        rabbitMQ.publish(judgerExchange, judgerResultsKey, Buffer.from(JSON.stringify(result)))
      } else 
      if (task.type === JudgerTaskType.Compiling) {
        const result: CompilingResultMessage = {
          type: JudgerResultType.Compiling,
          result: await compileSubmission({ task, boxId }),
          submissionId: task.submissionId
        }
        rabbitMQ.publish(judgerExchange, judgerResultsKey, Buffer.from(JSON.stringify(result)))
      } else {
        throw Error('Invalid task type')
      }

      console.log('done task')
      await destroySandbox({ boxId })
      availableBoxes.add(boxId)
      rabbitMQ.ack(message)

    } catch (err) {
      sentry.captureException(err)

      console.log('task failed with: ', err)
      await destroySandbox({ boxId })
      availableBoxes.add(boxId)

      rabbitMQ.reject(message, false)
    }
  })
}
