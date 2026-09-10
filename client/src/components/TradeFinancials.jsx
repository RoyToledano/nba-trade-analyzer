// TradeFinancials.jsx — Per-team CBA financial breakdown
// Rendered inside TradeAnalysis when legality data is available.
// Fully defensive: returns null if legality is missing or incomplete.

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtSpace(value) {
  if (value == null) return "—";
  const abs = fmt.format(Math.abs(value));
  return value >= 0 ? `+${abs}` : `-${abs}`;
}

// Cap status → color mapping
const CAP_STATUS_COLORS = {
  "under-cap":    { color: "var(--text-muted)",   label: "Under the cap" },
  "over-cap":     { color: "var(--text)",          label: "Over the cap" },
  "taxpayer":     { color: "var(--yellow)",         label: "Luxury tax payer" },
  "first-apron":  { color: "var(--orange)",         label: "1st apron (hard-capped)" },
  "second-apron": { color: "var(--red)",            label: "2nd apron (hard-capped)" },
};

function capColor(status) {
  return CAP_STATUS_COLORS[status]?.color ?? "var(--text-muted)";
}
function capLabel(status) {
  return CAP_STATUS_COLORS[status]?.label ?? status ?? "—";
}

function FinRow({ label, value, valueStyle }) {
  return (
    <div style={styles.finRow}>
      <span style={styles.finLabel}>{label}</span>
      <span style={{ ...styles.finValue, ...valueStyle }}>{value}</span>
    </div>
  );
}

function TeamFinancials({ side }) {
  if (!side) return null;

  const { teamName, valid, preTrade, tradeFinancials: f, postTrade, rosterCompliance } = side;
  if (!preTrade || !f || !postTrade) return null;

  const capDiffColor = valid ? "var(--green)" : "var(--red)";
  const capDiffText = valid
    ? `Under by ${fmt.format(f.capDifference)}`
    : `Over by ${fmt.format(f.incomingCap - f.allowableIncoming)}`;

  return (
    <div style={styles.teamBlock}>
      {/* Team name + validity chip */}
      <div style={styles.teamHeader}>
        <span style={styles.teamName}>{teamName}</span>
        <span style={{
          ...styles.validityChip,
          color: valid ? "var(--green)" : "var(--red)",
          background: valid ? "var(--green-dim)" : "var(--red-dim)",
          border: `1px solid ${valid ? "var(--green-border)" : "var(--red-border)"}`,
        }}>
          {valid ? "✓ PASS" : "✗ FAIL"}
        </span>
      </div>

      {/* Pre-trade status */}
      <div style={styles.statusLine}>
        <span style={styles.statusLineLabel}>Currently</span>
        <span style={{ ...styles.statusValue, color: capColor(preTrade.capStatus) }}>
          {capLabel(preTrade.capStatus)}
        </span>
      </div>

      {/* Salary matching table */}
      <div style={styles.finTable}>
        <FinRow label="Outgoing Cap" value={fmt.format(f.outgoingCap)} />
        <FinRow label="Allowable Incoming" value={fmt.format(f.allowableIncoming)} />
        <FinRow
          label="Formula"
          value={f.formula}
          valueStyle={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
        />
        <FinRow label="Incoming Cap" value={fmt.format(f.incomingCap)} />
        <FinRow
          label="Cap Difference"
          value={capDiffText}
          valueStyle={{ color: capDiffColor, fontWeight: 600 }}
        />
      </div>

      {/* Post-trade status */}
      <div style={styles.postTradeBlock}>
        <span style={styles.postTradeLabel}>After trade</span>
        <span style={{ color: capColor(postTrade.capStatus), fontWeight: 500, fontSize: 12 }}>
          {capLabel(postTrade.capStatus)}
        </span>
        <span style={styles.postTradeSalary}>{fmt.format(postTrade.totalSalary)} total</span>
      </div>

      {/* Space to thresholds */}
      <div style={styles.spaceGrid}>
        <SpaceCell label="Tax space" value={postTrade.taxSpace} />
        <SpaceCell label="1st apron" value={postTrade.firstApronSpace} />
        <SpaceCell label="2nd apron" value={postTrade.secondApronSpace} />
      </div>

      {/* Roster compliance */}
      {rosterCompliance?.mustWaive > 0 && (
        <div style={styles.rosterNote}>
          ⚠ Must waive {rosterCompliance.mustWaive} player(s) before processing
        </div>
      )}
    </div>
  );
}

function SpaceCell({ label, value }) {
  const color = value == null
    ? "var(--text-muted)"
    : value >= 0 ? "var(--green)" : "var(--red)";
  return (
    <div style={styles.spaceCell}>
      <span style={styles.spaceCellLabel}>{label}</span>
      <span style={{ ...styles.spaceCellValue, color }}>{fmtSpace(value)}</span>
    </div>
  );
}

export default function TradeFinancials({ legality }) {
  if (!legality) return null;
  if (!legality.teamA || !legality.teamB) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>FINANCIAL DETAILS</span>
        <span style={styles.seasonBadge}>
          {legality.season
            ? `${legality.season - 1}–${String(legality.season).slice(2)} CBA`
            : "CBA Rules"}
        </span>
      </div>

      <div style={styles.columns}>
        <TeamFinancials side={legality.teamA} />
        <div style={styles.columnDivider} />
        <TeamFinancials side={legality.teamB} />
      </div>

      {/* Global warnings (e.g. null-salary players) */}
      {legality.warnings?.filter(w =>
        // Roster warnings are shown per-team already; show only global ones here
        !w.includes("must waive") && !w.includes("exceeds allowable")
      ).map((w) => (
        <div key={w} style={styles.infoWarning}>{w}</div>
      ))}
    </div>
  );
}

