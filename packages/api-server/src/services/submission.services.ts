import {
  type CompilingTask,
  JudgerTaskType,
  type NewSubmission,
  SubmissionStatus,
  type Submission,
  type Problem
} from '@argoncs/types' /*=*/
import { rabbitMQ, judgerExchange, judgerTasksKey, submissionCollection, teamScoreCollection } from '@argoncs/common'
import { languageConfigs } from '../../configs/language.configs.js'

import { nanoid } from 'nanoid'
import {fetchContestProblem} from './contest.services.js'

export async function createSubmission (
  { submission, userId, problemId, contestId, teamId = undefined }:
  { submission: NewSubmission, userId: string, problemId: string, contestId: string, teamId?: string }): Promise<{ submissionId: string }> 
{
  // Ensure problem exists
  await fetchContestProblem({ problemId })

  const submissionId = nanoid()
  let pendingSubmission: Submission = {
    ...submission,
    id: submissionId,
    status: SubmissionStatus.Compiling,
    problemId,
    teamId,
    userId,
    contestId,
    createdAt: (new Date()).getTime()
  }

  if (teamId == undefined)
    delete pendingSubmission.teamId;

  await submissionCollection.insertOne(pendingSubmission)

  const task: CompilingTask = {
    submissionId,
    type: JudgerTaskType.Compiling,
    source: submission.source,
    language: submission.language,
    constraints: languageConfigs[submission.language].constraints
  }
  rabbitMQ.publish(judgerExchange, judgerTasksKey, Buffer.from(JSON.stringify(task)))

  return { submissionId }
}

export async function querySubmissions (
  { query, notestcases = false }:
  { query: { problemId?: string, teamId?: string, userId?: string, contestId?: string }, notestcases?: boolean }):
  Promise<any> 
{
  const submissions = await submissionCollection.aggregate([
    { $match: query },
    { $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: 'id',
      as: 'user',
      pipeline: [
        { $project: { _id: 0, username: 1, name: 1, id: 1 } }
      ]
    }},
    { $lookup: {
      from: 'contestProblems',
      localField: 'problemId',
      foreignField: 'id',
      as: 'problem',
      pipeline: [
        { $project: { _id: 0, name: 1, id: 1 } }
      ]
    }},
    { $set: {
      user: {$arrayElemAt:["$user",0]},
      problem: {$arrayElemAt:["$problem",0]},
      ...(notestcases ? { testcases: [] } : {})
    }},
    { $unset: [ 'userId', 'problemId' ] },
    { $sort: { createdAt: -1 } }
  ])
    .toArray();

  return submissions;
}

// returns the number of submissions to rejudge
export async function rejudgeProblem ({ problemId }: { problemId: string }):
  Promise<number> 
{
  let rejudge = 0;

  await teamScoreCollection.updateMany(
    { [`scores.${problemId}`]: { $exists: true } },
    { $unset: { 
      [`scores.${problemId}`]: '',
      [`time.${problemId}`]: '',
      [`penalty.${problemId}`]: '',
      'totalScore': '',
      'totalPenalty': '',
    }});

  for await (const submission of submissionCollection.find({ problemId })) {
    rejudge ++;

    const { id, source, language } = submission;

    await submissionCollection.updateOne(
      { id }, 
      {
        $set: { status: SubmissionStatus.Compiling },
        $unset: { testcases: 1, penatly: 1, score: 1 }
      });

    const task: CompilingTask = {
      submissionId: id,
      type: JudgerTaskType.Compiling,
      source,
      language,
      constraints: languageConfigs[language].constraints
    }
    rabbitMQ.publish(judgerExchange, judgerTasksKey, Buffer.from(JSON.stringify(task)))
  }

  return rejudge 
}
