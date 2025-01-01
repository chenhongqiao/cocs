import { connectMongoDB, connectRabbitMQ, connectRanklistRedis, deadResultsQueue, deadTasksQueue, judgerResultsQueue, rabbitMQ, sentry } from '@argoncs/common'
import { type CompilingResultMessage, type CompilingTask, type GradingResultMessage, type GradingTask, type CompilingCheckerTask, JudgerResultType, CompilingCheckerResultMessage, JudgerTaskType } from '@argoncs/types'
import assert from 'assert'
import { completeGrading, handleCompileCheckerResult, handleCompileResult, handleGradingResult } from './services/result.services.js'
/*=*/

sentry.init({
  dsn: 'https://f56d872b49cc4981baf851fd569080cd@o1044666.ingest.sentry.io/450531102457856',
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version
})

export async function startHandler (): Promise<void> {
  assert(process.env.RABBITMQ_URL != null)
  assert(process.env.MONGO_URL != null)
  assert(process.env.RANKLISTREDIS_URL != null)

  await connectRabbitMQ(process.env.RABBITMQ_URL)
  await connectMongoDB(process.env.MONGO_URL)
  await connectRanklistRedis(process.env.RANKLISTREDIS_URL)

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  await rabbitMQ.consume(judgerResultsQueue, async (message) => {
    console.log('judger result queue consumed');
    if (message == null) 
      return;

    try {
      const result: CompilingCheckerResultMessage | CompilingResultMessage | GradingResultMessage = 
        JSON.parse(message.content.toString())

      if (result.type === JudgerResultType.Compiling)
        await handleCompileResult(result.result, result.submissionId)

      else if (result.type === JudgerResultType.Grading)
        await handleGradingResult(result.result, result.submissionId, result.testcaseIndex)

      else if (result.type === JudgerResultType.CompilingChecker)
        await handleCompileCheckerResult(result.result, result.problemId)

      else 
        throw Error('Invalid result type')

      rabbitMQ.ack(message)

    } catch (err) {
      console.error(err)
      rabbitMQ.reject(message, false)
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  await rabbitMQ.consume(deadResultsQueue, async (message) => {
    console.log('dead results queue consumed')
    if (message == null) 
      return;
    try {
      const result: CompilingCheckerResultMessage | CompilingResultMessage | GradingResultMessage =
        JSON.parse(message.content.toString())
      console.log({ result });

      if (result.type === JudgerResultType.CompilingChecker)
        console.log('checker compilation results failed to be processed with:\n', result.result)
      else 
        await completeGrading(result.submissionId, 'One or more of the grading results failed to be processed')
      rabbitMQ.ack(message)
    } catch (err) {
      console.error(err)
      rabbitMQ.reject(message, false)
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  await rabbitMQ.consume(deadTasksQueue, async (message) => {
    console.log('dead tasks queue consumed')
    if (message == null) 
      return;

    try {
      const task: CompilingTask | CompilingCheckerTask | GradingTask = JSON.parse(message.content.toString())
      console.log({ task });

      if (task.type === JudgerTaskType.CompilingChecker) 
        console.log('checker compilation task rejected');
      else
        await completeGrading(task.submissionId, 'One or more of the grading tasks failed to complete')
      rabbitMQ.ack(message)
    } catch (err) {
      console.error(err)
      rabbitMQ.reject(message, false)
    }
  })

  console.log('started')
}
