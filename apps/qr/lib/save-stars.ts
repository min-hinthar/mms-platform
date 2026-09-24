import type { RewardsProgress } from "./rewards";
import { rewardJustUnlocked } from "./rewards-progress";

/**
 * Phase 1c · account-star — "keeping what you earned".
 *
 * A guest's Stars live on the anonymous uid of THIS browser. The /track success moment is the best
 * window to say so (a to-go wait is 10–20 minutes on that screen), and until now it never did: the
 * only door was a revisit-only link and the header's ✦ chip. This module is every DECISION and every
 * STRING behind the ask — pure, no DOM, no storage access — so each rule is falsified by a value, not
 * a render (the W17 "decision logic belongs in lib/" rule).
 *
 * The ask is a DOOR, never a second flow: its one action navigates to /account, where the existing
 * AccountUpgrade card (the save + sign-in flow, with all its merge/carry handling) now sits directly
 * under the live row. Mounting AccountUpgrade on /track was checked and rejected — its `resume`
 * handler would read /track's own `resume=1` as a lend-mode email, its verify() leaves `busy` set on
 * success, and it owns a live region /track does not have room for.
 */

// ── Who is asked ──────────────────────────────────────────────────────────────────────────────────

export type SaveStarsOffer = {
  /** The server total AFTER attribution — `progress.stars`, never `starsEarned` or a client sum. */
  stars: number;
  /** The SAME binding PaySuccess reads, so "the reward you just unlocked" cannot disagree with it. */
  rewardJustUnlocked: boolean;
};

/**
 * The offer, or null when nobody should be asked. Every clause is load-bearing:
 *  - `justPaid` — a revisit (`resume=1`) is not an arrival; the ask belongs to the success moment.
 *  - `refunded` — a fully refunded order earned nothing to keep.
 *  - `progress` — a failed or absent read claims nothing (never a zeroed count).
 *  - `earnedThisOrder` — a split share-payer earned no Star on this order; asking them to "keep"
 *    one would be a claim about Stars they do not have.
 *  - `isUpgraded` — a signed-in diner's Stars are already on their account.
 *  - `stars > 0` — the degenerate-summary guard (a transiently failed summary reads stars 0 with
 *    earnedThisOrder still true; "Keep your 0 Stars" is a lie).
 */
export function saveStarsOffer(i: {
  justPaid: boolean;
  progress: Pick<
    RewardsProgress,
    "stars" | "milestoneStep" | "earnedThisOrder" | "isUpgraded"
  > | null;
  refunded: boolean;
}): SaveStarsOffer | null {
  if (!i.justPaid) return null;
  if (i.refunded) return null;
  const p = i.progress;
  if (!p) return null;
  if (!p.earnedThisOrder) return null;
  if (p.isUpgraded) return null;
  if (!(p.stars > 0)) return null;
  return {
    stars: p.stars,
    rewardJustUnlocked: rewardJustUnlocked({
      earned: p.earnedThisOrder,
      stars: p.stars,
      milestoneStep: p.milestoneStep,
    }),
  };
}

// ── One rewards door at a time ────────────────────────────────────────────────────────────────────

export type GoodbyeDoor = "pending" | "link" | "none";

/**
 * The ONE decision about which rewards door the success screen shows (name it once — the tracker
 * and GoodbyeBeat both read this, neither re-derives it).
 *
 *  - `pending` — attribution is not decided yet (the bounded progress poll has not settled and the
 *    viewer is not signed in). NO rewards door renders anywhere, so none can appear and then vanish
 *    under a finger when the poll lands (OrderTracker's revisit-link rule, applied to this screen).
 *  - an offer the diner has not declined → the save card IS the door (`card`), and GoodbyeBeat drops
 *    its own link and its "with your rewards" reassurance (`none`), which would otherwise sit
 *    directly under the card's warning. The card itself waits for `receiptSettled` so the receipt's
 *    view/print + email row is already in place above it and can never push its buttons down.
 *  - otherwise → GoodbyeBeat's link and line, exactly as before (`link`). After "Not now" this is
 *    where the decision lands: a door appears, none vanishes.
 */
