import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FLOOR_HASH,
  HANDOFF_FOCUS_TTL_MS,
  PANE_IDLE_QUERY,
  PANE_QUERY,
  acceptPaneRead,
  closedCounterNote,
  dropHandoffStash,
  handoffFocusKey,
  markHandoffFocus,
  takeHandoffFocus,
  markSealLanding,
  sealLandingKey,
  takeSealLanding,
  SEAL_LANDING_TTL_MS,
  handoffStashKey,
  handoffSuperseded,
  liveTwinOf,
  needsCanonicalSync,
  opensInPane,
  paneEscapeCloses,
  paneFailKeys,
  paneStatusSays,
  counterColumnShown,
  lostKey,
  nextLost,
  lostAfterLanded,
  lostOnSelect,
  lostResolved,
  lostWriteKind,
  focusAfterLostRetract,
  type LostKind,
  paneFocusAfterClose,
  paneFreezeSpoken,
  paneFromHash,
  paneHash,
  paneHistoryOp,
  paneOwned,
  paneSelectionFromHash,
  paneUrl,
  parseHandoffStash,
  readHandoffStash,
  stashHandoff,
  tableDestination,
} from "./floor-pane";
import { STAFF } from "./i18n/staff";
import { STAFF_DOOR_TARGET } from "./staff-door";
import { WRITE_UNCONFIRMED, WRITE_WAITING } from "./staff-outage";

const A = "0b8c1e7a-3f7d-4c2a-9e51-6a2b1c3d4e5f";
const B = "9f1e2d3c-4b5a-4968-8776-655443322110";

describe("paneFromHash — only a table hash names a selection", () => {
  it("accepts #table-<uuid>, lowercased", () => {
    expect(paneFromHash(`#table-${A}`)).toBe(A);
    expect(paneFromHash(`#table-${A.toUpperCase()}`)).toBe(A);
  });
  // MUTANT floor-pane/hash-accepts-any-id — a `(.+)` capture: '#table-7' becomes a selection.
  it.each(["", "#table-", "#table-7", "#appr-h", "#floor-h", `#table-${A}x`, `table-${A}`])(
    "rejects %j",
    (h) => {
      expect(paneFromHash(h)).toBeNull();
    },
  );
  it("paneHash / paneUrl round-trip, on the counter floor BY NAME", () => {
    expect(paneFromHash(paneHash(A))).toBe(A);
    expect(paneUrl(A)).toBe(`${STAFF_DOOR_TARGET.counter}#table-${A}`);
    expect(paneUrl(A, { settle: true })).toBe(`${STAFF_DOOR_TARGET.counter}&settle=1#table-${A}`);
  });
});

describe("paneSelectionFromHash", () => {
  it("a table hash → its id; '' and the floor heading → none", () => {
    expect(paneSelectionFromHash(`#table-${A}`, null, true)).toBe(A);
    expect(paneSelectionFromHash("", A, true)).toBeNull();
    expect(paneSelectionFromHash(FLOOR_HASH, A, true)).toBeNull();
  });
  // MUTANT floor-pane/zone-jump-closes-the-pane — any non-table hash → null.
  it("a zone jump (#appr-h) KEEPS the table beside it at split width", () => {
    expect(paneSelectionFromHash("#appr-h", A, true)).toBe(A);
  });
  // MUTANT floor-pane/zone-jump-keeps-pane-over-a-phone-column — the split check dropped.
  it("…and clears it below 48em, where the pane covers the zone", () => {
    expect(paneSelectionFromHash("#appr-h", A, false)).toBeNull();
  });
});

describe("paneHistoryOp — one entry deep", () => {
  it("none → A pushes", () => {
    expect(paneHistoryOp({ from: null, to: A, currentHash: "", owned: false })).toEqual({
      op: "push",
      hash: `#table-${A}`,
      keepOwnership: false,
    });
  });
  // MUTANT floor-pane/a-switch-pushes
  it("A → B replaces, carrying ownership only if owned", () => {
    expect(paneHistoryOp({ from: A, to: B, currentHash: `#table-${A}`, owned: true })).toEqual({
      op: "replace",
      hash: `#table-${B}`,
      keepOwnership: true,
    });
    expect(paneHistoryOp({ from: A, to: B, currentHash: `#table-${A}`, owned: false })).toEqual({
      op: "replace",
      hash: `#table-${B}`,
      keepOwnership: false,
    });
  });
  it("A → A is nothing", () => {
    expect(paneHistoryOp({ from: A, to: A, currentHash: `#table-${A}`, owned: true }).op).toBe(
      "none",
    );
  });
  // MUTANT floor-pane/re-push-onto-the-same-hash — the URL-already-names-it arm deleted.
  it("the URL already names the target (none → A) → nothing, ownership unchanged: never a same-hash neighbour", () => {
    expect(paneHistoryOp({ from: null, to: A, currentHash: `#table-${A}`, owned: false })).toEqual({
      op: "none",
      keepOwnership: true,
    });
  });
  // MUTANT floor-pane/close-walks-back-over-an-entry-it-did-not-push
  it("close: owned → back; not owned → replace to the floor heading, never ''", () => {
    expect(paneHistoryOp({ from: A, to: null, currentHash: `#table-${A}`, owned: true }).op).toBe(
      "back",
    );
    const r = paneHistoryOp({ from: A, to: null, currentHash: `#table-${A}`, owned: false });
    // MUTANT floor-pane/close-replaces-to-an-empty-hash
    expect(r).toEqual({ op: "replace", hash: "#floor-h", keepOwnership: false });
  });
});

