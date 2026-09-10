// ---------------------------------------------------------------------------
// index.js — App Server (port 3001)
// Bridges the React frontend, balldontlie API, and Claude CLI wrapper.
// ---------------------------------------------------------------------------

import express from "express";
import cors from "cors";
import { getSeasonAverages, hoopsHypeSeason } from "./nba.js";
import { buildTradePrompt } from "./prompt.js";
import { connectDB } from "./db.js";
import { getAllTeams, getPlayersByTeamId, getTeamWithPlayers } from "./repository.js";
import { handleSync } from "./sync.js";
import { computeCapPosition, capStatusLabel } from "./capCalculator.js";
import { evaluateTradeLegality } from "./tradeLegality.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const CLAUDE_WRAPPER_URL =
  process.env.CLAUDE_WRAPPER_URL ?? "http://localhost:3002";

app.use(cors());
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────────

function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/test — health check
app.get("/api/test", (_req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

// GET /api/teams — all 30 NBA teams
app.get("/api/teams", async (_req, res) => {
  try {
    const teams = await getAllTeams();
    res.json({ data: teams });
  } catch (err) {
    console.error("GET /api/teams error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/teams/:id/players — active roster with salaries
app.get("/api/teams/:id/players", async (req, res) => {
  try {
    const players = await getPlayersByTeamId(Number(req.params.id));
    res.json({ data: players });
  } catch (err) {
    console.error(`GET /api/teams/${req.params.id}/players error:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/teams/:id/cap — cap position for a team
app.get("/api/teams/:id/cap", async (req, res) => {
  try {
    const team = await getTeamWithPlayers(Number(req.params.id));
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const seasonYear = hoopsHypeSeason();
    const capPosition = computeCapPosition(team.players, seasonYear);

    res.json({
      data: {
        teamId: team.bdl_id,
        teamName: team.full_name,
        season: seasonYear,
        ...capPosition,
        capStatusLabel: capStatusLabel(capPosition.capStatus),
      },
    });
  } catch (err) {
    console.error(`GET /api/teams/${req.params.id}/cap error:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sync — sync all teams from balldontlie + HoopsHype into MongoDB
app.post("/api/sync", handleSync);

// POST /api/trade/evaluate — evaluate trade legality without AI analysis
app.post("/api/trade/evaluate", async (req, res) => {
  const { teamA, teamB } = req.body ?? {};

  if (!teamA?.sending?.length || !teamB?.sending?.length) {
    return res
      .status(400)
      .json({ error: "Both teamA and teamB must include a non-empty sending array." });
  }

  try {
    const legality = await evaluateTradeLegality({ teamA, teamB });
    res.json({ data: legality });
  } catch (err) {
    console.error("POST /api/trade/evaluate error:", err.message);
    if (err.code === "TEAM_NOT_FOUND") {
      return res.status(404).json({ error: err.message });
    }
    res.status(502).json({ error: err.message });
  }
});

// POST /api/analyze — build prompt, call Claude wrapper, relay SSE stream
app.post("/api/analyze", async (req, res) => {
  const { teamA, teamB } = req.body ?? {};

  if (!teamA?.sending?.length || !teamB?.sending?.length) {
    return res
      .status(400)
      .json({ error: "Both teamA and teamB must include a non-empty sending array." });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      res.end();
    }
  };
  res.on("close", () => {
    finished = true;
  });

  try {
    // 0. Evaluate trade legality (CBA salary matching)
    sseEvent(res, "status", { message: "Evaluating trade legality..." });
    let legality = null;
    try {
      legality = await evaluateTradeLegality({ teamA, teamB });
      sseEvent(res, "legality", legality);
    } catch (err) {
      // Non-fatal: legality check failure shouldn't block AI analysis
      console.warn("Trade legality evaluation failed:", err.message);
      sseEvent(res, "legality_error", { message: err.message });
    }

    // 1. Fetch season averages for all traded players
    sseEvent(res, "status", { message: "Fetching player stats..." });

    const allPlayers = [...teamA.sending, ...teamB.sending];
    const playerIds = allPlayers.map((p) => p.id);
    const statsMap = await getSeasonAverages(playerIds);

    // Attach stats to each player
    const enrich = (player) => ({
      ...player,
      stats: statsMap.get(player.id) ?? null,
    });

    const enrichedTrade = {
      teamA: { ...teamA, sending: teamA.sending.map(enrich) },
      teamB: { ...teamB, sending: teamB.sending.map(enrich) },
    };

    // 2. Build the prompt (include legality data if available)
    const prompt = buildTradePrompt(enrichedTrade, legality);

    // 3. Forward to Claude wrapper
    sseEvent(res, "status", { message: "Analyzing trade with Claude Code..." });

    const wrapperRes = await fetch(`${CLAUDE_WRAPPER_URL}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!wrapperRes.ok) {
      const text = await wrapperRes.text();
      sseEvent(res, "error", { message: `Claude wrapper error: ${text}` });
      finish();
      return;
    }

    // 4. Relay the SSE stream from the wrapper to the browser
    const reader = wrapperRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (finished) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop(); // keep incomplete trailing part

      for (const part of parts) {
        if (finished) break;

        const event = parseSSE(part);
        if (!event) continue;

        if (event.type === "chunk") {
          sseEvent(res, "chunk", event.data);
        } else if (event.type === "done") {
          sseEvent(res, "done", { message: "Analysis complete" });
          finish();
          return;
        } else if (event.type === "error") {
          sseEvent(res, "error", event.data);
          finish();
          return;
        }
      }
    }

    // If we exit the loop without a done/error event, close gracefully
    if (!finished) {
      sseEvent(res, "done", { message: "Analysis complete" });
      finish();
    }
  } catch (err) {
    console.error("POST /api/analyze error:", err.message);
    if (!finished) {
      sseEvent(res, "error", { message: err.message });
      finish();
    }
  }
});

// ── SSE Parser ───────────────────────────────────────────────────────────────

/** Parse a single SSE message block (lines between double newlines). */
function parseSSE(block) {
  let type = "message";
  let dataLines = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      type = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) return null;

  try {
    return { type, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return { type, data: { text: dataLines.join("\n") } };
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`nba-trade-analyzer server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
