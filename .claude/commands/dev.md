Start the NBA Trade Analyzer development stack.

The project requires three services running in separate terminals:

## Service 1 — Claude Wrapper (port 3002)

```bash
cd claude-wrapper && npm install && node index.js
```

Prerequisite: `claude` CLI must be installed and authenticated (`claude login`).

## Service 2 — App Server (port 3001)

```bash
cd server && npm install && node --env-file=.env index.js
```

Requires `server/.env` with:
```
BALLDONTLIE_API_KEY=your_key_here
MONGODB_URI=mongodb+srv://...
```

The server connects to MongoDB on startup — it will crash if `MONGODB_URI` is not set.

## Service 3 — React Client (port 3000)

```bash
cd client && npm install && npm run dev
```

Open http://localhost:3000. The Vite proxy forwards `/api/*` → `:3001`.

## Startup Order

Start services in order: wrapper → server → client.

## First Run

After starting all services, the DB is empty. Run `/sync` to populate team and player data before using the app.
