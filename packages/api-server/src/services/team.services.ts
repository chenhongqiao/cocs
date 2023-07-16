import { type ClientSession, mongoClient, submissionCollection, teamCollection, teamInvitationCollection, teamScoreCollection, userCollection } from '@argoncs/common'
import { type NewTeam, type Team, type TeamMembers } from '@argoncs/types'
import { ConflictError, MethodNotAllowedError, NotFoundError } from 'http-errors-enhanced'
import { nanoid } from '../utils/nanoid.utils.js'

export async function createTeam (newTeam: NewTeam, contestId: string, userId: string): Promise<{ teamId: string }> {
  const id = await nanoid()
  const team: Team = {
    ...newTeam,
    id,
    contestId,
    captain: userId,
    members: [userId]
  }
  const session = mongoClient.startSession()
  try {
    await session.withTransaction(async () => {
      const user = await userCollection.findOne({ id: userId })
      if (user == null) {
        throw new NotFoundError('User not found')
      }

      if (user.teams[contestId] != null) {
        throw new ConflictError('User is already a member of a team for this contest')
      }

      await teamCollection.insertOne(team, { session })
      await userCollection.updateOne({ id: userId },
        { $set: { [`teams.${contestId}`]: id } }, { session })

      await teamScoreCollection.insertOne({ id, contestId, scores: {}, time: {}, lastTime: 0, totalScore: 0 })
    })
    return { teamId: id }
  } finally {
    await session.endSession()
  }
}

export async function fetchTeam (teamId: string, contestId: string): Promise<Team> {
  const team = await teamCollection.findOne({ id: teamId, contestId })
  if (team == null) {
    throw new NotFoundError('Team not found')
  }
  return team
}

export async function fetchTeamMembers (teamId: string, contestId: string): Promise<TeamMembers> {
  const team = (await teamCollection.aggregate([
    { $match: { id: teamId, contestId } },
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: 'id',
        as: 'members',
        pipeline: [
          { $project: { username: 1, name: 1, id: 1 } }
        ]
      }
    }
  ]).toArray())[0]
  if (team == null) {
    throw new NotFoundError('Team not found')
  }

  return team.members
}

export async function createTeamInvitation (teamId: string, contestId: string, userId: string): Promise<{ invitationId: string }> {
  const id = await nanoid()
  const user = await userCollection.findOne({ id: userId })
  if (user == null) {
    throw new NotFoundError('User not found')
  }
  const team = await teamCollection.findOne({ id: teamId, contestId })
  if (team == null) {
    throw new NotFoundError('Team not found')
  }
  await teamInvitationCollection.insertOne({ id, userId, teamId, contestId, createdAt: (new Date()).getTime() })
  return { invitationId: id }
}

export async function deleteTeamInvitation (teamId: string, contestId: string, invitationId: string): Promise<void> {
  const { deletedCount } = await teamInvitationCollection.deleteOne({ teamId, contestId, invitationId })
  if (deletedCount === 0) {
    throw new NotFoundError('User not found')
  }
}

export async function completeTeamInvitation (invitationId: string, userId: string): Promise<{ modified: boolean }> {
  const session = mongoClient.startSession()
  try {
    let modifiedCount = 0
    await session.withTransaction(async () => {
      const invitation = await teamInvitationCollection.findOne({ id: invitationId }, { session })
      if (invitation == null) {
        throw new NotFoundError('No invitation for the given user found')
      }
      if (invitation.userId !== userId) {
        throw new NotFoundError('No invitation for the given user found')
      }

      const { teamId, contestId } = invitation
      const user = await userCollection.findOne({ id: userId }, { session })
      if (user == null) {
        throw new NotFoundError('User not found')
      }
      if (user.teams[contestId] != null || user.teams[contestId] !== teamId) {
        throw new ConflictError('User is already a member of another team for this contest')
      }

      const { modifiedCount: modifiedUser } = await userCollection.updateOne({ id: userId }, { $set: { [`teams.${contestId}`]: teamId } }, { session })
      modifiedCount += Math.floor(modifiedUser)

      const { modifiedCount: modifiedTeam } = await teamCollection.updateOne({ id: teamId, contestId }, { $addToSet: { members: userId } }, { session })
      modifiedCount += Math.floor(modifiedTeam)
    })
    return { modified: modifiedCount > 0 }
  } finally {
    await session.endSession()
  }
}

export async function makeTeamCaptain (teamId: string, contestId: string, userId: string): Promise<{ modified: boolean }> {
  const session = mongoClient.startSession()
  try {
    let modifiedCount = 0
    await session.withTransaction(async () => {
      const team = await teamCollection.findOne({ id: teamId, contestId }, { session })
      if (team == null) {
        throw new NotFoundError('Team not found')
      }
      if (team.members.find((value) => value === userId) == null) {
        throw new NotFoundError('User is not part of the team')
      }
      const { modifiedCount: modifiedTeam } = await teamCollection.updateOne({ id: teamId, contestId }, { $set: { captain: userId } }, { session })
      modifiedCount += Math.floor(modifiedTeam)
    })
    return { modified: modifiedCount > 0 }
  } finally {
    await session.endSession()
  }
}

export async function removeTeamMember (teamId: string, contestId: string, userId: string, rootSession?: ClientSession): Promise<{ modified: boolean }> {
  const session = rootSession ?? mongoClient.startSession()
  let modifiedCount = 0
  try {
    await session.withTransaction(async () => {
      const team = await teamCollection.findOne({ id: teamId, contestId }, { session })
      if (team == null) {
        throw new NotFoundError('Team not found')
      }
      if (rootSession == null) {
        if (team.captain === userId) {
          throw new MethodNotAllowedError('Team captain cannot be removed')
        }
      }

      const { modifiedCount: modifiedTeam } = await teamCollection.updateOne({ id: teamId, contestId }, { $pull: { members: userId } }, { session })
      modifiedCount += Math.floor(modifiedTeam)

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const { matchedCount: matchedUser, modifiedCount: modifiedUser } = await userCollection.updateOne({ id: userId }, { $unset: { [`members.${team.contestId}`]: '' } }, { session })
      if (matchedUser === 0) {
        throw new NotFoundError('User not found')
      }
      modifiedCount += Math.floor(modifiedUser)
    })
    return { modified: modifiedCount > 0 }
  } finally {
    await session.endSession()
  }
}

export async function deleteTeam (teamId: string, contestId: string): Promise<void> {
  const session = mongoClient.startSession()
  try {
    await session.withTransaction(async () => {
      const team = await teamCollection.findOne({ id: teamId, contestId }, { session })
      if (team == null) {
        throw new NotFoundError('Team not found')
      }
      if (team.members.length > 1) {
        throw new MethodNotAllowedError('Cannot disband a team when there are more than one member')
      }

      await removeTeamMember(teamId, contestId, team.members[0], session)

      await teamInvitationCollection.deleteMany({ teamId, contestId }, { session })
      await teamScoreCollection.deleteOne({ teamId, contestId }, { session })
      await submissionCollection.deleteMany({ teamId, contestId }, { session })

      await teamCollection.deleteOne({ teamId, contestId }, { session })
    })
  } finally {
    await session.endSession()
  }
}
