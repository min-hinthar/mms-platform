import { describe, expect, it } from "vitest";
import type { ModGroup } from "./menu/modifiers";
import type { TableLineView } from "./floor-types";
import type { StaffLineEdit, StaffSendView } from "./staff-send-view";
import { STAFF } from "./i18n/staff";
import {
  padAmountsSettled,
  padCategories,
  padDishName,
  padPickCat,
  padSections,
  padSendView,
  padSettle,
  padSettleBusyKey,
  padSettleReason,
  padSettleStartPhase,
  padTileBlock,
  ticketGroups,
  ticketUnitsByItem,
  tileAction,
  unsavedNoteFrom,
  type PadCatalogItem,
  type PadLineWrites,
  type PadReasonCtx,
  type PadSettleBlock,
  type PadSettleInput,
} from "./order-pad";

/**
 * Phase 2c · pad — the order pad's decisions, each falsified by a VALUE (CLAUDE.md, "decision logic
 * belongs in lib/"). The pad is the screen a server or the counter builds an order on in seconds;
 * every rule below is one a wrong answer would put on a guest's bill or strand a tap.
 */

const req: Pick<ModGroup, "minSelect"> = { minSelect: 1 };
const opt: Pick<ModGroup, "minSelect"> = { minSelect: 0 };

describe("tileAction — what one tap on a dish does", () => {
  it("optional groups only → a one-tap add", () => {
    expect(tileAction({ soldOut: false, groups: [opt, opt] })).toBe("add");
    expect(tileAction({ soldOut: false, groups: [] })).toBe("add");
  });
  it("a required group → the sheet", () => {
    expect(tileAction({ soldOut: false, groups: [opt, req] })).toBe("choose");
  });
  it("sold out wins over a required choice", () => {
    // MUTATION: the sold-out check moved below the choice check — a sold-out curry opens a sheet
    // whose every Add the server refuses; red.
    expect(tileAction({ soldOut: true, groups: [req] })).toBe("soldOut");
    expect(tileAction({ soldOut: true, groups: [] })).toBe("soldOut");
  });
});

describe("padDishName — the console's tongue leads, the other echoes", () => {
  it("my + a Burmese name → Burmese leads (lang my), English echoes", () => {
    expect(padDishName("my", "Mohinga", "မုန့်ဟင်းခါး")).toEqual({
      lead: { text: "မုန့်ဟင်းခါး", lang: "my" },
      echo: { text: "Mohinga", lang: "en" },
    });
  });
  it("my + no Burmese → English leads MARKED en, no echo (never set in Padauk)", () => {
    // MUTATION: `nameMy ?? nameEn` with lang "my" — the English name announced as Burmese and set
    // in the Burmese face; red.
    expect(padDishName("my", "Coconut Chicken & Rice", null)).toEqual({
      lead: { text: "Coconut Chicken & Rice", lang: "en" },
      echo: null,
    });
  });
  it("a name_my with no Myanmar script is not Burmese", () => {
    // MUTATION: dropping `catalogNameMy` — a romanisation stored in name_my leads as "Burmese"; red.
    expect(padDishName("my", "Mohinga", "Mohinga ")).toEqual({
      lead: { text: "Mohinga", lang: "en" },
      echo: null,
    });
    expect(padDishName("my", "Tea", "Lahpet")).toEqual({
      lead: { text: "Tea", lang: "en" },
      echo: null,
    });
  });
  it("en + a Burmese name → English leads, Burmese echoes", () => {
    expect(padDishName("en", "Mohinga", "မုန့်ဟင်းခါး")).toEqual({
      lead: { text: "Mohinga", lang: "en" },
      echo: { text: "မုန့်ဟင်းခါး", lang: "my" },
    });
    expect(padDishName("en", "Tea", null)).toEqual({
      lead: { text: "Tea", lang: "en" },
      echo: null,
    });
  });
});

const item = (
  id: string,
  nameEn: string,
  category: string,
  categorySlug: string,
  categorySort: number,
  nameMy: string | null = null,
): PadCatalogItem => ({
  id,
  nameEn,
  nameMy,
  category,
  categorySlug,
  categorySort,
  soldOut: false,
  priceCents: 1000,
  groups: [],
});