const styles = {
  wrapper: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "16px",
    marginBottom: 4,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: "1px solid var(--border)",
  },
  sectionTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 14,
    letterSpacing: 2,
    color: "var(--text-heading)",
  },
  seasonBadge: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "2px 8px",
  },
  columns: {
    display: "flex",
    gap: 0,
    alignItems: "flex-start",
  },
  columnDivider: {
    width: 1,
    alignSelf: "stretch",
    background: "var(--border)",
    margin: "0 16px",
    flexShrink: 0,
  },
  teamBlock: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  teamHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  teamName: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    letterSpacing: 1,
    color: "var(--text-heading)",
  },
  validityChip: {
    fontFamily: "var(--font-display)",
    fontSize: 10,
    letterSpacing: 1.5,
    padding: "2px 8px",
    borderRadius: "var(--radius)",
  },
  statusLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
  },
  statusLineLabel: {
    color: "var(--text-muted)",
  },
  statusValue: {
    fontWeight: 600,
    fontSize: 11,
  },
  finTable: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    background: "var(--bg-surface)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
  },
  finRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  finLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  finValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text)",
    textAlign: "right",
  },
  postTradeBlock: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  postTradeLabel: {
    fontSize: 10,
    color: "var(--text-muted)",
    letterSpacing: 0.5,
  },
  postTradeSalary: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-muted)",
    marginLeft: "auto",
  },
  spaceGrid: {
    display: "flex",
    gap: 6,
  },
  spaceCell: {
    flex: 1,
    background: "var(--bg-surface)",
    borderRadius: "var(--radius)",
    padding: "6px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "center",
  },
  spaceCellLabel: {
    fontSize: 9,
    color: "var(--text-muted)",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  spaceCellValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 600,
  },
  rosterNote: {
    fontSize: 11,
    color: "var(--yellow)",
    background: "var(--yellow-dim)",
    border: "1px solid var(--yellow-border)",
    borderRadius: "var(--radius)",
    padding: "6px 10px",
  },
  infoWarning: {
    marginTop: 8,
    fontSize: 11,
    color: "var(--blue)",
    background: "var(--blue-dim)",
    border: "1px solid var(--blue-border)",
    borderRadius: "var(--radius)",
    padding: "6px 10px",
  },
};
