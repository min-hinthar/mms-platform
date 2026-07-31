#!/usr/bin/env node
/**
 * W8a — the one-off differential harness that proved the `computeTotals` extraction was
 * behaviour-preserving. Committed so the CHANGELOG's claim is FALSIFIABLE rather than trust-me.
 *
 *   node scripts/w8a-extraction-equivalence.mjs
 *   → "199997 DISTINCT baskets of 200000 compared — 0 divergences"
 *
 * `OLD()` below is the pre-extraction arithmetic transcribed VERBATIM from `origin/main`'s
 * `apps/qr/lib/totals.ts` (commit c9a4553, lines 15-78) — it is deliberately a frozen copy, not an
 * import, so this stays runnable after the original was refactored away. It is NOT a second oracle:
 * `totals-math.test.ts` owns the ongoing invariants. This file answers one historical question —
 * "did the extraction move any charge?" — and the answer is no.
 *
 * Not part of `verify:slice` (it proves a past migration, not a live rule) and not in CI.
 */
// Differential test: the PRE-extraction arithmetic, transcribed verbatim from origin/main, vs the
// new pure seam. Any divergence is a changed charge.
const taxRate = () => 0.0975;

function OLD(items_all, discount, reward, tipRate) {
  const items = items_all.filter((i) => i.state !== "voided" && !i.comped);
  const subtotalCents = items.reduce((a, i) => a + Number(i.unit_price_cents) * i.qty, 0);
  const promoCents = Math.min(discount ?? 0, subtotalCents);
  const rewardCents = Math.min(reward ?? 0, Math.max(subtotalCents - promoCents, 0));
  const discountCents = promoCents + rewardCents;
  const netCents = subtotalCents - discountCents;
  const taxableBaseCents = (items ?? []).reduce(
    (a, i) => a + (Number(i.tax_cents) > 0 ? Number(i.unit_price_cents) * i.qty : 0),
    0,
  );
  const discOnTaxableCents =
    subtotalCents > 0 ? Math.round(discountCents * (taxableBaseCents / subtotalCents)) : 0;
  const taxCents = Math.round((taxableBaseCents - discOnTaxableCents) * taxRate());
  const serviceBaseCents = items.reduce(
    (a, i) => a + (i.fulfillment === "grocery" ? 0 : Number(i.unit_price_cents) * i.qty),
    0,
  );
  const discOnServiceCents =
    subtotalCents > 0 ? Math.round(discountCents * (serviceBaseCents / subtotalCents)) : 0;
  const serviceChargeCents = Math.round((serviceBaseCents - discOnServiceCents) * 0.05);
  const tipCents = serviceBaseCents === 0 ? 0 : Math.round(netCents * tipRate);
  return {
    subtotalCents,
    discountCents,
    rewardCents,
    serviceChargeCents,
    taxCents,
    tipCents,
    totalCents: netCents + serviceChargeCents + taxCents + tipCents,
  };
}

import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { computeTotals } = await import(path.join(ROOT, "apps/qr/lib/totals-math.ts"));

const STATES = ["draft", "fired", "in_progress", "served", "voided"];
const FUL = ["dinein", "togo", "grocery"];
let n = 0,
  bad = 0;
const distinct = new Set();
// deterministic LCG so a failure is reproducible
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260731);
const pick = (a) => a[Math.floor(rnd() * a.length)];

for (let t = 0; t < 200000; t++) {
  const nLines = Math.floor(rnd() * 6);
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    const unit = Math.floor(rnd() * 10000);
    lines.push({
      qty: 1 + Math.floor(rnd() * 9),
      unit_price_cents: unit,
      tax_cents: rnd() < 0.5 ? 0 : Math.round(unit * 0.0975),
      state: pick(STATES),
      comped: rnd() < 0.15,
      fulfillment: pick(FUL),
    });
  }
  const promo = Math.floor(rnd() * 5000);
  const reward = Math.floor(rnd() * 5000);
  const tip = pick([0, 0.15, 0.18, 0.2, 0.3333]);
  const a = OLD(lines, promo, reward, tip);
  const key = JSON.stringify([lines, promo, reward, tip]);
  distinct.add(key);
  const b = computeTotals(
    lines.map((i) => ({
      qty: i.qty,
      unitPriceCents: i.unit_price_cents,
      taxCents: i.tax_cents,
      state: i.state,
      comped: i.comped,
      fulfillment: i.fulfillment,
    })),
    promo,
    reward,
    tip,
  );
  n++;
  for (const k of Object.keys(a)) {
    if (!Object.is(a[k], b[k])) {
      bad++;
      if (bad < 4)
        console.log("DIVERGENCE", k, a[k], "vs", b[k], JSON.stringify(lines), promo, reward, tip);
      break;
    }
  }
}
console.log(`${distinct.size} DISTINCT baskets of ${n} compared — ${bad} divergences`);
process.exit(bad === 0 ? 0 : 1);
