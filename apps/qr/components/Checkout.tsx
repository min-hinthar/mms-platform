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
import type { SplitContext } from "@/lib/split";
import { rescaleModePriceCents } from "@/lib/mode-price";
import { canMutateLine } from "@/lib/permissions";
import { menuHref, menuLinkText } from "@/lib/menu-href";
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
import { WalletChip } from "./WalletChip";
import { useRewardsBadge } from "@/lib/useRewardsBadge";
import {
  initialStage,
  kitchenDraftQty as deriveKitchenDraftQty,
  type CheckoutStage,
} from "@/lib/checkout-stage";
import { useLocale, useT } from "./LocaleProvider";
import { t, type DictKey } from "@/lib/i18n";

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
// "None" (not v7.2's "No extra") so five chips — the four presets + W2d's Custom — fit one row at
// 320–375px without wrapping to uneven heights (mobile-first bar).
const TIPS: [label: string, rate: number][] = [
  ["None", 0],
  ["15%", 0.15],
  ["18%", 0.18],
  ["20%", 0.2],
];

// W2d — a typed custom-tip dollar string → the rate the server applies. `round(net · rate)` then equals
// the entered cents exactly (rate = cents/net). Clamped to 100% of net (the schema cap is 1.0), so it
// can't fat-finger a $500 tip on a $5 order or exceed what create-intent will accept. 0 when unparseable.
function customTipRateFromDollars(raw: string, net: number): number {
  const dollars = parseFloat(raw);
  if (!Number.isFinite(dollars) || dollars <= 0 || net <= 0) return 0;
  return Math.min(Math.round(dollars * 100), net) / net;
}

