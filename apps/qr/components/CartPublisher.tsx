"use client";
import { useEffect } from "react";
import { useCart } from "./TableCartProvider";
import { useActiveOrder } from "./ActiveOrderProvider";

/**
 * Publishes the menu's server-minted open-cart id to the wayfinding store (M-nav follow-up). The menu URL
 * carries no `?cart=` (its id lives in TableCartProvider), so without this the header's off-menu "back to
 * cart" link only appeared after a `/cart` visit. Mount inside `<TableCartProvider>` (needs `useCart`);
 * renders nothing. The publish setState is rAF-deferred inside the store — lint-safe.
 */
export function CartPublisher() {
  // Phase 1a — the COUNT travels with the id: the header offers "Your order · N" only for a cart
  // with something in it (merely viewing the menu used to light "Cart" everywhere else).
  // Blind pass on #300: `items` starts EMPTY and fills only when the first view lands, so a count
  // published on `cartId` alone wrote a ZERO nobody observed — and a failed or abandoned first read
  // left it there, hiding a cart with dishes in it on every other page. `totals` is null until a view
  // has been applied, so until then the count is honestly unknown.
  const { cartId, count, totals } = useCart();
  const { publishCart } = useActiveOrder();
  const known = totals !== null;
  useEffect(() => {
    if (cartId) publishCart(cartId, known ? count : null);
  }, [cartId, count, known, publishCart]);
  return null;
}
