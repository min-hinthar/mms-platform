import type { ScanAddFailure } from "@/lib/grocery";

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
  if (notice && (e.via === "scan" || e.via === "rescan"))
    return { kind: "notice", notice, key: e.key };
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