// Catalog order is name order (the page's read), and the category sort is NOT alphabetical:
// Sides (30) comes before Curries (40), while "Curries" sorts first by name.
const CATALOG: PadCatalogItem[] = [
  item("beef", "Beef Curry", "Curries", "curries-a-la-carte", 40, "အမဲသားဟင်း"),
  item("chicken", "Chicken Curry", "Curries", "curries-a-la-carte", 40, "ကြက်သားဟင်း"),
  item("fries", "Fries", "Sides", "sides", 30),
  item("mohinga", "Mohinga", "All-Day Breakfast", "all-day-breakfast", 10, "မုန့်ဟင်းခါး"),
  item("rice", "Rice", "Sides", "sides", 30),
];

describe("padCategories — the rail, in the menu's own order", () => {
  it("sort_order, never the name", () => {
    // MUTATION: sorting by title — Curries would lead the rail; red.
    expect(padCategories(CATALOG).map((c) => c.slug)).toEqual([
      "all-day-breakfast",
      "sides",
      "curries-a-la-carte",
    ]);
    expect(padCategories(CATALOG)[1]).toEqual({ slug: "sides", title: "Sides" });
  });
});

describe("padSections — All, one category, or a search across everything", () => {
  it("'All' lists every category in sort order, catalog order inside each", () => {
    const r = padSections(CATALOG, { q: "", cat: null });
    expect(r.activeCat).toBeNull();
    expect(r.sections.map((s) => s.key)).toEqual([
      "all-day-breakfast",
      "sides",
      "curries-a-la-carte",
    ]);
    expect(r.sections[1]?.title).toBe("Sides");
    expect(r.sections[2]?.items.map((i) => i.id)).toEqual(["beef", "chicken"]);
  });

  it("a pressed chip is that one section", () => {
    const r = padSections(CATALOG, { q: "", cat: "sides" });
    expect(r.activeCat).toBe("sides");
    expect(r.sections).toEqual([{ key: "sides", title: "Sides", items: [CATALOG[2], CATALOG[4]] }]);
  });

  it("a search IGNORES the chip, spans the menu, and un-presses the chip", () => {
    const r = padSections(CATALOG, { q: "curry", cat: "sides" });
    // MUTATION: applying the chip during a search — "curry" under Sides finds nothing and the
    // search dead-ends (the shipped browser's bug); red.
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]?.title).toBeNull();
    expect(r.sections[0]?.items.map((i) => i.id)).toEqual(["beef", "chicken"]);
    // MUTATION: keeping the chip pressed while a search runs — a lit chip claiming a filter that
    // is not applied; red.
    expect(r.activeCat).toBeNull();
  });

  it("the raw Burmese query matches", () => {
    const r = padSections(CATALOG, { q: "ဟင်း", cat: null });
    expect(r.sections[0]?.items.map((i) => i.id)).toEqual(["beef", "chicken", "mohinga"]);
  });

  it("a chip whose category is gone falls back to All", () => {
    expect(padSections(CATALOG, { q: " ", cat: "desserts" }).activeCat).toBeNull();
  });
});

const line = (over: Partial<TableLineView> & { id: string }): TableLineView => ({
  name: over.id,
  qty: 1,
  unitPriceCents: 500,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  sendable: true,
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
  menuItemId: "mohinga",
  fulfillment: "dinein",
  nameMy: null,
  modifiersMy: [],
  ...over,
});

describe("ticketUnitsByItem — the tile's confirmed ×N", () => {
  it("voided lines are not on the order; comped ones are; drafts and fired lines sum", () => {
    const m = ticketUnitsByItem([
      line({ id: "a", qty: 2 }),
      line({ id: "b", qty: 3, state: "fired" }),
      line({ id: "c", qty: 1, state: "voided" }),
      line({ id: "d", qty: 1, comped: true, state: "served" }),
      line({ id: "e", qty: 4, menuItemId: "tea" }),
      line({ id: "f", qty: 9, menuItemId: null }),
    ]);
    // MUTATION: dropping the voided filter — a removed Mohinga still badges ×7; red.
    expect(m.get("mohinga")).toBe(6);
    expect(m.get("tea")).toBe(4);
    expect(m.size).toBe(2);
  });
});

