# NBA Trade Analyzer — Claude Instructions

## AGENTS.md Files

This project has technical reference files that MUST be read before working in their respective areas:

- **`server/`** — Read `server/AGENTS.md` before modifying any file under `server/`
- **`claude-wrapper/`** — Read `claude-wrapper/AGENTS.md` before modifying any file under `claude-wrapper/`
- **`client/`** — Read `client/AGENTS.md` before modifying any file under `client/`

These files document architecture, key assumptions, external integrations, and edge cases. Do not skip them.

## Workflow Rules

### Code review before every commit

Before creating any git commit, invoke the `code-reviewer` skill (via the Skill tool, or `/code-reviewer`) and run it against the staged changes. This applies to **every** agent that commits, including subagents.

- Resolve all CRITICAL findings before committing. Re-stage and re-run the skill after fixing.
- Resolve HIGH findings before committing unless the user has explicitly accepted the risk.
- MEDIUM / LOW findings: report them, then proceed.

Do not skip the review because a change "looks trivial."