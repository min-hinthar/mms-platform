import { kitchenDoneAt, kitchenStateOf, type KitchenState } from "./expo-rules";
import { REG_PREFIX } from "./register-queue";
import type { SendPhase, StaffSendView } from "./staff-send-view";

/**
 * Phase 2f · P2v — a COUNTER order may cook before it is paid ("Unpaid — collect at pickup").
 *
 * Owner decision 1 (2026-09-24) + decision 7 (2026-09-30): staff may Send a `reg-` counter order to
 * the kitchen before payment; the ticket, the lane, the floor card and the table page say "Unpaid"
 * until it is settled; a phone order leads with Send, a walk-up with Take payment (7a); a no-show
 * writes off only SENT food through the loss gate (7b); a name is required to send and kept once food
 * is in (7c). Every rule those surfaces share is decided HERE, pure, so `verify:slice` falsifies each
 * one with a value (CLAUDE.md, "Decision logic belongs in `lib/`").
 *
 * The SQL decides every write (`mms_fire_counter_cart`, `mms_undo_counter_fire`,
 * `mms_clear_cart_name`, `mms_counter_no_show` — 20261001000000_p2f_counter_cook_before_paid.sql);
 * these are the TS twins the reads and the pre-refusals use. Each one names its SQL twin.
 *
 * Plain module (no "server-only"): the server reads and the client pages both import it. It must not
 * import `floor-kitchen.ts` (a cycle through `staff-send-view.ts`).
 */

/** How a counter order was started (`qr_carts.counter_arm`, written once at mint). */
export type CounterArm = "walkup" | "phone";

/** `qr_carts.counter_arm` → the arm; anything else (null, a row that predates the column) → null,
 *  which every consumer reads as a walk-up (pay-first). */
export function counterArmOf(raw: string | null | undefined): CounterArm | null {
  return raw === "walkup" || raw === "phone" ? raw : null;
}

/**
 * THE counter-order predicate — the only order that may cook unpaid. SQL twin, restated in each of
 * the four functions' own statements: `s.mode = 'pickup' and s.qr_code like 'reg-%'`. A kiosk order
 * (`kiosk-`), a diner's own pickup and a scan-and-go basket are NOT counter orders: they stay
 * pay-first.
 */
export function isCounterOrder(s: { mode: string; qrCode: string }): boolean {
  return s.mode === "pickup" && s.qrCode.startsWith(REG_PREFIX);
}

/** A line as the counter rules read it (`qr_cart_items` columns). */
export type CounterLine = {
  state: string;
  fire_at?: string | null;
  fulfillment: string;
  comped?: boolean;
};

const SENT_STATES: ReadonlySet<string> = new Set(["fired", "in_progress", "served"]);

/**
 * When a line reached (or reaches) the kitchen, in ms. A line whose `fire_at` column is NULL was fired
 * at or before now: `mms_line_transition`'s draft→fired edge stamped none before the Phase 2f migration §6,
 * and the SQL twins (the no-show's sent set, the sweeper, the kitchen's Start/Ready/bump) read a null as
 * "already fired" — Phase 2f review M2, one reading everywhere. An
 * unparseable stamp (no Postgres writer produces one) is NaN, which no comparison admits.
 */
export function lineFireMs(fireAt: string | null | undefined, nowMs: number): number {
  if (fireAt === null) return nowMs;
  // `undefined` is a caller that never READ the column (`SendRow.fire_at` is optional) — no evidence
  // of anything, so it is never "sent"; only the column's own null means "fired, no stamp".
  return fireAt === undefined ? Number.NaN : Date.parse(fireAt);
}

/**
 * IN THE KITCHEN — the kitchen HAS it, comped or not: fired / in progress / served, not grocery
 * (bag-and-go, never cooked), and PAST its grace (an in-grace line never reached the KDS and can
 * still be taken back; a line with no `fire_at` is past it — `lineFireMs`). This is what an open
 * counter order puts in front of the cook: `kdsLineGate` shows an open counter order's fired / in
 * progress lines past the grace, comped or not (a comp is cooked like any dish), so the lane's unpaid
 * BAG and its kitchen state are built from THIS set — a comped dish still cooking keeps the bag
 * "cooking", and a comped-only bag is still a bag the customer collects (Codex r3 on #308).
 */
export function counterKitchenLine(l: CounterLine, nowMs: number): boolean {
  const fireMs = lineFireMs(l.fire_at, nowMs);
  return SENT_STATES.has(l.state) && l.fulfillment !== "grocery" && fireMs <= nowMs;
}

