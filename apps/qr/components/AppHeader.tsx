"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
// J1: header navs ride the journey grammar (direction-stamped view transitions) — drop-in Link swap.
import { TransitionLink as Link } from "./nav/TransitionNav";
import { browserClient } from "@mms/db";
import { Icon } from "@mms/ui";
import { useActiveOrder } from "./ActiveOrderProvider";
import { useActiveOrderStatus } from "./useActiveOrderStatus";
import { useLiveOrders } from "@/lib/useLiveOrders";
import { liveOrderTrackHref } from "@/lib/live-order";
import { getRewardsBadge, type RewardsBadge } from "@/lib/rewards";
import { WalletChip } from "./WalletChip";
import { OrdersTray } from "./OrdersTray";
import { LiveOrderRow } from "./LiveOrderRow";
import { buildLiveOrderPanel } from "@/lib/live-order-panel";

/**
 * Persistent top app-bar (M-nav) — the diner's wayfinding spine across every route: brand→home, a contextual
 * "your order" pill that resumes the live tracker, a rewards affordance (Star count + anon "save" nudge)→
 * account, and an off-menu "back to cart" link. Mounted once in the root layout (inside MotionProvider); it
 * early-returns on `/staff` (staff run their own console), mirroring AnonAuthGate's path-exclusion.
 *
 * Cart is a LINK, not a live counter: `useCart()`/TableCartProvider wrap only the menu subtree, so a
 * root-layout bar has no provider on `/cart`/`/track`/`/account`. The menu publishes its cart id to the store
 * (CartPublisher), so the link shows off-menu after any menu session (the bottom CartBar owns the live count).
 *
 * Live status (single-pay AND split-tender) comes from `useActiveOrderStatus`, which resolves the split order
 * id server-side. The hook subscribes only where the pill can show (`track`) — not on `/`/`/track`, where the
 * homepage card / OrderTracker already track — so there's one realtime channel per route.
 */
