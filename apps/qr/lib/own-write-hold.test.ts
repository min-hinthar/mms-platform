import { describe, expect, it } from "vitest";
import {
  OWN_HOLD_MAX_OPEN_MS,
  heldKeys,
  newOwnHolds,
  openHold,
  releaseHolds,
  releaseOwnHold,
  settleHold,
} from "./own-write-hold";

/**
 * #362 (blind pass 3 · Codex round 1, Checkout.tsx:2323) — a diner's OWN write is never read back to
 * them as news. The hold used to end on a 2 s timer after the write SETTLED, so a re-read slower than
 * that — or a failed one followed by a realtime echo — announced the diner's own "+" ("Mohinga on
 * your order is now 2."). It now ends only when a view whose read STARTED after the write settled has
 * been diffed with the key still held: from that view on, the baseline already includes the write.
 */
describe("own-write holds — released by a view that read after the write, never by a clock", () => {
  it("holds through any view whose read started before the write settled, however long it takes", () => {
    const h = newOwnHolds();
    const hold = openHold(h, "line-1", 0);
    // Reads 1 and 2 were issued while the write was out; the write settles with 2 reads issued.
    settleHold(hold, 2);
    // A view from read 2 lands 10 s later — it may predate the write, so the key is still held.
    // MUTATION (lcb/own-hold/released-by-any-view): release on any applied view; red.
    releaseHolds(h, 2, 3, 10_000);
    expect(heldKeys(h)).toEqual(new Set(["line-1"]));
    // A mutation's own view (no read ticket) proves nothing about read order either.
    releaseHolds(h, undefined, 3, 10_000);
    expect(heldKeys(h)).toEqual(new Set(["line-1"]));
    // Read 3 started after the settle: once its view has been diffed, the hold ends.
    releaseHolds(h, 3, 3, 10_000);
    expect(heldKeys(h)).toEqual(new Set());
  });

  it("a write still in flight is held whatever views land", () => {
    // MUTATION (lcb/own-hold/open-hold-released): release an unsettled hold; red.
    const h = newOwnHolds();
    openHold(h, "line-1", 0);
    releaseHolds(h, 50, 50, 1_000);
    expect(heldKeys(h)).toEqual(new Set(["line-1"]));
  });

  it("two holds on one key are two facts — the second keeps it held", () => {
    const h = newOwnHolds();
    const a = openHold(h, "line-1", 0);
    openHold(h, "line-1", 0);
    settleHold(a, 1);
    releaseHolds(h, 2, 2, 1_000);
    expect(heldKeys(h)).toEqual(new Set(["line-1"]));
  });

  it("a write that never answers stops holding after the bound — at the NEXT read, not on a timer", () => {
    // A hung write must not silence that line's real news forever; past the bound it counts as
    // settled at the moment a view notices, so a read issued after that releases it.
    const h = newOwnHolds();
    openHold(h, "line-1", 0);
    releaseHolds(h, 4, 4, OWN_HOLD_MAX_OPEN_MS + 1);
    // MUTATION (lcb/own-hold/hung-hold-released-by-an-old-read): treat it as settled before every
    // read issued so far — read 4 (which may predate the write) releases it; red.
    expect(heldKeys(h)).toEqual(new Set(["line-1"]));
    releaseHolds(h, 5, 5, OWN_HOLD_MAX_OPEN_MS + 2);
    expect(heldKeys(h)).toEqual(new Set());
  });

  it("#362 blind pass 9 — the write's OWN applied view ends ITS hold, and only its", () => {
    // /menu's writes are answered with their own view and no read follows — a hold only a ticketed
    // read could end swallowed the next outside change.
    const h = newOwnHolds();
    const mine = openHold(h, "line-1", 0);
    const other = openHold(h, "line-1", 0);
    const elsewhere = openHold(h, "line-2", 0);
    settleHold(mine, 1);
    releaseOwnHold(h, mine);
    // MUTATION (lcb/own-hold/own-view-releases-the-key): release every hold on the key — a second
    // write still out on line-1 would read back to its diner; red.
    expect(h.holds).toEqual([other, elsewhere]);
    releaseOwnHold(h, other);
    releaseOwnHold(h, elsewhere);
    expect(heldKeys(h)).toEqual(new Set());
  });
});
