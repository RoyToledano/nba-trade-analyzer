const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function TradeSummary({ teamA, teamB }) {
  const hasAnything = teamA.sending.length > 0 || teamB.sending.length > 0;
  if (!hasAnything) return null;

  const totalA = teamA.sending.reduce((s, p) => s + (p.salary ?? 0), 0);
  const totalB = teamB.sending.reduce((s, p) => s + (p.salary ?? 0), 0);

  return (
    <div style={styles.wrapper}>
      <div style={styles.columns}>
        {/* Team A outgoing */}
        <SummarySide
          teamName={teamA.name || "Team 1"}
          players={teamA.sending}
          receives={teamB.sending}
          totalOut={totalA}
          totalIn={totalB}
        />

        {/* Divider */}
        <div style={styles.center}>
          <div style={styles.vsCircle}>VS</div>
          <div style={styles.salaryDiff}>
            {totalA !== totalB && (
              <span style={styles.diffText}>
                {fmt.format(Math.abs(totalA - totalB))} difference
              </span>
            )}
          </div>
        </div>

        {/* Team B outgoing */}
        <SummarySide
          teamName={teamB.name || "Team 2"}
          players={teamB.sending}
          receives={teamA.sending}
          totalOut={totalB}
          totalIn={totalA}
        />
      </div>
    </div>
  );
}

function SummarySide({ teamName, players, receives, totalOut, totalIn }) {
  return (
    <div style={styles.side}>
      <div style={styles.sideHeader}>
        <span style={styles.sideTeam}>{teamName}</span>
      </div>

      {/* Sending */}
      <div style={styles.section}>
        <span style={styles.sectionLabel}>SENDS</span>
        {players.length === 0 ? (
          <span style={styles.noPlayers}>—</span>
        ) : (
          players.map((p) => (
            <div key={p.id} style={styles.summaryRow}>
              <span style={styles.summaryName}>
                {p.first_name} {p.last_name}
              </span>
              <span style={styles.summarySalary}>
                {p.salary != null ? fmt.format(p.salary) : "—"}
              </span>
            </div>
          ))
        )}
        {players.length > 0 && (
          <div style={styles.totalRow}>
            <span style={styles.totalLabel}>TOTAL OUT</span>
            <span style={styles.totalValue}>{fmt.format(totalOut)}</span>
          </div>
        )}
      </div>

      {/* Receiving */}
      <div style={styles.section}>
        <span style={{ ...styles.sectionLabel, color: "var(--green)" }}>RECEIVES</span>
        {receives.length === 0 ? (
          <span style={styles.noPlayers}>—</span>
        ) : (
          receives.map((p) => (
            <div key={p.id} style={styles.summaryRow}>
              <span style={styles.summaryName}>
                {p.first_name} {p.last_name}
              </span>
              <span style={styles.summarySalary}>
                {p.salary != null ? fmt.format(p.salary) : "—"}
              </span>
            </div>
          ))
        )}
        {receives.length > 0 && (
          <div style={styles.totalRow}>
            <span style={styles.totalLabel}>TOTAL IN</span>
            <span style={{ ...styles.totalValue, color: "var(--green)" }}>
              {fmt.format(totalIn)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "16px",
  },
  columns: {
    display: "flex",
    gap: 0,
  },
  side: {
    flex: 1,
    minWidth: 0,
  },
  sideHeader: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: "1px solid var(--border)",
  },
  sideTeam: {
    fontFamily: "var(--font-display)",
    fontSize: 16,
    letterSpacing: 1.5,
    color: "var(--text-heading)",
  },
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: "var(--font-display)",
    fontSize: 10,
    letterSpacing: 2,
    color: "var(--accent)",
    display: "block",
    marginBottom: 6,
  },
  noPlayers: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "3px 0",
  },
  summaryName: {
    fontSize: 12,
    color: "var(--text)",
    fontWeight: 500,
  },
  summarySalary: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-muted)",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1px solid var(--border-light)",
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    color: "var(--text-muted)",
  },
  totalValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
  },
  center: {
    width: 80,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 8px",
  },
  vsCircle: {
    fontFamily: "var(--font-display)",
    fontSize: 14,
    letterSpacing: 2,
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: "50%",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  salaryDiff: {
    textAlign: "center",
  },
  diffText: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  },
};
