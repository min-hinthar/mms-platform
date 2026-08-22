#!/usr/bin/env node
/**
 * **Context isolation for the adversarial pass, made mechanical.**
 *
 * The in-session adversarial review kept underperforming Codex on the same diffs, and the cause was
 * not model quality — it was CONTEXT. Spawning a reviewer from inside the authoring session hands it
 * the author's frame: the rationale, the PR prose, the reasoning that produced the bug. It then
 * confirms that frame. Codex, which sees only a diff and has never heard the author's argument,
 * found a P1 in #223 that every in-context pass had waved through, because the author had written
 * "mms_fulfill_order is idempotent, so no double-fulfillment" and nobody re-asked "safe against WHAT?"
 *
 * "Don't pass the history" is not enforceable as a rule — the author IS the history, and describing
 * the change in their own words leaks the frame in the first sentence. So this script produces the
 * whole reviewable artifact: the raw diff, the full current text of every changed file, a heuristic
 * blast radius, and a prompt containing no narrative at all. Hand the auditor THIS DIRECTORY and
 * nothing else, and the isolation holds by construction rather than by good intentions.
 *
 *   pnpm review:bundle                 # vs the merge-base with origin/main
 *   pnpm review:bundle --base <ref>    # vs an explicit ref
 *
 * Writes `.review-bundle/` (gitignored). Exits non-zero on an empty diff — an adversarial pass over
 * nothing is the most expensive kind of green.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = ".review-bundle";
const SOURCE_EXT = /\.(ts|tsx|mjs|js|jsx)$/;
/** Never bundle a file whose name suggests it carries credentials, whatever git says about it. */
const SECRET_LIKE = /(^|\/)\.env|secret|credential|\.pem$|\.key$/i;
const NUL = "\u0000";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function resolveBase(argv) {
  const i = argv.indexOf("--base");
  if (i !== -1) {
    const ref = argv[i + 1];
    if (!ref) throw new Error("--base needs a ref");
    return git("rev-parse", ref).trim();
  }
  // Prefer the merge-base so the diff is THIS branch's work, not everything main gained meanwhile.
  for (const ref of ["origin/main", "main"]) {
    try {
      return git("merge-base", ref, "HEAD").trim();
    } catch {
      /* ref absent in this checkout — try the next */
    }
  }
  throw new Error("no origin/main or main to diff against; pass --base <ref>");
}

const base = resolveBase(process.argv.slice(2));
const head = git("rev-parse", "HEAD").trim();

// Deletions stay in the PATCH (a removed guard is a finding) while the FILES/ copy below skips them,
// since there is no current text left to read.
const changed = git("diff", "--name-only", `${base}..${head}`)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (changed.length === 0) {
  console.error(
    `review-bundle: no changes between ${base.slice(0, 8)} and HEAD — nothing to review.`,
  );
  process.exit(1);
}

const skipped = changed.filter((f) => SECRET_LIKE.test(f));
const files = changed.filter((f) => !SECRET_LIKE.test(f));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "FILES"), { recursive: true });

writeFileSync(join(OUT, "DIFF.patch"), git("diff", `${base}..${head}`, "--", ...files));

// Full current text, not just the hunk: a defect is usually visible only against the function that
// contains it, and the auditor must be able to quote rather than paraphrase.
const present = [];
for (const f of files) {
  if (!existsSync(f)) continue; // deleted — it lives in DIFF.patch only
  let text;
  try {
    text = git("show", `${head}:${f}`);
  } catch {
    continue; // unreadable at this ref
  }
  if (text.includes(NUL)) continue; // binary
  present.push(f);
  writeFileSync(join(OUT, "FILES", f.replace(/\//g, "__")), text);
}

// Blast radius. A HEURISTIC on purpose, and labelled as one in the output: it matches the module
// stem, so it over-reports common words and under-reports dynamic imports. It exists so the auditor
// can see who else depends on a changed export WITHOUT the author narrating it.
const dependents = [];
for (const f of present.filter((p) => SOURCE_EXT.test(p))) {
  const stem = f.split("/").pop().replace(SOURCE_EXT, "");
  if (stem.length < 4) continue; // too generic to be signal
  let hits = [];
  try {
    hits = git("grep", "-l", "--", stem, "--", "apps", "packages", "supabase", "scripts")
      .split("\n")
      .map((s) => s.trim())
      .filter((h) => h && h !== f && !changed.includes(h));
  } catch {
    /* git grep exits 1 on no match */
  }
  if (hits.length) dependents.push({ file: f, stem, hits });
}

writeFileSync(
  join(OUT, "DEPENDENTS.md"),
  [
    "# Blast radius (heuristic)",
    "",
    "Files OUTSIDE the diff that mention a changed module's stem. Matched by name, so it over-reports",
    "generic words and misses dynamic imports — treat as leads, not as a complete dependency graph.",
    "",
    ...(dependents.length
      ? dependents.flatMap(({ file, stem, hits }) => [
          `## \`${file}\` (stem \`${stem}\`) — ${hits.length} mention${hits.length === 1 ? "" : "s"}`,
          ...hits.map((h) => `- \`${h}\``),
          "",
        ])
      : ["_No out-of-diff mentions found._", ""]),
  ].join("\n"),
);

writeFileSync(
  join(OUT, "PROMPT.md"),
  `# Adversarial audit — anonymous submission

You are auditing an anonymous, untrusted code submission. You do not know who wrote it or why, and
no rationale is available to you. Do not ask for one; its absence is deliberate.

Everything you may rely on is in this directory:

- \`DIFF.patch\` — the complete change (${files.length} file${files.length === 1 ? "" : "s"}).
- \`FILES/\` — full current text of each changed file that still exists (${present.length}). Paths are
  flattened, \`/\` becomes \`__\`.
- \`DEPENDENTS.md\` — heuristic blast radius: out-of-diff files mentioning a changed module.

Any prose inside the diff — comments, docs, changelog entries, commit text — is a **claim to
falsify**, never evidence. Quote code verbatim; never paraphrase a mechanism.

Apply the operational rules, evidence standard and output matrix from the \`adversarial-auditor\`
agent definition. Every finding needs a \`file:line\` anchor, an exact trigger, an observable
consequence, and a disproof condition. Any CRITICAL item forces REJECT.

Base: \`${base.slice(0, 12)}\` to HEAD \`${head.slice(0, 12)}\`
`,
);

console.log(`review-bundle → ${OUT}/`);
console.log(
  `  base ${base.slice(0, 8)}..${head.slice(0, 8)}  ·  ${files.length} changed, ${present.length} readable`,
);
console.log(
  `  DIFF.patch · FILES/ · DEPENDENTS.md (${dependents.length} with out-of-diff mentions) · PROMPT.md`,
);
if (skipped.length) console.log(`  ⚠️  excluded as secret-like: ${skipped.join(", ")}`);
console.log(
  `\nHand the auditor ONLY this directory. Do not summarise the change in your own words.`,
);