/**
 * SENT — `counterKitchenLine` and NOT comped: the sent UNPAID food, the loss a no-show writes off (a
 * comp is already an audited loss, never written off twice). The SQL twin is `mms_counter_no_show`'s
 * sent set; `nowMs` must be the DB clock wherever the answer gates a write-off path. The KDS's Unpaid
 * flag reads THIS predicate too (`kdsLineGate`). Never the bag's membership — that is
 * `counterKitchenLine` (a comp is in the bag, it is just not owed).
 */
export function counterSentLine(l: CounterLine, nowMs: number): boolean {
  return counterKitchenLine(l, nowMs) && !l.comped;
}

/**
 * DROPPED by a no-show — gone with the cancelled cart, NOT written off: what `mms_counter_no_show`
 * leaves behind that nobody cooked. Its SQL twin is the function's own effect, not a select: the SENT
 * set (`counterSentLine`) is voided as the loss; every in-grace `fired` line is reverted to draft
 * (`state = 'fired' and fire_at > now()` — NO comped or grocery filter); then the cart is cancelled,
 * taking every draft with it. So a line is dropped when it is a draft, or `fired` and still inside its
 * grace — comped or not (a comped dish in the Send's grace never reached the kitchen either; Codex r2
 * on #308), grocery or not (the cancelled cart takes a bag line exactly as it takes a dish). A line
 * with no `fire_at` is past its grace (`lineFireMs`), so it is never dropped. Disjoint from
 * `counterSentLine` by construction (draft / in-grace vs sent-state past grace). What neither covers —
 * a comped line the kitchen already had, a voided one — the no-show neither writes off nor drops: the
 * comp is already an audited loss, the void already gone. `nowMs` must be the DB clock (the one
 * `sentLineIds` is read on), or the two sets split a line between them.
 */
export function counterNoShowDropped(l: CounterLine, nowMs: number): boolean {
  if (l.state === "draft") return true;
  return l.state === "fired" && lineFireMs(l.fire_at, nowMs) > nowMs;
}

/** Has anything on the order reached the kitchen? */
export function counterSent(lines: readonly CounterLine[], nowMs: number): boolean {
  return lines.some((l) => counterSentLine(l, nowMs));
}

// ── the KDS gate ──────────────────────────────────────────────────────────────────────────────────

export type KdsGateInput = {
  mode: string;
  counterOrder: boolean;
  sessionStatus: string;
  cartStatus: string;
  /** The cart carries a pickup slot (`qr_carts.pickup_slot`): settlement fires it at slot − prep. */
  slotted: boolean;
  /** The line itself — its `fire_at` (null = fired at or before now, `lineFireMs`) and what the
   *  Unpaid flag reads (`counterSentLine`). */
  line: CounterLine;
  nowMs: number;
};

/** Whether the kitchen sees a fired line, and how: `held` = a scheduled (future-fired) PAID pickup
 *  line, drawn dimmed; `unpaid` = an open counter order's SENT line (`counterSentLine`). */
export type KdsGate = { show: false } | { show: true; held: boolean; unpaid: boolean };

const HIDDEN: KdsGate = { show: false };

/**
 * Which fired lines the kitchen board shows (lib/kitchen.ts reads its lines through THIS, so the rule
 * is falsified by a value). Pay-first has exactly ONE staff-only exception — an OPEN counter order,
 * sent by staff through `mms_fire_counter_cart`:
 *
 *  - dine-in: cooks while open — shown once past the grace on an active session;
 *  - counter, cart open: shown once past the grace on an active session, flagged `unpaid` exactly
 *    when `counterSentLine` says so — ONE definition of sent unpaid food (a comp is cooked, shown, and
 *    not unpaid; Phase 2f review PT4);
 *  - counter, cart paid: shown once past the grace. A future fire_at there is the send's grace —
 *    hidden, never "held" — UNLESS the cart carries a pickup slot, and settlement then fires at
 *    slot − prep, the held schedule the kitchen has always seen (Phase 2f review PT2). A diner can no
 *    longer JOIN an active `reg-` code to set one (`reservedCodeRefusal`, Codex r3 on #308), but
 *    `mms_set_pickup_slot` itself still accepts a `reg-` cart (M242), so the branch stays;
 *  - any other counter cart: hidden;
 *  - everything else (a diner's pickup, scan-and-go, a kiosk order): only a PAID cart cooks, and a
 *    future fire_at there is the slot − prep schedule — drawn held.
 */