describe("paneOwned — hash AND history length", () => {
  const pushed = { hash: `#table-${A}`, len: 5 };
  it("true only when both match the pushed record", () => {
    expect(paneOwned({ pushed, currentHash: `#table-${A}`, historyLength: 5 })).toBe(true);
    expect(paneOwned({ pushed: null, currentHash: `#table-${A}`, historyLength: 5 })).toBe(false);
    expect(paneOwned({ pushed, currentHash: `#table-${B}`, historyLength: 5 })).toBe(false);
  });
  // MUTANT floor-pane/ownership-by-hash-alone — Next's re-push: same hash, a longer history.
  it("the same hash on a LONGER history is not ours", () => {
    expect(paneOwned({ pushed, currentHash: `#table-${A}`, historyLength: 6 })).toBe(false);
  });
});

describe("needsCanonicalSync", () => {
  it("an entry Next never saw (no __NA) must be adopted; Next's own entry must not", () => {
    expect(needsCanonicalSync(null)).toBe(true);
    expect(needsCanonicalSync({})).toBe(true);
    expect(needsCanonicalSync({ __NA: true, tree: [] })).toBe(false);
  });
});

describe("opensInPane", () => {
  const plain = {
    split: true,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
  };
  it("a plain primary click at split width opens in the pane", () => {
    expect(opensInPane(plain)).toBe(true);
  });
  // MUTANT floor-pane/a-modified-click-is-hijacked — `!metaKey` dropped.
  it.each([
    ["phone width", { split: false }],
    ["middle button", { button: 1 }],
    ["meta", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["already handled", { defaultPrevented: true }],
  ])("%s falls through to the real link", (_, d) => {
    expect(opensInPane({ ...plain, ...d })).toBe(false);
  });
});

describe("paneEscapeCloses", () => {
  const k = { key: "Escape", defaultPrevented: false, isComposing: false, targetEditable: false };
  it("a plain Escape closes", () => expect(paneEscapeCloses(k)).toBe(true));
  it.each([
    ["another key", { key: "Enter" }],
    ["a sheet handled it", { defaultPrevented: true }],
    // MUTANT floor-pane/escape-mid-composition-closes
    ["a Burmese IME is composing", { isComposing: true }],
    ["typing in a field", { targetEditable: true }],
  ])("%s → stays open", (_, d) => {
    expect(paneEscapeCloses({ ...k, ...d })).toBe(false);
  });
});

describe("acceptPaneRead", () => {
  // MUTANT floor-pane/a-late-read-lands-under-another-table — always true.
  it("only the table still selected", () => {
    expect(acceptPaneRead(A, A)).toBe(true);
    expect(acceptPaneRead(A, B)).toBe(false);
    expect(acceptPaneRead(A, null)).toBe(false);
  });
});

describe("paneFocusAfterClose", () => {
  const base = {
    via: "control" as const,
    reason: "user" as const,
    focusInPane: true,
    activeIsBody: false,
    cardInDom: true,
  };
  // MUTANT floor-pane/cleared-card-takes-focus — the cleared arm dropped.
  it("a CLEARED table → the floor heading, even with its card still in the DOM", () => {
    expect(paneFocusAfterClose({ ...base, reason: "cleared" })).toBe("floorHeading");
  });
  it("a control close → the card, else the heading", () => {
    expect(paneFocusAfterClose(base)).toBe("card");
    expect(paneFocusAfterClose({ ...base, cardInDom: false })).toBe("floorHeading");
  });
  // MUTANT floor-pane/back-steals-focus-from-elsewhere
  it("a history close moves focus only from inside the pane or <body>", () => {
    expect(
      paneFocusAfterClose({ ...base, via: "history", focusInPane: false, activeIsBody: false }),
    ).toBe("stay");
    expect(
      paneFocusAfterClose({ ...base, via: "history", focusInPane: false, activeIsBody: true }),
    ).toBe("card");
    expect(paneFocusAfterClose({ ...base, via: "history" })).toBe("card");
  });
});

describe("paneFreezeSpoken — one fact, spoken once", () => {
  // MUTANT floor-pane/freeze-spoken-twice — always true.
  it("silent while the floor already speaks the freeze", () => {
    expect(paneFreezeSpoken("not_updating")).toBe(false);
    expect(paneFreezeSpoken("live")).toBe(true);
    expect(paneFreezeSpoken(undefined)).toBe(true);
  });
});

describe("paneFailKeys", () => {
  // MUTANT floor-pane/unknown-failure-claims-an-outage
  it("a timeout never claims the system is unreachable", () => {
    expect(paneFailKeys("unknown").title).not.toBe("out.shell.title");
    expect(paneFailKeys("unknown").title).toBe("floor.pane.fail.title");
    expect(paneFailKeys("outage").title).toBe("out.shell.title");
  });
  it("neither cause sends anyone to paper (the whole-screen shell's sentence)", () => {
    for (const cause of ["outage", "unknown"] as const) {
      const { title, sub } = paneFailKeys(cause);
      expect(STAFF[title].en).not.toMatch(/paper/i);
      expect(STAFF[sub].en).not.toMatch(/paper/i);
    }
  });
});

describe("counterColumnShown — the bell's visible half (review fixes)", () => {
  it("below 48em an open table covers the column; nothing else does", () => {
    expect(counterColumnShown({ paneOpen: true, split: false })).toBe(false);
    expect(counterColumnShown({ paneOpen: false, split: false })).toBe(true);
    // Side by side, the floor is beside the pane.
    expect(counterColumnShown({ paneOpen: true, split: true })).toBe(true);
    expect(counterColumnShown({ paneOpen: false, split: true })).toBe(true);
  });
});

describe("lostKey / nextLost — a change the pane's table never saw land (review fixes)", () => {
  it("each kind says its own sentence; an unknown payment never says 'didn't go through'", () => {
    expect(lostKey("write")).toBe("floor.pane.lostWrite");
    expect(lostKey("settle")).toBe("floor.pane.lostSettle");
    expect(lostKey("settleUnknown")).toBe("floor.pane.lostSettleUnknown");
  });
  it("a later loss replaces the standing one — but a line edit never replaces a payment", () => {
    type Lost = { id: string; kind: LostKind };
    const w = (id: string): Lost => ({ id, kind: "write" });
    const pay = (id: string): Lost => ({ id, kind: "settle" });
    const unk = (id: string): Lost => ({ id, kind: "settleUnknown" });
    expect(nextLost(null, w("a"))).toEqual(w("a"));
    expect(nextLost(w("a"), w("b"))).toEqual(w("b"));
    expect(nextLost(w("a"), pay("b"))).toEqual(pay("b"));
    expect(nextLost(pay("a"), unk("b"))).toEqual(unk("b"));
    // Money outranks a dish: the payment line stands.
    expect(nextLost(pay("a"), w("b"))).toEqual(pay("a"));
    expect(nextLost(unk("a"), w("b"))).toEqual(unk("a"));
  });
});

describe("lostAfterLanded — an unknown on a table the pane left turns out to LAND (Phase 2h · integration)", () => {
  type Lost = { sessionId: string; kind: LostKind };
  const on = (sessionId: string, kind: LostKind): Lost => ({ sessionId, kind });
  it("the SAME table's 'we don't know if the payment went through' is ANSWERED — 'went through', never silently gone (critic F2)", () => {
    // MUTATION (p2h-int-a/landed-never-clears): the line stands over a payment that went
    // through — the cashier "views it before taking payment again" for nothing, every time; red.
    // MUTATION (p2h-int-a/f2-landed-retracts-silently): the warning vanishes and nothing says why —
    // a screen-reader cashier who heard "we don't know" never hears it was answered; red.
    expect(lostAfterLanded(on("a", "settleUnknown"), "a", "paid")).toEqual(on("a", "settlePaid"));
  });
  it("a reader START's late ok retracts to nothing — the reader is asking for the card; nothing went through yet (critic F2)", () => {
    // MUTATION (p2h-int-a/f2-reader-start-said-paid): "the payment on Table 4 went through" while
    // the reader is still waiting for the card — the cashier hands the bag over unpaid; red.
    expect(lostAfterLanded(on("a", "settleUnknown"), "a", "started")).toBeNull();
  });
  it("a line edit's late ok answers that table's 'no answer yet' with 'saved' (critic F1)", () => {
    // MUTATION (p2h-int-a/f1-saved-answers-nothing): a late save never answers the pane's "no answer
    // yet on a change to Table 4" — it stands over a change that saved, inviting a second tap; red.
    expect(lostAfterLanded(on("a", "writeWaiting"), "a", "saved")).toEqual(on("a", "writeSaved"));
  });
  it("ANOTHER table's unknown stands — a landing on Table 4 says nothing about Table 7's money", () => {
    // MUTATION (p2h-int-a/landed-clears-another-table): any landing answers the standing line,
    // and Table 7's unknown payment — maybe collected twice — goes unsaid; red.
    const seven = on("b", "settleUnknown");
    expect(lostAfterLanded(seven, "a", "paid")).toBe(seven);
    const sevenDish = on("b", "writeWaiting");
    expect(lostAfterLanded(sevenDish, "a", "saved")).toBe(sevenDish);
  });
  it("a REFUSAL ('didn't go through'), a dish that never saved, and the other family stand", () => {
    // MUTATION (p2h-int-a/landed-clears-a-refusal): the same table's refusal is answered by a
    // landing — the cash the cashier took for a settle that was REFUSED is never recorded; red.
    const refused = on("a", "settle");
    expect(lostAfterLanded(refused, "a", "paid")).toBe(refused);
    // MUTATION (p2h-int-a/landed-clears-a-dish): the same table's lost dish change is answered —
    // a dish that never saved goes unsaid because its table's payment landed; red.
    const dish = on("a", "write");
    expect(lostAfterLanded(dish, "a", "paid")).toBe(dish);
    expect(lostAfterLanded(dish, "a", "saved")).toBe(dish);
    // MUTATION (p2h-int-a/f1-saved-answers-a-payment): a dish's late save answers the same table's
    // "we don't know if the payment went through" — the money question is dropped; red.
    const unknownPay = on("a", "settleUnknown");
    expect(lostAfterLanded(unknownPay, "a", "saved")).toBe(unknownPay);
    // …and a payment's landing never answers a dish's "no answer yet".
    const waitingDish = on("a", "writeWaiting");
    expect(lostAfterLanded(waitingDish, "a", "paid")).toBe(waitingDish);
    expect(lostAfterLanded(null, "a", "paid")).toBeNull();
  });
});

describe("lostWriteKind / lostOnSelect / lostResolved — the pane's line about a table it left (Phase 2h · integration, critic F1 · F2)", () => {
  it("a line edit's 'no answer yet' reaches the pane as writeWaiting, never 'didn't save'", () => {
    // MUTATION (p2h-int-a/f1-waiting-said-as-lost): WRITE_WAITING maps to `write` — the pane says
    // "A change on Table 4 didn't save" over a change that may still save; red.
    expect(lostWriteKind(WRITE_WAITING)).toBe("writeWaiting");
    // Codex r2 on #310 (A2) — a LOST answer (the action threw) is its own kind: the change may
    // already have saved. MUTATION (p2h-cx2a/pane/unconfirmed-said-as-lost): WRITE_UNCONFIRMED maps
    // to `write` — "A change on Table 4 didn't save" over a change that may have saved; red.
    expect(lostWriteKind(WRITE_UNCONFIRMED)).toBe("writeUnknown");
    // A refusal (the server's own sentence) still said "didn't save" — nothing was saved.
    expect(lostWriteKind("That item is no longer on the order.")).toBe("write");
  });
  it("a LOST line-edit answer says 'we couldn't confirm', never 'didn't save' — and no late edge answers it as saved (Codex r2 on #310, A2)", () => {
    // MUTATION (p2h-cx2a/pane/unknown-key-is-lost): the new kind renders the refusal's sentence; red.
    expect(lostKey("writeUnknown")).toBe("floor.pane.lostWriteUnknown");
    // Not resolved (warn ink, the View stays): nothing on it has been checked.
    expect(lostResolved("writeUnknown")).toBe(false);
    type L = { sessionId: string; kind: LostKind };
    const l = (sessionId: string, kind: LostKind): L => ({ sessionId, kind });
    // The row's waiting edge fires after the throw too (the write is no longer out): it must never
    // turn "we couldn't confirm" into "saved" — the answer was lost, not received.
    // MUTATION (p2h-cx2a/pane/saved-answers-a-lost-answer): the edge answers it as "saved"; red.
    const lost = l("a", "writeUnknown");
    expect(lostAfterLanded(lost, "a", "saved")).toBe(lost);
    expect(lostAfterLanded(lost, "a", "paid")).toBe(lost);
    // A dish's unknown never replaces a payment's line; a later payment line replaces it.
    expect(nextLost(l("a", "settleUnknown"), l("b", "writeUnknown"))).toEqual(
      l("a", "settleUnknown"),
    );
    expect(nextLost(l("b", "writeUnknown"), l("a", "settle"))).toEqual(l("a", "settle"));
    // Selecting its table clears it (the detail says the rest); another table's pick does not.
    expect(lostOnSelect(lost, "a")).toBeNull();
    expect(lostOnSelect(lost, "b")).toBe(lost);
  });
  it("each new kind says its own sentence", () => {
    expect(lostKey("writeWaiting")).toBe("floor.pane.lostWriteWaiting");
    expect(lostKey("settlePaid")).toBe("floor.pane.landedSettle");
    expect(lostKey("writeSaved")).toBe("floor.pane.landedWrite");
    expect(lostResolved("settlePaid")).toBe(true);
    expect(lostResolved("writeSaved")).toBe(true);
    for (const k of ["write", "writeWaiting", "settle", "settleUnknown"] as const)
      expect(lostResolved(k)).toBe(false);
  });
  it("a 'no answer yet' on a dish never replaces a payment's line; a resolved line outranks nothing", () => {
    type L = { id: string; kind: LostKind };
    const l = (id: string, kind: LostKind): L => ({ id, kind });
    // MUTATION (p2d-rev/split-a-dish-replaces-a-payment-loss, re-anchored): red here too.
    expect(nextLost(l("a", "settleUnknown"), l("b", "writeWaiting"))).toEqual(
      l("a", "settleUnknown"),
    );
    // MUTATION (p2h-int-a/f2-resolved-outranks): "the payment on Table 4 went through" holds the
    // slot and Table 7's "didn't save" is never shown or said; red.
    expect(nextLost(l("a", "settlePaid"), l("b", "write"))).toEqual(l("b", "write"));
    expect(nextLost(l("a", "writeSaved"), l("b", "writeWaiting"))).toEqual(l("b", "writeWaiting"));
  });
  it("selecting a table clears its own line, and a RESOLVED line on any selection — another table's loss stands", () => {
    type L = { sessionId: string; kind: LostKind };
    const l = (sessionId: string, kind: LostKind): L => ({ sessionId, kind });
    expect(lostOnSelect(l("a", "settleUnknown"), "a")).toBeNull();
    // MUTATION (p2h-int-a/f2-resolved-lingers): a "went through" stays above every table the
    // cashier opens after — a stale line, read as news on each visit; red.
    expect(lostOnSelect(l("a", "settlePaid"), "b")).toBeNull();
    expect(lostOnSelect(l("a", "writeSaved"), "b")).toBeNull();
    // MUTATION (p2h-int-a/f2-select-clears-any-loss): opening Table 7 drops Table 4's unknown
    // payment — the money question goes unsaid; red.
    const four = l("a", "settleUnknown");
    expect(lostOnSelect(four, "b")).toBe(four);
    expect(lostOnSelect(null, "b")).toBeNull();
  });
});

describe("focusAfterLostRetract — the retracted line took the focused 'View' with it (Phase 2h · integration)", () => {
  it("focus that FELL lands on the pane's heading while a table is open, the floor's otherwise", () => {
    // MUTATION (p2h-int-a/retract-focus-always-floor): the floor's heading even with a table open
    // beside it — focus jumps out of the pane the person is working in; red.
    expect(focusAfterLostRetract({ focusFell: true, paneOpen: true })).toBe("paneHeading");
    expect(focusAfterLostRetract({ focusFell: true, paneOpen: false })).toBe("floorHeading");
  });
  it("focus that did not fall stays where the person put it", () => {
    // MUTATION (p2h-int-a/retract-focus-yanks): a landing pulls focus off whatever control the
    // person is on, mid-task; red.
    expect(focusAfterLostRetract({ focusFell: false, paneOpen: true })).toBe("stay");
    expect(focusAfterLostRetract({ focusFell: false, paneOpen: false })).toBe("stay");
  });
});

describe("paneStatusSays — the pane's one region (review fixes)", () => {
  it("a lost write outranks every read state", () => {
    for (const read of ["loading", "closed", "fail", null] as const)
      expect(paneStatusSays({ lost: true, read, headNamed: true })).toBe("lost");
  });
  it("loading is said only when the head does not already say it", () => {
    // A tapped card: the head is a name, so the region is the only place loading is said.
    expect(paneStatusSays({ lost: false, read: "loading", headNamed: true })).toBe("loading");
    // A deep link: the unnamed head IS the loading line — said once.
    expect(paneStatusSays({ lost: false, read: "loading", headNamed: false })).toBeNull();
  });
  it("closed and fail are said; nothing picked says nothing", () => {
    expect(paneStatusSays({ lost: false, read: "closed", headNamed: true })).toBe("closed");
    expect(paneStatusSays({ lost: false, read: "fail", headNamed: false })).toBe("fail");
    expect(paneStatusSays({ lost: false, read: null, headNamed: false })).toBeNull();
  });
});

describe("liveTwinOf", () => {
  const live = [
    { sessionId: A, label: "T7" },
    { sessionId: B, label: "T7" },
  ];
  // MUTANT floor-pane/twin-is-the-closed-table — `id !==` dropped.
  it("the live namesake, never the closed session itself", () => {
    expect(liveTwinOf({ sessionId: A, label: "T7" }, live)).toBe(B);
    expect(liveTwinOf({ sessionId: A, label: "T7" }, [live[0]!])).toBeNull();
    expect(liveTwinOf({ sessionId: A, label: "T8" }, live)).toBeNull();
  });
  it("a counter order names no place", () => {
    expect(
      liveTwinOf({ sessionId: A, label: "reg-1" }, [{ sessionId: B, label: "reg-1" }]),
    ).toBeNull();
  });
});

describe("parseHandoffStash — register's canonical shape, display-only", () => {
  const ok = {
    orderId: "o1",
    totalCents: 4210,
    tipCents: 800,
    tenderedCents: 5000,
    isCounter: true,
    cartId: "c1",
    sentEarly: true,
  };
  it("Phase 2f — sentEarly round-trips; a stash from before the field (or a non-true) reads false", () => {
    // handoff/stash-drops-sent-early
    expect(parseHandoffStash(JSON.stringify(ok))?.sentEarly).toBe(true);
    const { sentEarly: _drop, ...legacy } = ok;
    expect(parseHandoffStash(JSON.stringify(legacy))).toEqual({ ...ok, sentEarly: false });
    expect(parseHandoffStash(JSON.stringify({ ...ok, sentEarly: "yes" }))?.sentEarly).toBe(false);
  });
  it("a valid stash round-trips", () => {
    expect(parseHandoffStash(JSON.stringify(ok))).toEqual(ok);
    expect(
      parseHandoffStash(
        JSON.stringify({ ...ok, tipCents: null, tenderedCents: null, cartId: null }),
      ),
    ).toEqual({ ...ok, tipCents: null, tenderedCents: null, cartId: null });
  });
  // MUTANT floor-pane/stash-total-not-integer — the integer check dropped.
  it.each([
    ["no orderId", { orderId: "" }],
    ["fractional total", { totalCents: 42.1 }],
    ["negative total", { totalCents: -1 }],
    ["negative tip", { tipCents: -5 }],
    ["fractional tender", { tenderedCents: 1.5 }],
    ["isCounter not boolean", { isCounter: "yes" }],
    ["empty cartId", { cartId: "" }],
  ])("%s → null", (_, d) => {
    expect(parseHandoffStash(JSON.stringify({ ...ok, ...d }))).toBeNull();
  });
  it("malformed JSON / null → null", () => {
    expect(parseHandoffStash("{")).toBeNull();
    expect(parseHandoffStash(null)).toBeNull();
    expect(parseHandoffStash("7")).toBeNull();
  });
  it("the stash helpers use `mms-handoff:{id}` and swallow a throwing store", () => {
    expect(handoffStashKey(A)).toBe(`mms-handoff:${A}`);
    const m = new Map<string, string>();
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    stashHandoff(A, ok, store);
    expect(readHandoffStash(A, store)).toEqual(ok);
    dropHandoffStash(A, store);
    expect(readHandoffStash(A, store)).toBeNull();
    const boom = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(() => stashHandoff(A, ok, boom)).not.toThrow();
    expect(readHandoffStash(A, boom)).toBeNull();
    expect(() => dropHandoffStash(A, boom)).not.toThrow();
  });
});

// ── Phase 2g · reader (D1) ── `paneSelectionHeld` and `paneStartHeld` are retired with the holds
// they decided (the collect's poll lives above navigation now); their cases are inverted where the
// behaviour lives — the pane and the split admit a switch and a start mid-collect, and the poll
// survives (TablePane.test, CounterSplit.integration.test).

describe("handoffSuperseded — a paid card the next round replaced dies for good (Codex #306)", () => {
  const table = { isCounter: false, cartId: "c1", orderId: "o1" };
  // MUTANT p2d-cx1/superseded-never — never superseded: round one's change comes back after round two.
  it("a table's card, once a DIFFERENT live cart is seen", () => {
    expect(handoffSuperseded(table, "c2", null)).toBe(true);
    expect(handoffSuperseded({ ...table, cartId: null }, "c2", null)).toBe(true);
  });
  it("a table's card, once a NEWER paid order is seen with no cart open (a round paid unseen)", () => {
    expect(handoffSuperseded(table, null, "o2")).toBe(true);
  });
  it("never over its own cart, over its own paid order, or for a counter order", () => {
    expect(handoffSuperseded(table, "c1", null)).toBe(false);
    expect(handoffSuperseded(table, null, "o1")).toBe(false);
    expect(handoffSuperseded(table, null, null)).toBe(false);
    expect(handoffSuperseded({ ...table, isCounter: true }, "c2", "o2")).toBe(false);
  });
});

// ── Phase 2g · review (PT-3 · PT-7) ── a closed counter order the server knows was refunded says so.
describe("closedCounterNote — the refund in words, the hedge only for what the server cannot name", () => {
  it("in full: the plain fact", () => {
    // MUTANT p2g-fix-code/note-full-hedged — a fully refunded order reads "it may have been paid,
    // cleared or merged…"; red.
    expect(closedCounterNote({ refund: "full", orderId: "o-00a1b2c3" })).toEqual({
      k: "floor.pane.closed.refundedFull",
    });
  });
  it("in part: which order — its #CODE, derived once (`handoffCode`) — and to check with a manager", () => {
    // MUTANT p2g-fix-code/note-partial-hedged — the partly refunded order loses its #CODE and reads the
    // hedge, though the guest is still owed the rest of the bag; red.
    expect(closedCounterNote({ refund: "partial", orderId: "o-00a1b2c3" })).toEqual({
      k: "floor.pane.closed.refundedPart",
      vars: { id: "#A1B2C3" },
    });
    expect(STAFF["floor.pane.closed.refundedPart"].en).toContain("{id}");
  });
  it("nothing came back, nothing could be read, or a table: the hedge", () => {
    for (const refund of ["none", null] as const)
      expect(closedCounterNote({ refund, orderId: refund ? "o1" : null })).toEqual({
        k: "floor.pane.closed.body",
      });
    // A partial with no id cannot name the order — the hedge, never "order #undefined".
    expect(closedCounterNote({ refund: "partial", orderId: null })).toEqual({
      k: "floor.pane.closed.body",
    });
  });
});

// ── PD6 (#334) ── the seal lands once more on a same-tab RELOAD, never on a revisit.
describe("markSealLanding / takeSealLanding — one shot, this order, inside its TTL", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("taken ONCE for its order, then gone", () => {
    const st = store();
    expect(sealLandingKey(A)).toBe(`mms-seal-landing:${A}`);
    markSealLanding(A, "o-1", 1000, st);
    // MUTATION seal-stash/landing-every-visit (never cleared) → every revisit re-lands; red.
    expect(takeSealLanding(A, "o-1", 1500, st)).toBe(true);
    expect(takeSealLanding(A, "o-1", 1600, st)).toBe(false);
    expect(st.m.size).toBe(0);
  });
  it("another order's note, a stale note, or one from the future: no landing — and it is still cleared", () => {
    const st = store();
    markSealLanding(A, "o-1", 1000, st);
    // MUTATION seal-stash/landing-any-order → another sale's note lands this seal; red.
    expect(takeSealLanding(A, "o-2", 1500, st)).toBe(false);
    expect(st.m.size).toBe(0);
    markSealLanding(A, "o-1", 1000, st);
    // MUTATION seal-stash/landing-no-ttl → a reload hours later replays the bloom; red.
    expect(takeSealLanding(A, "o-1", 1000 + SEAL_LANDING_TTL_MS + 1, st)).toBe(false);
    markSealLanding(A, "o-1", 5000, st);
    expect(takeSealLanding(A, "o-1", 4000, st)).toBe(false);
    markSealLanding(A, "o-1", 1000, st);
    expect(takeSealLanding(A, "o-1", 1000 + SEAL_LANDING_TTL_MS, st)).toBe(true);
    expect(takeSealLanding(A, "o-1", 1000, null)).toBe(false);
  });
});

