Trigger a full NBA data sync and monitor progress.

Run the following curl command against the App Server (must be running on port 3001):

```bash
curl -N -H "Accept: text/event-stream" -X POST http://localhost:3001/api/sync
```

`-N` disables buffering so SSE events stream in real time.

## What it does

1. Fetches all 30 teams from balldontlie
2. For each team: fetches all historical players (paginated) + scrapes current salaries from HoopsHype
3. Cross-references the two datasets and upserts the result into MongoDB

## Expected SSE events

```
event: started      — "Fetching teams list..."
event: progress     — "Found 30 teams"
event: team_started — per team (with index/total)
event: team_done    — per team (with player count)
event: done         — summary: { synced, errors, syncedAt }
event: team_error   — if a single team fails (sync continues)
event: error        — if the sync fails fatally before completing
```

## Rate limiting

balldontlie is capped at 5 requests/minute on the free tier. The sync processes teams sequentially through a `RateLimitedQueue` and backs off exponentially on 429s (12s base, up to 3 retries). Expect 30–60 minutes for a full sync of all 30 teams.

## Notes

- If a sync is already running, the endpoint returns `409 Conflict`.
- Salary data uses HoopsHype's in-memory cache (30-min TTL). To force a fresh scrape, restart the server before running the sync.
- The App Server must be running (`/dev`) before triggering a sync.
