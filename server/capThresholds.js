// ---------------------------------------------------------------------------
// capThresholds.js — NBA CBA financial thresholds per season
// ---------------------------------------------------------------------------
// These values change annually. Update this file at the start of each season.
// Source: NBA CBA documents / Spotrac / RealGM cap tracker
//
// All values are in dollars (whole numbers, no cents).
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  2026: {
    // 2025-26 season (HoopsHype season key = 2026)
    salaryCap: 141_000_000,
    luxuryTax: 171_292_000,
    firstApron: 178_656_000,
    secondApron: 188_931_000,
    // Minimum team salary (90% of cap)
    salaryFloor: 126_900_000,
    // Standard roster limit
    maxRosterSize: 15,
    // Salary matching thresholds for trades
    trade: {
      // Teams over the cap: incoming ≤ outgoing × multiplier + flat buffer
      // Bracket 1: outgoing ≤ $7.5M  → incoming ≤ outgoing × 2.00 + $250K
      // Bracket 2: $7.5M–$29M       → incoming ≤ outgoing × 1.00 + $7.75M
      //   (flatBuffer folds the $7.5M CBA window + $250K grace into one field)
      // Bracket 3: outgoing > $29M  → incoming ≤ outgoing × 1.25 + $250K
      overCapBrackets: [
        { maxOutgoing: 7_500_000, multiplier: 2.0, flatBuffer: 250_000 },
        { maxOutgoing: 29_000_000, multiplier: 1.0, flatBuffer: 7_750_000 },
        { maxOutgoing: Infinity, multiplier: 1.25, flatBuffer: 250_000 },
      ],
      // Teams under the cap can absorb up to remaining cap space + $250K
      underCapBuffer: 250_000,
      // First-apron teams: incoming ≤ outgoing × 1.10 + $250K (stricter rules)
      firstApronMultiplier: 1.10,
      firstApronBuffer: 250_000,
      // Second-apron teams: incoming ≤ outgoing × 1.10 + $250K (same formula, extra restrictions)
      secondApronMultiplier: 1.10,
      secondApronBuffer: 250_000,
    },
  },
  2025: {
    // 2024-25 season
    salaryCap: 136_021_000,
    luxuryTax: 165_294_000,
    firstApron: 172_346_000,
    secondApron: 182_195_000,
    salaryFloor: 122_419_000,
    maxRosterSize: 15,
    trade: {
      overCapBrackets: [
        { maxOutgoing: 7_500_000, multiplier: 2.0, flatBuffer: 250_000 },
        { maxOutgoing: 29_000_000, multiplier: 1.0, flatBuffer: 7_750_000 },
        { maxOutgoing: Infinity, multiplier: 1.25, flatBuffer: 250_000 },
      ],
      underCapBuffer: 250_000,
      firstApronMultiplier: 1.10,
      firstApronBuffer: 250_000,
      secondApronMultiplier: 1.10,
      secondApronBuffer: 250_000,
    },
  },
};

function sortedSeasonKeys() {
  return Object.keys(THRESHOLDS)
    .map(Number)
    .sort((a, b) => b - a);
}

/**
 * Returns the CBA thresholds for the given HoopsHype season year.
 * Throws if the season is not found — callers must handle this explicitly.
 * Use `getAvailableSeasons()` to discover what is configured.
 *
 * @param {number} seasonYear - Integer season end-year (e.g. 2026 for 2025-26)
 * @returns {object} CBA thresholds for the requested season
 */
export function getCapThresholds(seasonYear) {
  if (typeof seasonYear !== "number" || !Number.isInteger(seasonYear)) {
    throw new TypeError(`seasonYear must be an integer, got: ${seasonYear}`);
  }
  if (THRESHOLDS[seasonYear]) {
    return THRESHOLDS[seasonYear];
  }
  const available = sortedSeasonKeys();
  throw new Error(
    `Cap thresholds for season ${seasonYear} not found. ` +
      `Available: ${available.join(", ")}. Update capThresholds.js for the new season.`
  );
}

/**
 * Returns all available season years (sorted descending).
 * @returns {number[]}
 */
export function getAvailableSeasons() {
  return sortedSeasonKeys();
}
