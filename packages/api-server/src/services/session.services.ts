import { type UserPublicSession } from '@argoncs/types'
import { NotFoundError, UnauthorizedError } from 'http-errors-enhanced'
import { sessionCollection, userCollection } from '@argoncs/common'
import { pbkdf2 } from 'node:crypto'

import { promisify } from 'node:util'

import { nanoid } from 'nanoid'

import { SESSION_CACHE_KEY, deleteCache, fetchCacheUntilLockAcquired, releaseLock, setCache } from '@argoncs/common'

const pbkdf2Async = promisify(pbkdf2)

export async function authenticateUser ({ usernameOrEmail, password, loginIP, userAgent }: { usernameOrEmail: string, password: string, loginIP: string, userAgent: string }): Promise<{ userId: string, sessionId: string, token: string }> {
  const user = await userCollection.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] })
  if (user == null) {
    throw new UnauthorizedError('Authentication failed')
  }
  const { id: userId } = user

  const hash = (await pbkdf2Async(password, user.credential.salt, 100000, 512, 'sha512')).toString('base64')
  if (hash === user.credential.hash) {
    const sessionId = nanoid()
    const token = nanoid(32)
    await sessionCollection.insertOne({ id: sessionId, token, userId, userAgent, loginIP })
    return { userId, sessionId, token }
  } else {
    throw new UnauthorizedError('Authentication failed')
  }
}

export async function fetchSessionByToken ({ sessionToken }: { sessionToken: string }): Promise<UserPublicSession> {
  const cache = await fetchCacheUntilLockAcquired<UserPublicSession>({ key: `${SESSION_CACHE_KEY}:${sessionToken}` })
  if (cache != null) {
    return cache
  }

  try {
    const session = await sessionCollection.findOne({ token: sessionToken }, { projection: { token: 0 } })
    if (session == null) {
      throw new NotFoundError('Session not found')
    }

    await setCache({ key: `${SESSION_CACHE_KEY}:${sessionToken}`, data: session })
    return session
  } finally {
    await releaseLock({ key: `${SESSION_CACHE_KEY}:${sessionToken}` })
  }
}

export async function deleteSessionByToken ({ sessionToken }: { sessionToken: string }): Promise<void> {
  const { deletedCount } = await sessionCollection.deleteOne({ token: sessionToken })

  if (deletedCount === 0) {
    throw new NotFoundError('Session not found')
  }

  await deleteCache({ key: `${SESSION_CACHE_KEY}:${sessionToken}` })
}

export async function fetchSessionById ({ sessionId }: { sessionId: string }): Promise<UserPublicSession> {
  const session = await sessionCollection.findOne({ id: sessionId }, { projection: { token: 0 } })
  if (session == null) {
    throw new NotFoundError('Session not found')
  }
  return session
}

export async function fetchUserSessions ({ userId }: { userId: string }): Promise<UserPublicSession[]> {
  const sessions = await sessionCollection.find({ userId }, { projection: { token: 0 } }).toArray()
  return sessions
}
