"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
};

const KEY_MODE = "mms.qr.activeMode";
const KEY_CART = "mms.qr.activeCart";
const KEY_ORDER = "mms.qr.activeOrder";
const ORDER_TTL_MS = 4 * 60 * 60 * 1000; // 4h — a resumable order self-expires

const Ctx = createContext<ActiveOrderCtx | null>(null);

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
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const hydrated = useRef(false);

  // Runs on every route/param change: persist fresh URL signals, capture a new live order on the /track
  // success landing, and hydrate the stored order once. Reads are sync; state writes ride a single rAF.
  useEffect(() => {
    const urlMode = searchParams?.get("mode") ?? null;
    const urlCart = searchParams?.get("cart") ?? null;

    let nextMode: string | null = null;
    let nextCart: string | null = null;
    try {
      if (urlMode) localStorage.setItem(KEY_MODE, urlMode);
      if (urlCart) localStorage.setItem(KEY_CART, urlCart);
      nextMode = urlMode ?? localStorage.getItem(KEY_MODE);
      nextCart = urlCart ?? localStorage.getItem(KEY_CART);
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
        } catch {
          /* private mode — the pill just won't persist across a reload */
        }
        nextOrder = captured;
      }
    }
    if (nextOrder === undefined && !hydrated.current) nextOrder = readStoredOrder();
    hydrated.current = true;

    const raf = requestAnimationFrame(() => {
      setMode(nextMode);
      setCartId(nextCart);
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

  return <Ctx.Provider value={{ mode, cartId, order, clearOrder }}>{children}</Ctx.Provider>;
}
