"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@mms/ui";
import { staffAddItem } from "@/lib/staff-cart";
import { al } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";

/**
 * Add-to-table button on the staff menu browser (S1.3). Like the diner AddButton it adds the BASE item
 * (no modifier picker at this tier — parity with the guest menu); the server re-derives the price.
 * OPTIMISTIC (the AddButton pattern): "Added ✓" flips the instant it's tapped — the page copy promises
 * "it lands on the table's order instantly" and a server tapping through a round shouldn't wait out the
 * round-trip — then reverts with the error if the write is refused. Soft-disabled when sold out.
 *
 * P2 — the failure state is TAGGED BY ORIGIN, not a bare string. A sentence the SERVER wrote goes
 * through `<OutageText>` (which swaps the one write-outage twin and passes everything else through
 * in English, because a sentence with no authored twin is better shown than guessed at). The thrown
 * `catch` sentence is this console's OWN copy and therefore a dictionary key: routed through
 * `OutageText` it would pass through as English forever while looking converted.
 */
type AddFailure =
  /** A sentence `staffAddItem` returned. English unless it is the write-outage twin. */
  | { kind: "server"; message: string }
  /** The action THREW — transport, or a redacted server error. Our own sentence. */
  | { kind: "threw" };

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
  const lang = useStaffLang();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<AddFailure | null>(null);
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
          setError({ kind: "server", message: res.error });
        }
      } catch {
        // A THROWN action (network/transport, redacted server error) must also revert the optimistic
        // "Added ✓" — without this catch it would stick forever while nothing landed on the order.
        setAdded(false);
        setError({ kind: "threw" });
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
        // P2 — three whole al() calls rather than one call over a computed key: the key has to be a
        // string literal or `check-staff-lang.mjs` rule 3c cannot find the label the name must
        // contain, and the button's visible word genuinely changes with its state.
        aria-label={
          soldOut
            ? al(lang, { kind: "verb", verb: "browse.add.verb.soldOut", subject: name }).aria
            : added
              ? al(lang, { kind: "verb", verb: "browse.add.verb.added", subject: name }).aria
              : al(lang, { kind: "verb", verb: "browse.add.verb.add", subject: name }).aria
        }
        style={{
          ...btn,
          background: soldOut ? "var(--sf)" : "var(--ac)",
          color: soldOut ? "var(--t3)" : "var(--oa)",
        }}
      >
        {/* No echo on any of the three, per the echo policy's chip clause: this is a compact pill in
            a three-up list row. A stacked pair would grow the control and strand the check glyph
            beside two lines; an inline pair would roughly double its width and squeeze the dish
            name on a phone. The console's language is the one the button speaks. */}
        {soldOut ? (
          <Chrome lang={lang} k="browse.add.verb.soldOut" />
        ) : added ? (
          <>
            <Chrome lang={lang} k="browse.add.verb.added" />{" "}
            <Icon name="check" size={16} strokeWidth={2.25} style={{ verticalAlign: "-3px" }} />
          </>
        ) : (
          <Chrome lang={lang} k="browse.add.verb.add" />
        )}
      </button>
      {/* role="alert" (not status): an alert announces reliably when it MOUNTS with content — the exact
          shape here (the region appears with the error). Conditional per-item, like a form field error. */}
      {error && (
        <span role="alert" style={{ fontSize: "var(--fs-xs)", color: "var(--warn)", maxWidth: 96 }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.message} />
          ) : (
            <Chrome lang={lang} k="browse.add.failed" />
          )}
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
