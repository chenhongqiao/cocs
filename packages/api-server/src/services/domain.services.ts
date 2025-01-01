import { type NewDomain, type Domain, type DomainMembers /*=*/ } from '@argoncs/types'
import { mongoClient, domainCollection, userCollection } from '@argoncs/common'
import { NotFoundError } from 'http-errors-enhanced'

import { nanoid } from 'nanoid'
import { USER_CACHE_KEY, deleteCache } from '@argoncs/common'

export async function createDomain ({ newDomain }: { newDomain: NewDomain }): Promise<{ domainId: string }> {
  const domainId = nanoid()
  const domain: Domain = { ...newDomain, id: domainId, members: [] }
  await domainCollection.insertOne(domain)
  return { domainId }
}

export async function updateDomain ({ domainId, domain }: { domainId: string, domain: Partial<NewDomain> }): Promise<{ modified: boolean }> {
  const { matchedCount, modifiedCount } = await domainCollection.updateOne({ id: domainId }, { $set: domain })
  if (matchedCount === 0) {
    throw new NotFoundError('Domain not found')
  }

  return { modified: modifiedCount > 0 }
}

export async function fetchDomain ({ domainId }: { domainId: string }): Promise<Domain> {
  const domain = await domainCollection.findOne({ id: domainId })
  if (domain == null) {
    throw new NotFoundError('Domain not found')
  }

  return domain
}

export async function addOrUpdateDomainMember ({ domainId, userId, scopes }: { domainId: string, userId: string, scopes: string[] })
{
  const { matchedCount: matchedUser } = await userCollection.updateOne(
    { id: userId },
    scopes.length === 0 ? 
      { $unset: { [`scopes.${domainId}`]: 1 }} :
      { $set: { [`scopes.${domainId}`]: scopes } });

  if (matchedUser === 0) throw new NotFoundError('User not found')

  const { matchedCount: matchedDomain } = await domainCollection.updateOne(
    { id: domainId },
    scopes.length === 0 ? 
      { $pull: { members: userId } } :
      { $addToSet: { members: userId } });

  if (matchedDomain === 0) 
    throw new NotFoundError('Domain not found')

  await deleteCache({ key: `${USER_CACHE_KEY}:${userId}` })
}

export async function fetchDomainMembers ({ domainId }: { domainId: string }): Promise<DomainMembers> {
  const domain = (await domainCollection.aggregate([
    { $match: { id: domainId } },
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: 'id',
        as: 'members',
        pipeline: [
          { $project: { username: 1, name: 1, id: 1, [`scopes.${domainId}`]: 1 } }
        ]
      }
    }
  ]).toArray())[0]
  if (domain == null) {
    throw new NotFoundError('Domain not found')
  }

  return domain.members
}
