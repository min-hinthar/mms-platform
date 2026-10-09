import { TABLE_STARTER } from "./confirm-copy";
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
 *    because REVERSING IS NEVER THE HERO) · Bill (everything sent; a guest with drafts, whose host
 *    sends them; a hostless table, whose pay fires them).
 *  - `payBlock` — Pay keeps its name and states its ONE reason, in precedence: a tablemate's lock is
 *    the widest fact; UNSENT OUTRANKS GRACE because the Send still owed would reopen the window, so
 *    "Pay opens when the undo window closes" would be a lie under drafts; the grace (an open window,
 *    or an undo still in flight) is this device's courtesy — the undo may put lines back.
 *    `unsentBlocks` is `payBlockedByUnsent(...)` PASSED IN by the caller, never restated here: its
 *    rule and its mutants live in `checkout-stage.ts`.
 *  - `billDoorLabel` — the Order stage's Total door promises "& pay" only when nothing blocks Pay and
 *    no counter ask stands; otherwise it is a door to a bill you can READ ("View bill"). The door
 *    never promises a verb the next screen refuses or does not offer.
 *
 * Imports only copy — `TABLE_STARTER` (the role sentence for a host the table cannot name) and the
 * dictionary — no React, no DOM, so `verify:slice` falsifies each arm with one input.
 */

export type OrderHero = "send" | "undo" | "bill";

export function orderStageHero(s: {
  /** `splitContext.mode === "dinein" && splitContext.myRole === "host"` — only the host fires. */
  canSend: boolean;
  /** `kitchenDraftQty(viewItems)` — dinein drafts in units, what `mms_fire_cart` fires. */
  kitchenDraftUnits: number;
  /** The send's undo window is open on this device. */
  graceOpen: boolean;
}): OrderHero {
  if (s.graceOpen) return "undo";
  if (s.canSend && s.kitchenDraftUnits > 0) return "send";
  return "bill";
}

export type PayBlock = "peer" | "unsent" | "grace";

export function payBlock(s: {
  /** `freezeBlocksPayment(rawFreeze)` — a PEER's fresh lock (409 held_by_other at create-intent). */
  frozenByPeer: boolean;
  /** `payBlockedByUnsent(mode, kitchenDraftQty, hostPresent)` — read, never restated. */
  unsentBlocks: boolean;
  /** The undo window is open on this device. */
  graceOpen: boolean;
  /** An undo write has not answered yet — the lines may come back as drafts. */
  undoInFlight: boolean;
}): PayBlock | null {
  if (s.frozenByPeer) return "peer";
  if (s.unsentBlocks) return "unsent";
  if (s.graceOpen || s.undoInFlight) return "grace";
  return null;
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
 * test flips it. After C2's flip (PD10, D5) the kitchen hold becomes a `payBlock` arm of its own.
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
 * tap re-says. Every string is shipped copy: the peer line was the old Pay LABEL (`Checkout.tsx`),
 * the host's unsent line is create-intent's own refusal, the guest's is the Bill's unsent note, and
 * the grace line is `payOpensAfterUndo` (lib/i18n/cart.ts).
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
      return ctx.canSend
        ? "Send everything to the kitchen first — then the bill is ready to pay."
        : `${ctx.hostName ?? TABLE_STARTER} sends them — then the bill is ready to pay.`;
    case "grace":
      return t("en", "payOpensAfterUndo");
  }
}