export function successRewardsDoor(i: {
  progress: Pick<RewardsProgress, "earnedThisOrder" | "isUpgraded"> | null;
  pollSettled: boolean;
  offer: SaveStarsOffer | null;
  asked: boolean;
  receiptSettled: boolean;
}): { card: boolean; goodbye: GoodbyeDoor } {
  // A signed-in viewer's door never waits on the poll — there is nothing for it to decide.
  const final = i.pollSettled || !!i.progress?.isUpgraded;
  if (!final) return { card: false, goodbye: "pending" };
  if (i.offer && i.asked) return { card: i.receiptSettled, goodbye: "none" };
  return { card: false, goodbye: "link" };
}

// ── The decline record (per device) ───────────────────────────────────────────────────────────────

/** localStorage key: a JSON array of at most `SAVE_STARS_DECLINE_CAP` declined order ids. */
export const SAVE_STARS_DECLINED_KEY = "mms.saveStars.declined.v1";
/** After this many declined ORDERS the ask stops on this device; the header ✦ link stays the door. */
export const SAVE_STARS_DECLINE_CAP = 2;

/** Read the stored record. Malformed input reads as none declined; non-strings are dropped. */
export function parseDeclined(raw: string | null): string[] {
  if (raw == null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // a hand-edited or truncated value must never throw into the success screen
  }
  if (!Array.isArray(parsed)) return [];
  const ids = parsed.filter((x): x is string => typeof x === "string");
  return [...new Set(ids)].slice(0, SAVE_STARS_DECLINE_CAP);
}

/** Ask for THIS order? Not if it was declined, and not once the device has declined the cap. */
export function saveStarsAsked(declined: readonly string[], orderId: string): boolean {
  if (declined.includes(orderId)) return false;
  return declined.length < SAVE_STARS_DECLINE_CAP;
}

/** The record after declining `orderId` — deduplicated, and never longer than the cap. */
export function recordDecline(declined: readonly string[], orderId: string): string[] {
  if (declined.includes(orderId) || declined.length >= SAVE_STARS_DECLINE_CAP) return [...declined];
  return [...declined, orderId];
}

// ── Copy (every string the card says) ─────────────────────────────────────────────────────────────

/**
 * K15 — the Burmese line is NEW copy, flagged for a native check before it is trusted. It carries NO
 * numeral on purpose: the count lives in the English heading only, so a translation can never
 * disagree with the number.
 *   "ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်" ≈ "your Stars are still only on this
 *   phone — do save them".
 */
const SAVE_STARS_HEADING_MY = "ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်";

export type SaveStarsCopy = {
  heading: string;
  headingMy: string;
  body: string;
  /** Only when the receipt's email capture is on screen — never a reference to a missing control. */
  receiptNote: string | null;
  cta: string;
  dismiss: string;
};

/**
 * Why each claim holds: the count is server-derived; "only on this phone" UNDERSTATES the fragility
 * (Safari and an installed PWA are separate stores), which is the safe direction; "the orders that
 * earned them come along too" holds for every order this uid EARNED on all four save paths
 * (email_change and linkIdentity keep the uid; the email-taken sign-in and the Google bounce merge
 * and re-stamp earned_by). It says nothing about a split share this phone only PAID: the merge does
 * not re-stamp `qr_order_payers.payer_uid` (M237), so "your orders" would overclaim; "the reward you just unlocked" is `rewardJustUnlocked()`, the binding PaySuccess reads.
 */
export function saveStarsCopy(
  stars: number,
  rewardJustUnlocked: boolean,
  receiptEmail: boolean,
): SaveStarsCopy {
  const rest =
    "live only on this phone. Save them to an account with an email code or Google, and the orders that earned them come along too.";
  return {
    heading: stars === 1 ? "Keep your Star" : `Keep your ${stars} Stars`,
    headingMy: SAVE_STARS_HEADING_MY,
    body: rewardJustUnlocked
      ? `Guest Stars — and the reward you just unlocked — ${rest}`
      : `Guest Stars ${rest}`,
    receiptNote: receiptEmail ? "Emailing a receipt doesn’t save them." : null,
    cta: "Save to an account",
    dismiss: "Not now",
  };
}

/**
 * The reason the CTA is withheld (§7: a control that cannot work stays rendered, disabled, and says
 * why). Offline only — the diner's own, fixable state. There is deliberately NO platform arm: the
 * card renders only once the order has ARRIVED, i.e. the backend just answered, and OrderTracker's
 * W10c `weDown` verdict (`gaveUp` needs `!order`) can never be true there. An arm that cannot fire
 * was a decorative promise with a decorative test (the blind review of Phase 1c); a /account that
 * later fails says so itself.
 */
