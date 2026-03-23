# NBA Trade Analyzer — Design Document

> Single source of truth for architecture, contracts, and design decisions.
> Any agent or developer working on this codebase should be able to read this and immediately understand the system.

---

## Table of Contents

1. [Project Overview & Goals](#1-project-overview--goals)
2. [System Architecture](#2-system-architecture)
3. [Key Components & Modules](#3-key-components--modules)
4. [API & Interface Contracts](#4-api--interface-contracts)
5. [AI Prompt Design](#5-ai-prompt-design)
6. [Tech Stack & Dependencies](#6-tech-stack--dependencies)
7. [Design Decisions & Rationale](#7-design-decisions--rationale)
8. [Known Constraints & Limitations](#8-known-constraints--limitations)
9. [Future Enhancements](#9-future-enhancements)

---

## 1. Project Overview & Goals

NBA Trade Analyzer is a single-page web application where users construct hypothetical NBA trade scenarios and receive real-time AI-generated analysis powered by the Claude Code CLI.

### Goals

- Allow users to select two NBA teams and mark which players each team is **sending** — the receiving side is derived automatically (two-team trade)
- Fetch live roster data and current-season salaries from public sources
- Build a structured prompt with player context and invoke the Claude CLI
- Stream the AI analysis back to the browser **word-by-word** in real time
- Present a polished, single-page web UI with no login required

### Out of Scope (MVP)

- User authentication or saved trade history
- Real-time salary cap calculations (free-tier NBA APIs do not provide this)
- Multi-team or three-way trades
- Mobile native app

---

## 2. System Architecture

The system is composed of three independent layers, each running as a separate process:

```
[ Browser ]
React SPA  (Vite · :3000)
     |
     |  GET /api/teams
     |  GET /api/teams/:id/players
     |  POST /api/analyze  (SSE)
     v
[ App Server ]  (:3001)
Node.js · Express
server/index.js · server/nba.js · server/prompt.js
     |                          |
     |  balldontlie API         |  POST /invoke  (SSE)
     |  HoopsHype (scrape)      v
     |              [ Claude CLI Wrapper ]  (:3002)
     |              claude-wrapper/index.js · runner.js
     |              child_process.spawn('claude', ['-p', prompt])
     v
  External APIs
  balldontlie.io v1 — teams, rosters
  HoopsHype — current-season salary data (scraped)
```

### Data Flow — Trade Analysis

1. User selects Team A and Team B from dropdowns (populated via `GET /api/teams`)
2. User loads each team's roster via `GET /api/teams/:id/players` — players shown with salary
3. User marks players as **OUT** (sending) for each team — the other team's incoming is implied
4. User clicks **Analyze** — client `POST`s the trade payload to `POST /api/analyze`
5. App Server emits a `status` SSE event, then fetches season averages for traded players
6. App Server builds a structured prompt via `prompt.js` and forwards it to the Claude Wrapper via `POST /invoke`
7. Claude Wrapper spawns `claude -p <prompt> --output-format stream-json --verbose` and streams stdout as SSE
8. App Server relays the SSE stream (`chunk` / `done` / `error`) to the browser
9. Browser renders the analysis word-by-word in real time

---

## 3. Key Components & Modules

### 3.1 Claude CLI Wrapper — `claude-wrapper/`

Standalone, reusable HTTP microservice. **No NBA logic.** Can be reused across future projects.

| File | Responsibility |
|------|----------------|
| `index.js` | Express server on `:3002`. Exposes `POST /invoke`. Sets SSE headers, calls `runClaude`, relays events. |
| `runner.js` | Spawns `claude -p <prompt> --model <model> --output-format stream-json --verbose`. Parses JSONL stdout to extract text tokens. Collects stderr; only treats it as an error on non-zero exit. |

**Model selection priority:**
1. `model` field in the request body
2. `CLAUDE_MODEL` environment variable
3. Default: `claude-sonnet-4-6`

### 3.2 App Server — `server/`

NBA-aware Express server that bridges the frontend with external data sources and the Claude Wrapper.

| File | Responsibility |
|------|----------------|
| `index.js` | Three routes (`/api/teams`, `/api/teams/:id/players`, `/api/analyze`). SSE relay logic for proxying the Claude Wrapper stream to the browser. |
| `nba.js` | Fetches teams from balldontlie API. Scrapes current-season salaries from HoopsHype. Cross-references both to produce an active roster (players on current contracts). In-memory cache (1hr teams, 30min rosters). |
| `prompt.js` | Builds the structured analysis prompt with player stats and salaries. Returns a string ready to send to Claude. |

**Active roster strategy:** `balldontlie /players` returns all historical players for a team. HoopsHype provides current-season contracts. The intersection (by normalized name matching) gives the active roster.

**Stats:** `season_averages` and `stats` endpoints on balldontlie require a paid tier. `getSeasonAverages()` returns an empty Map on the free tier — `prompt.js` renders "Stats N/A" gracefully.

### 3.3 Frontend — `client/`

React SPA built with Vite.

| Component | Responsibility |
|-----------|----------------|
| `App.jsx` | Root layout, trade state management, `analyze` handler, SSE reading via `EventSource` |
| `TeamPanel.jsx` | Team selector dropdown + player roster with salary display and OUT toggle |
| `TradeSummary.jsx` | Visual trade bar showing outgoing players per team and implied incoming |
| `TradeAnalysis.jsx` | Streaming markdown renderer with live cursor and section headers |
| `hooks.js` | `useTeams` and `usePlayers` data-fetching hooks |

---

## 4. API & Interface Contracts

### App Server endpoints (`:3001`)

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| `GET` | `/api/teams` | `{ data: Team[] }` | All 30 current NBA teams |
| `GET` | `/api/teams/:id/players` | `{ data: Player[] }` | Active roster with salary data |
| `POST` | `/api/analyze` | SSE stream | Trade analysis — relays Claude CLI stream |

### Claude Wrapper endpoint (`:3002`)

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| `POST` | `/invoke` | SSE stream | Raw prompt → streamed AI response |

### `POST /api/analyze` — Request Body

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

### `POST /invoke` — Request Body

```json
{ "prompt": "<full analysis prompt string>", "model": "claude-sonnet-4-6" }
```

### SSE Event Types

All SSE streams (both the App Server and the Claude Wrapper) use the same event format:

| Event | Payload | When |
|-------|---------|------|
| `status` | `{ "message": "..." }` | App Server: before fetching stats / before invoking Claude |
| `chunk` | `{ "text": "<partial markdown>" }` | Streamed token by token from the Claude CLI |
| `done` | `{ "message": "Analysis complete" }` | CLI exited cleanly (code 0) |
| `error` | `{ "message": "<description>" }` | Spawn failure, non-zero exit, or upstream error |

### Player Object Shape

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

`salary` is `null` if no current-season contract was found on HoopsHype.

---

## 5. AI Prompt Design

The prompt is built in `server/prompt.js` and structured as follows:

### Prompt Template

```
You are a sharp, opinionated NBA analyst who evaluates trades with depth and nuance...

**Team A Name** is sending:
  - Player Name | Salary: $XX,XXX,XXX | X.X PPG / X.X RPG / X.X APG / X.X MPG

**Team B Name** is sending:
  - Player Name | Salary: $XX,XXX,XXX | Stats N/A

Since this is a two-team trade, each team receives the players the other team is sending.

Analyze this trade... Respond using exactly these markdown section headers:

## Short-Term Winner
## Long-Term Winner
## Salary & Cap Implications
## Fit Analysis: Team A Name
## Fit Analysis: Team B Name
## Verdict
```

### Output Sections

| Section | Content |
|---------|---------|
| `## Short-Term Winner` | Immediate impact over next 1–2 seasons |
| `## Long-Term Winner` | 3+ season outlook, contracts, development |
| `## Salary & Cap Implications` | Cap hits, luxury tax risk, flexibility |
| `## Fit Analysis: Team A` | How incoming players fit Team A |
| `## Fit Analysis: Team B` | How incoming players fit Team B |
| `## Verdict` | One paragraph: should this trade happen? |

---

## 6. Tech Stack & Dependencies

### Claude CLI Wrapper (`:3002`)

| | |
|--|--|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Module system | ES Modules (`"type": "module"`) |
| CLI | `claude` (Claude Code CLI, authenticated via personal Anthropic account) |
| CLI flags | `-p <prompt> --model <model> --output-format stream-json --verbose` |

### App Server (`:3001`)

| | |
|--|--|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Module system | ES Modules (`"type": "module"`) |
| Env loading | `node --env-file=.env` (Node 20+ built-in, no dotenv) |
| CORS | `cors` package |
| External APIs | balldontlie.io v1 (requires free API key), HoopsHype (scraped) |

### Frontend (`:3000`)

| | |
|--|--|
| Framework | React 18 |
| Bundler | Vite 5 |
| Styling | CSS (inline/scoped), CSS variables |
| Streaming | `fetch()` + `ReadableStream` (see Design Decisions) |
| Markdown rendering | `react-markdown` |
| Fonts | Bebas Neue (display), DM Sans (body), DM Mono (code) — Google Fonts |

### External Services

| Service | Auth | Used For |
|---------|------|----------|
| balldontlie.io v1 | Free API key (`BALLDONTLIE_API_KEY`) | Teams list, all-time player roster per team |
| HoopsHype | None (public scrape) | Current-season salary data per team |
| Anthropic / Claude CLI | Personal account (no API key in app) | AI trade analysis |

---

## 7. Design Decisions & Rationale

### `fetch()` + `ReadableStream` over `EventSource` for SSE
The design originally specified `EventSource (Web API)` for consuming the `POST /api/analyze` SSE stream. However, the browser's native `EventSource` API only supports GET requests — it cannot send a POST body. The implementation uses `fetch()` with `response.body.getReader()` instead, which is the same ReadableStream pattern used in the server to relay from the Claude Wrapper. SSE blocks are split on `\n\n` and parsed manually with the same `parseSSEBlock` logic. No extra dependency is needed.

### `react-markdown` for AI output rendering
The `TradeAnalysis` component renders Claude's markdown output (section headers, bold text, paragraphs) using `react-markdown`. Rendering without a library would either require complex regex parsing or display raw `##` and `**` characters in the UI. `react-markdown` is a minimal, dependency-light library that handles this correctly. Each markdown element maps to a component with custom inline styles so no additional CSS framework is needed.

### Claude CLI over Anthropic API
Using the `claude` CLI subprocess instead of the Anthropic API directly avoids managing API keys in the application and reuses existing authentication. The CLI wrapper is fully decoupled from NBA logic.

### SSE over WebSockets
Server-Sent Events are simpler than WebSockets for a unidirectional stream (server → client). Native browser `EventSource` support means no extra client libraries.

### HoopsHype for active roster detection
`balldontlie`'s free tier only provides `/players` (all historical players) and `/teams`. `season_averages` and `stats` require paid access. HoopsHype's current-season contract data serves as a proxy for "active roster" — any player with a current contract is considered active.

### In-memory cache
A simple TTL cache (1hr for teams, 30min for rosters/salaries) avoids hitting balldontlie's 5 req/min rate limit during normal use. No Redis or external caching needed for a local MVP.

### `--env-file` over dotenv
Node 20+ supports `--env-file` natively in the CLI. No additional dependency required.

### Three-process architecture
Frontend (Vite dev server), App Server, and Claude Wrapper are three separate processes with their own `package.json`. This keeps the Claude Wrapper fully reusable and decoupled. The App Server can be swapped or extended without touching the CLI wrapper.

---

## 8. Known Constraints & Limitations

| Constraint | Detail |
|------------|--------|
| **Stats unavailable on free tier** | `balldontlie` season averages and game stats require a paid plan. Prompt renders "Stats N/A" — Claude analyzes based on salary and player reputation only. |
| **HoopsHype scraping fragility** | Salary data depends on HoopsHype's `__NEXT_DATA__` JSON structure. If they change their frontend framework, scraping will break. Falls back to empty salary data gracefully. |
| **Rate limiting** | balldontlie free tier: 5 req/min. In-memory cache mitigates this for normal use but concurrent users could hit limits. |
| **Name matching** | HoopsHype ↔ balldontlie player matching uses normalized name strings. Edge cases (suffixes like Jr./III, accents, hyphens) are normalized but may still miss some players. |
| **Local-only deployment** | No auth, no HTTPS, no rate limiting on our server. Not intended for public deployment without hardening. |
| **Claude CLI startup latency** | First token appears ~2–5 seconds after request due to CLI process startup and API round-trip. SSE `status` events provide feedback during this wait. |

---

## 9. Future Enhancements

| Feature | Notes |
|---------|-------|
| Automated salary sync | Replace HoopsHype scraping with a paid NBA stats API (e.g. Sportradar) |
| Real season stats | Upgrade balldontlie plan or use a different stats provider for PPG/RPG/APG/MPG |
| Three-way trade support | UI and backend changes needed |
| Trade history persistence | SQLite or Postgres for saving past analyses |
| Shareable trade URLs | Encode trade state in URL params |
| Multiple AI personas | Contender GM vs Rebuilding GM vs Fantasy Manager |
| Docker Compose | Orchestrate all three services as a single stack |
| Player search / autocomplete | Replace full roster scroll with search input |
