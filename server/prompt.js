// ---------------------------------------------------------------------------
// prompt.js — Builds the structured analysis prompt for Claude
// ---------------------------------------------------------------------------

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * @param {object} trade
 * @param {object} trade.teamA  — { name, sending: [{ first_name, last_name, salary, stats }] }
 * @param {object} trade.teamB  — same shape
 * @param {object|null} legality — output from evaluateTradeLegality (optional)
 * @returns {string} The full prompt to send to Claude
 */
export function buildTradePrompt(trade, legality = null) {
  const { teamA, teamB } = trade;

  const blockA = formatTeamBlock(teamA);
  const blockB = formatTeamBlock(teamB);
  const legalityBlock = legality ? formatLegalityBlock(legality) : "";

  return `You are a sharp, opinionated NBA analyst who evaluates trades with depth and nuance. You consider on-court fit, salary cap strategy, player development timelines, and team-building philosophy.

**IMPORTANT — Before writing your analysis, you MUST use the WebSearch tool to look up current information about both teams.** Your training data may be outdated. Use WebSearch to find:
1. The current head coach of ${teamA.name} and ${teamB.name}
2. Each team's current roster, playing style, and offensive/defensive identity
3. Each team's current situation (contending, rebuilding, key injuries, recent moves)

Do NOT skip this step. Do NOT rely on training data for coaches, team situations, or recent transactions. Always use WebSearch first.

A user is proposing the following trade:

${blockA}

${blockB}

Since this is a two-team trade, each team receives the players the other team is sending.
${legalityBlock}
Analyze this trade thoroughly. Use the stats and salary data provided. Respond using **exactly** these markdown section headers:

## Short-Term Winner
Immediate impact over the next 1–2 seasons. Which team benefits more right now and why?

## Long-Term Winner
3+ season outlook. Consider contracts, player age, development trajectory, and draft capital implications.

## Salary & Cap Implications
Use the financial data provided above as the authoritative source for cap numbers. Discuss: cap hits for each side, luxury tax risk, apron implications, and future cap flexibility. If the trade fails salary matching rules, explain why and what adjustments could make it work.

## Fit Analysis: ${teamA.name}
How do the incoming players fit ${teamA.name}'s roster, playing style, and coaching system?

## Fit Analysis: ${teamB.name}
Same analysis for ${teamB.name}.

## Trade Grades
Assign a letter grade (A+, A, A-, B+, B, B-, C+, C, C-, D, F) to each team for this trade. Format exactly as:
- **${teamA.name}**: [grade]
- **${teamB.name}**: [grade]

## Verdict
One concise paragraph: should this trade happen? Who wins, who loses, and is it fair?`;
}

function formatTeamBlock(team) {
  const lines = team.sending.map((p) => {
    const name = `${p.first_name} ${p.last_name}`;
    const curSalary = p.salary != null ? fmt.format(p.salary) : "N/A";
    const totalContract = p.totalRemaining != null ? fmt.format(p.totalRemaining) : "N/A";
    const s = p.stats;
    const stats = s
      ? `${num(s.pts)} PPG / ${num(s.reb)} RPG / ${num(s.ast)} APG / ${num(s.min)} MPG`
      : "Stats N/A";
    return `  - ${name} | This Season: ${curSalary} | Total Remaining: ${totalContract} | ${stats}`;
  });

  return `**${team.name}** is sending:\n${lines.join("\n")}`;
}

function num(v) {
  return v != null ? Number(v).toFixed(1) : "—";
}

function formatLegalityBlock(legality) {
  const formatSide = (side) => {
    const f = side.tradeFinancials;
    const pre = side.preTrade;
    const post = side.postTrade;
    const capDiffStr = side.valid
      ? `under allowable by ${fmt.format(f.capDifference)} (PASS)`
      : `over allowable by ${fmt.format(f.incomingCap - f.allowableIncoming)} (FAIL)`;
    return `  **${side.teamName}** (currently ${pre.capStatusLabel}):
    - Outgoing salary: ${fmt.format(f.outgoingCap)}
    - Allowable incoming: ${fmt.format(f.allowableIncoming)} (formula: ${f.formula})
    - Incoming salary: ${fmt.format(f.incomingCap)}
    - Cap difference: ${capDiffStr}
    - Post-trade status: ${post.capStatusLabel} (total salary: ${fmt.format(post.totalSalary)})
    - Post-trade tax space: ${fmt.format(post.taxSpace)}
    - Post-trade 1st apron space: ${fmt.format(post.firstApronSpace)}
    - Post-trade 2nd apron space: ${fmt.format(post.secondApronSpace)}`;
  };

  const warnings = legality.warnings.length
    ? `\n  Warnings: ${legality.warnings.join("; ")}`
    : "";

  return `

**CBA Financial Analysis (computed, authoritative):**
  Trade legality: ${legality.valid ? "VALID" : "INVALID"}
${formatSide(legality.teamA)}
${formatSide(legality.teamB)}${warnings}
`;
}
