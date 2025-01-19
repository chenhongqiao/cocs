import path = require('node:path')
import { promises as fs } from 'node:fs'

import { runInSandbox } from './sandbox.services.js'

import { type CompilingTask, SandboxStatus, type CompileSucceeded, type CompileFailed, CompilingStatus, type CompilingCheckerTask, CompilingCheckerResult } from '@argoncs/types'
import { minio } from '@argoncs/common'
import { languageConfigs } from '../../configs/language.configs.js'

/*=*/

export async function compileSubmission ({ task, boxId }: { task: CompilingTask, boxId: number }): Promise<CompileSucceeded | CompileFailed> {
  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const config = languageConfigs[task.language]
  const srcPath = path.join(workDir, config.srcFile)
  const binaryPath = path.join(workDir, config.binaryFile)
  await fs.writeFile(srcPath, task.source)

  const command = config.compileCommand
    .replaceAll('{src_path}', config.srcFile)
    .replaceAll('{binary_path}', config.binaryFile)

  const result = await runInSandbox(
    {
      task: {
        constraints: task.constraints,
        command,
        stderrPath: 'log.txt',
        env: 'PATH=/bin:/usr/local/bin:/usr/bin'
      },
      boxId
    })

  console.log('compiled', { result })
  if (result.status === SandboxStatus.Succeeded) {
    await minio.fPutObject('binaries', task.submissionId, binaryPath)
    return {
      status: CompilingStatus.Succeeded
    }
  } else {
    const log = (await fs.readFile(path.join(workDir, 'log.txt'))).toString()
    return {
      status: CompilingStatus.Failed,
      log
    }
  }
}

export async function compileChecker ({ task, boxId }: { task: CompilingCheckerTask, boxId: number }): Promise<CompilingCheckerResult>
{
  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const srcPath = path.join(workDir, 'checker.cpp')
  const binaryPath = path.join(workDir, 'checker')
  await fs.writeFile(srcPath, task.source);
  await fs.copyFile('testlib.h', path.join(workDir, 'testlib.h'))

  const command = '/usr/bin/g++ -o2 -w -fmax-errors=3 -std=c++17 checker.cpp -lm -o checker' 

  const result = await runInSandbox({
    task: {
      constraints: {
        processes: 5,
        memory: 262144,
        totalStorage: 262144,
      },
      command,
      stderrPath: 'log.txt',
      env: 'PATH=/bin:/usr/local/bin:/usr/bin'
    },
    boxId
  })

  console.log('compiled checker')

  if (result.status !== SandboxStatus.Succeeded)
    return {
      status: CompilingStatus.Failed,
      log: (await fs.readFile(path.join(workDir, 'log.txt'))).toString()
    }
  
  const { versionId } = await minio.putObject('checkers', task.problemId, (await fs.open(binaryPath)).createReadStream())

  if (versionId === null) 
    return {
      status: CompilingStatus.Failed,
      log: 'failed to put into bucket'
    }

  console.log("checker inserted")

  return {
    status: CompilingStatus.Succeeded,
    checker: {
      name: task.problemId,
      versionId
    }
  }
}
