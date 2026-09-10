# AGENTS.md — server

Technical reference for any agent or developer working inside this service.

---

## 1. Service Overview

**What it does:** NBA-aware HTTP server that bridges the React frontend with two external data sources (balldontlie API and HoopsHype) and the Claude CLI Wrapper service. It owns all NBA data fetching, active-roster resolution, salary enrichment, prompt construction, and persisting team/player data to MongoDB. A sync endpoint (`POST /api/sync`) populates the DB on demand.

**What it does NOT do:**
- It does not invoke Claude directly — it delegates to the Claude Wrapper (`claude-wrapper/`) via HTTP.
- It does not serve the frontend static files — the React app runs on its own Vite dev server.
- It does not authenticate callers.

---

## 2. Architecture & Structure

```
server/
├── index.js          — Express server; defines all routes and SSE relay logic
├── nba.js            — All external data fetching: balldontlie API + HoopsHype scraping
├── prompt.js         — Builds the structured Claude prompt from trade data
├── db.js             — Mongoose connection; exports `connectDB()`
├── models.js         — Mongoose Team/Player schema; exports `Team` model
├── repository.js     — DB query layer; exports `getAllTeams`, `getPlayersByTeamId`, `getTeamWithPlayers`, `upsertTeamWithPlayers`
├── sync.js           — Full sync handler; exports `handleSync`; owns `RateLimitedQueue`
├── capThresholds.js  — NBA CBA financial thresholds per season (cap, tax, aprons)
├── capCalculator.js  — Per-team cap position calculation (total salary, cap status)
├── tradeLegality.js  — CBA trade salary matching engine (legality check per trade side)
└── package.json      — ES Modules; dependencies: express, cors, mongoose
```

### `index.js` — Routes & SSE relay

- Starts Express on the configured port with `cors()` and `express.json()` middleware.
- Calls `connectDB()` at startup — process exits if MongoDB is unreachable.
- Defines six routes (see §5).
- For `POST /api/analyze`: orchestrates the full pipeline — legality check → stats fetch → prompt build → wrapper call → SSE relay. Emits a `legality` SSE event before AI analysis starts.
- For `POST /api/trade/evaluate`: standalone trade legality check (no AI); returns JSON with per-team financial breakdown.
- For `GET /api/teams/:id/cap`: returns the team's current cap position (total salary, cap status, space to each threshold).
- For `POST /api/sync`: delegates to `handleSync()` from `sync.js`.
- Contains `parseSSE(block)` — a private helper that parses one SSE message block (text between `\n\n` separators) into `{ type, data }`. Returns `null` if there are no `data:` lines. Falls back to `{ type, data: { text: rawString } }` if the `data:` value is not valid JSON.
- Manages a `finished` boolean + `finish()` guard on the SSE response to prevent double `res.end()`. Uses `res.on("close")` to detect client disconnect.

### `nba.js` — Data fetching & roster resolution

All functions that touch external services live here. Key exports:

| Export | Description |
|--------|-------------|
| `getTeams()` | Fetches all teams from balldontlie, filters to IDs 1–30 (current NBA teams) |
| `getTeamSalaries(teamId)` | Scrapes current-season salary data from HoopsHype |
| `getPlayersWithSalaries(teamId)` | Combines the above two to return the active roster with salary attached |
| `getSeasonAverages(playerIds)` | **Currently a stub** — always returns an empty `Map` (see §8) |
| `bdlHeaders()` | Returns the `Authorization` header object for balldontlie — used by `sync.js` |
| `TEAM_SLUG` | Object mapping balldontlie team IDs (1–30) to HoopsHype URL slugs — used by `sync.js` |
| `hoopsHypeSeason()` | Returns the HoopsHype season year (`getMonth() >= 9` (October, zero-indexed) → `currentYear + 1`, else `currentYear`) |
| `normalizeName(raw)` | Strips accents, lowercases, removes non-alpha characters — used for cross-source name matching in `sync.js` |

Private functions (not exported):

