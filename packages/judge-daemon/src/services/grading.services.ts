import {
  SandboxStatus, GradingStatus, type GradingTask, type GradingResult
} from '@argoncs/types'
import { languageConfigs } from '../../configs/language.configs.js'

import path = require('node:path')
import { makeExecutable, exec } from '../utils/system.utils.js'
import {
  runInSandbox
} from './sandbox.services.js'
import { promises as fs } from 'node:fs'
import { fetchBinary, fetchTestcase, fetchChecker } from './storage.services.js'

export async function gradeSubmission ({ task, boxId }: { task: GradingTask, boxId: number }): Promise<GradingResult> {

  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const config = languageConfigs[task.language]
  const binaryPath = path.join(workDir, config.binaryFile)
  const inputPath = path.join(workDir, 'in.txt')
  const outputPath = path.join(workDir, 'out.txt');
  const answerPath = path.join(workDir, 'ans.txt')
  const checkerPath = path.join(workDir, 'checker');
  const verdictPath = path.join(workDir, 'verdict.txt');

  await fetchBinary({ objectName: task.submissionId, destPath: binaryPath })
  await fetchTestcase({ objectName: task.testcase.input.objectName, versionId: task.testcase.input.versionId, destPath: inputPath })
  await fetchTestcase({ objectName: task.testcase.output.objectName, versionId: task.testcase.output.versionId, destPath: answerPath })
  await fetchChecker({ objectName: task.checker.objectName, versionId: task.checker.versionId, destPath: checkerPath })
  await makeExecutable(binaryPath)
  await makeExecutable(checkerPath)

  let command = config.executeCommand
  command = command.replaceAll('{binary_path}', config.binaryFile)

  const sandboxResult = await runInSandbox({
    task: {
      command,
      constraints: task.constraints,
      inputPath: 'in.txt',
      outputPath: 'out.txt'
    },
    boxId
  })

  if (sandboxResult.status !== SandboxStatus.Succeeded) 
    return sandboxResult

  const { time, wallTime, memory } = sandboxResult
  try {
    // Run checker
    const command = `./checker in.txt ans.txt out.txt`;
    const result = await runInSandbox({
      task: {
        command,
        constraints: {
          processes: 5,
          memory: 262144,
          totalStorage: 262144,
        },
        stderrPath: 'verdict.txt' 
      },
      boxId
    })

    // Get message 
    const message = (await fs.readFile(verdictPath)).toString()
    const pass = message.startsWith('ok');

    console.log('message: ', message);

    // If system error
    if (result.status !== SandboxStatus.Succeeded &&
        result.status !== SandboxStatus.RuntimeError)
      throw result

    return {
      status: pass ? GradingStatus.Accepted : GradingStatus.WrongAnswer,
      time,
      wallTime,
      memory,
      message 
    }
  } catch (err) {
    console.log('checker failed with: ', err)
    return {
      status: GradingStatus.WrongAnswer,
      time,
      wallTime,
      memory,
      message: `Checker failed with: ${JSON.stringify(err)}`
    }
  }
}