describe("ticketGroups — the ONE ticket's sections", () => {
  it("a to-go draft at a dine-in table is its own group", () => {
    const g = ticketGroups(
      [
        line({ id: "a" }),
        line({ id: "b", fulfillment: "togo", sendable: false }),
        line({ id: "c", state: "in_progress", sendable: false }),
        line({ id: "d", state: "served", sendable: false }),
        line({ id: "e", state: "voided", sendable: false }),
        line({ id: "f", state: "fired", sendable: false }),
      ],
      "dinein",
    );
    // MUTATION: a state-only predicate — the to-go draft lands under "Not sent yet" and staff send
    // for a dish the Send will not fire; red.
    expect(g.groups.map((x) => [x.key, x.lines.map((l) => l.id)])).toEqual([
      ["unsent", ["a"]],
      ["togo", ["b"]],
      ["kitchen", ["c", "f"]],
      ["served", ["d"]],
      ["voided", ["e"]],
    ]);
    expect(g.showHeadings).toBe(true);
  });

  it("at a counter order every draft is simply not sent", () => {
    const g = ticketGroups([line({ id: "a", fulfillment: "togo", sendable: false })], "pickup");
    expect(g.groups.map((x) => x.key)).toEqual(["unsent"]);
  });

  it("headings only when there are two groups or more", () => {
    // MUTATION: `showHeadings: true` — a one-group ticket wears a lone "Not sent yet" heading over
    // every line; red.
    expect(ticketGroups([line({ id: "a" }), line({ id: "b" })], "dinein").showHeadings).toBe(false);
    expect(ticketGroups([], "dinein")).toEqual({ groups: [], showHeadings: false });
  });
});

const NONE = { flying: 0, unseen: 0, unconfirmed: 0, lost: 0 };
const QUIET: PadLineWrites = { writing: 0, unread: false };
const settleIn = (over: Partial<PadSettleInput> = {}): PadSettleInput => ({
  mode: "dinein",
  open: true,
  paying: false,
  itemCount: 2,
  settleTotalCents: 1347,
  pending: NONE,
  sendBusy: false,
  unsavedNote: false,
  lines: QUIET,
  settlePhase: "idle",
  ...over,
});

describe("padSettle — Take payment", () => {
  it("a counter order's Take payment is the primary; a table's is secondary to the Send", () => {
    // MUTATION: variant by `open` only — Take payment filled beside a filled Send at a table (two
    // filled pills; payment as the hero before the food is sent); red.
    expect(padSettle(settleIn({ mode: "pickup" })).variant).toBe("primary");
    expect(padSettle(settleIn()).variant).toBe("secondary");
  });

  it("names the amount only when nothing is pending", () => {
    expect(padSettle(settleIn()).showAmount).toBe(true);
    // MUTATION: counting flying only — an add that LANDED but is not yet in a read is on the bill,
    // and the stale amount would be named over it; red.
    expect(padSettle(settleIn({ pending: { ...NONE, unseen: 1 } })).showAmount).toBe(false);
    expect(padSettle(settleIn({ settleTotalCents: null })).showAmount).toBe(false);
  });

  it("a tap is ACCEPTED while an add is flying — the pad drains it first", () => {
    const s = padSettle(settleIn({ pending: { ...NONE, flying: 1 } }));
    // MUTATION: refusing the tap while anything flies — a cashier must wait out every round trip
    // before paying; red.
    expect(s.enabled).toBe(true);
    expect(s.busy).toBe(false);
    expect(s.block).toBeNull();
  });

  it("the first add ever still flying counts as something to pay for", () => {
    expect(padSettle(settleIn({ itemCount: 0, pending: { ...NONE, flying: 1 } })).block).toBeNull();
  });

  it("an add whose fate is unknown holds it — 'waiting'", () => {
    // MUTATION: dropping the unknown clause — the cashier takes payment while a dish may or may
    // not be on the bill; red.
    expect(padSettle(settleIn({ pending: { ...NONE, unconfirmed: 1 } }))).toMatchObject({
      enabled: false,
      block: "waiting",
    });
    expect(padSettle(settleIn({ pending: { ...NONE, lost: 1 } })).block).toBe("waiting");
    expect(padSettle(settleIn({ sendBusy: true })).block).toBe("waiting");
  });

  it("a guest paying outranks everything; an empty order says so", () => {
    expect(padSettle(settleIn({ paying: true, pending: { ...NONE, lost: 1 } })).block).toBe(
      "paying",
    );
    expect(padSettle(settleIn({ paying: true, unsavedNote: true })).block).toBe("paying");
    expect(padSettle(settleIn({ itemCount: 0 }))).toMatchObject({ enabled: false, block: "empty" });
  });

  it("an unsaved kitchen note holds it — leaving the pad would throw the note away", () => {
    // MUTATION: Take payment blind to the note — a walk-up's "no peanuts" typed but not saved is
    // dropped when the pad navigates, and a counter order cooks when paid with no note; red.
    expect(padSettle(settleIn({ unsavedNote: true }))).toMatchObject({
      enabled: false,
      block: "note",
    });
    // The note is the fix staff can act on: it outranks a wait and an empty order.
    expect(
      padSettle(settleIn({ unsavedNote: true, pending: { ...NONE, unconfirmed: 1 } })).block,
    ).toBe("note");
    expect(padSettle(settleIn({ unsavedNote: true, mode: "pickup" })).block).toBe("note");
  });

  it("a line write in flight holds it; an unread one only withholds the amount", () => {
    // MUTATION: a qty change or a removal still saving ignored — the table page opens on a total
    // the write is about to move; red.
    expect(padSettle(settleIn({ lines: { writing: 1, unread: false } }))).toMatchObject({
      enabled: false,
      block: "waiting",
      showAmount: false,
    });
    expect(padSettle(settleIn({ lines: { writing: 0, unread: true } }))).toMatchObject({
      enabled: true,
      block: null,
      showAmount: false,
    });
  });

  it("busy in every phase after the tap — and a busy Take payment refuses a second tap", () => {
    for (const phase of ["draining", "saving", "opening"] as const)
      expect(padSettle(settleIn({ settlePhase: phase })), phase).toMatchObject({
        busy: true,
        enabled: false,
      });
  });

  it("a closed or paid order offers nothing", () => {
    expect(padSettle(settleIn({ open: false })).enabled).toBe(false);
  });
});