| Function | Description |
|----------|-------------|
| `getAllPlayersForTeam(teamId)` | Paginates the balldontlie `/players` endpoint until `next_cursor` is null |
| `bdlFetch(path)` | Wraps `fetch` for balldontlie with the auth header; throws on non-2xx |
| `cached(key, ttlMs, fetcher)` | In-memory TTL cache backed by a `Map`; returns cached data if not expired |

**Active roster resolution strategy:**
1. Fetch all historical players for a team from balldontlie (paginated, may be 100–200+ players including retired)
2. Scrape current-season contracts from HoopsHype
3. Cross-reference by normalized name → only players present in both are included
4. HoopsHype players with no balldontlie match (e.g. newly signed rookies) are added with `id: null` and minimal fields
5. Result sorted by salary descending

### `prompt.js` — Prompt builder

Single export: `buildTradePrompt(trade, legality)`.

- Accepts `{ teamA, teamB }` where each has `{ name, sending: [{ first_name, last_name, salary, stats }] }`.
- Accepts an optional `legality` object (output of `evaluateTradeLegality`). When present, inserts a **CBA Financial Analysis** block into the prompt with authoritative cap data (outgoing/incoming/allowable salary, cap status, apron space, salary matching formula). The `## Salary & Cap Implications` section instructions tell Claude to use these numbers as ground truth.
- Formats each player as: `Name | This Season: $X,XXX,XXX | Total Remaining: $X,XXX,XXX | X.X PPG / X.X RPG / X.X APG / X.X MPG`
- If `salary` is `null` → renders `"N/A"` for `This Season`.
- If `totalRemaining` is `null` → renders `"N/A"` for `Total Remaining`.
- If `stats` is `null` → renders `"Stats N/A"` (stats are always null on the free balldontlie tier).
- Returns a complete prompt string instructing Claude to respond with exactly seven markdown section headers.

### `capThresholds.js` — CBA financial thresholds

Exports: `getCapThresholds(seasonYear)`, `getAvailableSeasons()`.

- Stores per-season CBA thresholds: salary cap, luxury tax line, 1st apron, 2nd apron, salary floor, max roster size, and trade salary matching bracket rules.
- Currently has data for the 2025-26 and 2024-25 seasons. Must be updated manually at the start of each season.
- Falls back to the most recent available season if the requested year is not found.
- Trade salary matching brackets for over-cap teams follow the 2023 CBA structure: three tiers based on outgoing salary amount, each with a multiplier and flat buffer.
- First/second apron teams have stricter multipliers (1.10x instead of bracket-based).

### `capCalculator.js` — Cap position calculator

Exports: `computeCapPosition(players, seasonYear)`, `capStatusLabel(status)`, `CAP_STATUS` enum.

- Computes total team salary by summing all player `salary` fields.
- Classifies the team into one of five cap statuses: `under-cap`, `over-cap`, `taxpayer`, `first-apron`, `second-apron`.
- Returns space remaining to each threshold (positive = room, negative = over the line).
- Used by both the `/api/teams/:id/cap` endpoint and the trade legality engine.

### `tradeLegality.js` — Trade legality engine

Single export: `evaluateTradeLegality(trade)`.

- Accepts the same `{ teamA, teamB }` shape as `POST /api/analyze`.
- Fetches full team documents from MongoDB (needs roster for cap calculation).
- For each team side: computes pre-trade cap position, determines the appropriate salary matching rule, calculates allowable incoming salary, and checks if the incoming salary fits.
- Returns per-team results: `{ valid, preTrade, tradeFinancials, postTrade, rosterCompliance }`.
- `rosterCompliance` flags if a team must waive players post-trade (roster > 15).
- Overall `valid` is true only if both sides pass salary matching.
- `warnings` array collects human-readable messages for failures and roster issues.

---

