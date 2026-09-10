# claude-wrapper

A minimal, generic HTTP microservice that wraps the `claude` CLI and streams its output as Server-Sent Events (SSE). No NBA logic — fully reusable across projects.

## Prerequisites

- Node.js 18+
- The [`claude` CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`claude --version` should work)

## Install

```bash
cd claude-wrapper
npm install
```

## Run

```bash
npm start
# or with a custom port:
PORT=4000 npm start
```

The server starts on **http://localhost:3002** by default.

## API

### `POST /invoke`

**Request body** (JSON):

```json
{ "prompt": "Explain the NBA salary cap in one sentence." }
```

**Response**: `text/event-stream` (SSE)

| Event   | Payload                        | When                              |
|---------|--------------------------------|-----------------------------------|
| `chunk` | `{ "text": "<partial text>" }` | For each stdout chunk from Claude |
| `done`  | `{ "message": "done" }`        | CLI exits with code 0             |
| `error` | `{ "message": "<description>"}` | Spawn failure or non-zero exit   |

## Example (curl)

```bash
curl -N -X POST http://localhost:3002/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Say hello in 5 words."}'
```

Expected output:

```
event: chunk
data: {"text":"Hello there, how are you?"}

event: done
data: {"message":"done"}
```

## Files

```
claude-wrapper/
├── index.js      # Express server + SSE logic
├── runner.js     # claude CLI spawn logic
├── package.json
└── README.md
```
