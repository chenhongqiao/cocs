import { MongoServerError, contestCollection, contestProblemCollection, contestProblemListCollection, mongoClient, ranklistRedis, recalculateTeamTotalScore, teamScoreCollection, teamCollection, submissionCollection } from '@argoncs/common'
import { Problem, type ConetstProblemList, type Contest, type NewContest, type TeamScore } from '@argoncs/types' /*=*/
import { ConflictError, MethodNotAllowedError, NotFoundError } from 'http-errors-enhanced'
import { nanoid } from 'nanoid'
import { CONTEST_CACHE_KEY, CONTEST_PATH_CACHE_KEY, PROBLEMLIST_CACHE_KEY, deleteCache, fetchCacheUntilLockAcquired, releaseLock, setCache } from '@argoncs/common'

export async function createContest (
  { newContest, domainId }:
  { newContest: NewContest, domainId: string }):
  Promise<{ contestId: string }> 
{
  const id = nanoid()
  const contest: Contest = { ...newContest, domainId, id, published: false }
  const session = mongoClient.startSession()
  try {
    await session.withTransaction(async () => {
      await contestCollection.insertOne(contest)
      await contestProblemListCollection.insertOne({ id, problems: [] })
    })
  } finally {
    await session.endSession()
  }
  return { contestId: id }
}

export async function deleteContest ({ contestId }: { contestId: string }): Promise<{ modified: boolean }> {

  const contest = await fetchContest({ contestId });
  if (contest == null) {
    throw new NotFoundError('Contest not found')
  }

  await contestCollection.deleteOne({ id: contestId });
  await contestProblemCollection.deleteMany({ contestId });
  await contestProblemListCollection.deleteOne({ contestId });
  await teamScoreCollection.deleteMany({ contestId });
  await teamCollection.deleteMany({ contestId });
  await teamCollection.deleteMany({ contestId });
  await submissionCollection.deleteMany({ contestId });

  await deleteCache({ key: `${CONTEST_CACHE_KEY}:${contestId}` });
  await deleteCache({ key: `${PROBLEMLIST_CACHE_KEY}:${contestId}` });

  return { modified: true };
}

export async function fetchPublishedContests ({ limit }: { limit: number }): Promise<Contest[]> {
  const contests = await contestCollection.find({published: true})
    .limit(limit)
    .toArray()

  return contests;
}

export async function fetchContest ({ contestId }: { contestId: string }): Promise<Contest> {

  const cache = await fetchCacheUntilLockAcquired<Contest>({ key: `${CONTEST_CACHE_KEY}:${contestId}` })
  if (cache != null) {
    return cache
  }

  try {
    const contest = await contestCollection.findOne({ id: contestId })
    if (contest == null) {
      throw new NotFoundError('Contest not found')
    }

    const good = await setCache({ key: `${CONTEST_CACHE_KEY}:${contestId}`, data: contest })
    console.log('cache set "', `${CONTEST_CACHE_KEY}:${contestId}`, '": ', good? 'true' : 'false');
    return contest
  } finally {
    await releaseLock({ key: `${CONTEST_CACHE_KEY}:${contestId}` })
  }
}

export async function fetchDomainContests ({ domainId }: { domainId: string }): Promise<Contest[]> {
  const contests = await contestCollection.find({ domainId }).sort({ _id: -1 }).toArray()
  return contests
}

export async function updateContest (
  { contestId, newContest }:
  { contestId: string, newContest: Partial<NewContest> }):
  Promise<{ modified: boolean }> 
{
  let contest: Contest | null = null
  try {
    contest = (await contestCollection.findOneAndUpdate(
      { id: contestId },
      { $set: newContest },
      { returnDocument: 'after' }
    ))
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      throw new ConflictError('Contest path conflict')
    } else {
      throw err
    }
  }

  if (contest == null) {
    throw new NotFoundError('Contest not found')
  }

  await deleteCache({ key: `${CONTEST_CACHE_KEY}:${contestId}` })
  if (newContest.path != null && contest.path !== newContest.path && contest.path != null) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    await deleteCache({ key: `${CONTEST_PATH_CACHE_KEY}:${contest.path}` })
  }

  return { modified: true }
}

export async function publishContest ({ contestId, published }: { contestId: string, published: boolean }): Promise<void> {
  const contest = await contestCollection.findOneAndUpdate(
    { id: contestId },
    { $set: { published } },
    { returnDocument: 'after' }
  )

  if (contest == null) {
    throw new NotFoundError('Contest not found')
  }

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  await deleteCache({ key: `${CONTEST_CACHE_KEY}:${contest.id}` })
}

export async function fetchContestProblem ({ problemId }: { problemId: string }): Promise<Problem> {
  const problem = await contestProblemCollection.findOne({ id: problemId })
  if (problem == null) {
    throw new NotFoundError('Problem not found')
  }
  return problem
}