## 3. Configuration & Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `PORT` | `3001` | TCP port the Express server listens on |
| `CLAUDE_WRAPPER_URL` | `http://localhost:3002` | Base URL of the Claude CLI Wrapper service |
| `BALLDONTLIE_API_KEY` | `""` (warns if missing) | API key sent as `Authorization` header to balldontlie |
| `MONGODB_URI` | *(required)* | MongoDB connection string; server crashes on startup if not set |

**Env file loading:** The `package.json` scripts use `node --env-file=.env`, so a `.env` file in `server/` is automatically loaded at startup. No `dotenv` package is used.

```
# server/.env
BALLDONTLIE_API_KEY=your_key_here
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
```

---

## 4. External Service Calls & Integrations

### balldontlie API (`https://api.balldontlie.io/v1`)

| Endpoint | Called by | When | Notes |
|----------|-----------|------|-------|
| `GET /teams` | `getTeams()` | On `GET /api/teams` (if cache miss) | Returns all teams; filtered to IDs ≤ 30 |
| `GET /players?team_ids[]=<id>&per_page=100[&cursor=<n>]` | `getAllPlayersForTeam()` | On `GET /api/teams/:id/players` (if cache miss) | Paginated using `meta.next_cursor`; may require multiple requests |

**Auth:** `Authorization: <API_KEY>` header (plain key, not Bearer).
**Rate limit:** 5 requests/minute on the free tier — mitigated by in-memory cache.
**Unavailable on free tier:** `/players/active`, `/stats`, `/season_averages` — all return 401.

### HoopsHype (`https://www.hoopshype.com`)

| URL pattern | Called by | When | Notes |
|-------------|-----------|------|-------|
| `https://www.hoopshype.com/salaries/<team_slug>/` | `getTeamSalaries()` | On `GET /api/teams/:id/players` (if cache miss) | HTML scrape; follows redirects |

**Auth:** None. A browser-like `User-Agent` header is sent.
**Parsing:** Extracts the `<script id="__NEXT_DATA__">` JSON blob. Navigates: `props.pageProps.dehydratedState.queries[n].state.data.contracts.contracts` — finds the first query where `.contracts.contracts` is an array.
**Season matching:** Finds entries where `seasons[].season === hoopsHypeSeason()`.
**Team mapping:** `TEAM_SLUG` object in `nba.js` maps balldontlie team IDs (1–30) to HoopsHype URL slugs (underscore format, e.g. `boston_celtics`).

### Claude CLI Wrapper (`http://localhost:3002` by default)

| Endpoint | Called by | When | Notes |
|----------|-----------|------|-------|
| `POST /invoke` | `index.js` route handler | On `POST /api/analyze` | Sends `{ prompt }` as JSON; receives SSE stream |

No model override is sent — the wrapper uses its own default (`claude-sonnet-4-6`).

---

## 5. Inbound Interface

### `GET /api/teams`

Returns all 30 current NBA teams.

**Response:** `200 { data: Team[] }` or `502 { error: string }`

### `GET /api/teams/:id/players`

Returns the active roster for a team with salary data.

**Params:** `id` — balldontlie team ID (1–30), parsed with `Number()`
**Response:** `200 { data: Player[] }` or `502 { error: string }`

**Player object shape:**
```json
{
  "id": 214,
  "first_name": "Jrue",
  "last_name": "Holiday",
  "position": "G",
  "salary": 34800000,
  "totalRemaining": 69600000,
  "yearsRemaining": 2,
  "isExpiring": false,
  "contractYears": [
    { "season": 2026, "salary": 34800000 },
    { "season": 2027, "salary": 34800000 }
  ],
  "tradeStatus": "tradeable",
  "tradeRestrictionNote": ""
}
```
`salary` is `null` if no HoopsHype match was found. `totalRemaining` is the total remaining contract value from HoopsHype (`null` if unavailable). `id` is `null` for players found on HoopsHype but not in the balldontlie database. `yearsRemaining` is the count of future contract years (from current season onward). `isExpiring` is `true` when `yearsRemaining <= 1`. `contractYears` lists each future season and its salary. `tradeStatus` is one of `tradeable`, `trade-candidate`, or `not-tradable`. `tradeRestrictionNote` explains why a player is not tradable (empty if tradeable).

