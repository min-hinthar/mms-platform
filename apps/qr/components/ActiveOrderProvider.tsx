"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CART_DOORS,
  cartForDoor,
  decodeCartCount,
  decodeCartMode,
  encodeCartCount,
  encodeCartMode,
} from "@/lib/order-noun";
import { tabsMode } from "@/lib/diner-tabs";

/**
 * Cross-route wayfinding memory (M-nav). QR screens are otherwise islands: `mode` is a URL param on `/menu`
 * only, and a placed order is reachable solely via the Stripe return URL. This tiny client store observes
 * the URL — capturing the diner's current `mode`, their open `cart` id, and the most recent LIVE order (the
 * `/track` success landing) — and persists them to `localStorage`, so the persistent header + homepage can
 * offer "your order" and "back to your cart" on ANY route. It holds only navigation KEYS (no money, no server
 * state); the pill/card derive the LIVE status from `useOrderStatus`. A TTL guards a resumable order so it
 * can't linger forever — a pure dine-in order never reaches a `picked_up` done-signal.
 *
 * Established pattern (not the unused Zustand dep): a root-layout React Context, mirroring TableCartProvider.
 * Lint-safe hydration: `localStorage` reads are SYNC in the effect body, but every state write is DEFERRED to
 * the next frame (async setState — the codebase's `set-state-in-effect` escape, see TierUpCelebration).
 */
export type ActiveOrder = {
  /** Single-pay key (Stripe PaymentIntent). null for split-tender — resumed via `cart` + `paid=1` instead. */
  paymentIntent: string | null;
  cartId: string | null;
  mode: string; // dinein | scango | pickup
  createdAt: number; // ms epoch — TTL guard (a dine-in order has no server done-signal)
};

type ActiveOrderCtx = {
  mode: string | null;
  cartId: string | null;
  order: ActiveOrder | null;
  /** Drop the resumable order (the pill/card call this once its live status reads terminal). */
  clearOrder: () => void;
  /** The menu publishes its server-minted open-cart id here (the menu URL carries no `?cart=`), so the
   *  header's off-menu "back to cart" link works after a menu-only session — not just after a /cart visit.
   *  Phase 1a: with its item COUNT, so the header never lights an empty cart. `null` = the publisher
   *  has not SEEN the contents yet (the first view is still loading, or failed) — the stored count is
   *  dropped rather than written as a zero it never observed. */
  publishCart: (id: string, count: number | null, mode?: string) => void;
  /** "Leave this table": forget the open cart pointer and its count on this device. */
  forgetCart: () => void;
  /** The published cart's item count; null when this device has not seen the cart's contents (a cart
   *  reached by URL) — the header then names the object without claiming a number. */
  cartCount: number | null;
  /** Codex round 3 on #312 (P1) — CartBar's W21 rule for the one other door to /cart. The cart
   *  provider is mounted only under the menu and the market, but the Order tab is mounted in the
   *  root layout, so the provider LENDS the store its `settled()` barrier while it is mounted
   *  (`CartPublisher`) and the tab awaits it before navigating: an add still in flight when the tab
   *  is tapped could otherwise be missed by /cart's first read or refused by its create-intent
   *  lock. Resolves at once on a route with no provider — nothing is pending there. */
  drain: () => Promise<void>;
  /** The cart provider's publisher registers its barrier on mount and withdraws it (`null`) on
   *  unmount, so a torn-down menu's ledger is never awaited from another route. */
  registerDrain: (fn: (() => Promise<void>) | null) => void;
};

const KEY_MODE = "mms.qr.activeMode";
const KEY_CART = "mms.qr.activeCart";
const KEY_CART_COUNT = "mms.qr.activeCartCount";
/** Codex round 2 on 3b — the DOOR the stored cart was published through (`<cartId>:<mode>`), so a
 *  door switch stops offering the previous door's cart before the new door has minted its own. */
