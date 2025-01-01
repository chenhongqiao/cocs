import { type Static, Type } from '@sinclair/typebox'

import { SubmissionLang } from './compilation.types.js'

import { GradingResultSchema } from './grading.types.js'

export enum SubmissionStatus {
  Compiling = 'Compiling',
  Grading = 'Grading',
  CompileFailed = 'CompileFailed',
  Graded = 'Graded',
  Terminated = 'Terminated'
}

export const NewSubmissionSchema = Type.Object({
  language: Type.Enum(SubmissionLang),
  source: Type.String()
}, { additionalProperties: false })

export type NewSubmission = Static<typeof NewSubmissionSchema>

const BaseSubmissionSchema = Type.Object({
  language: Type.Enum(SubmissionLang),
  source: Type.String(),

  id: Type.String(),
  problemId: Type.String(),
  teamId: Type.Optional(Type.String()),
  userId: Type.String(),
  contestId: Type.String(),
  createdAt: Type.Number()
})

const CompilingSubmissionSchema = Type.Intersect([BaseSubmissionSchema, Type.Object({
  status: Type.Literal(SubmissionStatus.Compiling)
})])

const GradingSubmissionSchema = Type.Intersect([BaseSubmissionSchema, Type.Object({
  status: Type.Literal(SubmissionStatus.Grading),
  gradedCases: Type.Number(),
  testcases: Type.Array(Type.Object({
    result: Type.Optional(GradingResultSchema)
  }))
})])

const CompileFailedSubmissionSchema = Type.Intersect([BaseSubmissionSchema, Type.Object({
  status: Type.Literal(SubmissionStatus.CompileFailed),
  log: Type.Optional(Type.String())
})])

const TerminatedSubmissionSchema = Type.Intersect([BaseSubmissionSchema, Type.Object({
  status: Type.Literal(SubmissionStatus.Terminated),
  log: Type.Optional(Type.String())
})])

const GradedSubmissionSchema = Type.Intersect([BaseSubmissionSchema, Type.Object({
  status: Type.Literal(SubmissionStatus.Graded),
  log: Type.Optional(Type.String()),
  score: Type.Number(),
  penalty: Type.Number(),
  testcases: Type.Array(Type.Object({
    result: GradingResultSchema
  }))
})])

export const SubmissionSchema = Type.Intersect([Type.Union([
  CompilingSubmissionSchema, 
  GradingSubmissionSchema,
  GradedSubmissionSchema, 
  CompileFailedSubmissionSchema,
  TerminatedSubmissionSchema
])])
export type Submission = Static<typeof SubmissionSchema>