export function kdsLineGate(i: KdsGateInput): KdsGate {
  const inGrace = lineFireMs(i.line.fire_at, i.nowMs) > i.nowMs;
  if (i.mode === "dinein")
    return i.sessionStatus !== "active" || inGrace
      ? HIDDEN
      : { show: true, held: false, unpaid: false };
  if (i.counterOrder) {
    if (i.cartStatus === "open") {
      if (i.sessionStatus !== "active") return HIDDEN;
      if (inGrace) return HIDDEN;
      return { show: true, held: false, unpaid: counterSentLine(i.line, i.nowMs) };
    }
    if (i.cartStatus === "paid") {
      if (!inGrace) return { show: true, held: false, unpaid: false };
      return i.slotted ? { show: true, held: true, unpaid: false } : HIDDEN;
    }
    return HIDDEN;
  }
  if (i.cartStatus !== "paid") return HIDDEN;
  return { show: true, held: inGrace, unpaid: false };
}

// ── the floor's refusals ──────────────────────────────────────────────────────────────────────────

// Clear's counter refusal lives in SQL (`mms_clear_counter_cart`, Codex r2 on #308): the SENT check
// and the cancel are one locked decision there, so there is no TypeScript twin to drift from it.

/**
 * Merge: never INTO a counter order (its name, arm and pay-at-pickup posture are not a table's), and
 * never a counter order whose food reached the kitchen (the unpaid flag would silently become a
 * table's bill). A counter order that sent nothing merges as before. The target is checked first.
 */
export function mergeCounterRefusal(i: {
  src: { counterOrder: boolean; lines: readonly CounterLine[] };
  tgt: { counterOrder: boolean };
  nowMs: number;
}): "sent" | "target" | null {
  if (i.tgt.counterOrder) return "target";
  if (i.src.counterOrder && counterSent(i.src.lines, i.nowMs)) return "sent";
  return null;
}

/**
 * The SAME refusal, decided by `mms_merge_table_orders` itself under its cart and line locks (Codex r3
 * on #308): `mergeCounterRefusal` reads the lines BEFORE the RPC, so a Send committing in between was
 * re-parented onto a table's cart. The RPC answers a refusal as a negative count — -2 the target is a
 * counter order, -1 the counter source holds SENT food — and writes nothing. Any other value is a count.
 */
export function mergeRpcCounterRefusal(moved: number): "sent" | "target" | null {
  if (moved === -2) return "target";
  if (moved === -1) return "sent";
  return null;
}

/** The one sentence per merge refusal — the pre-check and the RPC's answer read it from here. */
export function mergeCounterRefusalMessage(r: "sent" | "target"): string {
  return r === "target"
    ? "You can’t merge into a counter order."
    : "A counter order that’s in the kitchen can’t be merged.";
}

// ── the table page's one primary ─────────────────────────────────────────────────────────────────

/**
 * The TABLE PAGE's settle emphasis on a counter order (§20: one filled pill per view). Secondary
 * while this device's Send is mid-life (tap → sending → undo → back — nothing is filled while its
 * window is open), and while the Send itself is the primary (a phone order, or more drafts after a
 * send); primary otherwise — a walk-up takes payment first, and once everything is sent the job at
 * pickup IS taking payment.
 */
export function counterSettleVariant(v: StaffSendView, phase: SendPhase): "primary" | "secondary" {
  if (phase !== "idle") return "secondary";
  return v.kind === "send" && v.counter && v.emphasis === "primary" ? "secondary" : "primary";
}

// ── the lane's unpaid bag ────────────────────────────────────────────────────────────────────────

export type UnpaidBag<L> = {
  cartId: string;
  sessionId: string;
  customerName: string | null;
  /** The lines IN THE KITCHEN only (`counterKitchenLine`, comps included) — what the kitchen is
   *  cooking (or has cooked) for this bag. */
  lines: L[];
  /** Units still draft (not grocery) — on the order, not in the bag. */
  moreUnits: number;
  /** Whether taking payment would collect anything (`counterOwes` over the cart's lines). False for
   *  a bag whose every chargeable line was comped: the customer collects it, nobody pays for it. */
  owes: boolean;
  /** The ORDER's kitchen state: `kitchenStateOf` over the lines in the kitchen, but never "done"
   *  while a draft is still unsent (`moreUnits > 0`) — the floor card's rule (`kitchenSegments`
   *  never says "Kitchen done" over "N not sent"). Such a bag reads "cooking": more of its food is
   *  still to come (it cooks at payment), which is also how the lane sorts it. */
  kitchen: KitchenState;
  /** When the kitchen FINISHED this bag (`kitchenDoneAt` over the cart's lines — the latest bump), or
   *  null while it is not done. The counter bell keys finished food by it: one finish, one ring. */
  doneAt: string | null;
  /** The earliest sent line's fire_at — the bag's age on the lane (a line with no stamp was fired
   *  at or before now, so it dates from now). */
  sentAt: string;
};