const KEY_CART_MODE = "mms.qr.activeCartMode";
const KEY_ORDER = "mms.qr.activeOrder";
const ORDER_TTL_MS = 4 * 60 * 60 * 1000; // 4h — a resumable order self-expires

const Ctx = createContext<ActiveOrderCtx | null>(null);

const noop = () => {};

/** For surfaces that may render outside the provider (Checkout's suites mount it bare): publishing is
 *  best-effort wayfinding, never a reason to throw. */
export function usePublishCart(): ActiveOrderCtx["publishCart"] {
  return useContext(Ctx)?.publishCart ?? noop;
}

/** Same best-effort shape for the barrier's registration (CartPublisher mounts under a menu that
 *  Checkout's suites render bare). */
export function useRegisterDrain(): ActiveOrderCtx["registerDrain"] {
  return useContext(Ctx)?.registerDrain ?? noop;
}

export function useForgetCart(): ActiveOrderCtx["forgetCart"] {
  return useContext(Ctx)?.forgetCart ?? noop;
}

export function useActiveOrder(): ActiveOrderCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActiveOrder must be used within <ActiveOrderProvider>");
  return ctx;
}

function readStoredOrder(): ActiveOrder | null {
  try {
    const raw = localStorage.getItem(KEY_ORDER);
    if (!raw) return null;
    const o = JSON.parse(raw) as ActiveOrder;
    if (!o || typeof o.createdAt !== "number") return null;
    if (Date.now() - o.createdAt > ORDER_TTL_MS) {
      localStorage.removeItem(KEY_ORDER);
      return null;
    }
    return o;
  } catch {
    return null; // private-mode / malformed → no resumable order, never throw
  }
}

