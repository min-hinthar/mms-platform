import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FLOOR_HASH,
  PANE_IDLE_QUERY,
  PANE_QUERY,
  acceptPaneRead,
  dropHandoffStash,
  handoffStashKey,
  liveTwinOf,
  needsCanonicalSync,
  opensInPane,
  paneEscapeCloses,
  paneFailKeys,
  paneStatusSays,
  counterColumnShown,
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
  };
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
