"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { staffAddItem } from "@/lib/staff-cart";

/**
 * Add-to-table button on the staff menu browser (S1.3). Like the diner AddButton it adds the BASE item
 * (no modifier picker at this tier — parity with the guest menu); the server re-derives the price. Shows
 * a transient "Added ✓" so a server tapping through a round knows it landed. Soft-disabled when sold out.
 */
export function StaffAddButton({
  sessionId,
  menuItemId,
  name,
  soldOut,
}: {
  sessionId: string;
  menuItemId: string;
  name: string;
  soldOut: boolean | null;
}) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await staffAddItem({ sessionId, menuItemId });
      if (res.ok) {
        setAdded(true);
        setTimeout(() => setAdded(false), 1400);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <span
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}
    >
      <button
        type="button"
        onClick={add}
        disabled={pending || !!soldOut}
        aria-label={soldOut ? `${name} is sold out` : `Add ${name} to the table`}
        style={{
          ...btn,
          background: soldOut ? "var(--sf)" : "var(--ac)",
          color: soldOut ? "var(--t3)" : "var(--oa)",
          opacity: !soldOut && pending ? 0.6 : 1,
        }}
      >
        {pending ? "…" : soldOut ? "Sold out" : added ? "Added ✓" : "Add"}
      </button>
      {error && (
        <span
          role="status"
          aria-live="polite"
          style={{ fontSize: 11, color: "var(--warn)", maxWidth: 96 }}
        >
          {error}
        </span>
      )}
    </span>
  );
}

const btn: CSSProperties = {
  minHeight: 44,
  minWidth: 64,
  padding: "0 16px",
  borderRadius: 999,
  border: "none",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  alignSelf: "center",
};
