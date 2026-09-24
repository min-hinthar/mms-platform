import { t, type DictKey } from "./i18n";
import type { ConnectionTruth } from "./useConnectionTruth";

/**
 * Phase 1c — the pay step's card form: ONE honest wait, ONE reveal, and a failure card whose one
 * button is the way forward that can actually work. Pure (no DOM, no React): `PaymentSection`
 * renders what this module decides, so every rule below is falsified by a VALUE in
 * `pay-element.test.ts` rather than by a render with five mocks.
 *
 * ⚠️ `payElementView(s).payable` IS THE CARD-PATH CHARGE GATE — the ONE binding the Pay button's
 * `aria-disabled` and `confirm()` both read (§22 "name it once"). It is true only once the card
 * form this attempt mounted is ready, the wallet has settled (or its grace has passed), AND the
 * layout has held still for `settleMs`. A wallet confirmation skips only that last term
 * (`canConfirm`): its sheet (Face ID, a double-click) is the confirmation, so there is no mis-tap
 * to guard, and refusing a fast Apple Pay tap would fail a payment the diner meant.
 *
 * Every async event carries the `attempt` that produced it, and the reducer DROPS an event from any
 * attempt that is not current: a retry re-keys Elements, and a late `ready` from the element it
 * destroyed must never reveal (or arm the charge gate for) the one that replaced it.
 */

/**
 * The timings are the product decision, pinned ONCE by `pay-element.test.ts`; the component suite
 * reads them from here so its mutations aim at the wiring.
 *
 * ⚠️ `walletGraceMs` is a MEASUREMENT GATE, not a taste call: 1000 is the spec's STARTING value.
 * Before merge, record Express-ready minus Element-ready in preview on iOS Safari (Apple Pay),
 * Android Chrome (Google Pay) and desktop Chrome (Link), and set it to the measured p90, capped at
 * 2000 (OPEN-ITEMS). This environment has no Stripe keys and no device, so it is unmeasured.
 */
export const PAY_ELEMENT_TIMING = {
  walletGraceMs: 1000,
  slowMs: 8000,
  stallMs: 20000,
  settleMs: 300,
} as const;

/**
 * The first-visit reserve for the card form's block, in px, at a phone width. ⚠️ UNMEASURED
 * STARTING VALUE (OPEN-ITEMS): the spec asks for this device-class height to be MEASURED in preview
 * with the production dashboard's payment methods and pasted, never transcribed. 312 is the
 * spec's own worked example of a card-only block at 390px; a warm visit uses this device's own
 * measurement instead (`payElementReserve`), so the constant only ever shapes a FIRST visit.
 */
export const PAY_ELEMENT_FALLBACK_PX = 312;

/** Where a device keeps its last measured live-block geometry (a per-viewer convenience only). */
export const PAY_ELEMENT_STORAGE_KEY = "mms.payElementH.v1";

export type CardFailure = "network" | "intent" | "timeout" | "config";

export type PayElementState = {
  attempt: number;
  /** Stripe.js itself (the `loadStripe` promise). */
  stripe: "loading" | "ready" | "failed";
  /** The Payment Element (the card form iframe). */
  card: "loading" | "ready" | "failed";
  cardFailure: CardFailure | null;
  /** The Express Checkout element (Apple Pay / Google Pay / Link). */
  wallet: "loading" | "available" | "none";
  graceElapsed: boolean;
  /** The post-reveal hold-still window has passed (the card path may charge). */
  settled: boolean;
  slow: boolean;
  offline: boolean;
  offlineSeen: boolean;
  /** A DINER retry is in flight (the failure card and its focused button stay mounted). */
  retrying: boolean;
  failedRetries: number;
  /** The diner was told about a wait (slow, offline or a failure) — so "ready" is worth saying. */
  waitAnnounced: boolean;
  /** The wallet settled AFTER the reveal (a first visit mounts that row with a rise). */
  walletLate: boolean;
};

export type PayElementEvent =
  | { type: "stripe-loaded"; attempt: number }
  | { type: "stripe-failed"; attempt: number }
  | { type: "card-ready"; attempt: number }
  | { type: "card-error"; attempt: number; errorType?: string }
  | { type: "wallet-ready"; attempt: number; available: boolean }
  | { type: "wallet-error"; attempt: number }
  | { type: "slow"; attempt: number }
  | { type: "stalled"; attempt: number }
  | { type: "grace-elapsed"; attempt: number }
  | { type: "settled"; attempt: number }
  | { type: "connectivity"; online: boolean }
  | { type: "retry"; by: "diner" | "auto" };

export function initialPayElementState({
  configMissing,
}: {
  configMissing: boolean;
}): PayElementState {
  return {
    attempt: 0,
    stripe: configMissing ? "failed" : "loading",
    card: configMissing ? "failed" : "loading",
    cardFailure: configMissing ? "config" : null,
    wallet: configMissing ? "none" : "loading",
    graceElapsed: false,
    settled: false,
    slow: false,
    offline: false,
    offlineSeen: false,
    retrying: false,
    failedRetries: 0,
    waitAnnounced: false,
    walletLate: false,
  };
}