export function ActiveOrderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<string | null>(null);
  const [cartId, setCartId] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState<number | null>(null);
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const hydrated = useRef(false);
  // The lent barrier (see `drain` on the context type). A ref, never state: registering it must not
  // re-render every consumer of the store, and the tab reads it only inside a click.
  const drainRef = useRef<(() => Promise<void>) | null>(null);
  const registerDrain = useCallback((fn: (() => Promise<void>) | null) => {
    drainRef.current = fn;
  }, []);
  const drain = useCallback(() => drainRef.current?.() ?? Promise.resolve(), []);

  // Runs on every route/param change: persist fresh URL signals, capture a new live order on the /track
  // success landing, and hydrate the stored order once. Reads are sync; state writes ride a single rAF.
  useEffect(() => {
    const urlMode = searchParams?.get("mode") ?? null;
    const urlCart = searchParams?.get("cart") ?? null;

    let nextMode: string | null = null;
    let nextCart: string | null = null;
    let nextCount: number | null = null;
    try {
      if (urlMode) localStorage.setItem(KEY_MODE, urlMode);
      if (urlCart) localStorage.setItem(KEY_CART, urlCart);
      nextMode = urlMode ?? localStorage.getItem(KEY_MODE);
      nextCart = urlCart ?? localStorage.getItem(KEY_CART);
      // The remembered cart is offered only on the door it was published through (Codex round 2 on
      // 3b): the diner who leaves the market for /dine-in or the to-go menu stands in another door,
      // and its Order tab must not open the grocery basket while that door's cart is still minting
      // — or forever, if the mint fails. The door the diner is IN is the route's reading of the mode
      // (`tabsMode`: /grocery is scango whatever is stored; /dine-in is dinein), the cart's is the
      // stored pair. A cart reached by URL is explicit and never suppressed; a pointer written before
      // 3b (no door) is offered as before. The pointer itself is left in storage — the door that
      // owns it still does.
      if (!urlCart) {
        const door = decodeCartMode(localStorage.getItem(KEY_CART_MODE), nextCart);
        nextCart = cartForDoor(nextCart, door, tabsMode(pathname, nextMode));
      }
      // The count belongs to the STORED cart only; a different cart reached by URL has an unknown one.
      nextCount = decodeCartCount(localStorage.getItem(KEY_CART_COUNT), nextCart);
    } catch {
      nextMode = urlMode;
      nextCart = urlCart;
    }

    // `undefined` = "don't touch order this run"; `null`/value = an explicit write.
    let nextOrder: ActiveOrder | null | undefined = undefined;
    if (pathname === "/track") {
      const status = searchParams?.get("redirect_status") ?? null;
      const pi = searchParams?.get("payment_intent") ?? null;
      const paid = searchParams?.get("paid") ?? null;
      const succeeded = status === "succeeded" && pi !== null;
      const splitPaid = paid !== null && urlCart !== null && pi === null; // split-tender: no PI, resume via cart+paid
      if (succeeded || splitPaid) {
        const captured: ActiveOrder = {
          paymentIntent: succeeded ? pi : null,
          cartId: urlCart,
          mode: nextMode ?? "scango",
          createdAt: Date.now(),
        };
        try {
          localStorage.setItem(KEY_ORDER, JSON.stringify(captured));
          localStorage.removeItem(KEY_CART); // the open cart is now a placed order
          localStorage.removeItem(KEY_CART_COUNT);
          localStorage.removeItem(KEY_CART_MODE);
        } catch {
          /* private mode — the pill just won't persist across a reload */
        }
        nextOrder = captured;
        nextCart = null; // drop the "back to cart" affordance — the cart became this order
        nextCount = null;
      }
    }
    if (nextOrder === undefined && !hydrated.current) nextOrder = readStoredOrder();
    hydrated.current = true;

    const raf = requestAnimationFrame(() => {
      setMode(nextMode);
      setCartId(nextCart);
      setCartCount(nextCount);
      if (nextOrder !== undefined) setOrder(nextOrder);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, searchParams]);

  const clearOrder = useCallback(() => {
    try {
      localStorage.removeItem(KEY_ORDER);
    } catch {
      /* ignore */
    }
    // Deferred (async) setState so a caller inside a status-effect stays lint-safe.
    requestAnimationFrame(() => setOrder(null));
  }, []);

  const publishCart = useCallback((id: string, count: number | null, mode?: string) => {
    if (!id) return;
    // Codex round 3 on #300: the door a cart belongs to travels WITH it when the publisher knows it
    // from the session (Checkout's split context). /grocery carries no `?mode=` in its URL, so the
    // URL-observed mode could still name a market basket "Your order" — or a stale `dinein` could
    // withhold its count as if it were a shared table cart.
    const known = mode && CART_DOORS.has(mode) ? mode : null;
    try {
      localStorage.setItem(KEY_CART, id);
      if (known) localStorage.setItem(KEY_MODE, known);
      // The door travels with the id (Codex round 2 on 3b): a publisher that does not know its door
      // leaves the pair alone rather than stamping a guess — and clears a pair for ANOTHER cart, so a
      // stale door never binds to a new id.
      if (known) localStorage.setItem(KEY_CART_MODE, encodeCartMode(id, known));
      else if (decodeCartMode(localStorage.getItem(KEY_CART_MODE), id) === null)
        localStorage.removeItem(KEY_CART_MODE);
      if (count === null) localStorage.removeItem(KEY_CART_COUNT);
      else localStorage.setItem(KEY_CART_COUNT, encodeCartCount(id, count));
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      setCartId(id); // async setState (lint-safe), like clearOrder
      setCartCount(count);
      if (known) setMode(known);
    });
  }, []);

  const forgetCart = useCallback(() => {
    try {
      localStorage.removeItem(KEY_CART);
      localStorage.removeItem(KEY_CART_COUNT);
      localStorage.removeItem(KEY_CART_MODE);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      setCartId(null);
      setCartCount(null);
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      cartId,
      cartCount,
      order,
      clearOrder,
      publishCart,
      forgetCart,
      drain,
      registerDrain,
    }),
    [mode, cartId, cartCount, order, clearOrder, publishCart, forgetCart, drain, registerDrain],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