### `GET /api/teams/:id/cap`

Returns the cap position for a team.

**Params:** `id` — balldontlie team ID (1–30), parsed with `Number()`
**Response:** `200 { data: CapPosition }` or `404 { error: "Team not found" }` or `502 { error: string }`

**CapPosition object shape:**
```json
{
  "teamId": 20,
  "teamName": "New York Knicks",
  "season": 2026,
  "totalSalary": 178000000,
  "capStatus": "first-apron",
  "capStatusLabel": "1st apron (hard-capped)",
  "capSpace": -37000000,
  "taxSpace": -6708000,
  "firstApronSpace": 656000,
  "secondApronSpace": 10931000,
  "thresholds": {
    "salaryCap": 141000000,
    "luxuryTax": 171292000,
    "firstApron": 178656000,
    "secondApron": 188931000,
    "salaryFloor": 126900000
  }
}
```

### `POST /api/trade/evaluate`

Evaluates trade legality under CBA salary matching rules. Returns structured financial data without triggering AI analysis.

**Request body:** Same shape as `POST /api/analyze`.

**Response:** `200 { data: TradeLegality }` or `400 { error: string }` or `502 { error: string }`

**TradeLegality object shape (abbreviated):**
```json
{
  "valid": true,
  "season": 2026,
  "teamA": {
    "teamId": 1, "teamName": "Atlanta Hawks", "valid": true,
    "preTrade": { "totalSalary": 155000000, "capStatus": "over-cap", "capStatusLabel": "Over the cap", "capSpace": -14000000, "taxSpace": 16292000, "firstApronSpace": 23656000, "secondApronSpace": 33931000 },
    "tradeFinancials": { "outgoingCap": 43000000, "allowableIncoming": 54000000, "incomingCap": 34000000, "capDifference": 20000000, "formula": "$43,000,000 x 1.25 + $250,000" },
    "postTrade": { "totalSalary": 146000000, "capStatus": "over-cap", "capStatusLabel": "Over the cap", "capSpace": -5000000, "taxSpace": 25292000, "firstApronSpace": 32656000, "secondApronSpace": 42931000 },
    "rosterCompliance": { "preTradeRosterSize": 15, "postTradeRosterSize": 15, "maxRosterSize": 15, "mustWaive": 0, "message": null }
  },
  "teamB": { "..." : "same structure" },
  "warnings": []
}
```

### `POST /api/sync`

Triggers a full data sync: fetches all 30 teams and their rosters from balldontlie + HoopsHype, then upserts to MongoDB. Response is an SSE stream.

**Request body:** none required

**Guard:** Returns `HTTP 409` if a sync is already in progress (module-level `isSyncing` flag).

**SSE events emitted:**

| Event | Payload | When |
|-------|---------|------|
| `started` | `{ "message": "Fetching teams list..." }` | Sync begins |
| `progress` | `{ "message": "Found N teams", "total": N }` | After teams fetch |
| `team_started` | `{ "team", "index", "total" }` | Before each team |
| `team_done` | `{ "team", "players", "index", "total" }` | After each team upsert |
| `team_error` | `{ "team", "error" }` | If a single team fails (sync continues) |
| `done` | `{ "message", "synced", "errors", "syncedAt" }` | All teams processed |
| `error` | `{ "message" }` | Fatal failure before completion |

**Rate limiting:** Uses `RateLimitedQueue` (5 req/min). Backs off exponentially on 429s (base 12s, up to 3 retries). HoopsHype scraping runs in parallel with the queued balldontlie call per team.

---

### `POST /api/analyze`

Triggers a full trade analysis. Response is an SSE stream.

