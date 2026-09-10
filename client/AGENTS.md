# AGENTS.md — client

Technical reference for any agent or developer working inside this service.

---

## 1. Service Overview

**What it does:** React single-page application that lets users pick two NBA teams, select players from each roster to trade, and receive a streamed AI-powered trade analysis rendered as markdown.

**What it does NOT do:**
- It does not fetch NBA data directly — all API calls go through the App Server (`server/`) via the Vite proxy.
- It does not invoke Claude or any AI model — it receives streamed output from the App Server.
- It does not persist any state — no localStorage, no cookies, no database.
- It does not authenticate users.

---

## 2. Architecture & Structure

```
client/
├── index.html              — HTML entry point; loads Google Fonts (Bebas Neue, DM Sans, DM Mono)
├── vite.config.js          — Vite config; dev server on :3000; proxies /api → :3001
├── package.json            — React 19, react-markdown, Vite 8
├── eslint.config.js        — ESLint 9 with React hooks rules
└── src/
    ├── main.jsx            — Mounts <App /> into #root
    ├── App.jsx             — Root component; owns all trade state and the analyze handler
    ├── index.css           — Global CSS variables and base styles (dark sports theme)
    ├── hooks.js            — Custom hooks: useTeams, usePlayers
    └── components/
        ├── TeamPanel.jsx   — Team dropdown + roster list + player toggle
        ├── TradeSummary.jsx — Salary summary of the pending trade (both sides)
        └── TradeAnalysis.jsx — Streams and renders the AI analysis markdown
```

---

## 3. State Management

**No external state library.** All state lives in `App.jsx` and is passed down as props.

```
App.jsx
├── teamA: { id, name, sending: Player[] }
├── teamB: { id, name, sending: Player[] }
├── analysisText: string       — accumulated markdown from SSE chunks
├── statusMsg: string          — status messages during streaming
├── errorMsg: string           — any error surfaced to the user
├── isStreaming: boolean        — true while SSE connection is open
└── isDone: boolean            — true after "done" event received
```

Teams/players data is local to the custom hooks (`useTeams`, `usePlayers`) — it never lives in `App.jsx`.

---

## 4. Component Reference

### `App.jsx` — Root & Orchestrator

**Key handlers:**

| Handler | What it does |
|---------|-------------|
| `handleTeamChange(side, selected)` | Updates `teamA` or `teamB`; resets `sending: []` on team change |
| `handleTogglePlayer(side, player)` | Adds or removes a player from the side's `sending` array; uses a `Set` for O(1) lookup |
| `handleAnalyze()` | POSTs to `/api/analyze`, opens an SSE `ReadableStream`, parses events, updates state |

**`canAnalyze` guard:**
```javascript
canAnalyze = teamA.sending.length > 0 && teamB.sending.length > 0 && !isStreaming
```

**`parseSSEBlock(block)` (private):**
- Parses a single `\n\n`-delimited SSE block into `{ type, data }`.
- Falls back to `{ type: "message", data: { text: rawString } }` if `data:` line is not valid JSON.

**Layout structure:**
1. Sticky header — logo + ANALYZE TRADE button
2. Two `<TeamPanel>` columns separated by a central divider (⇄)
3. `<TradeSummary>` — rendered when any player is selected
4. `<TradeAnalysis>` — rendered when streaming or done

---

### `TeamPanel.jsx` — Team Selection & Roster

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `label` | string | "TEAM 1" or "TEAM 2" |
| `team` | `{ id, name, sending[] }` | Current team state |
| `onTeamChange` | `(selected) => void` | Called when user picks a team from the dropdown |
| `onTogglePlayer` | `(player) => void` | Called when user clicks a player row |

**Internal hooks:**
- `useTeams()` — fetches all 30 teams for the dropdown
- `usePlayers(team.id)` — fetches the roster for the currently selected team

**UI zones:**
1. **Team dropdown** — sorted alphabetically by `full_name`
2. **Trading Away chips** — selected players with salary + remove (×) button
3. **Roster list** (max-height: 440px, scrollable) — each row: position | name | salary | toggle button

**Player row states:** "TRADING" badge (orange) if in `sending[]`, "+" button otherwise.

**Salary formatting:** `Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })`

---

### `TradeSummary.jsx` — Salary Preview

**Props:** `teamA`, `teamB` (same shape as App.jsx state)

**Renders only when** at least one player is selected on either side (`hasAnything` check).

**Displays:**
- SENDS column (orange) and RECEIVES column (green) per team
- Total salary out and total salary in per team
- Salary difference badge between the two sides

---

