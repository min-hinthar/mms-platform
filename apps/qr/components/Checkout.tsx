"use client";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import type { CartItem, CartTotals } from "@mms/db";
import { Avatar, EmptyState, Icon, NumberFlow, Stepper } from "@mms/ui";
import {
  applyPromo as applyPromoAction,
  getCartView,
  makeItNow,
  releasePayLock,
  setLineFulfillment,
  setQty as setQtyAction,
  type PromoReason,
} from "@/lib/cart";
import { attemptReleaseBody, readPayAttempt, type PayAttempt } from "@/lib/pay-attempt";
import {
  type CartFreeze,
  cartFreeze,
  freezeBlocksEdits,
  freezeBlocksPayment,
  freezeNotice,
  reopenFailureNotice,
  visibleFreeze,
} from "@/lib/cart-freeze";
import type { SplitContext } from "@/lib/split";
import { canMutateLine } from "@/lib/permissions";
import {
  effectiveTipRate as deriveTipRate,
  tipPresets,
  tipReaction,
  TIP_AMOUNT_MAX_CENTS,
} from "@/lib/tip";
import { menuHref, menuLinkText } from "@/lib/menu-href";
import { taxRate } from "@/lib/tax";
import { rewardShortfallCents } from "@/lib/totals-math";
import { normalizePickupSlot } from "@/lib/pickup-slot";
import { pickupContactMissing } from "@/lib/pickup-contact";
import { DINER_STATE_COPY } from "@/lib/line-state-copy";
import { seatColor, seatInitial } from "@/lib/avatars";
import { BlurUpImage } from "./menu/BlurUpImage";
import { PhotoPlaceholder } from "./menu/PhotoPlaceholder";
import { useAnonSession } from "@/lib/useAnonSession";
import { failureCopy, useConnectionTruth } from "@/lib/useConnectionTruth";
import { useCartRealtime } from "@/lib/realtime";
import { PaymentSection } from "./PaymentSection";
import { SplitSection } from "./SplitSection";
import { SettlementBoard } from "./SettlementBoard";
import { TimelineStrip } from "./TableTimeline";
import { SendToKitchenButton } from "./SendToKitchenButton";
import { SecureTabButton } from "./SecureTabButton";
import { RewardField } from "./RewardField";
import { PickupWhenChoice } from "./PickupWhenChoice";
import { PaperAmbient } from "./PaperAmbient";
import { WalletChip } from "./WalletChip";
import { useRewardsBadge } from "@/lib/useRewardsBadge";
import {
  initialStage,
  kitchenDraftQty as deriveKitchenDraftQty,
  unsentFoodQty,
  type CheckoutStage,
} from "@/lib/checkout-stage";
import { t, type DictKey } from "@/lib/i18n";

// W16b — ALWAYS bilingual (owner directive): EN is the primary voice, MY the Padauk accent on the
// SAME surface — no toggle, no locale state. T() keeps the historical call sites reading naturally;
// <My/> renders the Burmese half with its own per-span lang (WCAG 3.1.2 against html lang="en").
const T = (k: DictKey) => t("en", k);
// W20 — the Bill names the sales-tax RATE, not just its amount (owner: "should include all details
// of order including sales tax %?"). Derived from the one authority (lib/tax.ts) so a rate change
// there re-labels every surface; never a transcribed literal.
const TAX_NOTE = `(${(taxRate() * 100).toFixed(1)}%)`;

/** M22 — the pay-step shortfall note. Muted like the other sub-row notes; it qualifies the reward
 *  row above it rather than competing with the total below. */
const rewardShortfallNote: CSSProperties = {
  margin: "2px 0 0",
  fontSize: "var(--fs-xs)",
  color: "var(--t2)",
};
function My({
  k,
  inline = false,
  size = "var(--fs-xs)",
  color = "var(--t2)",
}: {
  k: DictKey;
  inline?: boolean;
  size?: string;
  color?: string;
}) {
  return (
    <span
      lang="my"
      style={{
        display: inline ? "inline" : "block",
        fontFamily: "var(--font-my)",
        fontSize: size,
        fontWeight: 600,
        color,
        // ⚠️ The inline accent's gap is a MARGIN, never a whitespace text node: its two hosts are
        // FLEX containers (`.checkout-leader-row dt` for the receipt rows, `.nav-link` for the back
        // link), and flex layout DROPS whitespace-only text between items — a space here would
        // render "Subtotalအကြိုစုစုပေါင်း" with the two tongues fused. Margin works in both.
        ...(inline ? { marginInlineStart: "0.4em" } : null),
      }}
    >
      {t("my", k)}
    </span>
  );
}

// Per-reason promo copy (the action returns a reason; Next redacts thrown errors in prod). Honest +
// on-brand: tell the diner exactly why, never a fabricated state.
const PROMO_MESSAGES: Record<PromoReason, string> = {
  invalid: "That code isn’t valid.",
  inactive: "That code is no longer active.",
  not_started: "That code isn’t available yet.",
  expired: "That code has expired.",
  min_not_met: "Your order doesn’t meet this code’s minimum yet.",
  exhausted: "That code has reached its limit.",
  session_limit: "That code’s already been used at this table.",
  cart_closed: "This order is already being paid.",
  locked: "Someone’s checking out — the order’s locked for a moment.",
  rate_limited: "Too many tries — wait a minute, then try again.",
  error: "Couldn’t apply that code — please try again.",
};

// Tip presets (v7.2 prototype). The <small> shows a client PREVIEW of the tip; the AUTHORITATIVE
// tip + grand total come back from create-intent (server) on the pay step — never the charge.
// "None" (not v7.2's "No extra") so five chips — None + three presets + W2d's Custom — fit one row
// at 320–375px without wrapping to uneven heights (mobile-first bar).
//
// W17c: the three presets are no longer fixed at 15/18/20 — `tipPresets(net)` sizes the UNIT to the
// basket (flat dollars under $20, where 18% of a $4 tea is a meaningless 72¢; percentages above) and
// drops any chip the server's rate cap would refuse. The chip COUNT is unchanged, so the row still
// fits. See lib/tip.ts.

// W2d → W19 — a typed custom-tip dollar string → the rate the server applies. `round(net · rate)`
// then equals the entered cents exactly (rate = cents/net). The clamp is now a DOLLAR ceiling
// (TIP_AMOUNT_MAX_CENTS, $1,000 — the cash tip's own bound), not 100% of the order: the owner —
// "no limit to custom or capped amount" — and a regular tipping $30 on a $20 order is generosity,
// not a fat-finger. create-intent enforces the same constant on the derived amount. 0 when
// unparseable.
function customTipRateFromDollars(raw: string, net: number): number {
  const dollars = parseFloat(raw);
  if (!Number.isFinite(dollars) || dollars <= 0 || net <= 0) return 0;
  // Two clamps (W19 review LOW): the $1,000 house ceiling, AND the schema's 4000-rate transport
  // rail — a flat promo can legally crush net below 25¢, where $1,000 alone would mint a rate the
  // schema refuses and surface as a refusal at the last tap instead of a smaller tip.
  return Math.min(Math.round(dollars * 100), TIP_AMOUNT_MAX_CENTS, 4000 * net) / net;
}

// Optimistic cart edits — a qty / destination / make-now tap reflects INSTANTLY, then the server action
// + refresh() reconcile the base underneath (and correct a refused edit). Money stays server-authoritative:
// the fulfillment flip touches the TAG ONLY (W17a — dine-in and to-go ring the same POS price, so the
// unit price is unchanged by a flip; what does move is the line's TAX, which lives in the aggregate
// totals receipt that refresh() re-reads). Never re-price a line here.
type CartOptimistic =
  | { kind: "qty"; id: string; qty: number }
  | { kind: "fulfillment"; id: string; ful: "dinein" | "togo" }
  | { kind: "makeNow"; id: string };

function applyCartOptimistic(state: CartItem[], u: CartOptimistic): CartItem[] {
  switch (u.kind) {
    case "qty":
      return u.qty <= 0
        ? state.filter((i) => i.id !== u.id)
        : state.map((i) => (i.id === u.id ? { ...i, qty: u.qty } : i));
    case "fulfillment":
      return state.map((i) => (i.id === u.id ? { ...i, fulfillment: u.ful } : i));
    case "makeNow":
      return state.map((i) => (i.id === u.id ? { ...i, lineState: "fired" } : i));
  }
}

/**
 * Cart + checkout (client), two steps: REVIEW (edit lines, promo, tip — cart open/editable) →
 * "Pay · $X" mints the intent + LOCKS the cart → PAY (Stripe Payment Element on a stable
 * clientSecret; "Edit order" unlocks and returns). Totals are always server-authoritative — the
 * review breakdown from `getCartView`, the tip-inclusive grand total from create-intent. Never client
 * money math (the tip chip preview is a hint, confirmed server-side).
 */