/**
 * Stripe's loaderror `error.type` → what the diner can do about it. ONLY `type` is read (SAQ-A: we
 * look at no other field of anything the iframe hands back).
 *  - `invalid_request_error` → an ENDED intent (succeeded, cancelled, superseded) — retrying the
 *    same secret cannot work, and it may have SUCCEEDED, so the copy sends them to look, not to pay.
 *  - `authentication_error` → a bad or mismatched publishable key: nothing the diner can fix.
 *  - everything else, including undefined → a network-shaped failure a retry can cure.
 */
export function classifyCardLoadError(
  errorType: string | undefined,
): "intent" | "config" | "network" {
  if (errorType === "invalid_request_error") return "intent";
  if (errorType === "authentication_error") return "config";
  return "network";
}

/** A load failure's shared bookkeeping: the wait was announced, and a failed DINER retry counts. */
function failed(s: PayElementState, kind: CardFailure): PayElementState {
  return {
    ...s,
    card: "failed",
    cardFailure: kind,
    waitAnnounced: true,
    failedRetries: s.retrying ? s.failedRetries + 1 : s.failedRetries,
    retrying: false,
  };
}

export function payElementReducer(s: PayElementState, e: PayElementEvent): PayElementState {
  if ("attempt" in e && e.attempt !== s.attempt) return s; // a destroyed mount's late event
  switch (e.type) {
    case "stripe-loaded":
      return s.stripe === "loading" ? { ...s, stripe: "ready" } : s;
    case "stripe-failed":
      if (s.card === "ready") return s;
      return { ...failed(s, "network"), stripe: "failed", wallet: "none" };
    case "card-error":
      // A loaderror belongs to a LOAD; one arriving after `ready` must not hide a working form.
      if (s.card === "ready") return s;
      return failed(s, classifyCardLoadError(e.errorType));
    case "card-ready":
      // Also the recovery from a TIMEOUT: the mount stayed alive under the card for exactly this.
      return { ...s, card: "ready", cardFailure: null, retrying: false };
    case "slow":
      return s.card === "loading" ? { ...s, slow: true, waitAnnounced: true } : s;
    case "stalled":
      return s.card === "loading" ? failed(s, "timeout") : s;
    case "wallet-ready":
    case "wallet-error": {
      if (s.wallet !== "loading") return s; // settles once per attempt
      const wasRevealed = payElementView(s).revealed;
      const wallet = e.type === "wallet-ready" && e.available ? "available" : "none";
      // After a reveal the layout just moved (a row appeared, or a reserved slot collapsed): the
      // card path refuses taps again for `settleMs` — without re-dimming (that would read as a
      // state change that is not one).
      return wasRevealed
        ? { ...s, wallet, settled: false, walletLate: true }
        : { ...s, wallet, walletLate: false };
    }
    case "grace-elapsed":
      return { ...s, graceElapsed: true };
    case "settled":
      // Settling means "held still since the reveal"; it cannot precede one.
      return payElementView(s).revealed ? { ...s, settled: true } : s;
    case "connectivity":
      if (e.online) return { ...s, offline: false };
      // Once the form is up, going offline is not a wait this step is running — nothing to say.
      if (payElementView(s).revealed) return { ...s, offline: true };
      return { ...s, offline: true, offlineSeen: true, waitAnnounced: true };
    case "retry":
      return {
        ...s,
        attempt: s.attempt + 1,
        stripe: "loading",
        card: "loading",
        wallet: "loading",
        graceElapsed: false,
        slow: false,
        settled: false,
        offlineSeen: false,
        walletLate: false,
        retrying: e.by === "diner",
        // A DINER retry keeps the card (and the button they are focused on) mounted through its own
        // tap; an AUTO retry (back online) returns to the skeleton, because nobody tapped anything.
        cardFailure: e.by === "diner" ? s.cardFailure : null,
      };
  }
}

export type PayNote = "loading" | "slow" | "offline" | "secure";
export type PayAnnounce = CardFailure | "ready";

export type PayElementView = {
  revealed: boolean;
  failure: CardFailure | null;
  skeleton: boolean;
  escalated: boolean;
  /** THE card-path charge gate. */
  payable: boolean;
  showWallet: boolean;
  showDivider: boolean;
  note: PayNote | null;
  announce: PayAnnounce | null;
};

export function payElementView(s: PayElementState): PayElementView {
  const revealed = s.card === "ready" && (s.wallet !== "loading" || s.graceElapsed);
  const failure = s.card === "failed" || s.retrying ? s.cardFailure : null;
  const showWallet = revealed && s.wallet === "available";
  return {
    revealed,
    failure,
    skeleton: !revealed && failure === null,
    escalated: s.failedRetries >= 2,
    payable: revealed && s.settled,
    showWallet,
    showDivider: showWallet,
    note: failure
      ? null
      : revealed
        ? "secure"
        : s.offline
          ? "offline"
          : s.slow
            ? "slow"
            : "loading",
    // Cleared while a diner retry is in flight, so an IDENTICAL repeat failure re-announces.
    announce: s.retrying ? null : (failure ?? (revealed && s.waitAnnounced ? "ready" : null)),
  };
}

