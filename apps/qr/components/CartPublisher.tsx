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
  // Codex round 2: and the CONFIRMED lines, never `count` — that one carries `pendingDelta`, so a tap
  // followed by an instant navigation left a refused edit's optimistic number in storage with no
  // mounted provider to correct it. `items` is written only from a server view (`applyView`).
  // Codex round 2 on 3b (#312): and the DOOR — the provider's `mode` is the session's, so the store
  // can bind the pointer to the door it belongs to and stop offering it from another door.
  const { cartId, items, totals, settled, mode } = useCart();
  const { publishCart, registerDrain } = useActiveOrder();
  const known = totals !== null;
  const confirmed = items.reduce((n, i) => n + i.qty, 0);
  useEffect(() => {
    if (cartId) publishCart(cartId, known ? confirmed : null, mode);
  }, [cartId, confirmed, known, mode, publishCart]);
  // Codex round 3 on #312 (P1) — lend the store this provider's `settled()` barrier while mounted,
  // so the root layout's Order tab can drain in-flight writes before it leaves for /cart exactly as
  // CartBar does (W21). Withdrawn on unmount: another route has nothing of this ledger to await.
  useEffect(() => {
    registerDrain(settled);
    return () => registerDrain(null);
  }, [registerDrain, settled]);
  return null;
}