**Request body:**
```json
{
  "teamA": {
    "id": 1,
    "name": "Atlanta Hawks",
    "sending": [
      { "id": 123, "first_name": "Trae", "last_name": "Young", "salary": 43000000 }
    ]
  },
  "teamB": {
    "id": 2,
    "name": "Boston Celtics",
    "sending": [
      { "id": 456, "first_name": "Jayson", "last_name": "Tatum", "salary": 34000000 }
    ]
  }
}
```

**Validation:** Both `teamA.sending` and `teamB.sending` must be non-empty arrays. Returns `HTTP 400` otherwise.

**SSE events emitted:**

| Event | Payload | When |
|-------|---------|------|
| `status` | `{ "message": "Evaluating trade legality..." }` | Before CBA salary matching check |
| `legality` | Full `TradeLegality` object (see `POST /api/trade/evaluate`) | After legality check completes |
| `legality_error` | `{ "message": "<description>" }` | If legality check fails (non-fatal, analysis continues) |
| `status` | `{ "message": "Fetching player stats..." }` | Before calling `getSeasonAverages` |
| `status` | `{ "message": "Analyzing trade with Claude Code..." }` | After prompt is built, before calling the wrapper |
| `chunk` | `{ "text": "<partial markdown>" }` | Relayed from the Claude Wrapper |
| `done` | `{ "message": "Analysis complete" }` | Wrapper emits `done`, or stream ends cleanly |
| `error` | `{ "message": "<description>" }` | Any failure in the pipeline |

---

## 6. Inter-Service Communication

This service **calls** the Claude CLI Wrapper and is **called by** the frontend.

### Calling the Claude CLI Wrapper

- **When:** During `POST /api/analyze`, after the prompt is built
- **How:** `fetch(CLAUDE_WRAPPER_URL + "/invoke", { method: "POST", body: JSON.stringify({ prompt }) })`
- **Response handling:** The wrapper response body is read as a `ReadableStream` using `response.body.getReader()`. Chunks are decoded with `TextDecoder`, accumulated in a string buffer, split on `\n\n` to extract complete SSE messages, parsed by `parseSSE()`, and re-emitted to the browser client.
- **Non-ok response:** If `wrapperRes.ok` is false, the raw text body is read and sent as `event: error` to the browser.

### Called by the Frontend

The frontend (React app on `:3000`) calls this server's three endpoints over plain HTTP. CORS is enabled globally via `cors()` middleware with default settings (all origins allowed).

---

## 7. Error Handling & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Missing `BALLDONTLIE_API_KEY` | Warning logged at startup; all balldontlie calls return 401, which throws and surfaces as a 502 to the caller |
| balldontlie rate limit (429) | `bdlFetch` throws; no retry logic; error propagates to route handler → 502 response |
| HoopsHype scrape fails (network error, non-200, missing JSON) | `getTeamSalaries` returns `[]` (empty array) silently; roster is returned with no salary data |
| HoopsHype `__NEXT_DATA__` structure changes | Returns `[]` — no crash, but players will have `salary: null` |
| Player on HoopsHype not found in balldontlie | Added to roster with `id: null` and empty `position` |
| Player in balldontlie not found on HoopsHype | Excluded from roster (treated as inactive/not on current contract) |
| `getSeasonAverages` always returns empty Map | All players in the prompt render with `"Stats N/A"` — this is expected and intentional on the free tier |
| Claude Wrapper unreachable | `fetch()` throws → caught in try/catch → `event: error` sent to browser → connection closed |
| Client disconnects during analysis | `res.on("close")` sets `finished = true`; the wrapper fetch continues reading in the background but `res.write` calls are no-ops on a closed socket |
| `POST /api/analyze` — empty `sending` arrays | `HTTP 400` returned before SSE headers are set |
| SSE relay — `parseSSE` receives malformed data line | Falls back to `{ text: rawString }` instead of throwing |

| Trade legality — team not found in DB | `evaluateTradeLegality` throws; caught in route handler → error event or 502 response. Run `POST /api/sync` first. |
| Trade legality — players with null salary | Treated as `$0` in salary matching math (`p.salary ?? 0`). This is conservative but may misrepresent the real cap hit. |
| Cap thresholds — season not found | Falls back to the most recent available season with a console warning |
| Legality check fails during analyze | Non-fatal — `legality_error` SSE event emitted, AI analysis proceeds without legality data in the prompt |

