import { type User, type NewUser, UserRole, type UserPrivateProfile, type TeamInvitation } from '@argoncs/types'
import { NotFoundError, UnauthorizedError, ConflictError } from 'http-errors-enhanced'
import { emailVerificationCollection, MongoServerError, userCollection, teamInvitationCollection } from '@argoncs/common'
import { randomBytes, pbkdf2 } from 'node:crypto'

import { promisify } from 'node:util'

import { nanoid } from 'nanoid'

import { sendEmail } from './emails.services.js'
import { USER_CACHE_KEY, USER_PATH_CACHE_KEY, deleteCache, fetchCacheUntilLockAcquired, releaseLock, setCache } from '@argoncs/common'
const randomBytesAsync = promisify(randomBytes)
const pbkdf2Async = promisify(pbkdf2)

export async function registerUser ({ newUser }: { newUser: NewUser }): Promise<{ userId: string, email: string }> {
  const salt = (await randomBytesAsync(32)).toString('base64')
  const hash = (await pbkdf2Async(newUser.password, salt, 100000, 512, 'sha512')).toString('base64')
  const userId = nanoid()
  const user: User = {
    id: userId,
    name: newUser.name,
    email: newUser.email,
    credential: {
      salt,
      hash
    },
    role: UserRole.User,
    username: newUser.username,
    year: newUser.year,
    scopes: {},
    teams: {}
  }

  try {
    await userCollection.insertOne(user)
    return { userId, email: newUser.email }
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000 && err.keyValue != null) {
      if (err.keyValue.email !== undefined) {
        throw new ConflictError('Email taken by another user')
      } else if (err.keyValue.username !== undefined) {
        throw new ConflictError('Username taken by another user')
      } else {
        throw err
      }
    } else {
      throw err
    }
  }
}

export async function fetchUser ({ userId }: { userId: string }): Promise<UserPrivateProfile> {
  const cache = await fetchCacheUntilLockAcquired<UserPrivateProfile>({ key: `${USER_CACHE_KEY}:${userId}` })
  if (cache != null) {
    return cache
  }

  try {
    const user = await userCollection.findOne({ id: userId }, { projection: { credential: 0 } })
    if (user == null) {
      throw new NotFoundError('User not found')
    }

    await setCache({ key: `${USER_CACHE_KEY}:${userId}`, data: user })
    return user
  } finally {
    await releaseLock({ key: `${USER_CACHE_KEY}:${userId}` })
  }
}

export async function userIdExists ({ userId }: { userId: string }): Promise<boolean> {
  return Boolean(await userCollection.countDocuments({ id: userId }))
}

export async function usernameExists ({ username }: { username: string }): Promise<boolean> {
  return Boolean(await userCollection.countDocuments({ username }))
}

export async function emailExists ({ email }: { email: string }): Promise<boolean> {
  return Boolean(await userCollection.countDocuments({ email }))
}

export async function updateUser ({ userId, newUser }: { userId: string, newUser: Partial<NewUser> }): Promise<{ modified: boolean }> {
  const user = await userCollection.findOneAndUpdate(
    { id: userId },
    { $set: newUser },
    { returnDocument: 'before', projection: { credential: 0 } })
  if (user === null) {
    throw new NotFoundError('User not found')
  }

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  await deleteCache({ key: `${USER_CACHE_KEY}:${user.id}` })
  if (user.username !== newUser.username) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    await deleteCache({ key: `${USER_PATH_CACHE_KEY}:${user.username}` })
  }

  return { modified: true }
}


export async function queryUsers ({ query }: { query: string }): Promise<User[]> {
  const users = await userCollection.find({ $text: { $search: query } }).limit(25).toArray()
  return users
}

export async function fetchUserInvitations ({ userId }: { userId: string }): Promise<TeamInvitation[]> {
  const invitations = await teamInvitationCollection.find({ userId }).toArray()
  return invitations
}
