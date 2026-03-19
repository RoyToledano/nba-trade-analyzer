import express from "express";
import { runClaude } from "./runner.js";

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());

// Helper: write a named SSE event with a JSON payload
function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.post("/invoke", (req, res) => {
  const { prompt, model } = req.body ?? {};
  console.log("Received prompt:", prompt);

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ error: "Request body must include a non-empty 'prompt' string." });
  }

  // Set SSE headers
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

  runClaude(prompt.trim(), {
    onChunk(text) {
      console.log("Claude chunk:", text);
      sseEvent(res, "chunk", { text });
    },
    onDone() {
      sseEvent(res, "done", { message: "done" });
      finish();
    },
    onError(message) {
      sseEvent(res, "error", { message });
      finish();
    },
  }, { model });

  // Clean up if the *client* disconnects (e.g. browser tab closed).
  // Listen on res "close" — req "close" fires too early with some clients.
  res.on("close", () => {
    finished = true;
  });
});

app.listen(PORT, () => {
  console.log(`claude-wrapper listening on http://localhost:${PORT}`);
});