### `TradeAnalysis.jsx` — AI Output

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `text` | string | Accumulated markdown text |
| `status` | string | Status message (e.g. "Fetching player stats...") |
| `error` | string | Error message if analysis failed |
| `isStreaming` | boolean | Controls pulsing badge and cursor |
| `isDone` | boolean | Controls "Analysis complete" badge and grade parsing |

**Grade parsing (only when `isDone`):**
- Regex: `/\*\*([^*]+)\*\*:\s*(A\+|A-?|B\+|B-?|C\+|C-?|D|F)\b/g`
- Extracts team name + letter grade pairs from the markdown
- Renders colored grade cards (green for A/B, yellow for C, red for D/F)

**Markdown rendering:** Uses `react-markdown` with custom inline styles for `h2`, `p`, `strong`, `ul`, `li`.

**Animated cursor** (▍) is appended to text while `isStreaming` is true.

**Returns null** if `text`, `status`, and `error` are all empty.

---

## 5. Custom Hooks

### `useTeams()`

- Fetches `GET /api/teams` on mount.
- Returns `{ teams, loading, error }`.
- Sorts teams alphabetically by `full_name`.

### `usePlayers(teamId)`

- Fetches `GET /api/teams/{teamId}/players` when `teamId` changes.
- Returns `{ players, loading, error }`.
- Clears the roster (`players = []`) if `teamId` is `null`.

---

## 6. API Integration

All requests go to `/api/*` which the Vite dev proxy forwards to `http://localhost:3001`.

| Endpoint | Called by | Response shape |
|----------|-----------|----------------|
| `GET /api/teams` | `useTeams()` | `{ data: Team[] }` |
| `GET /api/teams/:id/players` | `usePlayers()` | `{ data: Player[] }` |
| `POST /api/analyze` | `handleAnalyze()` | SSE stream (see below) |

**SSE events consumed by `handleAnalyze()`:**

| Event type | Payload | Action |
|------------|---------|--------|
| `status` | `{ message }` | Sets `statusMsg` |
| `chunk` | `{ text }` | Appends to `analysisText` |
| `done` | `{ message }` | Sets `isDone = true`, closes stream |
| `error` | `{ message }` | Throws error → sets `errorMsg` |

**ReadableStream handling:** Response body is read with `response.body.getReader()`, decoded with `TextDecoder`, split on `\n\n`, and each block is passed to `parseSSEBlock()`.

---

## 7. Configuration & Environment

**Vite dev proxy** (`vite.config.js`):
```javascript
server: {
  port: 3000,
  proxy: { '/api': 'http://localhost:3001' }
}
```

No environment variables are used client-side. The API base URL is implicit via the Vite proxy — do not hardcode `localhost:3001` in any component.

---

## 8. Styling Approach

- **Method:** Inline JavaScript style objects (`const styles = { ... }`) with CSS custom properties.
- **No CSS modules, no Tailwind, no styled-components.**
- Global CSS variables are defined in `index.css` and consumed via `var(--name)` in inline styles.

**Key CSS variables:**

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#030303` | App background |
| `--surface` | `#141415` | Panel/card backgrounds |
| `--accent` | `#f15a22` | Orange highlights, buttons, active states |
| `--text` | `rgba(255,255,255,0.7)` | Body text |
| `--text-muted` | `rgba(255,255,255,0.4)` | Secondary text, placeholders |
| `--font-display` | Bebas Neue | Headings, labels |
| `--font-body` | DM Sans | Body text |
| `--font-mono` | DM Mono | Salary numbers, monospace data |

---

## 9. Key Assumptions & Constraints

- **React 19.** Do not use patterns or APIs deprecated or removed in React 19 (e.g. legacy `createRoot` patterns).
- **No routing.** The app is a single view — there is no React Router or any client-side routing.
- **Props are drilled, not shared via context.** All trade state originates in `App.jsx`. Do not introduce Context or a state library without discussing the trade-offs.
- **Vite proxy is required for local dev.** Direct calls to `localhost:3001` from the browser will hit CORS. Always use `/api/*` paths.
- **`react-markdown` is the only third-party UI library.** Do not add component libraries (MUI, Shadcn, etc.) without explicit discussion.
- **Inline styles use CSS variables, not hardcoded hex values.** When adding new styles, use existing variables from `index.css` before introducing new colors.
- **`usePlayers` resets on null teamId.** This is intentional — changing teams should immediately clear the roster.
- **Grade parsing runs only when `isDone` is true.** Do not run the regex during streaming — it is applied to the complete markdown text only.
- **The animated cursor (▍) is purely cosmetic.** It is appended to `analysisText` in the render, not stored in state.
