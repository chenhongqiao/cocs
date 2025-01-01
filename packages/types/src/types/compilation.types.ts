import { type Constraints, type JudgerTaskType, ConstraintsSchema, type JudgerResultType } from './judger.types.js'
import { type Static, Type } from '@sinclair/typebox'

export enum SubmissionLang {
  C = 'C',
  CPP = 'C++',
  Python = 'Python'
}

export const LanguageConfigSchema = Type.Object({
  srcFile: Type.String(),
  binaryFile: Type.String(),
  displayName: Type.String(),
  compileCommand: Type.String(),
  executeCommand: Type.String(),
  constraints: ConstraintsSchema
})
export type LanguageConfig = Static<typeof LanguageConfigSchema>

export interface CompilingTask {
  type: JudgerTaskType.Compiling
  constraints: Constraints
  language: SubmissionLang
  source: string
  submissionId: string
}

export enum CompilingStatus {
  Succeeded = 'CS',
  Failed = 'CF'
}

export const CompileSucceededSchema = Type.Object({
  status: Type.Literal(CompilingStatus.Succeeded)
})
export type CompileSucceeded = Static<typeof CompileSucceededSchema>

export const CompileFailedSchema = Type.Object({
  status: Type.Literal(CompilingStatus.Failed),
  log: Type.String()
})
export type CompileFailed = Static<typeof CompileFailedSchema>

// When using Type.Union, all children should not have addtionalProperties: false set to avoid an ajv issue
export const CompilingResultSchema = Type.Union([CompileSucceededSchema, CompileFailedSchema])
export type CompilingResult = Static<typeof CompilingResultSchema>

export interface CompilingResultMessage {
  type: JudgerResultType.Compiling
  submissionId: string
  result: CompilingResult
}

export interface CompilingCheckerTask {
  type: JudgerTaskType.CompilingChecker,
  source: string,
  problemId: string,
}

export const CompilingCheckerSucceededSchema = Type.Object({
  status: Type.Literal(CompilingStatus.Succeeded),
  checker: Type.Object({ name: Type.String(), versionId: Type.String() })
})
export type CompilingChekcerSucceeded = Static<typeof CompileSucceededSchema>

// When using Type.Union, all children should not have addtionalProperties: false set to avoid an ajv issue
export const CompilingCheckerResultSchema = Type.Union([CompilingCheckerSucceededSchema, CompileFailedSchema])
export type CompilingCheckerResult = Static<typeof CompilingCheckerResultSchema>

export interface CompilingCheckerResultMessage {
  type: JudgerResultType.CompilingChecker
  problemId: string
  result: CompilingCheckerResult 
}
