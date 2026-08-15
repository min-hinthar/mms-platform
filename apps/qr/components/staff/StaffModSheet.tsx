"use client";
import { useMemo, useState, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  selectionDeltaCents,
  toggleOption,
  type ModGroup,
  type Selection,
} from "@/lib/menu/modifiers";
import { modePriceCents } from "@/lib/mode-price";

/**
 * The staff modifier sheet (W6a — closes K17). Same pure selection model as the diner ItemSheet
 * (radio for required singles, checkboxes capped at maxSelect), plus the register's qty (1–9) and an
 * optional kitchen note. Every cents figure here is ADVISORY preview — the add sends option IDS and
 * the server re-derives the price with cardinality enforced. The preview MUST mirror the server's
 * math exactly (W16a): mode factor + round25 over base+delta via modePriceCents, THEN × qty.
 */
export function StaffModSheet({
  open,
  onOpenChange,
  itemName,
  basePriceCents,
  lineMode,
  groups,
  pending,
  error,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  basePriceCents: number;
  /** Which mode-derived price the server will mint for this line (W16a) — dinein ×1.15, togo ×1.05. */
  lineMode: "dinein" | "togo";
  groups: ModGroup[];
  pending: boolean;
  /** Add failure surfaced INSIDE the sheet — a page-level live region is behind the modal scrim. */
  error: string | null;
  onAdd: (choice: { modifierIds: string[]; qty: number; notes?: string }) => void;
}) {
  const [sel, setSel] = useState<Selection>(() => initialSelection(groups));
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const valid = isSelectionValid(groups, sel);
  const previewCents = useMemo(
    () => modePriceCents(basePriceCents + selectionDeltaCents(groups, sel), lineMode) * qty,
    [basePriceCents, lineMode, groups, sel, qty],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={itemName}>
      {/* The Sheet renders its title visibly — no duplicate heading here. */}
      <div style={body}>
        {groups.map((g) => (
          <fieldset key={g.id} style={groupBox}>
            <legend style={legend}>
              {g.name}
              {g.minSelect >= 1 ? (
                <span style={reqTag}> · required</span>
              ) : (
                <span style={optTag}> · optional</span>
              )}
            </legend>
            <div role="group" aria-label={g.name} style={optList}>
              {g.options.map((o) => {
                const chosen = (sel[g.id] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    // Toggle-button semantics (aria-pressed): conformant without the roving-tabindex
                    // machinery real radio groups demand — the single-select behavior lives in
                    // toggleOption, and each option stays independently tabbable.
                    aria-pressed={chosen}
                    style={chosen ? optBtnOn : optBtn}
                    onClick={() =>
                      setSel((s) => ({ ...s, [g.id]: toggleOption(g, s[g.id] ?? [], o.id) }))
                    }
                  >
                    <span>{o.name}</span>
                    {o.priceDeltaCents !== 0 && (
                      <span style={delta}>
                        {o.priceDeltaCents > 0 ? "+" : "−"}$
                        {(Math.abs(o.priceDeltaCents) / 100).toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div style={qtyRow}>
          <span style={legend}>Quantity</span>
          <div style={qtyCtl} role="group" aria-label="Quantity">
            <button
              type="button"
              style={qtyBtn}
              aria-label="One fewer"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span style={qtyNum}>{qty}</span>
            <button
              type="button"
              style={qtyBtn}
              aria-label="One more"
              disabled={qty >= 9}
              onClick={() => setQty((q) => Math.min(9, q + 1))}
            >
              +
            </button>
          </div>
        </div>

        <label style={legend} htmlFor="staff-mod-note">
          Kitchen note (allergy, request)
        </label>
        <input
          id="staff-mod-note"
          style={noteInput}
          value={notes}
          maxLength={160}
          autoComplete="off"
          placeholder="e.g. peanut allergy"
          onChange={(e) => setNotes(e.target.value)}
        />

        <button
          type="button"
          style={valid && !pending ? cta : ctaDisabled}
          disabled={!valid || pending}
          onClick={() =>
            onAdd({
              modifierIds: selectedIds(groups, sel),
              qty,
              notes: notes.trim() || undefined,
            })
          }
        >
          {pending ? "Adding…" : `Add · $${(previewCents / 100).toFixed(2)}`}
        </button>
        {!valid && <p style={hint}>Pick the required options first.</p>}
        {/* The sheet's ONE live region — the add refusal must be readable OVER the scrim. */}
        <p role="status" style={error ? errLine : srOnlyLine}>
          {error ?? ""}
        </p>
      </div>
    </Sheet>
  );
}

const body: CSSProperties = { display: "grid", gap: "var(--s4)", padding: "var(--s4)" };
const groupBox: CSSProperties = { border: "none", margin: 0, padding: 0 };
const legend: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--tx)",
  padding: 0,
  marginBottom: "var(--s2)",
};
const reqTag: CSSProperties = { color: "var(--ac-strong)", fontWeight: 600 };
const optTag: CSSProperties = { color: "var(--t3)", fontWeight: 400 };
const optList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--s2)" };
const optBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--s2)",
  cursor: "pointer",
};
const optBtnOn: CSSProperties = {
  ...optBtn,
  borderColor: "var(--ac)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 700,
};
const delta: CSSProperties = { fontSize: "var(--fs-xs)", opacity: 0.85 };
const qtyRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const qtyCtl: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "var(--s3)" };
const qtyBtn: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-h3)",
  cursor: "pointer",
};
const qtyNum: CSSProperties = { minWidth: 24, textAlign: "center", fontWeight: 800 };
const noteInput: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const cta: CSSProperties = {
  minHeight: 52,
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 800,
  cursor: "pointer",
};
const ctaDisabled: CSSProperties = { ...cta, opacity: 0.5, cursor: "default" };
const hint: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 };
const errLine: CSSProperties = { color: "var(--warn)", fontSize: "var(--fs-sm)", margin: 0 };
const srOnlyLine: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
