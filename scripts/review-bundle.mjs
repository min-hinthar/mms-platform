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
 * whole reviewable artifact: the raw diff, the full current text of every changed file, an anchored
 * blast radius, and a prompt containing no narrative at all. Hand the auditor THIS DIRECTORY and
 * nothing else, and the isolation holds by construction rather than by good intentions.
 *
 *   pnpm review:bundle                 # vs the merge-base with origin/main
 *   pnpm review:bundle --base <ref>    # vs an explicit ref
 *
 * Writes `.review-bundle/` (gitignored). Exits non-zero on an empty diff — an adversarial pass over
 * nothing is the most expensive kind of green — and on a dirty worktree, because a bundle that
 * silently omits uncommitted edits gets approved for code the PR does not contain.
 *
 * Every guarantee here was broken in review before it was true (Codex round 1 on #224, 9 findings,
 * all real). The comments below name which, because each is a trap the next editor can walk back into.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const OUT = ".review-bundle";
const SOURCE_EXT = /\.(ts|tsx|mjs|js|jsx)$/;
/** Never bundle a file whose name suggests it carries credentials, whatever git says about it. */
const SECRET_LIKE = /(^|\/)\.env|secret|credential|\.pem$|\.key$/i;
/**
 * …but `.env.example` is a TRACKED placeholder and, per `README.md`, the canonical list of
 * environment variables. Excluding it hid a renamed deployment variable from a bundle that called
 * itself complete, so the placeholders are exempt from the secret filter.
 */
const SECRET_EXEMPT = /(^|\/)\.env\.(example|sample|template)$/i;
const isSecret = (f) => SECRET_LIKE.test(f) && !SECRET_EXEMPT.test(f);

const NUL = "\u0000";
const MAX_HITS = 40;
/** Filesystem per-component limit is commonly 255 bytes; stay well inside it. */
const MAX_COMPONENT = 200;
/** Next.js special files whose basename carries no identity — the route path is the identity. */
const FRAMEWORK_FILE =
  /^(route|page|layout|loading|error|not-found|template|default|global-error)$/;

/**
 * `String.prototype.slice` counts UTF-16 code units while the limit above is BYTES, so a path of
 * multibyte characters could still breach the filesystem component limit after "truncation" and throw
 * ENAMETOOLONG — with the previous bundle already deleted (Codex round 3).
 */
function truncateToBytes(str, maxBytes) {
  let out = "";
  let bytes = 0;
  for (const ch of str) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > maxBytes) break;
    out += ch;
    bytes += b;
  }
  return out;
}

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

// The bundle is commit-to-commit, so staged/unstaged edits are invisible to it while PROMPT.md calls
// the result "the complete change". An auditor would approve a bundle, and the missing edits would
// then be committed into the same PR. Same abort `verify:slice` already uses for a dirty target.
const dirty = git("status", "--porcelain").trim();
if (dirty) {
  console.error("review-bundle: worktree is dirty — the bundle would omit uncommitted work.");
  console.error("Commit or stash first, then re-run:\n");
  console.error(dirty);
  process.exit(1);
}

const base = resolveBase(process.argv.slice(2));
const head = git("rev-parse", "HEAD").trim();

// `-z` because git QUOTES non-ASCII paths by default (`café.ts` arrives as `"caf\303\251.ts"`), and a
// newline in a filename splits one path into two. Both corruptions end the same way: a pathspec that
// matches nothing and a manifest that calls a present file deleted.
const raw = git("diff", "--name-status", "-z", "-C", "--find-copies-harder", `${base}..${head}`)
  .split(NUL)
  .filter(Boolean);

/**
 * `--name-status` rather than `--name-only`, because a rename reports ONLY its destination — and that
 * defeats the secret filter outright. Reproduced: `.env.secret` → `safe.txt` put an AWS key into
 * `FILES/safe.txt` under an innocuous name, because only the destination was ever tested (Codex round
 * 2, P1). Records are NUL-separated; a rename or copy carries TWO paths, everything else one.
 *
 * `-C --find-copies-harder` because rename detection is on by default but COPY detection is not, and
 * a copy leaks exactly like a rename did: with `.env.secret` left in place and copied to `safe.txt`,
 * plain `--name-status` reports only `A safe.txt`, so the source never reaches `isSecret` and the
 * credential landed in both DIFF.patch and FILES/. Reproduced (Codex round 3, P1). `--find-copies-harder`
 * is what makes UNCHANGED files eligible as copy sources, which is precisely this case.
 */
const entries = [];
for (let i = 0; i < raw.length; ) {
  const status = raw[i++];
  const from = /^[RC]/.test(status) ? raw[i++] : null;
  const path = raw[i++];
  if (path === undefined) break;
  entries.push({ status, from, path });
}
const changed = entries.map((e) => e.path);

