#!/usr/bin/env node
/**
 * Generates `docs/data/MENU_REFERENCE.md` — the single human-readable record of what we sell: our
 * live catalog joined to the owner's real PayPal/Zettle POS data (Jan–Jul 2026 sales + the 2025
 * report), so a price question or a "do we already have this dish?" question is one file lookup.
 *
 * Two inputs, both committed beside the output:
 *   • `docs/data/menu_catalog.json`     — a snapshot of prod `menu_items` (+ category, photo, mods)
 *   • `docs/data/pos_2026_prices.json`  — per-item POS price + dine/togo rings + units sold
 *
 * The join is on the **Burmese name**, not the English one. POS English labels and ours diverge
 * freely (POS "Chicken Liver ကြက်သဲမြစ်" is our "Chicken Giblets Curry ကြက်အသဲမြစ်"), while the
 * Burmese is what the kitchen and the owner actually use. Matching is substring-either-direction on
 * the Myanmar-script run with whitespace and zero-width joiners stripped — deliberately loose, and
 * every match is PRINTED in the doc so a wrong one is visible rather than silent.
 *
 * Usage:
 *   node scripts/gen-menu-reference.mjs           # write the doc
 *   node scripts/gen-menu-reference.mjs --check    # fail if the doc is stale (used by check:docs)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const OUT = "docs/data/MENU_REFERENCE.md";
// M135 — the second generated output: the owner's POS units, as a popularity ORDER the app reads.
// Emitted from the SAME join as the doc so the two can never disagree about which POS row is which
// dish, and checked by the same `--check` so a stale one fails `pnpm check:docs`.
const POP_OUT = "apps/qr/lib/menu/pos-popularity.json";

const catalog = read("docs/data/menu_catalog.json");
const pos = read("docs/data/pos_2026_prices.json");

// ── allergen codes must be canonical ────────────────────────────────────────────────────────────
// The free-from chips rule on EXACT codes (`dietary.ts` FREE_FROM_ALLERGENS), and a non-empty
// allergen list disables the unknown-is-unsafe fail-safe — so a near-miss code (`gluten` for
// `gluten_wheat`) makes a dish that DECLARES the allergen pass the free-from chip. That shipped
// once (bean-fritters, caught in review; veggie-fritters carried it from the seed). This list
// mirrors ItemSheet's ALLERGEN_LABEL; a new legit code is added in both places or this fails.
const KNOWN_ALLERGENS = new Set([
  "shellfish",
  "fish",
  "egg",
  "soy",
  "peanuts",
  "dairy",
  "tree_nuts",
  "gluten_wheat",
  "sesame",
]);
for (const i of catalog) {
  const bad = (i.allergens ?? []).filter((a) => !KNOWN_ALLERGENS.has(a));
  if (bad.length) {
    console.error(`menu reference … UNKNOWN allergen code(s) on ${i.slug}: ${bad.join(", ")}`);
    process.exit(1);
  }
}

// ── the Burmese join key ────────────────────────────────────────────────────────────────────────
// Keep only Myanmar-block codepoints (U+1000–U+109F), drop ZWSP/ZWNJ/ZWJ and spaces, then NFC-
// normalize: Myanmar asat + dot-below order differently byte-wise (`န့်` as 103A-1037 vs 1037-103A)
// while rendering identically, so a byte comparison calls two spellings of the same dish different
// (that hid Rakhine Mont-Ti, 126 units, behind "unmatched"). A catalog name may carry two dishes
// separated by "/" — split so either half can match.
const myOnly = (s) =>
  [...(s ?? "")]
    .filter((ch) => ch >= "က" && ch <= "႟")
    .join("")
    .normalize("NFC");
const keysOf = (name) =>
  String(name ?? "")
    .split("/")
    .map(myOnly)
    .filter((k) => k.length >= 3);

// EXACT = the Burmese names are the same string; APPROX = one contains the other. Approx is kept
// for discovery but never drives a price conclusion: "ပဲပြုတ်" (White Peas) is a substring of
// "ပဲပြုတ်ထမင်းကြော်" (Burmese Fried Rice), which would otherwise report a $12-vs-$5 "delta"
// between two different dishes.
function matchPos(item) {
  const ours = keysOf(item.name_my);
  if (ours.length === 0) return [];
  const out = [];
  for (const p of pos) {
    const theirs = keysOf(p.pos);
    if (theirs.some((t) => ours.includes(t))) out.push({ p, exact: true });
    else if (theirs.some((t) => ours.some((o) => o.includes(t) || t.includes(o))))
      out.push({ p, exact: false });
  }
  return out;
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const posUsd = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);
// A table cell can't hold a raw pipe, and an empty cell breaks the column count.
const cell = (s) => (s == null || s === "" ? "—" : String(s).replace(/\|/g, "\\|"));

// ── the doc ─────────────────────────────────────────────────────────────────────────────────────
const matchedPos = new Set();
const byCategory = new Map();
for (const item of catalog) {
  if (!byCategory.has(item.category)) byCategory.set(item.category, []);
  byCategory.get(item.category).push(item);
}

const lines = [];
lines.push("# Menu reference — our catalog × the real POS data");
lines.push("");
lines.push(
  "**Generated — do not hand-edit.** Run `node scripts/gen-menu-reference.mjs` after changing either",
);
lines.push(
  "input; `pnpm check:docs` fails if this file drifts from them. Inputs: [`menu_catalog.json`](menu_catalog.json)",
);
lines.push("(a snapshot of prod `menu_items`) and [`pos_2026_prices.json`](pos_2026_prices.json)");
lines.push("(the owner's PayPal/Zettle exports).");
lines.push("");
lines.push(
  "**Pricing rule (W17a).** One price per dish — what the register rings. Dine-in and to-go",
);
lines.push(
  "are the SAME price; what differed in the POS exports was the tax column (dine-in 25.5% = 10.5%",
);
lines.push(
  "sales tax + a 15% dine-in service charge, since retired; to-go 10.5%). The `POS dine` / `POS togo`",
);
lines.push("columns below are the observed ring prices — where they disagree, see §Price deltas.");
lines.push("");
lines.push(
  "**How the join works.** POS rows are matched to our items on the **Burmese** name (substring,",
);
lines.push(
  "either direction) — English labels diverge between the two systems. A match printed WITHOUT `≈`",
);
lines.push(
  "is an exact Burmese-name match; `≈` means one name merely contains the other (kept for discovery,",
);
lines.push(
  "never used to conclude anything about price). Use this when adding items: an exact Burmese match",
);
lines.push("means we already carry the dish, whatever the English label says.");
lines.push("");

const totals = { items: catalog.length, photo: 0, sold_out: 0, inactive: 0 };
for (const i of catalog) {
  if (i.has_photo) totals.photo++;
  if (i.is_sold_out) totals.sold_out++;
  if (!i.is_active) totals.inactive++;
}

lines.push("## Our catalog");
lines.push("");
for (const [category, items] of [...byCategory.entries()].sort(
  (a, b) => (a[1][0]?.cat_sort ?? 999) - (b[1][0]?.cat_sort ?? 999),
)) {
  lines.push(`### ${category}`);
  lines.push("");
  lines.push(
    "| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const i of items.sort((a, b) => a.name_en.localeCompare(b.name_en))) {
    const hits = matchPos(i);
    hits.forEach((h) => matchedPos.add(h.p.pos));
    // An exact match always outranks an approximate one. AMONG exact matches, prefer the row that
    // rings OUR price, then volume: one dish can own several exact-named POS rows (ပဲပြုတ်ထမင်းဆီဆမ်း
    // is both the $10 dish and a $100 catering tray), and ranking by volume alone puts the tray's
    // price beside the dish.
    const agrees = (p) => Math.round((p.price ?? 0) * 100) === i.base_price_cents;
    const ranked = hits.sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        Number(agrees(b.p)) - Number(agrees(a.p)) ||
        b.p.qty - a.p.qty,
    );
    const top = ranked[0];
    const best = top?.p;
    // W21d (Codex P2 on #187) — the units column follows the SAME price-agreement distinction as
    // the displayed price: summing every exact-name hit attributed a $100 catering tray's 20 units
    // to the $10 dish (oil-rice-with-peas read 26 when the dish sold 6). When at least one exact
    // row rings OUR price, only agreeing rows count; when none does (a price we deliberately
    // diverge on), all exact rows still count — zero would misread as "never sold".
    const exactHits = ranked.filter((h) => h.exact);
    const agreeing = exactHits.filter((h) => agrees(h.p));
    const qty = (agreeing.length > 0 ? agreeing : exactHits).reduce((a, h) => a + h.p.qty, 0);
    lines.push(
      `| ${cell(i.name_en)}${i.is_sold_out ? " ⛔" : ""}${i.is_active ? "" : " (inactive)"} | ${cell(i.name_my)} | ${usd(i.base_price_cents)} | ${cell(i.tax_category)} | ${i.mod_groups} | ${i.has_photo ? "✅" : "❌"} | ${cell((i.tags ?? []).join(" · "))} | ${cell((i.allergens ?? []).join(" · "))} | ${top ? `${top.exact ? "" : "≈ "}${cell(best.pos)}` : "—"} | ${best ? posUsd(best.price) : "—"} | ${best ? `${posUsd(best.dine)} / ${posUsd(best.togo)}` : "—"} | ${qty || "—"} |`,
    );
  }
  lines.push("");
}

// ── price deltas (ours vs the POS ring) ─────────────────────────────────────────────────────────
const deltas = [];
for (const i of catalog) {
  // EXACT matches only — an approximate name match is not evidence about price. And a delta is
  // flagged only when NO exact ring agrees with ours: when one exact row is the dish at our price
  // and another is a differently-priced ring under the same name (the $100 catering tray), the
  // agreeing row settles it — flagging the tray would put a false delta on a correctly-priced dish.
  const exacts = matchPos(i)
    .filter((h) => h.exact)
    .map((h) => h.p)
    .filter((p) => p.price != null);
  if (exacts.length === 0) continue;
  if (exacts.some((p) => Math.round(p.price * 100) === i.base_price_cents)) continue;
  const best = exacts.sort((a, b) => b.qty - a.qty)[0];
  const posCents = Math.round(best.price * 100);
  deltas.push({ i, best, posCents });
}
lines.push("## Price deltas — our catalog vs the POS ring");
lines.push("");
if (deltas.length === 0) {
  lines.push("None: every matched item is priced exactly as the register rings it.");
} else {
  lines.push("Ours is authoritative for the app; the POS column is what the register charged.");
  lines.push(
    "Exact Burmese-name matches only — an approximate (`≈`) match is not evidence about price.",
  );
  lines.push("A row here is a question for the owner, not automatically a bug.");
  lines.push("");
  lines.push("| Dish | မြန်မာ | Ours | POS | Δ | 2026 units |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const d of deltas.sort((a, b) => b.best.qty - a.best.qty)) {
    const diff = d.posCents - d.i.base_price_cents;
    lines.push(
      `| ${cell(d.i.name_en)} | ${cell(d.i.name_my)} | ${usd(d.i.base_price_cents)} | ${usd(d.posCents)} | ${diff > 0 ? "+" : "−"}${usd(Math.abs(diff))} | ${d.best.qty} |`,
    );
  }
}
lines.push("");

// ── dine vs togo disagreements in the POS data itself ───────────────────────────────────────────
const modeDiff = pos.filter((p) => p.dine && p.togo && Math.abs(p.dine - p.togo) > 0.005);
lines.push("## POS items whose dine-in and to-go rings disagree");
lines.push("");
lines.push(
  `Of ${pos.filter((p) => p.dine && p.togo).length} POS items sold BOTH ways in Jan–Jul 2026, ${pos.filter((p) => p.dine && p.togo).length - modeDiff.length} ring identically.`,
);
lines.push("The rest are the candidates for a per-mode price (W17b) — low-volume ones are likely");
lines.push("register anomalies (a tray/party ring), not a real two-price policy.");
lines.push("");
lines.push("| POS item | Dine-in | To-go | Δ | 2026 units |");
lines.push("| --- | --- | --- | --- | --- |");
for (const p of modeDiff.sort((a, b) => b.qty - a.qty)) {
  lines.push(
    `| ${cell(p.pos)} | ${posUsd(p.dine)} | ${posUsd(p.togo)} | ${posUsd(Math.abs(p.dine - p.togo))} | ${p.qty} |`,
  );
}
lines.push("");

// ── POS items with no catalog match ─────────────────────────────────────────────────────────────
const unmatched = pos.filter((p) => !matchedPos.has(p.pos)).sort((a, b) => b.qty - a.qty);
lines.push("## POS items with no match in our catalog");
lines.push("");
lines.push(
  `${unmatched.length} of ${pos.length} POS items did not match any catalog item on the Burmese name.`,
);
lines.push("This is the W17d backlog — but READ each row before adding it: some are modifiers");
lines.push("(an egg add-on), some are alcohol, some are combo/tray rings, and some are a dish we");
lines.push(
  "already carry under a Burmese spelling the loose match missed. Verify, don't bulk-import.",
);
lines.push("");
lines.push("| POS item | Price | Dine / To-go | 2026 units | Variants |");
lines.push("| --- | --- | --- | --- | --- |");
for (const p of unmatched) {
  lines.push(
    `| ${cell(p.pos)} | ${posUsd(p.price)} | ${posUsd(p.dine)} / ${posUsd(p.togo)} | ${p.qty} | ${cell((p.variants ?? []).join(" · "))} |`,
  );
}
lines.push("");

lines.push("## Counts");
lines.push("");
lines.push("| Measure | Count |");
lines.push("| --- | --- |");
lines.push(`| Catalog items | ${totals.items} |`);
lines.push(`| …with a photo | ${totals.photo} |`);
lines.push(`| …needing photography | ${totals.items - totals.photo} |`);
lines.push(`| …sold out right now | ${totals.sold_out} |`);
lines.push(`| …inactive | ${totals.inactive} |`);
lines.push(`| POS items (Jan–Jul 2026) | ${pos.length} |`);
lines.push(`| …matched to a catalog item | ${pos.length - unmatched.length} |`);
lines.push(`| …unmatched (W17d backlog) | ${unmatched.length} |`);
lines.push("");

const doc = lines.join("\n");

/**
 * ── M135 · POS popularity ────────────────────────────────────────────────────────────────────────
 * Owner: "you can refer to the actual paypal pos data insights for the menu items for most ordered
 * items, instead of ranking them or numbering."
 *
 * EXACT Burmese matches only. This file's own rule for prices — approx matches are "kept for
 * discovery, never used to conclude anything" — applies at least as hard to a units count: the
 * loose key `ပဲပြုတ်` (White Peas) is a substring of `ပဲပြုတ်ထမင်းကြော်` (Burmese Fried Rice), so an
 * approx join would hand one dish's sales to another and then ORDER THE MENU by it.
 *
 * Summed across a dish's exact matches, because a dish can legitimately ring as more than one POS
 * row (Kyay-O / Si-Chat is two). Verified at generation time that no POS row is claimed by two
 * dishes, so nothing is double-counted; the assert below keeps that true if either input changes.
 *
 * Keyed by SLUG, not by menu-item id: the catalog snapshot and prod share slugs (97/97 distinct,
 * measured), while ids would rot the moment an item is recreated. The app maps slug → id against
 * the live menu it already loaded.
 */