**No retry logic anywhere in the service.**

---

## 8. Key Assumptions & Constraints

- **MongoDB is the source of truth for team and player data.** `GET /api/teams` and `GET /api/teams/:id/players` read from MongoDB via `repository.js`. The DB must be populated first via `POST /api/sync`. If the DB is empty, both endpoints return empty arrays.
- **balldontlie free tier:** Only `/teams` and `/players` (all-time, with cursor pagination) are accessible. `/players/active`, `/stats`, and `/season_averages` all return 401. `getSeasonAverages` is a stub returning an empty Map and must remain so until a paid plan is used.
- **HoopsHype is scraped, not an official API.** The parsing relies on the `__NEXT_DATA__` JSON structure of their Next.js frontend. If their page structure changes, `getTeamSalaries` silently returns `[]`. There is no alerting.
- **balldontlie team IDs 1–30 = current NBA teams.** IDs above 30 are defunct historical franchises and are filtered out in `getTeams()`. Do not change this filter without verifying the ID range is still accurate.
- **`TEAM_SLUG` mapping is hardcoded.** Any NBA expansion or relocation requires a manual update to the `TEAM_SLUG` object in `nba.js`.
- **Name normalization is lossy.** `normalizeName` strips all non-alpha characters. Players with suffixes (Jr., III) or punctuation (O'Brien, N'Golo) have those stripped. This works in practice but edge cases are possible.
- **Cache is in-memory and process-scoped.** Restarting the server clears the cache. There is no cache invalidation mechanism other than TTL expiry.
- **The `cors()` middleware allows all origins.** This is intentional for local development only — do not deploy publicly without restricting origins.
- **The prompt sends no model override to the wrapper.** The wrapper will use its default model (`claude-sonnet-4-6` unless overridden by its own `CLAUDE_MODEL` env var).
- **`parseSSE` defaults `type` to `"message"` if no `event:` line is present.** The current code only acts on `chunk`, `done`, and `error` types — an unrecognized type is silently skipped.
- **`RateLimitedQueue` is sequential and single-process.** The queue is instantiated per sync run; it does not persist across requests. `isSyncing` is a module-level boolean — if the process crashes mid-sync, it resets on restart.
- **Sync bypasses nothing in the in-memory salary cache.** `getTeamSalaries` is called through the shared 30-minute TTL cache in `nba.js`. Restart the server to force a fresh HoopsHype scrape on the next sync.
- **Cap thresholds are hardcoded per season.** `capThresholds.js` must be manually updated each season with new CBA values. The trade salary matching brackets follow the 2023 CBA structure — if the CBA is renegotiated, the bracket structure may need to change.
- **Trade legality is computed from DB data.** `evaluateTradeLegality` reads the full team roster from MongoDB to calculate cap position. If the DB is stale (not recently synced), cap calculations may be inaccurate.
- **Contract enrichment depends on HoopsHype seasons data.** `yearsRemaining`, `isExpiring`, and `contractYears` are derived from the `seasons[]` array in HoopsHype's `__NEXT_DATA__`. If HoopsHype changes their data structure, these fields will be null/empty.
- **`tradeStatus` defaults to `"tradeable"` for all players.** The schema supports `trade-candidate` and `not-tradable` statuses, but auto-detection of these statuses is not yet implemented — it requires additional data sources (signing dates, contract types) not available from the current HoopsHype scrape.
- **Salary matching uses the 2023 CBA three-bracket system.** For over-cap teams: (1) outgoing ≤ $7.5M → 200% + $250K, (2) $7.5M–$29M → outgoing + $7.75M, (3) > $29M → 125% + $250K. First/second apron teams use a stricter 110% + $250K rule. Under-cap teams can absorb up to remaining cap space + $250K + outgoing salary.
