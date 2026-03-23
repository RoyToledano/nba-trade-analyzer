// ---------------------------------------------------------------------------
// sync.js — Rate-limited sync endpoint: balldontlie + HoopsHype → MongoDB
// ---------------------------------------------------------------------------

import {
  bdlHeaders,
  TEAM_SLUG,
  hoopsHypeSeason,
  normalizeName,
  getTeamSalaries,
} from "./nba.js";
import { upsertTeamWithPlayers } from "./repository.js";

const BDL_BASE = "https://api.balldontlie.io/v1";
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 12_000;

// ── Rate-Limited Queue ──────────────────────────────────────────────────────

class RateLimitedQueue {
  constructor(maxPerMinute = 5) {
    this.maxPerMinute = maxPerMinute;
    this.timestamps = [];
  }

  async enqueue(fn) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this._waitForSlot();
      try {
        this.timestamps.push(Date.now());
        return await fn();
      } catch (err) {
        if (err.status === 429 && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * BASE_BACKOFF_MS;
          console.warn(`Rate limited (429). Retry ${attempt + 1} in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  }

  async _waitForSlot() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);

    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0];
      const waitMs = 60_000 - (now - oldest) + 200;
      await new Promise((r) => setTimeout(r, waitMs));
      this.timestamps = this.timestamps.filter((t) => Date.now() - t < 60_000);
    }
  }
}

// ── Sync-specific balldontlie fetch (preserves HTTP status on errors) ───────

async function syncBdlFetch(path) {
  const res = await fetch(`${BDL_BASE}${path}`, { headers: bdlHeaders() });
  if (!res.ok) {
    const err = new Error(`balldontlie ${path} → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Paginated player fetch through the queue ────────────────────────────────

async function fetchAllPlayersForTeam(queue, teamId) {
  const all = [];
  let cursor = null;

  while (true) {
    const qs = cursor
      ? `/players?team_ids[]=${teamId}&per_page=100&cursor=${cursor}`
      : `/players?team_ids[]=${teamId}&per_page=100`;

    const json = await queue.enqueue(() => syncBdlFetch(qs));
    all.push(...json.data);

    cursor = json.meta?.next_cursor;
    if (!cursor) break;
  }

  return all;
}

// ── Cross-reference players with salaries (same logic as nba.js) ────────────

function crossReference(allPlayers, salaryEntries) {
  const salaryMap = new Map();
  for (const entry of salaryEntries) {
    salaryMap.set(normalizeName(entry.playerName), {
      currentSalary: entry.currentSalary,
      totalRemaining: entry.totalRemaining,
    });
  }

  const roster = [];
  const matched = new Set();

  for (const p of allPlayers) {
    const key = normalizeName(`${p.first_name} ${p.last_name}`);
    if (salaryMap.has(key) && !matched.has(key)) {
      const sal = salaryMap.get(key);
      roster.push({
        bdl_id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        position: p.position ?? "",
        salary: sal.currentSalary,
        totalRemaining: sal.totalRemaining,
      });
      matched.add(key);
    }
  }

  // HoopsHype-only players (e.g. rookies not yet in balldontlie)
  for (const entry of salaryEntries) {
    const key = normalizeName(entry.playerName);
    if (!matched.has(key)) {
      const parts = entry.playerName.trim().split(/\s+/);
      roster.push({
        bdl_id: null,
        first_name: parts[0],
        last_name: parts.slice(1).join(" "),
        position: "",
        salary: entry.currentSalary,
        totalRemaining: entry.totalRemaining,
      });
    }
  }

  roster.sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0));
  return roster;
}

// ── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Sync guard ──────────────────────────────────────────────────────────────

let isSyncing = false;

// ── Main sync handler ───────────────────────────────────────────────────────

export async function handleSync(req, res) {
  if (isSyncing) {
    return res.status(409).json({ error: "A sync is already in progress." });
  }

  isSyncing = true;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const queue = new RateLimitedQueue(5);

  try {
    // 1. Fetch all teams from balldontlie
    sseEvent(res, "started", { message: "Fetching teams list..." });
    const teamsJson = await queue.enqueue(() => syncBdlFetch("/teams"));
    const teams = teamsJson.data.filter((t) => t.id <= 30);

    sseEvent(res, "progress", { message: `Found ${teams.length} teams`, total: teams.length });

    // 2. Sync each team
    let synced = 0;
    let errors = 0;

    for (const team of teams) {
      try {
        sseEvent(res, "team_started", {
          team: team.full_name,
          index: synced + 1,
          total: teams.length,
        });

        // Fetch players + salaries in parallel (salaries don't need the queue)
        const [allPlayers, salaryEntries] = await Promise.all([
          fetchAllPlayersForTeam(queue, team.id),
          getTeamSalaries(team.id),
        ]);

        // Cross-reference
        const roster = crossReference(allPlayers, salaryEntries);

        // Upsert to MongoDB
        await upsertTeamWithPlayers(team, roster);

        synced++;
        sseEvent(res, "team_done", {
          team: team.full_name,
          players: roster.length,
          index: synced,
          total: teams.length,
        });
      } catch (err) {
        errors++;
        console.error(`Sync error for ${team.full_name}:`, err.message);
        sseEvent(res, "team_error", {
          team: team.full_name,
          error: err.message,
        });
      }
    }

    // 3. Done
    sseEvent(res, "done", {
      message: "Sync complete",
      synced,
      errors,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Sync fatal error:", err.message);
    sseEvent(res, "error", { message: err.message });
  } finally {
    isSyncing = false;
    res.end();
  }
}
