---
name: code-reviewer
description: Project code review checklist for the NBA Trade Analyzer. Invoke on the staged changes before every git commit and address the findings. Reviews for security, code quality, React 19 patterns, and Node/Express backend patterns.
---

# Code Reviewer

Run this before every `git commit`. Review the changes that are about to be committed, resolve CRITICAL and HIGH findings first, then commit.

## Review Process

1. **Gather context** — Run `git diff --staged` to see exactly what will be committed. If nothing is staged, run `git diff` and review the unstaged working-tree changes instead.
2. **Understand scope** — Identify which files changed, what feature/fix they relate to, and how they connect.
3. **Read surrounding code** — Don't review changes in isolation. Read the full file and understand imports, dependencies, and call sites.
4. **Apply the checklist** — Work through each category below, CRITICAL to LOW.
5. **Report findings** — Use the output format below. Only report issues you are >80% confident are real problems.
6. **Act on the result** — See "Acting on the Review" at the end.

## Confidence-Based Filtering

**IMPORTANT**: Do not flood the review with noise. Apply these filters:

- **Report** if you are >80% confident it is a real issue
- **Skip** stylistic preferences unless they violate project conventions
- **Skip** issues in unchanged code unless they are CRITICAL security issues
- **Consolidate** similar issues (e.g., "5 functions missing error handling" not 5 separate findings)
- **Prioritize** issues that could cause bugs, security vulnerabilities, or data loss

## Review Checklist

### Security (CRITICAL)

These MUST be flagged — they can cause real damage:

- **Hardcoded credentials** — API keys, passwords, tokens, connection strings in source (e.g. a real `BALLDONTLIE_API_KEY` or `MONGODB_URI` outside `server/.env`)
- **SQL/NoSQL injection** — Unsanitized input in queries; unvalidated objects passed straight into Mongoose queries
- **XSS vulnerabilities** — Unescaped user input rendered in HTML/JSX; `dangerouslySetInnerHTML` on model output
- **Path traversal** — User-controlled file paths without sanitization
- **Authentication bypasses** — Missing auth checks on protected routes
- **Insecure dependencies** — Known vulnerable packages
- **Exposed secrets in logs** — Logging tokens, connection strings, or PII

```javascript
// BAD: unvalidated request body straight into a query
const team = await Team.findOne(req.body.filter);

// GOOD: pull explicit, validated fields
const team = await Team.findOne({ teamId: Number(req.params.id) });
```

### Code Quality (HIGH)

- **Large functions** (>50 lines) — Split into smaller, focused functions
- **Large files** (>800 lines) — Extract modules by responsibility
- **Deep nesting** (>4 levels) — Use early returns, extract helpers
- **Missing error handling** — Unhandled promise rejections, empty catch blocks, unguarded `res.end()` on SSE responses
- **Mutation patterns** — Prefer immutable operations (spread, map, filter)
- **console.log statements** — Remove debug logging before commit
- **Dead code** — Commented-out code, unused imports, unreachable branches

```javascript
// BAD: deep nesting + mutation
function activeRoster(players) {
  if (players) {
    for (const p of players) {
      if (p.salary) { p.active = true; results.push(p); }
    }
  }
  return results;
}

// GOOD: early return + immutability + flat
function activeRoster(players) {
  if (!players) return [];
  return players.filter(p => p.salary).map(p => ({ ...p, active: true }));
}
```

### React Patterns (HIGH) — `client/` is React 19 + Vite

- **Missing dependency arrays** — `useEffect`/`useMemo`/`useCallback` with incomplete deps
- **State updates in render** — Calling setState during render causes infinite loops
- **Missing keys in lists** — Using array index as key when items can reorder
- **Prop drilling** — Props passed through 3+ levels (note: this project deliberately drills from `App.jsx`; flag only genuinely excessive cases)
- **Stale closures** — Event handlers / SSE readers capturing stale state
- **Missing loading/error states** — Data fetching without fallback UI
- **Inline styles must use the CSS variables** from `client/src/index.css`, not hardcoded hex

```jsx
// BAD: missing dependency
useEffect(() => { fetchRoster(teamId); }, []);

// GOOD
useEffect(() => { fetchRoster(teamId); }, [teamId]);
```

### Node/Express Backend Patterns (HIGH) — `server/`, `claude-wrapper/`

- **Unvalidated input** — Request body/params used without checking shape (e.g. `sending` arrays not verified non-empty)
- **Unbounded queries** — Queries without limits on user-facing endpoints
- **N+1 queries** — Fetching related data in a loop instead of a batch
- **Missing timeouts** — External HTTP calls (balldontlie, HoopsHype, the wrapper) without timeout handling
- **Error message leakage** — Sending internal error details / stack traces to clients
- **SSE lifecycle bugs** — `res.end()` called more than once, missing `res.on("close")` handling, writing after the client disconnected
- **Rate-limit handling** — New balldontlie calls that bypass the `RateLimitedQueue` / in-memory cache

```javascript
// BAD: N+1
for (const team of teams) {
  team.players = await Player.find({ teamId: team.id });
}

// GOOD: one batched query
const players = await Player.find({ teamId: { $in: teams.map(t => t.id) } });
```

### Performance (MEDIUM)

- **Inefficient algorithms** — O(n^2) when O(n log n) / O(n) is possible
- **Unnecessary re-renders** — Missing `React.memo` / `useMemo` for expensive work
- **Missing caching** — Repeated expensive computation or refetching cached data
- **Synchronous I/O** in async contexts

### Best Practices (LOW)

- **TODO/FIXME without a tracking reference**
- **Poor naming** — Single-letter variables in non-trivial contexts
- **Magic numbers** — Unexplained numeric constants (cap thresholds belong in `capThresholds.js`)
- **Inconsistent formatting** — Mixed quote styles, indentation

## Project-Specific Guidelines

Cross-check against the `AGENTS.md` file in the directory being changed (`server/`, `client/`, `claude-wrapper/`) and against `CLAUDE.md`:

- No emojis in code
- Inline styles reference CSS variables, never hardcoded hex
- Client talks to the server only via `/api/*` (Vite proxy) — never a hardcoded `localhost:3001`
- `claude-wrapper/` must stay NBA-agnostic — flag any NBA/trade logic added there
- Secrets live only in `server/.env` (gitignored)

When in doubt, match what the rest of the codebase does.

## AI-Generated Code Addendum

When the changes were AI-generated, prioritize:

1. Behavioral regressions and edge-case handling
2. Security assumptions and trust boundaries
3. Hidden coupling or accidental architecture drift
4. Unnecessary complexity

## Review Output Format

For each issue:

```
[CRITICAL] Hardcoded API key in source
File: server/nba.js:42
Issue: balldontlie key "abc123..." hardcoded — will be committed to git history.
Fix: Read from process.env.BALLDONTLIE_API_KEY; keep it in server/.env only.
```

End with:

```
## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 2     | warn   |
| MEDIUM   | 3     | info   |
| LOW      | 1     | note   |

Verdict: WARNING — 2 HIGH issues to resolve before commit.
```

## Acting on the Review

- **CRITICAL found** — Do not commit. Fix, re-stage, re-run this skill.
- **HIGH found** — Fix before committing unless the user explicitly accepts the risk. Restage and note what was addressed in the commit message body if relevant.
- **MEDIUM / LOW only** — Report them, then proceed with the commit. Fix opportunistically if trivial.
- **Clean** — Proceed with the commit.
