import { describe, expect, it } from "vitest";
import { KDS_UNDO_MS } from "./kds-undo";
import type { TrackLine } from "./kitchen-track";
import {
  initialStage,
  kitchenDraftQty,
  kitchenDraftUnitsFromRows,
  payBlockedByUnsent,
  phonePayParked,
  doorMode,
  holdsServedGate,
  servedGateApplies,
  servedGateDecision,
  servedGateVerdict,
  staffSettleBlockedByUnsent,
  staffSettleUnsentVerdict,
  unsentFoodQty,
} from "./checkout-stage";

/**
 * W12 — the two-moment landing rule, pinned:
 *   drafts → Order (still building a round); fired-only → Bill (came back to pay);
 *   empty → Order (the empty state renders first anyway — never a $0 bill).
 */
const line = (lineState: "draft" | "fired" | "in_progress" | "served" | "voided") => ({
  lineState,
});

describe("initialStage — where the dine-in cart lands", () => {
  it("any draft line lands on the Order moment (a round is still being built)", () => {
    expect(initialStage([line("fired"), line("served"), line("draft")])).toBe("order");
  });
  it("everything with the kitchen lands on the Bill moment (the settle-nudge journey)", () => {
    expect(initialStage([line("fired"), line("in_progress"), line("served")])).toBe("bill");
  });
  it("an empty cart answers Order — the bill of nothing is never the landing", () => {
    expect(initialStage([])).toBe("order");
  });
  it("voided-only still answers Bill — the record of the table, not a fresh round", () => {
    expect(initialStage([line("voided")])).toBe("bill");
  });
});

describe("kitchenDraftQty — the Send CTA counts only what mms_fire_cart fires", () => {
  const l = (
    lineState: "draft" | "fired",
    fulfillment: "dinein" | "togo" | "grocery",
    qty: number,
  ) => ({ lineState, fulfillment, qty });
  it("counts dine-in draft UNITS only — to-go waits for checkout, grocery never fires", () => {
    // 2× curry (dinein draft) + 1 dessert (togo draft) + 1 jar (grocery draft) + a fired line
    expect(
      kitchenDraftQty([
        l("draft", "dinein", 2),
        l("draft", "togo", 1),
        l("draft", "grocery", 1),
        l("fired", "dinein", 3),
      ]),
    ).toBe(2);
  });
  it("a lone to-go/grocery draft is ZERO — the kitchen verb is spent, the bill door promotes", () => {
    expect(kitchenDraftQty([l("draft", "togo", 1), l("fired", "dinein", 2)])).toBe(0);
  });
});

describe("unsentFoodQty — what the Bill moment warns about (W19)", () => {
  const l = (
    lineState: "draft" | "fired" | "served",
    fulfillment: "dinein" | "togo" | "grocery",
    qty: number,
  ) => ({ lineState, fulfillment, qty });

  it("counts EVERY draft food unit — dinein AND togo — matching mms_fire_pending_food", () => {
    // 2× curry (dinein draft) + 1 dessert (togo draft) → both are charged-then-fired at pay.
    // This is deliberately BROADER than kitchenDraftQty: the same fixture answers 2 there
    // (see above) and 3 here — the two predicates must be separable or one mutant survives.
    expect(
      unsentFoodQty([l("draft", "dinein", 2), l("draft", "togo", 1), l("fired", "dinein", 3)]),
    ).toBe(3);
  });

  it("grocery never fires — a self-scanned jar is not an unsent dish", () => {
    expect(unsentFoodQty([l("draft", "grocery", 4)])).toBe(0);
  });

  it("nothing unsent → zero (no notice, no confirm line)", () => {
    expect(unsentFoodQty([l("fired", "dinein", 2), l("served", "togo", 1)])).toBe(0);
  });
});

