import { describe, expect, it } from "vitest";
import {
  confirmRemovals,
  FATE_CAP,
  fateIds,
  mergeRemovals,
  ownBumpsAfter,
  removalCandidates,
  removalsForStation,
  stoppedLineIds,
} from "./kds-removed";
import type { KitchenLine, KitchenTicket } from "./kitchen-types";

/**
 * The lifecycle audit — the KDS calls out a dish VOIDED off its board, until Got it. Two steps: the
 * snapshot diff proposes, a by-id read of each line's CURRENT state confirms. Every case is one a
 * `lck/kds-removed/*` mutant turns red.
 */
const line = (id: string, over: Partial<KitchenLine> = {}): KitchenLine => ({
  id,
  menuItemId: null,
  soldOut: false,
  name: "Mohinga",
  nameMy: null,
  qty: 1,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  state: "fired",
  firedAt: "2026-10-13T18:00:00.000Z",
  fulfillment: "dinein",
  station: "wok",
  ...over,
});
const card = (
  key: string,
  lines: KitchenLine[],
  over: Partial<KitchenTicket> = {},
): KitchenTicket => ({
  key,
  cartId: "cart-6",
  sessionId: "s-6",
  fireBatch: null,
  round: { kind: "none" },
  stampIso: "2026-10-13T18:00:00.000Z",
  channel: "dinein",
  label: "T6",
  tableNumber: 6,
  customerName: null,
  shortCode: null,
  pickupSlot: null,
  held: false,
  unpaid: false,
  lines,
  firedAt: "2026-10-13T18:00:00.000Z",
  ...over,
});
const none = new Set<string>();
const candidates = (
  prev: KitchenTicket[],
  next: KitchenTicket[],
  over: { ownBumps?: Set<string>; stopped?: Set<string> } = {},
) =>
  removalCandidates({
    prev,
    next,
    ownBumps: over.ownBumps ?? none,
    stopped: over.stopped ?? none,
  });
const fates = (o: Record<string, string>) => new Map(Object.entries(o));

describe("removalCandidates — what LEFT the board, before anyone says why", () => {
  const mohinga = line("l-mohinga");
  const tea = line("l-tea", { name: "Tea", station: "drinks" });
  const before = [card("b|1", [mohinga, tea])];

  it("a line that left, bumped by nobody here, is a candidate — with the card it stood on", () => {
    const r = candidates(before, [card("b|1", [tea])]);
    expect(r.map((x) => [x.key, x.line.name, x.ticket.tableNumber])).toEqual([
      ["removed:l-mohinga", "Mohinga", 6],
    ]);
  });

  it("the cook's own tap on this tablet is never a candidate", () => {
    // lck/kds-removed/own-bump-alarms
    expect(candidates(before, [card("b|1", [tea])], { ownBumps: new Set(["l-mohinga"]) })).toEqual(
      [],
    );
  });

  it("a line a stop card strikes is the stop card's to say — never said twice", () => {
    // lck/kds-removed/stop-card-said-twice — a cleared table's dishes read "Removed — stop" beside
    // its own "Table 6 left — stop cooking".
    expect(candidates(before, [], { stopped: new Set(["l-mohinga", "l-tea"]) })).toEqual([]);
  });

  it("a WHOLE card that left is a candidate too — the confirmation decides, by id", () => {
    // lck/kds-removed/vanished-card-unasked — a one-dish card whose dish was voided disappeared with
    // no word, because the diff only looked at cards still on the board.
    expect(candidates([card("b|9", [mohinga])], []).map((x) => x.key)).toEqual([
      "removed:l-mohinga",
    ]);
  });

  it("a line still on the board under ANOTHER card (a merge, a Cook now) never left", () => {
    expect(candidates(before, [card("b|1", [tea]), card("b|2", [mohinga])])).toEqual([]);
  });

  it("each line once, even if two prior cards held it", () => {
    const r = candidates(
      [card("b|1", [mohinga, tea]), card("b|1b", [mohinga])],
      [card("b|1", [tea])],
    );
    expect(r.map((x) => x.key)).toEqual(["removed:l-mohinga"]);
  });
});

describe("confirmRemovals — only a line whose CURRENT state is voided is said", () => {
  const c = candidates([card("b|1", [line("l-x"), line("l-y")])], []);

  it("voided is a removal", () => {
    // lck/kds-removed/void-unsaid
    expect(confirmRemovals(c, fates({ "l-x": "voided" })).map((r) => r.key)).toEqual([
      "removed:l-x",
    ]);
  });

  it("THE SKEW: the rail never listed X and the line read no longer holds X — but X is SERVED", () => {
    // The blind pass on #360 (CRITICAL 4): the served rail and the live line read are two
    // statements, so a teammate's bump landing between them was on neither, and the diff read it as
    // a void. The by-id read sees the bump. lck/kds-removed/served-said-as-removed — red.
    expect(confirmRemovals(c, fates({ "l-x": "served", "l-y": "served" }))).toEqual([]);
  });

  it("a line the read did not return, any other state, or a read that failed says nothing", () => {
    // lck/kds-removed/unread-fate-guessed — a failed read is not a void.
    expect(confirmRemovals(c, fates({}))).toEqual([]);
    expect(confirmRemovals(c, fates({ "l-x": "fired", "l-y": "draft" }))).toEqual([]);
    expect(confirmRemovals(c, null)).toEqual([]);
  });

  it("the read asks about at most FATE_CAP lines — a mass departure is a clear, not a void", () => {
    const many = candidates(
      [
        card(
          "b|1",
          Array.from({ length: FATE_CAP + 5 }, (_, i) => line(`l-${i}`)),
        ),
      ],
      [],
    );
    expect(fateIds(many)).toHaveLength(FATE_CAP);
    expect(fateIds(many)[0]).toBe("l-0");
  });
});

describe("mergeRemovals / removalsForStation / ownBumpsAfter / stoppedLineIds", () => {
  const [a, b] = candidates(
    [card("b|1", [line("l-a"), line("l-b", { station: "drinks" })])],
    [],
  ) as [ReturnType<typeof candidates>[number], ReturnType<typeof candidates>[number]];
  it("a new wave keeps the standing markers and replaces a line's own", () => {
    expect(mergeRemovals([a, b], [a]).map((r) => r.key)).toEqual(["removed:l-b", "removed:l-a"]);
  });
  it("a station draws only its own dishes; the all view draws every one", () => {
    expect(removalsForStation([a, b], "drinks").map((r) => r.key)).toEqual(["removed:l-b"]);
    expect(removalsForStation([a, b], "all")).toHaveLength(2);
  });
  it("a pending bump stays pending only while its line is on the board", () => {
    // lck/kds-removed/own-bumps-never-pruned — a stale pending id would hide a LATER void of the same
    // line once a recall put it back.
    const left = ownBumpsAfter(new Set(["l-a", "l-b"]), [card("b|1", [line("l-b")])]);
    expect([...left]).toEqual(["l-b"]);
  });
  it("the stop cards' struck lines; none when the stop read did not answer", () => {
    expect([...stoppedLineIds([{ lines: [{ id: "l-a" }] }, { lines: [{ id: "l-b" }] }])]).toEqual([
      "l-a",
      "l-b",
    ]);
    expect(stoppedLineIds(null).size).toBe(0);
  });
});
