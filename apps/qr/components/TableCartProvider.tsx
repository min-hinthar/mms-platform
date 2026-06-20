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
import type { CartItem, CartTotals } from "@mms/db";
import { addItem as addItemAction, getCartView } from "@/lib/cart";
import { useTableSession } from "@/lib/useTableSession";
import { PickupSlotSheet } from "./PickupSlotSheet";

type CartCtx = {
  cartId: string | null;
  loading: boolean;
  error: string | null;
  items: CartItem[];
  totals: CartTotals | null;
  count: number;
  add: (menuItemId: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Pickup mode only: the chosen slot (ISO instant) + a way to (re)open the picker. */
  pickupSlot: string | null;
  openSlotSheet: () => void;
};

const Ctx = createContext<CartCtx | null>(null);

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within <TableCartProvider>");
  return c;
}

/**
 * One source of truth for the menu's cart interactions: establishes the table session/cart once
 * (not per item) and exposes the live, server-authoritative cart view (re-fetched after each
 * mutation — never client math). For pickup mode it also owns the slot picker: it surfaces the
 * `PickupSlotSheet` on first load when no slot is set yet, and exposes the chosen slot.
 */
export function TableCartProvider({ mode, children }: { mode: string; children: ReactNode }) {
  const { session, loading, error } = useTableSession(mode);
  const cartId = session?.cartId ?? null;
  const isPickup = mode === "pickup";
  const [items, setItems] = useState<CartItem[]>([]);
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [pickupSlot, setPickupSlot] = useState<string | null>(null);
  const [slotSheetOpen, setSlotSheetOpen] = useState(false);
  const autoOpened = useRef(false); // only auto-prompt for a slot once per mount

  const refresh = useCallback(async () => {
    if (!cartId) return;
    try {
      const v = await getCartView(cartId);
      setItems(v.items);
      setTotals(v.totals);
      setPickupSlot(v.pickupSlot);
    } catch {
      // Cart no longer open (paid/closed) → assertCartMember 403. Swallow so a stale read after a
      // successful add can't surface as a false-negative "Couldn't add"; P1.3 redirects to a receipt.
    }
  }, [cartId]);

  // Initial load when the cart id resolves — setState lives in the `.then` callback (the allowed
  // pattern: sync React from an external system), with a cancel guard against an unmounted update.
  useEffect(() => {
    if (!cartId) return;
    let active = true;
    void getCartView(cartId)
      .then((v) => {
        if (!active) return;
        setItems(v.items);
        setTotals(v.totals);
        setPickupSlot(v.pickupSlot);
        // Pickup with no slot yet → prompt once (the diner schedules before ordering, per v7.2).
        if (isPickup && !v.pickupSlot && !autoOpened.current) {
          autoOpened.current = true;
          setSlotSheetOpen(true);
        }
      })
      .catch(() => {
        // Cart paid/closed between session mint and first load — leave the view empty (no throw).
      });
    return () => {
      active = false;
    };
  }, [cartId, isPickup]);

  // One polite live region for transactional feedback (RED-TEAM/QA). We announce a brief, STATIC
  // confirmation on success and a generic message on failure (WCAG 4.1.3 status messages) — but
  // never the rolling total itself (the CartBar/total deliberately aren't aria-live, so SR users
  // don't hear the amount re-read on every tap). Server errors are redacted in prod → generic text.
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAdds, setPendingAdds] = useState(0); // optimistic in-flight adds (instant count bump)

  const add = useCallback(
    async (menuItemId: string) => {
      if (!cartId) return;
      // Optimistic: bump the visible count + confirm on tap, so the cart bar responds immediately
      // instead of after the round-trip. The total stays server-authoritative (no client price math),
      // so it settles when the view returns — the count is the instant feedback.
      setPendingAdds((n) => n + 1);
      setNotice("Added to your order");
      setTimeout(() => setNotice(null), 2000);
      try {
        const view = await addItemAction(cartId, menuItemId, []); // ONE round-trip — returns the view
        setItems(view.items);
        setTotals(view.totals);
        setPickupSlot(view.pickupSlot);
      } catch (e) {
        setNotice("Couldn’t add that — please try again.");
        setTimeout(() => setNotice(null), 3000);
        throw e;
      } finally {
        setPendingAdds((n) => n - 1);
      }
    },
    [cartId],
  );

  const openSlotSheet = useCallback(() => setSlotSheetOpen(true), []);
  const count = items.reduce((a, i) => a + i.qty, 0) + pendingAdds;

  return (
    <Ctx.Provider
      value={{
        cartId,
        loading,
        error,
        items,
        totals,
        count,
        add,
        refresh,
        pickupSlot,
        openSlotSheet,
      }}
    >
      {children}
      {isPickup && cartId && (
        <PickupSlotSheet
          open={slotSheetOpen}
          onOpenChange={setSlotSheetOpen}
          cartId={cartId}
          onChosen={(slot) => setPickupSlot(slot)} // slot is cart metadata — no items/totals refetch
        />
      )}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 84,
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 50,
        }}
      >
        {notice && (
          <span
            style={{
              display: "inline-block",
              background: "var(--tx)",
              color: "var(--pg)",
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {notice}
          </span>
        )}
      </div>
    </Ctx.Provider>
  );
}
