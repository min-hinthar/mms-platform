"use client";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CounterPass, Icon, KitchenTrack, NumberFlow } from "@mms/ui";
import { t, type DictKey } from "@/lib/i18n";
import { STAFF } from "@/lib/i18n/staff";
import { useCtaDock } from "@/lib/hooks/useCtaDock";

/**
 * A1 — the diner's "Pay at the counter" moment, on the Bill.
 *
 * Two surfaces share this file because they are one decision seen from two sides:
 *  - `PayAtCounterButton` — the quiet second door under "Pay · $X". Ghost, never a second filled
 *    CTA (the Bill owns ONE hero action — W12/W19), and it carries the same freeze gate as the pay
 *    CTA: a table mid-card-payment is not offered a walk to the register.
 *  - `PayAtCounterCard` — the state after the tap. It REPLACES the pay furniture (tip, promo, the
 *    card CTA) but never the receipt rows above it: the register re-derives the live total, so the
 *    amount here is the same server figure the Bill already shows, and the table may keep ordering.
 *    The way back is a quiet link, last (the DESIGN-LANGUAGE "escape is a quiet link" rule).
 *
 * Amounts are never computed here — `totalCents` is `getCartTotals`' figure, passed through.
 */

const TX = (k: DictKey) => t("en", k);

