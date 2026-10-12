import { describe, expect, it } from "vitest";
import { classifyReplay } from "./grocery-queue";
import { replayForSheet, sheetTapWaits } from "./sheet-replay";
import { pairMiss } from "./scan-pairing";

/**
 * PD4 (Codex round 4 on #329, 4240341719, P1) — a Name-sheet add the radio QUEUED belongs to the
 * sheet that asked until its replay answers. Each MUTATION is a row in scripts/verify-slice.mjs
 * (`sheet-replay/…`), induced and watched go red.
 */

const SHELF = "0123456789012"; // the jar's real code — not in the catalog
const TEA = "2990000000017"; // the row the shopper tapped in the sheet that miss opened
const OTHER = "2990000000024";

const queued = (barcode: string) => ({
  scanId: "00000000-0000-4000-8000-000000000000",
  cartId: "c1",
  barcode,
  queuedAt: 0,
});

describe("sheetTapWaits — a sheet tap on a code whose scan waits in the queue is refused, whatever the radio says", () => {
  it("CODEX R4 — the tap after reconnect, before the replay answers, is refused (it would be a second unit under a fresh scan id)", () => {
    // MUTATION: never wait → the row sends live while its queued add replays behind it; red.
    expect(sheetTapWaits([queued(TEA)], TEA)).toBe(true);
  });

  it("nothing waiting for that code → the tap goes", () => {
    expect(sheetTapWaits([queued(OTHER)], TEA)).toBe(false);
    expect(sheetTapWaits([], TEA)).toBe(false);
  });
});

describe("replayForSheet — the replay's answer is the asking sheet's answer", () => {
  const ask = (open: boolean, miss: string | null = SHELF) => ({ miss, open });
  const delivered = classifyReplay({ ok: true });

  it("CODEX R4 — delivered, the sheet still open: it CLOSES, as the live ok closes it (the row it would re-arm leaves with it)", () => {
    // MUTATION: never close on a replay → the sheet stays up with its "Saved…" line, the queue entry
    // leaves, and the same row charges a second unit; red.
    expect(replayForSheet(delivered, ask(true), TEA, null).close).toBe(true);
  });

  it("delivered, the sheet already dismissed (or replaced by a new miss's sheet): nothing to close", () => {
    expect(replayForSheet(delivered, ask(false), TEA, null).close).toBe(false);
  });

  it("CODEX R4 — delivered from a miss-opened sheet: the miss pairs to the item, as the live ok pairs it (dismissed or not)", () => {
    // MUTATION: forget the miss → the rescued jar re-reads as unknown over an item in the basket; red.
    expect(replayForSheet(delivered, ask(false), TEA, null).pairing).toEqual(pairMiss(SHELF, TEA));
    expect(replayForSheet(delivered, ask(true), TEA, null).pairing).toEqual(pairMiss(SHELF, TEA));
  });

  it("delivered from a sheet NO miss opened: the pairing stands as it was", () => {
    const standing = pairMiss("0999999999999", OTHER);
    expect(replayForSheet(delivered, ask(true, null), TEA, standing).pairing).toBe(standing);
  });

  it('CODEX R4 — rejected, the sheet still open: the drain\'s words go to ITS line, replacing the "Saved…" it made false', () => {
    // MUTATION: keep quiet in the sheet → "Saved — we'll check it" stays up over a refusal, and the
    // toast that says otherwise sits behind the keyboard; red.
    const r = replayForSheet(
      classifyReplay({ ok: false, reason: "unavailable" }),
      ask(true),
      TEA,
      null,
    );
    expect(r).toEqual({ pairing: null, close: false, speak: true, settled: true });
  });

  it("rejected, the sheet gone: the toast speaks (nothing in a sheet), and nothing pairs", () => {
    const standing = pairMiss("0999999999999", OTHER);
    const r = replayForSheet(
      classifyReplay({ ok: false, reason: "unknown_barcode" }),
      ask(false),
      TEA,
      standing,
    );
    expect(r).toEqual({ pairing: standing, close: false, speak: false, settled: true });
  });

  it("a RETRY keeps the ask for the next drain — the add is still waiting, and its answer is still owed", () => {
    // MUTATION: settle on a retry → the next drain delivers the add with no sheet to close, and the
    // row re-arms under the "Saved…" line; red.
    const r = replayForSheet(classifyReplay({ ok: false, reason: "locked" }), ask(true), TEA, null);
    expect(r).toEqual({ pairing: null, close: false, speak: false, settled: false });
    expect(replayForSheet(classifyReplay(null), ask(true), TEA, null).settled).toBe(false);
  });

  it("a TERMINAL basket is markCartGone's (it closes the sheet and speaks): settled, nothing else", () => {
    const r = replayForSheet(classifyReplay({ ok: false, reason: "paid" }), ask(true), TEA, null);
    expect(r).toEqual({ pairing: null, close: false, speak: false, settled: true });
  });
});