// Optimistic cart edits — a qty / destination / make-now tap reflects INSTANTLY, then the server action
// + refresh() reconcile the base underneath (and correct a refused edit). Money stays server-authoritative:
// the fulfillment flip previews the mode re-price with the SAME pure ratio helper the server's fallback
// uses (W16a — pre-W16a the toggle never changed the price, so flipping only the tag was honest; now a
// tag-only flip would show the for-here amount on a pressed "To go" pill for a full round-trip). The
// server's exact re-derive can land within a quarter of the ratio preview — refresh() reconciles it,
// along with the aggregate totals receipt (tax / discount).
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
      return state.map((i) =>
        i.id === u.id
          ? {
              ...i,
              fulfillment: u.ful,
              unitPriceCents:
                (i.fulfillment === "dinein" || i.fulfillment === "togo") &&
                i.fulfillment !== u.ful
                  ? rescaleModePriceCents(i.unitPriceCents, i.fulfillment, u.ful)
                  : i.unitPriceCents,
            }
          : i,
      );
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
  // W5 (S2) — render-site translation: T() for the current locale, `accentLang` for the stacked
  // bilingual heading (the OTHER tongue becomes the accent line — EN↔MY swap, both always visible).
  const { locale } = useLocale();
  const T = useT();
  const accentLang = locale === "my" ? "en" : "my";
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
  // the defect this slice exists to retire, on the path most likely to hit it. `getCartView` returns the
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
  const customTipRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (customTipOpen) customTipRef.current?.focus();
  }, [customTipOpen]);
  // Pure-grocery basket (W1): every chargeable line is self-scanned retail — no tip ask (the server
  // excludes grocery lines from the tip base and forces tip to 0; W16a — grocery is also exempt from
  // the mode-price factors). Computed here (early) so the tip rate can be zeroed for it too.
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
  const effectiveTipRate = pureGrocery
    ? 0
    : customTipOpen
      ? customTipRateFromDollars(customTip, tipNet)
      : tipRate;
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
  // Tab lifecycle (S3.1) — seeded from the server view, kept in step by refresh() (a peer or a
  // server securing the tab flips it here too). W12: the diner never CHOOSES a tab anymore — an
  // unsettled dine-in table IS the open (trust) tab, so `trust` renders nothing diner-side; the
  // state only gates the save-card affordance and its secured note on the Bill moment.
  const [tabType, setTabType] = useState(initialTabType);
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [payTotals, setPayTotals] = useState<CartTotals | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);

  // Re-sync the server-authoritative view (items / totals / settling / tabType — never pay-step state,
  // so a mid-payment refetch can't disturb the mounted Stripe Element). Stable (useCallback on the
  // stable cartId prop) so the realtime + visibility subscriptions below register once.
  const refresh = useCallback(async () => {
    try {
      const v = await getCartView(cartId);
      setItems(v.items);
      setTotals(v.totals);
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
    } catch {
      // Swallow: the EXPECTED failure here is the post-payment 403 (the cart flipped to paid → the
      // diner is being redirected to /track). We can't discriminate it from a transient error
      // client-side — Server Action errors are redacted in prod, so no `.status` survives — and
      // surfacing an error on the expected post-pay 403 would be a false alarm. A transient failure
      // self-heals on the next interaction (every mutation re-fetches).
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

  // W9b — a lock is only worth surfacing when it is SOMEONE ELSE'S. The diner standing on their own
  // pay step holds it (create-intent took it), and so does one who navigated back to review before
  // `editOrder` released it — telling either "someone's checking out" would be a lie about themselves.
  // It also requires a KNOWN seat: `cart/page.tsx` nulls `splitContext` on ANY read failure, and a
  // viewer who doesn't know their own seat cannot honestly claim the lock belongs to a peer.
  const lockedByPeer = locked && !!lockedBy && !!mySeat && lockedBy !== mySeat;
  const lockedByName = lockedByPeer
    ? (splitContext?.members.find((m) => m.seat === lockedBy)?.name ?? "Someone")
    : null;

  // W9b — announce the lock edge. The lockbar is plain visual, and this view's ONE status region is
  // `status` (rendered below) — the provider's announcer that handles this on /menu is mounted on the
  // menu subtree only, so without this a screen-reader user on /cart hears NOTHING as every control
  // around them goes dead. Edge-triggered via a ref so it fires on the transition, not every render.
  const prevAnnouncedLock = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevAnnouncedLock.current;
    prevAnnouncedLock.current = lockedByPeer;
    if (prev === null || prev === lockedByPeer) return; // seed on first run; only edges announce
    // The region renders `payError ?? status`, so a stale error would swallow this announcement
    // entirely — and while locked the diner cannot retry the action that produced it, so it would
    // never clear on its own. A lock transition supersedes it.
    setPayError(null);
    setStatus(
      lockedByPeer
        ? `${lockedByName ?? "Someone"} is checking out — the order’s locked for a moment.`
        : "The order’s unlocked — you can edit again.",
    );
  }, [lockedByPeer, lockedByName]);
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
  const prevLockedByPeer = useRef(lockedByPeer);
  useEffect(() => {
    if (lockedByPeer && !prevLockedByPeer.current && document.activeElement === document.body)
      headingRef.current?.focus();
    prevLockedByPeer.current = lockedByPeer;
  }, [lockedByPeer]);

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
  const payAbandonRef = useRef({ onPay: false, paying: false, cartId });
  // Synced in an effect, not during render (a render-phase ref write is a React Compiler violation).
  // The listener below only ever reads this on a real teardown, which is always after a commit.
  useEffect(() => {
    payAbandonRef.current = { onPay: !!onPay, paying, cartId };
  }, [onPay, paying, cartId]);
  const releaseLockBeacon = useCallback(() => {
    const { onPay: active, paying: mid, cartId: id } = payAbandonRef.current;
    if (!active || mid) return;
    try {
      navigator.sendBeacon?.(
        "/api/cart/release-lock",
        new Blob([JSON.stringify({ cartId: id })], { type: "application/json" }),
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
    if (lockedByPeer) return;
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
    setLoadingPay(true);
    try {
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
      if (name) {
        try {
          localStorage.setItem("mms.name", name);
        } catch {
          /* private mode */
        }
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
        }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        totals?: CartTotals;
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
      setClientSecret(data.clientSecret);
      setPayTotals(data.totals);
      setStepDir("forward"); // W13 — the pay step is the deepest cut
      setStep("pay");
    } catch {
      setPayError("Couldn’t start checkout — please try again.");
    } finally {
      setLoadingPay(false);
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

  async function editOrder() {
    // Release the pay-window lock we took at create-intent (P3.2-lock) so the table can edit again,
    // then re-sync. Best-effort — the TTL is the backstop if the release call fails.
    try {
      await releasePayLock(cartId);
    } catch {
      // non-fatal; the lock auto-expires via its TTL
    }
    setStepDir("back"); // W13 — leaving the pay step slides back
    setStep("review");
    setClientSecret(null);
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
      <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: 16 }}>
          {T("yourOrder")}
          <span
            lang={accentLang}
            style={{
              display: "block",
              ...(accentLang === "my" ? { fontFamily: "var(--font-my)" } : null),
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              color: "var(--t2)",
            }}
          >
            {t(accentLang, "yourOrder")}
          </span>
        </h1>
        <EmptyState
          icon={<Icon name="cart" size={30} style={{ color: "var(--ac)" }} />}
          title={T("emptyCartTitle")}
          subtitle={sessionMode === "scango" ? T("emptyCartSubAisles") : T("emptyCartSubMenu")}
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
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      {/* tabIndex={-1} = programmatic focus target (focus moves here when a line is removed). No
          outline override — the browser shows its :focus-visible ring (WCAG 2.4.7). K3a: a signed-in
          diner's wallet chip rides beside the heading (recognition at the pay moment; hidden for anon). */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--fs-h1)" }}>
          {T(headingKey)}
          {/* W13→W5 — the OTHER tongue's name for the moment, part OF the heading so a screen
              reader hears both tongues once, correctly pronounced (lang on the accent). In MY
              mode the roles swap: Burmese leads, English becomes the accent line. */}
          <span
            lang={accentLang}
            style={{
              display: "block",
              ...(accentLang === "my" ? { fontFamily: "var(--font-my)" } : null),
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              color: "var(--t2)",
            }}
          >
            {t(accentLang, headingKey)}
          </span>
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
              <dl>
                <Row k={T("rowSubtotal")} cents={payTotals.subtotalCents} />
                {payTotals.discountCents - payTotals.rewardCents > 0 && (
                  <Row
                    k={T("rowPromo")}
                    cents={-(payTotals.discountCents - payTotals.rewardCents)}
                  />
                )}
                {payTotals.rewardCents > 0 && (
                  <Row k={T("rowReward")} cents={-payTotals.rewardCents} />
                )}
                                <Row k={T("rowTax")} cents={payTotals.taxCents} />
                {payTotals.tipCents > 0 && <Row k={T("rowTip")} cents={payTotals.tipCents} />}
                <Row k={T("rowTotal")} cents={payTotals.totalCents} strong roll />
              </dl>
            </div>
            <PaymentSection
              cartId={cartId}
              clientSecret={clientSecret}
              totals={payTotals}
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
                Gated on `lockedByPeer`, never bare `locked` — the payer holds their own lock. */}
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
              </button>
            )}
            {lockedByPeer && (
              <p
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
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
                {lockedByName} is checking out — the order’s locked for a moment.
              </p>
            )}
            {showLineCards && <TimelineStrip items={viewItems} menuMode={sessionMode} />}
            {/* S4 unified basket: group lines by destination (At your table / To-go / Grocery). Headings
              show only when the basket actually spans 2+ destinations, so a plain dine-in cart stays clean.
              The renderLine body is the S2 per-line card + an S4 for-here/to-go toggle on editable food.
              W12: the EDITING surface — Order moment (and the unstaged classic screen) only; the Bill
              moment renders the same lines as read-only receipt rows instead. */}
            {(() => {
              if (!showLineCards) return null; // W12 — the Bill moment renders receipt rows instead
              const GROUPS: [label: string, key: CartItem["fulfillment"]][] = [
                ["At your table", "dinein"],
                ["To-go", "togo"],
                ["Grocery", "grocery"],
              ];
              const present = GROUPS.filter(([, k]) => viewItems.some((i) => i.fulfillment === k));
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
                                  aria-disabled={lockedByPeer || undefined}
                                  onClick={() => {
                                    if (lockedByPeer) return;
                                    toggleFulfillment(i.id, f);
                                  }}
                                  className={`checkout-pill${on ? " checkout-pill-on" : ""}`}
                                  style={lockedByPeer ? { opacity: 0.55 } : undefined}
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
                            aria-disabled={lockedByPeer || undefined}
                            onClick={() => {
                              if (lockedByPeer) return;
                              makeNow(i.id);
                            }}
                            className="checkout-pill checkout-pill-accent"
                            style={{
                              display: "flex",
                              width: "100%",
                              marginTop: 8,
                              ...(lockedByPeer ? { opacity: 0.55 } : null),
                            }}
                          >
                            Make it now · ready in ~{prepMinutes} min
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
                        disabled={!canEdit || lockedByPeer}
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
                        Made fresh when you check out — ready in about {prepMinutes} min.
                        {isDineIn ? " Want it sooner? Tap “Make it now.”" : ""}
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

            {/* W12 — the Bill moment's lines: the same viewItems as read-only RECEIPT rows inside the
                textured slip (qty × name · dotted leader · amount), with the kitchen state, the note,
                the owner, and the comped/voided treatment carried over from the cards. Editing lives
                one tap back on the Order moment — a bill you can quietly read is the point. */}
            {staged && stage === "bill" && (
              <div className="card card-textured checkout-receipt">
                <ul role="list" aria-label={T("yourBill")} className="checkout-bill-lines">
                  {viewItems.map((i) => {
                    const struck = i.comped || i.lineState === "voided";
                    const owner = isGroup
                      ? splitContext!.members.find((m) => m.seat === i.bySeat)
                      : undefined;
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
                            <span
                              style={{
                                display: "block",
                                fontSize: "var(--fs-xs)",
                                color: "var(--t3)",
                              }}
                            >
                              {i.modifiers.join(", ")}
                              {i.modifiers.length > 0 && i.notes ? " · " : ""}
                              {i.notes ? `“${i.notes}”` : ""}
                            </span>
                          )}
                          <span
                            style={{
                              display: "block",
                              fontSize: "var(--fs-xs)",
                              color: "var(--t3)",
                            }}
                          >
                            {i.comped
                              ? "Comped — on the house"
                              : i.lineState === "draft"
                                ? "Not sent yet — on your bill"
                                : DINER_STATE_COPY[i.lineState]}
                            {owner
                              ? ` · ${owner.seat === splitContext!.mySeat ? "You" : owner.name}`
                              : ""}
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
                  })}
                </ul>
                <dl style={{ borderTop: "1px solid var(--bd)", paddingTop: 6, marginTop: 8 }}>
                  <Row k={T("rowSubtotal")} cents={totals.subtotalCents} />
                  {totals.discountCents - totals.rewardCents > 0 && (
                    <Row k={T("rowPromo")} cents={-(totals.discountCents - totals.rewardCents)} />
                  )}
                  {totals.rewardCents > 0 && <Row k={T("rowReward")} cents={-totals.rewardCents} />}
                  <Row k={T("rowTax")} cents={totals.taxCents} />
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
              />
            )}

            {showPayFurniture && (
              <form onSubmit={onPromo} style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder={T("promoCode")}
                  aria-label={
                    lockedByPeer
                      ? `${T("promoCode")} — ${lockedByName} ${T("isCheckingOut")}`
                      : T("promoCode")
                  }
                  readOnly={lockedByPeer}
                  autoCapitalize="characters"
                  maxLength={40}
                  className="checkout-promo-input"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--cd)",
                    color: "var(--tx)",
                  }}
                />
                <button
                  type="submit"
                  disabled={pending || !promo.trim()}
                  aria-disabled={lockedByPeer || undefined}
                  className="checkout-pill checkout-pill-accent"
                  style={{ minHeight: 44, ...(lockedByPeer ? { opacity: 0.55 } : null) }}
                >
                  {T("applyPromo")}
                </button>
              </form>
            )}

            {/* Redeem a Morning Star reward (M4 P4.2) — renders only if the diner has coupons; the discount
              is server-authoritative (rides getCartTotals). Refreshes the breakdown on apply/remove. */}
            {showPayFurniture && (
              <RewardField
                cartId={cartId}
                appliedRewardCents={totals.rewardCents}
                onChanged={refresh}
              />
            )}

            {/* W5e: the pickup timing choice — ASAP (fire now, ready ~prep min) ⇆ a scheduled slot.
                Pickup only (scango is self-scanned grocery, no kitchen fire to schedule). Errors route
                into the single review-step live region below via onStatus. */}
            {isPickupMode && (
              <PickupWhenChoice
                cartId={cartId}
                prepMinutes={prepMinutes}
                initialSlot={initialPickupSlot}
                asapAvailable={asapAvailable}
                onStatus={setStatus}
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
                    Optional
                  </span>
                </label>
                <input
                  id="pickup-name"
                  type="text"
                  value={firstName}
                  maxLength={40}
                  autoComplete="given-name"
                  placeholder="e.g. Aye Aye"
                  onChange={(e) => setFirstName(e.target.value)}
                  className="checkout-promo-input"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--cd)",
                    color: "var(--tx)",
                  }}
                />
                {/* No board promise here — the ready TV is opt-in config (BOARD_DEVICE_TOKEN);
                    only promise what every store setup keeps (adversarial LOW-6). */}
                <p style={{ margin: "4px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
                  We’ll call your name when your order’s up.
                </p>
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
                  <Row k={T("rowSubtotal")} cents={totals.subtotalCents} />
                  {totals.discountCents - totals.rewardCents > 0 && (
                    <Row k={T("rowPromo")} cents={-(totals.discountCents - totals.rewardCents)} />
                  )}
                  {totals.rewardCents > 0 && <Row k={T("rowReward")} cents={-totals.rewardCents} />}
                  <Row k={T("rowTax")} cents={totals.taxCents} />
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
                <h3 id="tip-h" style={{ fontSize: "var(--fs-h3)", margin: "16px 0 6px" }}>
                  {T("addATip")}
                </h3>
                <div
                  role="group"
                  aria-labelledby="tip-h"
                  style={{ display: "flex", gap: 8, margin: "0 0 4px" }}
                >
                  {TIPS.map(([label, rate]) => {
                    const on = !customTipOpen && tipRate === rate;
                    const previewCents = tipPreview(rate);
                    return (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={lockedByPeer || undefined}
                        onClick={() => {
                          if (lockedByPeer) return;
                          selectPresetTip(rate);
                        }}
                        className="checkout-tip"
                        style={{
                          ...tipChipStyle(on),
                          ...(lockedByPeer ? { opacity: 0.55 } : null),
                        }}
                      >
                        {rate === 0 ? T("noTip") : label}
                        <small style={tipChipSmall(on)}>
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
                    aria-disabled={lockedByPeer || undefined}
                    onClick={() => {
                      if (lockedByPeer) return;
                      openCustomTip();
                    }}
                    className="checkout-tip"
                    style={{
                      ...tipChipStyle(customTipOpen),
                      ...(lockedByPeer ? { opacity: 0.55 } : null),
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
                          tipNet > 0 && parseFloat(customTip) * 100 > tipNet
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
                    {tipNet > 0 && parseFloat(customTip) * 100 > tipNet && (
                      <p
                        id="custom-tip-cap"
                        style={{
                          margin: "4px 2px 0",
                          fontSize: "var(--fs-sm)",
                          color: "var(--t3)",
                        }}
                      >
                        Capped at ${(tipNet / 100).toFixed(2)} — 100% of your order.
                      </p>
                    )}
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
                </span>
              </button>
            )}

            {/* W9b — the primary CTA is a dead control under a peer's lock: `create-intent` refuses
                with 409 because the lock is exactly the mutex that stops two diners paying at once. It
                stays RENDERED and says so, rather than sending the diner into a failure to find out. */}
            {showPayFurniture && (
              <button
                type="button"
                aria-disabled={lockedByPeer || undefined}
                onClick={() => {
                  if (lockedByPeer) return;
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
                  cursor: loadingPay || lockedByPeer ? "default" : "pointer",
                  opacity: loadingPay ? 0.7 : lockedByPeer ? 0.55 : 1,
                }}
              >
                {/* The label rides above the ::after shine sweep on its own relative layer. W2d: the CTA
                  carries the amount (fees are visible above it) — and for a GROUP it says "Pay the whole
                  order · $X", elevating the honesty caveat (a guest who read "your share" isn't surprised
                  by the full charge). The amount is the server-reconciled estimate; the pay step confirms. */}
                <span style={{ position: "relative", zIndex: 1 }}>
                  {loadingPay ? (
                    "Starting checkout…"
                  ) : lockedByPeer ? (
                    `Waiting for ${lockedByName} to finish`
                  ) : (
                    <>
                      {isGroup
                        ? `${T("payWholeOrder")} · ${ctaTotal}`
                        : `${T("pay")} · ${ctaTotal}`}
                      <span aria-hidden className="checkout-cta-arrow">
                        →
                      </span>
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
              <SecureTabButton cartId={cartId} onSecured={refresh} />
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

// W2d — shared tip-chip styling (presets + the Custom chip), so the two paths can't drift.
const tipChipStyle = (on: boolean): CSSProperties => ({
  flex: 1,
  minWidth: 0, // let 5 chips shrink to fit a 320px row instead of overflowing
  minHeight: 44,
  padding: "10px 2px",
  borderRadius: 13,
  border: `1.5px solid ${on ? "var(--ac)" : "var(--bd)"}`,
  background: on ? "color-mix(in oklab, var(--ac) 9%, var(--cd))" : "var(--cd)",
  color: on ? "var(--ac-strong)" : "var(--tx)",
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
  color: on ? "var(--ac-strong)" : "var(--t3)",
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
}: {
  k: string;
  cents: number;
  strong?: boolean;
  roll?: boolean;
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
      <dt>{k}</dt>
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
