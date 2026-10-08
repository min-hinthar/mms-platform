import type { ScanAddFailure } from "@/lib/grocery";
import type { CachedCatalogItem } from "@/lib/grocery-catalog-cache";
import { t } from "@/lib/i18n";

/**
 * Phase 1c — what sits in the Scan door's result bar, inside the viewfinder where the shopper is
 * looking. Before this, every catalog miss was a 1.8s toast and nothing else; with a catalog whose
 * barcodes are synthetic (GROCERY_MARKET_PLAN §4) a real shelf barcode misses almost every time, so
 * the common outcome vanished before the shopper looked up from the jar.
 *
 * The slot is PAGE state, written at every outcome in `add()` through `slotAfter`, so a miss followed
 * by a repeat shows the chip again and "Add another" is always where the eye is. The bar is never a
 * live region: the toast is the view's announcement, the bar is what persists.
 */

/** The three catalog misses a shopper can act on. Never a price — a notice is not a quote. */
export type ScanNotice = { kind: "unknown" | "weighed" | "unavailable"; barcode: string };

export function scanNoticeFor(reason: ScanAddFailure, barcode: string): ScanNotice | null {
  switch (reason) {
    case "unknown_barcode":
      return { kind: "unknown", barcode };
    case "weighed_item":
      return { kind: "weighed", barcode };
    case "unavailable":
      return { kind: "unavailable", barcode };
    default:
      // A basket reason (locked / settling / paid / cancelled / expired / unreadable) is about the
      // BASKET, not this barcode — the page's banner, strip and toast own those.
      return null;
  }
}

/** `key` re-keys the bar per outcome so each new one arrives (`.mms-rise`). */
export type ScanSlot =
  | { kind: "chip"; key: number }
  | { kind: "notice"; notice: ScanNotice; key: number }
  | null;

export type ScanOutcome = "ok" | "repeat" | "queued" | ScanAddFailure | "transport";
export type ScanVia = "scan" | "rescan" | "search" | "browse";

/** Did this attempt come off a SHELF — the camera, or its "Add another"? The ONE rule behind both
 *  the in-stage notice (a Browse or search miss never plants one on the hidden Scan door) and the
 *  `grocery_scan_miss` harvest of real shelf codes (G22's switch-on measurement, Codex round 1). */
export function fromCamera(via: ScanVia): boolean {
  return via === "scan" || via === "rescan";
}

/**
 * The slot after one outcome.
 *
 *   · ok / repeat / queued → the chip ("Add another" lives there);
 *   · a catalog miss → a notice, but ONLY when it came from the camera (`scan`, or the chip's own
 *     `rescan`). A Browse or search add never plants a notice on the hidden Scan door;
 *   · anything else (a basket reason, a transport failure) → the slot as it was.
 */
export function slotAfter(
  prev: ScanSlot,
  e: { outcome: ScanOutcome; via: ScanVia; barcode: string; key: number },
): ScanSlot {
  if (e.outcome === "ok" || e.outcome === "repeat" || e.outcome === "queued")
    return { kind: "chip", key: e.key };
  if (e.outcome === "transport") return prev;
  const notice = scanNoticeFor(e.outcome, e.barcode);
  if (notice && fromCamera(e.via)) {
    // PD4 (m4 decision 11) — the SAME jar re-read while its tag shows keeps its key: no second
    // rise, no second announcement. The server call still ran; only the slot is unchanged.
    if (
      prev?.kind === "notice" &&
      prev.notice.kind === notice.kind &&
      prev.notice.barcode === notice.barcode
    )
      return prev;
    return { kind: "notice", notice, key: e.key };
  }
  return prev;
}

export type ScanHint = "basket-starting" | "offline-saved" | "offline-blocked" | "aim";

/**
 * The live viewfinder's one line of guidance. `cartReady` is checked FIRST: `add()` only queues an
 * offline scan when a basket exists, so "saved for later" would be a promise about a scan that has
 * nowhere to go.
 */
export function scanHint(i: { cartReady: boolean; online: boolean; storage: boolean }): ScanHint {
  if (!i.cartReady) return "basket-starting";
  if (!i.online) return i.storage ? "offline-saved" : "offline-blocked";
  return "aim";
}

// ───────────────────────── PD4 · what an OFFLINE sighting may claim ─────────────────────────
//
// The catalog cache is Browse's DISPLAY map (grocery-catalog-cache.ts), written by
// `getGroceryCatalog`, which filters `available = true` and `weighed = false` — so every weighed
// item and every item unavailable today is ABSENT from a fresh cache while being, in fact, in the
// app. A code missing from the cache is therefore UNKNOWN: it queues for the check, and the tag's
// "This code isn’t in the app yet" is never said about it (the critic's fix B5 — graft 1 exists to
// prevent exactly that sentence about a real item).

export type OfflineClaim =
  /** The cache knows the code — the name and price are display-only estimates until replay. */
  | { kind: "known"; name: string; priceCents: number }
  /** Nothing is known. Not "not in the app": the cache cannot say that. */
  | { kind: "unknown" };

export function offlineClaim(cached: CachedCatalogItem | null): OfflineClaim {
  return cached
    ? { kind: "known", name: cached.name, priceCents: cached.priceCents }
    : { kind: "unknown" };
}

/** The chip's name for a QUEUED code: the cached name, or "A saved scan" — never its digits (B4). */
export function queuedChipName(
  barcode: string,
  cached: CachedCatalogItem | null,
): { name: string; my: string | null } {
  const claim = offlineClaim(cached);
  if (claim.kind === "known") return { name: claim.name, my: null };
  void barcode; // the digits are deliberately NOT a name a shopper or Dad can act on
  return { name: t("en", "savedScan"), my: t("my", "savedScan") };
}

/** The toast for a scan saved offline. The known arm promises the CHECK with a labeled estimate;
 *  the unknown arm promises only the check, and never a verdict the cache cannot give. */
export function offlineSavedToast(cached: CachedCatalogItem | null): { text: string; my?: string } {
  const claim = offlineClaim(cached);
  if (claim.kind === "known")
    return {
      text: `Saved ${claim.name} ≈$${(claim.priceCents / 100).toFixed(2)} — we’ll check it when you’re back online.`,
    };
  return { text: t("en", "savedCheck"), my: t("my", "savedCheck") };
}

/** 8–14 digits typed into the NAME field: the shopper is typing the code, not the name. The sheet
 *  says so instead of searching, and never fires `grocery_scan_miss` (package 2's line). */
export function looksLikeBarcode(query: string): boolean {
  return /^\d{8,14}$/.test(query.trim());
}
