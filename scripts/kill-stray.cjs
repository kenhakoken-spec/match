// Kill stray next dev / chromium / capture processes WITHOUT using pkill (which
// exits 144 in this sandbox and cancels sibling tool calls). We read /proc and
// send SIGKILL from Node, then report the count. Node exits 0 normally.
const fs = require("fs");

const PATTERNS = [/next-server/, /next dev/, /next\/dist\/bin\/next/, /chromium/, /headless_shell/, /s3-shots\.cjs/, /s3-capture\.sh/];
const self = process.pid;
let killed = 0;
let remaining = 0;

for (const pid of fs.readdirSync("/proc")) {
  if (!/^\d+$/.test(pid)) continue;
  const p = Number(pid);
  if (p === self) continue;
  let cmd = "";
  try {
    cmd = fs.readFileSync(`/proc/${pid}/cmdline`).toString().replace(/\0/g, " ");
  } catch {
    continue;
  }
  if (!cmd) continue;
  if (PATTERNS.some((re) => re.test(cmd))) {
    try {
      process.kill(p, "SIGKILL");
      killed++;
    } catch {
      remaining++;
    }
  }
}
console.log(`KILLED=${killed} FAILED=${remaining}`);
