# AGENTS.md — claude-wrapper

Technical reference for any agent or developer working inside this service.

---

## 1. Service Overview

**What it does:** Accepts a raw text prompt over HTTP and streams the Claude CLI's response back to the caller as Server-Sent Events (SSE).

**What it does NOT do:**
- It has zero knowledge of NBA, trades, teams, or players.
- It does not construct prompts — it receives them fully formed.
- It does not authenticate callers — there is no API key or token check on inbound requests.
- It does not persist anything — no logs, no database, no state between requests.

This service is intentionally generic and reusable across any project that needs a streaming Claude CLI integration.

---

## 2. Architecture & Structure

```
claude-wrapper/
├── index.js       — Express HTTP server; owns the SSE response lifecycle
├── runner.js      — Spawns the claude CLI subprocess; owns stdout parsing
├── package.json   — ES Modules, single dependency (express)
└── README.md      — Install and usage instructions
```

### `index.js` — Server & SSE lifecycle

- Creates the Express app on the configured port.
- Defines a single route: `POST /invoke`.
- Validates that `prompt` is a non-empty string; rejects with HTTP 400 otherwise.
- Sets SSE response headers and calls `res.flushHeaders()` before any async work.
- Manages a `finished` boolean flag to guard against calling `res.end()` more than once.
- Listens on `res.on("close")` (not `req.on("close")`) to detect client disconnects — sets `finished = true` without ending the response (the process finishes naturally).
- Delegates all CLI interaction to `runClaude()` from `runner.js`.

### `runner.js` — CLI subprocess & output parsing

**`runClaude(prompt, { onChunk, onDone, onError }, options)`**

The only exported function. Callback-based (not async/await).

| Callback | Triggered when |
|----------|---------------|
| `onChunk(text)` | A text token is extracted from the CLI's stdout |
| `onDone()` | The CLI process exits with code 0 |
| `onError(message)` | Spawn fails, or the process exits with a non-zero code |

Internal flow:
1. Resolves the model name (see §3), then calls `child_process.spawn`.
2. Accumulates stdout into a **line buffer** — splits on `\n`, keeps the last (potentially incomplete) line, and processes each complete line as a JSONL object.
3. Calls `extractText()` on each parsed object; forwards non-null results to `onChunk`.
4. Collects stderr chunks into an array — **does not treat individual stderr chunks as errors**.
5. On process close: flushes any remaining line in the buffer, then calls `onDone` (code 0) or `onError` with the joined stderr string (non-zero code).

**`extractText(obj)` (private)**

Parses a single JSONL line from `--output-format stream-json --verbose`. Only handles one event type:

```
{ type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
```

Returns the joined text of all `text`-type content blocks. Returns `null` for all other event types (e.g. `system`, `result`, `rate_limit_event`), which are silently ignored.

---

## 3. Configuration & Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `PORT` | `3002` | TCP port the Express server listens on |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Default Claude model used when not specified per-request |

No `.env` file loading is built into this service. Environment variables must be injected externally (e.g. shell export, parent process, or `--env-file` flag).

**Model selection priority (evaluated in `runner.js` at spawn time):**
1. `model` field from the request body (passed as `options.model`)
2. `CLAUDE_MODEL` environment variable
3. Hardcoded default: `"claude-sonnet-4-6"`

---

## 4. External Service Calls & Integrations

| Integration | How | When | Why |
|-------------|-----|------|-----|
| `claude` CLI binary | `child_process.spawn` | On every `POST /invoke` request | Runs the AI model and streams its output |

**CLI invocation:**
```
claude -p <prompt> --model <model> --output-format stream-json --verbose
```

- `-p` — print mode (non-interactive, exits after response)
- `--output-format stream-json` — emits JSONL to stdout as tokens are generated (requires `--verbose`)
- `--verbose` — required for `stream-json` to function in print mode
- `stdin` is set to `"ignore"`; stdout and stderr are both piped

**Requirement:** The `claude` CLI must be installed and authenticated on the host machine. Authentication is handled externally via the user's Anthropic account — no API key is managed by this service.

---

## 5. Inbound Interface

### `POST /invoke`

**Content-Type:** `application/json`

**Request body:**
```json
{
  "prompt": "string (required, non-empty)",
  "model": "string (optional, e.g. 'claude-opus-4-6')"
}
```

**Response:** `text/event-stream` (SSE)

| Event | Payload | When |
|-------|---------|------|
| `chunk` | `{ "text": "<partial string>" }` | Each text token from the CLI |
| `done` | `{ "message": "done" }` | CLI exits cleanly (code 0) |
| `error` | `{ "message": "<description>" }` | Spawn failure or non-zero exit |

**Error responses (before SSE headers are sent):**
- `HTTP 400` — `prompt` is missing, not a string, or empty

---

## 6. Inter-Service Communication

This service is a **downstream dependency** — it does not call any other service in this project. It only receives calls.

The App Server (`server/`) calls this service:
- **Initiator:** App Server
- **Transport:** HTTP POST to `http://localhost:3002/invoke` (or `CLAUDE_WRAPPER_URL`)
- **Request:** JSON body with `{ prompt }` (no `model` override is sent by the current App Server code)
- **Response:** SSE stream that the App Server reads and relays to the browser

---

## 7. Error Handling & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `prompt` missing or empty | HTTP 400 JSON error returned before SSE headers are set |
| `claude` binary not found or not on PATH | `spawn` throws synchronously → caught in try/catch → `onError` called → `event: error` sent → connection closed |
| CLI writes to stderr | Chunks collected silently; only surfaced as the error message if exit code is non-zero |
| CLI exits non-zero | `onError` called with joined stderr (or a generic "exited with code N" message if stderr is empty) |
| Client disconnects mid-stream | `res.on("close")` sets `finished = true`; subsequent `onChunk`/`onDone`/`onError` calls attempt `res.write` on a closed socket (Node silently drops these). No process kill is issued — the CLI runs to completion. |
| Malformed JSONL line from CLI | Caught in a try/catch; silently ignored, does not break the stream |
| Incomplete last line in buffer on close | Flushed and processed before the close handler calls `onDone`/`onError` |
| Multiple `finish()` calls | Guarded by the `finished` boolean — `res.end()` is called exactly once |

**No retry logic exists.** A failed invocation emits a single `event: error` and closes.

---

## 8. Key Assumptions & Constraints

- **`claude` CLI must be on PATH.** There is no fallback if the binary is missing.
- **Authentication is ambient.** The CLI uses the user's existing Anthropic login. This service does not manage or inject credentials.
- **One request, one process.** Each `POST /invoke` spawns a new `claude` subprocess. There is no pooling, queuing, or concurrency control.
- **No CORS middleware.** This service is intended to be called by the App Server (server-to-server), not directly by a browser.
- **`--output-format stream-json` requires `--verbose`.** Removing `--verbose` from the spawn args will cause the CLI to emit no stdout and exit with an error.
- **Only `type: "assistant"` events carry text.** All other JSONL event types from the CLI (`system`, `rate_limit_event`, `result`, etc.) are intentionally ignored by `extractText()`. If the CLI output format changes, this function is the only place that needs updating.
- **`res.on("close")` vs `req.on("close")`.** Using `req.on("close")` causes premature connection termination with some HTTP clients (notably Postman) because it fires as soon as the request body is fully received. The current code correctly uses `res.on("close")`.
