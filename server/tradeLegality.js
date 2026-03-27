// ---------------------------------------------------------------------------
// tradeLegality.js — CBA trade salary matching engine
// ---------------------------------------------------------------------------
// Evaluates whether a proposed trade is legal under NBA CBA salary matching
// rules. Returns per-team financial breakdown and a pass/fail verdict.
// ---------------------------------------------------------------------------

import { getCapThresholds } from "./capThresholds.js";
import { computeCapPosition, classifyCapStatus, CAP_STATUS, capStatusLabel } from "./capCalculator.js";
import { getTeamWithPlayers } from "./repository.js";
import { hoopsHypeSeason } from "./nba.js";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Computes the allowable incoming salary for one side of a trade.
 *
 * @param {number} outgoing - Total outgoing salary
 * @param {string} capStatus - Team's cap status before the trade
 * @param {number} capSpace - Remaining cap space (positive = room, negative = over)
 * @param {object} thresholds - Season CBA thresholds
 * @returns {{ allowable: number, formula: string }}
 */
function computeAllowableIncoming(outgoing, capStatus, capSpace, thresholds) {
  const tradeRules = thresholds.trade;

  // Under-cap teams: can receive up to remaining cap space after outgoing
  // salary is removed, plus the $250K buffer.
  // Derivation: allowable = (salaryCap - (currentSalary - outgoing)) + buffer
  //                       = capSpace + outgoing + buffer
  if (capStatus === CAP_STATUS.UNDER_CAP) {
    const postTradeCapSpace = capSpace + outgoing;
    const allowable = postTradeCapSpace + tradeRules.underCapBuffer;
    return {
      allowable,
      formula: `Post-trade cap space (${fmt.format(postTradeCapSpace)}) + ${fmt.format(tradeRules.underCapBuffer)} buffer`,
    };
  }

  // First apron and second apron teams: stricter 110% + $250K rule
  if (
    capStatus === CAP_STATUS.FIRST_APRON ||
    capStatus === CAP_STATUS.SECOND_APRON
  ) {
    const multiplier =
      capStatus === CAP_STATUS.SECOND_APRON
        ? tradeRules.secondApronMultiplier
        : tradeRules.firstApronMultiplier;
    const buffer =
      capStatus === CAP_STATUS.SECOND_APRON
        ? tradeRules.secondApronBuffer
        : tradeRules.firstApronBuffer;
    const allowable = outgoing * multiplier + buffer;
    return {
      allowable,
      formula: `${fmt.format(outgoing)} x ${multiplier} + ${fmt.format(buffer)}`,
    };
  }

  // Over-cap and taxpayer teams use the same bracket-based rules.
  // The last bracket always has maxOutgoing = Infinity, so the loop
  // is guaranteed to match. If it somehow doesn't, throw — do not
  // silently fall through to a wrong answer.
  const brackets = tradeRules.overCapBrackets;
  for (const bracket of brackets) {
    if (outgoing <= bracket.maxOutgoing) {
      const allowable = outgoing * bracket.multiplier + bracket.flatBuffer;
      return {
        allowable,
        formula: `${fmt.format(outgoing)} x ${bracket.multiplier} + ${fmt.format(bracket.flatBuffer)}`,
      };
    }
  }

  throw new Error(
    "No matching trade bracket found — capThresholds.js overCapBrackets must include a final entry with maxOutgoing: Infinity"
  );
}

/**
 * Evaluates one side of the trade for a single team.
 *
 * @param {object} team - Team document from MongoDB (with players)
 * @param {Array} sending - Players this team is sending
 * @param {Array} receiving - Players this team is receiving
 * @param {number} seasonYear - HoopsHype season year
 * @returns {object} Financial evaluation for this team
 */
