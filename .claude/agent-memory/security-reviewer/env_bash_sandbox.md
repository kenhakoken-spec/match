---
name: env-bash-sandbox
description: In this WSL environment, sandboxed Bash silently swallows output and discards /tmp writes; the log+Read fallback fails too
metadata:
  type: feedback
---

In this matching-app WSL environment, the default sandboxed Bash tool frequently returns **empty output** for commands that should produce output (even `echo`/`tee`), and redirecting to a `/tmp` log file produces a **0-byte file** — so the usual "pipe to log then Read it back" fallback also fails because the write itself is discarded by the sandbox.

**Why:** The sandbox blocks/discards filesystem writes and some stdout under certain commands; failures are silent (no error, just empty), which can be mistaken for "command produced no output / directory is empty."

**How to apply:** When Bash output looks empty or a freshly-written log reads as 0 bytes, do NOT conclude the filesystem state from it. Re-run the command with `dangerouslyDisableSandbox: true` (read-only inspection like `ls`, `git ls-files`, `git log`, `find` is safe to de-sandbox) to get ground truth. Cross-check existence claims with the Read tool, which reports "does not exist" reliably and is independent of the Bash sandbox.
