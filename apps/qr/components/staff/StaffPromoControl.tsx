"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { applyPromoForTable, clearPromoForTable, type StaffPromoReason } from "@/lib/staff-promo";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * P3 — the promo row on the table drill-down: apply a code at the counter, and take one off.
 *
 * WHY IT IS HERE AND NOT ONLY ON CHECKOUT. PILOT_PLAN §5 has a table typing `PILOT15` and then
 * paying CASH — a settle that never opens the diner's Checkout. Without this the incentive only
 * reaches guests who finish on their own phone. And OPEN-ITEMS P2e: the merge refusal has told staff
 * to "remove it before merging" since S1.4 while nothing in the product could remove anything.
 *
 * ## Three rules this component is shaped by
 *
 * 1. **The amount is never this component's.** It renders `promoCents`, which `getTableDetail` read
 *    off the SAME `getCartTotals` call that produced the settle total — not the apply-time quote,
 *    which is allowed to differ (an authorized pin, or M22's reward-first clamp). Nothing here
 *    computes, stores or optimistically predicts a money figure; a tap re-reads and the server
 *    answers.
 * 2. **No second live region.** The console's one `role="status"` lives in FloorDetailLive's order
 *    card, and every refusal goes there through `onError` — the same channel `StaffLineEditor`
 *    uses. What replaces an announcement for the SUCCESS paths is FOCUS: applying moves focus to the
 *    applied row (which names the code and what it is worth) and removing moves it back to the
 *    field, so the step change is announced by the thing that changed. That is the QA checklist's
 *    "focus moved on remove / step change", and it is why neither success writes a message.
 * 3. **No literal `aria-label` anywhere** (check-staff-lang rule 3). Every control here is named by
 *    its own visible text — which is also why Remove carries the CODE in its label rather than in an
 *    `aria-label`: a server sees what they are about to remove, and a screen reader hears the same
 *    words. The section is named by its heading through `aria-labelledby`.
 */

/**
 * Every refusal the action can return, mapped to the copy that explains it.
 *
 * `Record<StaffPromoReason, …>` and not a lookup with a fallback: adding a reason to the union
 * without copy for it is then a COMPILE error rather than a control that refuses silently. `outage`
 * points at the sentence every other staff mutation already shows during an outage, rather than a
 * fourteenth variation on it.
 */
const REASON_KEY: Record<StaffPromoReason, StaffKey> = {
  invalid: "promo.err.invalid",
  inactive: "promo.err.inactive",
  not_started: "promo.err.notStarted",
  expired: "promo.err.expired",
  min_not_met: "promo.err.minNotMet",
  exhausted: "promo.err.exhausted",
  session_limit: "promo.err.sessionLimit",
  outage: "out.write.failed",
  signin: "promo.err.signin",
  rate_limited: "promo.err.rateLimited",
  table_closed: "promo.err.tableClosed",
  no_order: "promo.err.noOrder",
  cart_closed: "promo.err.cartClosed",
  locked: "promo.err.locked",
  error: "promo.err.error",
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function StaffPromoControl({
  sessionId,
  lang,
  promoCode,
  promoCents,
  canWrite,
  onError,
  onChanged,
}: {
  sessionId: string;
  lang: StaffLang;
  /** The code on the open cart, from `getTableDetail` — this component never holds it in state. */
  promoCode: string | null;
  /** Its DELIVERED contribution in cents; null when there are no items to price. */
  promoCents: number | null;
  /** False once a payment is in flight or the cart is settled — the server refuses regardless. */
  canWrite: boolean;
  /** Feeds the console's ONE live region. Cleared on every attempt so a stale refusal can never be
   *  read as this one's answer (the single-region discipline `Checkout.tsx` states). */
  onError: (node: React.ReactNode) => void;
  /** Ask the drill-down to re-read. The same debounced path realtime uses — a `qr_carts` UPDATE
   *  fires `useFloorRealtime` too, so this is the belt for a socket that is down, not a second
   *  mechanism. */
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "apply" | "clear">(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appliedRef = useRef<HTMLParagraphElement>(null);
  /** Set ONLY by a successful action of ours, so a 5s poll can never plant focus on its own. */
  const awaiting = useRef<null | "applied" | "cleared">(null);

  useEffect(() => {
    if (awaiting.current === "applied" && promoCode) {
      awaiting.current = null;
      appliedRef.current?.focus({ preventScroll: true });
    } else if (awaiting.current === "cleared" && !promoCode) {
      awaiting.current = null;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [promoCode]);

  const fail = useCallback(
    (reason: StaffPromoReason) => {
      onError(<Chrome lang={lang} k={REASON_KEY[reason]} />);
    },
    [lang, onError],
  );

  const run = useCallback(
    async (which: "apply" | "clear") => {
      // Clear the region FIRST: a prior line-edit error must not be read as this attempt's answer.
      onError(null);
      setBusy(which);
      try {
        const res =
          which === "apply"
            ? await applyPromoForTable({ sessionId, code: code.trim() })
            : await clearPromoForTable({ sessionId });
        if (!res.ok) {
          fail(res.reason);
          return;
        }
        awaiting.current = which === "apply" ? "applied" : "cleared";
        if (which === "apply") setCode("");
        onChanged();
      } catch {
        // A Server Action can REJECT (a dropped socket, a redacted throw). Swallowing it would latch
        // this button on "Applying…" with no error text — dead mid-service, recoverable only by a
        // reload. That is the exact `settleCash` lesson, one component over.
        fail("error");
      } finally {
        setBusy(null);
      }
    },
    [code, fail, onChanged, onError, sessionId],
  );

  return (
    <section className="card card-textured" style={sectionCard} aria-labelledby="promo-h">
      <h2 id="promo-h" style={sectionH}>
        <Chrome lang={lang} k="promo.h" echo="inline" />
      </h2>

      {promoCode ? (
        <>
          <p ref={appliedRef} tabIndex={-1} style={appliedRow}>
            {/* The code is a Latin identifier inside a Burmese run — marked so the console's
                `[lang="en"]` rule restores the body face and `overflow-wrap: normal`, exactly as
                `Chrome` does for its own interpolated values. */}
            <span lang="en" style={codeChip}>
              {promoCode}
            </span>
            <span style={worth}>
              {promoCents == null ? (
                <Chrome lang={lang} k="promo.noItems" />
              ) : promoCents > 0 ? (
                // `{m}` is preformatted money and stays Latin in both tongues (the fill.ts slot
                // contract). The figure is the DELIVERED one, so this line and the settle button
                // below can never quote different numbers.
                <Chrome
                  lang={lang}
                  k="promo.worth"
                  vars={{ m: fmt(promoCents) }}
                  // `echo="inline"` per Chrome's OWN policy — "money labels" take the echo, and
                  // `promo.worth` is flagged K15-HIGH as the sentence a cashier reads before
                  // taking cash. It is neither a 44px chip nor a live region, the two carve-outs.
                  echo="inline"
                />
              ) : (
                // An applied code currently worth nothing — a void dropped the basket under the
                // minimum, or a reward already covers it. Saying "off this order" here would be a
                // saving the receipt will not show.
                <Chrome lang={lang} k="promo.zero" />
              )}
            </span>
          </p>
          {canWrite && (
            <button
              type="button"
              className="staff-btn"
              style={removeBtn}
              disabled={busy !== null}
              onClick={() => void run("clear")}
            >
              {busy === "clear" ? (
                <Chrome lang={lang} k="promo.removing" echo="inline" />
              ) : (
                // The code rides the VISIBLE label rather than an aria-label: the server sees which
                // code they are removing, and the accessible name is that same text (WCAG 2.5.3
                // satisfied by construction rather than by a parallel string).
                <Chrome lang={lang} k="promo.remove" vars={{ x: promoCode }} echo="inline" />
              )}
            </button>
          )}
        </>
      ) : canWrite ? (
        <form
          style={form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim() || busy) return;
            void run("apply");
          }}
        >
          <label htmlFor="staff-promo-code" style={fieldLabel}>
            <Chrome lang={lang} k="promo.field" echo="inline" />
          </label>
          <div style={fieldRow}>
            <input
              id="staff-promo-code"
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              // 40 mirrors `staffApplyPromoInput`'s `.max(40)`, so the field cannot compose a value
              // the server will reject on shape alone.
              maxLength={40}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              disabled={busy !== null}
              style={input}
            />
            <button
              type="submit"
              className="staff-btn"
              style={applyBtn}
              disabled={busy !== null || !code.trim()}
            >
              {busy === "apply" ? (
                <Chrome lang={lang} k="promo.applying" echo="inline" />
              ) : (
                <Chrome lang={lang} k="promo.apply" echo="inline" />
              )}
            </button>
          </div>
        </form>
      ) : (
        <p style={muted}>
          <Chrome lang={lang} k="promo.none" />
        </p>
      )}
    </section>
  );
}

const sectionCard: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const sectionH: CSSProperties = {
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s3)",
  color: "var(--t2)",
};
const muted: CSSProperties = { margin: 0, color: "var(--t3)", fontSize: "var(--fs-sm)" };
const appliedRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--s3)",
  margin: 0,
  outline: "none",
};
const codeChip: CSSProperties = {
  padding: "4px 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  fontVariantNumeric: "tabular-nums",
};
const worth: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)" };
const form: CSSProperties = { display: "grid", gap: "var(--s2)" };
const fieldLabel: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", fontWeight: 700 };
const fieldRow: CSSProperties = { display: "flex", gap: "var(--s2)", flexWrap: "wrap" };
const input: CSSProperties = {
  flex: "1 1 160px",
  minWidth: 0,
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  textTransform: "uppercase",
};
const applyBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s5)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--ac)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 700,
  cursor: "pointer",
};
const removeBtn: CSSProperties = {
  marginTop: "var(--s3)",
  minHeight: 44,
  padding: "0 var(--s4)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: 700,
  cursor: "pointer",
};
