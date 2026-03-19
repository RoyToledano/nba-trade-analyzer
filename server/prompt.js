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
 * @returns {string} The full prompt to send to Claude
 */
export function buildTradePrompt(trade) {
  const { teamA, teamB } = trade;

  const blockA = formatTeamBlock(teamA);
  const blockB = formatTeamBlock(teamB);

  return `You are a sharp, opinionated NBA analyst who evaluates trades with depth and nuance. You consider on-court fit, salary cap strategy, player development timelines, and team-building philosophy.

A user is proposing the following trade:

${blockA}

${blockB}

Since this is a two-team trade, each team receives the players the other team is sending.

Analyze this trade thoroughly. Use the stats and salary data provided. Respond using **exactly** these markdown section headers:

## Short-Term Winner
Immediate impact over the next 1–2 seasons. Which team benefits more right now and why?

## Long-Term Winner
3+ season outlook. Consider contracts, player age, development trajectory, and draft capital implications.

## Salary & Cap Implications
Cap hits for each side, luxury tax risk, future cap flexibility. Note any salary matching issues if applicable.

## Fit Analysis: ${teamA.name}
How do the incoming players fit ${teamA.name}'s roster, playing style, and coaching system?

## Fit Analysis: ${teamB.name}
Same analysis for ${teamB.name}.

## Verdict
One concise paragraph: should this trade happen? Who wins, who loses, and is it fair?`;
}

function formatTeamBlock(team) {
  const lines = team.sending.map((p) => {
    const name = `${p.first_name} ${p.last_name}`;
    const salary = p.salary != null ? fmt.format(p.salary) : "N/A";
    const s = p.stats;
    const stats = s
      ? `${num(s.pts)} PPG / ${num(s.reb)} RPG / ${num(s.ast)} APG / ${num(s.min)} MPG`
      : "Stats N/A";
    return `  - ${name} | Salary: ${salary} | ${stats}`;
  });

  return `**${team.name}** is sending:\n${lines.join("\n")}`;
}

function num(v) {
  return v != null ? Number(v).toFixed(1) : "—";
}
