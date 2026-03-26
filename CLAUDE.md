# NBA Trade Analyzer — Claude Instructions

## AGENTS.md Files

This project has technical reference files that MUST be read before working in their respective areas:

- **`server/`** — Read `server/AGENTS.md` before modifying any file under `server/`
- **`claude-wrapper/`** — Read `claude-wrapper/AGENTS.md` before modifying any file under `claude-wrapper/`
- **`client/`** — Read `client/AGENTS.md` before modifying any file under `client/`

These files document architecture, key assumptions, external integrations, and edge cases. Do not skip them.

## Workflow Rules
After every file write or code modification, automatically invoke the
code-reviewer agent on the exact files that were just written or modified.
Do not review the entire codebase — only pass the changed files to the agent.

Examples:
- Wrote `src/api/users.ts` → review `src/api/users.ts`
- Edited `components/Button.tsx` and `styles/button.css` → review both files
- Refactored `lib/auth/` folder → review all files touched in that folder