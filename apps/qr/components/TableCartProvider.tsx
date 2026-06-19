"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartItem, CartTotals } from "@mms/db";
import { addItem as addItemAction, getCartView } from "@/lib/cart";
import { useTableSession } from "@/lib/useTableSession";

type CartCtx = {
  cartId: string | null;
  loading: boolean;
  error: string | null;
  items: CartItem[];
  totals: CartTotals | null;
  count: number;
  add: (menuItemId: string) => Promise<void>;
  refresh: () => Promise<void>;
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
 * mutation — never client math). Wraps the server-rendered menu so the `<AddButton>`s and
 * `<CartBar>` share a single session + cart.
 */
export function TableCartProvider({ mode, children }: { mode: string; children: ReactNode }) {
  const { session, loading, error } = useTableSession(mode);
  const cartId = session?.cartId ?? null;
  const [items, setItems] = useState<CartItem[]>([]);
  const [totals, setTotals] = useState<CartTotals | null>(null);

  const refresh = useCallback(async () => {
    if (!cartId) return;
    const v = await getCartView(cartId);
    setItems(v.items);
    setTotals(v.totals);
  }, [cartId]);

  // Initial load when the cart id resolves — setState lives in the `.then` callback (the allowed
  // pattern: sync React from an external system), with a cancel guard against an unmounted update.
  useEffect(() => {
    if (!cartId) return;
    let active = true;
    void getCartView(cartId).then((v) => {
      if (!active) return;
      setItems(v.items);
      setTotals(v.totals);
    });
    return () => {
      active = false;
    };
  }, [cartId]);

  const add = useCallback(
    async (menuItemId: string) => {
      if (!cartId) return;
      await addItemAction(cartId, menuItemId, []); // base item; modifier sheet is follow-up polish
      await refresh();
    },
    [cartId, refresh],
  );

  const count = items.reduce((a, i) => a + i.qty, 0);

  return (
    <Ctx.Provider value={{ cartId, loading, error, items, totals, count, add, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