if (changed.length === 0) {
  console.error(
    `review-bundle: no changes between ${base.slice(0, 8)} and HEAD — nothing to review.`,
  );
  process.exit(1);
}

// Secret if EITHER side is: the filter must not be escapable by renaming out of a matching name.
const secretEntries = entries.filter((e) => isSecret(e.path) || (e.from && isSecret(e.from)));
const secretSet = new Set(secretEntries.map((e) => e.path));
const files = changed.filter((f) => !secretSet.has(f));
// BOTH sides go into the exclusion pathspec, or the patch still carries the old blob's content.
const omittedPaths = [
  ...new Set(secretEntries.flatMap((e) => (e.from ? [e.from, e.path] : [e.path]))),
];
const omittedDisplay = secretEntries.map((e) => (e.from ? `${e.from} → ${e.path}` : e.path));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "FILES"), { recursive: true });

/**
 * EXCLUDE the secret-like paths rather than allow-listing the rest. Two defects lived in the
 * allow-list form:
 *   · with every changed path secret-like, the allow-list was empty and `git diff <range> --` has no
 *     pathspec at all — so git emitted the UNRESTRICTED diff and wrote the credential into the patch
 *     the bundle swears never contains one;
 *   · restricting to destination paths rendered a pure rename as an addition with no deletion, so the
 *     auditor could not see that the old module had disappeared.
 * `:(exclude,literal)` keeps the path literal, so a glob character in a filename cannot widen it.
 */
const patch = git(
  "diff",
  `${base}..${head}`,
  "--",
  ".",
  ...omittedPaths.map((f) => `:(exclude,literal)${f}`),
);
writeFileSync(join(OUT, "DIFF.patch"), patch);

/**
 * Flattening `a/b` to `a__b` is ambiguous: `a/b__c.ts` and `a__b/c.ts` both land on `a__b__c.ts`, and
 * the second write silently destroys the first while MANIFEST claims both are present. Names are
 * therefore assigned once, up front, with collisions disambiguated. The leading-dot strip is the
 * other half: `.claude/LEARNINGS.md` flattened to a HIDDEN file, so `ls FILES/` showed 5 of 8 inputs.
 */
