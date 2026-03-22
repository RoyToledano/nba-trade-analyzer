import ReactMarkdown from "react-markdown";

const GRADE_COLORS = {
  "A+": { bg: "#052e16", border: "#16a34a", text: "#4ade80" },
  "A":  { bg: "#052e16", border: "#16a34a", text: "#4ade80" },
  "A-": { bg: "#052e16", border: "#16a34a", text: "#4ade80" },
  "B+": { bg: "#0a2e1f", border: "#22c55e", text: "#86efac" },
  "B":  { bg: "#0a2e1f", border: "#22c55e", text: "#86efac" },
  "B-": { bg: "#172554", border: "#3b82f6", text: "#93c5fd" },
  "C+": { bg: "#1a1a00", border: "#ca8a04", text: "#fde047" },
  "C":  { bg: "#1a1a00", border: "#ca8a04", text: "#fde047" },
  "C-": { bg: "#1a1a00", border: "#ca8a04", text: "#fde047" },
  "D":  { bg: "#2a1215", border: "#dc2626", text: "#fca5a5" },
  "F":  { bg: "#2a1215", border: "#dc2626", text: "#f87171" },
};

function parseGrades(text) {
  const grades = [];
  // Match pattern: **Team Name**: A+ (or similar grade)
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
      borderRadius: "var(--radius-sm)",
      padding: "12px 18px",
    }}>
      <span style={{ color: "var(--text-heading)", fontSize: 14, fontWeight: 500 }}>
        {team}
      </span>
      <span style={{
        fontFamily: "var(--font-display)",
        fontSize: 32,
        color: colors.text,
        lineHeight: 1,
        letterSpacing: 1,
      }}>
        {grade}
      </span>
    </div>
  );
}

export default function TradeAnalysis({ text, status, error, isStreaming, isDone }) {
  if (!status && !text && !error) return null;

  const grades = isDone ? parseGrades(text) : [];

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <span style={styles.title}>AI Analysis</span>
        {isStreaming && <span style={styles.streamingBadge}>Analyzing trade...</span>}
        {isDone && <span style={styles.doneBadge}>Analysis complete</span>}
      </div>

      {/* Grade cards — shown when analysis is complete */}
      {grades.length > 0 && (
        <div style={styles.gradeRow}>
          {grades.map((g) => (
            <GradeCard key={g.team} team={g.team} grade={g.grade} />
          ))}
        </div>
      )}

      {/* Status messages (shown while loading, hidden once text starts) */}
      {status && !text && (
        <p style={styles.status}>{status}</p>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Streaming markdown output */}
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
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "24px 28px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid var(--border)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    color: "var(--text-heading)",
    letterSpacing: 1,
  },
  streamingBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    border: "1px solid var(--accent-border)",
    borderRadius: 99,
    padding: "2px 10px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  doneBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--green)",
    background: "var(--green-dim)",
    borderRadius: 99,
    padding: "2px 10px",
  },
  gradeRow: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
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
    borderRadius: "var(--radius-sm)",
    padding: "12px 16px",
    fontSize: 13,
  },
  markdown: {
    color: "var(--text)",
    lineHeight: 1.75,
  },
  mdH2: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    letterSpacing: 0.5,
    color: "var(--accent)",
    marginTop: 28,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: "1px solid var(--accent-border)",
  },
  mdP: {
    marginBottom: 12,
    fontSize: 14,
  },
  mdStrong: {
    color: "var(--text-heading)",
    fontWeight: 600,
  },
  mdUl: {
    paddingLeft: 20,
    marginBottom: 12,
  },
  mdLi: {
    fontSize: 14,
    marginBottom: 4,
  },
};
