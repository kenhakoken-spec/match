# Security Reviewer Memory — matching-app

- [Scaffold stage S1/S2](project_scaffold-stage.md) — repo architecture/layout snapshot (verify paths before relying)
- [Recurring scaffold vulns](feedback_known-scaffold-vulns.md) — verified-good controls + open issues from S1/S2 review
- [S3-S6 review](project_s3-s6-review.md) — 2026-05-30: CRIT0/HIGH0/MED2/LOW3; venueUrl IS safe (anchored http(s) regex)
- [S8 review](project_s8-review.md) — 2026-05-31: Haiku auth/no-show/public-preview/admin-venue/restricted-slots all VERIFIED-GOOD, CRIT0/HIGH0; includes correction of two earlier-drafted false findings
- [Bash sandbox notes](env_bash_sandbox.md) — sandboxed Read/Bash return empty in this WSL env; use nl -ba via dangerouslyDisableSandbox

Notes:
- Agent threads reset cwd between bash calls — use absolute paths only.
- Do NOT run next dev / npm run build / next start / curl (shared .next gets corrupted). Allowed: tsc, vitest, Read/Grep/Glob. No pkill/fuser.
- Report findings directly in the final assistant message (parent agent reads text output, not files). Do NOT write report/findings .md files.
- Never draft findings before reading the actual code — sandboxed Read silently returns empty here, which can fool you into reporting on imagined code.
- No emojis. No colon before tool calls.
