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
  const { cartId } = useCart();
  const { publishCart } = useActiveOrder();
  useEffect(() => {
    if (cartId) publishCart(cartId);
  }, [cartId, publishCart]);
  return null;
}
