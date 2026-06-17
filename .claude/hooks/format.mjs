// PostToolUse hook — auto-format the file Claude just edited (Prettier + ESLint --fix).
// Best-effort: never blocks. Reads the hook payload from stdin, formats the changed file.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const FMT = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|yml|yaml)$/;

try {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  const file = JSON.parse(raw || "{}")?.tool_input?.file_path;
  if (file && FMT.test(file) && existsSync(file)) {
    const q = JSON.stringify(file);
    try { execSync(`npx prettier --write ${q}`, { stdio: "ignore" }); } catch {}
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) {
      try { execSync(`npx eslint --fix ${q}`, { stdio: "ignore" }); } catch {}
    }
  }
} catch {
  // swallow — formatting must never block the edit
}
process.exit(0);
