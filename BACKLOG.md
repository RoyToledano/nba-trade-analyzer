# NBA Trade Analyzer — Backlog

This file tracks future features and improvements for the NBA Trade Analyzer project.

## How to Add Items

Copy the row template below and fill in all fields. Insert new items under the table, sorted by importance (Critical → High → Medium → Low). Use YYYY-MM-DD for the date.

```
| **Name** | Description of the feature. | Server, Web App, AI Wrapper | YYYY-MM-DD | High |
```

---

## Backlog Items

| Name | Description | System Interactions | Date Added | Importance |
|------|-------------|---------------------|------------|------------|
| Automated Salary Sync | Replace HoopsHype scraping with a paid NBA stats API (e.g. Sportradar) for reliable, structured salary data. | Server | 2026-03-22 | Medium |
| Real Season Stats | Upgrade balldontlie plan or switch to a different stats provider to surface PPG/RPG/APG/MPG in the prompt and UI. | Server | 2026-03-22 | Medium |
| Three-Way Trade Support | Extend the trade model to support a third team. Requires UI changes (third TeamPanel), backend trade payload updates, and prompt restructuring. | Server, Web App | 2026-03-22 | Medium |
| Trade History Persistence | Save past trade analyses to a local database (SQLite or Postgres) so users can revisit previous trades. | Server | 2026-03-22 | Medium |
| Shareable Trade URLs | Encode the full trade state (teams, players) into URL query params so trades can be shared via link. | Web App | 2026-03-22 | Medium |
| Multiple AI Personas | Let users choose an analysis persona — e.g. Contender GM, Rebuilding GM, Fantasy Manager — each with a different prompt framing. | Server, Web App | 2026-03-22 | Medium |
| Docker Compose Setup | Add a `docker-compose.yml` to orchestrate all three services (client, app server, claude-wrapper) as a single stack for easy local setup. | Server, Web App, AI Wrapper | 2026-03-22 | Medium |
| Player Search / Autocomplete | Replace the full roster scroll with a search/autocomplete input to make player selection faster, especially for large rosters. | Web App | 2026-03-22 | Medium |
