// ---------------------------------------------------------------------------
// repository.js — MongoDB CRUD operations for teams and players
// ---------------------------------------------------------------------------

import { Team } from "./models.js";

/**
 * Returns all teams, shaped for the frontend:
 * [{ id, full_name, abbreviation, city, conference, division, name }]
 */
export async function getAllTeams() {
  const teams = await Team.find({}, { _id: 0, __v: 0, players: 0, createdAt: 0, updatedAt: 0, lastSyncedAt: 0 })
    .sort({ full_name: 1 })
    .lean();

  return teams.map(({ bdl_id, ...rest }) => ({ id: bdl_id, ...rest }));
}

/**
 * Returns the player roster for a team, shaped for the frontend:
 * [{ id, first_name, last_name, position, salary, totalRemaining }]
 */
export async function getPlayersByTeamId(teamId) {
  const team = await Team.findOne({ bdl_id: teamId }, { players: 1 }).lean();
  if (!team) return [];

  return team.players.map(({ bdl_id, ...rest }) => ({ id: bdl_id, ...rest }));
}

/**
 * Upserts a team document with its full players array.
 * teamData: { id, full_name, abbreviation, city, conference, division, name }
 * players:  [{ bdl_id, first_name, last_name, position, salary, totalRemaining }]
 */
export async function upsertTeamWithPlayers(teamData, players) {
  await Team.findOneAndUpdate(
    { bdl_id: teamData.id },
    {
      $set: {
        full_name: teamData.full_name,
        abbreviation: teamData.abbreviation,
        city: teamData.city,
        conference: teamData.conference,
        division: teamData.division,
        name: teamData.name,
        players,
        lastSyncedAt: new Date(),
      },
    },
    { upsert: true }
  );
}
