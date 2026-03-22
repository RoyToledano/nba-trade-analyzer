import { useState } from "react";
import TeamPanel from "./components/TeamPanel.jsx";
import TradeSummary from "./components/TradeSummary.jsx";
import TradeAnalysis from "./components/TradeAnalysis.jsx";

const emptyTeam = () => ({ id: null, name: "", sending: [] });

// Parse a single SSE message block (text between \n\n separators)
function parseSSEBlock(block) {
  let type = "message";
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { type, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return { type, data: { text: dataLines.join("\n") } };
  }
}

export default function App() {
  const [teamA, setTeamA] = useState(emptyTeam());
  const [teamB, setTeamB] = useState(emptyTeam());

  const [analysisText, setAnalysisText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);

  function handleTeamChange(side, selected) {
    const updater = selected
      ? { id: selected.id, name: selected.full_name, sending: [] }
      : emptyTeam();
    if (side === "A") setTeamA(updater);
    else setTeamB(updater);
  }

  function handleTogglePlayer(side, player) {
    const setter = side === "A" ? setTeamA : setTeamB;
    setter((prev) => {
      const already = prev.sending.some((p) => p.id === player.id);
      return {
        ...prev,
        sending: already
          ? prev.sending.filter((p) => p.id !== player.id)
          : [...prev.sending, player],
      };
    });
  }

  async function handleAnalyze() {
    // Reset analysis state
    setAnalysisText("");
    setStatusMsg("");
    setErrorMsg("");
    setIsStreaming(true);
    setIsDone(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamA, teamB }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Server error ${res.status}`);
      }

      // Consume the SSE stream manually via ReadableStream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // keep the incomplete trailing part

        for (const part of parts) {
          const event = parseSSEBlock(part);
          if (!event) continue;

          if (event.type === "status") {
            setStatusMsg(event.data.message ?? "");
          } else if (event.type === "chunk") {
            setStatusMsg("");
            setAnalysisText((prev) => prev + (event.data.text ?? ""));
          } else if (event.type === "done") {
            setIsStreaming(false);
            setIsDone(true);
            return;
          } else if (event.type === "error") {
            throw new Error(event.data.message ?? "Unknown error");
          }
        }
      }

      // Stream ended without a done event — treat as complete
      setIsStreaming(false);
      setIsDone(true);
    } catch (err) {
      setErrorMsg(err.message);
      setIsStreaming(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.logo}>NBA Trade Analyzer</h1>
          <p style={styles.tagline}>
            Build a trade. Get instant AI analysis.
          </p>
        </div>
      </header>

      {/* Main content */}
      <main style={styles.main}>
        {/* Team panels */}
        <div style={styles.panels}>
          <TeamPanel
            label="TEAM A"
            team={teamA}
            onTeamChange={(t) => handleTeamChange("A", t)}
            onTogglePlayer={(p) => handleTogglePlayer("A", p)}
          />
          <TeamPanel
            label="TEAM B"
            team={teamB}
            onTeamChange={(t) => handleTeamChange("B", t)}
            onTogglePlayer={(p) => handleTogglePlayer("B", p)}
          />
        </div>

        {/* Trade summary + analyze button */}
        <TradeSummary
          teamA={teamA}
          teamB={teamB}
          onAnalyze={handleAnalyze}
          isAnalyzing={isStreaming}
        />

        {/* Streaming analysis */}
        <TradeAnalysis
          text={analysisText}
          status={statusMsg}
          error={errorMsg}
          isStreaming={isStreaming}
          isDone={isDone}
        />
      </main>

      <footer style={styles.footer}>
        NBA Trade Analyzer · AI-Powered Trade Analysis
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    borderBottom: "1px solid var(--border)",
    padding: "20px 0",
  },
  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 24px",
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 36,
    letterSpacing: 2,
    color: "var(--text-heading)",
    margin: 0,
    lineHeight: 1,
  },
  tagline: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 6,
  },
  main: {
    flex: 1,
    maxWidth: 1200,
    width: "100%",
    margin: "0 auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  panels: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
  },
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "16px 24px",
    textAlign: "center",
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  },
};
