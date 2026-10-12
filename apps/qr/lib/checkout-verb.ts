import type { ServedHold } from "./checkout-stage";
import { TABLE_STARTER } from "./confirm-copy";
import { counterUnsentTapCopy } from "./counter-pay-state";
import { t } from "./i18n";

/**
 * Phase 3c-i — the dine-in checkout's VERB machine, pure (OPEN-ITEMS J23; `docs/PHASE3C_DESIGN.md`
 * D13 · D16 · D14).
 *
 * Before this module the Order stage drew two verbs at once — a filled Send and a "View bill & pay"
 * door that promoted itself by an ad-hoc ternary — and the Bill's Pay button RENAMED itself to its
 * refusal ("Send everything to the kitchen first", "Waiting for Tin to finish"). Three gates in
 * `Checkout.tsx` decided the same thing three ways. They collapse into the three decisions here, each
 * falsified by a value:
 *
 *  - `orderStageHero` — the Order stage draws exactly ONE `.checkout-cta`, or none: Send (the host,
 *    with drafts, no grace open) · Undo (the window is open — the outline Undo is the only control,
 *    because REVERSING IS NEVER THE HERO) · Wait (PD1: a guest with drafts at a host table — "Show
 *    a server") · Bill (everything sent; a hostless table).
 *  - `payBlock` — Pay keeps its name and states its ONE reason, in precedence: a tablemate's lock is
 *    the widest fact; UNSENT OUTRANKS GRACE because the Send still owed would reopen the window, so
 *    "Pay opens when the undo window closes" would be a lie under drafts; the grace (an open window,
 *    or an undo still in flight) is this device's courtesy — the undo may put lines back.
 *    `unsentBlocks` is `payBlockedByUnsent(...)` PASSED IN by the caller, never restated here: its
 *    rule and its mutants live in `checkout-stage.ts`. PD10 (D5) adds the SERVED GATE between
 *    unsent and grace — `servedHold`, `servedGateVerdict(...)` passed in the same way: peer >
 *    unsent > the gate's reason (`hostless` · `togo` · `kitchen`) > grace.
 *  - `billDoorLabel` — the Order stage's Total door promises "& pay" only when nothing blocks Pay and
 *    no counter ask stands; otherwise it is a door to a bill you can READ ("View bill"). The door
 *    never promises a verb the next screen refuses or does not offer.
 *
 * Imports only copy — `TABLE_STARTER` (the role sentence for a host the table cannot name), the
 * counter's unsent sentence (`counterUnsentTapCopy`) and the dictionary — no React, no DOM, so
 * `verify:slice` falsifies each arm with one input.
 */

export type OrderHero = "send" | "undo" | "wait" | "bill";

/**
 * PD1 (PATH_DESIGN_2026-10-07 moment 1; amends D13) — the fourth arm, `"wait"`: a GUEST whose
 * dine-in dishes wait on a HOST's Send. Their one filled verb is "Show a server" (the table's ticket
 * held up for Dad — the console's Send fires a diner's round too), and the Total door goes quiet
 * beside it; the bill door stayed the hero there before PD1, which led a guest to a Bill whose next
 * step was someone else's. A HOSTLESS table keeps the bill: nobody at the table sends, so nothing
 * waits on a tablemate (its drafts go with the counter ask or the console's Send).
 */
export function orderStageHero(s: {
  /** `splitContext.mode === "dinein" && splitContext.myRole === "host"` — only the host fires. */
  canSend: boolean;
  /** `kitchenDraftQty(viewItems)` — dinein drafts in units, what `mms_fire_cart` fires. */
  kitchenDraftUnits: number;
  /** The send's undo window is open on this device. */
  graceOpen: boolean;
  /** The table has a host (`session_members.role = 'host'`) — someone at the table sends. */
  hostPresent: boolean;
}): OrderHero {
  if (s.graceOpen) return "undo";
  if (s.canSend && s.kitchenDraftUnits > 0) return "send";
  // After Send: a host with drafts sends — only a guest (or a viewer who cannot send) waits.
  if (s.hostPresent && s.kitchenDraftUnits > 0) return "wait";
  return "bill";
}