describe("padAmountsSettled — one predicate for every amount the pad names", () => {
  it("any pending add hides the amounts", () => {
    expect(padAmountsSettled(NONE, QUIET)).toBe(true);
    for (const k of ["flying", "unseen", "unconfirmed", "lost"] as const)
      expect(padAmountsSettled({ ...NONE, [k]: 1 }, QUIET), k).toBe(false);
  });

  it("a line write in flight, or answered but not yet read, hides them too", () => {
    // MUTATION: amounts blind to the ticket's own writes — "Take payment · $15.81" beside a
    // quantity just changed to 3, or beside a row already leaving; red.
    expect(padAmountsSettled(NONE, { writing: 1, unread: false })).toBe(false);
    // MUTATION: shown again the moment the write answers — the figure still predates it; red.
    expect(padAmountsSettled(NONE, { writing: 0, unread: true })).toBe(false);
  });
});

describe("unsavedNoteFrom — the note Take payment waits on", () => {
  const edit = (over: Partial<StaffLineEdit>): StaffLineEdit => ({
    lineId: "l1",
    name: "Mohinga",
    noteDirty: false,
    writing: false,
    sendable: true,
    ...over,
  });
  it("ANY line's unsaved note — a counter order's and a to-go draft's too, not just what the Send fires", () => {
    // MUTATION: reading only sendable lines (the Send's own rule) — a counter order's lines are
    // never sendable, so its note would be lost with nothing to guard it; red.
    expect(unsavedNoteFrom([edit({ sendable: false, noteDirty: true })])).toEqual({
      lineId: "l1",
      name: "Mohinga",
    });
    expect(unsavedNoteFrom([edit({ writing: true })])).toBeNull();
    expect(unsavedNoteFrom([])).toBeNull();
  });
});

describe("padSettleReason — one sentence per reason, read by the hint AND a refused tap", () => {
  const ctx = (over: Partial<PadReasonCtx> = {}): PadReasonCtx => ({
    tab: false,
    note: null,
    blocker: null,
    ...over,
  });
  it("every reason has its sentence (the union is exhaustive by type)", () => {
    const blocks: PadSettleBlock[] = ["paying", "note", "waiting", "empty"];
    for (const b of blocks) expect(STAFF[padSettleReason(b, ctx()).k], b).toBeDefined();
  });
  it("a paying guest names the running bill when there is one", () => {
    expect(padSettleReason("paying", ctx()).k).toBe("table.detail.payingPhone.cash");
    expect(padSettleReason("paying", ctx({ tab: true })).k).toBe("table.detail.payingPhone.tab");
  });
  it("the note names its dish", () => {
    expect(padSettleReason("note", ctx({ note: "မုန့်ဟင်းခါး" }))).toEqual({
      k: "table.send.hold.note",
      vars: { x: "မုန့်ဟင်းခါး" },
    });
  });
  it("a LOST add names the fix; only an add still coming asks anyone to wait", () => {
    // MUTATION: a lost add worded as "Waiting to hear back" — nothing is coming, and a family
    // member waits forever instead of tapping Try again; red.
    expect(padSettleReason("waiting", ctx({ blocker: { name: "Tea", state: "lost" } }))).toEqual({
      k: "table.send.hold.lost",
      vars: { x: "Tea" },
    });
    expect(
      padSettleReason("waiting", ctx({ blocker: { name: "Tea", state: "unconfirmed" } })),
    ).toEqual({ k: "table.send.hold.add", vars: { x: "Tea" } });
    expect(padSettleReason("waiting", ctx()).k).toBe("table.send.hold.writing");
  });
});

