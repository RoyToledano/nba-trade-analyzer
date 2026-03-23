# NBA Trade Analyzer — Backlog

This file tracks future features and improvements for the NBA Trade Analyzer project.

## How to Add Items

Copy the row template below and fill in all fields. Insert new items under the table, sorted by importance (Critical → High → Medium → Low). Use YYYY-MM-DD for the date. Status must be one of: `Pending`, `In Progress`, `Done`.

```
| **Name** | Description of the feature. | Server, Web App, AI Wrapper | YYYY-MM-DD | High | Pending |
```

---

## Backlog Items

| Name | Description | System Interactions | Date Added | Importance | Status |
|------|-------------|---------------------|------------|------------|--------|
| Roster Mismatch with HoopsHype | The roster returned for the New York Knicks (and possibly other teams) doesn't match what HoopsHype shows. Likely a name-matching issue between balldontlie and HoopsHype, or a scraping/pagination problem. Investigate and fix the cross-reference logic in `nba.js`. | Server | 2026-03-22 | High | Pending |
| AI Uses Outdated Team Context | The AI model references outdated information (e.g. wrong coach for the Knicks). The prompt should include current coaching staff and any other relevant context that the model's training data may not cover, so the analysis reflects the real current state of each team. | Server | 2026-03-22 | High | Pending |
| Fix Salary Calculation | Salary now shows current-season salary AND total remaining contract value (sum of all future seasons from HoopsHype). Previously only showed a single season's salary. Updated server scraping, prompt, and UI. | Server, Web App | 2026-03-22 | High | Done |
| Per-Team Trade Grade | Claude now returns a letter grade (A+ through F) for each team. Grades are parsed from the markdown and displayed as color-coded cards (green for good, yellow for mid, red for bad) above the analysis. | Server, Web App | 2026-03-22 | High | Done |
| Remove Claude Mentions from UI | Replaced all user-facing "Claude" references with neutral "AI" phrasing — tagline, footer, and analysis header. Backend/code variable names unchanged. | Web App | 2026-03-22 | High | Done |
| Fix Live Status Text | Replaced the "Live" streaming badge with "Analyzing trade..." and the "Complete" badge with "Analysis complete" for clearer user feedback during analysis. | Web App | 2026-03-22 | High | Done |
| Automated Salary Sync | Replace HoopsHype scraping with a paid NBA stats API (e.g. Sportradar) for reliable, structured salary data. | Server | 2026-03-22 | Medium | Pending |
| Real Season Stats | Upgrade balldontlie plan or switch to a different stats provider to surface PPG/RPG/APG/MPG in the prompt and UI. | Server | 2026-03-22 | Medium | Pending |
| Three-Way Trade Support | Extend the trade model to support a third team. Requires UI changes (third TeamPanel), backend trade payload updates, and prompt restructuring. | Server, Web App | 2026-03-22 | Medium | Pending |
| Trade History Persistence | Save past trade analyses to a local database (SQLite or Postgres) so users can revisit previous trades. | Server | 2026-03-22 | Medium | Pending |
| Shareable Trade URLs | Encode the full trade state (teams, players) into URL query params so trades can be shared via link. | Web App | 2026-03-22 | Medium | Pending |
| Multiple AI Personas | Let users choose an analysis persona — e.g. Contender GM, Rebuilding GM, Fantasy Manager — each with a different prompt framing. | Server, Web App | 2026-03-22 | Medium | Pending |
| Docker Compose Setup | Add a `docker-compose.yml` to orchestrate all three services (client, app server, claude-wrapper) as a single stack for easy local setup. | Server, Web App, AI Wrapper | 2026-03-22 | Medium | Pending |
| Player Search / Autocomplete | Replace the full roster scroll with a search/autocomplete input to make player selection faster, especially for large rosters. | Web App | 2026-03-22 | Medium | Pending |
