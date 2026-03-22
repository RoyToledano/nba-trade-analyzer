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
      {/* Panel header */}
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <select
          style={styles.select}
          value={team.id ?? ""}
          onChange={handleTeamSelect}
          disabled={teamsLoading}
        >
          <option value="">Select a team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Roster */}
      <div style={styles.roster}>
        {!team.id && (
          <p style={styles.empty}>Select a team to load its roster.</p>
        )}

        {playersLoading && (
          <p style={styles.loading}>Loading roster…</p>
        )}

        {playersError && (
          <p style={styles.errorMsg}>{playersError}</p>
        )}

        {!playersLoading && !playersError && players.map((player) => {
          const isOut = sendingIds.has(player.id);
          return (
            <div
              key={player.id ?? player.first_name + player.last_name}
              style={{ ...styles.playerRow, ...(isOut ? styles.playerRowOut : {}) }}
              onClick={() => onTogglePlayer(player)}
            >
              <div style={styles.playerInfo}>
                <span style={styles.playerName}>
                  {player.first_name} {player.last_name}
                </span>
                <span style={styles.playerMeta}>
                  {player.position || "—"}
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
                <span style={{ ...styles.badge, ...(isOut ? styles.badgeOut : styles.badgeDefault) }}>
                  {isOut ? "OUT" : "+"}
                </span>
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
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  label: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    color: "var(--accent)",
    letterSpacing: 1,
    flexShrink: 0,
  },
  select: {
    flex: 1,
    background: "var(--bg)",
    color: "var(--text-heading)",
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-sm)",
    padding: "7px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  roster: {
    flex: 1,
    overflowY: "auto",
    maxHeight: 420,
  },
  empty: {
    padding: "32px 20px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13,
  },
  loading: {
    padding: "32px 20px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13,
    fontStyle: "italic",
  },
  errorMsg: {
    padding: "16px 20px",
    color: "var(--red)",
    fontSize: 13,
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    transition: "background 0.12s",
    userSelect: "none",
  },
  playerRowOut: {
    background: "var(--red-dim)",
    borderBottom: "1px solid var(--red-border)",
  },
  playerInfo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  playerName: {
    color: "var(--text-heading)",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  playerMeta: {
    color: "var(--text-muted)",
    fontSize: 11,
    flexShrink: 0,
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
    color: "var(--text-muted)",
  },
  totalRemaining: {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    color: "var(--text-muted)",
    opacity: 0.6,
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.5,
    padding: "2px 7px",
    borderRadius: 99,
    border: "1px solid transparent",
  },
  badgeDefault: {
    color: "var(--text-muted)",
    borderColor: "var(--border-light)",
  },
  badgeOut: {
    color: "var(--red)",
    borderColor: "var(--red-border)",
    background: "var(--red-dim)",
  },
};
