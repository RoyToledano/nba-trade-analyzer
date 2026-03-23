import { useTeams, usePlayers } from "../hooks.js";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function TeamPanel({ label, team, onTeamChange, onTogglePlayer }) {
  const { teams, loading: teamsLoading } = useTeams();
  const { players, loading: playersLoading, error: playersError } = usePlayers(team.id);

  function handleTeamSelect(e) {
    const id = Number(e.target.value);
    const selected = teams.find((t) => t.id === id) ?? null;
    onTeamChange(selected);
  }

  const sendingIds = new Set(team.sending.map((p) => p.id));

  return (
    <div style={styles.panel}>
      {/* Team selector */}
      <div style={styles.selectorArea}>
        <span style={styles.label}>{label}</span>
        <select
          style={styles.select}
          value={team.id ?? ""}
          onChange={handleTeamSelect}
          disabled={teamsLoading}
        >
          <option value="">Select a team...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Outgoing zone */}
      {team.id && (
        <div style={styles.outgoingZone}>
          <span style={styles.zoneLabel}>TRADING AWAY</span>
          <div style={styles.outgoingList}>
            {team.sending.length === 0 ? (
              <span style={styles.zonePlaceholder}>
                Select players below to trade
              </span>
            ) : (
              team.sending.map((p) => (
                <div
                  key={p.id}
                  style={styles.outgoingChip}
                  onClick={() => onTogglePlayer(p)}
                >
                  <span style={styles.chipName}>
                    {p.first_name} {p.last_name}
                  </span>
                  <span style={styles.chipSalary}>
                    {p.salary != null ? fmt.format(p.salary) : ""}
                  </span>
                  <span style={styles.chipRemove}>×</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Roster list */}
      <div style={styles.roster}>
        {!team.id && (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon}>🏀</span>
            <span style={styles.emptyText}>Select a team to view roster</span>
          </div>
        )}

        {playersLoading && (
          <div style={styles.emptyState}>
            <span style={styles.emptyText}>Loading roster...</span>
          </div>
        )}

        {playersError && (
          <p style={styles.errorMsg}>{playersError}</p>
        )}

        {!playersLoading && !playersError && team.id && (
          <div style={styles.rosterHeader}>
            <span style={styles.rosterHeaderCell}>PLAYER</span>
            <span style={{ ...styles.rosterHeaderCell, textAlign: "right" }}>SALARY</span>
          </div>
        )}

        {!playersLoading && !playersError && players.map((player) => {
          const isOut = sendingIds.has(player.id);
          return (
            <div
              key={player.id ?? player.first_name + player.last_name}
              style={{ ...styles.playerRow, ...(isOut ? styles.playerRowOut : {}) }}
              onClick={() => onTogglePlayer(player)}
            >
              <div style={styles.playerLeft}>
                <span style={styles.position}>{player.position || "—"}</span>
                <span style={styles.playerName}>
                  {player.first_name} {player.last_name}
                </span>
              </div>
              <div style={styles.playerRight}>
                <div style={styles.salaryBlock}>
                  <span style={styles.salary}>
                    {player.salary != null ? fmt.format(player.salary) : "—"}
                  </span>
                  {player.totalRemaining != null && player.totalRemaining !== player.salary && (
                    <span style={styles.totalRemaining}>
                      {fmt.format(player.totalRemaining)} total
                    </span>
                  )}
                </div>
                {isOut ? (
                  <span style={styles.tradingBadge}>TRADING</span>
                ) : (
                  <span style={styles.addBtn}>+</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  selectorArea: {
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderBottom: "1px solid var(--border)",
  },
  label: {
    fontFamily: "var(--font-display)",
    fontSize: 14,
    letterSpacing: 2,
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  select: {
    flex: 1,
    background: "var(--bg-input)",
    color: "var(--text-heading)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "8px 12px",
    fontSize: 14,
    cursor: "pointer",
    outline: "none",
    transition: "border-color 0.2s",
  },
  outgoingZone: {
    margin: "12px 16px",
    padding: "12px",
    border: "1px dashed var(--border-dashed)",
    borderRadius: "var(--radius)",
    minHeight: 60,
  },
  zoneLabel: {
    fontFamily: "var(--font-display)",
    fontSize: 11,
    letterSpacing: 2,
    color: "var(--accent)",
    display: "block",
    marginBottom: 8,
  },
  outgoingList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  zonePlaceholder: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  outgoingChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "var(--accent-dim)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius)",
    padding: "4px 10px",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  chipName: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-heading)",
  },
  chipSalary: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  },
  chipRemove: {
    fontSize: 14,
    color: "var(--text-muted)",
    marginLeft: 2,
    lineHeight: 1,
  },
  roster: {
    flex: 1,
    overflowY: "auto",
    maxHeight: 440,
  },
  rosterHeader: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 16px",
    borderBottom: "1px solid var(--border)",
  },
  rosterHeaderCell: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.5,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 20px",
    gap: 8,
  },
  emptyIcon: {
    fontSize: 28,
    opacity: 0.4,
  },
  emptyText: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  errorMsg: {
    padding: "16px",
    color: "var(--red)",
    fontSize: 13,
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderBottom: "1px solid var(--border-light)",
    cursor: "pointer",
    transition: "background 0.15s",
    userSelect: "none",
  },
  playerRowOut: {
    background: "var(--accent-dim)",
  },
  playerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  position: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--text-muted)",
    width: 20,
    textAlign: "center",
    flexShrink: 0,
  },
  playerName: {
    color: "var(--text-heading)",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  playerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  salaryBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 1,
  },
  salary: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text)",
  },
  totalRemaining: {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    color: "var(--text-muted)",
  },
  addBtn: {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    lineHeight: 1,
  },
  tradingBadge: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: 1.5,
    color: "var(--accent)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius)",
    padding: "2px 6px",
  },
};