/**
 * PD10 (D5) — `hostless` · `togo` · `kitchen` are the SERVED GATE's reasons (`ServedHold`,
 * lib/checkout-stage), and `unsent` is also its first arm (a dine-in draft at a host's table — the
 * same fact "Everything sent" names). They exist only while the phone-pay door is open: the caller
 * passes `servedHold: null` while it is parked, and for the COUNTER door always (D5: the kitchen
 * never holds the counter — Dad's register, the reader and the secure-tab close are never gated by
 * served).
 */
export type PayBlock = "peer" | ServedHold | "grace";

export function payBlock(s: {
  /** `freezeBlocksPayment(rawFreeze)` — a PEER's fresh lock (409 held_by_other at create-intent). */
  frozenByPeer: boolean;
  /** `payBlockedByUnsent(mode, kitchenDraftQty, hostPresent)` — read, never restated. */
  unsentBlocks: boolean;
  /** PD10 — `servedGateVerdict(...)` (lib/checkout-stage), read, never restated; null while the
   *  phone-pay door is parked, and always null for the counter door. */
  servedHold: ServedHold | null;
  /** The undo window is open on this device. */
  graceOpen: boolean;
  /** An undo write has not answered yet — the lines may come back as drafts. */
  undoInFlight: boolean;
}): PayBlock | null {
  if (s.frozenByPeer) return "peer";
  if (s.unsentBlocks) return "unsent";
  // PD10 · D5 — the kitchen OUTRANKS the grace: a line inside its undo window is "sending", which
  // the gate holds anyway, and "Pay opens when the undo window closes" would be a promise the next
  // instant breaks (the window closes onto a line that is only sent, not served).
  if (s.servedHold !== null) return s.servedHold;
  if (s.graceOpen || s.undoInFlight) return "grace";
  return null;
}

/** D5's own sentence — the slot's held line under the gate, and the tail of every unsent reason. */
export const PAY_OPENS_SERVED = "Pay opens once everything’s served.";

/**
 * PD10 · D5 — the ONE sentence each served-gate reason earns, said by the Bill's dock slot (and every
 * blocked tap) AND by `create-intent`'s refusal: one function, both sides, so the server can never
 * refuse in words the screen does not use. English only — none of these has a shipped Burmese (m10
 * COPY lists them for K15); a Burmese line is never invented here.
 *
 * `unsent` tells the HOST to send and tells a GUEST who sends; with no name to give (the server
 * knows the host's seat, not the name the table chose) it says D5's own sentence, which stays true.
 * The shipped "— then the bill is ready to pay" is retired: under D5 a sent bill is NOT ready to pay
 * until it is served, so that clause would be false (m10 STATES, "Unsent dishes").
 */
export function servedHoldCopy(
  hold: ServedHold,
  ctx: { canSend: boolean; hostName: string | null },
): string {
  switch (hold) {
    case "unsent":
      return ctx.canSend
        ? `Send everything to the kitchen first — ${PAY_OPENS_SERVED}`
        : ctx.hostName
          ? `${ctx.hostName} sends them — ${PAY_OPENS_SERVED}`
          : PAY_OPENS_SERVED;
    case "hostless":
      // D5 — a table with no host: its drafts fire only when staff send them from the console, so
      // the reason names the two doors that serve it (the server, and the counter).
      return "A server will send these to the kitchen — or pay at the counter.";
    case "togo":
      // Codex round 3 — the shipped "Send to kitchen now" lives behind the dish's ⋯ ("More").
      return `Send your to-go dish to the kitchen first (More ⋯) — ${PAY_OPENS_SERVED}`;
    case "kitchen":
      return PAY_OPENS_SERVED;
    case "unknownHost":
      // Codex round 2 on #346 — the Bill cannot read the table's host. Say only what is known:
      // never the counter (its server read may refuse a hosted table's drafts), and never "send"
      // (this reader may be a guest).
      return `Some dishes haven’t gone to the kitchen yet — ${PAY_OPENS_SERVED}`;
  }
}

/** The dock counter's own sentence while the Send's undo window holds it (English only; K15). */
export const COUNTER_AFTER_UNDO = "Pay at the counter once the undo window closes.";