export function Checkout({
  cartId,
  initialItems,
  initialTotals,
  splitContext = null,
  initialSettling = false,
  initialLocked = false,
  initialLockedBy = null,
  initialMySeat = null,
  initialTabType = "none",
  canTab = false,
  prepMinutes = 12,
  initialPickupSlot = null,
  asapAvailable = true,
}: {
  cartId: string;
  initialItems: CartItem[];
  initialTotals: CartTotals;
  splitContext?: SplitContext | null;
  initialSettling?: boolean;
  /** W9b — the pay-window lock (P3.2-lock) from the server view. `getCartView` has always returned
   *  these two and this component never received them, so a tablemate's checkout froze every control
   *  here with no explanation: the steppers simply snapped back. Synced onward by `refresh()`. */
  initialLocked?: boolean;
  initialLockedBy?: string | null;
  /** W9b — the viewer's own seat, from `getCartView` (NOT `splitContext`, which is nulled on any read
   *  failure). Decides whether `lockedBy` is a peer's lock or the viewer's own. */
  initialMySeat?: string | null;
  /** Tab lifecycle (S3.1 → W12): the diner never chooses a tab — the state only gates the Bill
   *  moment's save-card affordance ('none'/'trust') vs its "Card on file" note ('secure'). Synced
   *  from getCartView (initial + realtime); staff/webhook flips land live. */
  initialTabType?: "none" | "trust" | "secure";
  /** Dine-in only: a tab is a dine-in concept (pickup/grocery pay at checkout). Gates the affordance. */
  canTab?: boolean;
  /** S4.2: configured kitchen prep estimate (min) for the to-go "ready in ~X" copy. Honest config value. */
  prepMinutes?: number;
  /** W5e: the cart's scheduled pickup slot (ISO) from the server view, or null = ASAP. Seeds the
   *  checkout ASAP↔scheduled choice (pickup only). */
  initialPickupSlot?: string | null;
  /** W5e: is the kitchen taking ASAP right now (open + capacity)? Server-computed; gates the ASAP pill. */
  asapAvailable?: boolean;
}) {
  const [items, setItems] = useState<CartItem[]>(initialItems);
  // Optimistic overlay on top of the server `items`: an edit shows instantly and the delta re-applies over
  // any realtime base change during the pending transition, then clears once refresh() lands the truth
  // (React 19 useOptimistic). Render reads `viewItems`; `items`/`setItems` stay the reconciliation base.
  const [viewItems, applyOptimistic] = useOptimistic(items, applyCartOptimistic);
  const [totals, setTotals] = useState<CartTotals>(initialTotals);
  // Split-tender settlement freeze (P3.3b): once the host opens a split, every member pays their share
  // on the live board instead of the review/pay flow. Synced from getCartView (initial + realtime).
  const [settling, setSettling] = useState(initialSettling);
  // W9b — who (if anyone) holds the pay-window lock. Distinct from `settling`: a lock is ONE member
  // checking out for a moment; settling is the whole table paying its shares.
  const [locked, setLocked] = useState(initialLocked);
  // ⚠️ `mySeat` comes from the CART VIEW, not `splitContext`. `cart/page.tsx` nulls the split context on
  // ANY read failure, and sourcing the seat from it meant a transient miss on a dine-in group cart left
  // `lockedByPeer` permanently false — no lockbar, every control live, each edit snapping back: exactly
  // the defect this slice exists to retire, on the path most likely to hit it. (J4 residual: that
  // failure mode no longer depends on getting the seat right — an unknown seat now resolves to the
  // `held` freeze, which blocks edits and says so, so a thin read degrades to honest instead of silent.) `getCartView` returns the
  // seat from the same `assertCartMember` call that produced `lockedBy`, so the comparison cannot be
  // defeated by a second read. Declared beside the lock state because `refresh()` writes it.
  const [mySeat, setMySeat] = useState<string | null>(initialMySeat);
  const [lockedBy, setLockedBy] = useState<string | null>(initialLockedBy);
  // Dine-in group → show per-line owner + split; solo/duo stays the plain cart.
  const isGroup =
    !!splitContext && splitContext.mode === "dinein" && splitContext.members.length > 1;
  // Dine-in "Send to kitchen" (S2.1b): a table-level fire, so the HOST sends the batch (solo dine-in is
  // host too). Server re-enforces host + dine-in + cart-open; this is the affordance.
  const canSendToKitchen = splitContext?.mode === "dinein" && splitContext.myRole === "host";
  const [promo, setPromo] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Cart edits (qty / fulfillment / make-now) ride their OWN transition so their pending doesn't disable
  // the promo "Apply" button; its pending is intentionally unread (the controls stay live optimistically).
  const [, startCartTransition] = useTransition();
  // Per-line promise chain: serialize a line's absolute-qty writes so rapid taps commit in ORDER (last
  // value wins) and can't interleave into a stale displayed count — the optimistic overlay keeps each tap
  // instant meanwhile. Keyed by cart-item id; a stale entry just resolves and is harmless.
  const qtyChain = useRef<Map<string, Promise<void>>>(new Map());
  const [tipRate, setTipRate] = useState(0);
  // W2d — custom tip: an open flag + the raw dollar string the diner types. The tip stays a RATE under
  // the hood (customCents / netCents) so the server path is identical to the presets — server-confirmed,
  // webhook-reconciled, the client never sends an amount.
  const [customTipOpen, setCustomTipOpen] = useState(false);
  const [customTip, setCustomTip] = useState("");
  // (W18: the round-up chip is retired — owner: "never capped or round up". Its derive-don't-store
  // lesson lives on in lib/tip.ts and CLAUDE.md.)
  const customTipRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (customTipOpen) customTipRef.current?.focus();
  }, [customTipOpen]);
  // Pure-grocery basket (W1): every chargeable line is self-scanned retail — no tip ask (the server
  // excludes grocery lines from the tip base and forces tip to 0). Computed here (early) so the tip
  // rate can be zeroed for it too.
  // Voided/comped lines are $0 and don't count.
  const chargeableItems = viewItems.filter((i) => i.lineState !== "voided" && !i.comped);
  const pureGrocery =
    chargeableItems.length > 0 && chargeableItems.every((i) => i.fulfillment === "grocery");
  // W2d — the tip base (subtotal − discount) and the EFFECTIVE rate. When custom is open the rate is
  // DERIVED (during render, not stored) from the typed dollars + the CURRENT net, so the diner's absolute
  // amount stays fixed if the net moves (a group peer edits the cart) instead of silently re-scaling;
  // otherwise the preset `tipRate` state wins. Pure derived state — no effect, no setState-in-effect.
  // Forced 0 on a pure-grocery basket so a lingering custom-tip state can't send a rate the server would
  // discard (defense-in-depth — the server also force-zeros grocery tips).
  const tipNet = totals.subtotalCents - totals.discountCents;
  // The decision itself lives in lib/tip.ts (pure, mutant-pinned).
  const effectiveTipRate = deriveTipRate({
    pureGrocery,
    customTipOpen,
    customRate: customTipRateFromDollars(customTip, tipNet),
    presetRate: tipRate,
  });
  const [step, setStep] = useState<"review" | "pay">("review");
  // W3e: the pickup/scango call-out name — optional, rides create-intent → qr_carts.customer_name →
  // the order snapshot, so expo + the order-ready board can call a human instead of a code. Dine-in
  // never shows it (the table IS the identity). Prefilled from the diner's saved display name.
  const sessionMode = splitContext?.mode ?? null;
  const isTakeout = sessionMode === "pickup" || sessionMode === "scango";
  // W9a — the two TABLE-only line controls ("For here / To go", "Make it now") gate on this, NOT on
  // `!isTakeout`. The distinction is load-bearing: `splitContext` is nulled by cart/page.tsx on ANY
  // read failure, so `!isTakeout` is true for "unknown mode" too — and rendering either control on a
  // pickup cart is not cosmetic. "Make it now" fires a line the KDS deliberately refuses for a
  // pre-paid channel (leaving it non-draft, so the diner can never edit it again), and flipping to
  // "For here" re-routes the order off the expo board and freezes /track at "Order placed" forever.
  // Unknown mode must hide them: a missing control costs a tap, a wrong one costs the order.
  const isDineIn = sessionMode === "dinein";
  // W5e — the ASAP↔scheduled timing choice is pickup-only: pickup lines fire to the KITCHEN (so timing
  // matters), whereas scango is self-scanned grocery retail (no kitchen fire to schedule).
  const isPickupMode = sessionMode === "pickup";
  const [firstName, setFirstName] = useState("");
  // W21 (owner: "pickup should need name and phone number") — the pickup contact phone. PICKUP
  // only (scango is a self-scanned walk-out — nothing to call anyone about); required at the pay
  // boundary by the SAME pure predicate create-intent runs (lib/pickup-contact.ts), so the local
  // gate and the server's refusal cannot drift. PII: cart column only, never analytics.
  const [phone, setPhone] = useState("");
  const pickupNameRef = useRef<HTMLInputElement>(null);
  const pickupPhoneRef = useRef<HTMLInputElement>(null);
  // W21 (Codex P1 on #191) — the pickup timing write chain, owned HERE so continueToPayment can
  // await it: create-intent locks the cart and reads fire_at, so a timing write still in flight
  // when the diner taps Pay would be refused as locked while payment proceeds on the PREVIOUS
  // server timing. PickupWhenChoice enqueues onto this ref.
  const pickupWrites = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    // W9a — never read a stored name off the device for a basket that will never show the field
    // (pure grocery). Belt-and-braces with the submit gate: nothing to leak if nothing is hydrated.
    if (!isTakeout || pureGrocery) return;
    let active = true;
    // Hydrate AFTER mount via a microtask (the TableCartProvider NAME_KEY pattern): SSR and the first
    // client render agree, and the setState runs in a callback, never the effect body.
    void Promise.resolve()
      .then(() => localStorage.getItem("mms.name")) // the group-cart display-name key (one identity)
      .then((saved) => {
        if (active && saved) setFirstName(saved.slice(0, 40));
      })
      .catch(() => {
        /* private mode — the field just starts empty */
      });
    return () => {
      active = false;
    };
  }, [isTakeout, pureGrocery]);
  useEffect(() => {
    // Same hydrate pattern for the phone — pickup only (the render gate), so a stored number never
    // rides a mode that has no field to see or clear it (the W9a name lesson, applied on day one).
    if (!isPickupMode) return;
    let active = true;
    void Promise.resolve()
      .then(() => localStorage.getItem("mms.phone"))
      .then((saved) => {
        if (active && saved) setPhone(saved.slice(0, 20));
      })
      .catch(() => {
        /* private mode — the field just starts empty */
      });
    return () => {
      active = false;
    };
  }, [isPickupMode]);
  // Tab lifecycle (S3.1) — seeded from the server view, kept in step by refresh() (a peer or a
  // server securing the tab flips it here too). W12: the diner never CHOOSES a tab anymore — an
  // unsettled dine-in table IS the open (trust) tab, so `trust` renders nothing diner-side; the
  // state only gates the save-card affordance and its secured note on the Bill moment.
  const [tabType, setTabType] = useState(initialTabType);
  // W19 — the pickup timing choice, LIFTED above the keyed step wrapper. It lived in
  // PickupWhenChoice's own useState seeded from the server prop; the `key={viewKey}` remount on a
  // pay-step round-trip re-seeded it from that stale prop, relighting ASAP over a scheduled cart —
  // and `chooseAsap`'s already-ASAP early-return made the stale slot unclearable. Owned here,
  // re-read by refresh(), the pill state survives the remount and tracks the server truth.
  const [pickupSlot, setPickupSlot] = useState<string | null>(initialPickupSlot);
  // W12 — the two-moment stage (dine-in only): Order (build + send the round) vs Bill (tip + pay).
  // The landing is derived (lib/checkout-stage — drafts → order, fired-only → bill), then the
  // diner flips freely; it rides `viewKey` so a flip animates + moves focus like every view change.
  const [stage, setStage] = useState<CheckoutStage>(() => initialStage(initialItems));
  // W12 review MED — the send's 10s undo grace lives inside SendToKitchenButton, and a stage flip
  // unmounts it (the keyed step wrapper), destroying the only UI that can recall the send. While
  // the window is open the View-bill door stays un-promoted and REFUSES with the why (the W9b
  // dead-controls-say-why rule) instead of silently forfeiting the undo.
  const [undoOpen, setUndoOpen] = useState(false);
  // W13 — the J1 rule ("back slides back") applied INSIDE /cart: forward flips (order→bill,
  // review→pay) enter from the right, back flips from the left. State (not a ref) — the wrapper
  // className reads it during render, and render-phase ref reads are a compiler violation.
  const [stepDir, setStepDir] = useState<"forward" | "back">("forward");
  // M124 — the client secret and the attempt token that names the era it was minted under are ONE
  // value. Held as two `useState`s they can drift (a second create-intent resolving out of order
  // updates one and not the other), and the abandon exits would then echo an era that is not the one
  // whose pin the mounted Element depends on — which is the M124 defect re-created client-side.
  const [payAttempt, setPayAttempt] = useState<PayAttempt | null>(null);
  const clientSecret = payAttempt?.clientSecret ?? null;
  const [payTotals, setPayTotals] = useState<CartTotals | null>(null);
  // The in-flight create-intent request, and the ONE fact `visibleFreeze` needs about it: the freeze
  // as it stood when the request started. Kept in a SINGLE state rather than a boolean plus a
  // companion ref/state, so the two can never disagree about which request is running — the "name it
  // once" rule applied to a pair that is only ever written together. `loadingPay` stays a derived
  // boolean, so every CTA site below is untouched.
  const [payRequest, setPayRequest] = useState<{ freezeAtStart: CartFreeze } | null>(null);
  const loadingPay = payRequest !== null;

  // Re-sync the server-authoritative view (items / totals / settling / tabType — never pay-step state,
  // so a mid-payment refetch can't disturb the mounted Stripe Element). Stable (useCallback on the
  // stable cartId prop) so the realtime + visibility subscriptions below register once.
  const refresh = useCallback(async () => {
    try {
      const v = await getCartView(cartId);
      setItems(v.items);
      setTotals(v.totals);
      // W19 — the pickup choice re-reads with the cart (the bug: refresh() synced everything BUT
      // the slot, so a pay-step round-trip remounted PickupWhenChoice from the stale server prop
      // and relit ASAP over a still-scheduled cart, with no way to clear it).
      setPickupSlot(normalizePickupSlot(v.pickupSlot, v.fireAt));
      setSettling(v.settling); // a peer (host) opening/canceling a split flips the whole table here
      // W13 review — a peer-driven settle flip is a LATERAL cut, not a back-navigation: without
      // this reset a stale "back" from the diner's last local flip would slide the settle board
      // (and its return) in from the left. Idempotent while settling holds (React bails on same).
      if (v.settling) setStepDir("forward");
      // W9b — the lock moves with the same refresh. This is still NOT pay-step state: it never touches
      // clientSecret/payTotals/step, so the mounted Stripe Element is untouched by a lock flip.
      setLocked(v.locked);
      setLockedBy(v.lockedBy);
      setMySeat(v.mySeat);
      setTabType(v.tabType); // a server (or a peer) opening the tab reflects here too
      return true;
    } catch {
      // Swallow: the EXPECTED failure here is the post-payment 403 (the cart flipped to paid → the
      // diner is being redirected to /track). We can't discriminate it from a transient error
      // client-side — Server Action errors are redacted in prod, so no `.status` survives — and
      // surfacing an error on the expected post-pay 403 would be a false alarm. A transient failure
      // self-heals on the next interaction (every mutation re-fetches).
      //
      // ⚠️ The swallow stays; what changes is that it now RETURNS the outcome (Codex round 5 on
      // #246). Every existing caller ignores the value and is unaffected — but a caller whose whole
      // job is to re-read on demand ("Check again") must be able to tell "the server says still
      // locked" from "we never heard back", or it silently repeats the defect it was added to fix.
      return false;
    }
  }, [cartId]);

  // Live cart sync: a peer's add/qty/assignment (P3.2) OR a server opening/securing the tab or
  // editing the order (S1.3/S3.1) re-fetches the server-authoritative view here, so the cart +
  // shares + tab state stay in step. Enabled for ANY dine-in cart (not just groups) — a solo
  // diner must still see a staff/webhook tab flip land live (W12: it swaps the Bill moment's
  // save-card line for the "Card on file" note; the qr_carts UPDATE drives refresh → tabType).
  const anon = useAnonSession();
  // W10a — diagnosed failure attribution for the promo/pay copy (never blame the connection blind).
  // `truth` is deliberately NOT read here — the one consumer awaits `diagnose()` for the verdict
  // (see onPromo): the hook state lags the probe by a render, which made the attributed copy dead.
  const { diagnose } = useConnectionTruth();
  // K3a: a signed-in diner's Stars standing at the moment of payment (recognition, not a pitch —
  // WalletChip renders nothing for an anonymous diner). Balance is server-derived; a fetch failure
  // just hides the chip.
  const rewardsBadge = useRewardsBadge();
  useCartRealtime(cartId, anon?.accessToken ?? "", canTab || isGroup, () => {
    void refresh();
  });
  const [payError, setPayError] = useState<string | null>(null);

  // Derived VIEW: settle (split freeze) / pay (Stripe step) / review. Drives BOTH the keyed step wrapper
  // and the focus-move effect below — so a REALTIME `settling` flip (a peer opening a split changes the
  // view WITHOUT touching `step`) still moves focus off the unmounting subtree to the heading, not just
  // review↔pay taps. `onPay` keeps its original truthiness (narrows payTotals in the render).
  // W12: dine-in review is STAGED (order | bill) — the stage joins the key so a flip animates the
  // step wrapper and lands focus on the heading exactly like review↔pay always has.
  const onPay = step === "pay" && clientSecret && payTotals;
  const staged = isDineIn;
  const viewKey =
    isGroup && settling && splitContext
      ? "settle"
      : onPay
        ? "pay"
        : staged
          ? `review-${stage}`
          : "review";
  // W12 — the heading names the MOMENT: "Your bill" once the diner is settling (bill stage + the
  // pay step it leads to), "Your order" everywhere else. Screen-reader users hear the moment change
  // (focus moves to this heading on every view flip).
  const headingKey: DictKey =
    staged && viewKey !== "settle" && (onPay || stage === "bill") ? "yourBill" : "yourOrder";

  // J4 (residual) — the freeze comes from ONE binding that mirrors the server's own predicate.
  //
  // W9b was right that a lock is only worth NAMING when it is someone else's: the diner on their own
  // pay step holds it, and "someone's checking out" would be a lie about themselves. What it also did
  // was let them EDIT — and `cart.ts` refuses on bare `locked` at eleven sites with no comparison to
  // the caller, so the set {locked, held by me} rendered every control live while every write threw
  // and the catch swallowed it. Naming and blocking are two decisions; `cartFreeze` separates them.
  const rawFreeze = cartFreeze({ locked, lockedBy, mySeat });
  // ⚠️ OUR OWN LOCK, BEING TAKEN RIGHT NOW, IS NOT A FREEZE TO WARN ABOUT (blind adversarial pass on
  // #246 — a regression this PR introduced, not a pre-existing one).
  //
  // `continueToPayment` sets `loadingPay`, calls create-intent — which ACQUIRES the lock — then
  // `await refresh()`, and only then `setStep("pay")`. The refresh (and the realtime `qr_carts` row
  // UPDATE, which the same tab is subscribed to) therefore lands `locked = true, lockedBy = me`
  // while `step` is STILL "review". Under the old `lockedByPeer` gate that window painted nothing;
  // under a bare freeze it paints a `--warn` bar reading "your checkout has this order held", kills
  // every control, and hides the add-more link — underneath a CTA that says "Starting checkout…".
  //
  // Suppressed for the SELF case only. A peer's lock in this window is a real refusal (create-intent
  // answers 409 held_by_other), and `held` is unattributable, so both keep their bar.
  //
  // ⚠️ AND ONLY FOR A LOCK THIS REQUEST TOOK (Codex round 2 on #246 — the residue of the fix above).
  // `loadingPay && self` also matched a self lock that was ALREADY there, which is the two-tabs case
  // this whole slice exists for: tab B's Pay CTA is deliberately live, so one press hid the bar,
  // re-enabled every control and announced "the order's unlocked" while the other tab still held it.
  // `payRequest.freezeAtStart` is the freeze as it stood when the request began — only a cart that
  // was editable then can have been frozen by US since. The rule itself lives in `cart-freeze.ts`
  // where it can be tested and mutated; this file only supplies the two facts.
  // ⚠️ THE SUPPRESSION IS ABOUT THE NOTICE, NEVER THE GATE (Codex round 5 on #246 — and it is this
  // module's own rule, applied against me). `cart-freeze.ts` opens by saying naming and blocking are
  // two decisions and W9b made both; deriving `editsFrozen` from the SUPPRESSED value made exactly
  // that mistake in the other direction. During our own create-intent the server has already taken
  // the lock and refuses every write on bare `locked`, so every control stayed live and refusing: if
  // the request or the refresh stalls and realtime delivers the lock while the review step is still
  // mounted, edits flip optimistically and snap back — the silent no-op this whole slice exists to
  // retire, reintroduced by its own fix.
  //
  // So the GATES read `rawFreeze` — the server's answer, unmodified — and only the NOTICE is
  // suppressed. The controls going quiet under a CTA that says "Starting checkout…" is honest; a
  // `--warn` bar saying someone has the order held is not, because that someone is us.
  const noticeFreeze = visibleFreeze({
    freeze: rawFreeze,
    payRequestInFlight: loadingPay,
    freezeAtRequestStart: payRequest?.freezeAtStart ?? null,
  });
  // Blocks edits for peer / self / held alike — exactly the server's `if (locked)`.
  const editsFrozen = freezeBlocksEdits(rawFreeze);
  // Stops the PAYMENT — a strictly narrower thing than stopping the edits, and the one binding both
  // the Pay CTA and the tip chips read. `acquireCartLock` lets the SAME uid re-acquire, so only a
  // peer's fresh lock is a real refusal (409 held_by_other); a self or unattributable lock leaves
  // Pay as the diner's way out, and the tip that rides into create-intent with it must stay live
  // (Codex round 2 on #246 — gating the chips on `editsFrozen` let them pay, but only with the tip
  // they happened to have). Peer is a strict subset of frozen, so every site W9b already gated
  // keeps its exact behaviour; only the self/held EDIT gap closes.
  const payFrozen = freezeBlocksPayment(rawFreeze);
  const lockedByName =
    noticeFreeze === "peer"
      ? (splitContext?.members.find((m) => m.seat === lockedBy)?.name ?? "Someone")
      : null;
  // Can THIS viewer release the lock it is looking at? Only if it holds the attempt token that took
  // it — a second tab on the same device shares the uid but never minted an era, and
  // `releasePayAttempt` fails closed without one (M124), deliberately: the first tab may be behind a
  // live Payment Element. So this gates both the sentence and the button.
  const canRelease = !!payAttempt?.attempt;
  const freezeMessage = freezeNotice(noticeFreeze, lockedByName, canRelease);

  // W9b — announce the lock edge. The lockbar is plain visual, and this view's ONE status region is
  // `status` (rendered below) — the provider's announcer that handles this on /menu is mounted on the
  // menu subtree only, so without this a screen-reader user on /cart hears NOTHING as every control
  // around them goes dead. Edge-triggered via a ref so it fires on the transition, not every render.
  //
  // J4 (residual) — widened past `lockedByPeer`. A screen-reader user whose OWN lock freezes the
  // cart heard nothing while every control around them went dead: the peer edge never fired, because
  // there is no peer. The sentence comes from `freezeNotice`, so the announcement and the visible bar
  // can never drift apart, and the self case never claims a takeover it cannot prove.
  //
  // ⚠️ KEYED ON THE NOTICE, NOT THE GATE (Codex round 5 on #246). Now that `editsFrozen` reads the
  // RAW freeze, keying here would fire during our own create-intent — where `freezeMessage` is
  // deliberately null, so the `??` fallback would announce "the order's unlocked" at the exact moment
  // the server locked it. Announcing on the notice edge means the region says what the bar says, and
  // stays silent for the one window we have chosen not to narrate (the CTA's `aria-busy` carries it).
  const announced = freezeMessage !== null;
  const prevAnnouncedLock = useRef<boolean | null>(null);
  useEffect(() => {
    // ⚠️ DO NOT CONSUME THE EDGE WHILE THE REGION IS UNMOUNTED (Codex round 7 on #246). This status
    // feeds the REVIEW step's single live region; the pay step renders its own inside
    // `PaymentSection` and never shows this one. After create-intent succeeds, `setStep("pay")` and
    // the `finally` clearing `payRequest` land in ONE render — so the now-unsuppressed self freeze
    // flips `announced` true with the review region already gone, and the old code wrote the sentence
    // into hidden state and moved the ref past the edge. A later "Edit order" whose release comes
    // back `rate_limited`/`error`/`unknown` then remounts a STILL-FROZEN review with `announced`
    // already true: no edge, no announcement, and a screen-reader user is never told why every
    // control is read-only — which is the exact gap J4's residual exists to close.
    //
    // Returning BEFORE the ref is written preserves the edge for the remount.
    if (onPay) return;
    const prev = prevAnnouncedLock.current;
    prevAnnouncedLock.current = announced;
    if (prev === null || prev === announced) return; // seed on first run; only edges announce
    // The region renders `payError ?? status`, so a stale error would swallow this announcement
    // entirely — and while locked the diner cannot retry the action that produced it, so it would
    // never clear on its own. A lock transition supersedes it.
    setPayError(null);
    setStatus(freezeMessage ?? "The order’s unlocked — you can edit again.");
  }, [announced, freezeMessage, onPay]);
  // W9b — true while a PaymentIntent confirm is in flight (lifted out of PayForm). The pay step's
  // back control freezes on it: releasing the pay-window lock mid-authorization would let the table
  // edit the cart out from under a live intent.
  const [paying, setPaying] = useState(false);
  // W9b review — `editOrder()` is two round-trips (releasePayLock + refresh) fired as a void. Without a
  // busy state the back control looks dead for seconds and invites a second tap, on the one screen this
  // slice exists to keep honest.
  const [leavingPay, setLeavingPay] = useState(false);

  // Focus management: when a stepper removes the last unit of a line, the <li> unmounts and focus
  // would fall to <body>. Move it to the heading so keyboard/SR users keep their place.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevLen = useRef(viewItems.length);
  useEffect(() => {
    if (viewItems.length > 0 && viewItems.length < prevLen.current) headingRef.current?.focus();
    prevLen.current = viewItems.length;
  }, [viewItems.length]);

  // S2.2 (B4): when a line the diner could edit gets fired (its stepper unmounts in favour of a state
  // chip), focus would fall to <body>. Move it to the heading — BUT only if focus actually dropped
  // there, so we never yank focus off a control the user moved to (e.g. SendToKitchenButton focuses its
  // own "Undo" button when the window opens; for a host on this device, that's where focus lands).
  const draftCount = viewItems.filter((i) => i.lineState === "draft").length;
  const prevDraftCount = useRef(draftCount);
  useEffect(() => {
    if (draftCount < prevDraftCount.current && document.activeElement === document.body)
      headingRef.current?.focus();
    prevDraftCount.current = draftCount;
  }, [draftCount]);

  // W9b — the same focus discipline as the draft-count effect above, for the lock. A peer taking the
  // lock disables the stepper the diner may be standing on; if focus actually fell to <body>, park it
  // on the heading (WCAG 2.4.3). Only when it dropped — never yank focus off a control they moved to.
  // J4 (residual) — widened with the announcement above, for the same reason: the focus lands on the
  // bar that explains why the controls died, and a self-held freeze kills exactly as many controls.
  const prevLockedByPeer = useRef(announced);
  useEffect(() => {
    // Same deferral as the announcement above, for the same reason: the heading this parks focus on
    // belongs to the review step, so an edge consumed while the pay step is mounted is an edge lost.
    if (onPay) return;
    if (announced && !prevLockedByPeer.current && document.activeElement === document.body)
      headingRef.current?.focus();
    prevLockedByPeer.current = announced;
  }, [announced, onPay]);

  // W9b — release the pay-window lock when the diner ABANDONS the pay step. The lock makes the whole
  // table read-only, so a diner who wanders off holds every tablemate hostage for the full TTL.
  //
  // Two exits, because they are genuinely different events:
  //   • `pagehide` — the document is torn down (tab closed, hard navigation away). A Server Action
  //     started here dies with the page, so this posts via `sendBeacon` to a thin route.
  //   • unmount — an App Router SOFT navigation (browser Back to /menu, a header link). No `pagehide`
  //     fires for these at all, which is why the beacon alone left the lock riding its TTL on the very
  //     journey this slice is named for. Deps are `[]` so the cleanup runs on unmount ONLY, never on a
  //     re-render; the refs below carry the live values into it.
  //
  // Three states must NOT release, and each has bitten somewhere:
  //   • `paying` — a confirm is in flight. `pagehide` fires on the SUCCESSFUL redirect too, and
  //     releasing there unlocks a cart whose PaymentIntent is already authorized.
  //   • `event.persisted` — a bfcache freeze. The page is not being destroyed; it comes back with the
  //     same mounted Element and the same clientSecret, so releasing would hand tablemates a cart the
  //     diner is about to pay a now-stale amount for.
  //   • not on the pay step — nothing to release.
  //
  // Deliberately NOT `visibilitychange`: it fires on every app-switch to a wallet.
  const payAbandonRef = useRef<{
    onPay: boolean;
    paying: boolean;
    cartId: string;
    attempt: string | null;
  }>({ onPay: false, paying: false, cartId, attempt: null });
  // Synced in an effect, not during render (a render-phase ref write is a React Compiler violation).
  // The listener below only ever reads this on a real teardown, which is always after a commit.
  useEffect(() => {
    payAbandonRef.current = {
      onPay: !!onPay,
      paying,
      cartId,
      attempt: payAttempt?.attempt ?? null,
    };
  }, [onPay, paying, cartId, payAttempt]);
  const releaseLockBeacon = useCallback(() => {
    const { onPay: active, paying: mid, cartId: id, attempt } = payAbandonRef.current;
    if (!active || mid) return;
    try {
      navigator.sendBeacon?.(
        // M124 — name the attempt being abandoned. Without it the server cannot tell this beacon
        // from one fired by a tab that has since been superseded, and the release would clear the
        // LIVE attempt's pin. `attemptReleaseBody` omits the field entirely when unknown so the
        // body still satisfies the schema (an old bundle mid-deploy), and the server fails closed.
        "/api/cart/release-lock",
        new Blob([JSON.stringify(attemptReleaseBody(id, attempt))], { type: "application/json" }),
      );
    } catch {
      // Beacon unavailable/refused — the lock TTL is the backstop, and there is no UI left to tell.
    }
  }, []);
  useEffect(() => {
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // bfcache freeze — the page (and its live Element) is coming back
      releaseLockBeacon();
    };
    window.addEventListener("pagehide", onPageHide);
    // Cleanup order matters: drop the listener FIRST, then release for the soft-navigation case, so a
    // teardown that is both (a real unload during unmount) can't beacon twice.
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      releaseLockBeacon();
    };
  }, [releaseLockBeacon]);

  // On ANY view change (review↔pay tap OR a realtime settling flip) the subtree that held focus unmounts
  // → focus would drop to <body> with no cue (WCAG 2.4.3). The heading is mounted across all views, so
  // move focus there after the commit. Keyed on `viewKey` (not just `step`) so the settling flip counts.
  // Skip the first mount (no transition yet).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    else mounted.current = true;
  }, [viewKey]);

  // J3 freshness backstop (mirrors TableCartProvider's): the review-step timeline must never narrate
  // a stale kitchen state as current — realtime here is dine-in-gated (a pickup cart has none) and a
  // backgrounded phone misses the flips anyway — so re-sync the server view whenever the tab returns
  // to the foreground.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  function changeQty(id: string, qty: number) {
    // Chain this line's write after any in-flight one so absolute setQty(N) calls commit in tap order
    // (the last value wins) — concurrent writes could otherwise interleave and leave a stale count.
    const prev = qtyChain.current.get(id) ?? Promise.resolve();
    const write = prev.then(async () => {
      try {
        await setQtyAction(id, qty);
      } catch {
        // Locked or no-longer-open — refresh() below re-syncs the UI to server truth.
      }
    });
    qtyChain.current.set(id, write);
    startCartTransition(async () => {
      applyOptimistic({ kind: "qty", id, qty }); // instant — the stepper + per-line price react at once
      await write; // this write + all prior for the line, in order → the final refresh reads the true qty
      await refresh();
    });
  }

  // S4: re-route a food line for-here↔to-go. The server recomputes the line's tax (cold food flips
  // taxability); refresh() re-syncs the grouped basket + the breakdown. A refused toggle (busy/fired)
  // just no-ops back to server truth on refresh — no client error needed (the control is draft-only).
  // When the cart spans 2+ destinations the line's <li> moves to another <section> on re-route, so the
  // clicked button unmounts and focus would drop to <body> (WCAG 2.4.3). Re-focus the now-pressed button
  // for that line after the re-render — its accessible name + aria-pressed announces the new destination.
  const refocusToggle = useRef<{ id: string; ful: string } | null>(null);
  useEffect(() => {
    const target = refocusToggle.current;
    if (!target) return;
    refocusToggle.current = null;
    document
      .querySelector<HTMLButtonElement>(
        `[data-ful-line="${target.id}"][data-ful-val="${target.ful}"]`,
      )
      ?.focus();
    // Dep on viewItems (the optimistic list): the re-group happens optimistically now, so focus must
    // follow at that commit, not one server round-trip later. The `if (!target) return` guard keeps this
    // a no-op on every other render (viewItems is a fresh array each render).
  }, [viewItems]);
  function toggleFulfillment(id: string, ful: "dinein" | "togo") {
    startCartTransition(async () => {
      // Set the refocus target in the SAME commit as the optimistic re-group: applyOptimistic moves the
      // line's <li> to another destination <section>, unmounting the tapped button (focus → body). The
      // [viewItems] effect then lands focus on this line's now-pressed pill — closing the WCAG 2.4.3 gap
      // the instant re-group opens (the old post-await set left focus on <body> for a full round-trip).
      refocusToggle.current = { id, ful };
      applyOptimistic({ kind: "fulfillment", id, ful }); // instant — the line re-groups + the pill flips
      try {
        await setLineFulfillment(id, ful);
      } catch {
        /* transient/redacted — refresh re-syncs */
      }
      await refresh();
    });
  }

  // S4.2 "Make it now": fire a to-go line to the kitchen early (instead of waiting for checkout). The
  // server recomputes nothing about money — it only flips the line to 'fired'; refresh() re-syncs so the
  // line shows its state chip (the toggle + this button drop away once fired). A refused fire (busy/raced)
  // just no-ops back to server truth on refresh — the control is draft-only, so no error UI is needed.
  function makeNow(id: string) {
    startCartTransition(async () => {
      applyOptimistic({ kind: "makeNow", id }); // instant — the stepper swaps to its "on the way" chip
      try {
        await makeItNow(id);
      } catch {
        /* transient/redacted — refresh re-syncs */
      }
      await refresh();
    });
  }

  function onPromo(e: FormEvent) {
    e.preventDefault();
    if (!promo.trim()) return;
    // W9b — `aria-disabled` on the Apply button does NOT stop a submit: pressing Enter in the field
    // submits the form directly. The refusal has to live here, or the "disabled" promo control would
    // still fire a write the server rejects — the exact silent-refusal this slice exists to retire.
    if (editsFrozen) return;
    startTransition(async () => {
      setStatus(null); // clear any stale result so it doesn't linger through the round-trip
      setPayError(null); // single live region — don't let a prior pay error mask the promo result
      try {
        const result = await applyPromoAction(cartId, promo.trim());
        setStatus(result.ok ? "Promo applied." : PROMO_MESSAGES[result.reason]);
      } catch {
        // A thrown error here is a transport/redacted failure, not a known reason. W10a: attribute
        // it — ONE line in the single status region (a second setStatus would announce the same
        // failure twice). "check your connection" only ever when the device is actually offline.
        //
        // ⚠️ W10c pre-PR review — AWAIT the probe instead of reading `truth`. That state is written
        // only by this hook instance's own `diagnose()`, so on a FIRST failure it is still the
        // initial "unknown" and the attributed copy never rendered — the outage sentence this line
        // exists for was reachable only on a second failure inside the 15s cache TTL. Unlike the
        // grocery toast (which stays un-awaited on purpose — a late toast announces twice), this is
        // persistent status text with no timing constraint.
        setStatus(failureCopy(await diagnose(), "apply that code"));
      }
      await refresh();
    });
  }

  async function continueToPayment() {
    setPayError(null);
    setStatus(null); // single live region — clear any prior promo result
    // W21 — the pickup contact gate, locally first (same pure predicate create-intent runs, so
    // this can never disagree with the server's refusal): say what's missing AND move focus to
    // the field, instead of round-tripping just to be told.
    if (isPickupMode) {
      const missing = pickupContactMissing(firstName, phone);
      if (missing) {
        setPayError(
          missing === "name"
            ? "Add a first name for pickup — we need someone to call."
            : "Add a phone number for pickup — we’ll only use it about this order.",
        );
        (missing === "name" ? pickupNameRef : pickupPhoneRef).current?.focus();
        return;
      }
    }
    // Opening the request records the freeze as it stands RIGHT NOW. `visibleFreeze` hides only a
    // self lock that appeared DURING this request; a self lock already standing here is another
    // tab's, and hiding it would unfreeze a screen the server still refuses.
    setPayRequest({ freezeAtStart: rawFreeze });
    try {
      // W21 (Codex P1 on #191) — drain any in-flight pickup timing write BEFORE minting the
      // intent: create-intent locks the cart and reads fire_at, so a write still in the chain
      // would be refused as locked while payment proceeded on the previous server timing. The
      // chain never rejects (each write owns its errors), so this await cannot throw; on a
      // refused write the pill has already snapped back by the time we proceed.
      if (isPickupMode) await pickupWrites.current;
      // Member-gated (cookie session); the route re-derives the amount from getCartTotals and locks
      // the cart for the pay window. Same-origin fetch carries the auth cookie. The takeout call-out
      // name (W3e) always rides on takeout — an EMPTY value clears a previously-stored name (a diner
      // who deleted the field on a retry must not keep getting called by the stale one); remember a
      // real name for next time (same key the group-cart name uses).
      // W9a — the SUBMIT gate must match the RENDER gate (`isTakeout && !pureGrocery`). Hiding the
      // field alone was strictly worse for privacy than leaving it visible: `firstName` is hydrated
      // from `mms.name` (set by a prior dine-in rename or pickup checkout), so a scan-&-go shopper
      // with any stored name would still have shipped it → `qr_carts.customer_name` → the order
      // snapshot → the wall-mounted public `/board` TV, with no surface left to see or clear it.
      // Sending "" is already the intended clear-a-stale-name behaviour (see the comment above).
      const name = isTakeout && !pureGrocery ? firstName.trim().slice(0, 40) : "";
      // W21 — the pickup phone rides only on pickup (the render + require gates' mode). Remembered
      // for next time like the name; both writes are best-effort.
      const phoneOut = isPickupMode ? phone.trim().slice(0, 20) : "";
      try {
        if (name) localStorage.setItem("mms.name", name);
        if (phoneOut) localStorage.setItem("mms.phone", phoneOut);
      } catch {
        /* private mode */
      }
      const res = await fetch("/api/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // effectiveTipRate = preset OR the derived custom rate (customCents / net) — server re-derives
        // the amount from it via getCartTotals; the client never sends a dollar figure.
        body: JSON.stringify({
          cartId,
          tipRate: effectiveTipRate,
          ...(isTakeout ? { firstName: name } : {}),
          ...(isPickupMode ? { phone: phoneOut } : {}),
        }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        totals?: CartTotals;
        attempt?: string;
        error?: string;
      };
      if (!res.ok || !data.clientSecret || !data.totals) {
        // A 4xx carries a safe, server-authored reason (e.g. "Pick a pickup time first.", a filled
        // slot); 5xx stays generic so a raw SDK/config string never reaches the client (recon).
        setPayError(
          res.status < 500 && data.error
            ? data.error
            : "Couldn’t start checkout — please try again.",
        );
        return;
      }
      // W21 (Codex P1 on #192) — re-read the cart NOW, after create-intent LOCKED it, so the pay
      // step's itemization (BillLines) renders the same locked lines payTotals was derived from —
      // a peer's edit landing between this device's last refresh and the lock otherwise showed an
      // itemization that disagreed with the total being charged. Post-lock staff comps/voids can
      // still move the live lines later (the view stays honest; the frozen totals then disagree —
      // and the webhook reconcile refuses the mismatched charge, so the money is safe either way).
      await refresh();
      // M124 — one write, so the secret and its attempt token can never disagree. `readPayAttempt`
      // returns null only when the secret is missing, which the guard above already excluded.
      setPayAttempt(readPayAttempt(data));
      setPayTotals(data.totals);
      setStepDir("forward"); // W13 — the pay step is the deepest cut
      setStep("pay");
    } catch {
      setPayError("Couldn’t start checkout — please try again.");
    } finally {
      setPayRequest(null);
    }
  }

  // W12 review — a stage flip must not strand a message whose control lives on the OTHER stage
  // (a promo error read as a send failure on the Order moment). Same single-region discipline as
  // every other handler: clear, then flip.
  function flipStage(next: CheckoutStage) {
    setStatus(null);
    setPayError(null);
    setStepDir(next === "bill" ? "forward" : "back"); // W13 — bill is deeper; order is the way back
    setStage(next);
  }

  const [reopening, setReopening] = useState(false);
  const [recheckingLock, setRecheckingLock] = useState(false);

  /**
   * J4 (residual) — RE-READ the lock, for every freeze that has no Reopen.
   *
   * Two Codex round-4 findings land on the same missing control, and neither is about the release:
   *
   *   1. The tokenless self sentence promises the lock "frees up on its own shortly", and the SERVER
   *      keeps that promise — `acquireCartLock` treats a lock past `CART_LOCK_TTL_MS` as takeable.
   *      The SCREEN does not: `getCartView` returns `locked`/`lockedBy` but no `locked_at`, so the
   *      client cannot compute the expiry, the TTL writes nothing and fires no realtime event, and
   *      nothing here polls. An abandoned first tab therefore leaves the second frozen past the TTL
   *      until the diner reloads. Copy may only promise what the code keeps.
   *   2. `editOrder` clears the attempt token once a release LANDS and then refreshes — and
   *      `refresh()` swallows a transient read failure, so the component can keep `locked = true`
   *      with `canRelease` now false: a self-frozen screen whose Reopen button has just gone away
   *      on a cart the server already unlocked.
   *
   * A re-read answers both without inventing a timer or a poll: the server's answer is the only one
   * that counts, and asking for it again is the whole of what this promises.
   */
  async function recheckLock() {
    setRecheckingLock(true);
    setStatus(null);
    setPayError(null);
    try {
      // ⚠️ REPORT THE READ (Codex round 5 on #246). `refresh()` swallows a failed read by design (it
      // cannot tell the expected post-payment 403 from a transient error), so awaiting it and saying
      // nothing made this escape the very thing it was added to remove: a control that accepts a tap,
      // changes to "Checking…" and back, and leaves the frozen screen exactly as it was.
      if (!(await refresh()))
        setPayError(
          "Couldn’t check just now — try again in a moment. The lock also clears on its own.",
        );
    } finally {
      setRecheckingLock(false);
    }
  }

  /**
   * J4 (residual) — release a lock this seat holds, from the review step.
   *
   * The self-held freeze is reachable with nothing wrong (two tabs on one device share a uid, so
   * tab B sees `lockedBy === mySeat`) and from three `editOrder` fall-throughs that are correct to
   * fall through — `error`, `rate_limited` and `unknown` are not established facts about this tab,
   * so claiming supersession would fabricate a diagnosis. But falling through used to land the
   * diner on a screen that refused every edit and said nothing. Blocking the controls is only half
   * the fix; without this the diner is stuck until the 5-minute TTL.
   *
   * Deliberately NOT terminal on failure: a rate-limited or failed release leaves `locked` true, the
   * bar stays, and the button can be tapped again. `refresh()` re-reads the server's answer either
   * way — the client never decides it is unlocked on its own.
   */
  async function reopenOrder() {
    // ⚠️ NAME THE ATTEMPT WE ARE RELEASING (Codex round 7 on #246). On a self-frozen review with a
    // retained token, Reopen and Pay are BOTH live by design — Pay is the escape hatch, Reopen is
    // the release. So a create-intent started after this release can store its fresh attempt while
    // this one is still in flight, and an unconditional `setPayAttempt(null)` below would then wipe
    // the NEW client secret and collapse the pay step that just mounted (`clientSecret` is derived
    // from `payAttempt`). Both clears are now conditional on the token still being the one we
    // released, compared against the CURRENT state rather than this closure's copy.
    const releasingAttempt = payAttempt?.attempt ?? null;
    const retireIfStillOurs = () =>
      setPayAttempt((cur) => (cur && cur.attempt === releasingAttempt ? null : cur));
    setReopening(true);
    // W12 discipline — this view has ONE message region; clear it before the round trip so a stale
    // promo result cannot read as this attempt's answer.
    setStatus(null);
    setPayError(null);
    try {
      const res = await releasePayLock(cartId, payAttempt?.attempt ?? undefined);
      // ⚠️ EVERY OUTCOME IS REPORTED (Codex round 3 on #246). Rendering only `superseded` left
      // `rate_limited`, `not_held`, `error` and `unknown` saying nothing at all: the button flipped
      // to "Reopening…" and back with the bar still up — a silent no-op on the recovery control, which
      // is the exact defect this slice exists to retire, reappearing on its own fix. The sentences
      // live in `cart-freeze.ts` so each arm's claim can be tested and mutated.
      setPayError(reopenFailureNotice(res));
      // Only `superseded` is an established fact, and it is the one case where retrying is
      // pointless — another attempt owns this cart and will release it or let it expire.
      if (!res.released && res.reason === "superseded") {
        // ⚠️ AND THE TOKEN GOES WITH IT (Codex round 2 on #246). `classifyZeroRow` answers
        // `superseded` only for a lock that is still FRESH and stamped with a DIFFERENT era, so our
        // attempt provably matches no row and never will: the successor either releases (the cart
        // unlocks, nothing of ours to release) or expires. Leaving it set kept `canRelease` true, so
        // the Reopen button stayed on a screen where every press was a guaranteed zero-row release
        // repeating the same sentence — the inert control this PR's round-1 fix existed to retire,
        // reintroduced one branch over. Clearing it swaps the copy to the honest tokenless line
        // ("it frees up on its own shortly") and drops the button.
        //
        // Safe on THIS path in a way it is not in `editOrder`: we are on the review step with no
        // Payment Element mounted, and `continueToPayment` mints a fresh attempt on the next press.
        retireIfStillOurs();
      }
      // ⚠️ A LANDED RELEASE RETIRES THE TOKEN TOO (Codex round 6 on #246). Keeping it after
      // `released: true` looked harmless because the trailing `refresh()` normally clears the whole
      // bar — but `refresh()` swallows a failed read, so a transient failure leaves the stale
      // `locked = true` view with `canRelease` still true. That satisfies `self && canRelease`
      // exactly, so the "Check again" escape is NOT rendered, and every further Reopen press issues
      // a release whose era can no longer match: `not_held`, forever, with no way out but a reload.
      // The attempt is over the moment the release lands; saying so is what hands the diner the
      // re-read control.
      if (res.released) retireIfStillOurs();
    } catch {
      // Non-fatal for the LOCK — the bar stays, the button stays tappable, the TTL is the backstop —
      // but not silent: a thrown release is our outage and reports as one, same as `error`.
      setPayError(reopenFailureNotice({ released: false, reason: "error" }));
    } finally {
      setReopening(false);
    }
    // Always re-read. A release that reported success can still have been re-taken by a concurrent
    // create-intent, and the server's answer is the only one that counts — and if we never heard
    // back, say so rather than leaving the unchanged screen to imply the lock is still real.
    if (!(await refresh()))
      setPayError((prev) => prev ?? "Couldn’t re-check the order — try again in a moment.");
  }

  async function editOrder() {
    // Release the pay-window lock we took at create-intent (P3.2-lock) so the table can edit again,
    // then re-sync. Best-effort — the TTL is the backstop if the release call fails.
    let releasedLock = false;
    try {
      // M124 — echo the attempt this tab minted. A tab that has been superseded (the diner
      // re-checked-out elsewhere) names a stale era, matches no row, and releases NOTHING — which is
      // the point: it must not clear the live tab's pin or unfreeze its cart. `released === false`
      // is then the honest answer, and saying so beats returning the diner to a review step that
      // will refuse every edit ("Order is locked while someone checks out").
      const res = await releasePayLock(cartId, payAttempt?.attempt ?? undefined);
      releasedLock = res.released;
      // Only a SUPERSEDED tab is a terminal state, and only it earns that sentence. A rate-limit or
      // a transport error is our problem, not a fact about this diner's tab — saying otherwise
      // fabricates a diagnosis (M116/M119). Those two fall through to the normal transition, where
      // the lock TTL is the backstop exactly as before this change.
      if (!res.released && res.reason === "superseded") {
        // RETURN, not just an error line: falling through to the review step lands the diner on
        // controls that LOOK editable — a successor opened by the same diner has
        // `lockedBy === mySeat`, so `lockedByPeer` stays false — while every mutation is refused by
        // the live lock. Staying put with an honest sentence beats a screen that lies by omission.
        //
        // J4 (residual) — that "controls that LOOK editable" state is now closed at the source: the
        // review step gates on `editsFrozen` (bare `locked`, the server's own predicate), so the
        // OTHER exits from here — `error`, `rate_limited`, `unknown`, all of which correctly fall
        // through because none is an established fact — land on a frozen screen that says why and
        // offers Reopen, instead of one that accepts taps and discards them.
        setPayError(
          "Another tab took over this checkout — that one is paying. Reopen the order to edit it.",
        );
        return;
      }
    } catch {
      // non-fatal; the lock auto-expires via its TTL
    }
    setStepDir("back"); // W13 — leaving the pay step slides back
    setStep("review");
    // ⚠️ THE ATTEMPT TOKEN SURVIVES A FAILED RELEASE (Codex P2 on #246). Clearing it unconditionally
    // is what made the new Reopen control INERT: `releasePayAttempt` fails closed without an era, so
    // on the three fall-through exits (`error`, `rate_limited`, `unknown` — the ones where the lock
    // is still held) the diner landed on a frozen review step with a button that could only ever
    // call `refresh()`. A control that looks like the way out and is not is worse than none.
    //
    // Cleared only when the release actually LANDED, which is the one case where the attempt is
    // genuinely over. `payTotals` is cleared either way — those are pay-step numbers and must never
    // survive back into review.
    if (releasedLock) setPayAttempt(null);
    setPayTotals(null);
    await refresh();
  }

  if (viewItems.length === 0) {
    // W2d — designed empty-cart state. The menu link carries the session mode: a bare /menu defaults
    // to scan-&-go and would orphan a dine-in/pickup diner (F9). titleAs="p" — the <h1> names the region.
    // W9a — the fallback is now the DOOR PICKER, not `/menu`: an unknown mode used to route here as
    // scan-&-go, which is the same silent conversion the link was written to prevent.
    // The LABEL is derived from the same mode as the href — a CTA reading "Browse the menu" over a
    // `/grocery` destination (scango) or the door picker (unknown mode) is exactly the small
    // dishonesty this slice exists to retire. Same for the subtitle: a scan-&-go shopper's empty
    // basket is not waiting on a dish.
    const backHref = menuHref(sessionMode);
    const backLabel = menuLinkText(sessionMode, "browse");
    return (
      <main style={{ padding: "24px 20px 40px", maxWidth: "var(--w-content)", margin: "0 auto" }}>
        <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: 16 }}>
          {T("yourOrder")}
          <My k="yourOrder" size="var(--fs-sm)" />
        </h1>
        <EmptyState
          icon={<Icon name="cart" size={30} style={{ color: "var(--ac)" }} />}
          title={
            <>
              {T("emptyCartTitle")}
              <My k="emptyCartTitle" size="var(--fs-sm)" />
            </>
          }
          subtitle={
            <>
              {sessionMode === "scango" ? T("emptyCartSubAisles") : T("emptyCartSubMenu")}
              <My
                k={sessionMode === "scango" ? "emptyCartSubAisles" : "emptyCartSubMenu"}
                color="var(--t3)"
              />
            </>
          }
          action={
            <Link
              href={backHref}
              className="checkout-cta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 48,
                padding: "0 22px",
                borderRadius: 12,
                fontWeight: 800,
                fontSize: "var(--fs-body)",
                textDecoration: "none",
              }}
            >
              <span style={{ position: "relative", zIndex: 1 }}>
                {backLabel}
                <span aria-hidden className="checkout-cta-arrow">
                  →
                </span>
              </span>
            </Link>
          }
        />
      </main>
    );
  }

  // Client tip PREVIEW (a hint, not the charge) — identical formula to the server's
  // `Math.round(netCents * rate)` (lib/totals.ts), so the previewed "Estimated total" reconciles
  // exactly with the tip-inclusive total create-intent returns on the pay step.
  const tipPreview = (rate: number) =>
    Math.round((totals.subtotalCents - totals.discountCents) * rate);
  // W17c — the chips for THIS basket. A pure function of the server's own number (`tipNet` is
  // subtotal − discount, the tip base), so the ask moves with the cart and never invents one.
  // W18 (owner: "none is not encouraged lol") — the percentages LEAD and "None" sits LAST: still one
  // honest tap away, never hidden, but no longer the first thing the ask offers.
  const presetChips: [label: string, rate: number][] = [
    ...tipPresets(tipNet).map((p): [string, number] => [p.label, p.rate]),
    ["None", 0],
  ];

  // `pureGrocery`/`effectiveTipRate` are computed at the top (before the empty-cart return). The preview
  // is zeroed for pure-grocery so a mixed cart that BECOMES pure grocery (restaurant line removed after a
  // tip was picked) can't show an "Estimated total" the server will honestly refuse to charge.
  // Uses the EFFECTIVE rate (preset OR derived custom) so the preview matches what create-intent charges.
  const tipPreviewCents = pureGrocery ? 0 : tipPreview(effectiveTipRate);
  // W2d — the estimated tip-inclusive total shown on the primary CTA (presentation only; the pay step
  // confirms the server-authoritative amount).
  const ctaTotal = `$${((totals.totalCents + tipPreviewCents) / 100).toFixed(2)}`;

  // W12 — what each review surface shows. Classic (pickup/scango, unstaged) shows BOTH the editable
  // line cards and the pay furniture on one screen, exactly as before; a staged dine-in cart splits
  // them across the two moments. Neither gate touches the settle/pay views above.
  const showLineCards = !staged || stage === "order"; // the editing surface (cards, steppers, send)
  const showPayFurniture = !staged || stage === "bill"; // promo · reward · tip · fees · total · Pay

  // W12 review HIGH — the count/gate binds to what `mms_fire_cart` actually fires (dinein drafts,
  // in qty units) — the rule lives in lib/checkout-stage so it stays pinnable.
  const kitchenDraftQty = deriveKitchenDraftQty(viewItems);
  // W19 — what the Bill moment warns about: EVERY still-draft food line (dinein + togo) is charged
  // at pay and fired by mms_fire_pending_food when the payment lands. Deliberately broader than
  // kitchenDraftQty (see lib/checkout-stage).
  const unsentQty = unsentFoodQty(viewItems);

  // (W16a: the SB-1524 service charge — and its disclosure element — are RETIRED. Service margin
  // now lives in the mode-derived line prices; historical receipts keep their stored rows via
  // lib/receipt-view.ts.)

  // W2d — tip controls. The custom tip rides as a rate (customCents / net) so create-intent + the webhook
  // apply the SAME `round(net · rate)` — the diner types dollars, the server derives the amount.
  function selectPresetTip(rate: number) {
    setCustomTipOpen(false);
    setCustomTip("");
    setTipRate(rate);
  }
  function openCustomTip() {
    setCustomTipOpen(true); // the effective rate derives from `customTip` (empty ⇒ 0) while open
  }
  function onCustomTipChange(raw: string) {
    // Digits + a single dot, max 2 decimals — a plain money field. The effective rate is DERIVED from
    // this during render (survives a net change, e.g. a peer editing a group cart).
    const cleaned = raw
      .replace(/[^\d.]/g, "")
      .replace(/(\..*)\./g, "$1")
      .replace(/(\.\d\d).+/, "$1");
    setCustomTip(cleaned);
  }

  return (
    // W22a — the paper ambient behind the whole bill/pay column (no isolation: the page ground
    // lives on <html>, so the fixed z:-1 layer is visible without trapping fixed overlays).
    <main style={{ padding: "24px 20px 40px", maxWidth: "var(--w-content)", margin: "0 auto" }}>
      <PaperAmbient />
      {/* tabIndex={-1} = programmatic focus target (focus moves here when a line is removed). No
          outline override — the browser shows its :focus-visible ring (WCAG 2.4.7). K3a: a signed-in
          diner's wallet chip rides beside the heading (recognition at the pay moment; hidden for anon). */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--fs-h1)" }}>
          {T(headingKey)}
          {/* W13→W16b — the Burmese name for the moment, part OF the heading so a screen reader
              hears both tongues once, correctly pronounced (lang="my" on the accent). */}
          <My k={headingKey} size="var(--fs-sm)" />
        </h1>
        <WalletChip badge={rewardsBadge} />
      </div>

      {/* R7b: keyed step wrapper — a CSS enter-slide replays on each view change (review ↔ pay ↔ settle).
          Keyed on the view so React remounts it (the animation replays); the <h1> above stays mounted as the
          focus target. The pay step's Stripe Element mounts WITH this wrapper, so the transform-based enter
          never reloads the iframe. CSS `@media`-gated — no shouldAnimate first-render race. */}
      <div
        key={viewKey}
        className={`checkout-step${stepDir === "back" ? " checkout-step-back" : ""}`}
      >
        {isGroup && settling && splitContext ? (
          <>
            <SettlementBoard
              cartId={cartId}
              accessToken={anon?.accessToken ?? ""}
              ctx={splitContext}
              onStatus={setStatus}
              onChanged={refresh}
            />
            {/* The ONE polite live region for the settlement view (board announcements: split started,
              canceled, abort errors). The board's own rows carry per-share status visually. */}
            <p
              role="status"
              aria-atomic="true"
              style={{
                minHeight: 16,
                margin: "12px 0 0",
                fontSize: "var(--fs-sm)",
                color: "var(--t2)",
              }}
            >
              {status}
            </p>
          </>
        ) : onPay ? (
          <>
            {/* W9b — the way back, where the diner reaches for it. The pay step is a STATE change, not
                a route, so the browser Back button leaves /cart entirely (and strands the pay-window
                lock, freezing the table for everyone else until the TTL). Pushing a same-pathname
                history entry is NOT the fix: cart/page.tsx and track/page.tsx both document the ~4s
                view-transition popstate hang that causes on exactly this screen. The "Edit order"
                button at the foot of the pay form stays — this is the one above the fold, since the
                Payment Element is taller than a phone. Frozen while a confirm is in flight: releasing
                the lock then would open the cart under a live PaymentIntent. */}
            {/* `.nav-link` (the quiet 44px variant), NOT `.nav-link-strong`: that one is a FILLED accent
                pill, and a second filled CTA sitting above "Pay $X" would read as the primary action on
                the one screen where the primary action must be unmistakable. */}
            <button
              type="button"
              className="nav-link"
              aria-disabled={paying || leavingPay || undefined}
              aria-busy={leavingPay}
              onClick={() => {
                if (paying || leavingPay) return;
                setLeavingPay(true);
                void editOrder().finally(() => setLeavingPay(false));
              }}
              style={{
                background: "none",
                border: "none",
                marginBottom: 4,
                cursor: paying || leavingPay ? "default" : "pointer",
                opacity: paying || leavingPay ? 0.6 : 1,
              }}
            >
              <span aria-hidden className="nav-arrow nav-arrow-back">
                ←
              </span>{" "}
              {leavingPay ? "Going back…" : "Back to review"}
            </button>
            <div className="card card-textured checkout-receipt">
              {/* W21 (owner: "final pay total bill should organize dine-in and take-out items") —
                  the pay step used to show ONLY the totals: the diner confirmed a charge with no
                  itemization on the very screen that takes the card. Same grouped receipt rows as
                  the Bill moment (the cart is locked here, so these lines are the charged lines). */}
              <BillLines items={viewItems} isGroup={isGroup} splitContext={splitContext} />
              <dl style={{ borderTop: "1px solid var(--bd)", paddingTop: 6, marginTop: 8 }}>
                <Row k="rowSubtotal" cents={payTotals.subtotalCents} />
                {payTotals.promoCents > 0 && <Row k="rowPromo" cents={-payTotals.promoCents} />}
                {payTotals.rewardCents > 0 && <Row k="rowReward" cents={-payTotals.rewardCents} />}
                {/* M22 (Codex round 1, P1) — the shortfall has to be repeated HERE, not just on the
                    review step's RewardField. `payTotals` is re-derived after the cart lock, so a
                    peer edit or a void landing between the last review render and that locked read
                    can produce a shortfall — or grow one — that the diner has never seen, and this
                    screen is the last thing before the card confirmation. Derived from the same
                    authoritative totals the amount is minted from, never re-computed here. */}
                {rewardShortfallCents(payTotals) > 0 && (
                  <p style={rewardShortfallNote}>
                    {payTotals.rewardCents > 0
                      ? `Uses the whole reward — $${(rewardShortfallCents(payTotals) / 100).toFixed(2)} won’t apply to this order.`
                      : `Nothing here uses your reward — paying now spends all $${(rewardShortfallCents(payTotals) / 100).toFixed(2)} of it.`}
                    <span lang="my" style={{ display: "block" }}>
                      ဆုလက်ဆောင် အားလုံး သုံးသွားပါမယ်
                    </span>
                  </p>
                )}
                {/* The rate note only where tax was actually applied — "(10.5%)" beside $0.00 on a
                    fully-exempt basket would name a rate that touched nothing (review LOW). */}
                <Row
                  k="rowTax"
                  cents={payTotals.taxCents}
                  note={payTotals.taxCents > 0 ? TAX_NOTE : undefined}
                />
                {payTotals.tipCents > 0 && <Row k="rowTip" cents={payTotals.tipCents} />}
                <Row k="rowTotal" cents={payTotals.totalCents} strong roll />
              </dl>
            </div>
            <PaymentSection
              cartId={cartId}
              clientSecret={clientSecret}
              totals={payTotals}
              unsentCount={unsentQty}
              onEdit={editOrder}
              onPayingChange={setPaying}
            />
          </>
        ) : (
          <>
            {/* J3: the wait, narrated from real kitchen taps — shows only once something is with the
                kitchen, right where the mid-meal diner reviews the table's order. viewItems (not items)
                so a "Make it now" tap and the strip agree instantly; the menu link carries the session
                mode — a bare /menu defaults to scan-&-go and would orphan a dine-in dessert. */}
            {/* W9b — the v7.2 lockbar, on the screen the lock actually bites. `getCartView` has always
                known the cart was locked; this component never received it, so the diner's steppers just
                snapped back with no explanation (the menu's GuestList has shown this banner since P3.2 —
                the checkout was the gap). PLAIN visual, not a live region: the edge effect above pushes the
                transition through this view's one status region (the provider's announcer is mounted on
                /menu only), and the disabled controls carry the state for AT.
                J4 (residual) — it used to be gated on `lockedByPeer`, never bare `locked`, on the
                reasoning that the payer holds their own lock. True about the NAME, wrong about the
                bar: a self-held lock froze every write server-side while this bar stayed hidden, so
                the diner got the snap-back with no explanation that W9b existed to end. It now
                renders for every freeze via `freezeNotice`, which owns what each case may claim. */}
            {/* W12 — the way back from the Bill moment, mirroring the pay step's quiet `.nav-link`
                (never a second filled CTA above "Pay · $X"). A state flip, not a route — same
                pattern (and same rationale) as the pay step's own back control. */}
            {staged && stage === "bill" && (
              <button
                type="button"
                className="nav-link"
                onClick={() => flipStage("order")}
                style={{ background: "none", border: "none", marginBottom: 4, cursor: "pointer" }}
              >
                <span aria-hidden className="nav-arrow nav-arrow-back">
                  ←
                </span>{" "}
                {T("backToYourOrder")}
                <My k="backToYourOrder" inline color="var(--t3)" />
              </button>
            )}
            {/* J4 (residual) — the bar renders for EVERY freeze, not just a peer's. A self-held
                lock disables exactly as many controls, and a screen with no explanation for why it
                went read-only is the "silently no-ops" half of the row.

                The sentence comes from `freezeNotice`, which is where the copy rule lives: the self
                case must not borrow `superseded`'s vocabulary ("another tab took over"), because
                these three fields cannot prove a takeover — a declined card reaches a zero-row
                release with nobody having taken anything over (see `classifyZeroRow`).

                Only a SELF freeze gets the Reopen action. A peer's lock is not ours to release
                (`releasePayAttempt` is scoped to `locked_by = uid` and would match nothing), and
                offering a button that silently does nothing is the defect this row is about, one
                layer up. `held` gets no action either: we do not know the lock is ours. */}
            {freezeMessage && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  margin: "0 0 12px",
                  padding: "9px 13px",
                  borderRadius: 11,
                  background: "var(--warnb)",
                  color: "var(--warn)",
                  fontWeight: 700,
                  fontSize: "var(--fs-sm)",
                }}
              >
                <Icon name="lock" size={14} />
                <span>{freezeMessage}</span>
                {noticeFreeze === "self" && canRelease && (
                  <button
                    type="button"
                    onClick={() => {
                      // aria-disabled, not native `disabled` — the same rule this file states 180
                      // lines below for the stepper: natively disabling the control the user just
                      // activated drops focus to <body> mid-interaction (WCAG 2.4.3), and the
                      // focus-restore effect above only fires on the freeze EDGE, which this is
                      // not. The refusal lives here instead, where a keyboard Enter also lands.
                      if (reopening) return;
                      void reopenOrder();
                    }}
                    aria-disabled={reopening || undefined}
                    aria-busy={reopening}
                    style={{
                      marginInlineStart: "auto",
                      minHeight: 44,
                      padding: "0 12px",
                      borderRadius: 9,
                      border: "1px solid currentColor",
                      background: "transparent",
                      color: "inherit",
                      font: "inherit",
                      cursor: reopening ? "progress" : "pointer",
                      opacity: reopening ? 0.7 : 1,
                    }}
                  >
                    {reopening ? "Reopening…" : "Reopen the order"}
                  </button>
                )}
                {/* The re-read escape, for every freeze WITHOUT a Reopen — a peer's lock, an
                    unattributable one, and the tokenless self case (a second tab, or a landed
                    release whose refresh failed). It promises exactly what it does: ask the server
                    again. Never both buttons — Reopen already ends in `refresh()`. */}
                {!(noticeFreeze === "self" && canRelease) && (
                  <button
                    type="button"
                    onClick={() => {
                      // aria-disabled, not native — same WCAG 2.4.3 reason as the Reopen control.
                      if (recheckingLock) return;
                      void recheckLock();
                    }}
                    aria-disabled={recheckingLock || undefined}
                    aria-busy={recheckingLock}
                    style={{
                      marginInlineStart: "auto",
                      minHeight: 44,
                      padding: "0 12px",
                      borderRadius: 9,
                      border: "1px solid currentColor",
                      background: "transparent",
                      color: "inherit",
                      font: "inherit",
                      cursor: recheckingLock ? "progress" : "pointer",
                      opacity: recheckingLock ? 0.7 : 1,
                    }}
                  >
                    {recheckingLock ? "Checking…" : "Check again"}
                  </button>
                )}
              </div>
            )}
            {showLineCards && <TimelineStrip items={viewItems} menuMode={sessionMode} />}
            {/* W18 (owner: "Your order page needs page navigation buttons?") — the way back to
                adding food, ON the order view instead of only on the empty state. The EN label is
                mode-true (menu vs market vs door picker — menuLinkText, same rule as the empty
                state's CTA); `.nav-link` (quiet 44px), never a filled pill that would compete with
                Send/Pay below. Hidden while ANY pay-window lock has the cart frozen (J4 residual: a self-held
                lock froze the writes but not this link) — an invitation to add is the wrong sign on
                a cart that can't take one. */}
            {showLineCards && !editsFrozen && (
              <p style={{ margin: "2px 0 8px" }}>
                <Link href={menuHref(sessionMode)} className="nav-link">
                  <span aria-hidden className="nav-arrow nav-arrow-back">
                    ←
                  </span>{" "}
                  {menuLinkText(sessionMode, "browse")}
                  <My k="addMore" size="var(--fs-xs)" color="var(--t3)" />
                </Link>
              </p>
            )}
            {/* S4 unified basket: group lines by destination (At your table / To-go / Grocery). Headings
              show only when the basket actually spans 2+ destinations, so a plain dine-in cart stays clean.
              The renderLine body is the S2 per-line card + an S4 for-here/to-go toggle on editable food.
              W12: the EDITING surface — Order moment (and the unstaged classic screen) only; the Bill
              moment renders the same lines as read-only receipt rows instead. */}
            {(() => {
              if (!showLineCards) return null; // W12 — the Bill moment renders receipt rows instead
              // W21 — the labels live once (BILL_GROUPS): the editing cards, the Bill's receipt
              // rows, and the pay itemization all speak the same section names.
              const present = BILL_GROUPS.filter(([, k]) =>
                viewItems.some((i) => i.fulfillment === k),
              );
              const showHeadings = present.length > 1;
              const renderLine = (i: CartItem) => {
                // `canEdit` stays the PERMISSION (state × role); the lock is a separate, transient
                // refusal. Keeping them apart is what lets a locked control stay RENDERED and disabled
                // instead of vanishing — a missing control is the red-team trap this repo names by
                // name, and the pills below are gated on `canEdit &&`.
                const canEdit = canMutateLine(i.lineState, {
                  kind: "diner",
                  role: splitContext?.myRole ?? "host",
                  isOwner: i.bySeat === splitContext?.mySeat,
                });
                const owner = isGroup
                  ? splitContext!.members.find((m) => m.seat === i.bySeat)
                  : undefined;
                return (
                  <li
                    key={i.id}
                    className="card card-textured checkout-line"
                    style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}
                  >
                    {/* W13 — the v7.2 50px line thumb (.crow .ph). The slot ALWAYS renders: a
                        missing/refused URL falls to the designed PhotoPlaceholder, never a hole.
                        Decorative (the name is the accessible content) — alt="" via the fallback. */}
                    <span className="checkout-line-thumb" aria-hidden="true">
                      <BlurUpImage
                        src={i.imageUrl ?? null}
                        alt=""
                        width={50}
                        height={50}
                        sizes="50px"
                        fallback={
                          <PhotoPlaceholder
                            variant="thumb"
                            icon={i.fulfillment === "grocery" ? "cat-grocery" : "cat-dish"}
                          />
                        }
                      />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{i.name}</div>
                      {/* W13 — the Burmese name: the post-add path speaks both tongues (100%
                          name_my coverage; lang="my" for WCAG 3.1.2 + the Padauk stack). */}
                      {i.nameMy && (
                        <div
                          lang="my"
                          style={{
                            fontFamily: "var(--font-my)",
                            fontSize: "var(--fs-sm)",
                            color: "var(--t2)",
                          }}
                        >
                          {i.nameMy}
                        </div>
                      )}
                      {i.modifiers.length > 0 && (
                        <div style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
                          {i.modifiers.join(", ")}
                        </div>
                      )}
                      {/* W3b: the diner's own kitchen note — visible so it's verifiable (a safety
                          channel can't be write-only), and so a noted line reads apart from an
                          identical plain sibling (the two never merge). Full text color: allergy-
                          adjacent, never muted. Read-only — remove/re-add to change it. */}
                      {i.notes && (
                        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginTop: 2 }}>
                          “{i.notes}”
                        </div>
                      )}
                      {owner && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 4,
                            fontSize: "var(--fs-sm)",
                            color: "var(--t2)",
                          }}
                        >
                          <Avatar
                            initial={seatInitial(owner.name)}
                            color={seatColor(owner.seat)}
                            size="sm"
                          />
                          {owner.seat === splitContext!.mySeat ? "You" : owner.name}
                        </div>
                      )}
                      <div
                        style={{
                          fontWeight: 700,
                          marginTop: 4,
                          fontVariantNumeric: "tabular-nums",
                          textDecoration:
                            i.comped || i.lineState === "voided" ? "line-through" : "none",
                          color: i.comped || i.lineState === "voided" ? "var(--t3)" : "inherit",
                        }}
                      >
                        {/* Rolls as the optimistic qty changes the line price (presentation only — unit
                          price is server-derived). Static for comped/voided lines (their qty can't change). */}
                        <NumberFlow
                          value={(i.unitPriceCents * i.qty) / 100}
                          format={{ style: "currency", currency: "USD" }}
                        />
                      </div>
                      {/* For-here / To-go (S4): food only, draft + editable. Grocery routing is fixed. The
                        server recomputes per-line tax (cold food flips taxability) — the toggle is optimistic
                        (instant re-group), reconciled on refresh. Unified `.checkout-pill` segmented control. */}
                      {isDineIn &&
                        i.fulfillment !== "grocery" &&
                        i.lineState === "draft" &&
                        canEdit && (
                          <div
                            role="group"
                            aria-label={`Where ${i.name} goes`}
                            className="checkout-pill-row"
                            style={{ marginTop: 8 }}
                          >
                            {(["dinein", "togo"] as const).map((f) => {
                              const on = i.fulfillment === f;
                              return (
                                <button
                                  key={f}
                                  type="button"
                                  data-ful-line={i.id}
                                  data-ful-val={f}
                                  aria-pressed={on}
                                  // aria-disabled, not native: a peer can take the lock while this
                                  // very button holds focus, and native-disabling would drop it to
                                  // <body> mid-interaction (WCAG 2.4.3).
                                  aria-disabled={editsFrozen || undefined}
                                  onClick={() => {
                                    if (editsFrozen) return;
                                    toggleFulfillment(i.id, f);
                                  }}
                                  className={`checkout-pill${on ? " checkout-pill-on" : ""}`}
                                  style={editsFrozen ? { opacity: 0.55 } : undefined}
                                >
                                  {f === "dinein" ? "For here" : "To go"}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      {/* Make it now (S4.2): a to-go food line waits for checkout by default; this fires it to
                        the kitchen early. Draft + editable + togo only (a dinein line fires via Send to
                        kitchen; grocery never fires). Optimistic; the server gates it, refused → no-ops on
                        refresh. Accent-outline action pill. */}
                      {isDineIn &&
                        i.fulfillment === "togo" &&
                        i.lineState === "draft" &&
                        canEdit && (
                          <button
                            type="button"
                            aria-disabled={editsFrozen || undefined}
                            onClick={() => {
                              if (editsFrozen) return;
                              makeNow(i.id);
                            }}
                            className="checkout-pill checkout-pill-accent"
                            style={{
                              display: "flex",
                              width: "100%",
                              marginTop: 8,
                              ...(editsFrozen ? { opacity: 0.55 } : null),
                            }}
                          >
                            {/* W19 — "Send" names what the tap really is (a per-line kitchen
                                commit, same vocabulary as the batch CTA and the "Sent to kitchen"
                                chip this button becomes); "usually" hedges the config estimate. */}
                            Send to kitchen now · usually ~{prepMinutes} min
                          </button>
                        )}
                    </div>
                    {i.comped ? (
                      <LineStateChip state={i.lineState} comped />
                    ) : i.lineState === "draft" ? (
                      <Stepper
                        qty={i.qty}
                        // The shared Stepper natively-disables (packages/ui). That is right here: its
                        // buttons are inside a card the lockbar sits above, and the focus-restore
                        // effect parks focus on the heading if this flip drops it to <body>.
                        disabled={!canEdit || editsFrozen}
                        soldOut={i.soldOut}
                        name={i.name}
                        removeGlyph={<Icon name="trash" size={18} />}
                        showCount
                        incrementLabel={`Add another ${i.name}`}
                        onChange={(q) => changeQty(i.id, q)}
                      />
                    ) : (
                      <LineStateChip state={i.lineState} comped={false} />
                    )}
                  </li>
                );
              };
              return present.map(([label, key]) => (
                <section key={key} aria-label={label} style={{ margin: "12px 0" }}>
                  {showHeadings && (
                    <h3
                      style={{
                        fontSize: "var(--fs-sm)",
                        fontWeight: 800,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                        color: "var(--t2)",
                        margin: "0 0 8px",
                      }}
                    >
                      {label}
                    </h3>
                  )}
                  {/* S4.2: to-go food is made fresh at checkout (not fired with the dine-in batch). Honest,
                    config-driven estimate — shown only while a to-go line is still waiting (draft).
                    W9a — NOT on a PICKUP cart. A pickup cart's lines are also `togo`, so this rendered
                    there too: it announced "ready in about 12 min" on an order the diner was about to
                    schedule for tomorrow evening, four sections above the "When would you like it?"
                    control that actually decides the time — and it pointed at "Make it now," which
                    pickup carts no longer show. On pickup, `PickupWhenChoice` is the SINGLE owner of
                    the timing promise (it holds the live ASAP⇆scheduled state; this paragraph only
                    sees the server-seeded value and would go stale the moment the diner switched).
                    It DOES stay on scango, which has no PickupWhenChoice to replace it — pre-W5f the
                    To-go/"Now" door minted scango sessions, so those carts really can carry hot food
                    and this is their only prep estimate. The "Make it now" sentence is dine-in only,
                    since that is the only mode still rendering the control it names. */}
                  {key === "togo" &&
                    (isDineIn || sessionMode === "scango") &&
                    viewItems.some((i) => i.fulfillment === "togo" && i.lineState === "draft") && (
                      <p
                        style={{
                          fontSize: "var(--fs-sm)",
                          color: "var(--t2)",
                          margin: "0 0 8px",
                        }}
                      >
                        Made fresh when you check out — usually ready in about {prepMinutes} min.
                        {/* Names the control VERBATIM — moves with the button label (W19). */}
                        {isDineIn ? " Want it sooner? Tap “Send to kitchen now.”" : ""}
                      </p>
                    )}
                  <ul
                    role="list"
                    style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}
                  >
                    {viewItems.filter((i) => i.fulfillment === key).map(renderLine)}
                  </ul>
                </section>
              ));
            })()}

            {/* W19 — the forgot-to-send notice (owner: "What if customers forget to send items to
                kitchen and move forward to pay?"). A NUDGE, never a block: paying-with-drafts is a
                supported flow (mms_fire_pending_food fires every still-draft food line the moment
                payment lands — money is safe, timing is the surprise). The host gets the way back;
                a guest cannot send, so for them the sentence alone is the honest whole story.
                Plain content, not a live region — this view keeps its one. */}
            {staged && stage === "bill" && unsentQty > 0 && (
              <div className="card checkout-unsent-note mms-rise">
                <p style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                  {unsentQty === 1
                    ? "1 item hasn’t gone to the kitchen yet"
                    : `${unsentQty} items haven’t gone to the kitchen yet`}
                  <span
                    style={{
                      display: "block",
                      fontWeight: 400,
                      color: "var(--t2)",
                      marginTop: 2,
                    }}
                  >
                    {canSendToKitchen
                      ? "Send them now, or pay — they’ll be sent the moment you do."
                      : "They’ll be sent to the kitchen the moment you pay."}
                  </span>
                  <span
                    lang="my"
                    style={{
                      display: "block",
                      fontWeight: 400,
                      fontSize: "var(--fs-xs)",
                      color: "var(--t3)",
                      marginTop: 2,
                    }}
                  >
                    မပို့ရသေးတဲ့ ဟင်းတွေ — ငွေရှင်းပြီးတာနဲ့ မီးဖိုချောင်ဆီ ရောက်သွားပါမယ်နော်
                  </span>
                </p>
                {canSendToKitchen && (
                  <button
                    type="button"
                    className="nav-link"
                    style={{ marginTop: 4 }}
                    onClick={() => flipStage("order")}
                  >
                    <span aria-hidden className="nav-arrow nav-arrow-back">
                      ←
                    </span>{" "}
                    Back to send them
                  </button>
                )}
              </div>
            )}
            {/* W12 — the Bill moment's lines: the same viewItems as read-only RECEIPT rows inside the
                textured slip (qty × name · dotted leader · amount), with the kitchen state, the note,
                the owner, and the comped/voided treatment carried over from the cards. Editing lives
                one tap back on the Order moment — a bill you can quietly read is the point. */}
            {staged && stage === "bill" && (
              <div className="card card-textured checkout-receipt">
                {/* W21 — grouped by destination (BillLines): "At your table" vs "To-go" vs
                    "Grocery", headings only when the basket really spans 2+. */}
                <BillLines items={viewItems} isGroup={isGroup} splitContext={splitContext} />
                <dl style={{ borderTop: "1px solid var(--bd)", paddingTop: 6, marginTop: 8 }}>
                  <Row k="rowSubtotal" cents={totals.subtotalCents} />
                  {totals.promoCents > 0 && <Row k="rowPromo" cents={-totals.promoCents} />}
                  {totals.rewardCents > 0 && <Row k="rowReward" cents={-totals.rewardCents} />}
                  <Row
                    k="rowTax"
                    cents={totals.taxCents}
                    note={totals.taxCents > 0 ? TAX_NOTE : undefined}
                  />
                </dl>
              </div>
            )}

            {showPayFurniture && isGroup && splitContext && (
              <SplitSection
                cartId={cartId}
                items={viewItems}
                totalCents={totals.totalCents}
                ctx={splitContext}
                onChanged={refresh}
                onStatus={setStatus}
                // T9 — reassignment is a cart mutation (`assignLine`), so it takes the same gate as
                // every other edit on this screen. The shares themselves keep rendering: they are
                // derived from server-authoritative totals and stay true while the cart is frozen.
                frozen={editsFrozen}
              />
            )}

            {showPayFurniture && (
              <form onSubmit={onPromo} style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  // A placeholder can't carry two lang attributes — the one-line bilingual string
                  // is the W16b convention for plain-text slots (aria-label stays fixed EN).
                  placeholder={`${T("promoCode")} · ${t("my", "promoCode")}`}
                  // ⚠️ THE NAME COMES FROM `freezeMessage`, NOT `lockedByName` (Codex P2 on #246).
                  // `lockedByName` is populated for a PEER only, by design — so widening this
                  // condition to `editsFrozen` made a screen reader announce the read-only promo
                  // field as "Promo code — null is checking out" on every self/held freeze. The
                  // notice already owns what each case may claim; the label reuses it rather than
                  // re-deriving a sentence from a field that is null for two of the three states.
                  aria-label={
                    editsFrozen && freezeMessage
                      ? `${T("promoCode")} — ${freezeMessage}`
                      : T("promoCode")
                  }
                  readOnly={editsFrozen}
                  autoCapitalize="characters"
                  maxLength={40}
                  className="checkout-promo-input"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    // M126 (Codex #238 P2) — the fill lives in `.checkout-promo-input` so the
                    // --sunken well can apply; an inline background outranks the class, which is
                    // why the well was invisible at all three of these call sites. Same reason the
                    // border already lives in the class (so :focus-visible can recolor it).
                    color: "var(--tx)",
                  }}
                />
                <button
                  type="submit"
                  disabled={pending || !promo.trim()}
                  aria-disabled={editsFrozen || undefined}
                  className="checkout-pill checkout-pill-accent"
                  // `.checkout-pill` is inline-FLEX (row): a block MY line would land BESIDE "Apply"
                  // and blow out the 320px promo row — column stacks it under, as intended.
                  style={{
                    minHeight: 44,
                    flexDirection: "column",
                    lineHeight: 1.15,
                    ...(editsFrozen ? { opacity: 0.55 } : null),
                  }}
                >
                  {T("applyPromo")}
                  <My k="applyPromo" />
                </button>
              </form>
            )}

            {/* Redeem a Morning Star reward (M4 P4.2) — renders only if the diner has coupons; the discount
              is server-authoritative (rides getCartTotals). Refreshes the breakdown on apply/remove. */}
            {showPayFurniture && (
              <RewardField
                cartId={cartId}
                appliedRewardCents={totals.rewardCents}
                rewardShortfallCents={rewardShortfallCents(totals)}
                // T9 — the child gets the freeze FACT and nothing else. `editsFrozen` mirrors
                // `cart.ts`'s bare `locked`, which is exactly what `applyReward`/`clearReward`
                // refuse on, so the gate cannot be wider than the server's.
                //
                // ⚠️ IT DOES NOT GET THE SENTENCE. An earlier draft also passed `freezeMessage`
                // "so a refusal in there cannot drift from the explanation out here", and that was
                // backwards: `freezeMessage` rides the SUPPRESSED freeze while `editsFrozen` rides
                // the RAW one, so the pair `frozen && note === null` is reachable — precisely
                // during THIS viewer's own create-intent — and the child's `??` fallback then said
                // "Someone's checking out" about the reader. Each child names its own control
                // instead: true under every freeze, and a different string from the bar, so the
                // live region actually changes and announces.
                frozen={editsFrozen}
                // `refresh` now answers whether the read landed (Codex round 5); this prop wants a
                // void callback, and the answer is not this child's business.
                onChanged={() => void refresh()}
              />
            )}

            {/* W5e: the pickup timing choice — ASAP (fire now, ready ~prep min) ⇆ a scheduled slot.
                Pickup only (scango is self-scanned grocery, no kitchen fire to schedule). Errors route
                into the single review-step live region below via onStatus. */}
            {isPickupMode && (
              <PickupWhenChoice
                cartId={cartId}
                prepMinutes={prepMinutes}
                slot={pickupSlot}
                onSlotChange={setPickupSlot}
                asapAvailable={asapAvailable}
                onStatus={setStatus}
                // W20 review — a refused write recovers by RE-READING server truth (refresh()
                // re-seeds pickupSlot via normalizePickupSlot), never by restoring a captured prev.
                onRevert={() => void refresh()}
                writesRef={pickupWrites}
                // T9 — `setPickupAsap`/`setPickupSlot` refuse on bare `locked` like every other
                // mutation, so the pills take the same gate. Timing is fulfillment metadata, never
                // a price, so this changes no amount — it stops offering a tap already decided.
                frozen={editsFrozen}
              />
            )}

            {/* W3e: the takeout call-out name — one optional field, so the expo and the ready board
                can call "Aye Aye" instead of a hex code. Never shown for dine-in (the table is the
                identity); never required (the short order code is the fallback).
                W9a — and never on a PURE-GROCERY basket: a scan-&-go shopper is standing in the aisle
                holding the bag they already scanned. There is no counter handoff to name, so asking
                for a "First name for pickup" and promising "we'll call your name when your order's up"
                described an event that will never happen. (`pureGrocery` is stable for a scango
                session — every line is scanned retail — so this gate can't unmount a focused field
                mid-edit; a mixed basket only exists on a dine-in table, where `isTakeout` is false.) */}
            {isTakeout && !pureGrocery && (
              <div style={{ margin: "12px 0" }}>
                <label
                  htmlFor="pickup-name"
                  style={{
                    display: "block",
                    fontWeight: 700,
                    fontSize: "var(--fs-sm)",
                    marginBottom: 4,
                  }}
                >
                  First name for pickup{" "}
                  <span style={{ fontWeight: 600, color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
                    {/* W21 — pickup REQUIRES the contact (create-intent refuses without it);
                        scango keeps the optional call-out. */}
                    {isPickupMode ? "Required" : "Optional"}
                  </span>
                </label>
                <input
                  ref={pickupNameRef}
                  id="pickup-name"
                  type="text"
                  value={firstName}
                  maxLength={40}
                  autoComplete="given-name"
                  placeholder="e.g. Aye Aye"
                  required={isPickupMode || undefined}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="checkout-promo-input"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    // M126 (Codex #238 P2) — the fill lives in `.checkout-promo-input` so the
                    // --sunken well can apply; an inline background outranks the class, which is
                    // why the well was invisible at all three of these call sites. Same reason the
                    // border already lives in the class (so :focus-visible can recolor it).
                    color: "var(--tx)",
                  }}
                />
                {/* No board promise here — the ready TV is opt-in config (BOARD_DEVICE_TOKEN);
                    only promise what every store setup keeps (adversarial LOW-6). */}
                <p style={{ margin: "4px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
                  We’ll call your name when your order’s up.
                </p>
                {isPickupMode && (
                  <div style={{ marginTop: 10 }}>
                    <label
                      htmlFor="pickup-phone"
                      style={{
                        display: "block",
                        fontWeight: 700,
                        fontSize: "var(--fs-sm)",
                        marginBottom: 4,
                      }}
                    >
                      Phone number{" "}
                      <span
                        style={{ fontWeight: 600, color: "var(--t3)", fontSize: "var(--fs-sm)" }}
                      >
                        Required
                      </span>
                    </label>
                    <input
                      ref={pickupPhoneRef}
                      id="pickup-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      maxLength={20}
                      autoComplete="tel"
                      placeholder="e.g. (626) 555-0142"
                      required
                      onChange={(e) => setPhone(e.target.value)}
                      className="checkout-promo-input"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "var(--r-sm)",
                        // M126 (Codex #238 P2) — see the note above: the fill belongs to the class.
                        color: "var(--tx)",
                      }}
                    />
                    {/* Honest scope — one order, no marketing (PII stays on the cart, never
                        analytics). */}
                    <p style={{ margin: "4px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
                      Only if we need to reach you about this order.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* W2d — fees BEFORE the tip ask. The diner sees every charge (tax — W16a retired the
                service charge) BEFORE deciding a tip, so the tip is never stacked on a surprise fee
                (surprise fees are the #1 benchmark complaint). The tip-inclusive total lands below
                the ask. All figures stay server-authoritative (the tip preview is a hint reconciled
                at create-intent).
                W12: unstaged (pickup/scango) only — the Bill moment folds this breakdown into its
                receipt slip above, under the line rows. */}
            {!staged && (
              <div className="card card-textured checkout-receipt">
                <dl>
                  <Row k="rowSubtotal" cents={totals.subtotalCents} />
                  {totals.promoCents > 0 && <Row k="rowPromo" cents={-totals.promoCents} />}
                  {totals.rewardCents > 0 && <Row k="rowReward" cents={-totals.rewardCents} />}
                  <Row
                    k="rowTax"
                    cents={totals.taxCents}
                    note={totals.taxCents > 0 ? TAX_NOTE : undefined}
                  />
                </dl>
              </div>
            )}

            {/* Tip selector (server confirms the exact tip at create-intent) — now AFTER the fee
                breakdown (W2d). Presets + a Custom chip (W2d): tapping Custom reveals a dollar field;
                the amount rides as a rate (customCents / net) so the server path is identical. Hidden on
                a pure-grocery basket — self-scanned retail is not table service (W1). */}
            {showPayFurniture && !pureGrocery && (
              <>
                {/* W9e — the prototype's visible tip heading, restored verbatim (v7.2.html:418):
                    the ask had no visible label, and the group's aria-label meant accessible name
                    and visible name could never match (QA §A). The fee breakdown deliberately stays
                    ABOVE this ask — moving it below would re-open the F9 double-ask arm W2d closed
                    (see the fees-before-tip comment). */}
                {/* --fs-h3 (17), not the prototype's raw 15px — copy verbatim, size from the scale. */}
                <h3 id="tip-h" style={{ fontSize: "var(--fs-h3)", margin: "16px 0 2px" }}>
                  {T("addATip")}
                  <My k="addATip" size="var(--fs-sm)" />
                </h3>
                {/* W18 (owner: "tip ask should be fun and encourage!") — say where it goes, warmly.
                    TRUE for this surface: a phone payment's tip lands in the shared team bucket
                    (W17c-4). Plain text, not a live region — ambient, said once. */}
                <p style={{ margin: "0 0 8px", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
                  {T("tipGoesToTeam")}
                  <My k="tipGoesToTeam" color="var(--t3)" />
                </p>
                {/* W16b — the tip CHIPS stay EN-only by design (the one deliberate exception): five
                    chips already share a 320px row, each with a preview subline; the bilingual
                    heading above carries MY for the whole labelled group. */}
                <div
                  role="group"
                  aria-labelledby="tip-h"
                  style={{ display: "flex", gap: 8, margin: "0 0 4px" }}
                >
                  {presetChips.map(([label, rate], chipIdx) => {
                    const on = !customTipOpen && tipRate === rate;
                    const previewCents = tipPreview(rate);
                    // W18 — "None" sits LAST and QUIET (owner: "none is not encouraged lol"): same
                    // tap target, same honesty, muted ink and no bold — an exit, not an offer.
                    const isNone = rate === 0;
                    return (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={payFrozen || undefined}
                        onClick={() => {
                          if (payFrozen) return;
                          selectPresetTip(rate);
                        }}
                        // W19 — the ladder WARMS as it climbs (checkout-tip-heat reads --tip-heat):
                        // 15% is barely gilded, 30% glows — the encouragement is the gradient, not
                        // a nag. Selection lights the full gold cap (checkout-tip-on) — EXCEPT on
                        // None (W21d, Codex P2 on #189): tipRate initializes to 0, so the zero
                        // chip is "on" before the diner has answered anything, and the gold cap
                        // presented the unanswered state as a promoted choice. None stays QUIET
                        // even when pressed (aria-pressed keeps the truth for AT); a subtle ink
                        // lift marks it without celebrating it.
                        className={`checkout-tip${on && !isNone ? " checkout-tip-on" : ""}${
                          !on && !isNone ? " checkout-tip-heat" : ""
                        }`}
                        style={{
                          ...tipChipStyle(),
                          ...(isNone
                            ? { color: on ? "var(--t2)" : "var(--t3)", fontWeight: on ? 700 : 600 }
                            : null),
                          ...(payFrozen ? { opacity: 0.55 } : null),
                          ...({ "--tip-heat": chipIdx } as CSSProperties),
                        }}
                      >
                        {isNone ? T("noTip") : label}
                        {/* Keyed on the preview so a change POPS the amount (RM-gated via mmsPop). */}
                        <small key={previewCents} className="mms-pop" style={tipChipSmall(on)}>
                          {rate ? `$${(previewCents / 100).toFixed(2)}` : "—"}
                        </small>
                      </button>
                    );
                  })}
                  {/* Custom chip — reveals the dollar field; "on" while it's open. */}
                  <button
                    type="button"
                    aria-pressed={customTipOpen}
                    aria-expanded={customTipOpen}
                    // Only reference the field while it's mounted (below) — no dangling IDREF when closed.
                    aria-controls={customTipOpen ? "custom-tip-field" : undefined}
                    aria-disabled={payFrozen || undefined}
                    onClick={() => {
                      if (payFrozen) return;
                      openCustomTip();
                    }}
                    className={`checkout-tip${customTipOpen ? " checkout-tip-on" : ""}`}
                    style={{
                      ...tipChipStyle(),
                      ...(payFrozen ? { opacity: 0.55 } : null),
                    }}
                  >
                    {T("customTip")}
                    <small style={tipChipSmall(customTipOpen)}>
                      {customTipOpen && tipPreviewCents > 0
                        ? `$${(tipPreviewCents / 100).toFixed(2)}`
                        : "—"}
                    </small>
                  </button>
                </div>
                {/* W18 — a thank-you the moment a tip is on. Ambient plain text (never a live
                    region — this view keeps its one), true only while the charge will carry it. */}
                {(() => {
                  // W20 (owner: "texts change with % selections") — the reaction is DERIVED from
                  // the effective rate (lib/tip.ts tipReaction, pure + pinned), keyed on its text
                  // so each rung's line rises in fresh (.mms-rise, RM-gated). None gets nothing —
                  // declining is never met with a reaction.
                  const reaction =
                    tipPreviewCents > 0 ? tipReaction(effectiveTipRate, customTipOpen) : null;
                  return (
                    reaction && (
                      <p
                        key={reaction.en}
                        className="mms-rise"
                        style={{
                          margin: "0 0 4px",
                          fontSize: "var(--fs-sm)",
                          color: "var(--ac-strong)",
                          fontWeight: 600,
                        }}
                      >
                        <span aria-hidden>✦ </span>
                        {reaction.en}
                        <span
                          lang="my"
                          style={{
                            display: "block",
                            fontSize: "var(--fs-xs)",
                            color: "var(--ac-strong)",
                          }}
                        >
                          {reaction.my}
                        </span>
                      </p>
                    )
                  );
                })()}
                {customTipOpen && (
                  <div id="custom-tip-field" style={{ margin: "2px 0 4px" }}>
                    <div style={customTipWrap}>
                      <span aria-hidden style={{ fontWeight: 800, color: "var(--t2)" }}>
                        $
                      </span>
                      <input
                        ref={customTipRef}
                        inputMode="decimal"
                        aria-label="Custom tip amount in dollars"
                        aria-describedby={
                          parseFloat(customTip) * 100 >
                          Math.min(TIP_AMOUNT_MAX_CENTS, 4000 * tipNet)
                            ? "custom-tip-cap"
                            : undefined
                        }
                        value={customTip}
                        onChange={(e) => onCustomTipChange(e.target.value)}
                        placeholder="0.00"
                        style={{
                          flex: 1,
                          border: "none",
                          background: "transparent",
                          color: "var(--tx)",
                          fontWeight: 800,
                          outline: "none",
                          minWidth: 0,
                        }}
                      />
                    </div>
                    {/* W19 (owner: "no limit to custom or capped amount") — the 100%-of-order clamp
                        is GONE: tip any amount up to the house's $1,000 ceiling (the cash tip's own
                        bound). The line appears only past $1,000, still gratitude-first — the bound
                        must stay spoken because silently charging less than typed is a wrong
                        number. */}
                    {(() => {
                      // W21d (Codex P2 on #190) — the honest ceiling is the LOWER of the $1,000
                      // house cap and the transport rail's 4000·net (a flat promo can legally
                      // crush net below 25¢). The clamp already charges at most this; the line
                      // must SAY so, or a typed $100 on a promo-crushed basket silently becomes
                      // a smaller charge with the input still reading $100.
                      const effectiveCapCents = Math.min(TIP_AMOUNT_MAX_CENTS, 4000 * tipNet);
                      if (!(parseFloat(customTip) * 100 > effectiveCapCents)) return null;
                      return (
                        <p
                          id="custom-tip-cap"
                          style={{
                            margin: "4px 2px 0",
                            fontSize: "var(--fs-sm)",
                            color: "var(--t3)",
                          }}
                        >
                          Wow — thank you! ${(effectiveCapCents / 100).toFixed(2)} is the most we
                          can take on this order.
                        </p>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {/* The tip-inclusive total lands below the ask — it rolls as the tip changes (R7a). A
                standalone grand-total bar (not a second receipt card) so the total reads as the hero
                figure; the tip is folded into a subline. `.vt-cart-total` makes THIS the single
                cart-total morph target (J1). Presentation only — the charge stays server-authoritative. */}
            {showPayFurniture && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--bd)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: "var(--fs-body)" }}>
                    {tipPreviewCents > 0 ? T("estimatedTotal") : T("rowTotal")}
                    <My k={tipPreviewCents > 0 ? "estimatedTotal" : "rowTotal"} color="var(--t3)" />
                  </div>
                  {tipPreviewCents > 0 && (
                    <div style={{ fontSize: "var(--fs-sm)", color: "var(--t3)", marginTop: 1 }}>
                      includes ${(tipPreviewCents / 100).toFixed(2)} tip
                    </div>
                  )}
                </div>
                <span
                  className="vt-cart-total"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--fs-h2)",
                    fontWeight: 800,
                  }}
                >
                  <NumberFlow
                    value={(totals.totalCents + tipPreviewCents) / 100}
                    format={{ style: "currency", currency: "USD" }}
                  />
                </span>
              </div>
            )}

            {/* W12 — the Order moment's primary verb: SEND. Promoted from its old secondary outline
                slot to the filled CTA (the moment owns one hero action); the undo-grace machinery
                rides along unchanged inside the component. */}
            {showLineCards && canSendToKitchen && viewItems.length > 0 && (
              // onChanged re-syncs the cart after a send (steppers → chips) or an undo (chips → steppers),
              // since solo dine-in isn't on the group realtime channel.
              <SendToKitchenButton
                cartId={cartId}
                hasDraft={kitchenDraftQty > 0}
                draftCount={kitchenDraftQty}
                primary
                onUndoWindowChange={setUndoOpen}
                onChanged={refresh}
                // T9 — `sendToKitchen` and `undoFire` both refuse on bare `locked`. Gating UNDO
                // looks like taking something away, and isn't: `undoFire` refuses under the same
                // predicate, so a freeze has already removed it server-side. The component keeps
                // the undo WINDOW open rather than closing it, so it returns the moment the lock
                // lifts (see its docblock).
                frozen={editsFrozen}
              />
            )}

            {/* W12 — the Order moment's quiet door to the Pay moment: the live bill total, always
                visible, never dominating. Promoted to the filled CTA once everything is with the
                kitchen (the ordering verb is spent — viewing the bill IS the next thing). */}
            {staged && stage === "order" && (
              // Promotes to the filled hero only once the kitchen verb is genuinely spent AND the
              // undo grace has passed (review MED: a filled bar beside "Undo — Ns" made forfeiting
              // the undo the visual hero). The amount includes any tip already dialed on the Bill
              // (review LOW: tip-exclusive here made the price jump between two adjacent taps).
              <button
                type="button"
                aria-disabled={undoOpen || undefined}
                onClick={() => {
                  if (undoOpen) {
                    setPayError(null);
                    setStatus("Hold on — you can still undo that send for a few seconds.");
                    return;
                  }
                  flipStage("bill");
                }}
                className={
                  kitchenDraftQty === 0 && !undoOpen ? "checkout-cta" : "checkout-viewbill"
                }
                style={{
                  width: "100%",
                  marginTop: 12,
                  minHeight: 50,
                  borderRadius: 12,
                  border: kitchenDraftQty === 0 && !undoOpen ? "none" : undefined,
                  fontWeight: 800,
                  fontSize: "var(--fs-body)",
                  cursor: undoOpen ? "default" : "pointer",
                  opacity: undoOpen ? 0.55 : 1,
                }}
              >
                <span style={{ position: "relative", zIndex: 1 }}>
                  {T("viewBillAndPay")} ·{" "}
                  <NumberFlow
                    value={(totals.totalCents + tipPreviewCents) / 100}
                    format={{ style: "currency", currency: "USD" }}
                  />
                  <span aria-hidden className="checkout-cta-arrow">
                    →
                  </span>
                  {/* W16b — the MY line rides under the EN+amount line; the $ amount stays on the
                      EN line only (the Latin-digits money rule). */}
                  <My k="viewBillAndPay" color="inherit" />
                  {/* W19 — the unsent state is VISIBLE before the flip, not discovered after. */}
                  {unsentQty > 0 && (
                    <span
                      style={{
                        display: "block",
                        fontWeight: 600,
                        fontSize: "var(--fs-xs)",
                        color: "inherit",
                        opacity: 0.8,
                      }}
                    >
                      {unsentQty} {unsentQty === 1 ? "item" : "items"} not sent yet
                    </span>
                  )}
                </span>
              </button>
            )}

            {/* W9b — the primary CTA is a dead control under a peer's lock: `create-intent` refuses
                with 409 because the lock is exactly the mutex that stops two diners paying at once. It
                stays RENDERED and says so, rather than sending the diner into a failure to find out. */}
            {showPayFurniture && (
              <button
                type="button"
                aria-disabled={payFrozen || undefined}
                onClick={() => {
                  if (payFrozen) return;
                  void continueToPayment();
                }}
                disabled={loadingPay}
                aria-busy={loadingPay}
                className="checkout-cta"
                style={{
                  width: "100%",
                  marginTop: 12,
                  minHeight: 50,
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 800,
                  fontSize: "var(--fs-body)",
                  cursor: loadingPay || payFrozen ? "default" : "pointer",
                  opacity: loadingPay ? 0.7 : payFrozen ? 0.55 : 1,
                }}
              >
                {/* The label rides above the ::after shine sweep on its own relative layer. W2d: the CTA
                  carries the amount (fees are visible above it) — and for a GROUP it says "Pay the whole
                  order · $X", elevating the honesty caveat (a guest who read "your share" isn't surprised
                  by the full charge). The amount is the server-reconciled estimate; the pay step confirms. */}
                <span style={{ position: "relative", zIndex: 1 }}>
                  {loadingPay ? (
                    "Starting checkout…"
                  ) : payFrozen ? (
                    `Waiting for ${lockedByName} to finish`
                  ) : (
                    <>
                      {isGroup
                        ? `${T("payWholeOrder")} · ${ctaTotal}`
                        : `${T("pay")} · ${ctaTotal}`}
                      <span aria-hidden className="checkout-cta-arrow">
                        →
                      </span>
                      {/* W16b — MY line under the EN+amount line (amount stays Latin, EN line only). */}
                      <My k={isGroup ? "payWholeOrder" : "pay"} color="inherit" />
                    </>
                  )}
                </span>
              </button>
            )}

            {/* W12 — the ONE quiet card-on-file line (S3.2's machinery, reframed as a benefit, not a
                settlement model): the tab is a state, not a choice — the only diner affordance left
                is saving a card so leaving is effortless. Bill moment only; hidden once secured.
                Every dollar of the close still flows through the same settle paths. */}
            {staged && stage === "bill" && canTab && tabType !== "secure" && (
              <>
                {/* W19 — a visual break from the Pay CTA above (owner: "Save a card option seems
                    confusing"): sitting directly under "Pay · $X" it read as a save-my-card
                    checkout convenience. The kicker frames it as the OTHER path — the tab. */}
                <p
                  style={{
                    margin: "14px 0 4px",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--t3)",
                  }}
                >
                  Not paying yet?
                </p>
                <SecureTabButton cartId={cartId} onSecured={refresh} />
              </>
            )}
            {showPayFurniture && tabType === "secure" && (
              <p
                style={{
                  ...tabNote,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Icon name="check" size={15} />
                Card on file — pay here anytime, or just leave and we’ll close your bill.
              </p>
            )}

            {showPayFurniture && isGroup && (
              // Honesty (P3.3a): the CTA above now carries "Pay the whole order · $X" (W2d), so this
              // just clarifies what the split rows are for. Bumped off 11.5px (F9 — too small for a
              // trust-critical line). Per-card share payment is P3.3b — stated as a fact, not a promise.
              <p
                style={{
                  fontSize: "var(--fs-sm)",
                  color: "var(--t2)",
                  margin: "8px 0 0",
                  textAlign: "center",
                }}
              >
                The split above is just a reference for settling up among yourselves.
              </p>
            )}
            {/* The ONE polite live region for the review step (QA §A P1) — carries the pay-start
              error OR the promo result — never more than one (each handler clears the other first).
              Mounted on BOTH stages (the stage flip remounts it with the keyed wrapper), so the
              lock-edge announcement reaches the Order moment too. The pay step has its own single
              region inside PaymentSection. */}
            <p
              role="status"
              aria-atomic="true"
              style={{
                minHeight: 16,
                margin: "8px 0 0",
                fontSize: "var(--fs-sm)",
                color: payError ? "var(--warn)" : "var(--t2)",
              }}
            >
              {payError ?? status}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const tabNote: CSSProperties = {
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  margin: "10px 0 0",
  textAlign: "center",
  lineHeight: 1.5,
};

// W2d → W19 — shared tip-chip styling. The SELECTED state moved to the `.checkout-tip-on` class
// (the lit-cap vocabulary the mode pills already speak — a class so :hover/:active/RM rules can
// see it, and so SharePay can't drift); this keeps only the base/off layout.
const tipChipStyle = (): CSSProperties => ({
  flex: 1,
  minWidth: 0, // let 5 chips shrink to fit a 320px row instead of overflowing
  minHeight: 44,
  padding: "10px 2px",
  borderRadius: 13,
  border: "1.5px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  textAlign: "center",
  fontSize: "var(--fs-sm)", // explicit so the label never inherits a larger size and wraps
  fontWeight: 800,
  whiteSpace: "nowrap",
  cursor: "pointer",
});
const tipChipSmall = (on: boolean): CSSProperties => ({
  display: "block",
  fontSize: "var(--fs-xs)",
  fontWeight: 700,
  // On the lit gold cap the sub inherits the cap's cream (--oa) — --ac-strong would meld into it.
  color: on ? "inherit" : "var(--t3)",
});
const customTipWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
};
// The honest replacement for a stepper once a line has gone to the kitchen (S2.2) or been comped/voided
// by a server (S2.3). Shows the line's state in place of the (now-forbidden) edit control. Static text —
// NOT a live region (the state arrives via a cart refresh, announced once by SendToKitchenButton, not
// per line). `comped` takes precedence over `state` (a comped line keeps its kitchen state but reads
// "Comped" to the diner).
function LineStateChip({ state, comped }: { state: CartItem["lineState"]; comped: boolean }) {
  const label = comped ? "Comped" : DINER_STATE_COPY[state]; // S12: one shared vocabulary
  const glyph = comped ? (
    <Icon name="gift" size={15} />
  ) : state === "served" ? (
    <Icon name="check" size={15} />
  ) : state === "voided" ? (
    <Icon name="close" size={15} />
  ) : (
    <Icon name="flame" size={15} />
  );
  // The context is REAL (visually-hidden) text, not an aria-label on this non-interactive span (which
  // SRs may drop) — so a SR reaching this control-slot reliably hears WHY there's no stepper.
  const hint = comped
    ? " — on the house, no charge"
    : state === "voided"
      ? " — removed by a server"
      : " — ask a server to make changes";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        minHeight: 44,
        borderRadius: 999,
        border: "1px solid var(--bd)",
        background: "color-mix(in oklab, var(--ac) 8%, var(--cd))",
        color: "var(--ac-strong)",
        fontSize: "var(--fs-sm)",
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{glyph}</span>
      {label}
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {hint}
      </span>
    </span>
  );
}

function Row({
  k,
  cents,
  strong,
  roll,
  note,
}: {
  /** The dictionary key — the row renders BOTH tongues itself (W16b: EN label + inline MY accent;
   *  the dotted leader ::after still follows as the dt's last inline content). */
  k: DictKey;
  cents: number;
  strong?: boolean;
  roll?: boolean;
  /** A small parenthetical after the EN label — e.g. the tax row's "(10.5%)" (W20: the Bill shows
   *  the RATE, not just the amount). Always COMPUTED by the caller, never a transcribed literal. */
  note?: string;
}) {
  return (
    <div
      // Breakdown rows draw a dotted receipt leader (label ···· amount) via a dt::after pseudo-element —
      // no extra child, so the <dl> content model stays valid. The hero total row (strong) has no leader
      // (its own hairline divider sets it apart).
      className={strong ? undefined : "checkout-leader-row"}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        // R7b: lift the grand total — a hairline divider + extra top space sets it apart from the breakdown.
        padding: strong ? "10px 0 0" : "5px 0",
        marginTop: strong ? 6 : 0,
        borderTop: strong ? "1px solid var(--bd)" : "none",
        fontWeight: strong ? 800 : 400,
      }}
    >
      <dt>
        {t("en", k)}
        {note && (
          <span
            style={{
              fontSize: "var(--fs-xs)",
              color: "var(--t3)",
              fontWeight: 400,
              // W21 — a MARGIN, never a whitespace text node: this dt is a FLEX container (the
              // dotted-leader row), and flex drops whitespace-only children — a {" "} here rendered
              // "Sales tax(10.5%)" fused (the exact trap documented on <My/>).
              marginInlineStart: "0.35em",
            }}
          >
            {note}
          </span>
        )}
        <My k={k} inline color="var(--t3)" />
      </dt>
      <dd
        style={{
          margin: 0,
          fontVariantNumeric: "tabular-nums",
          // The total reads as the hero figure (display serif, larger) — presentation only.
          fontSize: strong ? "var(--fs-h2)" : undefined,
          fontFamily: strong ? "var(--font-display)" : undefined,
        }}
      >
        {/* R7a: roll the hero total as the tip selection changes it (presentation-only; the charge stays
            server-authoritative). NumberFlow snaps under reduced-motion automatically. */}
        {roll ? (
          <NumberFlow value={cents / 100} format={{ style: "currency", currency: "USD" }} />
        ) : (
          `$${(cents / 100).toFixed(2)}`
        )}
      </dd>
    </div>
  );
}

/** The ONE destination grouping every basket surface speaks — the editing cards, the Bill's receipt
 *  rows, and the pay step's itemization all read this, so their section labels can't drift. */
const BILL_GROUPS: [label: string, key: CartItem["fulfillment"]][] = [
  ["At your table", "dinein"],
  ["To-go", "togo"],
  ["Grocery", "grocery"],
];

/**
 * W21 (owner: "cart bill and also final pay total bill should organize dine-in and take-out items
 * for clarity") — the read-only receipt itemization, grouped by destination. Used by the Bill
 * moment AND the pay step (which previously showed only the totals, no items at all — the diner
 * confirmed a charge they couldn't itemize on the screen that takes the card). Headings render only
 * when the basket really spans 2+ destinations, so a plain dine-in bill stays clean.
 */
function BillLines({
  items,
  isGroup,
  splitContext,
}: {
  items: CartItem[];
  isGroup: boolean;
  splitContext: SplitContext | null;
}) {
  const present = BILL_GROUPS.filter(([, k]) => items.some((i) => i.fulfillment === k));
  const showHeadings = present.length > 1;
  const renderRow = (i: CartItem) => {
    const struck = i.comped || i.lineState === "voided";
    const owner = isGroup ? splitContext?.members.find((m) => m.seat === i.bySeat) : undefined;
    return (
      <li key={i.id} className="checkout-bill-line">
        {/* W13 — the v7.2 receipt-row thumb (44px variant → 40px here). Always a
            slot: refused/missing URLs fall to the designed placeholder. */}
        <span className="checkout-bill-thumb" aria-hidden="true">
          <BlurUpImage
            src={i.imageUrl ?? null}
            alt=""
            width={40}
            height={40}
            sizes="40px"
            fallback={
              <PhotoPlaceholder
                variant="thumb"
                icon={i.fulfillment === "grocery" ? "cat-grocery" : "cat-dish"}
              />
            }
          />
        </span>
        <span className="checkout-bill-name">
          <span style={{ fontWeight: 600 }}>
            {i.qty > 1 ? `${i.qty} × ` : ""}
            {i.name}
          </span>
          {i.nameMy && (
            <span
              lang="my"
              style={{
                display: "block",
                fontFamily: "var(--font-my)",
                // fs-sm, not fs-xs: stacked Burmese diacritics at the 11px floor
                // are illegible; matches the cart line's MY size (review LOW).
                fontSize: "var(--fs-sm)",
                color: "var(--t2)",
              }}
            >
              {i.nameMy}
            </span>
          )}
          {(i.modifiers.length > 0 || i.notes) && (
            <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--t3)" }}>
              {i.modifiers.join(", ")}
              {i.modifiers.length > 0 && i.notes ? " · " : ""}
              {i.notes ? `“${i.notes}”` : ""}
            </span>
          )}
          <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--t3)" }}>
            {i.comped
              ? "Comped — on the house"
              : i.lineState === "draft"
                ? "Not sent yet — on your bill"
                : DINER_STATE_COPY[i.lineState]}
            {owner ? ` · ${owner.seat === splitContext?.mySeat ? "You" : owner.name}` : ""}
          </span>
        </span>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
            textDecoration: struck ? "line-through" : "none",
            color: struck ? "var(--t3)" : "inherit",
          }}
        >
          ${((i.unitPriceCents * i.qty) / 100).toFixed(2)}
        </span>
      </li>
    );
  };
  return (
    <>
      {present.map(([label, key]) => (
        <div key={key}>
          {showHeadings && <p className="checkout-bill-group">{label}</p>}
          {/* Review LOW — a single-group bill announces as "Your bill" (the pre-W21 name), not as
              its lone destination label; the per-group names only earn their keep with 2+ groups. */}
          <ul
            role="list"
            aria-label={showHeadings ? label : T("yourBill")}
            className="checkout-bill-lines"
          >
            {items.filter((i) => i.fulfillment === key).map(renderRow)}
          </ul>
        </div>
      ))}
    </>
  );
}
