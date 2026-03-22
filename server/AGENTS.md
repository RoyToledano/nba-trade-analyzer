# AGENTS.md — server

Technical reference for any agent or developer working inside this service.

---

## 1. Service Overview

**What it does:** NBA-aware HTTP server that bridges the React frontend with two external data sources (balldontlie API and HoopsHype) and the Claude CLI Wrapper service. It owns all NBA data fetching, active-roster resolution, salary enrichment, and prompt construction.

**What it does NOT do:**
- It does not invoke Claude directly — it delegates to the Claude Wrapper (`claude-wrapper/`) via HTTP.
- It does not serve the frontend static files — the React app runs on its own Vite dev server.
- It does not persist any data — no database, no session state.
- It does not authenticate callers.

---

## 2. Architecture & Structure

```
server/
├── index.js       — Express server; defines all routes and SSE relay logic
├── nba.js         — All external data fetching: balldontlie API + HoopsHype scraping
├── prompt.js      — Builds the structured Claude prompt from trade data
└── package.json   — ES Modules; dependencies: express, cors
```

### `index.js` — Routes & SSE relay

- Starts Express on the configured port with `cors()` and `express.json()` middleware.
- Defines three routes (see §5).
- For `POST /api/analyze`: orchestrates the full pipeline — stats fetch → prompt build → wrapper call → SSE relay.
- Contains `parseSSE(block)` — a private helper that parses one SSE message block (text between `\n\n` separators) into `{ type, data }`. Falls back to `{ text: rawString }` if `data:` line is not valid JSON.
- Manages a `finished` boolean + `finish()` guard on the SSE response to prevent double `res.end()`. Uses `res.on("close")` to detect client disconnect.

### `nba.js` — Data fetching & roster resolution

All functions that touch external services live here. Key exports:

| Export | Description |
|--------|-------------|
| `getTeams()` | Fetches all teams from balldontlie, filters to IDs 1–30 (current NBA teams) |
| `getTeamSalaries(teamId)` | Scrapes current-season salary data from HoopsHype |
| `getPlayersWithSalaries(teamId)` | Combines the above two to return the active roster with salary attached |
| `getSeasonAverages(playerIds)` | **Currently a stub** — always returns an empty `Map` (see §8) |

Private functions (not exported):

| Function | Description |
|----------|-------------|
| `getAllPlayersForTeam(teamId)` | Paginates the balldontlie `/players` endpoint until `next_cursor` is null |
| `normalizeName(raw)` | Strips accents, lowercases, removes non-alpha characters — used for cross-source name matching |
| `hoopsHypeSeason()` | Returns the HoopsHype season year (end year: 2025-26 → `2026`). Logic: month ≥ October → `currentYear + 1`, else `currentYear` |
| `bdlFetch(path)` | Wraps `fetch` for balldontlie with the auth header; throws on non-2xx |
| `cached(key, ttlMs, fetcher)` | In-memory TTL cache backed by a `Map`; returns cached data if not expired |

**Active roster resolution strategy:**
1. Fetch all historical players for a team from balldontlie (paginated, may be 100–200+ players including retired)
2. Scrape current-season contracts from HoopsHype
3. Cross-reference by normalized name → only players present in both are included
4. HoopsHype players with no balldontlie match (e.g. newly signed rookies) are added with `id: null` and minimal fields
5. Result sorted by salary descending

### `prompt.js` — Prompt builder

Single export: `buildTradePrompt(trade)`.

- Accepts `{ teamA, teamB }` where each has `{ name, sending: [{ first_name, last_name, salary, stats }] }`.
- Formats each player as: `Name | Salary: $X,XXX,XXX | X.X PPG / X.X RPG / X.X APG / X.X MPG`
- If `salary` is `null` → renders `"N/A"`.
- If `stats` is `null` → renders `"Stats N/A"` (stats are always null on the free balldontlie tier).
- Returns a complete prompt string instructing Claude to respond with exactly six markdown section headers.

---

## 3. Configuration & Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `PORT` | `3001` | TCP port the Express server listens on |
| `CLAUDE_WRAPPER_URL` | `http://localhost:3002` | Base URL of the Claude CLI Wrapper service |
| `BALLDONTLIE_API_KEY` | `""` (warns if missing) | API key sent as `Authorization` header to balldontlie |

**Env file loading:** The `package.json` scripts use `node --env-file=.env`, so a `.env` file in `server/` is automatically loaded at startup. No `dotenv` package is used.

```
# server/.env
BALLDONTLIE_API_KEY=your_key_here
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
  "height": "6-4",
  "weight": "205",
  "jersey_number": "12",
  "team": { "id": 25, "full_name": "Portland Trail Blazers", ... },
  "salary": 34800000
}
```
`salary` is `null` if no HoopsHype match was found. `id` is `null` for players found on HoopsHype but not in the balldontlie database.

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

**No retry logic anywhere in the service.**

---

## 8. Key Assumptions & Constraints

- **balldontlie free tier:** Only `/teams` and `/players` (all-time, with cursor pagination) are accessible. `/players/active`, `/stats`, and `/season_averages` all return 401. `getSeasonAverages` is a stub returning an empty Map and must remain so until a paid plan is used.
- **HoopsHype is scraped, not an official API.** The parsing relies on the `__NEXT_DATA__` JSON structure of their Next.js frontend. If their page structure changes, `getTeamSalaries` silently returns `[]`. There is no alerting.
- **balldontlie team IDs 1–30 = current NBA teams.** IDs above 30 are defunct historical franchises and are filtered out in `getTeams()`. Do not change this filter without verifying the ID range is still accurate.
- **`TEAM_SLUG` mapping is hardcoded.** Any NBA expansion or relocation requires a manual update to the `TEAM_SLUG` object in `nba.js`.
- **Name normalization is lossy.** `normalizeName` strips all non-alpha characters. Players with suffixes (Jr., III) or punctuation (O'Brien, N'Golo) have those stripped. This works in practice but edge cases are possible.
- **Cache is in-memory and process-scoped.** Restarting the server clears the cache. There is no cache invalidation mechanism other than TTL expiry.
- **The `cors()` middleware allows all origins.** This is intentional for local development only — do not deploy publicly without restricting origins.
- **The prompt sends no model override to the wrapper.** The wrapper will use its default model (`claude-sonnet-4-6` unless overridden by its own `CLAUDE_MODEL` env var).
- **`parseSSE` defaults `type` to `"message"` if no `event:` line is present.** The current code only acts on `chunk`, `done`, and `error` types — an unrecognized type is silently skipped.
