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

// Point every session (esp. remote / main-only) at the distilled research context.
if (existsSync("docs/context/INDEX.md")) {
  console.log(
    "\n## Research context (read before building)\n" +
      "`docs/context/INDEX.md` is the map. It distills the decisions, the QA launch gate " +
      "(`docs/context/QA-CHECKLIST.md`), the world-class rubric, the red-team standards, the $0 stack, " +
      "and the v7.2 visual prototype (`docs/prototype/v7.2.html`). Start there — the full prototype + " +
      "strategy history lives in Min's Cowork workspace, not in git.",
  );
}
process.exit(0);