describe("payBlockedByUnsent — a dine-in bill is payable only once everything is sent (Phase 1b)", () => {
  it("blocks a dine-in bill with anything unsent, and only a dine-in one", () => {
    // MUTATION: drop the mode check — pickup / scan-and-go (no send step: paying IS ordering) can
    // never pay at all; red.
    expect(payBlockedByUnsent("dinein", 2, true)).toBe(true);
    expect(payBlockedByUnsent("pickup", 2, true)).toBe(false);
    expect(payBlockedByUnsent("scango", 2, true)).toBe(false);
    // MUTATION: `>= 0` — a fully sent table can never pay; red.
    expect(payBlockedByUnsent("dinein", 0, true)).toBe(false);
  });

  it("never blocks a table with no host — nobody there could send", () => {
    // MUTATION: drop `hostPresent` — a staff-started table whose diners all came by invite link has
    // no one who can send, so it could never pay at all; red.
    expect(payBlockedByUnsent("dinein", 2, false)).toBe(false);
  });

  it("counts exactly what Send can clear — dinein drafts, never to-go or fired lines", () => {
    // MUTATION: count every draft — a to-go draft (not sendable, it fires at checkout) would lock
    // Pay with no button that can ever unlock it; red.
    const rows = [
      { state: "draft", fulfillment: "dinein", qty: 2 },
      { state: "draft", fulfillment: "togo", qty: 1 },
      { state: "fired", fulfillment: "dinein", qty: 3 },
    ];
    expect(kitchenDraftUnitsFromRows(rows)).toBe(2);
    expect(kitchenDraftUnitsFromRows([{ state: "draft", fulfillment: "togo", qty: 1 }])).toBe(0);
  });
});

// ── Phase 2c · gate ──
describe("staffSettleBlockedByUnsent — the staff settle gate is the diner gate's counter half", () => {
  it("blocks a dine-in settle with anything unsent, host or NO host — the console can always send", () => {
    // MUTATION (checkout-stage/staff-gate-exempts-a-hostless-table): delegate with `hostPresent`
    // false — the one table the gate exists for (staff-started, nobody else sends) settles over its
    // unsent dishes, charges for them, and cooks them after the guest has gone; red.
    expect(staffSettleBlockedByUnsent("dinein", 2)).toBe(true);
    // The diner side exempts that same table (only the host sends there): the two gates differ
    // EXACTLY on the hostless flag, which is the whole of this function.
    expect(payBlockedByUnsent("dinein", 2, false)).toBe(false);
  });

  it("never blocks a counter order (paying IS ordering there) or a fully sent table", () => {
    expect(staffSettleBlockedByUnsent("pickup", 2)).toBe(false);
    expect(staffSettleBlockedByUnsent("scango", 2)).toBe(false);
    expect(staffSettleBlockedByUnsent("dinein", 0)).toBe(false);
    expect(staffSettleBlockedByUnsent(null, 2)).toBe(false);
  });

  it("is the diner rule with a host present — never a second statement of it", () => {
    for (const mode of ["dinein", "pickup", "scango", null, undefined])
      for (const n of [0, 1, 3])
        expect(staffSettleBlockedByUnsent(mode, n)).toBe(payBlockedByUnsent(mode, n, true));
  });
});

describe("staffSettleUnsentVerdict — P2dc: the staff doors fail CLOSED on an unreadable count", () => {
  it("an unreadable count at a dine-in table refuses (`unreadable`), never passes as 0", () => {
    // MUTATION (p2d-dc/verdict-null-reads-as-zero): return null for null — every staff door takes
    // money over a gate nobody could check; red.
    expect(staffSettleUnsentVerdict("dinein", null)).toBe("unreadable");
  });
  it("…but only where the gate could ever refuse: a counter order's unreadable count passes", () => {
    // MUTATION (p2d-dc/verdict-null-closes-every-mode): refuse null in any mode; red.
    expect(staffSettleUnsentVerdict("pickup", null)).toBeNull();
    expect(staffSettleUnsentVerdict("scango", null)).toBeNull();
  });
  it("a readable count is the settle gate, unchanged", () => {
    expect(staffSettleUnsentVerdict("dinein", 2)).toBe("unsent");
    expect(staffSettleUnsentVerdict("dinein", 0)).toBeNull();
    expect(staffSettleUnsentVerdict("pickup", 2)).toBeNull();
  });
});

describe("PD2 — phonePayParked: the dine-in phone-pay door, parked until live keys (decision 2)", () => {
  it("a dine-in table with the door parked: parked", () => {
    // MUTATION (checkout-stage/parked-door-admits-a-table): the switch ignored — the Bill draws
    // its card hero and create-intent mints at a table on TEST keys; red.
    expect(phonePayParked("dinein", false)).toBe(true);
  });
  it("the flip opens it with nothing else changed", () => {
    expect(phonePayParked("dinein", true)).toBe(false);
  });
  it("only a table reads the switch — pickup, scan-and-go and an unreadable mode are never parked", () => {
    // MUTATION (checkout-stage/parked-door-refuses-pickup): the mode check dropped — every pickup
    // and market payment is refused at create-intent behind a rule meant for tables; red.
    expect(phonePayParked("pickup", false)).toBe(false);
    expect(phonePayParked("scango", false)).toBe(false);
    expect(phonePayParked(null, false)).toBe(false);
    expect(phonePayParked(undefined, false)).toBe(false);
    expect(phonePayParked("", false)).toBe(false);
  });
});