// ── Phase 2g · review (A11Y-4) ── the phone's swap to the closed card keeps focus, ONCE.
describe("markHandoffFocus / takeHandoffFocus — a one-shot note, honoured inside its TTL", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("a note written now is taken ONCE, then gone", () => {
    const st = store();
    expect(handoffFocusKey(A)).toBe(`mms-handoff-focus:${A}`);
    markHandoffFocus(A, 1000, st);
    expect(takeHandoffFocus(B, 1500, st)).toBe(false);
    // MUTANT p2g-fix-code/focus-note-never-cleared — the note survives its take: every later visit to
    // the order (a deep link, Back) pulls focus onto the card; red.
    expect(takeHandoffFocus(A, 1500, st)).toBe(true);
    expect(takeHandoffFocus(A, 1600, st)).toBe(false);
    expect(st.m.size).toBe(0);
  });
  it("no note, a stale note, or a note from the future: no focus (and a stale one is still cleared)", () => {
    const st = store();
    expect(takeHandoffFocus(A, 1000, st)).toBe(false);
    markHandoffFocus(A, 1000, st);
    // MUTANT p2g-fix-code/focus-note-no-ttl — a note a refresh never consumed pulls focus on a later
    // visit, minutes on; red.
    expect(takeHandoffFocus(A, 1000 + HANDOFF_FOCUS_TTL_MS + 1, st)).toBe(false);
    expect(st.m.size).toBe(0);
    markHandoffFocus(A, 5000, st);
    expect(takeHandoffFocus(A, 4000, st)).toBe(false);
    markHandoffFocus(A, 1000, st);
    expect(takeHandoffFocus(A, 1000 + HANDOFF_FOCUS_TTL_MS, st)).toBe(true);
  });
  it("swallows a throwing store (the card renders; only the focus move is lost)", () => {
    const boom = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(() => markHandoffFocus(A, 1, boom)).not.toThrow();
    expect(takeHandoffFocus(A, 1, boom)).toBe(false);
  });
});

