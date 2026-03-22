import { useState } from "react";
import TeamPanel from "./components/TeamPanel.jsx";
import TradeSummary from "./components/TradeSummary.jsx";
import TradeAnalysis from "./components/TradeAnalysis.jsx";

const emptyTeam = () => ({ id: null, name: "", sending: [] });

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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

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

      setIsStreaming(false);
      setIsDone(true);
    } catch (err) {
      setErrorMsg(err.message);
      setIsStreaming(false);
    }
  }

  const canAnalyze =
    teamA.sending.length > 0 && teamB.sending.length > 0 && !isStreaming;

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.logo}>NBA TRADE ANALYZER</h1>
          <div style={styles.headerRight}>
            <button
              style={{
                ...styles.analyzeBtn,
                ...(canAnalyze ? {} : styles.analyzeBtnDisabled),
              }}
              onClick={handleAnalyze}
              disabled={!canAnalyze}
            >
              {isStreaming ? "ANALYZING..." : "ANALYZE TRADE"}
            </button>
          </div>
        </div>
      </header>

      {/* Trade panels */}
      <main style={styles.main}>
        <div style={styles.tradeArea}>
          <TeamPanel
            label="TEAM 1"
            team={teamA}
            onTeamChange={(t) => handleTeamChange("A", t)}
            onTogglePlayer={(p) => handleTogglePlayer("A", p)}
          />

          {/* Center divider with trade arrows */}
          <div style={styles.divider}>
            <div style={styles.arrowIcon}>⇄</div>
          </div>

          <TeamPanel
            label="TEAM 2"
            team={teamB}
            onTeamChange={(t) => handleTeamChange("B", t)}
            onTogglePlayer={(p) => handleTogglePlayer("B", p)}
          />
        </div>

        {/* Trade summary */}
        <TradeSummary teamA={teamA} teamB={teamB} />

        {/* Analysis output */}
        <TradeAnalysis
          text={analysisText}
          status={statusMsg}
          error={errorMsg}
          isStreaming={isStreaming}
          isDone={isDone}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg)",
  },
  header: {
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: 1440,
    margin: "0 auto",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    letterSpacing: 3,
    color: "var(--text-heading)",
    margin: 0,
    lineHeight: 1,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  analyzeBtn: {
    background: "var(--accent)",
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    letterSpacing: 2,
    padding: "8px 28px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--accent-border)",
    transition: "opacity 0.2s",
  },
  analyzeBtnDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  main: {
    flex: 1,
    maxWidth: 1440,
    width: "100%",
    margin: "0 auto",
    padding: "16px 24px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  tradeArea: {
    display: "flex",
    gap: 0,
    alignItems: "stretch",
  },
  divider: {
    width: 48,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowIcon: {
    fontSize: 22,
    color: "var(--accent)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "50%",
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
