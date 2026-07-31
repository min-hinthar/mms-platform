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
import { canMutateLine } from "@/lib/permissions";
import { menuHref } from "@/lib/menu-href";
import { DINER_STATE_COPY } from "@/lib/line-state-copy";
import { seatColor, seatInitial } from "@/lib/avatars";
import { useAnonSession } from "@/lib/useAnonSession";
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
import { openTab } from "@/lib/tabs";

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
// only per-line qty / fulfillment / state flip here; the per-line price (unit × qty, unit server-derived)
// updates honestly, while the aggregate totals receipt (tax / service / discount) reconciles on the refresh.
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
 * "Continue to payment" mints the intent + LOCKS the cart → PAY (Stripe Payment Element on a stable
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
  /** Tab lifecycle (S3.1): `none` until someone opens a tab on this table. When open, the cart reads
   *  "Tab open" and the pay CTA settles/closes the tab. Synced from getCartView (initial + realtime). */
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
  // Pure-grocery basket (W1): every chargeable line is self-scanned retail — no tip ask, no SB-1524
  // service copy (the server excludes grocery lines from the service base + forces tip to 0). Computed
  // here (early) so the tip rate can be zeroed for it too. Voided/comped lines are $0 and don't count.
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
  // Tab lifecycle (S3.1) — seeded from the server view, kept in step by refresh() (a peer or a server
  // opening the tab flips it here too). `tabBusy`/`tabError` drive the "Keep tab open" affordance.
  const [tabType, setTabType] = useState(initialTabType);
  const [tabBusy, setTabBusy] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
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
      setTabType(v.tabType); // a server (or a peer) opening the tab reflects here too
    } catch {
      // Swallow: the EXPECTED failure here is the post-payment 403 (the cart flipped to paid → the
      // diner is being redirected to /track). We can't discriminate it from a transient error
      // client-side — Server Action errors are redacted in prod, so no `.status` survives — and
      // surfacing an error on the expected post-pay 403 would be a false alarm. A transient failure
      // self-heals on the next interaction (every mutation re-fetches).
    }
  }, [cartId]);

  // Live cart sync: a peer's add/qty/assignment (P3.2) OR a server opening the tab / editing the order
  // (S1.3/S3.1) re-fetches the server-authoritative view here, so the cart + shares + tab state stay in
  // step. Enabled for ANY dine-in cart (not just groups) — a solo diner must still see a server-opened
  // tab flip to "Tab open / Settle tab" live (the qr_carts UPDATE drives refresh → getCartView.tabType).
  const anon = useAnonSession();
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
  const onPay = step === "pay" && clientSecret && payTotals;
  const viewKey = isGroup && settling && splitContext ? "settle" : onPay ? "pay" : "review";

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
    startTransition(async () => {
      setStatus(null); // clear any stale result so it doesn't linger through the round-trip
      setPayError(null); // single live region — don't let a prior pay error mask the promo result
      setTabError(null);
      try {
        const result = await applyPromoAction(cartId, promo.trim());
        setStatus(result.ok ? "Promo applied." : PROMO_MESSAGES[result.reason]);
      } catch {
        // A thrown error here is a transport/redacted failure, not a known reason — one honest line.
        setStatus("Couldn’t apply that code — check your connection and try again.");
      }
      await refresh();
    });
  }

  async function continueToPayment() {
    setPayError(null);
    setStatus(null); // single live region — clear any prior promo result
    setTabError(null);
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
      setStep("pay");
    } catch {
      setPayError("Couldn’t start checkout — please try again.");
    } finally {
      setLoadingPay(false);
    }
  }

  async function keepTabOpen() {
    setTabBusy(true);
    setTabError(null);
    setStatus(null); // single live region — don't let a stale promo/pay message mask the tab result
    setPayError(null);
    try {
      const res = await openTab({ cartId });
      if (!res.ok) {
        setTabError(res.error);
        return;
      }
      setTabType("trust"); // optimistic; refresh() reconciles with server truth
      await refresh();
    } catch {
      setTabError("Couldn’t open the tab — please try again.");
    } finally {
      setTabBusy(false);
    }
  }

  async function editOrder() {
    // Release the pay-window lock we took at create-intent (P3.2-lock) so the table can edit again,
    // then re-sync. Best-effort — the TTL is the backstop if the release call fails.
    try {
      await releasePayLock(cartId);
    } catch {
      // non-fatal; the lock auto-expires via its TTL
    }
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
    const backHref = menuHref(sessionMode);
    return (
      <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: 16 }}>Your order</h1>
        <EmptyState
          icon={<Icon name="cart" size={30} style={{ color: "var(--ac)" }} />}
          title="Nothing in your cart yet"
          subtitle="Add a dish from the menu and it’ll show up here."
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
                Browse the menu
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
          Your order
        </h1>
        <WalletChip badge={rewardsBadge} />
      </div>

      {/* R7b: keyed step wrapper — a CSS enter-slide replays on each view change (review ↔ pay ↔ settle).
          Keyed on the view so React remounts it (the animation replays); the <h1> above stays mounted as the
          focus target. The pay step's Stripe Element mounts WITH this wrapper, so the transform-based enter
          never reloads the iframe. CSS `@media`-gated — no shouldAnimate first-render race. */}
      <div key={viewKey} className="checkout-step">
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
            <div className="card card-textured checkout-receipt">
              <dl>
                <Row k="Subtotal" cents={payTotals.subtotalCents} />
                {payTotals.discountCents - payTotals.rewardCents > 0 && (
                  <Row k="Promo" cents={-(payTotals.discountCents - payTotals.rewardCents)} />
                )}
                {payTotals.rewardCents > 0 && <Row k="Reward" cents={-payTotals.rewardCents} />}
                <Row k="Service charge (5%)" cents={payTotals.serviceChargeCents} />
                <Row k="Sales tax" cents={payTotals.taxCents} />
                {payTotals.tipCents > 0 && <Row k="Tip" cents={payTotals.tipCents} />}
                <Row k="Total" cents={payTotals.totalCents} strong roll />
              </dl>
            </div>
            <PaymentSection
              cartId={cartId}
              clientSecret={clientSecret}
              totals={payTotals}
              onEdit={editOrder}
            />
          </>
        ) : (
          <>
            {/* J3: the wait, narrated from real kitchen taps — shows only once something is with the
                kitchen, right where the mid-meal diner reviews the table's order. viewItems (not items)
                so a "Make it now" tap and the strip agree instantly; the menu link carries the session
                mode — a bare /menu defaults to scan-&-go and would orphan a dine-in dessert. */}
            <TimelineStrip items={viewItems} menuHref={menuHref(sessionMode)} />
            {/* S4 unified basket: group lines by destination (At your table / To-go / Grocery). Headings
              show only when the basket actually spans 2+ destinations, so a plain dine-in cart stays clean.
              The renderLine body is the S2 per-line card + an S4 for-here/to-go toggle on editable food. */}
            {(() => {
              const GROUPS: [label: string, key: CartItem["fulfillment"]][] = [
                ["At your table", "dinein"],
                ["To-go", "togo"],
                ["Grocery", "grocery"],
              ];
              const present = GROUPS.filter(([, k]) => viewItems.some((i) => i.fulfillment === k));
              const showHeadings = present.length > 1;
              const renderLine = (i: CartItem) => {
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
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{i.name}</div>
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
                                  onClick={() => toggleFulfillment(i.id, f)}
                                  className={`checkout-pill${on ? " checkout-pill-on" : ""}`}
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
                            onClick={() => makeNow(i.id)}
                            className="checkout-pill checkout-pill-accent"
                            style={{ display: "flex", width: "100%", marginTop: 8 }}
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
                        disabled={!canEdit}
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
                        style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", margin: "0 0 8px" }}
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

            {isGroup && splitContext && (
              <SplitSection
                cartId={cartId}
                items={viewItems}
                totalCents={totals.totalCents}
                ctx={splitContext}
                onChanged={refresh}
                onStatus={setStatus}
              />
            )}

            <form onSubmit={onPromo} style={{ display: "flex", gap: 8, margin: "12px 0" }}>
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="Promo code"
                aria-label="Promo code"
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
                className="checkout-pill checkout-pill-accent"
                style={{ minHeight: 44 }}
              >
                Apply
              </button>
            </form>

            {/* Redeem a Morning Star reward (M4 P4.2) — renders only if the diner has coupons; the discount
              is server-authoritative (rides getCartTotals). Refreshes the breakdown on apply/remove. */}
            <RewardField
              cartId={cartId}
              appliedRewardCents={totals.rewardCents}
              onChanged={() => void refresh()}
            />

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

            {/* W2d — fees BEFORE the tip ask. The diner sees every charge (service charge + tax) and
                the SB-1524 disclosure BEFORE deciding a tip, so the tip is never stacked on a surprise
                fee (surprise fees are the #1 benchmark complaint — the disclosure must sit above the
                ask). The tip-inclusive total lands below the ask. All figures stay server-authoritative
                (the tip preview is a hint reconciled at create-intent). */}
            <div className="card card-textured checkout-receipt">
              <dl>
                <Row k="Subtotal" cents={totals.subtotalCents} />
                {totals.discountCents - totals.rewardCents > 0 && (
                  <Row k="Promo" cents={-(totals.discountCents - totals.rewardCents)} />
                )}
                {totals.rewardCents > 0 && <Row k="Reward" cents={-totals.rewardCents} />}
                {/* Server-derived: 0 on a pure-grocery basket (grocery lines are outside the
                    SB-1524 service base) — the row and the disclosure only render when charged. */}
                {totals.serviceChargeCents > 0 && (
                  <Row k="Service charge (5%)" cents={totals.serviceChargeCents} />
                )}
                <Row k="Sales tax" cents={totals.taxCents} />
              </dl>
            </div>

            {totals.serviceChargeCents > 0 && (
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--t3)", margin: "8px 2px 0" }}>
                A 5% service charge supports fair kitchen wages and is shared with the team (CA
                SB-1524). It is not a tip — anything extra above is yours to give. Card fees are
                built into menu prices; we never add a surcharge on debit.
              </p>
            )}

            {/* Tip selector (server confirms the exact tip at create-intent) — now AFTER the fee
                breakdown (W2d). Presets + a Custom chip (W2d): tapping Custom reveals a dollar field;
                the amount rides as a rate (customCents / net) so the server path is identical. Hidden on
                a pure-grocery basket — self-scanned retail is not table service (W1). */}
            {!pureGrocery && (
              <>
                <div
                  role="group"
                  aria-label="Add a tip"
                  style={{ display: "flex", gap: 8, margin: "14px 0 4px" }}
                >
                  {TIPS.map(([label, rate]) => {
                    const on = !customTipOpen && tipRate === rate;
                    const previewCents = tipPreview(rate);
                    return (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={on}
                        onClick={() => selectPresetTip(rate)}
                        className="checkout-tip"
                        style={tipChipStyle(on)}
                      >
                        {label}
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
                    onClick={openCustomTip}
                    className="checkout-tip"
                    style={tipChipStyle(customTipOpen)}
                  >
                    Custom
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
                  {tipPreviewCents > 0 ? "Estimated total" : "Total"}
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

            {canSendToKitchen && viewItems.length > 0 && (
              // onChanged re-syncs the cart after a send (steppers → chips) or an undo (chips → steppers),
              // since solo dine-in isn't on the group realtime channel.
              <SendToKitchenButton
                cartId={cartId}
                hasDraft={viewItems.some((i) => i.lineState === "draft")}
                onChanged={refresh}
              />
            )}

            <button
              type="button"
              onClick={continueToPayment}
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
                cursor: loadingPay ? "default" : "pointer",
                opacity: loadingPay ? 0.7 : 1,
              }}
            >
              {/* The label rides above the ::after shine sweep on its own relative layer. W2d: the CTA
                  carries the amount (fees are visible above it) — and for a GROUP it says "Pay the whole
                  order · $X", elevating the honesty caveat (a guest who read "your share" isn't surprised
                  by the full charge). The amount is the server-reconciled estimate; the pay step confirms. */}
              <span style={{ position: "relative", zIndex: 1 }}>
                {loadingPay ? (
                  "Starting checkout…"
                ) : (
                  <>
                    {tabType !== "none"
                      ? `Settle tab · ${ctaTotal}`
                      : isGroup
                        ? `Pay the whole order · ${ctaTotal}`
                        : `Continue · ${ctaTotal}`}
                    <span aria-hidden className="checkout-cta-arrow">
                      →
                    </span>
                  </>
                )}
              </span>
            </button>

            {/* Settle-later tray (S3.1/S3.2) — dine-in only, demoted below the primary pay CTA into a
              labeled pill tray (one hero action, the rest a tray). Before a tab is open: keep it open, or
              secure it with a card; once open (trust): convert to secured. Both move no money now (openTab →
              mms_open_tab, member-gated; SecureTabButton saves a card via a SetupIntent). Hidden once secured. */}
            {canTab && tabType !== "secure" && (
              <div className="checkout-tray" role="group" aria-label="Other ways to settle">
                <p className="checkout-tray-label" aria-hidden="true">
                  or settle later
                </p>
                <div className="checkout-pill-row">
                  {tabType === "none" && (
                    <button
                      type="button"
                      onClick={keepTabOpen}
                      disabled={tabBusy}
                      aria-busy={tabBusy}
                      className="checkout-pill"
                    >
                      {tabBusy ? "Opening tab…" : "Keep tab open"}
                    </button>
                  )}
                  {/* Compact: renders the trigger as a tray pill; its card form expands full-width below. */}
                  <SecureTabButton cartId={cartId} onSecured={refresh} compact />
                </div>
                {tabType === "none" && (
                  <p className="checkout-tray-hint">
                    Order all night and pay once when you’re ready — by card here or with a server.
                  </p>
                )}
              </div>
            )}
            {tabType === "secure" ? (
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
                Tab secured · card on file — settle anytime, or just leave and we’ll close it.
              </p>
            ) : tabType === "trust" ? (
              <p style={tabNote}>
                <span aria-hidden>● </span>
                Tab open — add anything you like and settle when you’re ready.
              </p>
            ) : null}

            {isGroup && (
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
              error, a tab-action error, OR the promo result — never more than one (each handler
              clears the others first). The pay step has its own single region inside PaymentSection. */}
            <p
              role="status"
              aria-atomic="true"
              style={{
                minHeight: 16,
                margin: "8px 0 0",
                fontSize: "var(--fs-sm)",
                color: payError || tabError ? "var(--warn)" : "var(--t2)",
              }}
            >
              {payError ?? tabError ?? status}
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
