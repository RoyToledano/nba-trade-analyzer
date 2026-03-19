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

function bdlHeaders() {
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
    return json.data;
  });
}

// ── Active Players ───────────────────────────────────────────────────────────

export function getActivePlayers(teamId) {
  return cached(`players:${teamId}`, THIRTY_MIN, async () => {
    const json = await bdlFetch(
      `/players/active?team_ids[]=${teamId}&per_page=100`
    );
    return json.data;
  });
}

// ── Season Averages ──────────────────────────────────────────────────────────

/**
 * Returns a Map<playerId, { pts, reb, ast, min }>.
 * `season` defaults to the current NBA season year.
 */
export async function getSeasonAverages(playerIds) {
  if (!playerIds.length) return new Map();

  const season = currentNbaSeason();
  const qs = playerIds.map((id) => `player_ids[]=${id}`).join("&");
  const json = await bdlFetch(
    `/season_averages?season=${season}&${qs}`
  );

  const map = new Map();
  for (const row of json.data) {
    map.set(row.player_id, {
      pts: row.pts,
      reb: row.reb,
      ast: row.ast,
      min: row.min,
    });
  }
  return map;
}

/** NBA season year: Oct–Jun → the year the season started in. */
function currentNbaSeason() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── HoopsHype Salaries ───────────────────────────────────────────────────────

// Maps balldontlie team id → HoopsHype URL slug
const TEAM_SLUG = {
  1: "atlanta-hawks",
  2: "boston-celtics",
  3: "brooklyn-nets",
  4: "charlotte-hornets",
  5: "chicago-bulls",
  6: "cleveland-cavaliers",
  7: "dallas-mavericks",
  8: "denver-nuggets",
  9: "detroit-pistons",
  10: "golden-state-warriors",
  11: "houston-rockets",
  12: "indiana-pacers",
  13: "los-angeles-clippers",
  14: "los-angeles-lakers",
  15: "memphis-grizzlies",
  16: "miami-heat",
  17: "milwaukee-bucks",
  18: "minnesota-timberwolves",
  19: "new-orleans-pelicans",
  20: "new-york-knicks",
  21: "oklahoma-city-thunder",
  22: "orlando-magic",
  23: "philadelphia-76ers",
  24: "phoenix-suns",
  25: "portland-trail-blazers",
  26: "sacramento-kings",
  27: "san-antonio-spurs",
  28: "toronto-raptors",
  29: "utah-jazz",
  30: "washington-wizards",
};

/**
 * Scrapes current-season salary data from HoopsHype.
 * Returns a Map<normalizedName, salaryNumber>.
 * Gracefully returns an empty map if scraping fails.
 */
export function getTeamSalaries(teamId) {
  const slug = TEAM_SLUG[teamId];
  if (!slug) return Promise.resolve(new Map());

  return cached(`salaries:${teamId}`, THIRTY_MIN, async () => {
    const map = new Map();
    try {
      const url = `https://hoopshype.com/salaries/${slug}/`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });
      if (!res.ok) return map;

      const html = await res.text();

      // HoopsHype renders salary tables with player names and dollar amounts.
      // We look for the data table rows: <td class="name">Player</td> <td class="hh-salaries-sorted">$XX,XXX,XXX</td>
      const rowRegex =
        /<td\s+class="name"[^>]*>.*?<a[^>]*>([^<]+)<\/a>.*?<td\s+class="hh-salaries-sorted"[^>]*>\s*\$([0-9,]+)/gs;

      let match;
      while ((match = rowRegex.exec(html)) !== null) {
        const name = normalizeName(match[1]);
        const salary = parseInt(match[2].replace(/,/g, ""), 10);
        if (name && !isNaN(salary)) {
          map.set(name, salary);
        }
      }
    } catch (err) {
      console.warn(`Failed to scrape salaries for team ${teamId}:`, err.message);
    }
    return map;
  });
}

/** Lowercase, strip accents/non-alpha, collapse spaces. */
function normalizeName(raw) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Combined: Players + Salaries ─────────────────────────────────────────────

/**
 * Returns the active roster for a team, each player enriched with `salary`
 * (number | null).
 */
export async function getPlayersWithSalaries(teamId) {
  const [players, salaryMap] = await Promise.all([
    getActivePlayers(teamId),
    getTeamSalaries(teamId),
  ]);

  return players.map((p) => {
    const key = normalizeName(`${p.first_name} ${p.last_name}`);
    return { ...p, salary: salaryMap.get(key) ?? null };
  });
}
