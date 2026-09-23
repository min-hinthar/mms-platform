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
  const { cartId, count } = useCart();
  const { publishCart } = useActiveOrder();
  useEffect(() => {
    if (cartId) publishCart(cartId, count);
  }, [cartId, count, publishCart]);
  return null;
}
