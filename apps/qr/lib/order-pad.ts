import { needsChoice, type ModGroup } from "./menu/modifiers";
import { browseRows, type BrowseRow } from "./menu-browse";
import { catalogNameMy } from "./ticket-names";
import type { TableDetail, TableLineView } from "./floor-types";
import {
  sendHoldMsg,
  type StaffKeyMsg,
  type StaffLineEdit,
  type StaffSendView,
} from "./staff-send-view";
// ── Phase 2c · gate ──
import { settleBlockedMsg } from "./staff-send-view";
import { staffSettleBlockedByUnsent } from "./checkout-stage";
import type { PendingCounts } from "./pad-pending";
import type { StaffLang } from "./staff-lang";
import type { StaffKey } from "./i18n/staff";

/**
 * Phase 2c · pad — the ORDER PAD's decisions, pure (DESIGN-LANGUAGE §28).
 *
 * The pad is dish TILES beside ONE live ticket, with the Send and Take payment always in reach. The
 * rules that decide what a tap does, what a tile and the ticket say, and when a control refuses live
 * here as values, so each is falsified by a value rather than a render plus five mocks (CLAUDE.md,
 * "decision logic belongs in lib/"). The components (`OrderPad`, `PadTile`, `StaffTicket`) only
 * render what these return.
 *
 * What is NOT here, deliberately: the Send's own state machine. The pad REUSES the table page's send
 * controller (`useStaffSend` + `StaffSendButton`, Phase 2a) unchanged; `padSendView` below only
 * decides what VIEW that controller is handed while adds are still in flight.
 */

// ── the tiles ────────────────────────────────────────────────────────────────────────────────────

/** A catalog dish as the pad reads it (the add page's shaped read). */
export type PadCatalogItem = BrowseRow & {
  priceCents: number;
  /** `menu_categories.slug` — the rail's key; `category` (BrowseRow) is its display name. */
  categorySlug: string;
  /** `menu_categories.sort_order` — the rail's order and the sections' order. */
  categorySort: number;
  groups: ModGroup[];
};

export type TileAction = "soldOut" | "choose" | "add";

/** What one tap on a dish does. Sold out wins; then a REQUIRED choice opens the sheet; otherwise
 *  the tap adds one, no modifiers (the tile's corner opens the sheet for the optional ones). */
export function tileAction(item: {
  soldOut: boolean;
  groups: readonly Pick<ModGroup, "minSelect">[];
}): TileAction {
  if (item.soldOut) return "soldOut";
  if (needsChoice(item.groups)) return "choose";
  return "add";
}

export type PadName = {
  lead: { text: string; lang: StaffLang };
  echo: { text: string; lang: StaffLang } | null;
};

/**
 * A dish's name, Burmese-first where the console is Burmese. The console's tongue LEADS and the
 * other echoes beneath. The Burmese is a catalog fact or nothing (`catalogNameMy` — a `name_my` with
 * no Myanmar script, or equal to the English, is not Burmese). With no Burmese on a Burmese console
 * the ENGLISH leads marked `en` with no echo: never set in Padauk, never announced as Burmese.
 */
export function padDishName(lang: StaffLang, nameEn: string, nameMyRaw: string | null): PadName {
  const my = catalogNameMy(nameMyRaw, nameEn);
  if (my === null) return { lead: { text: nameEn, lang: "en" }, echo: null };
  return lang === "my"
    ? { lead: { text: my, lang: "my" }, echo: { text: nameEn, lang: "en" } }
    : { lead: { text: nameEn, lang: "en" }, echo: { text: my, lang: "my" } };
}

export type PadCategory = { slug: string; title: string };

/** The rail: every category the catalog holds, in the menu's `sort_order` (ties keep catalog order). */
export function padCategories(items: readonly PadCatalogItem[]): PadCategory[] {
  const seen = new Map<string, { title: string; sort: number; at: number }>();
  items.forEach((i, at) => {
    if (!seen.has(i.categorySlug))
      seen.set(i.categorySlug, { title: i.category, sort: i.categorySort, at });
  });
  return [...seen.entries()]
    .sort((a, b) => a[1].sort - b[1].sort || a[1].at - b[1].at)
    .map(([slug, v]) => ({ slug, title: v.title }));
}

export type PadSection<T> = { key: string; title: string | null; items: T[] };