const claimedBy = new Map();
const popularity = [];
for (const item of catalog) {
  const ours = keysOf(item.name_my);
  if (ours.length === 0) continue;
  const exact = pos.filter((p) => keysOf(p.pos).some((t) => ours.includes(t)));
  if (exact.length === 0) continue;
  const qty = exact.reduce((sum, p) => sum + (p.qty ?? 0), 0);
  if (qty <= 0) continue; // a matched row with no sales is not a popularity signal
  for (const p of exact) claimedBy.set(p.pos, [...(claimedBy.get(p.pos) ?? []), item.slug]);
  popularity.push({ slug: item.slug, qty });
}
const doubleClaimed = [...claimedBy].filter(([, slugs]) => slugs.length > 1);
if (doubleClaimed.length) {
  console.error(
    "menu reference … a POS row is claimed by more than one dish, so its units would be counted twice:\n" +
      doubleClaimed.map(([row, slugs]) => `  ${row} -> ${slugs.join(", ")}`).join("\n"),
  );
  process.exit(1);
}
// Most-sold first; slug breaks a tie so the file is byte-stable across runs.
popularity.sort((a, b) => b.qty - a.qty || a.slug.localeCompare(b.slug));
const popDoc = JSON.stringify(popularity, null, 2) + "\n";

const outputs = [
  [OUT, doc],
  [POP_OUT, popDoc],
];

if (process.argv.includes("--check")) {
  for (const [path, want] of outputs) {
    let current = "";
    try {
      current = readFileSync(join(root, path), "utf8");
    } catch {
      /* missing file — reported as stale below */
    }
    if (current !== want) {
      console.error(
        `menu reference … STALE — ${path} does not match its inputs. Run: node scripts/gen-menu-reference.mjs`,
      );
      process.exit(1);
    }
  }
  console.log("menu reference … fresh");
} else {
  for (const [path, want] of outputs) writeFileSync(join(root, path), want);
  console.log(
    `wrote ${OUT} — ${catalog.length} catalog items, ${pos.length} POS items; ` +
      `${POP_OUT} — ${popularity.length} ranked by POS units`,
  );
}
