import { type ConetstProblemList, type Contest, type Submission, type Domain, type EmailVerification, type Problem, type Team, type TeamInvitation, type User, type UserPrivateSession, type TeamScore, type UploadSession } from '@argoncs/types'
import { MongoClient, type IndexSpecification, type CreateIndexesOptions, type Db, type Collection } from 'mongodb'

interface Index {
  keys: IndexSpecification
  options?: CreateIndexesOptions
}

interface CollectionIndex {
  name: string
  indexes?: Index[]
}

const collections: CollectionIndex[] = [
  {
    name: 'domains',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } }
    ]
  },
  {
    name: 'submissions',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } },
      { keys: { userId: 1, createdAt: -1 } },
      { keys: { contestId: 1, teamId: 1, problemId: 1, createdAt: -1 } },
      { keys: { contestId: 1, teamId: 1, createdAt: -1 } },
      { keys: { domainId: 1, problemId: 1, contestId: 1, createdAt: -1 } }
    ]
  },
  {
    name: 'users',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } },
      { keys: { username: 1 }, options: { unique: true } },
      { keys: { email: 1 }, options: { unique: true, sparse: true } },
      { keys: { name: 'text', username: 'text' } }
    ]
  },
  {
    name: 'emailVerifications',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } },
      { keys: { createdAt: 1 }, options: { expireAfterSeconds: 172800 } }
    ]
  },
  {
    name: 'sessions',
    indexes: [
      { keys: { userId: 1, id: 1 }, options: { unique: true } }
    ]
  },
  {
    name: 'uploadSessions',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } },
      { keys: { problemId: 1 } },
      { keys: { createdAt: 1 }, options: { expireAfterSeconds: 900 } }
    ]
  },
  {
    name: 'contests',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } },
      { keys: { path: 1 }, options: { unique: true, sparse: true } },
      { keys: { domainId: 1, _id: -1 }, options: { unique: true } }
    ]
  },
  {
    name: 'contestProblems',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } },
      { keys: { contestId: 1, id: 1 }, options: { unique: true } }
    ]
  },
  {
    name: 'contestProblemLists',
    indexes: [
      { keys: { id: 1 }, options: { unique: true } }
    ]
  },
  {
    name: 'teamScores',
    indexes: [
      { keys: { contestId: 1, id: 1 }, options: { unique: true } },
      { keys: { contestId: 1, totalScore: -1, lastSubmission: 1 } }
    ]
  },
  {
    name: 'teams',
    indexes: [
      { keys: { contestId: 1, id: 1 }, options: { unique: true } }
    ]
  },
  {
    name: 'teamInvitations',
    indexes: [
      { keys: { userId: 1, id: 1 }, options: { unique: true } },
      { keys: { contestId: 1, teamId: 1, id: 1 }, options: { unique: true } },
      { keys: { createdAt: 1 }, options: { expireAfterSeconds: 1296000 } }
    ]
  }
]

export let mongoClient: MongoClient
export let mongoDB: Db
export let domainCollection: Collection<Domain>
export let userCollection: Collection<User>
export let submissionCollection: Collection<Submission>
export let sessionCollection: Collection<UserPrivateSession>
export let emailVerificationCollection: Collection<EmailVerification>
export let uploadSessionCollection: Collection<UploadSession>
export let contestCollection: Collection<Contest>
export let teamCollection: Collection<Team>
export let teamInvitationCollection: Collection<TeamInvitation>
export let teamScoreCollection: Collection<TeamScore>
export let contestProblemCollection: Collection<Problem>
export let contestProblemListCollection: Collection<ConetstProblemList>

export async function connectMongoDB (url: string): Promise<void> {
  mongoClient = new MongoClient(url)
  mongoDB = mongoClient.db()
  await mongoClient.connect()

  const indexPromises: Array<Promise<string>> = []
  collections.forEach(collection => {
    if (collection.indexes != null) {
      indexPromises.push(...collection.indexes.map(async index => await mongoDB.collection(collection.name).createIndex(index.keys, index.options ?? {})))
    }
  })
  await Promise.all(indexPromises)

  domainCollection = mongoDB.collection('domains')

  userCollection = mongoDB.collection('users')
  sessionCollection = mongoDB.collection('sessions')
  emailVerificationCollection = mongoDB.collection('emailVerifications')

  submissionCollection = mongoDB.collection('submissions')

  uploadSessionCollection = mongoDB.collection('uploadSessions')

  contestCollection = mongoDB.collection('contests')
  contestProblemCollection = mongoDB.collection('contestProblems')
  contestProblemListCollection = mongoDB.collection('contestProblemList')

  teamCollection = mongoDB.collection('teams')
  teamInvitationCollection = mongoDB.collection('teamInvitations')
  teamScoreCollection = mongoDB.collection('teamScores')
}

export async function closeMongoDB (): Promise<void> {
  await mongoClient.close()
}

export { MongoServerError, ClientSession } from 'mongodb'