export function PayAtCounterButton({
  disabled,
  busy,
  onClick,
  onRefusedTap,
}: {
  /** The pay freeze (`payFrozen`) — the same predicate the card CTA reads — or, since Phase 2c ·
   *  gate, dishes still to send (`sendBlocksPay`, the card CTA's own gate). */
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  /** Phase 2c · gate — a tap on the refused button says why (the Bill's status line), never nothing:
   *  the note above already names the dishes; this repeats it for a tap that missed it. */
  onRefusedTap?: () => void;
}) {
  return (
    <button
      type="button"
      className="checkout-cta-ghost"
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      onClick={() => {
        if (busy) return;
        if (disabled) {
          onRefusedTap?.();
          return;
        }
        onClick();
      }}
      style={{
        ...ghost,
        cursor: disabled || busy ? "default" : "pointer",
        opacity: disabled ? 0.55 : busy ? 0.7 : 1,
      }}
    >
      <Icon name="receipt" size={16} />
      <span>
        {busy ? "One moment…" : TX("payAtCounter")}
        <span
          lang="my"
          style={{ display: "block", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)" }}
        >
          {t("my", "payAtCounter")}
        </span>
      </span>
    </button>
  );
}

export function PayAtCounterCard({
  tableNumber,
  totalCents,
  busy,
  onWithdraw,
}: {
  tableNumber: number | null;
  totalCents: number;
  busy: boolean;
  onWithdraw: () => void;
}) {
  return (
    <section className="card card-textured mms-rise" style={card} aria-labelledby="counter-h">
      <p style={eyebrow}>
        <Icon name="receipt" size={14} />{" "}
        {tableNumber != null ? `Table ${tableNumber}` : "Your table"}
      </p>
      <h3 id="counter-h" style={title}>
        {TX("counterTitle")}
        <span lang="my" style={titleMy}>
          {t("my", "counterTitle")}
        </span>
      </h3>
      <p style={body}>
        {TX("counterBody")}
        <span lang="my" style={bodyMy}>
          {t("my", "counterBody")}
        </span>
      </p>
      <p style={amountRow}>
        <span style={amountLabel}>{TX("rowTotal")}</span>
        <span className="vt-cart-total" style={amount}>
          <NumberFlow value={totalCents / 100} format={{ style: "currency", currency: "USD" }} />
        </span>
      </p>
      <p style={note}>
        {TX("counterKeepOrdering")}
        <span lang="my" style={bodyMy}>
          {t("my", "counterKeepOrdering")}
        </span>
      </p>
      <button
        type="button"
        className="nav-link"
        aria-busy={busy || undefined}
        onClick={() => {
          if (busy) return;
          onWithdraw();
        }}
        style={{ ...back, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "One moment…" : TX("payOnPhoneInstead")}
        <span aria-hidden className="nav-arrow nav-arrow-fwd">
          {" "}
          →
        </span>
      </button>
    </section>
  );
}

/**
 * PD2 (m2 screen 1, appendix A1 · B1 — "The Counter Path") — THE ONE DOOR, docked.
 *
 * While the phone-pay door is parked (`SURFACES.dineInPhonePay`) the dine-in Bill has exactly one
 * way to pay, and it lives in the CartBar's own slot at the foot of the screen: a filled
 * `.checkout-cta` at `--tap-bump` (64px) with the Bill's ONE LINE SLOT directly above it. At rest
 * the slot says the next step once ("The counter takes cash." — or, with a reader, "Ready for the
 * bill?"); held, it carries the hero's one reason instead, never both (the shared vocabulary: a
 * docked hero's one line slot carries either the sentence or the held reason). Held states use
 * `aria-disabled`, never native `disabled` (the control stays reachable and reads why through
 * `aria-describedby`), and every blocked tap re-says the reason through the view's one region
 * (`onRefusedTap`). Busy reads "One moment…" at full ink with `aria-busy`.
 *
 * No amount on the door: it charges nothing, and the total sits on the slip above. The dock
 * publishes its height (`useCtaDock`) so the toast and the page's bottom padding clear it, and it
 * HIDES while the promo field has focus so it never rides the keyboard. Its paper fade is the
 * dock's own `::before` (`.counter-dock`), so lines dissolve under it and never clip.
 */
export function PayAtCounterDock({
  lineKey,
  reason,
  busy,
  hidden,
  onClick,
  onRefusedTap,
}: {
  /** The one sentence at rest: `counterTakesCash`, or `readyForBill` while the register takes a card. */
  lineKey: "counterTakesCash" | "readyForBill";
  /** The hero's ONE held reason, or null when the door is live. `my` is null where no Burmese
   *  exists for the sentence (listed English-only — never invented). */
  reason: { en: string; my: string | null } | null;
  busy: boolean;
  /** The promo field has focus: the dock and its fade leave so they never ride the keyboard. */
  hidden: boolean;
  onClick: () => void;
  /** A blocked tap says the reason again (the Bill's one region), never nothing. */
  onRefusedTap: (reason: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useCtaDock(ref, !hidden);
  const disabled = reason !== null;
  const lineEn = reason ? reason.en : TX(lineKey);
  const lineMy = reason ? reason.my : t("my", lineKey);
  return (
    <div ref={ref} className="counter-dock" hidden={hidden}>
      {/* Static text, never a live region (the view keeps its one); the door reads it through
          `aria-describedby` only while held — at rest the sentence is guidance, not a reason. */}
      <p id="counter-door-line" className="counter-dock-line">
        {lineEn}
        {lineMy && (
          <span lang="my" className="counter-dock-line-my">
            {lineMy}
          </span>
        )}
      </p>
      <button
        type="button"
        className="checkout-cta counter-dock-door"
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? "counter-door-line" : undefined}
        aria-busy={busy || undefined}
        onClick={() => {
          if (busy) return;
          if (reason) {
            onRefusedTap(reason.en);
            return;
          }
          onClick();
        }}
      >
        <span className="counter-dock-door-label">
          <Icon name="receipt" size={16} />
          <span>{busy ? "One moment…" : TX("payAtCounter")}</span>
          <span aria-hidden className="checkout-cta-arrow">
            →
          </span>
        </span>
        <span lang="my" className="counter-dock-door-my">
          {t("my", "payAtCounter")}
        </span>
      </button>
    </div>
  );
}

/**
 * PD2 (m2 screen 2 — "The counter pass") — after the ask, EVERY phone at the table becomes the
 * pass: the one sentence (the next step, said once), the table figure, the total, the receipt
 * folded into a "View bill" disclosure, and the quiet withdraw LAST. The stamp carries no "who",
 * so the screen names nobody. Amounts are never computed here — `totalCents` is `getCartTotals`'
 * figure, the same one Dad's pane reads.
 *
 * The pass paper is post-pay's `CounterPass` primitive (PATH_DESIGN round 3, "ONE PASS": every pass
 * is rendered, never redrawn — one identity figure at `--fs-pass` under "Table · စားပွဲ", a 2px
 * dotted seam with 12px notches whose holes are this host's ground, `--pass-hole` set to the page,
 * constant paper in both themes, the torn foot). The unsent mark is the kitchen track's hollow ring
 * (`KitchenTrack stage="unsent"`) with the console's own two words in the pass's head. The total,
 * the "View bill" disclosure and the receipt are the host's body; the withdraw follows the pass.
 */
export function PayAtCounterPass({
  tableNumber,
  tableCode,
  totalCents,
  sentenceKey,
  settling,
  unsent,
  busy,
  rise,
  onWithdraw,
  children,
}: {
  tableNumber: number | null;
  /** The session's join code (`SplitContext.qrCode`) — a table with no number yet (bound at
   *  Send, §33) prints its code at the pass's 40px holder tier (reconciliation 6). */
  tableCode: string | null;
  totalCents: number;
  /** `counterShowCash` (cash-only register) or the shipped `counterBody` (a reader is configured). */
  sentenceKey: "counterShowCash" | "counterBody";
  /** The register holds the settlement freeze: the sentence slot swaps to the settling line —
   *  static text, not announced. The withdraw stays live (it never waits on a freeze). */
  settling: boolean;
  /** A dish the kitchen has not got (`unsentFoodQty` — dine-in drafts the host can still send, AND
   *  to-go drafts, which fire only when the counter's payment lands): the count-free "Not sent yet"
   *  mark in the pass's head (Dad reads the same on his floor before walking over). */
  unsent: boolean;
  busy: boolean;
  /** The ask was THIS phone's: one RISE on the pass's first mount (RM: none). A tablemate's
   *  phone flips without the entrance. */
  rise: boolean;
  onWithdraw: () => void;
  /** The receipt (BillLines + the breakdown rows), shown by the "View bill" disclosure. */
  children: ReactNode;
}) {
  const [billOpen, setBillOpen] = useState(false);
  // ONE identity figure: the table number, or — before the table is bound at Send — the session's
  // code, which a screen reader hears spelt. (A session always has a code; "—" is the defensive
  // fallback for a split read that missed it.)
  const figure =
    tableNumber != null
      ? { kind: "table" as const, text: String(tableNumber) }
      : { kind: "code" as const, text: tableCode ?? "—" };
  return (
    <>
      <p className="counter-lead">
        {settling ? TX("registerSettling") : TX(sentenceKey)}
        <span lang="my" className="counter-lead-my">
          {settling ? t("my", "registerSettling") : t("my", sentenceKey)}
        </span>
      </p>
      {/* PATH_DESIGN round 3, ONE PASS: post-pay's primitive, RENDERED — the identity figure once
          under "Table · စားပွဲ", the dotted seam and its notches showing the page ground
          (`--pass-hole`), the torn foot. A numberless table (bound at Send, §33) prints its code at
          the holder's 40px tier, spelt for a screen reader (reconciliation 6). The pass hosts no
          controls: the disclosure and the withdraw sit in the host's body and after it. */}
      <div
        className={`counter-pass${rise ? " mms-rise" : ""}`}
        data-counter-ask
        style={{ "--pass-hole": "var(--pg)" } as CSSProperties}
      >
        <CounterPass
          tier={tableNumber != null ? "counter" : "holder"}
          figure={figure.text}
          figureKind={figure.kind}
          figureSpoken={figure.kind === "code" ? figure.text.split("").join(" ") : undefined}
          label={{ en: "Table", my: STAFF["floor.table"].my.replace(" {id}", "") }}
          lang="en"
          head={
            unsent ? (
              <KitchenTrack
                stage="unsent"
                size="glyph"
                word={{ en: STAFF["pad.group.unsent"].en, my: STAFF["pad.group.unsent"].my }}
              />
            ) : undefined
          }
          tear
        >
          <p className="counter-pass-total">
            <span className="counter-pass-total-label">
              {TX("rowTotal")}
              <span aria-hidden className="counter-pass-dot">
                ·
              </span>
              <span lang="my">{t("my", "rowTotal")}</span>
            </span>
            <span className="vt-cart-total counter-pass-amount">
              <NumberFlow
                value={totalCents / 100}
                format={{ style: "currency", currency: "USD" }}
              />
            </span>
          </p>
          <button
            type="button"
            className="counter-pass-disclosure"
            aria-expanded={billOpen}
            aria-controls="pass-bill"
            onClick={() => setBillOpen((o) => !o)}
          >
            <span>
              {TX("viewBill")}
              <span lang="my" className="counter-pass-disclosure-my">
                {t("my", "viewBill")}
              </span>
            </span>
            <Icon name={billOpen ? "chevron-up" : "chevron-down"} size={16} />
          </button>
          <div id="pass-bill" className="counter-pass-bill" hidden={!billOpen}>
            {children}
          </div>
        </CounterPass>
      </div>
      {/* The quiet withdraw, LAST. Its visible label leads its accessible name (WCAG 2.5.3); the
          act is the suffix. 44px. Optimistic on tap (every phone flips back on its next read). */}
      <button
        type="button"
        className="nav-link"
        aria-label="We’re not done yet — cancel paying at the counter"
        aria-busy={busy || undefined}
        onClick={() => {
          if (busy) return;
          onWithdraw();
        }}
        style={{ ...back, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "One moment…" : TX("notDoneYet")}
        <span lang="my" className="counter-withdraw-my">
          {t("my", "notDoneYet")}
        </span>
      </button>
    </>
  );
}

/**
 * The close after the bill settled while this screen was open and the cart read is gone for good.
 * `by` names HOW — the register, or a tablemate's card on their phone — because the two are
 * different sentences: "settled at the counter" on a phone whose tablemate just paid by card is
 * a false statement about where the money went (blind audit on this diff, CRITICAL 1).
 */
export function CounterSettledCard({
  by,
  menuHref,
  menuText,
}: {
  by: "counter" | "card";
  menuHref: string;
  menuText: string;
}) {
  const titleKey = by === "counter" ? "counterSettledTitle" : "billPaidTitle";
  const bodyKey = by === "counter" ? "counterSettledBody" : "billPaidBody";
  return (
    <section className="card card-textured mms-pop" style={card} aria-labelledby="settled-h">
      <p style={{ ...eyebrow, color: "var(--ok)" }}>
        <Icon name="check" size={14} /> {by === "counter" ? "Paid at the counter" : "Paid"}
      </p>
      <h3 id="settled-h" style={title}>
        {TX(titleKey)}
        <span lang="my" style={titleMy}>
          {t("my", titleKey)}
        </span>
      </h3>
      <p style={body}>
        {TX(bodyKey)}
        <span lang="my" style={bodyMy}>
          {t("my", bodyKey)}
        </span>
      </p>
      <a href={menuHref} className="nav-link-strong" style={{ marginTop: 6 }}>
        <span aria-hidden className="nav-arrow nav-arrow-back">
          ←
        </span>{" "}
        {menuText}
      </a>
    </section>
  );
}

const ghost: CSSProperties = {
  width: "100%",
  marginTop: 10,
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-body)",
  textAlign: "left",
};
const card: CSSProperties = { marginTop: 14, padding: "18px 18px 16px", display: "grid", gap: 8 };
const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-bold)",
  letterSpacing: "var(--track-caps)",
  textTransform: "uppercase",
  color: "var(--t3)",
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const title: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h2)",
  fontWeight: "var(--fw-heavy)",
  lineHeight: 1.15,
};
const titleMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--t2)",
  marginTop: 4,
};
const body: CSSProperties = {
  margin: 0,
  color: "var(--t2)",
  fontSize: "var(--fs-body)",
  lineHeight: 1.5,
};
const bodyMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-xs)",
  color: "var(--t3)",
  marginTop: 2,
};
const amountRow: CSSProperties = {
  margin: "6px 0 0",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  paddingTop: 10,
  borderTop: "1px solid var(--bd)",
};
const amountLabel: CSSProperties = { fontWeight: "var(--fw-heavy)", fontSize: "var(--fs-body)" };
const amount: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h2)",
  fontWeight: "var(--fw-heavy)",
};
const note: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  lineHeight: 1.5,
};
const back: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  marginTop: 4,
  justifySelf: "start",
};
