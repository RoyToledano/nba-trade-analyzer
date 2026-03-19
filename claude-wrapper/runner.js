import { spawn } from "child_process";

/**
 * Spawns `claude -p "<prompt>" --output-format stream-json --verbose` and
 * streams text tokens via callbacks as they are generated.
 *
 * @param {string} prompt - The prompt to pass to the Claude CLI.
 * @param {object} handlers
 * @param {(text: string) => void} handlers.onChunk  - Called for each text token.
 * @param {() => void}             handlers.onDone   - Called on clean exit (code 0).
 * @param {(msg: string) => void}  handlers.onError  - Called on spawn failure or non-zero exit.
 */
export function runClaude(prompt, { onChunk, onDone, onError }) {
  let proc;

  try {
    proc = spawn("claude", ["-p", prompt, "--output-format", "stream-json", "--verbose"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    onError(`Failed to spawn claude CLI: ${err.message}`);
    return;
  }

  const stderrChunks = [];
  let lineBuffer = "";

  proc.stdout.on("data", (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    lineBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        const text = extractText(parsed);
        if (text) onChunk(text);
      } catch {
        // Not valid JSON — ignore
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  proc.on("error", (err) => {
    onError(`Failed to spawn claude CLI: ${err.message}`);
  });

  proc.on("close", (code) => {
    // Flush any remaining buffered line
    if (lineBuffer.trim()) {
      try {
        const parsed = JSON.parse(lineBuffer.trim());
        const text = extractText(parsed);
        if (text) onChunk(text);
      } catch {
        // ignore
      }
    }

    if (code === 0) {
      onDone();
    } else {
      const detail = stderrChunks.join("").trim() || `claude CLI exited with code ${code}`;
      onError(detail);
    }
  });
}

/**
 * Extracts text from a stream-json JSONL line.
 *
 * Observed format from `claude -p --output-format stream-json --verbose`:
 *
 *   { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
 *   { type: "result", result: "..." }
 *
 * We extract from "assistant" messages (content blocks) and ignore "result"
 * to avoid duplicating the text.
 */
function extractText(obj) {
  if (obj?.type === "assistant" && obj?.message?.content) {
    return obj.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("") || null;
  }
  return null;
}
