"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@mms/ui";
import { staffAddItem } from "@/lib/staff-cart";

/**
 * Add-to-table button on the staff menu browser (S1.3). Like the diner AddButton it adds the BASE item
 * (no modifier picker at this tier — parity with the guest menu); the server re-derives the price.
 * OPTIMISTIC (the AddButton pattern): "Added ✓" flips the instant it's tapped — the page copy promises
 * "it lands on the table's order instantly" and a server tapping through a round shouldn't wait out the
 * round-trip — then reverts with the error if the write is refused. Soft-disabled when sold out.
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
  // One reset timer, cancelled before re-arm + on unmount (the TableCartProvider flash discipline).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function add() {
    setError(null);
    setAdded(true); // optimistic — reverted below if the server refuses OR the action throws
    if (timer.current) clearTimeout(timer.current);
    startTransition(async () => {
      try {
        const res = await staffAddItem({ sessionId, menuItemId });
        if (res.ok) {
          timer.current = setTimeout(() => setAdded(false), 1400);
        } else {
          setAdded(false);
          setError(res.error);
        }
      } catch {
        // A THROWN action (network/transport, redacted server error) must also revert the optimistic
        // "Added ✓" — without this catch it would stick forever while nothing landed on the order.
        setAdded(false);
        setError("Couldn’t add that — try again.");
      }
    });
  }

  return (
    <span
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}
    >
      <button
        className="staff-btn"
        type="button"
        onClick={add}
        disabled={pending || !!soldOut}
        aria-label={soldOut ? `${name} is sold out` : `Add ${name} to the table`}
        style={{
          ...btn,
          background: soldOut ? "var(--sf)" : "var(--ac)",
          color: soldOut ? "var(--t3)" : "var(--oa)",
        }}
      >
        {soldOut ? (
          "Sold out"
        ) : added ? (
          <>
            Added{" "}
            <Icon name="check" size={16} strokeWidth={2.25} style={{ verticalAlign: "-3px" }} />
          </>
        ) : (
          "Add"
        )}
      </button>
      {/* role="alert" (not status): an alert announces reliably when it MOUNTS with content — the exact
          shape here (the region appears with the error). Conditional per-item, like a form field error. */}
      {error && (
        <span role="alert" style={{ fontSize: "var(--fs-xs)", color: "var(--warn)", maxWidth: 96 }}>
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
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
  alignSelf: "center",
};
