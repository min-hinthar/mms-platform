/**
 * Phase 1c — which door /grocery opens on: Browse (the aisles) or Scan (the camera).
 *
 * The rule is a first-match ladder, and the ORDER is the whole decision:
 *
 *   1. `?tab=scan|browse` → that door ("link"). An explicit link wins over everything, so a shelf or
 *      door sign printed with `/grocery?tab=scan` lands on the camera no matter what this device
 *      chose last visit.
 *   2. The visit's own stored tap (`sessionStorage["mms-grocery-tab"]`) → that door ("chosen"). A tap
 *      outranks a hash, so a reload while on Scan with an aisle hash still in the URL stays on Scan.
 *   3. A syntactic `#aisle-<slug>` → Browse ("aisle-link"): an aisle hash IS a Browse entry.
 *   4. Otherwise the default ("default").
 *
 * WHY BROWSE IS THE DEFAULT. Every barcode in the catalog today is a synthetic 299-prefix code
 * (`docs/GROCERY_MARKET_PLAN.md` §4 — "synthetic 299-prefix codes hold the browse/search path
 * meanwhile"), so a camera pointed at a real shelf label misses almost every time. Scan-first would
 * land every phone on a screen that cannot recognise the shopper's jar. The camera ask waits until
 * the shopper chooses Scan, or arrives through an explicit in-store link.
 *
 * SWITCH-ON CRITERION (OPEN-ITEMS — the scan-first switch-on row filed by Phase 1c; the spec names it
 * G22): shelf labels carry codes that match `grocery_items`, AND `grocery_scan_miss` (fired once per
 * barcode per page life by the Scan door) falls below an agreed share of scans. The PR that flips
 * this constant must ALSO add the device arms this ladder deliberately lacks — a fine pointer, no
 * camera API, or a denied permission all mean Browse — and a pending landing state that holds the
 * camera until the landing resolves, because today the only post-mount flip is browse → scan and the
 * camera therefore never starts on a door that is about to flip away. Flipping only this constant
 * would break that invariant.
 */

export type GroceryDoor = "scan" | "browse";

export const GROCERY_DEFAULT_DOOR: GroceryDoor = "browse";

export type LandingReason = "link" | "chosen" | "aisle-link" | "default";

/** A door name, or null for anything else (a typo'd `?tab=camera`, a corrupted stored value). */
export function parseDoor(raw: string | null | undefined): GroceryDoor | null {
  return raw === "scan" || raw === "browse" ? raw : null;
}

/**
 * The slug of a syntactic `#aisle-<slug>` hash, or null. SYNTAX ONLY — whether the aisle is stocked
 * is `aisleFromHash`'s question (lib/grocery-view.ts), asked once the catalog has loaded.
 */
const AISLE_HASH = /^#aisle-([a-z]+(?:-[a-z]+)*)$/;
export function aisleSlugFromHash(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = AISLE_HASH.exec(raw);
  return m ? (m[1] ?? null) : null;
}

export function groceryLanding(
  i: { tabParam: string | null; stored: string | null; aisleHash: string | null },
  defaultDoor: GroceryDoor = GROCERY_DEFAULT_DOOR,
): { door: GroceryDoor; reason: LandingReason } {
  const linked = parseDoor(i.tabParam);
  if (linked) return { door: linked, reason: "link" };
  const chosen = parseDoor(i.stored);
  if (chosen) return { door: chosen, reason: "chosen" };
  if (aisleSlugFromHash(i.aisleHash)) return { door: "browse", reason: "aisle-link" };
  return { door: defaultDoor, reason: "default" };
}
