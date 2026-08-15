#!/usr/bin/env node
/**
 * W16d review BLOCK — the guard that pins the ACTUAL fix.
 *
 * The first cut of this slice shipped `media-url.test.ts` as "inverted red-first" proof. It wasn't:
 * `safeImageUrl` is byte-identical to what it was before the slice, so those assertions passed on
 * main too. The real change is that four MAPPERS stopped filtering — and nothing covered them. A
 * future session re-adding `endsWith("/fallback.jpg") → null` inside `getCartView`'s media map (or
 * copying the pattern onto a new surface) would hide ~34 real dish photos again with `pnpm test`
 * and `verify:slice` fully green. That is the same escape W13 shipped.
 *
 * So the rule is enforced where it can actually be broken: NO code outside `lib/media-url.ts` may
 * mention `fallback.jpg` at all. Cheap (one grep), zero tokens, and it fails on the shape a test
 * cannot see.
 *
 * Red-first: add `.endsWith("/fallback.jpg")` to any mapper and watch this go red before trusting it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["apps", "packages"];
const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".turbo", "coverage"]);

/**
 * The ONE place the filename may be named: the module whose doc comment explains why it is NOT a
 * verdict on the photo. Its own tests may name it too (they pin that a contained one passes).
 */
const ALLOWED = new Set([
  path.join("apps", "qr", "lib", "media-url.ts"),
  path.join("apps", "qr", "lib", "media-url.test.ts"),
]);

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (CODE_EXT.has(path.extname(full))) yield full;
  }
}

const offenders = [];
for (const root of SCAN_ROOTS) {
  const abs = path.join(ROOT, root);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const rel = path.relative(ROOT, file);
    if (ALLOWED.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("fallback.jpg")) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
    });
  }
}

if (offenders.length > 0) {
  console.error(c.red("\n✗ `fallback.jpg` is named outside lib/media-url.ts:\n"));
  for (const o of offenders) console.error("    " + o);
  console.error(
    c.dim(
      "\n  A `fallback.jpg` row is a REAL dish photo (34 of 66 active menu_items, measured against\n" +
        "  prod). W13 filtered them to the placeholder on a wrong assumption and hid real photography\n" +
        "  on every diner surface; W16d removed the filter. Containment lives in `safeImageUrl` and\n" +
        "  never looks at the filename — so no mapper, component or stylesheet should mention it.\n" +
        "  If you genuinely need to (e.g. a migration script), say why here in ALLOWED.\n",
    ),
  );
  process.exit(1);
}

console.log(
  `photo-filter — the filename is not a verdict … ${c.green("clean")}${c.dim(" (no fallback.jpg outside media-url.ts)")}`,
);
