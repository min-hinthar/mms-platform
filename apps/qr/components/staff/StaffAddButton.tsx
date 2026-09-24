"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@mms/ui";
import { staffAddItem } from "@/lib/staff-cart";
import {
  addAttemptOutcome,
  heldAfter,
  keyForAttempt,
  type AddAttemptOutcome,
  type HeldAddKey,
} from "@/lib/staff-add-key";
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
 *
 * Phase 2a (Codex round 1, P1) — every tap carries an ADD KEY (`lib/staff-add-key.ts`). An add whose
 * outcome is unknown — the action threw, or the write answered `unconfirmed` — may have landed, so
 * the next tap resends the SAME key (the ledger makes it a no-op if the first landed) and the line
 * says "couldn't confirm — check the order", never "try again". A definite outcome retires the key.
 * Every settled attempt (ok or unknown) re-reads the page, so the add page's "Review · N not sent"
 * bridge counts what is actually on the order.
 */
type AddFailure =
  /** A sentence `staffAddItem` returned. English unless it is the write-outage twin. */
  | { kind: "server"; message: string }
  /** The outcome is UNKNOWN — the action threw, or the write answered `unconfirmed`: it may have
   *  landed. Our own sentence. */
  | { kind: "unconfirmed" };

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The key held for a retry of THIS dish after an unknown outcome (null after a definite one).
  const heldKey = useRef<HeldAddKey>(null);
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
    if (pending || soldOut) return; // §17 — the button says so with `aria-disabled`
    setError(null);
    setAdded(true); // optimistic — reverted below if the server refuses OR the action throws
    if (timer.current) clearTimeout(timer.current);
    // One dish per button, so the intent IS the dish: a held key means this tap retries the last one.
    const addKey = keyForAttempt(heldKey.current, menuItemId, () => crypto.randomUUID());
    startTransition(async () => {
      let outcome: AddAttemptOutcome;
      try {
        const res = await staffAddItem({ sessionId, menuItemId, addKey });
        outcome = addAttemptOutcome(res);
        if (res.ok) {
          timer.current = setTimeout(() => setAdded(false), 1400);
        } else {
          setAdded(false);
          setError(
            outcome === "unknown"
              ? { kind: "unconfirmed" }
              : { kind: "server", message: res.error },
          );
        }
      } catch {
        // A THROWN action (network/transport, redacted server error) must also revert the optimistic
        // "Added ✓" — without this catch it would stick forever. It may still have LANDED.
        outcome = "unknown";
        setAdded(false);
        setError({ kind: "unconfirmed" });
      }
      heldKey.current = heldAfter(menuItemId, addKey, outcome);
      // The page's truth (the bridge count; the order behind it) after anything that may have landed.
      if (outcome !== "definite") router.refresh();
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
        aria-disabled={pending || !!soldOut || undefined}
        aria-busy={pending || undefined}
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
            <Chrome lang={lang} k="browse.add.unconfirmed" />
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
  fontWeight: "var(--fw-heavy)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
  alignSelf: "center",
};
