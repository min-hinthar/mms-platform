"use client";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { ConfirmCopy } from "@/lib/confirm-copy";

/**
 * W16c — the shared inline two-step confirm (owner directive: "Important buttons like Send to
 * kitchen … or finalize pay bill should ask to confirm decision").
 *
 * WHY THIS SHAPE, not a modal: the repo already ships this idiom four times on the staff side
 * (CashSettleButton, ClearTableButton, MergeTableButton, AccountStatus) — the trigger is REPLACED
 * in place by a `role="group"` card with Cancel + proceed. It needs no focus trap, no portal, and
 * deliberately NOT `aria-modal`/`alertdialog`: nothing else on the page is inerted, so modal
 * semantics would lie to a screen reader. The Radix `Sheet` primitive is the wrong tool here (full
 * bottom sheet + scrim + drag + a lazy domMax chunk for two buttons).
 *
 * The a11y contract this encodes:
 *  - focus parks on the SAFE choice (Cancel) at open, so a stray Enter can never commit money;
 *  - the CALLER returns focus to its trigger on cancel (it owns that ref — see every call site);
 *  - both targets ≥44px (QA §A / WCAG 2.5.8);
 *  - the question is static text wired by `aria-describedby` — NO new live region (the one-region
 *    rule: each host view already owns exactly one, and outcomes keep riding it);
 *  - no animation (nothing to gate under prefers-reduced-motion).
 *
 * Bilingual per W16b: EN primary, Burmese accent underneath with its own `lang="my"`.
 */
export function ConfirmSwap({
  copy,
  busy = false,
  busyLabel,
  onCancel,
  onProceed,
}: {
  copy: ConfirmCopy;
  /** The proceed action is in flight — both buttons lock (a mid-flight cancel can't strand state). */
  busy?: boolean;
  /** EN label while busy (e.g. "Sending…"); falls back to the proceed label. */
  busyLabel?: string;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  // Park focus on the SAFE choice as the group replaces the trigger (which just unmounted, so
  // focus would otherwise fall to <body>).
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div role="group" aria-label={copy.label} aria-describedby={questionId} style={card}>
      <p id={questionId} style={question}>
        {copy.questionEn}
        <span lang="my" style={questionMy}>
          {copy.questionMy}
        </span>
      </p>
      <p style={detail}>
        {copy.detailEn}
        <span lang="my" style={detailMy}>
          {copy.detailMy}
        </span>
      </p>
      <div style={row}>
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} style={cancelBtn}>
          {copy.cancelEn}
          <span lang="my" style={btnMy}>
            {copy.cancelMy}
          </span>
        </button>
        <button
          type="button"
          onClick={onProceed}
          disabled={busy}
          aria-busy={busy}
          style={proceedBtn}
        >
          {busy ? (busyLabel ?? copy.proceedEn) : copy.proceedEn}
          {!busy && (
            <span lang="my" style={btnMy}>
              {copy.proceedMy}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  display: "grid",
  gap: "var(--s3)",
  marginTop: 12,
  padding: "var(--s4)",
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
};
const question: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  color: "var(--tx)",
};
const questionMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--t2)",
};
const detail: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const detailMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  // W16e review — the 13px Burmese floor (stacked diacritics are illegible below it), not fs-xs.
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
};
const row: CSSProperties = { display: "flex", gap: "var(--s3)" };
const baseBtn: CSSProperties = {
  flex: 1,
  minHeight: 48,
  padding: "6px 14px",
  borderRadius: 12,
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
  lineHeight: 1.2,
};
const cancelBtn: CSSProperties = {
  ...baseBtn,
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
};
const proceedBtn: CSSProperties = {
  ...baseBtn,
  border: "1px solid transparent",
  background: "var(--ac)",
  color: "var(--oa)",
};
// The Burmese line inside a button: block so it stacks under the EN label (the buttons are flex
// items themselves, but their CONTENT is normal flow, so `display:block` stacks as intended).
const btnMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  // W16e review MED — these are the owner's OWN named buttons ("Send to kitchen … or finalize pay
  // bill"); shipping their Burmese at the 11px floor is exactly what the W12 bill review rejected.
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
};
