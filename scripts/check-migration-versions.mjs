#!/usr/bin/env node
/**
 * check:migration-versions — two filename rules the Supabase CLI enforces only at APPLY time.
 *
 * A migration's VERSION is its filename's leading timestamp, and `supabase_migrations.schema_migrations`
 * is keyed on it alone. Two files sharing a prefix therefore apply fine right up to the second INSERT,
 * which fails with `duplicate key value violates unique constraint "schema_migrations_pkey"` — after
 * the CI job has pulled images, started a stack and replayed every migration. That is a ~1 minute
 * round trip plus a red PR for a fact that is visible in `ls`, and it is exactly how M17's first push
 * failed: `20260824000000_advisor_sweep.sql` already existed and `20260824000000_m17_*.sql` collided
 * with it. Nothing local caught it, because nothing local looked.
 *
 * The second rule is the one the delivery repo learned the hard way and wrote down: a file whose name
 * does not match `<timestamp>_name.sql` is SILENTLY SKIPPED by the CLI — it never applies, and no
 * error is raised at any point. A trailing character is enough.
 *
 * Both are pure filename facts, so this costs milliseconds and needs no database.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase/migrations");
const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

process.stdout.write("migration versions — unique + CLI-visible … ");

// EVERY entry, not just the `.sql` ones (Codex round 2, P2). The first cut filtered on
// `.endsWith(".sql")` and THEN checked the shape — which removed from consideration exactly the
// malformed names this script exists to catch. `20260826000000_example.sqlx` is skipped by the
// Supabase CLI *and* was skipped by this checker, which then printed `clean`: green for the wrong
// reason, inside the guard written to prevent green for the wrong reason. The red-first probe missed
// it because the probe's filename ended in `.sql`, so it only ever exercised the half that worked.
const files = readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name);
const problems = [];

// 1. the shape the CLI actually matches. Anything else never applies, and says nothing about it.
const SHAPE = /^\d{14}_[A-Za-z0-9_-]+\.sql$/;
for (const f of files.filter((f) => !SHAPE.test(f))) {
  problems.push(
    `${f} — does not match <14-digit timestamp>_name.sql, so the CLI SKIPS it silently`,
  );
}

// 2. one version, one file — over the files the CLI would actually apply.
const byVersion = new Map();
for (const f of files.filter((f) => SHAPE.test(f))) {
  const v = f.slice(0, 14);
  byVersion.set(v, [...(byVersion.get(v) ?? []), f]);
}
for (const [v, group] of byVersion) {
  if (group.length > 1) {
    problems.push(`version ${v} is claimed by ${group.length} files: ${group.sort().join(", ")}`);
  }
}

if (problems.length === 0) {
  console.log(
    c.green("clean") + c.dim(` (${files.length} migrations, ${byVersion.size} versions)`),
  );
  process.exit(0);
}
console.log(c.red("FAIL"));
for (const p of problems) console.log(`  ${c.red("✗")} ${p}`);
console.log(
  c.dim(
    "\n  A duplicate version fails at INSERT into supabase_migrations.schema_migrations — after a\n" +
      "  whole stack has started. A malformed name never applies at all, and reports nothing.\n",
  ),
);
process.exit(1);