describe("tableDestination — decided at tap time", () => {
  // MUTANT floor-pane/phone-sent-to-the-pane
  it("split → the pane; below → the full table page", () => {
    expect(tableDestination(A, { split: true })).toBe(paneUrl(A));
    expect(tableDestination(A, { split: false })).toBe(`/staff/table/${A}`);
    expect(tableDestination(A, { split: true, settle: true })).toBe(paneUrl(A, { settle: true }));
    expect(tableDestination(A, { split: false, settle: true })).toBe(`/staff/table/${A}?settle=1`);
  });
});

/**
 * CSS parity — the breakpoints are named ONCE here and the stylesheet must agree. Parsed, never
 * scanned (LEARNINGS #60): comments stripped, each candidate rule selected by what it DECLARES, and
 * ambiguity refused (exactly one candidate, or red).
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
type Rule = { selectors: string[]; body: string; media: string | null };
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const walk = (src: string, media: string | null) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open === -1) break;
      const prelude = src.slice(i, open).trim();
      // find the matching close brace
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      if (prelude.startsWith("@media")) walk(body, prelude.replace(/^@media\s*/, "").trim());
      else if (prelude.startsWith("@supports")) walk(body, media);
      else if (!prelude.startsWith("@"))
        out.push({ selectors: prelude.split(",").map((s) => s.trim()), body, media });
      i = j;
    }
  };
  walk(css, null);
  return out;
}
const declares = (body: string, prop: string, value: string) =>
  body
    .split(";")
    .map((d) => d.trim())
    .some((d) => {
      const [p, ...v] = d.split(":");
      return p?.trim() === prop && v.join(":").trim() === value;
    });

