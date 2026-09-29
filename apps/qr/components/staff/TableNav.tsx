"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";

/**
 * Phase 2d · split — the in-table exits, bound ONCE. A table's own controls leave it three ways —
 * Clear (the table is gone), Merge (the order moved to another table), and the paid card's "Back to
 * the counter" — and where each lands depends on WHERE the table is shown:
 *
 *   · the full page (`/staff/table/[id]`, a phone, a bookmark): no provider — the router goes to
 *     the counter floor BY NAME (a bare `/staff` resolves by the door cookie and lands a kitchen-
 *     doored tablet on the doors) or to the target table's page;
 *   · the counter's pane (`TablePane`): the provider closes the pane (the floor is already beside
 *     it) or switches it to the target table — one history entry, no route change, no second
 *     /staff render.
 *
 * `reason` tells the pane where focus goes after: a CLEARED table's card is still in the DOM until
 * the floor's next poll, so it goes to the floor heading, never onto a card about to vanish.
 */
export type TableHint = { counter: boolean; display: string };

export type TableNav = {
  toFloor: (reason: "user" | "cleared") => void;
  toTable: (sessionId: string, hint: TableHint) => void;
  /** True inside the pane — a control that renders a way back to the counter renders it as a close. */
  inPane: boolean;
};

const Ctx = createContext<TableNav | null>(null);

export function TableNavProvider({ value, children }: { value: TableNav; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTableNav(): TableNav {
  const router = useRouter();
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    inPane: false,
    toFloor: () => {
      router.replace(STAFF_DOOR_TARGET.counter);
      router.refresh();
    },
    toTable: (sessionId) => {
      router.replace(`/staff/table/${sessionId}`);
      router.refresh();
    },
  };
}
