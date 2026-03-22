export default function TradeSummary({ teamA, teamB, onAnalyze, isAnalyzing }) {
  const canAnalyze =
    teamA.sending.length > 0 &&
    teamB.sending.length > 0 &&
    !isAnalyzing;

  const hasAnything = teamA.id || teamB.id;
  if (!hasAnything) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.columns}>
        {/* Team A side */}
        <div style={styles.side}>
          <div style={styles.sideLabel}>
            {teamA.name ? (
              <span style={styles.teamName}>{teamA.name}</span>
            ) : (
              <span style={styles.placeholder}>Team A</span>
            )}
            <span style={styles.arrow}>→</span>
          </div>
          <div style={styles.pills}>
            {teamA.sending.length === 0 ? (
              <span style={styles.none}>No players selected</span>
            ) : (
              teamA.sending.map((p) => (
                <span key={p.id} style={styles.pillOut}>
                  {p.first_name} {p.last_name}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Analyze button */}
        <button
          style={{ ...styles.btn, ...(canAnalyze ? styles.btnActive : styles.btnDisabled) }}
          onClick={onAnalyze}
          disabled={!canAnalyze}
        >
          {isAnalyzing ? "Analyzing…" : "Analyze Trade"}
        </button>

        {/* Team B side */}
        <div style={{ ...styles.side, alignItems: "flex-end" }}>
          <div style={{ ...styles.sideLabel, flexDirection: "row-reverse" }}>
            {teamB.name ? (
              <span style={styles.teamName}>{teamB.name}</span>
            ) : (
              <span style={styles.placeholder}>Team B</span>
            )}
            <span style={{ ...styles.arrow, transform: "scaleX(-1)" }}>→</span>
          </div>
          <div style={{ ...styles.pills, justifyContent: "flex-end" }}>
            {teamB.sending.length === 0 ? (
              <span style={styles.none}>No players selected</span>
            ) : (
              teamB.sending.map((p) => (
                <span key={p.id} style={styles.pillOut}>
                  {p.first_name} {p.last_name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "16px 20px",
  },
  columns: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  side: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sideLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  teamName: {
    fontFamily: "var(--font-display)",
    fontSize: 16,
    color: "var(--text-heading)",
    letterSpacing: 0.5,
  },
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  arrow: {
    fontSize: 16,
    color: "var(--accent)",
    display: "inline-block",
  },
  pills: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  pillOut: {
    fontSize: 11,
    fontWeight: 500,
    padding: "3px 9px",
    borderRadius: 99,
    background: "var(--red-dim)",
    border: "1px solid var(--red-border)",
    color: "var(--red)",
    whiteSpace: "nowrap",
  },
  none: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  },
  btn: {
    flexShrink: 0,
    padding: "10px 24px",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-display)",
    fontSize: 16,
    letterSpacing: 1,
    transition: "background 0.15s, opacity 0.15s",
  },
  btnActive: {
    background: "var(--accent)",
    color: "#fff",
  },
  btnDisabled: {
    background: "var(--border)",
    color: "var(--text-muted)",
    cursor: "not-allowed",
  },
};
