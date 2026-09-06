"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { clearTable } from "@/lib/floor";
import { tf } from "@/lib/i18n/fill";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";

/**
 * Clear a table on turnover (S1.2). Two-step confirm (no accidental clear), and DISABLED with an honest
 * reason while a payment is in flight — the server refuses it regardless (the button gating is just the
 * affordance). On success the session is closed; we leave the now-defunct detail page for the floor.
 */
export function ClearTableButton({
  sessionId,
  label,
  paymentInFlight,
}: {
  sessionId: string;
  label: string;
  paymentInFlight: boolean;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Keep focus with the flow (S1-audit S6): into the confirm group when it opens, back to the trigger
  // when it closes — never dropped to <body> as the step unmounts. The `wasConfirming` guard avoids
  // grabbing focus on first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await clearTable({ sessionId });
    if (!res.ok) {
      setBusy(false);
      setConfirming(false);
      setError(res.error);
      return;
    }
    // Session closed — return to the floor (this detail is now defunct).
    router.replace("/staff");
    router.refresh();
  }

  if (paymentInFlight) {
    return (
      <div>
        <button type="button" disabled style={{ ...clearBtn, opacity: 0.5, cursor: "not-allowed" }}>
          <Chrome lang={lang} k="settle.clear.btn" echo="stack" />
        </button>
        <p style={hint}>
          <Chrome lang={lang} k="settle.clear.midPayment" echo="stack" />
        </p>
      </div>
    );
  }

  return (
    <div>
      {confirming ? (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={tf(lang, "settle.a11y.confirmClear", { id: label })}
          style={{ ...confirmRow, outline: "none" }}
        >
          <span style={{ fontSize: "var(--fs-sm)" }}>
            {/* Inline echo, not stacked: this row is a flex line with the two buttons beside it,
                and a stacked pair would push its height. */}
            <Chrome lang={lang} k="settle.clear.question" vars={{ id: label }} echo="inline" />
          </span>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={cancelBtn}
            >
              <Chrome lang={lang} k="settle.cancel" echo={false} />
            </button>
            <button type="button" onClick={confirm} disabled={busy} style={clearBtn}>
              {busy ? (
                <Chrome lang={lang} k="settle.clear.clearing" echo={false} />
              ) : (
                <Chrome lang={lang} k="settle.confirm" echo="stack" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <button ref={triggerRef} type="button" onClick={() => setConfirming(true)} style={clearBtn}>
          <Chrome lang={lang} k="settle.clear.btn" echo="stack" />
        </button>
      )}
      {/* Assertive alert (not a polite live region) so the detail view keeps ONE polite region — its
          shared line-edit status; parity with CashSettle/Merge (S1-audit S5). */}
      {error && (
        <p role="alert" style={{ ...hint, color: "var(--warn)" }}>
          <OutageText lang={lang} error={error} />
        </p>
      )}
    </div>
  );
}

const clearBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
const confirmRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
};
const hint: CSSProperties = { margin: "8px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" };
