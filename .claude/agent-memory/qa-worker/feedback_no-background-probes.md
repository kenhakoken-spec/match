---
name: no-background-probes
description: Do not launch run_in_background bash probes during QA runs — it degrades the tool-result channel and blanks subsequent Bash/Read output
metadata:
  type: feedback
---

Never launch `run_in_background` bash commands (especially long sleeper/probe loops) during a QA verification run in this WSL environment.

**Why:** On 2026-05-31, after launching a 30s background "tick" probe to test the channel, every subsequent foreground Bash AND Read tool call returned empty output for the rest of the turn — even after the background task completed and after spaced retries. This made it impossible to read source files or see command results, blocking the ability to add/verify tests. This compounds the known "Bash出力劣化" hazard already recorded in the user's auto-memory (orchestration-pitfalls).

**How to apply:** Run all verification commands in the foreground, one batch at a time. If output looks degraded, do NOT add more concurrency or background tasks — that makes it worse. Prefer: redirect to a file in one call, Read it in the next. Keep tool calls sequential and minimal. If the channel blanks out, report the partial-but-verified results honestly (baseline numbers captured before the degradation) rather than fabricating a PASS. See [[orchestration-pitfalls]].
