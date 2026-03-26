// ---------------------------------------------------------------------------
// index.js — App Server (port 3001)
// Bridges the React frontend, balldontlie API, and Claude CLI wrapper.
// ---------------------------------------------------------------------------

import express from "express";
import cors from "cors";
import { getSeasonAverages } from "./nba.js";
import { buildTradePrompt } from "./prompt.js";
import { connectDB } from "./db.js";
import { getAllTeams, getPlayersByTeamId } from "./repository.js";
import { handleSync } from "./sync.js";

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

// POST /api/sync — sync all teams from balldontlie + HoopsHype into MongoDB
app.post("/api/sync", handleSync);

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

    // 2. Build the prompt
    const prompt = buildTradePrompt(enrichedTrade);

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