/** Whether a confirm from `source` may start, as far as the form's state goes. The component adds
 *  bound handles, `!hold` and its in-flight ref, all read at call time. */
export function canConfirm(view: PayElementView, source: "card" | "wallet"): boolean {
  return source === "card" ? view.payable : view.revealed;
}

/** Called on the `online` event: remount a load that this attempt saw fail offline — the promise
 *  the offline sentence makes. Never after a reveal, and never for a failure a retry cannot cure. */
export function shouldAutoRetry(s: PayElementState): boolean {
  return (
    s.offlineSeen &&
    !payElementView(s).revealed &&
    s.cardFailure !== "intent" &&
    s.cardFailure !== "config"
  );
}

/** A retry re-creates the Stripe.js loader only when Stripe.js itself was what failed. */
export function retryResetsLoader(s: PayElementState): boolean {
  return s.stripe === "failed";
}

// W2d — Stripe passes `undefined` when no wallet is available; the (unlikely) all-false object is
// guarded too, so the "or pay with card" divider never orphans above the card with no wallet above it.
export function hasWallet(apm: Record<string, boolean> | undefined): boolean {
  return Object.values(apm ?? {}).some(Boolean);
}

/**
 * The skeleton's reserved block size. A device's own last measurement at (about) this width wins —
 * a warm visit then reveals with ZERO outer shift; anything unusable falls back to the constant.
 * `stored` is whatever localStorage handed back, so it is validated field by field: a finite
 * `w`/`h`/`walletH`, a width within 40px of the current one, 160 ≤ h ≤ 720 and 0 ≤ walletH < h.
 */
export function payElementReserve(
  stored: unknown,
  viewportW: number,
  fallbackPx: number,
): { px: number; walletPx: number } {
  const fallback = { px: fallbackPx, walletPx: 0 };
  if (typeof stored !== "object" || stored === null) return fallback;
  const { w, h, walletH } = stored as Record<string, unknown>;
  if (typeof w !== "number" || typeof h !== "number" || typeof walletH !== "number")
    return fallback;
  if (![w, h, walletH, viewportW].every(Number.isFinite)) return fallback;
  if (Math.abs(w - viewportW) > 40) return fallback;
  if (h < 160 || h > 720) return fallback;
  if (walletH < 0 || walletH >= h) return fallback;
  return { px: h, walletPx: walletH };
}

export type Bilingual = { en: string; my: string };

const both = (key: DictKey): Bilingual => ({ en: t("en", key), my: t("my", key) });

const NOTE_KEY: Record<PayNote, DictKey> = {
  loading: "payFormLoading",
  slow: "payFormSlow",
  offline: "payFormOffline",
  secure: "payFormSecure",
};

export function payNoteCopy(note: PayNote): Bilingual {
  return both(NOTE_KEY[note]);
}

/** The sr-only "the wait is over" line (only after a wait the diner was told about). */
export function payReadyCopy(): Bilingual {
  return both("payFormReady");
}

export type PayFailureCopy = { title: Bilingual; body: Bilingual; action: "retry" | "review" };

/**
 * The failure card: one heading, one sentence naming where the button goes, one button. `retry` is
 * offered only where a retry can work (a network-shaped error, before two retries have failed);
 * everything else routes back to review — naming the COUNTER door for dine-in, which is waiting
 * there (a blocked js.stripe.com still has a real way out). `we-down` deliberately maps to the
 * NEUTRAL body: /api/health measures OUR database, not Stripe.
 */
export function payFailureCopy(
  kind: CardFailure,
  {
    truth,
    escalated,
    counterDoor,
  }: { truth: ConnectionTruth; escalated: boolean; counterDoor: boolean },
): PayFailureCopy {
  switch (kind) {
    case "config":
      return {
        title: both("payFailConfigTitle"),
        body: both(counterDoor ? "payFailConfigBodyCounter" : "payFailConfigBody"),
        action: "review",
      };
    case "intent":
      return {
        title: both("payFailIntentTitle"),
        body: both("payFailIntentBody"),
        action: "review",
      };
    case "timeout":
      return {
        title: both("payFailTimeoutTitle"),
        body: both(counterDoor ? "payFailTimeoutBodyCounter" : "payFailTimeoutBody"),
        action: "review",
      };
    case "network":
      if (escalated)
        return {
          title: both("payFailNetworkTitle"),
          body: both(counterDoor ? "payFailEscalatedCounter" : "payFailEscalated"),
          action: "review",
        };
      return {
        title: both("payFailNetworkTitle"),
        body: both(truth === "you-offline" ? "payFailOfflineBody" : "payFailBody"),
        action: "retry",
      };
  }
}
