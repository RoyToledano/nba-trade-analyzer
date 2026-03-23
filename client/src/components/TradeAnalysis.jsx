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

export default function TradeAnalysis({ text, status, error, isStreaming, isDone }) {
  if (!status && !text && !error) return null;

  const grades = isDone ? parseGrades(text) : [];

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.headerRow}>
        <span style={styles.title}>AI ANALYSIS</span>
        {isStreaming && <span style={styles.streamingBadge}>Analyzing trade...</span>}
        {isDone && <span style={styles.doneBadge}>Analysis complete</span>}
      </div>

      {/* Grade cards */}
      {grades.length > 0 && (
        <div style={styles.gradeRow}>
          {grades.map((g) => (
            <GradeCard key={g.team} team={g.team} grade={g.grade} />
          ))}
        </div>
      )}

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
    borderRadius: "var(--radius)",
    padding: "3px 10px",
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
