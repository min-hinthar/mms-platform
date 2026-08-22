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
/**
 * Flatten a repo path to a single FILES/ entry. The leading-dot strip is not cosmetic: dogfooding
 * this script on its own diff put `.claude/LEARNINGS.md` and `.gitignore` into FILES/ as HIDDEN
 * dotfiles, so an auditor running `ls` saw 5 of 8 inputs and would have reviewed a subset while
 * believing it had everything. MANIFEST.md below exists for the same reason — never make a
 * reviewer's completeness depend on a directory listing.
 */
const flat = (f) => f.replace(/\//g, "__").replace(/^\./, "_");

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
  writeFileSync(join(OUT, "FILES", flat(f)), text);
}

// Blast radius. A HEURISTIC on purpose, and labelled as one in the output: it matches the module
// stem, so it over-reports common words and under-reports dynamic imports. It exists so the auditor
// can see who else depends on a changed export WITHOUT the author narrating it.
/**
 * Next.js App Router names every endpoint `route.ts` and every screen `page.tsx`, so the basename
 * carries no identity at all — stem-matching `apps/qr/app/api/board/route.ts` returned **126** files
 * on the first run, which is worse than returning nothing: an auditor skims a wall of noise and stops
 * trusting the section. For those files the identity is the ROUTE, so search the url path instead
 * (`api/board`), which finds the actual callers — the `fetch("/api/board?…")` sites.
 */
const FRAMEWORK_FILE =
  /^(route|page|layout|loading|error|not-found|template|default|global-error)$/;
const MAX_HITS = 40;

function searchTerm(f) {
  const stem = f.split("/").pop().replace(SOURCE_EXT, "");
  if (!FRAMEWORK_FILE.test(stem)) return stem.length >= 4 ? stem : null;
  const m = f.match(/\/app\/(.+)\/[^/]+$/);
  if (!m) return null; // a root-level page/layout has no distinguishing path
  // Route groups like `(order)` never appear in a URL, so they must not appear in the search term.
  const route = m[1]
    .split("/")
    .filter((seg) => !seg.startsWith("("))
    .join("/");
  return route.length >= 4 ? route : null;
}

const dependents = [];
for (const f of present.filter((p) => SOURCE_EXT.test(p))) {
  const term = searchTerm(f);
  if (!term) continue;
  let hits = [];
  try {
    hits = git("grep", "-l", "--", term, "--", "apps", "packages", "supabase", "scripts")
      .split("\n")
      .map((s) => s.trim())
      .filter((h) => h && h !== f && !changed.includes(h));
  } catch {
    /* git grep exits 1 on no match */
  }
  if (hits.length) dependents.push({ file: f, stem: term, hits });
}

writeFileSync(
  join(OUT, "DEPENDENTS.md"),
  [
    "# Blast radius (heuristic)",
    "",
    "Files OUTSIDE the diff that mention a changed module. The search term is the module name, or —",
    "for Next.js `route`/`page`/`layout` files, whose basename carries no identity — the URL path.",
    "Text matching, so it over-reports common words and misses dynamic imports. Leads, not a graph.",
    "",
    ...(dependents.length
      ? dependents.flatMap(({ file, stem, hits }) => [
          `## \`${file}\` (stem \`${stem}\`) — ${hits.length} mention${hits.length === 1 ? "" : "s"}`,
          ...hits.slice(0, MAX_HITS).map((h) => `- \`${h}\``),
          ...(hits.length > MAX_HITS
            ? [`- _…and ${hits.length - MAX_HITS} more — term is too generic to be useful here._`]
            : []),
          "",
        ])
      : ["_No out-of-diff mentions found._", ""]),
  ].join("\n"),
);

writeFileSync(
  join(OUT, "MANIFEST.md"),
  [
    "# Manifest — every file in this bundle",
    "",
    `${files.length} changed, ${present.length} with readable current text.`,
    "",
    "| original path | FILES/ entry |",
    "| --- | --- |",
    ...files.map(
      (f) =>
        `| \`${f}\` | ${present.includes(f) ? `\`${flat(f)}\`` : "_deleted — see DIFF.patch_"} |`,
    ),
    "",
  ].join("\n"),
);

writeFileSync(
  join(OUT, "PROMPT.md"),
  `# Adversarial audit — anonymous submission

You are auditing an anonymous, untrusted code submission. You do not know who wrote it or why, and
no rationale is available to you. Do not ask for one; its absence is deliberate.

Everything you may rely on is in this directory:

- \`DIFF.patch\` — the complete change (${files.length} file${files.length === 1 ? "" : "s"}).
- \`MANIFEST.md\` — **read this first**: every bundled file and its original path. Some entries are
  dotfiles; do not rely on a bare \`ls\` for completeness.
- \`FILES/\` — full current text of each changed file that still exists (${present.length}). Paths are
  flattened, \`/\` becomes \`__\`, and a leading \`.\` becomes \`_\`.
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
  `  DIFF.patch · MANIFEST.md · FILES/ · DEPENDENTS.md (${dependents.length} with out-of-diff mentions) · PROMPT.md`,
);
if (skipped.length) console.log(`  ⚠️  excluded as secret-like: ${skipped.join(", ")}`);
console.log(
  `\nHand the auditor ONLY this directory. Do not summarise the change in your own words.`,
);
