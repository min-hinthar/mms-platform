/**
 * The environment a test file will ACTUALLY run in — one implementation, two callers.
 *
 * ## Why this is a module and not two matchers
 *
 * `scripts/verify-slice.mjs` and the orphan step in `.github/workflows/ci.yml` both have to answer
 * this question, and the first draft answered it twice — once in JS, once in POSIX ERE. The blind
 * adversarial pass on #252 found that the two DISAGREE in a way that matters, because only one of
 * them gates a merge:
 *
 *   • JS `\s` spans newlines; `grep` is line-oriented. A pragma whose environment word sits on the
 *     NEXT line is honoured by vitest, caught by verify:slice, and MISSED by CI — the looser mirror
 *     being the one CI runs.
 *   • The trailing `\b` diverges too: on `@vitest-environment jsdom-`, JS backtracks and captures
 *     `jsdom` (pass) while the shell captures `jsdom-` (fail).
 *
 * "The two agree by construction" was a claim about the word EXTRACTION, not about the match. Now it
 * is true of both, because there is only one.
 *
 * ## Why a regex at all, when this repo's rule is that guards PARSE
 *
 * Because the guarded fact IS text. Vitest reads this control comment out of the RAW FILE TEXT
 * before any parse, and takes the FIRST match with no docblock-position constraint. A parser would
 * be LESS faithful — it would ignore a pragma inside a string literal or a JSX text node that vitest
 * honours. The matcher below is a verbatim copy of vitest's own; update it when that one changes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Verbatim from vitest's runtime (`vitest/dist/chunks/cli-api.*.js`). */
export const PRAGMA = /@(?:vitest|jest)-environment\s+([\w-]+)\b/;

/**
 * The environment vitest will use for `src`: the FIRST pragma's word, or `null` for the config
 * default. `null` is not "no pragma" — it is "whatever the project config says", which for both
 * workspaces here is `node`.
 */
export const declaredEnv = (src) => src.match(PRAGMA)?.[1] ?? null;

/**
 * Complaints about a set of test files, as printable strings. Empty means every file will run in the
 * environment its SUFFIX promises.
 *
 * ⚠️ The `.test.ts` rule is a ban, not a preference, and the reason is the unanchored matcher above:
 * this repo writes long explanatory comments in test files, so a `.test.ts` that merely MENTIONS the
 * phrase switches environment with no count change, no timing change and no other symptom. Requiring
 * the DOM cases to carry the `.tsx` suffix makes the environment legible from the filename.
 *
 * ⚠️ A workspace whose vitest config does not include `*.test.tsx` has no legal DOM test at all —
 * `packages/ui` is in exactly that position today. That is deliberate (it has no jsdom dependency,
 * so a `.test.tsx` there would fail at resolution), and the message says so rather than sending the
 * reader to a suffix that is rejected two rules earlier as an orphan.
 */
export function envFailures({ tsFiles, tsxFiles, read = (f) => readFileSync(f, "utf8") }) {
  const out = [];
  for (const f of tsFiles) {
    const env = declaredEnv(read(f));
    if (env !== null)
      out.push(
        `${f} — a .test.ts runs in the config's environment (node); it must not declare "${env}". ` +
          `For a DOM test, add it under apps/qr as a .test.tsx; to give another workspace DOM tests, ` +
          `widen THAT workspace's vitest include and add jsdom to it first.`,
      );
  }
  for (const f of tsxFiles) {
    const env = declaredEnv(read(f));
    if (env !== "jsdom")
      out.push(
        `${f} — declares ${env ?? "no environment"}, expected an opening ` +
          `/** @vitest-environment jsdom */ (the config default is node, where the first render throws).`,
      );
  }
  return out;
}

/** Every tracked-or-untracked-but-not-ignored file matching `pattern`, repo-relative. */
const ls = (root, pattern) =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", pattern], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * CLI, so `ci.yml` runs the SAME code `verify:slice` does instead of a POSIX-ERE paraphrase of it.
 * ⚠️ `git ls-files -- '*.test.ts'` does NOT match `.test.tsx` (measured), so the two pathspecs are
 * separate enumerations, not one looser filter.
 */
export function main(root) {
  const failures = envFailures({
    tsFiles: ls(root, "*.test.ts").map((f) => path.join(root, f)),
    tsxFiles: ls(root, "*.test.tsx").map((f) => path.join(root, f)),
  }).map((m) => m.replace(`${root}/`, ""));
  if (failures.length === 0) {
    console.log("test environments — every file runs where its suffix says.");
    return 0;
  }
  console.error("::error::Test file(s) that will run in the wrong environment:");
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")));
