import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getDayCashSummary, getRegisterQueue } from "@/lib/register";
import { RegisterStart } from "@/components/staff/RegisterStart";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Register — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The FOH register (W6a — closes K6): walk-up and phone orders finally have a way to exist. Counter
 * home for any staff role — start an order, resume an open one. Counter (`reg-`) sessions live here,
 * deliberately OFF the floor board. Day cash summary lands in W6a·3.
 */
export default async function RegisterPage() {
  const caller = await requireStaffPage("server");
  if (!caller) return <StaffOutageShell what="what.register" />;

  const [queue, day] = await Promise.all([getRegisterQueue(), getDayCashSummary()]);

  return (
    <main style={wrap}>
      <Link href="/staff" style={back}>
        <span aria-hidden>←</span> Floor
      </Link>
      <h1 style={h1}>Register</h1>
      <p style={sub}>Walk-up and phone orders, entered here and paid at the counter.</p>

      <RegisterStart />

      <h2 style={h2}>Open counter orders</h2>
      {!queue.ok ? (
        <p style={mut}>Couldn’t load the counter queue — check the connection and refresh.</p>
      ) : queue.rows.length === 0 ? (
        <p style={mut}>None right now.</p>
      ) : (
        <ul role="list" style={list} aria-label="Open counter orders">
          {queue.rows.map((r) => (
            <li key={r.sessionId}>
              <Link
                href={`/staff/table/${r.sessionId}/add`}
                style={rowCard}
                aria-label={`Resume ${r.customerName ?? "walk-up"} — ${r.itemCount} item${r.itemCount === 1 ? "" : "s"}`}
              >
                <span style={rowName}>
                  {r.customerName ?? "Walk-up"}
                  {r.source === "kiosk" && <span style={rowMeta}> · Kiosk</span>}
                </span>
                <span style={rowMeta}>
                  {r.itemCount} item{r.itemCount === 1 ? "" : "s"} · $
                  {(r.subtotalCents / 100).toFixed(2)} + tax
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The Z-report-lite — manager+ only (getDayCashSummary hides itself from other roles). An
          order-status split, deliberately NOT a net drawer figure: line-level partial refunds leave
          status='paid' (M2), so a "net cash" claim would overpromise. */}
      {day.ok && (
        <section aria-labelledby="day-cash-h" style={dayCard}>
          <h2 id="day-cash-h" style={h2}>
            Today’s takings
          </h2>
          <dl style={dayGrid}>
            <div style={dayCell}>
              <dt style={dayLabel}>Cash</dt>
              <dd style={dayBig}>
                ${(day.summary.cashCents / 100).toFixed(2)}
                <span style={dayCount}> · {day.summary.cashCount} orders</span>
                {/* W17c-2 — the tip portion, stated as INCLUDED so nobody adds it to the drawer
                    figure twice. Shown only once a cash tip exists, so a tipless day reads exactly
                    as it did before. */}
                {day.summary.cashTipCents > 0 && (
                  <span style={dayCount}>
                    {" "}
                    · incl. ${(day.summary.cashTipCents / 100).toFixed(2)} tips
                  </span>
                )}
              </dd>
            </div>
            {/* W6c: the counter reader's takings — its own column so the register can reconcile
                the READER against Stripe Terminal, separate from online card. Rendered only once
                a terminal order exists (a two-column day stays two columns). */}
            {(day.summary.terminalCount > 0 || day.summary.terminalCents > 0) && (
              <div style={dayCell}>
                <dt style={dayLabel}>Card · reader</dt>
                <dd style={dayBig}>
                  ${(day.summary.terminalCents / 100).toFixed(2)}
                  <span style={dayCount}> · {day.summary.terminalCount} orders</span>
                </dd>
              </div>
            )}
            <div style={dayCell}>
              <dt style={dayLabel}>Card · online</dt>
              <dd style={dayBig}>
                ${(day.summary.cardCents / 100).toFixed(2)}
                <span style={dayCount}> · {day.summary.cardCount} orders</span>
              </dd>
            </div>
          </dl>
          {day.summary.refundedCount > 0 && (
            <p style={mut}>
              {day.summary.refundedCount} order{day.summary.refundedCount === 1 ? "" : "s"} paid
              today and since fully refunded (${(day.summary.refundedCents / 100).toFixed(2)}) — not
              counted above. A refund of an earlier day&rsquo;s order shows on Orders &amp; refunds,
              not here.
            </p>
          )}
          <p style={mut}>
            Since midnight (LA). Order totals by status — line-level refunds aren’t netted out;
            check Orders &amp; refunds for those.
          </p>
        </section>
      )}
      {!day.ok && day.reason === "outage" && (
        <p style={mut}>Today’s takings can’t load right now — the system is unreachable.</p>
      )}
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "var(--s5) var(--s4) var(--s8)",
};
const back: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--ac-strong)",
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--s1)",
};
const h1: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h1)",
  margin: "var(--s2) 0 0",
};
const sub: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "var(--s1) 0 var(--s5)",
};
const h2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h3)",
  margin: "var(--s6) 0 var(--s3)",
};
const mut: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)" };
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s2)",
};
const rowCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--s3)",
  minHeight: 56,
  padding: "var(--s2) var(--s4)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  textDecoration: "none",
};
const rowName: CSSProperties = { fontWeight: 700, fontSize: "var(--fs-body)" };
const rowMeta: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)" };
const dayCard: CSSProperties = {
  marginTop: "var(--s6)",
  padding: "var(--s4)",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
};
const dayGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--s4)",
  margin: 0,
};
const dayCell: CSSProperties = { display: "grid", gap: "var(--s1)" };
const dayLabel: CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--t2)" };
const dayBig: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h2)",
  fontWeight: 800,
  margin: 0,
};
const dayCount: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--fs-sm)",
  fontWeight: 400,
  color: "var(--t2)",
};
