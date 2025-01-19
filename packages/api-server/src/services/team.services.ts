import { mongoClient, submissionCollection, teamCollection, teamInvitationCollection, teamScoreCollection, userCollection } from '@argoncs/common'
import { sendEmail } from './emails.services.js'
import { type TeamInvitation, type NewTeam, type Team, type TeamMembers } from '@argoncs/types'
import { ConflictError, MethodNotAllowedError, NotFoundError } from 'http-errors-enhanced'
import { nanoid } from 'nanoid'
import gravatarUrl from 'gravatar-url'
import { USER_CACHE_KEY, deleteCache } from '@argoncs/common'

export async function createTeam ({ newTeam, contestId, userId }: { newTeam: NewTeam, contestId: string, userId: string }): Promise<{ teamId: string }> {
  const id = nanoid()
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

      await teamScoreCollection.insertOne({ id, contestId, scores: {}, penalty: {},  time: {}, totalScore: 0, totalPenalty: 0})
    })
  } finally {
    await session.endSession()
  }

  await deleteCache({ key: `${USER_CACHE_KEY}:${userId}` })
  return { teamId: id }
}

export async function fetchTeam ({ teamId, contestId }: { teamId: string, contestId: string }): Promise<Team> {
  const team = await teamCollection.findOne({ id: teamId, contestId })
  if (team == null) {
    throw new NotFoundError('Team not found')
  }
  return team
}

export async function fetchTeamMembers ({ teamId, contestId }: { teamId: string, contestId: string }): Promise<TeamMembers> {
  const team = (await teamCollection.aggregate([
    { $match: { id: teamId, contestId } },
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: 'id',
        as: 'members',
        pipeline: [
          { $project: { username: 1, name: 1, id: 1, email: 1 } }
        ]
      }
    }
  ]).toArray())[0]
  if (team == null) {
    throw new NotFoundError('Team not found')
  }

  return team.members.map((member) => {
    return { ...member, gravatar: gravatarUrl(member.email), email: undefined }
  })
}

export async function createTeamInvitation ({ teamId, contestId, userId }: { teamId: string, contestId: string, userId: string }): Promise<{ invitationId: string }> {
  const id = nanoid()
  const user = await userCollection.findOne({ id: userId })
  if (user == null) {
    throw new NotFoundError('User not found')
  }
  const team = await teamCollection.findOne({ id: teamId, contestId })
  if (team == null) {
    throw new NotFoundError('Team not found')
  }
  // Abort if an invite to user already exists
  if (await teamInvitationCollection.findOne({ userId }) != null) {
    throw new ConflictError('Invite to user already exists')
  }

  await teamInvitationCollection.insertOne({ id, userId, teamId, contestId, createdAt: (new Date()).getTime() })

  // Send email if user has verified email
  const { email } = user
  if (email != null) {
    await sendEmail({
      to: email,
      template: 'inviteEmail',
      subject: 'Pending Invite',
      values: {
        name: user.name,
        acceptanceLink: `https://contest.teamscode.org/users/${user.id}/invitations/${id}`
      }
    })
  }

  return { invitationId: id }
}

export async function fetchTeamInvitations ({ teamId, contestId }: { teamId: string, contestId: string }): Promise<TeamInvitation[]> {
  const invitations = await teamInvitationCollection.find({ teamId, contestId }).toArray()
  return invitations
}

export async function deleteTeamInvitation ({ teamId, contestId, invitationId }: { teamId: string, contestId: string, invitationId: string }): Promise<void> {
  const { deletedCount } = await teamInvitationCollection.deleteOne({ teamId, contestId, id: invitationId })
  if (deletedCount === 0) {
    throw new NotFoundError('Invitation not found')
  }
}

export async function completeTeamInvitation ({ invitationId, userId }: { invitationId: string, userId: string }): Promise<{ modified: boolean }> {
  const session = mongoClient.startSession()
  let modifiedCount = 0

  try {
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
      if (user.teams[contestId] != null && user.teams[contestId] !== teamId) {
        throw new ConflictError('User is already a member of another team for this contest')
      }

      const { modifiedCount: modifiedUser } = await userCollection.updateOne(
        { id: userId },
        { $set: { [`teams.${contestId}`]: teamId } },
        { session })
      modifiedCount += Math.floor(modifiedUser)

      const { modifiedCount: modifiedTeam } = await teamCollection.updateOne(
        { id: teamId, contestId },
        { $addToSet: { members: userId } },
        { session })
      modifiedCount += Math.floor(modifiedTeam)

      // Delete invitation
      await teamInvitationCollection.deleteOne({ id: invitationId })
    })
  } finally {
    await session.endSession()
  }
  const modified = modifiedCount > 0
  if (modified) {
    await deleteCache({ key: `${USER_CACHE_KEY}:${userId}` })
  }

  return { modified }
}

export async function makeTeamCaptain ({ teamId, contestId, userId }: { teamId: string, contestId: string, userId: string }): Promise<{ modified: boolean }> {
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

export async function removeTeamMember ({ teamId, contestId, userId }: { teamId: string, contestId: string, userId: string }): Promise<{ modified: boolean }> {
  const session = mongoClient.startSession()
  let modifiedCount = 0
  try {
    await session.withTransaction(async () => {
      const team = await teamCollection.findOne({ id: teamId, contestId }, { session })
      if (team == null) {
        throw new NotFoundError('Team not found')
      }
      if (team.captain === userId) {
        throw new MethodNotAllowedError('Team captain cannot be removed')
      }

      const { modifiedCount: modifiedTeam } = await teamCollection.updateOne({ id: teamId, contestId }, { $pull: { members: userId } }, { session })
      modifiedCount += Math.floor(modifiedTeam)

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const { matchedCount: matchedUser, modifiedCount: modifiedUser } = await userCollection.updateOne({ id: userId }, { $unset: { [`teams.${team.contestId}`]: '' } }, { session })
      if (matchedUser === 0) {
        throw new NotFoundError('User not found')
      }
      modifiedCount += Math.floor(modifiedUser)
    })
  } finally {
    await session.endSession()
  }
  const modified = modifiedCount > 0
  if (modified) {
    await deleteCache({ key: `${USER_CACHE_KEY}:${userId}` })
  }
  return { modified }
}

export async function deleteTeam ({ teamId, contestId }: { teamId: string, contestId: string }): Promise<void> {
  const session = mongoClient.startSession()
  let userId = ''
  try {
    await session.withTransaction(async () => {
      const team = await teamCollection.findOne({ id: teamId, contestId }, { session })
      if (team == null) {
        throw new NotFoundError('Team not found')
      }
      if (team.members.length > 1) {
        throw new MethodNotAllowedError('Cannot disband a team when there are more than one member')
      }
      userId = team.members[0]

      await userCollection.updateOne({ id: team.members[0] }, { $unset: { [`teams.${team.contestId}`]: '' } }, { session })

      await teamInvitationCollection.deleteMany({ teamId, contestId }, { session })
      await teamScoreCollection.deleteOne({ teamId, contestId }, { session })
      await submissionCollection.deleteMany({ teamId, contestId }, { session })

      await teamCollection.deleteOne({ id: teamId, contestId }, { session })
    })
  } finally {
    await session.endSession()
  }

  await deleteCache({ key: `${USER_CACHE_KEY}:${userId}` })
}