describe("Take payment's busy words follow what it is actually doing", () => {
  it("it waits for a dish only while one is on its way", () => {
    // MUTATION: always starting in `draining` — "Waiting for the last dish…" with no dish coming; red.
    expect(padSettleStartPhase({ flying: 0, saveName: false })).toBe("opening");
    expect(padSettleStartPhase({ flying: 1, saveName: true })).toBe("draining");
    expect(padSettleStartPhase({ flying: 0, saveName: true })).toBe("saving");
  });
  it("each phase says its own words", () => {
    expect(padSettleBusyKey("idle")).toBeNull();
    expect(padSettleBusyKey("draining")).toBe("pad.settle.busy");
    expect(padSettleBusyKey("saving")).toBe("pad.settle.savingName");
    expect(padSettleBusyKey("opening")).toBe("pad.settle.opening");
  });
});

describe("padPickCat — a chip toggles against what is SHOWN", () => {
  it("during a search no chip is lit, so the chip chosen before it picks its category again", () => {
    // MUTATION: toggling the STORED choice — tapping Curries during a search opened "All"; red
    // (the component suite pins the wiring: the shown `activeCat` is what it passes).
    expect(padPickCat(null, "curries")).toBe("curries");
  });
  it("tapping the lit chip goes back to All; All is All", () => {
    expect(padPickCat("curries", "curries")).toBeNull();
    expect(padPickCat("curries", "noodles")).toBe("noodles");
    expect(padPickCat("curries", null)).toBeNull();
  });
});

const SEND: StaffSendView = {
  kind: "send",
  units: 2,
  emphasis: "primary",
  note: null,
  blocked: null,
  staffAdded: 2,
  dinerUnits: 0,
};

describe("padSendView — the Send while adds are in flight", () => {
  it("a count is a claim only from a view that has seen the cart: bare while anything flies", () => {
    const r = padSendView(SEND, { sendable: true, paying: false, pending: { ...NONE, flying: 1 } });
    expect(r.bare).toBe(true);
    expect(r.view).toBe(SEND);
    // MUTATION: bare on flying only — a landed-but-unseen add is not in the count yet; red.
    expect(
      padSendView(SEND, { sendable: true, paying: false, pending: { ...NONE, unseen: 1 } }).bare,
    ).toBe(true);
    expect(padSendView(SEND, { sendable: true, paying: false, pending: NONE }).bare).toBe(false);
  });

  it("the first dish in flight on an empty table still offers a (bare) Send", () => {
    const r = padSendView(
      { kind: "none" },
      { sendable: true, paying: false, pending: { ...NONE, flying: 1 } },
    );
    // MUTATION: passing the server's `none` through — the Send appears only after the round trip,
    // and a fast "add, send" tap lands on nothing; red.
    expect(r.view).toMatchObject({ kind: "send", units: 0, emphasis: "primary", blocked: null });
    expect(r.bare).toBe(true);
    expect(
      padSendView(
        { kind: "allSent" },
        {
          sendable: true,
          paying: true,
          pending: { ...NONE, unseen: 1 },
        },
      ).view,
    ).toMatchObject({ kind: "send", blocked: "paying" });
  });

  it("never at a counter order or a closed one", () => {
    const counter: StaffSendView = { kind: "counterAtPay" };
    expect(
      padSendView(counter, { sendable: false, paying: false, pending: { ...NONE, flying: 1 } }),
    ).toEqual({ view: counter, bare: false });
  });
});

describe("padTileBlock — when a tile tap is refused", () => {
  it("only an UNCONFIRMED add blocks the tiles (the hung request queues every later one)", () => {
    expect(padTileBlock({ open: true, paying: false, pending: NONE })).toBeNull();
    // A lost add answered — the queue is free, so tiles stay live.
    expect(padTileBlock({ open: true, paying: false, pending: { ...NONE, lost: 1 } })).toBeNull();
    expect(padTileBlock({ open: true, paying: false, pending: { ...NONE, unconfirmed: 1 } })).toBe(
      "waiting",
    );
  });
  it("a guest paying pauses adding; a closed order refuses", () => {
    expect(padTileBlock({ open: true, paying: true, pending: NONE })).toBe("paying");
    expect(padTileBlock({ open: false, paying: false, pending: NONE })).toBe("closed");
  });
});
