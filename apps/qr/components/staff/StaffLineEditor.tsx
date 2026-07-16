"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { setLineNotes, staffSetQty } from "@/lib/staff-cart";
import { STAFF_STATE_COPY } from "@/lib/line-state-copy";
import type { TableLineView } from "@/lib/floor-types";
import { Stepper } from "@mms/ui";
import { LossActionSheet } from "./LossActionSheet";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * One cart line on the staff drill-down. The control depends on the line's kitchen state (S2.1/S2.3):
 *   • 'draft'  → qty steppers (− / +); staff edit freely (no canMutateLine restriction).
 *   • fired / in_progress / served → POST-fire: a silent qty change would desync the kitchen + skip the
 *     loss audit, so the only edit is **Void / Comp** (loss-gated, manager-PIN when cooked — S2.3).
 *   • 'voided' → terminal, shown muted with no controls. 'comped' → shown as a free line, no controls.
 * The server is authoritative; the live re-fetch (FloorDetailLive) reconciles the displayed state.
 */
export function StaffLineEditor({
  sessionId,
  line,
  disabled,
  onError,
}: {
  sessionId: string;
  line: TableLineView;
  disabled: boolean;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticQty, setOptimisticQty] = useState<number | null>(null);
  const [seenServerQty, setSeenServerQty] = useState(line.qty);
  const [sheetOpen, setSheetOpen] = useState(false);
  // W3b kitchen note: null = editor closed; a string = the in-progress draft (may be "", which clears).
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [notePending, startNote] = useTransition();

  function saveNote() {
    const value = (noteDraft ?? "").trim();
    startNote(async () => {
      try {
        const res = await setLineNotes(sessionId, { cartItemId: line.id, notes: value });
        if (!res.ok) onError(res.error);
        else setNoteDraft(null); // the live re-fetch renders the saved note
      } catch {
        onError("Couldn’t save that note — check the connection and try again.");
      }
    });
  }

  // When the server (the live re-fetch) reports a new qty, drop any optimistic value — both when it
  // catches up to ours AND when another actor changes the line. React's guarded set-during-render pattern.
  if (line.qty !== seenServerQty) {
    setSeenServerQty(line.qty);
    setOptimisticQty(null);
  }
  const qty = optimisticQty ?? line.qty;
  const busy = pending || disabled;

  function setQty(next: number) {
    setOptimisticQty(next);
    startTransition(async () => {
      try {
        const res = await staffSetQty(sessionId, { cartItemId: line.id, qty: next });
        if (!res.ok) {
          setOptimisticQty(null); // roll back to the last server value
          onError(res.error);
        }
      } catch {
        // S2-audit B3: an unexpected throw (network/redacted server error) must not strand the optimistic
        // qty silently — roll back + surface honest copy through the shared region.
        setOptimisticQty(null);
        onError("Couldn’t update that — check the connection and try again.");
      }
    });
  }

  // ── Terminal / settled-as-free states: a muted row, no controls ──────────────────────────────────────
  if (line.state === "voided") {
    return (
      <li style={{ ...row, opacity: 0.55 }}>
        <span style={{ minWidth: 0, flex: 1, textDecoration: "line-through" }}>
          {line.qty}× {line.name}
        </span>
        <span style={badge}>Voided</span>
      </li>
    );
  }
  if (line.comped) {
    return (
      <li style={row}>
        <span style={{ minWidth: 0, flex: 1 }}>
          {line.qty}× {line.name}
          {line.bySeatName && (
            <span style={{ color: "var(--t3)", fontSize: 12 }}> · {line.bySeatName}</span>
          )}
        </span>
        <span style={{ ...badge, color: "var(--ac-strong)" }}>Comped · free</span>
      </li>
    );
  }

  // ── Post-fire (fired / in_progress / served): Void / Comp instead of a silent stepper ────────────────
  const postFire = line.state !== "draft";
  if (postFire) {
    const stateLabel = STAFF_STATE_COPY[line.state]; // S12: one shared vocabulary
    return (
      <li style={row}>
        <span style={{ minWidth: 0, flex: 1 }}>
          {line.qty}× {line.name}
          <span style={{ color: "var(--t3)", fontSize: 12 }}> · {stateLabel}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
          <span style={priceCell}>{fmt(line.unitPriceCents * line.qty)}</span>
          {line.pendingApproval ? (
            // S2.4: a void/comp request is open for this line — a manager resolves it from the queue; don't
            // offer a second request.
            <span style={badge} aria-label={`Approval requested for ${line.name}`}>
              Approval requested
            </span>
          ) : (
            <button
              className="staff-btn"
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={disabled}
              aria-label={`Void or comp ${line.name}`}
              style={{ ...lossBtn, opacity: disabled ? 0.5 : 1 }}
            >
              Void / Comp
            </button>
          )}
        </span>
        {/* Mounted only while open so each open is a fresh sheet (resets reason/PIN, refetches managers)
            without a setState-in-effect reset. */}
        {sheetOpen && !line.pendingApproval && (
          <LossActionSheet
            open
            onOpenChange={setSheetOpen}
            sessionId={sessionId}
            line={line}
            onDone={() => setSheetOpen(false)}
          />
        )}
      </li>
    );
  }

  // ── Draft: the qty stepper (shared @mms/ui Stepper; the red ✕ remove is the staff variant) + the
  // W3b kitchen-note editor (draft-only; the note freezes at fire so the board can't silently diverge).
  return (
    <li style={{ ...row, flexWrap: "wrap" }}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{qty}×</span> {line.name}
        {line.soldOut && (
          <span style={{ color: "var(--t3)", fontSize: 12, fontWeight: 400 }}> · Sold out</span>
        )}
        {line.bySeatName && (
          <span style={{ color: "var(--t3)", fontSize: 12 }}> · {line.bySeatName}</span>
        )}
        {line.notes && noteDraft === null && (
          <span style={noteText}>“{line.notes}”</span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
        <span style={priceCell}>{fmt(line.unitPriceCents * qty)}</span>
        <button
          className="staff-btn"
          type="button"
          onClick={() => setNoteDraft((d) => (d === null ? (line.notes ?? "") : null))}
          disabled={busy}
          aria-expanded={noteDraft !== null}
          aria-label={`${line.notes ? "Edit" : "Add"} kitchen note for ${line.name}`}
          style={{ ...noteBtn, opacity: busy ? 0.5 : 1 }}
        >
          {line.notes ? "Edit note" : "Note"}
        </button>
        <Stepper
          qty={qty}
          onChange={setQty}
          name={line.name}
          disabled={busy}
          soldOut={line.soldOut}
          soldOutLabel={`${line.name} is sold out — can’t add more`}
          removeTone="var(--warn)"
        />
      </span>
      {noteDraft !== null && (
        <span style={noteEditor}>
          <label className="sr-only" htmlFor={`note-${line.id}`}>
            Kitchen note for {line.name}
          </label>
          <input
            id={`note-${line.id}`}
            type="text"
            value={noteDraft}
            maxLength={160}
            placeholder="e.g. No peanuts — allergy"
            onChange={(e) => setNoteDraft(e.target.value)}
            style={noteInput}
          />
          <button
            className="staff-btn"
            type="button"
            onClick={saveNote}
            disabled={notePending}
            style={noteSave}
          >
            {notePending ? "…" : "Save"}
          </button>
        </span>
      )}
    </li>
  );
}

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  padding: "8px 0",
  borderTop: "1px solid var(--bd)",
  fontSize: 14,
};
const priceCell: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  minWidth: 56,
  textAlign: "right",
};
const lossBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const badge: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--t2)",
  whiteSpace: "nowrap",
};
// The saved note reads at FULL text color (safety-adjacent, never muted) in the diner's own words.
const noteText: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600 };
const noteBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const noteEditor: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  width: "100%",
  paddingTop: 6,
};
const noteInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-sm)",
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  font: "inherit",
  fontSize: 16, // iOS input-zoom floor (P5.2)
};
const noteSave: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--ac)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