/**
 * PD10 · D5 (the capped blind pass on #346, C3) — the COUNTER's OWN held sentence on the served-gated
 * Bill's dock. The counter is never gated by served, so its hold (`payBlock` with `servedHold: null`:
 * a tablemate's lock, the Send still owed, the Send's undo window) is never Pay's. Pay's slot can say
 * "Pay opens once everything’s served." while the counter waits on something else entirely. Read
 * beside it, that line would claim the kitchen holds the counter, which D5 forbids. So the counter
 * says its own reason, in words about the COUNTER: the unsent sentence names who sends and ends
 * "then pay at the counter" (`counterUnsentTapCopy`), and the undo window gets its own counter
 * sentence, never Pay's "Pay opens when the undo window closes.". A lock reads exactly as Pay's does
 * (one fact, said once). The served arms cannot reach the counter; were one ever handed in, it reads
 * as Pay's own reason, so the counter is held and SAYS so, never silently live.
 */
export function counterHoldCopy(
  block: PayBlock,
  ctx: { lockedByName: string | null; canSend: boolean; hostName: string | null },
): string {
  switch (block) {
    case "unsent":
      return counterUnsentTapCopy(ctx.canSend ? null : (ctx.hostName ?? TABLE_STARTER));
    case "grace":
      return COUNTER_AFTER_UNDO;
    default:
      return payBlockCopy(block, ctx);
  }
}

/**
 * The i18n key the Order stage's Total door is named by. A standing counter ask (`counterAsk`) hides
 * Pay behind the counter card on the Bill (`showPayControls`), so the door may not promise "& pay"
 * over it either — a diner who asked for the counter and walked back to the order would be led to a
 * Bill with no Pay on it (Codex round 3 on #313).
 *
 * PD2 (m1's B9, PATH_DESIGN reconciliation 3) — while the phone-pay door is PARKED
 * (`phonePayOpen` false: `!phonePayParked(mode, surfaceOpen("dineInPhonePay"))`, lib/checkout-stage)
 * the Bill has no Pay at all, in EVERY arm — hostless and post-send included — so the door is a
 * door to a bill you can READ and never "& pay". The flag is an input, never read here, so the
 * test flips it. After C2's flip the served gate's holds (PD10, D5 — `kitchen`, `hostless`, `togo`)
 * are `payBlock` arms of their own, so the door reads "View bill" until everything is served.
 */
export function billDoorLabel(
  block: PayBlock | null,
  s: {
    /** A counter ask stands (`counterAt != null`). */
    counterAsk: boolean;
    /** `!phonePayParked(...)` — the dine-in phone-pay door is open for this session. */
    phonePayOpen: boolean;
  },
): "viewBillAndPay" | "viewBill" {
  return block === null && !s.counterAsk && s.phonePayOpen ? "viewBillAndPay" : "viewBill";
}

/**
 * The ONE sentence each block earns — the Pay button's `aria-describedby` text and what every blocked
 * tap re-says. The peer line was the old Pay LABEL (`Checkout.tsx`) and the grace line is
 * `payOpensAfterUndo` (lib/i18n/cart.ts); the unsent line and the three served-gate lines are D5's
 * (`servedHoldCopy` — the same words `create-intent` refuses with).
 */
export function payBlockCopy(
  block: PayBlock,
  ctx: {
    /** The peer's display name, or null when the lock has no name (the shipped "Someone"). */
    lockedByName: string | null;
    /** The host is told to send; a guest is told WHO sends. */
    canSend: boolean;
    hostName: string | null;
  },
): string {
  switch (block) {
    case "peer":
      return `Waiting for ${ctx.lockedByName ?? "Someone"} to finish`;
    case "unsent":
      // PD10 — Pay is drawn only while the phone-pay door is open, and the open door is the SERVED
      // door (D5), so the unsent reason is D5's: a guest whose table cannot name its host is told
      // the role ("The person who started the table sends them — …"), never a name invented.
      return servedHoldCopy("unsent", {
        canSend: ctx.canSend,
        hostName: ctx.hostName ?? TABLE_STARTER,
      });
    case "hostless":
    case "togo":
    case "kitchen":
    case "unknownHost":
      return servedHoldCopy(block, ctx);
    case "grace":
      return t("en", "payOpensAfterUndo");
  }
}