describe("Codex round 2 on #331 — doorMode: the parked door reads the AUTHORITATIVE mode", () => {
  it("the cart view's mode wins — a missed split read cannot un-park a dine-in table", () => {
    // MUTATION (checkout-stage/door-reads-the-best-effort-mode): the view's mode dropped — a split
    // read that answered null (or the unchecked "") draws the card hero at a table create-intent
    // refuses; red.
    expect(doorMode("dinein", null)).toBe("dinein");
    expect(doorMode("dinein", "")).toBe("dinein");
    expect(phonePayParked(doorMode("dinein", null), false)).toBe(true);
    // The view is the authority even where the two disagree.
    expect(doorMode("pickup", "dinein")).toBe("pickup");
  });
  it("the split's mode is the fallback, and nothing known is null — never a table", () => {
    expect(doorMode(null, "dinein")).toBe("dinein");
    expect(doorMode("", "pickup")).toBe("pickup");
    expect(doorMode(undefined, "")).toBeNull();
    expect(phonePayParked(doorMode(null, null), false)).toBe(false);
  });
});

/**
 * PD10 · D5 (PATH_DESIGN_2026-10-07 decision 10) — THE SERVED GATE: phone pay at a table opens only
 * when nothing on the bill is still with the kitchen. Every case is one a `checkout-stage/served-gate-*`
 * mutant turns red, and several are chosen to SEPARATE this rule from `payBlockedByUnsent` (the
 * "Everything sent" rule it must not collapse into): a hostless draft, a to-go draft and a fired or
 * cooking line are each a case where "Everything sent" opens the door and D5 holds it. Times are
 * relative to a fixed DB clock — the undo window is a comparison against it.
 */
