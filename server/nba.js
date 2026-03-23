// ---------------------------------------------------------------------------
// nba.js — Data-fetching module for balldontlie API + HoopsHype salaries
// ---------------------------------------------------------------------------

const BDL_BASE = "https://api.balldontlie.io/v1";
const API_KEY = process.env.BALLDONTLIE_API_KEY ?? "";

if (!API_KEY) {
  console.warn(
    "⚠  BALLDONTLIE_API_KEY is not set. Get a free key at https://app.balldontlie.io"
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function bdlHeaders() {
  return { Authorization: API_KEY };
}

async function bdlFetch(path) {
  const res = await fetch(`${BDL_BASE}${path}`, { headers: bdlHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`balldontlie ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// Simple in-memory cache: { key → { data, expiresAt } }
const cache = new Map();

function cached(key, ttlMs, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.data);

  return fetcher().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;

// ── Teams ────────────────────────────────────────────────────────────────────

export function getTeams() {
  return cached("teams", ONE_HOUR, async () => {
    const json = await bdlFetch("/teams");
    // IDs 1–30 are current NBA teams; higher IDs are defunct/historical
    return json.data.filter((t) => t.id <= 30);
  });
}

// ── All Players for a Team (paginated) ───────────────────────────────────────

async function getAllPlayersForTeam(teamId) {
  return cached(`allPlayers:${teamId}`, THIRTY_MIN, async () => {
    const all = [];
    let cursor = null;

    while (true) {
      const qs = cursor
        ? `/players?team_ids[]=${teamId}&per_page=100&cursor=${cursor}`
        : `/players?team_ids[]=${teamId}&per_page=100`;

      const json = await bdlFetch(qs);
      all.push(...json.data);

      cursor = json.meta?.next_cursor;
      if (!cursor) break;
    }

    return all;
  });
}

// ── HoopsHype Salaries ───────────────────────────────────────────────────────

// Maps balldontlie team full_name → HoopsHype URL slug (underscore format)
export const TEAM_SLUG = {
  1: "atlanta_hawks",
  2: "boston_celtics",
  3: "brooklyn_nets",
  4: "charlotte_hornets",
  5: "chicago_bulls",
  6: "cleveland_cavaliers",
  7: "dallas_mavericks",
  8: "denver_nuggets",
  9: "detroit_pistons",
  10: "golden_state_warriors",
  11: "houston_rockets",
  12: "indiana_pacers",
  13: "los_angeles_clippers",
  14: "los_angeles_lakers",
  15: "memphis_grizzlies",
  16: "miami_heat",
  17: "milwaukee_bucks",
  18: "minnesota_timberwolves",
  19: "new_orleans_pelicans",
  20: "new_york_knicks",
  21: "oklahoma_city_thunder",
  22: "orlando_magic",
  23: "philadelphia_76ers",
  24: "phoenix_suns",
  25: "portland_trail_blazers",
  26: "sacramento_kings",
  27: "san_antonio_spurs",
  28: "toronto_raptors",
  29: "utah_jazz",
  30: "washington_wizards",
};

/** HoopsHype uses season end year: 2025-26 season → 2026 */
export function hoopsHypeSeason() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Fetches salary data from HoopsHype __NEXT_DATA__.
 * Returns an array of { playerName, currentSalary, totalRemaining } for ALL
 * players listed on the team's salary page — not just those with a current-season
 * entry. HoopsHype lists mid-season acquisitions whose contract data may only
 * have their previous-season salary; excluding them would produce an incomplete
 * roster.
 *
 *   - currentSalary: this season's salary if available, otherwise the most recent
 *   - totalRemaining: sum of all season salaries from the current season onward
 *     (0 if no future entries — player is on an expiring deal)
 * Gracefully returns [] if scraping fails.
 */
export function getTeamSalaries(teamId) {
  const slug = TEAM_SLUG[teamId];
  if (!slug) return Promise.resolve([]);

  return cached(`salaries:${teamId}`, THIRTY_MIN, async () => {
    try {
      const url = `https://www.hoopshype.com/salaries/${slug}/`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        redirect: "follow",
      });
      if (!res.ok) return [];

      const html = await res.text();

      // Extract __NEXT_DATA__ JSON
      const match = html.match(
        /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/
      );
      if (!match) return [];

      const nextData = JSON.parse(match[1]);
      const queries =
        nextData?.props?.pageProps?.dehydratedState?.queries ?? [];

      // Find the query with contracts data
      for (const q of queries) {
        const contracts =
          q?.state?.data?.contracts?.contracts;
        if (!Array.isArray(contracts)) continue;

        const season = hoopsHypeSeason();
        const result = [];

        for (const c of contracts) {
          const validSeasons = (c.seasons ?? []).filter(
            (s) => typeof s.salary === "number"
          );
          if (!validSeasons.length) continue;

          // Prefer current season salary; fall back to most recent
          const currentEntry = validSeasons.find((s) => s.season === season);
          const mostRecent = validSeasons.reduce((a, b) =>
            b.season > a.season ? b : a
          );
          const salaryEntry = currentEntry ?? mostRecent;

          // Sum all season salaries from the current season onward
          const totalRemaining = validSeasons
            .filter((s) => s.season >= season)
            .reduce((sum, s) => sum + s.salary, 0);

          result.push({
            playerName: c.playerName,
            currentSalary: salaryEntry.salary,
            totalRemaining: totalRemaining || salaryEntry.salary,
          });
        }
        return result;
      }

      return [];
    } catch (err) {
      console.warn(
        `Failed to scrape salaries for team ${teamId}:`,
        err.message
      );
      return [];
    }
  });
}

