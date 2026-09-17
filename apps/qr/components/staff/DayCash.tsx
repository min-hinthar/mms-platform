import { type CSSProperties } from "react";
import type { DayCashResult } from "@/lib/register";
import type { StaffLang } from "@/lib/staff-lang";
import { plural } from "@/lib/i18n/fill";
import { Chrome } from "./Chrome";

/** Preformatted money — the repo's counter idiom. Latin in both tongues: it rides the `{m}` slot,
 *  which `fill()` never localizes. */
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * A4·2 — the Z-report-lite (W6a), moved VERBATIM from the register page onto the counter's one
 * screen: today's orders bucketed by tender, LA-day window, manager+ only (`getDayCashSummary`
 * hides itself from other roles — this component renders nothing for `forbidden`). An
 * order-status split, deliberately NOT a net drawer figure: line-level partial refunds leave
 * `status='paid'` (M2), so a "net cash" claim would overpromise. Server component; no hooks.
 */
export function DayCash({ lang, day }: { lang: StaffLang; day: DayCashResult }) {
  if (!day.ok) {
    return day.reason === "outage" ? (
      <p style={mut}>
        <Chrome lang={lang} k="reg.day.outage" echo="stack" />
      </p>
    ) : null;
  }
  const s = day.summary;
  return (
    <section aria-labelledby="day-cash-h" style={dayCard} className="staff-zone">
      {/* echo={false}: this heading IS the section's accessible name, and an aria-labelledby name
          is the target's FULL text — an English echo would make the region announce both scripts
          concatenated. */}
      <h2 id="day-cash-h" className="staff-zone-head">
        <Chrome lang={lang} k="reg.day.title" />
      </h2>
      <dl style={dayGrid}>
        <div style={dayCell}>
          <dt style={dayLabel}>
            <Chrome lang={lang} k="reg.day.cash" echo="stack" />
          </dt>
          <dd style={dayBig}>
            {fmt(s.cashCents)}
            <span style={dayCount}>
              {" · "}
              <Chrome
                lang={lang}
                k={plural(s.cashCount, "reg.day.orders.one", "reg.day.orders.many")}
                vars={{ n: s.cashCount }}
                echo="inline"
              />
            </span>
            {/* W17c-2 — the tip portion, stated as INCLUDED so nobody adds it to the drawer figure
                twice. Shown only once a cash tip exists, so a tipless day reads exactly as before. */}
            {s.cashTipCents > 0 && (
              <span style={dayCount}>
                {" · "}
                <Chrome
                  lang={lang}
                  k="reg.day.tips"
                  vars={{ m: fmt(s.cashTipCents) }}
                  echo="inline"
                />
              </span>
            )}
            {/* M218 — what went back OUT of the drawer, and what should therefore be IN it. The big
                figure above stays GROSS (a line refund leaves the order `paid` at its full
                `total_cents`), so without this line a manager counts the till against a number that
                has not been true since the first hand-back of the day. Shown only once cash has
                actually gone back, so a day with no refunds reads exactly as it did before. */}
            {s.cashRefundedCents > 0 && (
              <span style={dayCount}>
                {" · "}
                <Chrome
                  lang={lang}
                  k="reg.day.handedBack"
                  vars={{ m: fmt(s.cashRefundedCents) }}
                  echo="inline"
                />
                {" · "}
                {/* ⚠️ THE SIGN PICKS THE SENTENCE (Codex round 3 on #286, P2). `cashNetCents` is
                    signed, so a day whose hand-backs exceed its cash sales — this morning's refund
                    of an earlier service day — renders NEGATIVE. "-$15.00 in drawer" is not a till
                    a manager can count to; it is an impossible reconciliation target. Below zero
                    the figure is a SHORTFALL and says so, in the positive magnitude someone can
                    actually match against the day. */}
                <Chrome
                  lang={lang}
                  k={s.cashNetCents < 0 ? "reg.day.short" : "reg.day.inDrawer"}
                  vars={{ m: fmt(Math.abs(s.cashNetCents)) }}
                  echo="inline"
                />
              </span>
            )}
          </dd>
        </div>
        {/* W6c: the counter reader's takings — its own column so the register can reconcile the
            READER against Stripe Terminal, separate from online card. Rendered only once a terminal
            order exists (a two-column day stays two columns). */}
        {(s.terminalCount > 0 || s.terminalCents > 0) && (
          <div style={dayCell}>
            <dt style={dayLabel}>
              <Chrome lang={lang} k="reg.day.terminal" echo="stack" />
            </dt>
            <dd style={dayBig}>
              {fmt(s.terminalCents)}
              <span style={dayCount}>
                {" · "}
                <Chrome
                  lang={lang}
                  k={plural(s.terminalCount, "reg.day.orders.one", "reg.day.orders.many")}
                  vars={{ n: s.terminalCount }}
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
            {fmt(s.cardCents)}
            <span style={dayCount}>
              {" · "}
              <Chrome
                lang={lang}
                k={plural(s.cardCount, "reg.day.orders.one", "reg.day.orders.many")}
                vars={{ n: s.cardCount }}
                echo="inline"
              />
            </span>
          </dd>
        </div>
      </dl>
      {s.refundedCount > 0 && (
        <p style={mut}>
          <Chrome
            lang={lang}
            k={plural(s.refundedCount, "reg.day.refunded.one", "reg.day.refunded.many")}
            vars={{ n: s.refundedCount, m: fmt(s.refundedCents) }}
            echo="stack"
          />
        </p>
      )}
      <p style={mut}>
        <Chrome lang={lang} k="reg.day.note" echo="stack" />
      </p>
    </section>
  );
}

const mut: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 };
const dayCard: CSSProperties = {
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
