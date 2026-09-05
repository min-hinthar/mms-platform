"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { settleCash } from "@/lib/staff-cart";
import { changeDue } from "@/lib/register-math";
import { tipPresets, tipWithinAmountCap } from "@/lib/tip";
import { Card } from "@mms/ui";
import { tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Cash settle ("pay a human", S1.3). Two-step confirm showing the authoritative all-in total
 * (POS-priced lines + tax — W16a retired the service charge; tip is in-hand/off-system → not
 * recorded). The server re-derives and reconciles the amount — this button never sends it. On
 * success the cart flips paid and the live detail re-fetches to the paid state; a refresh nudges
 * it immediately.
 */
export function CashSettleButton({
  sessionId,
  totalCents,
  tipBaseCents = null,
  intendedTipCents = null,
  isTab = false,
  handoff = false,
  onHandoff,
}: {
  sessionId: string;
  totalCents: number;
  /** W17c-3 — the tip BASE (subtotal − discount, BEFORE tax) the quick-tip chips offer percentages
   *  against. NOT `totalCents`, which is tax-inclusive: the review's HIGH was that a "20%" chip
   *  computed off the tax-inclusive total charges ~9% more than the identically-labelled chip at
   *  the kiosk. Null when the total is unreadable — the chips simply don't render. */
  tipBaseCents?: number | null;
  /** W17c-3 — what the KIOSK guest chose on their way to the counter. `null` = never asked (every
   *  non-kiosk cart). It PRE-FILLS the field below; the cashier still confirms, because only the
   *  person who takes the money knows what was actually handed over. */
  intendedTipCents?: number | null;
  /** When this table is running a trust tab (S3.1), the cash settle IS the tab close — re-frame the
   *  copy ("Close tab" / "closes this tab") so the action reads as the deliberate end-of-night close,
   *  not a mid-meal settle. The money path is identical (mms_fulfill_cash_order, server-reconciled). */
  isTab?: boolean;
  /** W6a (register): a counter order's settle ends with a HANDOFF — show the tendered/change helper
   *  in the confirm step and hand the result UP (`onHandoff`), so the parent renders the #CODE card
   *  OUTSIDE the open-cart conditional this button lives in (the review's confirmed HIGH: the detail
   *  refresh unmounts this component seconds after settle). Display-only; the charge stays server-derived. */
  handoff?: boolean;
  onHandoff?: (h: { orderId: string; totalCents: number; changeCents: number | null }) => void;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tendered, setTendered] = useState("");
  // W17c-2 — the cash tip the cashier was handed. Unlike every other amount in this app it IS typed
  // by a human, because nothing on the server can derive it: only the person who took the cash knows
  // what was left. It is bounded by Zod (0..100000) and by the qr_orders_tip_cents_nonneg CHECK.
  // Pre-filled from the guest's kiosk choice when there was one. `null` (never asked) leaves the
  // field empty rather than typing a 0 that would read as an answer nobody gave.
  const [tip, setTip] = useState(
    intendedTipCents != null ? (intendedTipCents / 100).toFixed(2) : "",
  );
  // W21d (Codex P1 on #184) — the kiosk intent can arrive AFTER this control mounts (staff opens
  // the order before the guest answers the prompt; the realtime/5s refresh updates the prop, but a
  // useState initializer never re-runs). Sync the first non-null intent into the field UNLESS the
  // cashier already typed — their hands beat the wire, and a sync must never overwrite a human.
  const tipTouched = useRef(false);
  useEffect(() => {
    if (intendedTipCents != null && !tipTouched.current)
      setTip((intendedTipCents / 100).toFixed(2));
  }, [intendedTipCents]);
  // W21d (Codex P1 on #183, then its P2 on #193) — commas are AMBIGUOUS: "5,00" is a decimal
  // comma (deleting it recorded a $500 tip for a $5 one), while "1,234.56" is US grouping
  // (turning every comma into a point made parseFloat stop at 1.23). Disambiguate: with a dot
  // present, commas are grouping — strip them; comma-only input is a decimal comma when 1–2
  // digits follow it at the end ("5,00"), grouping otherwise ("1,234").
  const sanitizeMoney = (raw: string) => {
    const normalized = raw.includes(".")
      ? raw.replace(/,/g, "")
      : raw.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
    return normalized.replace(/[^0-9.]/g, "");
  };
  const tipCents = Math.max(0, Math.round(Number.parseFloat(tip || "0") * 100) || 0);
  const tipValid = tipCents <= 100000;
  // What the cashier actually collects. Everything below — the confirm question, the settle button,
  // the change — reads THIS, so none of them can quote a pre-tip figure while another quotes the
  // tipped one.
  const dueCents = totalCents + tipCents;
  // Cashier arithmetic only — parsed dollars → cents, never sent anywhere.
  const tenderedCents = Math.round(Number.parseFloat(tendered || "0") * 100) || 0;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Move focus into the confirm group when it opens and back to the trigger when it closes, so it's
  // never dropped to <body> as the step unmounts (S1-audit S6). The guard skips first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await settleCash({ sessionId, tipCents });
    if (!res.ok) {
      setBusy(false);
      setConfirming(false);
      setError(res.error);
      return;
    }
    if (handoff) {
      setBusy(false);
      setConfirming(false);
      // The AUTHORITATIVE total the settle returned (the prop can be a poll interval stale), and the
      // change computed against it. The parent owns the card — this component unmounts with the cart.
      onHandoff?.({
        orderId: res.orderId,
        totalCents: res.totalCents,
        changeCents: tenderedCents > 0 ? changeDue(res.totalCents, tenderedCents) : null,
      });
    }
    router.refresh(); // the realtime re-fetch also fires; this makes the paid state immediate
  }

  return (
    <div>
      {confirming ? (
        <Card
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={sx(lang, "settle.a11y.confirmCash")}
          style={{ ...confirmCard, outline: "none" }}
        >
          <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
            <Chrome lang={lang} k="settle.cash.take" vars={{ m: fmt(dueCents) }} echo="stack" />{" "}
            {tipCents > 0 && (
              <>
                <Chrome
                  lang={lang}
                  k="settle.cash.tipBreakdown"
                  vars={{ m: fmt(totalCents), x: fmt(tipCents) }}
                  echo={false}
                />{" "}
              </>
            )}
            <Chrome
              lang={lang}
              k={isTab ? "settle.cash.closesTab" : "settle.cash.closesOrder"}
              echo="stack"
            />
          </p>
          {/* W17c-2 — the tip is asked for BEFORE the tendered amount, because the change is owed
              against the tipped total; asking after would invite entering change from the wrong
              figure. Shown on every cash settle, not just the counter handoff: a table pays cash
              too, and its tip was equally unrecorded until now. */}
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor="cash-tip" style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
              <Chrome lang={lang} k="settle.cash.tipLabel" echo="stack" />
            </label>
            {/* W17c-3 — the house ladder as one-tap chips, so a cashier is not doing percentage
                arithmetic at the counter. They fill the field (they do not settle), so the amount
                stays visible and adjustable before anything is recorded. */}
            <div role="group" aria-label={sx(lang, "settle.a11y.tipQuick")} style={tipChipRow}>
              {tipPresets(tipBaseCents ?? 0)
                .filter((p) => tipWithinAmountCap(Math.round((tipBaseCents ?? 0) * p.rate)))
                .map((p) => {
                  // The SAME base and the SAME rounding the diner and kiosk use, so an identical
                  // label means an identical amount wherever the guest happens to be standing.
                  const cents = Math.round((tipBaseCents ?? 0) * p.rate);
                  // Lit while the FIELD holds this chip's amount — the field is the single source of
                  // the value (the chip only fills it), so the pressed state is derived, never stored,
                  // and hand-editing the field unlights the chip the moment they diverge (the
                  // checkout chips' idiom, and the W17c "name it once" rule applied to UI state).
                  const on = tip === (cents / 100).toFixed(2);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      className="staff-btn"
                      aria-pressed={on}
                      style={on ? tipChipOn : tipChip}
                      onClick={() => {
                        tipTouched.current = true;
                        setTip((cents / 100).toFixed(2));
                      }}
                    >
                      {p.label}
                      <span style={on ? tipChipAmountOn : tipChipAmount}>{fmt(cents)}</span>
                    </button>
                  );
                })}
              {/* An ACTION (clears the field), not a state — no aria-pressed: the emptied field is
                  its own visible answer, and a "pressed None" lying beside a typed amount would
                  claim two truths at once. */}
              <button
                type="button"
                className="staff-btn"
                style={tipChip}
                onClick={() => {
                  tipTouched.current = true;
                  setTip("");
                }}
              >
                <Chrome lang={lang} k="settle.cash.tipNone" echo={false} />
              </button>
            </div>
            <input
              id="cash-tip"
              inputMode="decimal"
              autoComplete="off"
              placeholder={tf(lang, "settle.cash.example", { x: "5" })}
              value={tip}
              onChange={(e) => {
                tipTouched.current = true;
                setTip(sanitizeMoney(e.target.value));
              }}
              aria-describedby={
                !tipValid ? "cash-tip-cap" : intendedTipCents != null ? "cash-tip-kiosk" : undefined
              }
              aria-invalid={!tipValid || undefined}
              style={tenderInput}
            />
            {/* Says WHERE the number came from. A pre-filled amount with no explanation reads as an
                app-invented charge; naming the guest's choice makes it something to confirm. */}
            {intendedTipCents != null && (
              <p
                id="cash-tip-kiosk"
                style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}
              >
                {intendedTipCents > 0 ? (
                  <Chrome
                    lang={lang}
                    k="settle.cash.kioskChose"
                    vars={{ m: fmt(intendedTipCents) }}
                    echo="stack"
                  />
                ) : (
                  <Chrome lang={lang} k="settle.cash.kioskNoTip" echo="stack" />
                )}
              </p>
            )}
            {!tipValid && (
              <p
                id="cash-tip-cap"
                style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--warn)" }}
              >
                {/* The cap FIGURE is the same literal this sentence always carried — it is quoted,
                    never derived, so no money value moves. It rides an {m} slot only so the
                    dictionary value can stay free of digits. */}
                <Chrome
                  lang={lang}
                  k="settle.cash.overCap"
                  vars={{ m: "$1,000.00" }}
                  echo="stack"
                />
              </p>
            )}
          </div>
          {handoff && (
            <div style={{ display: "grid", gap: 4 }}>
              <label htmlFor="cash-tendered" style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                <Chrome lang={lang} k="settle.cash.tenderedLabel" echo="stack" />
              </label>
              <input
                id="cash-tendered"
                inputMode="decimal"
                autoComplete="off"
                placeholder={tf(lang, "settle.cash.example", { x: "40" })}
                value={tendered}
                onChange={(e) => setTendered(sanitizeMoney(e.target.value))}
                style={tenderInput}
              />
              <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)", minHeight: 18 }}>
                {tenderedCents > 0 ? (
                  tenderedCents >= dueCents ? (
                    <Chrome
                      lang={lang}
                      k="settle.cash.change"
                      vars={{ m: fmt(changeDue(dueCents, tenderedCents)) }}
                      echo="inline"
                    />
                  ) : (
                    <Chrome lang={lang} k="settle.cash.notEnough" echo="inline" />
                  )
                ) : (
                  ""
                )}
              </p>
            </div>
          )}
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              className="staff-btn"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={cancelBtn}
            >
              <Chrome lang={lang} k="settle.cancel" echo={false} />
            </button>
            <button
              className="staff-btn"
              type="button"
              onClick={confirm}
              disabled={busy || !tipValid}
              style={busy || !tipValid ? { ...payBtn, opacity: 0.5 } : payBtn}
            >
              {busy ? (
                <Chrome lang={lang} k="settle.cash.settling" echo={false} />
              ) : (
                <Chrome
                  lang={lang}
                  k="settle.cash.settleAmount"
                  vars={{ m: fmt(dueCents) }}
                  echo="stack"
                />
              )}
            </button>
          </div>
        </Card>
      ) : (
        <button
          className="staff-btn"
          ref={triggerRef}
          type="button"
          onClick={() => setConfirming(true)}
          aria-describedby="settle-hint"
          style={{ ...payBtn, width: "100%" }}
        >
          <Chrome
            lang={lang}
            k={isTab ? "settle.cash.triggerTab" : "settle.cash.trigger"}
            vars={{ m: fmt(totalCents) }}
            echo="stack"
          />
        </button>
      )}
      {/* Static helper text (a description, not a status) — linked to the button, never a live region.
          The detail view's one polite live region is the line-edit status in FloorDetailLive; a settle
          FAILURE is an assertive role="alert" instead (different concern, mutually exclusive action). */}
      <p id="settle-hint" style={hint}>
        <Chrome lang={lang} k="settle.cash.hint" echo="stack" />
      </p>
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          <OutageText lang={lang} error={error} />
        </p>
      )}
    </div>
  );
}

const payBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid transparent",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: 600,
  cursor: "pointer",
};
// Surface (bg/border/radius/shadow) comes from the shared `.card` via <Card>; this is layout only.
const confirmCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  padding: "var(--s4)",
};
const tenderInput: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};

const tipChipRow: CSSProperties = { display: "flex", gap: "var(--s2)", flexWrap: "wrap" };
const tipChip: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--s2)",
};
const tipChipAmount: CSSProperties = { fontWeight: 500, color: "var(--t2)" };
// The checkout tip chips' on-state, in the staff console's clothes: accent ring + a 9% accent wash.
const tipChipOn: CSSProperties = {
  ...tipChip,
  border: "1.5px solid var(--ac)",
  background: "color-mix(in oklab, var(--ac) 9%, var(--sf))",
  color: "var(--ac-strong)",
};
const tipChipAmountOn: CSSProperties = { fontWeight: 600, color: "var(--ac-strong)" };
