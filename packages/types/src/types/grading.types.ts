import { type SubmissionLang } from './compilation.types.js' /*=*/

import {
  type Constraints,
  type JudgerResultType,
  type JudgerTaskType,
  SandboxMemoryExceededSchema,
  SandboxRuntimeErrorSchema,
  SandboxSystemErrorSchema,
  SandboxTimeExceededSchema
} from './judger.types.js' /*=*/

import { type Static, Type } from '@sinclair/typebox' /*=*/

export enum GradingStatus {
  Accepted = 'AC',
  WrongAnswer = 'WA',
}

export interface GradingTask {
  type: JudgerTaskType.Grading
  submissionId: string
  problemId: string
  checker: { objectName: string, versionId: string }
  testcase: {
    input: { objectName: string, versionId: string }
    output: { objectName: string, versionId: string }
  }
  testcaseIndex: number
  constraints: Constraints
  language: SubmissionLang
}

export const SolutionAcceptedSchema = Type.Object({
  status: Type.Literal(GradingStatus.Accepted),
  message: Type.String(),
  memory: Type.Number(),
  time: Type.Number(),
  wallTime: Type.Number()
})
export type SolutionAccepted = Static<typeof SolutionAcceptedSchema>

export const SolutionWrongAnswerSchema = Type.Object({
  status: Type.Literal(GradingStatus.WrongAnswer),
  message: Type.String(),
  memory: Type.Number(),
  time: Type.Number(),
  wallTime: Type.Number()
})
export type SolutionWrongAnswer = Static<typeof SolutionWrongAnswerSchema>

// When using Type.Union, all children should not have addtionalProperties: false set to avoid an ajv issue
export const GradingResultSchema = Type.Union([
  SolutionAcceptedSchema,
  SolutionWrongAnswerSchema,
  SandboxSystemErrorSchema,
  SandboxTimeExceededSchema,
  SandboxRuntimeErrorSchema,
  SandboxMemoryExceededSchema
])
export type GradingResult = Static<typeof GradingResultSchema>

export interface GradingResultMessage {
  type: JudgerResultType.Grading
  submissionId: string
  testcaseIndex: number
  result: GradingResult
}