/**
 * A chip tap toggles against what is SHOWN, never what is stored: during a search no chip is lit
 * (`padSections` reports `activeCat: null`), so any chip — the one chosen before the search
 * included — picks its category. Toggling the stored choice instead opened "All" on the desktop
 * register, where the rail stays beside the field while a search runs.
 */
export function padPickCat(activeCat: string | null, slug: string | null): string | null {
  return slug === null || activeCat === slug ? null : slug;
}

/**
 * The tile pane. A non-empty search IGNORES the chip and matches English, raw Burmese and category
 * across the WHOLE menu into one untitled section — and reports no active chip, so no lit chip ever
 * claims a filter that is not applied (the chosen category comes back when the query clears). With
 * no search: the chosen category's one section, or every category in `sort_order` ("All"). The
 * catalog's own order holds inside a section, and a sold-out dish keeps its place.
 */
export function padSections<T extends PadCatalogItem>(
  items: readonly T[],
  opts: { q: string; cat: string | null },
): { activeCat: string | null; sections: PadSection<T>[] } {
  if (opts.q.trim() !== "")
    return {
      activeCat: null,
      sections: [{ key: "search", title: null, items: browseRows(items, opts.q, false) }],
    };
  const sections = padCategories(items).map((c) => ({
    key: c.slug,
    title: c.title,
    items: items.filter((i) => i.categorySlug === c.slug),
  }));
  const chosen = opts.cat === null ? undefined : sections.find((s) => s.key === opts.cat);
  return chosen ? { activeCat: chosen.key, sections: [chosen] } : { activeCat: null, sections };
}

// ── the ticket ───────────────────────────────────────────────────────────────────────────────────

/** Confirmed units per dish — the tile's `×N` badge (§21: a count is a claim only from a view that
 *  saw the cart, so it reads the committed detail, never the pending adds). Voided lines are off the
 *  order; a comped line is still on it (the kitchen still makes it). */
export function ticketUnitsByItem(
  lines: readonly Pick<TableLineView, "menuItemId" | "qty" | "state">[],
): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (l.state === "voided" || l.menuItemId === null) continue;
    m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.qty);
  }
  return m;
}

export type TicketGroupKey = "unsent" | "togo" | "kitchen" | "served" | "voided";

const GROUP_ORDER: readonly TicketGroupKey[] = ["unsent", "togo", "kitchen", "served", "voided"];

function groupOf(l: TableLineView, mode: TableDetail["mode"]): TicketGroupKey {
  if (l.state === "voided") return "voided";
  if (l.state === "served") return "served";
  if (l.state === "fired" || l.state === "in_progress") return "kitchen";
  // A draft. At a dine-in table a to-go draft cooks at pay, never on the Send — its own group, so
  // "Not sent yet" lists exactly what the Send fires. Off a dine-in session every draft is unsent.
  return mode === "dinein" && l.fulfillment === "togo" ? "togo" : "unsent";
}

/** The ticket's sections, in reading order: not sent · to-go · in the kitchen · served · removed.
 *  Headings only when two or more groups exist (a lone heading over every line says nothing). */
export function ticketGroups(
  lines: readonly TableLineView[],
  mode: TableDetail["mode"],
): { groups: { key: TicketGroupKey; lines: TableLineView[] }[]; showHeadings: boolean } {
  const groups = GROUP_ORDER.map((key) => ({
    key,
    lines: lines.filter((l) => groupOf(l, mode) === key),
  })).filter((g) => g.lines.length > 0);
  return { groups, showHeadings: groups.length >= 2 };
}

/** The ticket's group of a line — the one reading `useLineMotion` groups rows by. */
export function ticketGroupOf(l: TableLineView, mode: TableDetail["mode"]): TicketGroupKey {
  return groupOf(l, mode);
}

export const TICKET_GROUP_ORDER = GROUP_ORDER;

// ── amounts, Send and Take payment ───────────────────────────────────────────────────────────────

/** The ticket's OWN writes (a qty change, a note, a removal), as the amounts read them. */
export type PadLineWrites = {
  /** Line writes still in flight. */
  writing: number;
  /** A line write answered, but no read that STARTED after its answer has committed yet — the
   *  server's figures still predate it (the same rule as a landed add's ghost). */
  unread: boolean;
};

