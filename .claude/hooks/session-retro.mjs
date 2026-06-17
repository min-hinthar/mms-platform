// SessionEnd hook — gentle retro nudge. Appends a dated marker to the session log so there's a
// trail, and reminds (via stderr, non-blocking) to capture anything sharp into LEARNINGS.md.
import { appendFileSync, mkdirSync } from "node:fs";

try {
  mkdirSync(".claude/session-logs", { recursive: true });
  appendFileSync(".claude/session-logs/sessions.log", `${new Date().toISOString()} session ended\n`);
} catch {}
console.error("↳ If you hit a sharp edge this session, add it to .claude/LEARNINGS.md.");
process.exit(0);
