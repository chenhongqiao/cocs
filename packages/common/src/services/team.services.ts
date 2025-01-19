import { teamScoreCollection } from '../connections/mongodb.connections.js'

export async function recalculateTeamTotalScore ({ contestId, teamId = undefined }: { contestId: string, teamId?: string }): Promise<void> {
  const query = teamId != null ? { contestId, id: teamId } : { contestId }

  await teamScoreCollection.aggregate([
    {
      $match: query
    },
    {
      $project: { 
        s: { $objectToArray: '$scores' },
        p: { $objectToArray: '$penalty' },
      }
    },
    {
      $set: { 
        totalScore: { $sum: '$s.v' },
        totalPenalty: { $sum: '$p.v' }
      }
    },
    {
      $unset: ['s', 'p']
    },
    { 
      $merge: { into: "teamScores" } 
    }
  ]).toArray()
}
