"use client";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Codex round 4 on #312 (P2) — is the account panel this subtree sits in the one SHOWING?
 *
 * The hub keeps every panel in the DOM (`hidden`) so the page's document order is pinned and a tab
 * tap is instant — but React runs a hidden subtree's effects all the same. `TierUpCelebration`
 * evaluated its one-shot on mount, wrote the new tier baseline and started its 5.2s dismissal inside
 * a panel nobody could see, so a real climb was consumed unseen the moment a diner opened the
 * default Orders panel. A one-shot moment must evaluate only where it can be seen.
 *
 * Provided by `AccountHub` around each panel; `true` by default so a surface mounted outside the hub
 * (the kiosk, a test, a future standalone page) behaves exactly as before.
 */
const Ctx = createContext(true);

export function AccountPanelVisible({ value, children }: { value: boolean; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccountPanelVisible(): boolean {
  return useContext(Ctx);
}
