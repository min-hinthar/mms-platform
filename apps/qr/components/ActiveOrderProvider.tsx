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
import { decodeCartCount, encodeCartCount } from "@/lib/order-noun";

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
  publishCart: (id: string, count: number | null) => void;
  /** "Leave this table": forget the open cart pointer and its count on this device. */
  forgetCart: () => void;
  /** The published cart's item count; null when this device has not seen the cart's contents (a cart
   *  reached by URL) — the header then names the object without claiming a number. */
  cartCount: number | null;
};

const KEY_MODE = "mms.qr.activeMode";
const KEY_CART = "mms.qr.activeCart";
const KEY_CART_COUNT = "mms.qr.activeCartCount";
const KEY_ORDER = "mms.qr.activeOrder";
const ORDER_TTL_MS = 4 * 60 * 60 * 1000; // 4h — a resumable order self-expires

const Ctx = createContext<ActiveOrderCtx | null>(null);

const noop = () => {};

/** For surfaces that may render outside the provider (Checkout's suites mount it bare): publishing is
 *  best-effort wayfinding, never a reason to throw. */
export function usePublishCart(): ActiveOrderCtx["publishCart"] {
  return useContext(Ctx)?.publishCart ?? noop;
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

  const publishCart = useCallback((id: string, count: number | null) => {
    if (!id) return;
    try {
      localStorage.setItem(KEY_CART, id);
      if (count === null) localStorage.removeItem(KEY_CART_COUNT);
      else localStorage.setItem(KEY_CART_COUNT, encodeCartCount(id, count));
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      setCartId(id); // async setState (lint-safe), like clearOrder
      setCartCount(count);
    });
  }, []);

  const forgetCart = useCallback(() => {
    try {
      localStorage.removeItem(KEY_CART);
      localStorage.removeItem(KEY_CART_COUNT);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      setCartId(null);
      setCartCount(null);
    });
  }, []);

  const value = useMemo(
    () => ({ mode, cartId, cartCount, order, clearOrder, publishCart, forgetCart }),
    [mode, cartId, cartCount, order, clearOrder, publishCart, forgetCart],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
