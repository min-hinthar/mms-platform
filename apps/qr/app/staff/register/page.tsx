import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getDayCashSummary, getRegisterQueue, type RegisterQueueRow } from "@/lib/register";
import { RegisterStart } from "@/components/staff/RegisterStart";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";
import { ts } from "@/lib/i18n/staff";
import { plural, tf } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";

export const metadata = { title: "Register — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/** Preformatted money — the repo's counter idiom (`ApprovalsBoard`, `StaffLineEditor`). Latin in
 *  both tongues: it rides the `{m}` slot, which `fill()` never localizes. */
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The queue row's accessible SUBJECT — the same dictionary renders the row shows, in the same order,
 * joined by punctuation only.
 *
 * Built here, outside the JSX, rather than as a hand-written template at the attribute: the row's
 * visible text and its accessible name are one derivation, so an edit to `reg.row.*` moves both and
 * WCAG 2.5.3 containment cannot drift the way OPEN-ITEMS P2g describes.
 */
function rowSubject(lang: StaffLang, r: RegisterQueueRow): string {
  const name = r.customerName ?? ts(lang, "reg.row.walkup");
  const source = r.source === "kiosk" ? ` · ${ts(lang, "reg.row.kiosk")}` : "";
  const meta = tf(lang, plural(r.itemCount, "reg.row.one", "reg.row.many"), {
    n: r.itemCount,
    m: fmt(r.subtotalCents),
  });
  return `${name}${source}, ${meta}`;
}

/**
 * The FOH register (W6a — closes K6): walk-up and phone orders finally have a way to exist. Counter
 * home for any staff role — start an order, resume an open one. Counter (`reg-`) sessions live here,
 * deliberately OFF the floor board. Day cash summary lands in W6a·3.
 *
 * P2 — the counter tablet speaks the device language. The switch is mounted HERE, beside the exit
 * link, rather than by `app/staff/layout.tsx` (a layout strip would steal measured height from the
 * KDS); `check-staff-lang.mjs` rule 4 holds this surface to that mount.
 */
export default async function RegisterPage() {
  const caller = await requireStaffPage("server");
  if (!caller) return <StaffOutageShell what="what.register" />;

  const lang = await readStaffLang();
  const [queue, day] = await Promise.all([getRegisterQueue(), getDayCashSummary()]);

  return (
    <main style={wrap}>
      <div style={topRow}>
        <Link href="/staff" style={back}>
          <Chrome lang={lang} k="reg.back" />
        </Link>
        <StaffLangSwitch lang={lang} />
      </div>
      <h1 style={h1}>
        <Chrome lang={lang} k="reg.title" echo="stack" />
      </h1>
      <p style={sub}>
        <Chrome lang={lang} k="reg.sub" echo="stack" />
      </p>

      <RegisterStart />

      <h2 style={h2}>
        <Chrome lang={lang} k="reg.queue.title" echo="stack" />
      </h2>
      {!queue.ok ? (
        <p style={mut}>
          <Chrome lang={lang} k="reg.queue.failed" echo="stack" />
        </p>
      ) : queue.rows.length === 0 ? (
        <p style={mut}>
          <Chrome lang={lang} k="reg.queue.empty" echo="stack" />
        </p>
      ) : (
        <ul role="list" style={list} aria-label={sx(lang, "reg.a11y.queue")}>
          {queue.rows.map((r) => {
            // The whole row is one link, so its visible content is a paragraph rather than a label —
            // the `recall` inversion (lib/staff-labels.ts): the verb leads the announcement, and the
            // guest's name plus the line meta are what the name must contain.
            const { aria } = al(lang, {
              kind: "verb",
              verb: "reg.verb.resume",
              subject: rowSubject(lang, r),
            });
            return (
              <li key={r.sessionId}>
                <Link href={`/staff/table/${r.sessionId}/add`} style={rowCard} aria-label={aria}>
                  <span style={rowName}>
                    {r.customerName ?? <Chrome lang={lang} k="reg.row.walkup" echo="inline" />}
                    {r.source === "kiosk" && (
                      <span style={rowMeta}>
                        {" · "}
                        {/* A badge: no echo — two scripts cannot legibly stack in one. */}
                        <Chrome lang={lang} k="reg.row.kiosk" />
                      </span>
                    )}
                  </span>
                  <span style={rowMeta}>
                    <Chrome
                      lang={lang}
                      k={plural(r.itemCount, "reg.row.one", "reg.row.many")}
                      vars={{ n: r.itemCount, m: fmt(r.subtotalCents) }}
                      echo="inline"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* The Z-report-lite — manager+ only (getDayCashSummary hides itself from other roles). An
          order-status split, deliberately NOT a net drawer figure: line-level partial refunds leave
          status='paid' (M2), so a "net cash" claim would overpromise. */}
      {day.ok && (
        <section aria-labelledby="day-cash-h" style={dayCard}>
          {/* echo={false}: this heading IS the section's accessible name, and an aria-labelledby
              name is the target's FULL text — an English echo would make the region announce both
              scripts concatenated. */}
          <h2 id="day-cash-h" style={h2}>
            <Chrome lang={lang} k="reg.day.title" />
          </h2>
          <dl style={dayGrid}>
            <div style={dayCell}>
              <dt style={dayLabel}>
                <Chrome lang={lang} k="reg.day.cash" echo="stack" />
              </dt>
              <dd style={dayBig}>
                {fmt(day.summary.cashCents)}
                <span style={dayCount}>
                  {" · "}
                  <Chrome
                    lang={lang}
                    k={plural(day.summary.cashCount, "reg.day.orders.one", "reg.day.orders.many")}
                    vars={{ n: day.summary.cashCount }}
                    echo="inline"
                  />
                </span>
                {/* W17c-2 — the tip portion, stated as INCLUDED so nobody adds it to the drawer
                    figure twice. Shown only once a cash tip exists, so a tipless day reads exactly
                    as it did before. */}
                {day.summary.cashTipCents > 0 && (
                  <span style={dayCount}>
                    {" · "}
                    <Chrome
                      lang={lang}
                      k="reg.day.tips"
                      vars={{ m: fmt(day.summary.cashTipCents) }}
                      echo="inline"
                    />
                  </span>
                )}
              </dd>
            </div>
            {/* W6c: the counter reader's takings — its own column so the register can reconcile
                the READER against Stripe Terminal, separate from online card. Rendered only once
                a terminal order exists (a two-column day stays two columns). */}
            {(day.summary.terminalCount > 0 || day.summary.terminalCents > 0) && (
              <div style={dayCell}>
                <dt style={dayLabel}>
                  <Chrome lang={lang} k="reg.day.terminal" echo="stack" />
                </dt>
                <dd style={dayBig}>
                  {fmt(day.summary.terminalCents)}
                  <span style={dayCount}>
                    {" · "}
                    <Chrome
                      lang={lang}
                      k={plural(
                        day.summary.terminalCount,
                        "reg.day.orders.one",
                        "reg.day.orders.many",
                      )}
                      vars={{ n: day.summary.terminalCount }}
                      echo="inline"
                    />
                  </span>
                </dd>
              </div>
            )}
            <div style={dayCell}>
              <dt style={dayLabel}>
                <Chrome lang={lang} k="reg.day.card" echo="stack" />
              </dt>
              <dd style={dayBig}>
                {fmt(day.summary.cardCents)}
                <span style={dayCount}>
                  {" · "}
                  <Chrome
                    lang={lang}
                    k={plural(day.summary.cardCount, "reg.day.orders.one", "reg.day.orders.many")}
                    vars={{ n: day.summary.cardCount }}
                    echo="inline"
                  />
                </span>
              </dd>
            </div>
          </dl>
          {day.summary.refundedCount > 0 && (
            <p style={mut}>
              <Chrome
                lang={lang}
                k={plural(
                  day.summary.refundedCount,
                  "reg.day.refunded.one",
                  "reg.day.refunded.many",
                )}
                vars={{ n: day.summary.refundedCount, m: fmt(day.summary.refundedCents) }}
                echo="stack"
              />
            </p>
          )}
          <p style={mut}>
            <Chrome lang={lang} k="reg.day.note" echo="stack" />
          </p>
        </section>
      )}
      {!day.ok && day.reason === "outage" && (
        <p style={mut}>
          <Chrome lang={lang} k="reg.day.outage" echo="stack" />
        </p>
      )}
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "var(--s5) var(--s4) var(--s8)",
};
/** The exit link and the language control share one row — the switch is the counter's, not a strip. */
const topRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--s3)",
  flexWrap: "wrap",
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