/** Every amount the pad names (the ticket's subtotal, Take payment's figure) is shown only when
 *  nothing is pending — no add flying, landed but not yet read, unconfirmed or lost, and no line
 *  write in flight or unread. One predicate, so the two can never disagree about whether a figure
 *  is current (§23: amounts are never intent; a quantity just changed beside the old total is one). */
export function padAmountsSettled(p: PendingCounts, lines: PadLineWrites): boolean {
  const adds = p.flying + p.unseen + p.unconfirmed + p.lost === 0;
  return adds && lines.writing === 0 && !lines.unread;
}

/**
 * The unsaved kitchen note Take payment waits on. WIDER than the Send's `sendHoldFrom`: ANY draft
 * line's note, because Take payment LEAVES the pad — the editor unmounts and its draft goes with it
 * — and a counter order's lines and a table's to-go drafts cook at payment, so there the note is
 * lost with no Send to guard it. The note is where an allergy lives.
 */
export function unsavedNoteFrom(
  edits: ReadonlyArray<StaffLineEdit>,
): { lineId: string; name: string } | null {
  const note = edits.find((e) => e.noteDirty);
  return note ? { lineId: note.lineId, name: note.name } : null;
}

/**
 * Why Take payment refuses a tap. Phase 2c · gate — `"unsent"` is the settle gate (owner decision 3:
 * every settle door refuses while dine-in dishes are unsent), read from the SAME binding the table
 * page and the server refuse on (`staffSettleBlockedByUnsent`); its sentence is in `SETTLE_REASON`,
 * a `Record` over this union.
 */
export type PadSettleBlock = "paying" | "note" | "waiting" | "unsent" | "empty";

/** Take payment's life after a tap: waiting on a dish still on its way, saving a typed counter name,
 *  then opening the table's payment section. */
export type PadSettlePhase = "idle" | "draining" | "saving" | "opening";

export type PadSettleInput = {
  mode: TableDetail["mode"];
  /** The order is open (a cart, not settled). */
  open: boolean;
  /** A guest's payment holds the cart (`paymentInFlight`). */
  paying: boolean;
  /** The server's chargeable units. */
  itemCount: number;
  /** The server's tax-inclusive settle total, or null. */
  settleTotalCents: number | null;
  pending: PendingCounts;
  /** The send controller is mid-write (sending, bringing back). */
  sendBusy: boolean;
  /** A line's kitchen note is typed but not saved (`unsavedNoteFrom`). */
  unsavedNote: boolean;
  /** The ticket's own writes: one in flight holds Take payment; any hides its amount. */
  lines: PadLineWrites;
  settlePhase: PadSettlePhase;
  /** Phase 2c · gate — the server's unsent dine-in units (`detail.send.sendable`), the count the
   *  settle gate reads. Never restated: `padSettle` hands it to `staffSettleBlockedByUnsent`. */
  unsentUnits: number;
};

export type PadSettle = {
  variant: "primary" | "secondary";
  enabled: boolean;
  busy: boolean;
  showAmount: boolean;
  block: PadSettleBlock | null;
};

export function padSettle(i: PadSettleInput): PadSettle {
  // Secondary at a dine-in table: the next step after Send is leaving, not paying — and there are
  // never two filled pills (§20). A counter order has no Send, so paying IS its one action.
  const variant = i.mode === "dinein" && i.open ? "secondary" : "primary";
  const busy = i.settlePhase !== "idle";
  const inFlight = i.pending.flying + i.pending.unseen;
  const block: PadSettleBlock | null = i.paying
    ? "paying"
    : i.unsavedNote
      ? "note"
      : i.pending.unconfirmed + i.pending.lost > 0 || i.sendBusy || i.lines.writing > 0
        ? "waiting"
        : // Phase 2c · gate — AFTER waiting: while a write is pending the count is stale.
          staffSettleBlockedByUnsent(i.mode, i.unsentUnits)
          ? "unsent"
          : i.itemCount === 0 && inFlight === 0
            ? "empty"
            : null;
  return {
    variant,
    // A tap while an add FLIES is accepted: the pad drains the add chain, then goes.
    enabled: i.open && block === null && !busy,
    busy,
    showAmount: i.settleTotalCents !== null && padAmountsSettled(i.pending, i.lines),
    block,
  };
}