export function saveStarsBlockedReason(i: { offline: boolean }): string | null {
  return i.offline ? "You look offline — saving needs a connection." : null;
}

/**
 * How long the success screen waits for the receipt row to report before deciding its rewards door
 * without it (Codex round 1). The door waits for that report so the save card never lands above the
 * row it would push; a Server Action that STALLS (neither resolves nor rejects) would otherwise leave
 * `successRewardsDoor` pending — no save card and no GoodbyeBeat link — for good. Past the bound the
 * row reports "email capture off" (the card then makes no email claim); a late row still renders.
 * A starting value, not a measurement (F26).
 */
export const RECEIPT_SETTLE_BOUND_MS = 5000;

// ── The chooser disclosure (/account) ─────────────────────────────────────────────────────────────

/**
 * K15 — both Burmese lines are NEW copy, flagged for a native check; neither carries a numeral.
 *   STRANDS  ≈ "tapping a name won't bring this phone's Stars and orders — to bring the Stars, sign
 *              in with the email or Google below" (the promise names the Stars only: M237).
 *   ORDER    ≈ "tapping a name won't bring the order in progress".
 */
const CHOOSER_NOTE_MY_STRANDS =
  "နာမည်ကို နှိပ်ရင် ဒီဖုန်းက ကြယ်တွေနဲ့ အော်ဒါတွေ မပါလာပါဘူး — ကြယ်တွေ ယူလာချင်ရင် အောက်က အီးမေးလ် ဒါမှမဟုတ် Google နဲ့ ဝင်ပါ";
const CHOOSER_NOTE_MY_ORDER = "နာမည်ကို နှိပ်ရင် လုပ်နေဆဲ အော်ဒါ မပါလာပါဘူး";

// What the merge actually carries: the Stars and the orders that EARNED them (`earned_by` is
// re-stamped). NOT "everything" — a split share this phone only paid stays on the anon uid (M237),
// and a chip strands it either way, so the promise names only what a save keeps.
const BRING_ALONG =
  "use your email or Google below to bring your Stars and the orders that earned them along.";

/**
 * What a one-tap Welcome-back chip leaves behind, said BEFORE the tap. A chip signs in with the
 * merge suppressed (docs/SHARED_DEVICE.md), and every order read authorizes by auth.uid(), so the
 * guest's Stars AND the guest's orders — the live tracker, the receipt, the live row — stay on the
 * abandoned anonymous uid. The policy is unchanged; only its cost is disclosed.
 *
 *  - Stars known (> 0): names the count and the orders, plus the order in progress when one is live.
 *  - Stars unknown (null — the failed rewards read): count-free, plus the in-progress clause.
 *  - 0 Stars with an order in progress: names only the order, and deliberately makes NO bring-along
 *    promise — a share-payer's order is not re-stamped by the merge (M237, the M29 lineage).
 *  The bring-along promise, where made, names only the Stars and the orders that EARNED them — the
 *  in-progress order it lists as stranded may be a paid-only split share the save cannot carry.
 *  - Nothing at stake: no note.
 */
export function chooserLeavesNote(i: {
  stars: number | null;
  inProgress: number;
}): { en: string; my: string } | null {
  const live = Math.max(0, Math.floor(i.inProgress));
  if (i.stars !== null && i.stars > 0) {
    const n = i.stars;
    const what =
      live === 0
        ? n === 1
          ? `this phone’s 1 guest Star or the order that earned it`
          : `this phone’s ${n} guest Stars or the orders that earned them`
        : `this phone’s ${n} guest ${n === 1 ? "Star" : "Stars"} or its orders, including ${
            live === 1 ? "the one" : `the ${live}`
          } in progress`;
    return {
      en: `Tapping a name signs in without ${what} — ${BRING_ALONG}`,
      my: CHOOSER_NOTE_MY_STRANDS,
    };
  }
  if (i.stars === null) {
    const clause =
      live === 0
        ? ""
        : live === 1
          ? ", including your order in progress"
          : `, including your ${live} orders in progress`;
    return {
      en: `Tapping a name signs in without anything this phone earned as a guest${clause} — ${BRING_ALONG}`,
      my: CHOOSER_NOTE_MY_STRANDS,
    };
  }
  if (live > 0) {
    return {
      en:
        live === 1
          ? "Tapping a name signs in without your order in progress."
          : `Tapping a name signs in without your ${live} orders in progress.`,
      my: CHOOSER_NOTE_MY_ORDER,
    };
  }
  return null;
}