describe("CSS parity — globals.css names the split's breakpoints as floor-pane does", () => {
  const css = stripComments(readFileSync(join(__dirname, "../app/globals.css"), "utf8"));
  const all = rules(css);
  const gridRules = (sel: string) =>
    all.filter((r) => r.selectors.includes(sel) && declares(r.body, "display", "grid"));

  it("the OPEN split becomes a grid at PANE_QUERY — and nowhere else", () => {
    const c = gridRules('.staff-split[data-pane="open"]');
    expect(c).toHaveLength(1);
    expect(`(${c[0]!.media?.replace(/^\(|\)$/g, "")})`).toBe(PANE_QUERY);
  });
  it("EVERY split becomes a grid at PANE_IDLE_QUERY — and nowhere else", () => {
    const c = gridRules(".staff-split");
    expect(c).toHaveLength(1);
    expect(`(${c[0]!.media?.replace(/^\(|\)$/g, "")})`).toBe(PANE_IDLE_QUERY);
  });
  it("staff routes opt out of the root view-transition drift", () => {
    const c = all.filter(
      (r) =>
        r.selectors.includes("html:has(.staff-main)") &&
        declares(r.body, "view-transition-name", "none"),
    );
    expect(c).toHaveLength(1);
  });
  it("a LOST write shows the pane's line below PANE_IDLE_QUERY — the only width it is hidden at", () => {
    // Phase 2d · split (critic) — `data-pane="lost"`: exactly one rule shows the pane, and its
    // media is the complement of PANE_IDLE_QUERY (≥64em already shows the pane column).
    const c = all.filter(
      (r) =>
        r.selectors.includes('.staff-split[data-pane="lost"] > .staff-split-pane') &&
        declares(r.body, "display", "block"),
    );
    expect(c).toHaveLength(1);
    const min = /min-width:\s*([\d.]+)em/.exec(PANE_IDLE_QUERY)![1]!;
    const max = /max-width:\s*([\d.]+)em/.exec(c[0]!.media ?? "")?.[1];
    expect(max).toBeDefined();
    expect(Number(min) - Number(max)).toBeCloseTo(0.01, 5);
    // …and the "Pick a table" page stays hidden there: the floor keeps its place.
    const hide = all.filter(
      (r) =>
        r.selectors.includes('.staff-split[data-pane="lost"] .staff-pane-empty') &&
        declares(r.body, "display", "none") &&
        r.media === c[0]!.media,
    );
    expect(hide).toHaveLength(1);
  });
  it("the pane scroller contains its overscroll on the axis longhand", () => {
    const c = all.filter(
      (r) =>
        r.selectors.includes(".staff-split-pane") &&
        declares(r.body, "overscroll-behavior-y", "contain"),
    );
    expect(c).toHaveLength(1);
  });
});
