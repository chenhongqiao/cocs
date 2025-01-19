import { exec } from '../utils/system.utils.js'
import { promises as fs } from 'node:fs'

import {
  type Constraints,
  SandboxStatus,
  type SandboxRuntimeError,
  type SandboxSystemError,
  type SandboxTimeExceeded,
  type SandboxMemoryExceeded
} from '@argoncs/types'
//=

import { ConflictError } from 'http-errors-enhanced'

interface SandboxMeta {
  status?: string
  memory?: number
  time?: number
  'time-wall'?: number
  exitsig?: number
  message?: string
}

function metaPath (boxId: number): string {
  return process.env.BOX_META_DIR + `/meta-${boxId}.txt`;
}

function parseMeta (metaStr: string): SandboxMeta {
  const result: SandboxMeta = {}
  metaStr.split('\n').forEach(row => {
    const pair = row.split(':')
    const key = pair[0]
    const value = pair[1]
    if (key === 'status') {
      result.status = value
    } else if (key === 'cg-mem') {
      result.memory = parseInt(value)
    } else if (key === 'time') {
      result.time = parseInt((parseFloat(value) * 1000).toFixed())
    } else if (key === 'time-wall') {
      result['time-wall'] = parseInt((parseFloat(value) * 1000).toFixed())
    } else if (key === 'exitsig') {
      result.exitsig = parseInt(value)
    } else if (key === 'message') {
      result.message = value
    }
  })

  return result
}

export async function initSandbox (
  { boxId }: { boxId: number }): Promise<{ workDir: string, boxId: number }> {
  let workDir = ''
  try {
    workDir = (await exec(`isolate --box-id=${boxId} --cg --init`)).stdout
  } catch (err) {
    if (Boolean((err.message?.startsWith('Box already exists')))) {
      throw new ConflictError('A box with the same ID already exists')
    } else {
      throw err
    }
  }
  return { workDir, boxId }
}

export async function destroySandbox ({ boxId }: { boxId: number }): Promise<{ boxId: number }> {
  await exec(`isolate --box-id=${boxId} --cleanup --cg`)
  return { boxId }
}

export interface SandboxTask {
  command: string
  inputPath?: string
  outputPath?: string
  stderrPath?: string
  constraints: Constraints
  env?: string
}

interface SandboxSucceeded {
  status: SandboxStatus.Succeeded
  message: string
  memory: number
  time: number
  wallTime: number
}

export async function runInSandbox ({ task, boxId }: { task: SandboxTask, boxId: number }):
  Promise<SandboxSucceeded | SandboxMemoryExceeded | SandboxSystemError | SandboxTimeExceeded | SandboxRuntimeError> 
{
  let command = `isolate --run --cg --box-id=${boxId} --meta=${metaPath(boxId)}`

  if (task.constraints.memory != null) {
    command += ` --cg-mem=${task.constraints.memory * 1024}`
  }
  if (task.constraints.time != null) {
    command += ` --time=${task.constraints.time / 1000.0}`
    if (task.constraints.wallTime == null) {
      command += ` --wall-time=${(task.constraints.time / 1000.0) * 3}`
    }
  }
  if (task.constraints.wallTime != null) {
    command += ` --wall-time=${task.constraints.wallTime / 1000.0}`
  }
  if (task.constraints.totalStorage != null) {
    command += ` --fsize=${task.constraints.totalStorage}`
  }
  if (task.constraints.processes != null) {
    command += ` --processes=${task.constraints.processes}`
  }
  if (task.env != null) {
    command += ` --env=${task.env}`
  }
  if (task.outputPath != null) {
    command += ` --stdout=${task.outputPath}`
  }
  if (task.inputPath != null) {
    command += ` --stdin=${task.inputPath}`
  }
  if (task.stderrPath != null) {
    command += ` --stderr=${task.stderrPath}`
  }
  command += ` -- ${task.command}`

  console.log(command);
  try {
    await exec(command)
    console.log('execution passed')
  } catch (err) {
    try {
      console.log('execution failed')
      const meta = (await fs.readFile(metaPath(boxId))).toString()
      const result = parseMeta(meta)

      switch (result.status) {
        case 'XX':
          return {
            status: SandboxStatus.SystemError,
            message: result.message ?? 'Isolate threw system error'
          }
        case 'RE':
          return {
            status: SandboxStatus.RuntimeError,
            message: result.message ?? 'Isolate threw runtime error'
          }
        case 'CG':
          if (
            (task.constraints.memory != null) &&
        result.exitsig === 9 &&
        result.memory != null &&
        result.memory > task.constraints.memory
          ) {
            return {
              status: SandboxStatus.MemoryExceeded,
              message: 'Memory limit exceeded',
              memory: result.memory
            }
          } else {
            return {
              status: SandboxStatus.RuntimeError,
              message: result.message ?? 'Program exit on signal'
            }
          }
        case 'TO':
          if (result.time == null || result['time-wall'] == null) {
            return {
              status: SandboxStatus.SystemError,
              message: 'Isolate reported timeout but no time info found in meta'
            }
          }
          return {
            status: SandboxStatus.TimeExceeded,
            message: 'Time limit exceeded',
            time: result.time,
            wallTime: result['time-wall']
          }
        default:
          return {
            status: SandboxStatus.SystemError,
            message: 'Unknown status on abnormal termination'
          }
      }
    } catch (err) {
      if (err?.code === 'ENONET') {
        return {
          status: SandboxStatus.SystemError,
          message: 'Meta file does not exist on abnormal termination'
        }
      } else {
        throw err
      }
    }
  }

  try {
    const meta = (await fs.readFile(metaPath(boxId))).toString()
    const result = parseMeta(meta)
    if (result.time == null || result['time-wall'] == null || result.memory == null) {
      return {
        status: SandboxStatus.SystemError,
        message: 'Isolate reported OK but no time info or memory info found in meta'
      }
    }
    return {
      status: SandboxStatus.Succeeded,
      time: result.time,
      wallTime: result['time-wall'],
      memory: result.memory,
      message: 'Task completed successfully'
    }
  } catch (err) {
    if (err?.code === 'ENONET') {
      return {
        status: SandboxStatus.SystemError,
        message: 'Meta file does not exist on abnormal termination'
      }
    } else {
      throw err
    }
  }
}