export async function fetchContestProblemList ({ contestId }: { contestId: string }): Promise<ConetstProblemList> {
  const cache = await fetchCacheUntilLockAcquired<ConetstProblemList>({ key: `${PROBLEMLIST_CACHE_KEY}:${contestId}` })
  if (cache != null) {
    return cache
  }

  try {
    const problemList = await contestProblemListCollection.findOne({ id: contestId })
    if (problemList == null) {
      throw new NotFoundError('Contest not found')
    }
    await setCache({ key: `${PROBLEMLIST_CACHE_KEY}:${contestId}`, data: problemList })
    return problemList
  } finally {
    await releaseLock({ key: `${PROBLEMLIST_CACHE_KEY}:${contestId}` })
  }
}

export async function removeProblemFromContest ({ contestId, problemId }: { contestId: string, problemId: string }): Promise<void> {
  const session = mongoClient.startSession()
  try {
    await session.withTransaction(async () => {
      // remove problem
      const contestProblem = await contestProblemCollection.findOneAndDelete({ id: problemId, contestId })
      if (contestProblem == null) {
        throw new NotFoundError('Problem not found')
      }

      // remove from list
      await contestProblemListCollection.updateOne(
        { id: contestId },
        { $pull: { problems: { id: contestProblem.id, name: contestProblem.name } } }
      )

      // remove from scores
      await teamScoreCollection.updateMany({ contestId },
        { $unset: { [`scores.${problemId}`]: '' } }
      )
      await teamScoreCollection.updateMany({ contestId },
        { $unset: { [`time.${problemId}`]: '' } }
      )
      // recalc
      await recalculateTeamTotalScore({ contestId })
    })
  } finally {
    await session.endSession()
  }

  await deleteCache({ key: `${PROBLEMLIST_CACHE_KEY}:${contestId}` })
}

export async function fetchContestParticipants ({ contestId }: { contestId: string }): Promise<any[]> {
  const users = await teamCollection.aggregate([
    { $match: { contestId } },
    { $unwind: "$members" },
    { $project: { id: "$members" } },
    { $lookup: {
      from: 'users',
      localField: 'id',
      foreignField: 'id',
      as: 'user',
      pipeline: [
        { $project: { id: 1, name: 1, email: 1, username: 1, year: 1 } }
      ]
    }},
    { $set: {
      user: {$arrayElemAt:["$user",0]},
    }},
    { $project: {
      id: '$user.id',
      name: '$user.nam',
      year: '$user.year',
      email: '$user.email',
      username:'$user.username',
    }},
    { $project: { _id: false }}
  ])
    .toArray();

  return users;
}

/* Fetches the ranklist of a given contest.
 * - Guarentees a 1s gap between every re-aggregation by checking the TTL of the key to the original value.
 * - The '${contestId}-obsolete' serves as a lock for re-aggregation
 *   - This Key is set on score update.
 *   - If a server will re-aggregate, it will delete the 'obsolete' key and effectively 'claim' a lock on re-aggregation.
 *   - During this time, other servers will use the obsolete ranklist.
 * - By setting TTL to 1 year, ensures persistence of the data while giving us a way to measure the record's lifetime
 */
export async function fetchContestRanklist ({ contestId }: { contestId: string }): Promise<any[]> {
  /*
  const cache = await ranklistRedis.get(contestId)
  if (cache == null ||
    (31536000 * 1000 - (await ranklistRedis.pttl(contestId)) > 1000 &&
    (await ranklistRedis.getdel(`${contestId}-obsolete`)) != null)) {
  */

    const ranklist = await teamScoreCollection.aggregate([
      { $lookup: {
        from: 'teams',
        localField: 'id',
        foreignField: 'id',
        as: 'team',
        pipeline: [
          { $project: { members: 1 } }
        ]
      }},
      { $set: {
        team: { $arrayElemAt: ["$team",0] },
      }},
      { $set: {
        members: "$team.members",
      }},
      { $sort: { totalScore: -1, totalPenalty: 1 }},
      { $unwind: "$members" },
      { $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: 'id',
        as: 'user',
        pipeline: [
          { $project: { id: 1, name: 1, email: 1, username: 1, year: 1 } }
        ]
      }},
      { $set: {
        user: { $arrayElemAt: ["$user",0] },
      }},
      { $set: { 
        userId: "$user.id", 
        name: "$user.name" 
      }},
      { $project: { 
        _id: false, 
        id: false,
        contestId: false,
        members: false,
        user: false,
        team: false
      }}
    ])
      .toArray();

    await ranklistRedis.set(contestId, JSON.stringify(ranklist))
    await ranklistRedis.expire(contestId, 31536000) // One year
    return ranklist
  /*
  }

  return JSON.parse(cache) as TeamScore[]
  */
}