const bundleName = new Map();
{
  const taken = new Set();
  for (const f of files) {
    let stem = f.replace(/\//g, "__").replace(/^\./, "_");
    // A deep path flattens into ONE component and can breach the filesystem's 255-byte limit, so
    // writeFileSync throws ENAMETOOLONG *after* the previous bundle was removed — leaving no bundle
    // at all rather than a degraded one.
    if (Buffer.byteLength(stem) > MAX_COMPONENT) {
      const digest = createHash("sha1").update(f).digest("hex").slice(0, 8);
      stem = `${truncateToBytes(stem, MAX_COMPONENT - 12)}~${digest}`;
    }
    let name = stem;
    for (let i = 2; taken.has(name); i++) name = `${stem}~${i}`;
    taken.add(name);
    bundleName.set(f, name);
  }
}

// Full current text, not just the hunk: a defect is usually visible only against the function that
// contains it, and the auditor must be able to quote rather than paraphrase.
const present = [];
const binary = [];
for (const f of files) {
  // `git show` is authoritative for "present at HEAD"; `existsSync` was not — it FOLLOWS a symlink,
  // so a changed-but-dangling one (target removed in the same commit, or deployment-only) reported
  // false and got labelled deleted while its blob was perfectly readable.
  let text;
  try {
    text = git("show", `${head}:${f}`);
  } catch {
    continue; // genuinely absent at HEAD — it lives in DIFF.patch only
  }
  if (text.includes(NUL)) {
    // Present at HEAD but unreadable as text. It must NOT fall through to the manifest's deleted
    // branch: reporting a changed PNG or font as "deleted", while the patch says only "Binary files
    // differ", is a materially false account of the change (Codex round 3).
    binary.push(f);
    continue;
  }
  present.push(f);
  writeFileSync(join(OUT, "FILES", bundleName.get(f)), text);
}

/**
 * The search term for a changed file. A dynamic segment must be dropped, not searched: callers write
 * `/staff/table/${id}`, never the literal `[id]`, and `git grep` reads `[id]` as a character class —
 * so `staff/table/[id]` matched a file containing `staff/table/i` and missed every real caller.
 * Truncating at the first dynamic segment leaves the stable prefix, which is what callers share.
 */
function searchTerm(f) {
  const stem = f.split("/").pop().replace(SOURCE_EXT, "");
  if (!FRAMEWORK_FILE.test(stem)) return stem.length >= 4 ? stem : null;
  const m = f.match(/\/app\/(.+)\/[^/]+$/);
  if (!m) return null; // a root-level page/layout has no distinguishing path
  const segs = [];
  for (const seg of m[1].split("/")) {
    if (seg.includes("[")) break; // dynamic — stop at the stable prefix
    if (seg.startsWith("(")) continue; // a route group never appears in a URL
    segs.push(seg);
  }
  const route = segs.join("/");
  return route.length >= 4 ? route : null;
}

/**
 * Blast radius WITH LINE ANCHORS. Filenames alone were unusable: the auditor's evidence standard
 * demands a `file:line` quote from the material it was given, and it is told not to read outside the
 * bundle — so an architectural finding could only ever be downgraded to an open question. `-F` keeps
 * the term a fixed string (see `searchTerm`), `-n` gives the anchor.
 */
/**
 * Deleted and renamed-FROM paths matter most here and have no file snapshot at all: an unchanged
 * caller still importing a module that just vanished is exactly the regression the architectural lens
 * exists to catch, and preserving the rename in the patch does not search the old name. Terms come
 * from the union, not from `present`.
 */
const searchTargets = [
  ...new Set([
    ...present,
    ...entries.filter((e) => e.status.startsWith("D")).map((e) => e.path),
    ...entries.filter((e) => e.from).map((e) => e.from),
  ]),
].filter((t) => SOURCE_EXT.test(t) && !secretSet.has(t));

const dependents = [];
for (const f of searchTargets) {
  const term = searchTerm(f);
  if (!term) continue;
  let lines = [];
  try {
    lines = git("grep", "-n", "-F", "-e", term, "--", "apps", "packages", "supabase", "scripts")
      .split("\n")
      .filter(Boolean);
  } catch {
    /* git grep exits 1 on no match */
  }
  const hits = [];
  for (const raw of lines) {
    const at = raw.indexOf(":");
    const at2 = raw.indexOf(":", at + 1);
    if (at < 0 || at2 < 0) continue;
    const path = raw.slice(0, at);
    if (path === f || changed.includes(path)) continue;
    hits.push({ path, line: raw.slice(at + 1, at2), text: raw.slice(at2 + 1).trim() });
  }
  if (hits.length) dependents.push({ file: f, term, hits });
}

writeFileSync(
  join(OUT, "DEPENDENTS.md"),
  [
    "# Blast radius (heuristic)",
    "",
    "Lines OUTSIDE the diff that mention a changed module. The search term is the module name, or —",
    "for Next.js `route`/`page`/`layout` files, whose basename carries no identity — the URL path,",
    "truncated at the first dynamic segment. Fixed-string matching, so it over-reports common words",
    "and misses dynamic imports. Leads with anchors, not a dependency graph.",
    "",
    ...(dependents.length
      ? dependents.flatMap(({ file, term, hits }) => [
          `## \`${file}\` (searched \`${term}\`) — ${hits.length} line${hits.length === 1 ? "" : "s"}`,
          ...hits.slice(0, MAX_HITS).map((h) => `- \`${h.path}:${h.line}\` — \`${h.text}\``),
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
        `| \`${f}\` | ${
          present.includes(f)
            ? `\`${bundleName.get(f)}\``
            : binary.includes(f)
              ? "_binary — present at HEAD, see DIFF.patch_"
              : "_deleted — see DIFF.patch_"
        } |`,
    ),
    "",
    // The omission has to be visible INSIDE the bundle. It used to be a stdout warning the auditor
    // never sees, so the bundle could hide a changed file while advertising completeness.
    ...(omittedDisplay.length
      ? [
          "## Deliberately omitted (secret-like paths)",
          "",
          "These changed but are **not** in `DIFF.patch` or `FILES/`. If the change under review",
          "depends on them, say so and stop — do not assume they are unrelated.",
          "",
          ...omittedDisplay.map((f) => `- \`${f}\``),
          "",
        ]
      : []),
  ].join("\n"),
);

writeFileSync(
  join(OUT, "PROMPT.md"),
  `# Adversarial audit — anonymous submission

You are auditing an anonymous, untrusted code submission. You do not know who wrote it or why, and
no rationale is available to you. Do not ask for one; its absence is deliberate.

Everything you may rely on is in this directory:

- \`MANIFEST.md\` — **read this first**: every bundled file, its original path, and anything
  deliberately omitted. Some entries are dotfiles; do not rely on a bare \`ls\` for completeness.
- \`DIFF.patch\` — the complete change (${files.length} file${files.length === 1 ? "" : "s"}), renames intact.
- \`FILES/\` — full current text of each changed file that still exists (${present.length}).
- \`DEPENDENTS.md\` — blast radius with \`file:line\` anchors and the matching source line, so an
  architectural finding can be evidenced without reading outside this bundle.

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
if (omittedDisplay.length)
  console.log(`  ⚠️  omitted as secret-like (listed in MANIFEST): ${omittedDisplay.join(", ")}`);
console.log(
  `\nHand the auditor ONLY this directory. Do not summarise the change in your own words.`,
);