function evaluateTeamSide(team, sending, receiving, seasonYear) {
  const thresholds = getCapThresholds(seasonYear);

  // Current cap position (before trade)
  const preTrade = computeCapPosition(team.players, seasonYear);

  const outgoingCap = sending.reduce((sum, p) => sum + (p.salary ?? 0), 0);
  const incomingCap = receiving.reduce((sum, p) => sum + (p.salary ?? 0), 0);

  // Compute allowable incoming
  const { allowable, formula } = computeAllowableIncoming(
    outgoingCap,
    preTrade.capStatus,
    preTrade.capSpace,
    thresholds
  );

  const capDifference = allowable - incomingCap;
  const valid = incomingCap <= allowable;

  // Post-trade cap position: compute directly from the salary total, not a
  // synthetic player array, to avoid coupling classifyCapStatus to player shape.
  const postTradeSalary = preTrade.totalSalary - outgoingCap + incomingCap;
  const postTradeCapStatus = classifyCapStatus(postTradeSalary, thresholds);

  const postTrade = {
    totalSalary: postTradeSalary,
    capStatus: postTradeCapStatus,
    capStatusLabel: capStatusLabel(postTradeCapStatus),
    capSpace: thresholds.salaryCap - postTradeSalary,
    taxSpace: thresholds.luxuryTax - postTradeSalary,
    firstApronSpace: thresholds.firstApron - postTradeSalary,
    secondApronSpace: thresholds.secondApron - postTradeSalary,
  };

  // Roster compliance: count standard contracts after trade
  const currentRosterSize = team.players.length;
  const postTradeRosterSize =
    currentRosterSize - sending.length + receiving.length;
  const mustWaive = Math.max(0, postTradeRosterSize - thresholds.maxRosterSize);

  return {
    teamId: team.bdl_id,
    teamName: team.full_name,
    valid,
    preTrade: {
      totalSalary: preTrade.totalSalary,
      capStatus: preTrade.capStatus,
      capStatusLabel: capStatusLabel(preTrade.capStatus),
      capSpace: preTrade.capSpace,
      taxSpace: preTrade.taxSpace,
      firstApronSpace: preTrade.firstApronSpace,
      secondApronSpace: preTrade.secondApronSpace,
    },
    tradeFinancials: {
      outgoingCap,
      allowableIncoming: allowable,
      incomingCap,
      capDifference,
      formula,
    },
    postTrade,
    rosterCompliance: {
      preTradeRosterSize: currentRosterSize,
      postTradeRosterSize,
      maxRosterSize: thresholds.maxRosterSize,
      mustWaive,
      message:
        mustWaive > 0
          ? `${team.full_name} must waive ${mustWaive} player(s) before processing the trade.`
          : null,
    },
  };
}

/**
 * Evaluates a full two-team trade for CBA legality.
 *
 * @param {{ teamA: { id, name, sending }, teamB: { id, name, sending } }} trade
 * @returns {Promise<{ valid, season, teamA, teamB, warnings }>}
 */
export async function evaluateTradeLegality(trade) {
  const { teamA, teamB } = trade;
  const seasonYear = hoopsHypeSeason();

  // Fetch full team documents from DB
  const [teamADoc, teamBDoc] = await Promise.all([
    getTeamWithPlayers(teamA.id),
    getTeamWithPlayers(teamB.id),
  ]);

  if (!teamADoc || !teamBDoc) {
    const missing = [!teamADoc && teamA.name, !teamBDoc && teamB.name]
      .filter(Boolean)
      .join(" and ");
    const err = new Error(
      `Team(s) "${missing}" not found in database. Run a sync first.`
    );
    err.code = "TEAM_NOT_FOUND";
    throw err;
  }

  // Collect warnings before evaluating sides so null-salary players are flagged
  const warnings = [];
  const allTraded = [...teamA.sending, ...teamB.sending];
  const nullSalaryPlayers = allTraded.filter((p) => p.salary == null);
  if (nullSalaryPlayers.length > 0) {
    const names = nullSalaryPlayers
      .map((p) => `${p.first_name} ${p.last_name}`)
      .join(", ");
    warnings.push(
      `Salary data unavailable for: ${names}. Treated as $0 — legality result may be inaccurate.`
    );
  }

  // In a two-team trade, each team receives what the other sends
  const teamAResult = evaluateTeamSide(
    teamADoc,
    teamA.sending,
    teamB.sending, // teamA receives what teamB sends
    seasonYear
  );

  const teamBResult = evaluateTeamSide(
    teamBDoc,
    teamB.sending,
    teamA.sending, // teamB receives what teamA sends
    seasonYear
  );

  // Overall trade validity
  const valid = teamAResult.valid && teamBResult.valid;

  // Collect salary-matching failure warnings
  if (!teamAResult.valid) {
    const over = fmt.format(
      teamAResult.tradeFinancials.incomingCap -
        teamAResult.tradeFinancials.allowableIncoming
    );
    warnings.push(`${teamA.name} exceeds allowable incoming salary by ${over}.`);
  }
  if (!teamBResult.valid) {
    const over = fmt.format(
      teamBResult.tradeFinancials.incomingCap -
        teamBResult.tradeFinancials.allowableIncoming
    );
    warnings.push(`${teamB.name} exceeds allowable incoming salary by ${over}.`);
  }
  if (teamAResult.rosterCompliance.mustWaive > 0) {
    warnings.push(teamAResult.rosterCompliance.message);
  }
  if (teamBResult.rosterCompliance.mustWaive > 0) {
    warnings.push(teamBResult.rosterCompliance.message);
  }

  return {
    valid,
    season: seasonYear,
    teamA: teamAResult,
    teamB: teamBResult,
    warnings,
  };
}
