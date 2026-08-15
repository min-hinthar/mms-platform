"use client";
import type { CSSProperties } from "react";

/** W7a — the receipt view's print affordance. `window.print()` + the browser's print-to-PDF IS
 *  the artifact pipeline (no PDF generation dependency). Hidden in print output itself. */
export function PrintReceiptButton() {
  return (
    <button type="button" onClick={() => window.print()} className="print-hide" style={btn}>
      <span aria-hidden>🖨</span> Print or save as PDF
    </button>
  );
}

const btn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 11,
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
