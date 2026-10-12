import type { ScanVerdict } from "./scan-gate";

/**
 * PD4 (blind pass 2 on #329, criticals 3 · 5) — what the lens chip's action slot holds, and the ONE
 * predicate both the repeat toast and the chip read.
 *
 * The slot holds at most one control: the add-Undo while its window is open, else "Add another"
 * (M186's one deliberate way to buy a second — a CHARGE), else nothing. The repeat toast used to
 * promise "tap “Add another”" on its own reasoning, so a re-read inside the Undo window — or of a
 * code whose line the view had not shown yet — instructed a control the chip did not draw. Now the
 * toast's clause and the chip's button are both `chipAction(...) === "add-another"`, over the same
 * facts (the page reads them from state for the chip, from that state's ref mirrors for the toast).
 *
 * A PAIRING NEVER OFFERS A CHARGE (decided under delegation; m4 §H.4). A missed shelf code paired to
 * the item the shopper then added by name is a note of the shopper's OWN act, not a claim that the
 * jar IS that item — any item added from a miss-opened sheet pairs, related to the jar or not. So a
 * re-read through the pairing is announced as that act ("You added {name} for this code — …") and
 * its chip offers no "Add another": one tap would charge an item the camera never sighted. A second
 * copy of the rescued item is the basket's stepper or a Browse row away, both of which name it.
 */
export type ChipAction = "undo" | "add-another" | "none";

export type ChipFacts = {
  /** An add-Undo for this code holds the slot (its window is open, or its write is in flight). */
  undo: boolean;
  /** The basket's view holds a line for this code. */
  inBasket: boolean;
  /** The code waits in the offline queue. */
  queued: boolean;
  /** The catalog cache can name the queued code (an unknown saved scan is never re-added). */
  cached: boolean;
  /** The chip was reached through a pairing: the camera sighted a missed shelf code, judged as
   *  this item — never the code itself. */
  viaPairing: boolean;
};

/** The facts for `code`, from a view of the basket — the page passes its STATE for the chip and
 *  that state's ref mirrors for the repeat toast, so both read one derivation. */
export function chipFactsFor(
  code: string,
  viaPairing: boolean,
  view: {
    lines: readonly { barcode: string }[];
    queued: readonly string[];
    /** The barcode whose add-Undo holds the slot, if any. */
    undoBarcode: string | null;
    /** Can the catalog cache name this code? */
    cached: (code: string) => boolean;
  },
): ChipFacts {
  const inBasket = view.lines.some((l) => l.barcode === code);
  return {
    undo: view.undoBarcode === code,
    inBasket,
    queued: view.queued.includes(code),
    cached: !inBasket && view.cached(code),
    viaPairing,
  };
}

/** Is a chip drawn at all? Only while the code is accounted for: a line, or a queued scan. */
export function chipDrawn(f: Pick<ChipFacts, "inBasket" | "queued">): boolean {
  return f.inBasket || f.queued;
}

/** The control in the chip's action slot. */
export function chipAction(f: ChipFacts): ChipAction {
  if (!chipDrawn(f)) return "none";
  if (f.undo) return "undo";
  if (f.viaPairing) return "none";
  return f.inBasket || f.cached ? "add-another" : "none";
}

type Repeat = Extract<ScanVerdict, { kind: "repeat" }>;

/** The repeat toast. Its "Add another" clause is spoken only when `action` draws that control. */
export function repeatSentence(v: Repeat, action: ChipAction, viaPairing: boolean): string {
  const offer = action === "add-another";
  if (v.where === "basket") {
    if (viaPairing) return `You added ${v.name} for this code — it’s in your basket (×${v.qty}).`;
    return offer
      ? `${v.name} is already in your basket (×${v.qty}) — tap “Add another” for a second.`
      : `${v.name} is already in your basket (×${v.qty}).`;
  }
  const head =
    v.where === "queued"
      ? "Already saved — we’ll check it when you’re back online."
      : "Already added — your list is out of date.";
  return offer ? `${head} Tap “Add another” for a second.` : head;
}
