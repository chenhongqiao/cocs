import { type Static, Type } from '@sinclair/typebox'

export const NewContestSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  logistics: Type.String(),
  startTime: Type.Number(),
  endTime: Type.Number(),
  teamSize: Type.Number(),
  path: Type.String(),
}, { additionalProperties: false })
export type NewContest = Static<typeof NewContestSchema>

export const ContestSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  logistics: Type.String(),
  startTime: Type.Number(),
  endTime: Type.Number(),
  teamSize: Type.Number(),
  path: Type.String(),

  domainId: Type.String(),
  id: Type.String(),
  published: Type.Boolean()
})
export type Contest = Static<typeof ContestSchema>

export const ContestProblemListSchema = Type.Object({
  id: Type.String(),
  problems: Type.Array(Type.Object({id: Type.String(), name: Type.String()}))
})
export type ConetstProblemList = Static<typeof ContestProblemListSchema>