/** What a refused Take payment says: the dish on a hold, the running bill on a paying guest. */
export type PadReasonCtx = {
  /** The table runs a running bill. */
  tab: boolean;
  /** The dish whose note is unsaved, as the console renders it. */
  note: string | null;
  /** The add Take payment waits on: its dish, and whether its answer was lost or is still coming. */
  blocker: { name: string; state: "unconfirmed" | "lost" } | null;
  /** Phase 2c · gate — the unsent dine-in units the settle gate names (`detail.send.sendable`). */
  unsent: number;
};

/** One sentence per reason. A `Record` over the union (never a ternary chain that falls through to
 *  nothing), so a reason added to `PadSettleBlock` is a compile error until it can be said. The add
 *  hold words are the Send's own (`sendHoldMsg`): one hold, one sentence, wherever it is said. */
const SETTLE_REASON: { readonly [B in PadSettleBlock]: (c: PadReasonCtx) => StaffKeyMsg } = {
  paying: (c) => ({ k: c.tab ? "table.detail.payingPhone.tab" : "table.detail.payingPhone.cash" }),
  note: (c) => ({ k: "table.send.hold.note", vars: { x: c.note ?? "" } }),
  waiting: (c) =>
    c.blocker
      ? sendHoldMsg({ kind: "add", name: c.blocker.name, state: c.blocker.state })
      : { k: "table.send.hold.writing" },
  empty: () => ({ k: "pad.reason.empty" }),
  // Phase 2c · gate — the table page's own sentence (one fact, one sentence): the fix is the Send.
  unsent: (c) => settleBlockedMsg(c.unsent, false),
};

/** The sentence for a refused Take payment — its hint, and what a tap on it says (§17). */
export function padSettleReason(block: PadSettleBlock, c: PadReasonCtx): StaffKeyMsg {
  return SETTLE_REASON[block](c);
}

const SETTLE_BUSY: { readonly [P in Exclude<PadSettlePhase, "idle">]: StaffKey } = {
  draining: "pad.settle.busy",
  saving: "pad.settle.savingName",
  opening: "pad.settle.opening",
};

/** What a busy Take payment says — the phase it is actually in, never "waiting for the last dish"
 *  when no dish is on its way. */
export function padSettleBusyKey(phase: PadSettlePhase): StaffKey | null {
  return phase === "idle" ? null : SETTLE_BUSY[phase];
}

/** The phase a Take payment tap starts in: it WAITS only while an add is still on its way (the
 *  drain returns at once otherwise), then saves a typed counter name, then opens payment. */
export function padSettleStartPhase(i: {
  flying: number;
  saveName: boolean;
}): Exclude<PadSettlePhase, "idle"> {
  return i.flying > 0 ? "draining" : i.saveName ? "saving" : "opening";
}

/**
 * What VIEW the reused send controller is handed. A count is a claim only from a view that has SEEN
 * the cart (§21), so while any add is flying or landed-but-unread the Send is BARE ("Send to
 * kitchen", no count). And the first dish in flight on an empty table still offers a Send: the tap
 * drains the add chain before it fires (`useStaffSend`'s `drain`), so "add, send" is two taps, not
 * two round trips. Only where a Send can exist at all (`sendable`: a dine-in table, open).
 */
export function padSendView(
  view: StaffSendView,
  i: { sendable: boolean; paying: boolean; pending: PendingCounts },
): { view: StaffSendView; bare: boolean } {
  if (!i.sendable) return { view, bare: false };
  const bare = i.pending.flying + i.pending.unseen > 0;
  if (!bare || view.kind === "send") return { view, bare };
  return {
    view: {
      kind: "send",
      units: 0,
      emphasis: "primary",
      note: null,
      blocked: i.paying ? "paying" : null,
      staffAdded: 0,
      dinerUnits: 0,
    },
    bare,
  };
}

export type PadTileBlock = "closed" | "paying" | "waiting";

/** When a tile tap is refused without dispatching. A guest paying pauses adding (the server would
 *  refuse); an UNCONFIRMED add holds every tile because Next runs actions one at a time — the hung
 *  request queues each later one behind it. A LOST add answered, so the queue is free. */
export function padTileBlock(i: {
  open: boolean;
  paying: boolean;
  pending: PendingCounts;
}): PadTileBlock | null {
  if (!i.open) return "closed";
  if (i.paying) return "paying";
  if (i.pending.unconfirmed > 0) return "waiting";
  return null;
}