// ── Name Matching ────────────────────────────────────────────────────────────

/** Lowercase, strip accents/non-alpha, collapse spaces. */
export function normalizeName(raw) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Combined: Active Roster with Salaries ────────────────────────────────────

/**
 * Returns the active roster for a team by cross-referencing balldontlie
 * players with HoopsHype salary data. A player is "active" if they have
 * a current-season contract on HoopsHype.
 *
 * Each returned player has: { id, first_name, last_name, position, ... , salary }
 */
export async function getPlayersWithSalaries(teamId) {
  const [allPlayers, salaryEntries] = await Promise.all([
    getAllPlayersForTeam(teamId),
    getTeamSalaries(teamId),
  ]);

  // Build a lookup: normalizedName → { currentSalary, totalRemaining }
  const salaryMap = new Map();
  for (const entry of salaryEntries) {
    salaryMap.set(normalizeName(entry.playerName), {
      currentSalary: entry.currentSalary,
      totalRemaining: entry.totalRemaining,
    });
  }

  // Match balldontlie players to HoopsHype salaries
  const roster = [];
  const matched = new Set();

  for (const p of allPlayers) {
    const key = normalizeName(`${p.first_name} ${p.last_name}`);
    if (salaryMap.has(key) && !matched.has(key)) {
      const sal = salaryMap.get(key);
      roster.push({ ...p, salary: sal.currentSalary, totalRemaining: sal.totalRemaining });
      matched.add(key);
    }
  }

  // Any HoopsHype players not matched to balldontlie (e.g. rookies not yet
  // in balldontlie DB) — add them with minimal info
  for (const entry of salaryEntries) {
    const key = normalizeName(entry.playerName);
    if (!matched.has(key)) {
      const parts = entry.playerName.trim().split(/\s+/);
      roster.push({
        id: null,
        first_name: parts[0],
        last_name: parts.slice(1).join(" "),
        position: "",
        salary: entry.currentSalary,
        totalRemaining: entry.totalRemaining,
      });
    }
  }

  // Sort by salary descending
  roster.sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0));

  return roster;
}

// ── Season Averages ──────────────────────────────────────────────────────────
// Note: season_averages and stats endpoints require a paid balldontlie tier.
// This function is kept for future use; currently returns an empty Map.

export async function getSeasonAverages(playerIds) {
  // Free tier doesn't support stats/season_averages endpoints.
  // Return empty map — prompt.js handles "Stats N/A" gracefully.
  return new Map();
}
