import ReactMarkdown from "react-markdown";
import TradeFinancials from "./TradeFinancials.jsx";

const GRADE_COLORS = {
  "A+": { bg: "var(--grade-a-bg)",       border: "var(--grade-a-border)",   text: "var(--grade-a-text)" },
  "A":  { bg: "var(--grade-a-bg)",       border: "var(--grade-a-border)",   text: "var(--grade-a-text)" },
  "A-": { bg: "var(--grade-a-bg)",       border: "var(--grade-a-border)",   text: "var(--grade-a-text)" },
  "B+": { bg: "var(--grade-b-bg)",       border: "var(--grade-b-border)",   text: "var(--grade-b-text)" },
  "B":  { bg: "var(--grade-b-bg)",       border: "var(--grade-b-border)",   text: "var(--grade-b-text)" },
  "B-": { bg: "var(--grade-b-minus-bg)", border: "var(--blue-border)",      text: "var(--grade-b-minus-text)" },
  "C+": { bg: "var(--grade-c-bg)",       border: "var(--grade-c-border)",   text: "var(--grade-c-text)" },
  "C":  { bg: "var(--grade-c-bg)",       border: "var(--grade-c-border)",   text: "var(--grade-c-text)" },
  "C-": { bg: "var(--grade-c-bg)",       border: "var(--grade-c-border)",   text: "var(--grade-c-text)" },
  "D":  { bg: "var(--grade-d-bg)",       border: "var(--grade-d-border)",   text: "var(--grade-d-text)" },
  "F":  { bg: "var(--grade-d-bg)",       border: "var(--grade-d-border)",   text: "var(--grade-f-text)" },
};

function parseGrades(text) {
  const grades = [];
  const regex = /\*\*([^*]+)\*\*:\s*(A\+|A-?|B\+|B-?|C\+|C-?|D|F)\b/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    grades.push({ team: m[1].trim(), grade: m[2] });
  }
  return grades;
}

function GradeCard({ team, grade }) {
  const colors = GRADE_COLORS[grade] ?? GRADE_COLORS["C"];
  return (
    <div style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "var(--radius)",
      padding: "14px 18px",
    }}>
      <span style={{
        color: "var(--text-heading)",
        fontSize: 13,
        fontWeight: 500,
      }}>
        {team}
      </span>
      <span style={{
        fontFamily: "var(--font-display)",
        fontSize: 36,
        color: colors.text,
        lineHeight: 1,
        letterSpacing: 1,
      }}>
        {grade}
      </span>
    </div>
  );
}

export default function TradeAnalysis({ text, status, error, isStreaming, isDone, legality }) {
  if (!status && !text && !error && !legality) return null;

  const grades = isDone ? parseGrades(text) : [];

  // Derive validity banners from legality data
  const tradeValid = legality?.valid;
  const rosterWarnings = legality ? [
    legality.teamA?.rosterCompliance?.message,
    legality.teamB?.rosterCompliance?.message,
  ].filter(Boolean) : [];
  const salaryWarnings = legality?.warnings?.filter(
    (w) => w.includes("exceeds allowable")
  ) ?? [];

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.headerRow}>
        <span style={styles.title}>AI ANALYSIS</span>
        {isStreaming && <span style={styles.streamingBadge}>Analyzing trade...</span>}
        {isDone && <span style={styles.doneBadge}>Analysis complete</span>}
      </div>

      {/* Trade legality banner — shown as soon as legality data arrives */}
      {legality != null && (
        <div style={{
          ...styles.legalityBanner,
          background: tradeValid ? "var(--green-dim)" : "var(--red-dim)",
          border: `1px solid ${tradeValid ? "var(--green-border)" : "var(--red-border)"}`,
          color: tradeValid ? "var(--green)" : "var(--red)",
        }}>
          <span style={styles.legalityIcon}>{tradeValid ? "✓" : "✗"}</span>
          <span>
            {tradeValid
              ? "Trade is valid under CBA salary matching rules."
              : salaryWarnings.length > 0
                ? salaryWarnings.join(" ")
                : "Trade does not satisfy CBA salary matching rules."}
          </span>
        </div>
      )}

      {/* Roster compliance warnings */}
      {rosterWarnings.map((w) => (
        <div key={w} style={styles.rosterWarning}>{w}</div>
      ))}

      {/* Grade cards */}
      {grades.length > 0 && (
        <div style={styles.gradeRow}>
          {grades.map((g) => (
            <GradeCard key={g.team} team={g.team} grade={g.grade} />
          ))}
        </div>
      )}

      {/* Financial breakdown — shown when legality data is present */}
      <TradeFinancials legality={legality} />

      {/* Status */}
      {status && !text && (
        <p style={styles.status}>{status}</p>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Markdown */}
      {text && (
        <div style={styles.markdown}>
          <ReactMarkdown
            components={{
              h2: ({ children }) => <h2 style={styles.mdH2}>{children}</h2>,
              p: ({ children }) => <p style={styles.mdP}>{children}</p>,
              strong: ({ children }) => <strong style={styles.mdStrong}>{children}</strong>,
              ul: ({ children }) => <ul style={styles.mdUl}>{children}</ul>,
              li: ({ children }) => <li style={styles.mdLi}>{children}</li>,
            }}
          >
            {text + (isStreaming ? "▍" : "")}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "20px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    letterSpacing: 2,
    color: "var(--text-heading)",
  },
  streamingBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius)",
    padding: "3px 10px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  doneBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--green)",
    background: "var(--green-dim)",
    border: "1px solid var(--green-border)",
    borderRadius: "var(--radius)",
    padding: "3px 10px",
  },
  legalityBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: "var(--radius)",
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 8,
    fontWeight: 500,
  },
  legalityIcon: {
    fontSize: 15,
    flexShrink: 0,
    marginTop: 1,
  },
  rosterWarning: {
    fontSize: 12,
    color: "var(--blue)",
    background: "var(--blue-dim)",
    border: "1px solid var(--blue-border)",
    borderRadius: "var(--radius)",
    padding: "7px 12px",
    marginBottom: 8,
  },
  gradeRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
  },
  status: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontStyle: "italic",
  },
  errorBox: {
    color: "var(--red)",
    background: "var(--red-dim)",
    border: "1px solid var(--red-border)",
    borderRadius: "var(--radius)",
    padding: "12px 16px",
    fontSize: 13,
  },
  markdown: {
    color: "var(--text)",
    lineHeight: 1.75,
  },
  mdH2: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    letterSpacing: 1,
    color: "var(--accent)",
    marginTop: 24,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px solid var(--border)",
  },
  mdP: {
    marginBottom: 10,
    fontSize: 13,
  },
  mdStrong: {
    color: "var(--text-heading)",
    fontWeight: 600,
  },
  mdUl: {
    paddingLeft: 18,
    marginBottom: 10,
  },
  mdLi: {
    fontSize: 13,
    marginBottom: 3,
  },
};
