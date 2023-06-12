import { ContestSubmission, TestingSubmission } from '@argoncs/types'
import { NotFoundError } from 'http-errors-enhanced'
import { submissionCollection } from '../connections/mongodb.connections.js'

export async function fetchSubmission (submissionId: string): Promise<TestingSubmission | ContestSubmission> {
  const submission = await submissionCollection.findOne({ id: submissionId })
  if (submission == null) {
    throw new NotFoundError('No submission found with the given ID.', { submissionId })
  }
  return submission
}
