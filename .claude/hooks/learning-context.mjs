// SessionStart hook — surface hard-won learnings + recent errors so Claude doesn't repeat them.
// stdout from a SessionStart hook is added to the session context.
import { readFileSync, existsSync } from "node:fs";

const show = (path, title) => {
  if (!existsSync(path)) return;
  const body = readFileSync(path, "utf8").trim();
  if (body) console.log(`\n## ${title}\n${body}`);
};

console.log("# Project memory (from .claude/) — avoid repeating these:");
show(".claude/LEARNINGS.md", "Learnings");
show(".claude/ERROR_HISTORY.md", "Recent errors");
process.exit(0);
