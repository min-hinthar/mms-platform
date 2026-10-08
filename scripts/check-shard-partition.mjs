#!/usr/bin/env node
/**
 * check:shard-partition — do `verify-slice --shard=i/n` shards PARTITION the battery?
 *
 * CI's `verify-slice` check is green when every `verify-slice shard (N)` job is green, and a shard
 * that receives no mutants passes with "0 mutants caught". So a partition that DROPS a mutant (an
 * off-by-one in the greedy placement, a chunk loop that skips a tail) or gives one to two shards
 * reads exactly like a battery that caught everything — the blind pass on the lane's own PR
 * (2026-10-08) found nothing executable checking it. This is that check, from the outside: it asks
 * the script for its full listing and for every shard's listing (`--list` runs no gate, no
 * pre-check and no mutation, so this takes seconds) and requires, for each n, that the shards are
 * disjoint, that their union is exactly the full listing, and that no listing repeats an id.
 *
 * n covers 1 (the degenerate partition), the CI matrix's size (12, today — the matrix may change
 * and the property must hold for any n, so the set is fixed here rather than read from ci.yml), and
 * neighbours that change how heavy suites are chunked (cap = total cost / n / 2).
 *
 * Exit 0 · 1 on any violation.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/verify-slice.mjs");
const NS = [1, 2, 5, 12, 13];

const list = (...args) =>
  execFileSync(process.execPath, [SCRIPT, "--list", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);

const problems = [];
const full = list();
if (full.length === 0) problems.push("the full listing is EMPTY — nothing to partition");
if (new Set(full).size !== full.length) problems.push("the full listing repeats an id");
const want = new Set(full);

for (const n of NS) {
  const owner = new Map();
  for (let i = 1; i <= n; i++) {
    for (const id of list(`--shard=${i}/${n}`)) {
      if (!want.has(id))
        problems.push(`n=${n}: shard ${i} lists "${id}", which the full listing does not`);
      else if (owner.has(id))
        problems.push(`n=${n}: "${id}" is in shard ${owner.get(id)} AND shard ${i}`);
      else owner.set(id, i);
    }
  }
  const missing = full.filter((id) => !owner.has(id));
  if (missing.length)
    problems.push(`n=${n}: ${missing.length} id(s) in NO shard, e.g. "${missing[0]}"`);
}

if (problems.length) {
  console.error(`✗ check:shard-partition — the shards do not partition the battery:\n`);
  for (const p of problems.slice(0, 20)) console.error(`  · ${p}`);
  if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
  process.exit(1);
}
console.log(
  `check:shard-partition … clean (${full.length} mutants; n = ${NS.join(", ")}: disjoint, union = the battery)`,
);
