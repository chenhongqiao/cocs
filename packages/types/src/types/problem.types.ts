import { type Static, Type } from '@sinclair/typebox'

import { ConstraintsSchema } from './judger.types.js'

export const ProblemSchema = Type.Object({
  name: Type.String(),
  context: Type.String(),
  note: Type.String(),
  inputFormat: Type.String(),
  outputFormat: Type.String(),
  constraints: ConstraintsSchema,
  partials: Type.Boolean(),
  samples: Type.Array(
    Type.Object({ input: Type.String(), output: Type.String() })
  ),
  testcases: Type.Array(
    Type.Object({
      input: Type.Object({ name: Type.String(), versionId: Type.String() }),
      output: Type.Object({ name: Type.String(), versionId: Type.String() }),
    })),
  checker: Type.Optional(Type.Object({ name: Type.String(), versionId: Type.String() })),
  id: Type.String(),
  contestId: Type.String()
})
export type Problem = Static<typeof ProblemSchema>

export interface UploadSession {
  id: string
  replaceId?: string
  contestId: string
  createdAt: number
}