describe("PD10 · D5 — servedGateVerdict: the door opens only once everything is served", () => {
  const NOW = "2026-10-11T19:48:00.000Z";
  const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
  const served = (over: Partial<TrackLine> = {}): TrackLine => ({
    state: "served",
    fire_at: at(-600_000),
    bumped_at: at(-KDS_UNDO_MS - 1_000),
    fulfillment: "dinein",
    ...over,
  });
  const verdict = (lines: TrackLine[], hostPresent = true, mode: string | null = "dinein") =>
    servedGateVerdict(mode, lines, NOW, hostPresent);

  it("everything served past Mom's undo window → the door is open", () => {
    expect(verdict([served(), served({ fulfillment: "togo" })])).toBeNull();
  });

  it("a fired or cooking line holds it — where 'Everything sent' would have opened the door", () => {
    // MUTATION (checkout-stage/served-gate-only-counts-drafts): a sent line skipped — the
    // "Everything sent" rule under a new name; Thiri pays while the Mohinga is on the wok; red.
    const fired = served({ state: "fired", bumped_at: null });
    const cooking = served({ state: "in_progress", bumped_at: null });
    expect(verdict([served(), fired])).toBe("kitchen");
    expect(verdict([served(), cooking])).toBe("kitchen");
    // The separation, said as values: "Everything sent" answers OPEN for this exact table.
    expect(payBlockedByUnsent("dinein", 0, true)).toBe(false);
  });

  it("a served line inside Mom's undo window holds it — `bumped_at` must be KDS_UNDO_MS old on the DB clock", () => {
    // MUTATION (checkout-stage/served-gate-reads-raw-served): the raw `served` state trusted — a
    // bump Mom takes back inside her six seconds opens the door and a card is charged; red.
    expect(verdict([served({ bumped_at: at(-KDS_UNDO_MS + 1) })])).toBe("kitchen");
    expect(verdict([served({ bumped_at: at(-1_000) })])).toBe("kitchen");
    // The edge: exactly KDS_UNDO_MS old is settled (the track's own `>=`).
    expect(verdict([served({ bumped_at: at(-KDS_UNDO_MS) })])).toBeNull();
    // A served line with no bump stamp has nothing to settle — it holds (fail closed).
    expect(verdict([served({ bumped_at: null })])).toBe("kitchen");
  });

  it("a COMPED dish still cooks, so it still holds (its price is $0, its plate is not)", () => {
    // TrackLine carries no comp flag by design: the hold set is food, not money.
    expect(verdict([served(), served({ state: "in_progress", bumped_at: null })])).toBe("kitchen");
  });

  it("a hostless table's dine-in draft HOLDS — with its own reason (the server, the counter)", () => {
    // MUTATION (checkout-stage/served-gate-exempts-a-hostless-draft): the host exemption inherited
    // from `payBlockedByUnsent` — a hostless table pays by phone before its drafts are even fired;
    // red. The separation: "Everything sent" lets this exact table through.
    const draft = served({ state: "draft", fire_at: null, bumped_at: null });
    expect(verdict([served(), draft], false)).toBe("hostless");
    expect(payBlockedByUnsent("dinein", 1, false)).toBe(false);
    // With a host, the same draft is the host's to send.
    expect(verdict([served(), draft], true)).toBe("unsent");
  });

  it("a TO-GO draft holds — it fires only when the bill is paid (Codex round 3)", () => {
    // MUTATION (checkout-stage/served-gate-ignores-a-togo-draft): the to-go arm deleted — a phone
    // pays before that dish is cooked, and the head reads Served beside an unsent row; red. The
    // separation: "Everything sent" never counts a to-go draft.
    const togo = served({ state: "draft", fulfillment: "togo", fire_at: null, bumped_at: null });
    expect(verdict([served(), togo])).toBe("togo");
    expect(kitchenDraftUnitsFromRows([{ state: "draft", fulfillment: "togo", qty: 1 }])).toBe(0);
  });

  it("precedence: a dine-in draft > a to-go draft > the kitchen", () => {
    // MUTATION (checkout-stage/served-gate-kitchen-outranks-unsent): the kitchen named first — the
    // host is told to wait for food when the next act is the Send only they can make; red.
    const fired = served({ state: "fired", bumped_at: null });
    const draft = served({ state: "draft", fire_at: null, bumped_at: null });
    const togo = { ...draft, fulfillment: "togo" };
    expect(verdict([fired, togo, draft])).toBe("unsent");
    expect(verdict([fired, togo])).toBe("togo");
  });

  it("grocery and voided lines never hold it", () => {
    // MUTATION (checkout-stage/served-gate-holds-grocery): a grocery line (it never fires) holds the
    // door forever; red.
    expect(verdict([served(), served({ state: "draft", fulfillment: "grocery" })])).toBeNull();
    // MUTATION (checkout-stage/served-gate-holds-a-voided-line): a voided dish (nothing is
    // cooking) holds the door forever; red.
    expect(verdict([served(), served({ state: "voided", bumped_at: null })])).toBeNull();
  });

  it("a state this rule was not written for HOLDS — the gate fails closed", () => {
    // MUTATION (checkout-stage/served-gate-passes-an-unknown-state): only the track's known stages
    // hold — a line nobody can name lets the charge through; red.
    expect(verdict([served(), served({ state: "plated" })])).toBe("kitchen");
    expect(holdsServedGate(served({ state: "plated" }), NOW)).toBe(true);
  });

  it("only a dine-in table is gated — pickup and scan-and-go pay before the kitchen sees it", () => {
    // MUTATION (checkout-stage/served-gate-asks-every-mode): the mode check dropped — every pickup
    // order (its lines are fired AT pay) is refused as "not served"; a revenue outage; red.
    const cooking = served({ state: "in_progress", bumped_at: null });
    expect(verdict([cooking], true, "pickup")).toBeNull();
    expect(verdict([cooking], true, "scango")).toBeNull();
    expect(verdict([cooking], true, null)).toBeNull();
    expect(servedGateApplies("dinein")).toBe(true);
    expect(servedGateApplies("pickup")).toBe(false);
  });
});

describe("PD10 · D5 — servedGateDecision: the server's verdict fails CLOSED on an unreadable read", () => {
  const NOW = "2026-10-11T19:48:00.000Z";
  it("an unreadable read at a table is `unreadable`, never a guessed 'nothing holds'", () => {
    // MUTATION (checkout-stage/served-gate-unreadable-passes): the null read answered null — a read
    // blip lets a card through for food that may be cooking; red.
    expect(servedGateDecision("dinein", null, true)).toBe("unreadable");
  });
  it("…but never on a mode the gate does not apply to (the read is not even spent there)", () => {
    // MUTATION (checkout-stage/served-gate-unreadable-blocks-pickup): the mode check dropped from
    // the decision — a pickup order refused 503 over a read whose answer could not matter; red.
    expect(servedGateDecision("pickup", null, true)).toBeNull();
    expect(servedGateDecision("scango", null, false)).toBeNull();
  });
  it("a readable read is the verdict", () => {
    const line: TrackLine = {
      state: "fired",
      fire_at: NOW,
      bumped_at: null,
      fulfillment: "dinein",
    };
    expect(servedGateDecision("dinein", { lines: [line], nowIso: NOW }, true)).toBe("kitchen");
    expect(servedGateDecision("dinein", { lines: [], nowIso: NOW }, true)).toBeNull();
  });
});
