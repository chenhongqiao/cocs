import { contestCollection, userCollection } from '@argoncs/common'
import { NotFoundError } from 'http-errors-enhanced'
import { CONTEST_PATH_CACHE_KEY, USER_PATH_CACHE_KEY, fetchCacheUntilLockAcquired, releaseLock, setCache } from '@argoncs/common'

export async function contestIdByPath ({ contestPath }: { contestPath: string }): Promise<string> {
  const cache = await fetchCacheUntilLockAcquired<string>({ key: `${CONTEST_PATH_CACHE_KEY}:${contestPath}` })
  if (cache != null) {
    return cache
  }

  try {
    const contest = await contestCollection.findOne({ contestPath })
    if (contest == null) {
      throw new NotFoundError('Contest not found')
    }

    await setCache({ key: `${USER_PATH_CACHE_KEY}:${contestPath}`, data: contest.id })
    return contest.id
  } finally {
    await releaseLock({ key: `${CONTEST_PATH_CACHE_KEY}:${contestPath}` })
  }
}

export async function userIdByUsername ({ username }: { username: string }): Promise<string> {
  const cache = await fetchCacheUntilLockAcquired<string>({ key: `${USER_PATH_CACHE_KEY}:${username}` })
  if (cache != null) {
    return cache
  }

  try {
    const user = await userCollection.findOne({ username })
    if (user == null) {
      throw new NotFoundError('User not found')
    }

    await setCache({ key: `${USER_PATH_CACHE_KEY}:${username}`, data: user.id })
    return user.id
  } finally {
    await releaseLock({ key: `${USER_PATH_CACHE_KEY}:${username}` })
  }
}