export function AppHeader() {
  const pathname = usePathname();
  // Staff run their own console; /board (W3e) is a wall TV — diner wayfinding chrome on either is noise.
  const hidden =
    (pathname?.startsWith("/staff") ||
      pathname?.startsWith("/board") ||
      // W6b: the kiosk is a locked-down self-serve surface — no app nav, no cart chrome, no account.
      pathname?.startsWith("/kiosk")) ??
    false;

  const { cartId } = useActiveOrder();
  // The order affordance is redundant where a dedicated surface already shows it: the homepage resume card
  // (`/`), the live tracker (`/track`), and the /account "Today" section — so hide it (and skip its fetch)
  // on all three.
  const track = !hidden && pathname !== "/" && pathname !== "/track" && pathname !== "/account";
  const { order, tracked, kind, statusWord, ready, isDone } = useActiveOrderStatus(track);

  const [badge, setBadge] = useState<RewardsBadge | null>(null);
  const orderKey = order?.paymentIntent ?? order?.cartId ?? null;
  // K4 — the diner's LIVE orders (server-derived), refetched on visibility/focus + when the poke changes:
  // a new order (orderKey) or an in-app navigation (pathname, matching the rewards badge's freshness). Only
  // fetched where the pill can show (`track`); no new realtime channels.
  const { orders: liveOrders } = useLiveOrders(track, `${orderKey ?? ""}:${pathname ?? ""}`);
  const [trayOpen, setTrayOpen] = useState(false);
  // W22b — the single chip's disclosure. NOT a dialog: `aria-haspopup="dialog"` stays reserved for the
  // ≥2-order tray below, so the dialog vocabulary keeps meaning "there is more than one order".
  const [chipOpen, setChipOpen] = useState(false);
  const panelId = useId();
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLAnchorElement | null>(null);
  // Refetch on mount, a new order (orderKey), and route change — the Star may be stamped by the webhook
  // AFTER the diner leaves /track, so a route change back to /menu should refresh the count. Async setState
  // (in .then) → lint-safe; a transient failure just leaves the plain "Rewards" label.
  useEffect(() => {
    if (hidden) return;
    let active = true;
    getRewardsBadge()
      .then((b) => {
        if (active) setBadge(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hidden, orderKey, pathname]);

  // React to AUTH changes (anon→account upgrade): the header is mounted once in the root layout and
  // `router.refresh()` re-runs only Server Components — NOT this client effect — so without this the "Save
  // your Stars" nudge + Star count stay stale after sign-in until a full reload. Subscribe to the
  // browserClient() singleton's auth events (it receives the ones AccountUpgrade fires) and refetch, so
  // `isUpgraded` flips true and the nudge disappears the instant the account confirms. Mirrors useAnonSession.
  useEffect(() => {
    if (hidden) return;
    let active = true;
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        getRewardsBadge()
          .then((b) => {
            if (active) setBadge(b);
          })
          .catch(() => {});
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hidden]);

  // The order affordance is redundant on the homepage (the resume card lives there) and on /track (you're
  // already watching it); `track` excludes both, so show it everywhere else while an order is live.
  const onMenu = pathname === "/menu";

  // K4 — one affordance for however many orders are in flight:
  //  • ≥2 live  → a count-badged pill that opens the tray (it earns its ink only when it disambiguates).
  //  • ≤1 live  → the single pill: this device's own just-placed order (instant, realtime status word) if
  //    known, else the lone server order (a cross-device order this device didn't place).
  //  • 0        → nothing.
  const liveCount = liveOrders.length;
  const clientLive = !!order && !isDone; // this device's order — realtime status, shows instantly on pay
  const showTray = track && liveCount >= 2;
  const serverSingle = !clientLive && liveCount === 1 ? liveOrders[0]! : null;
  const showSingle = track && !showTray && (clientLive || !!serverSingle);
  const hasOrderPill = showSingle || showTray;

  // The single pill's link + label: from the client order (realtime status) or the lone server order.
  let singleHref = "";
  let singleBase = "Your order";
  let singleWord: string | null = null;
  let singleReady = false;
  if (clientLive && order) {
    singleHref = liveOrderTrackHref(order);
    singleBase = order.mode === "pickup" ? "Pickup" : "Your order";
    singleWord = statusWord; // the base+status split lets the word drop on very narrow phones (dot stays)
    singleReady = ready;
  } else if (serverSingle) {
    singleHref = liveOrderTrackHref(serverSingle);
    singleBase = serverSingle.kind === "pickup" ? "Pickup" : "Your order";
    singleWord = serverSingle.statusWord;
    singleReady = serverSingle.togoStatus === "ready";
  }

  // Cart affordance yields to ANY order pill (single or tray) — an order supersedes its now-placed cart.
  const showCart = !!cartId && !showSingle && !showTray && !onMenu && pathname !== "/cart";

  // ── W22b · the chip's disclosure behaviour ─────────────────────────────────────────────────────
  // Panel content is built in `lib/live-order-panel.ts` (a rule left in a .tsx cannot be guarded —
  // there is no React test runner here). The chip decides only WHEN to open.
  const panel = clientLive && tracked && kind ? buildLiveOrderPanel(tracked, kind) : null;
  const closeChip = useCallback(() => {
    setChipOpen(false);
  }, []);

  // A route change closes the panel. Render-time compare rather than an effect: the panel must be gone
  // on the SAME render the route changes, and the header is snapshotted as an image during a J1 view
  // transition — a panel caught mid-navigation would be baked into that snapshot.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setChipOpen(false);
  }

  // The chip can vanish UNDER an open panel: `useActiveOrderStatus` retires the order the moment it
  // reads terminal — the expo bumping `picked_up` while the diner has the panel open. Two separate
  // problems, deliberately handled in two places:
  //
  //  1. the STATE, folded shut at render time (the sanctioned "adjust state when inputs change"
  //     pattern, and the reason the panel is gated on `showSingle && chipOpen` below) — an effect
  //     here would paint one frame of a panel belonging to an order that no longer exists;
  //  2. the FOCUS, which is a DOM side effect and so belongs in an effect. A focus restore to a node
  //     that has left the DOM silently falls to <body>, stranding a keyboard user at the top of the
  //     document with nothing announced, so focus is re-parked on the brand link — the only
  //     always-present focusable in the layout.
  if (chipOpen && !showSingle) setChipOpen(false);
  const hadPanelRef = useRef(false);
  useEffect(() => {
    const open = chipOpen && showSingle;
    if (open) {
      hadPanelRef.current = true;
      return;
    }
    if (!hadPanelRef.current) return;
    hadPanelRef.current = false;
    // Only re-park when the chip actually left AND focus was orphaned by its removal.
    if (!showSingle && (document.activeElement === document.body || !document.activeElement))
      brandRef.current?.focus();
  }, [chipOpen, showSingle]);

  // Esc closes and returns focus to the chip; a pointerdown outside closes WITHOUT moving focus (a
  // tap elsewhere is not a request to be sent back to the header).
  useEffect(() => {
    if (!chipOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setChipOpen(false);
      chipRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t) || chipRef.current?.contains(t)) return;
      setChipOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [chipOpen]);

  if (hidden) return null;

  const anonWithStars = !!badge && !badge.isUpgraded && badge.stars > 0;
  const rewardsAria = badge
    ? `Rewards, ${badge.stars} ${badge.stars === 1 ? "Star" : "Stars"}${anonWithStars ? " — save them to an account" : ""}`
    : "Rewards and account";

  return (
    <header className={`app-header${hasOrderPill ? " app-header--has-order" : ""}`}>
      <Link
        href="/"
        ref={brandRef}
        className="app-header-brand"
        aria-label="Mandalay Morning Star — home"
      >
        {/* W5c·r2: the official Morning Star badge (same asset the delivery app ships) replaces the ✦
            glyph in the brand lockup — the ✦ stays the in-app accent mark everywhere else. Decorative
            here (alt="") — the Link's aria-label + the wordmark carry the name. */}
        <Image src="/logo.png" alt="" width={51} height={34} className="app-header-logo" priority />
        <span className="app-header-brand-word">Morning Star</span>
      </Link>

      <nav className="app-header-actions" aria-label="Account and order">
        {showSingle && (
          // W22b — the chip is a DISCLOSURE, not a link: tapping it opens the order in place rather
          // than spending a navigation, which is what makes it feel ambient on an installed phone.
          // /track is still one tap away — it is the panel's primary action.
          <button
            type="button"
            ref={chipRef}
            onClick={() => setChipOpen((o) => !o)}
            className={`app-header-order app-header-order-chip${singleReady ? " app-header-order-ready" : ""}${chipOpen ? " app-header-order-open" : ""}`}
            aria-expanded={chipOpen}
            // Only reference the panel while it is mounted — no dangling IDREF when closed.
            aria-controls={chipOpen ? panelId : undefined}
            aria-label={`${singleBase}${singleWord ? ` · ${singleWord}` : ""} — order details`}
          >
            <span className="app-header-order-dot" aria-hidden />
            {/* `.vt-order-status` (J1): on the chip→/track cut this label MORPHS into the tracker's
                status chip — the diner follows their order's status across the navigation. The chip
                hides on /track, so the view-transition name is never duplicated in one document. */}
            <span className="app-header-order-label vt-order-status">
              {singleBase}
              {singleWord && <span className="app-header-order-status"> · {singleWord}</span>}
            </span>
            <span className={`app-header-order-caret${chipOpen ? " is-open" : ""}`} aria-hidden>
              ⌄
            </span>
          </button>
        )}
        {showTray && (
          <button
            type="button"
            onClick={() => setTrayOpen(true)}
            className="app-header-order app-header-order-tray"
            aria-haspopup="dialog"
            aria-expanded={trayOpen}
            aria-label={`${liveCount} orders in progress — open your orders`}
          >
            <span className="app-header-order-dot" aria-hidden />
            <span className="app-header-order-label">Orders</span>
            <span className="app-header-order-count" aria-hidden>
              {liveCount}
            </span>
          </button>
        )}
        {showCart && (
          <Link
            href={`/cart?cart=${encodeURIComponent(cartId)}`}
            className="app-header-cart"
            aria-label="Back to your cart"
          >
            <Icon name="cart" size={18} />
            <span>Cart</span>
          </Link>
        )}
        {/* K3a: a SIGNED-IN diner gets the persistent tier-tinted wallet chip (recognition); an
            anonymous diner keeps the quiet ✦ + count + "Save" nudge (the pitch, gated on !isUpgraded). */}
        {badge?.isUpgraded ? (
          <WalletChip badge={badge} />
        ) : (
          <Link href="/account" className="app-header-rewards" aria-label={rewardsAria}>
            <span className="app-header-star" aria-hidden>
              ✦
            </span>
            <span>{badge && badge.stars > 0 ? badge.stars : "Rewards"}</span>
            {anonWithStars && (
              <span className="app-header-save" aria-hidden>
                Save
              </span>
            )}
          </Link>
        )}
      </nav>
      {/* W22b — the expanded chip. A DOM sibling of the button inside <header>, which is `position:
          sticky` with no `overflow`: the panel is contained (so it inherits the header's stacking
          context and sits above page content but under any sheet scrim) yet unclipped. It is
          deliberately NOT a live region — kitchen transitions are ambient state, every diner route
          already owns its one announcer, and this is chrome mounted once in the root layout, so an
          `aria-live` here would be the second (or, on /cart, the fourth) announcer on every screen. */}
      {showSingle && chipOpen && (
        <div id={panelId} ref={panelRef} className="app-header-panel mms-rise">
          {panel ? (
            <>
              <div className="app-header-panel-head">
                <span className="app-header-panel-mode">{panel.modeLabel}</span>
                {panel.itemSummary && (
                  <span className="app-header-panel-count">{panel.itemSummary}</span>
                )}
              </div>
              {panel.context && <p className="app-header-panel-context">{panel.context}</p>}
              <dl className="app-header-panel-rows">
                {panel.rows.map((r) => (
                  <div key={r.label} className="app-header-panel-row">
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            // A cross-device order this phone did not place: the server row carries the mode, the
            // context and the honest status word, but no totals and no expo stamps — so it renders
            // its reduced form rather than an empty panel pretending to load.
            serverSingle && (
              <ul className="app-header-panel-rowlist" role="list">
                <li>
                  <LiveOrderRow order={serverSingle} onNavigate={closeChip} />
                </li>
              </ul>
            )
          )}
          {/* Placed, but the row has not reached this device yet (the webhook is still landing, or the
              live read has given up on a cleared table). Say only what is true — the chip's own word —
              rather than render an empty shell that reads as a broken panel. */}
          {!panel && !serverSingle && singleWord && (
            <p className="app-header-panel-context">{singleWord}</p>
          )}
          <Link href={singleHref} className="app-header-panel-cta" onClick={closeChip}>
            View full status
          </Link>
          {/* The same honest limitation the tray states: a cash-settled order records the staff member
              who closed it, not an earner, so it cannot appear in a "your orders" read at all. Without
              this line a cash payer reads the chip's absence as "we lost your order". */}
          <p className="app-header-panel-note">Cash-paid orders aren’t shown here.</p>
        </div>
      )}
      {/* Radix portals the sheet to <body>; `open` folds to false when there's nothing to show, so a
          completing order can't leave the tray stranded open. */}
      <OrdersTray
        open={trayOpen && liveOrders.length > 0}
        onOpenChange={setTrayOpen}
        orders={liveOrders}
      />
    </header>
  );
}