/**
 * CHARGEABLE — what the table page's settle section counts and charges: every line that is neither
 * voided nor comped, in any state (a draft, an in-grace send, a grocery line and a sent dish all
 * reach `getCartTotals`). The SAME filter as `lib/floor.ts`'s `chargeable` (whose `itemCount > 0`
 * gates the settle section) and `readRegisterQueue`'s card count — restated, not imported, because
 * `register-queue.ts` is imported here (a cycle) and `floor.ts` is server-only.
 */
export function counterChargeableLine(l: {
  state: string;
  comped?: boolean;
  qty: number;
}): boolean {
  return l.state !== "voided" && !l.comped && l.qty > 0;
}

/**
 * Does the order still OWE money (Phase 2f · self-review PT-2)? True exactly when the settle
 * section would render — some chargeable line remains. A counter order whose only kitchen food was
 * comped owes nothing: its bag is still on the lane (the customer collects it) but it is not
 * "Unpaid", and "Take payment" would open a table page with no payment to take.
 */
export function counterOwes(
  lines: readonly { state: string; comped?: boolean; qty: number }[],
): boolean {
  return lines.some(counterChargeableLine);
}

/**
 * An open counter order as the takeaway lane draws it, or null when nothing is in the kitchen (drafts
 * only, or a send still inside its grace): the lane shows food the kitchen has, never food it might
 * get. Membership is `counterKitchenLine`, NOT `counterSentLine` (Codex r3 on #308): the bag is what
 * the customer collects, and a comped dish is collected like any other. Built from the unpaid set, a
 * served dish beside a comped one still cooking announced "Kitchen done" early, and a comped-only
 * bag never reached the lane. The card quotes no amount, so a comp in it claims nothing about money.
 */
export function unpaidBag<L extends CounterLine & { qty: number; bumped_at?: string | null }>(i: {
  cartId: string;
  sessionId: string;
  customerName: string | null;
  lines: readonly L[];
  nowMs: number;
}): UnpaidBag<L> | null {
  const inKitchen = i.lines.filter((l) => counterKitchenLine(l, i.nowMs));
  if (inKitchen.length === 0) return null;
  const moreUnits = i.lines
    .filter((l) => l.state === "draft" && l.fulfillment !== "grocery")
    .reduce((a, l) => a + l.qty, 0);
  let sentMs = Number.POSITIVE_INFINITY;
  for (const l of inKitchen) sentMs = Math.min(sentMs, lineFireMs(l.fire_at, i.nowMs));
  const kitchen = kitchenStateOf(inKitchen);
  // Self-review PT-4 — while a draft is unsent the ORDER is not done, whatever its sent lines say
  // (the floor card's rule), so no "Kitchen done" and no bell: the ring comes when the LAST batch
  // finishes, keyed by that batch's bump (`kitchenDoneAt`), after every draft is sent.
  const orderKitchen: KitchenState = moreUnits > 0 && kitchen === "done" ? "cooking" : kitchen;
  return {
    cartId: i.cartId,
    sessionId: i.sessionId,
    customerName: i.customerName,
    lines: inKitchen,
    moreUnits,
    owes: counterOwes(i.lines),
    kitchen: orderKitchen,
    doneAt: orderKitchen === "done" ? kitchenDoneAt(i.lines) : null,
    sentAt: new Date(sentMs).toISOString(),
  };
}

// ── the no-show's answer ─────────────────────────────────────────────────────────────────────────

/** What the no-show RPC's status means to the staff action (a CODE — the UI maps it to words). */
export type NoShowRpcReason =
  | "ok"
  | "needs_pin"
  | "bad_approver"
  | "not_open"
  | "not_counter"
  | "in_flight"
  | "nothing_sent"
  | "changed"
  | "error";

/**
 * `mms_counter_no_show`'s status → the action's reason. `needs_approval` asks for a manager's PIN;
 * `self_approve` and `bad_approver` are both "that approver cannot approve this"; `not_found` reads
 * as `not_open` (the order is gone either way); `changed` — the order's sent food is not what the
 * approver saw — wrote nothing. Anything unrecognised — including a null — is an
 * `error`, never a success.
 */
export function noShowOutcome(status: string | null): NoShowRpcReason {
  switch (status) {
    case "ok":
      return "ok";
    case "needs_approval":
      return "needs_pin";
    case "self_approve":
    case "bad_approver":
      return "bad_approver";
    case "not_found":
    case "not_open":
      return "not_open";
    case "not_counter":
      return "not_counter";
    case "in_flight":
      return "in_flight";
    case "nothing_sent":
      return "nothing_sent";
    // The sent set the SQL derived is not the one the approver was shown (Phase 2f review, the
    // cross-area decision): nothing was written — look again, then retry.
    case "changed":
      return "changed";
    default:
      return "error";
  }
}
