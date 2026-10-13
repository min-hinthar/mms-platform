"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { LiveOrder } from "@/lib/live-order";
import { useLiveOrders } from "@/lib/useLiveOrders";

/**
 * Phase 1c (Codex round 1) — /account's ONE live-orders list. "Today" refreshes on wake and focus;
 * the Welcome-back chooser's disclosure names the order in progress a chip would strand. Computed
 * from the server snapshot, the note kept claiming an order that had finished while "Today" had
 * already dropped it, and missed one that started after the page loaded. Both now read this list:
 * seeded by the page's server read, kept fresh by `useLiveOrders` (one read, one freshness rule).
 */
const LiveOrdersContext = createContext<LiveOrder[] | null>(null);

export function AccountLiveOrders({
  initial,
  children,
}: {
  initial: LiveOrder[];
  children: ReactNode;
}) {
  // J — the one live-orders surface with no Realtime status of its own re-polls while a bag cooks.
  const { orders } = useLiveOrders(true, null, initial, { poll: true });
  return <LiveOrdersContext.Provider value={orders}>{children}</LiveOrdersContext.Provider>;
}

/** The refreshed list, or null outside the provider. */
export function useAccountLiveOrders(): LiveOrder[] | null {
  return useContext(LiveOrdersContext);
}
