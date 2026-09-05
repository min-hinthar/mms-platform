import type { ReactNode } from "react";
import Link from "next/link";
import { Chrome } from "./Chrome";
import { getPilotNight } from "@/lib/pilot";
import { readStaffLang } from "@/lib/staff-lang-server";
import { STAFF_CHANNEL_KEY } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";

/**
 * P5 — tonight's pilot sheet, on `/staff/feedback` (`docs/PILOT_PLAN.md` §3 P5).
 *
 * The pilot's nightly ritual is: read the numbers, collect the marked-up word-check sheet, and
 * confirm nothing was charged that has no order behind it. Five of those numbers already existed
 * somewhere in the console; none of them existed on one screen at 9pm. This is that screen, and it
 * lives beside the guest feedback because that is the other half of the same nightly read.
 *
 * READ-ONLY, for the whole pilot. K13 (a staff reply path) stays open by decision — two weeks does
 * not justify a write path, and a half-built one would be worse than none.
 *
 * ⚠️ WHAT IT REFUSES TO SAY, which is the part worth reviewing:
 *   • It never fabricates a channel. An order whose session mode cannot be read is printed as "no
 *     channel recorded", not distributed across the three doors and not dropped.
 *   • It never claims the Stripe reconciliation has been done. The app cannot see Stripe; the check
 *     stays a hand-check and the sheet says so in words rather than printing a number that would
 *     look like an answer.
 *   • It discloses the one way its own discount count under-reports: `mms_fulfill_split_order`
 *     consumes no promo redemption, so a table that split its bill never appears in
 *     `promo_redemptions` — and the Day-0 script's own first table splits its bill. A count with a
 *     known blind spot is only honest while the blind spot is printed next to it.
 *   • A failed read is never a zero — `getPilotNight` collapses to `ok: false` and this renders the
 *     "can't read tonight" sentence instead of a confident, false quiet night.
 *
 * ⚠️ IT MUST NOT MOUNT `<StaffLangSwitch>`, directly or through anything it imports.
 * `app/staff/feedback/page.tsx` is on `check-staff-lang.mjs`'s SWITCH_TODO ratchet, whose self-check
 * fails a listed page that HAS a control — converting that page is P2 PR B's slice, not this one,
 * and a switch arriving here by a transitive import would redden their ratchet from our diff.
 */
export async function PilotNightSheet() {
  const lang = await readStaffLang();
  const res = await getPilotNight();

  // A role refusal simply hides the zone — the same rule the register's Z-report follows. Only an
  // OUTAGE gets a sentence, because only an outage is something the reader can act on (wait, retry).
  if (!res.ok) return res.reason === "outage" ? <Unreadable lang={lang} /> : null;
  const { night } = res;

  return (
    <section className="pns" aria-labelledby="pns-h">
      <div className="pns-head">
        <h2 className="pns-title" id="pns-h">
          <Chrome lang={lang} k="pilot.night.title" echo="inline" />
        </h2>
        <p className="pns-since">
          <Chrome lang={lang} k="pilot.night.since" vars={{ t: laDate(night.sinceIso) }} />
        </p>
      </div>

      <dl className="pns-grid">
        {night.promoLive ? (
          <Figure
            value={night.pilotRedemptions}
            label={
              <Chrome
                lang={lang}
                k="pilot.night.promo"
                vars={{ x: night.promoCode }}
                echo="stack"
              />
            }
            // C4 — the disclosure lives BESIDE the figure it qualifies. Under the recovery block it
            // read as "not counted above" about the orders and the takings, where it is FALSE: a
            // split settle writes a real paid `qr_orders` row. What it skips is the redemption.
            detail={
              <span className="pns-chip pns-chip-warn">
                <Chrome lang={lang} k="pilot.night.split" echo={false} />
              </span>
            }
          />
        ) : (
          // P5 landed ahead of P3, which inserts the row. A structural 0 under "discounts given"
          // would be true and would read as "nobody used it" — a different claim, and the wrong one.
          <div className="pns-cell">
            <dt className="pns-label">
              <Chrome
                lang={lang}
                k="pilot.night.promo"
                vars={{ x: night.promoCode }}
                echo="stack"
              />
            </dt>
            <dd className="pns-value pns-value-none">
              <Chrome
                lang={lang}
                k="pilot.night.promo.unset"
                vars={{ x: night.promoCode }}
                echo="stack"
              />
            </dd>
          </div>
        )}
        <Figure
          value={night.split.counted + night.split.unattributed}
          label={<Chrome lang={lang} k="pilot.night.orders" echo="stack" />}
          detail={
            <>
              {night.split.channels.map((c) => (
                <span key={c.mode} className="pns-chip">
                  <Chrome lang={lang} k={STAFF_CHANNEL_KEY[c.mode]} echo={false} />{" "}
                  <b className="pns-chip-n">{c.orders}</b>
                </span>
              ))}
              {/* Printed ONLY when there is something to disclose — a permanent "0 unattributed"
                  row would train the reader to stop seeing it. */}
              {night.split.unattributed > 0 && (
                <span className="pns-chip pns-chip-warn">
                  <Chrome lang={lang} k="pilot.night.unattributed" echo={false} />{" "}
                  <b className="pns-chip-n">{night.split.unattributed}</b>
                </span>
              )}
            </>
          }
        />
        <Figure
          value={night.ratings.total}
          label={<Chrome lang={lang} k="pilot.night.ratings" echo="stack" />}
          detail={
            night.ratings.low > 0 ? (
              <span className="pns-chip pns-chip-warn">
                <Chrome
                  lang={lang}
                  k="pilot.night.ratings.low"
                  vars={{ n: night.ratings.low }}
                  echo={false}
                />
              </span>
            ) : null
          }
        />
      </dl>

      {/* The takings are QUOTED from the register's own summary, bucket by bucket, with no sum of
          our own — a second arithmetic on a money figure is the drift the W17 rules are about, and
          the register is where the full report (refunds included) already lives. */}
      <div className="pns-money">
        <h3 className="pns-sub">
          <Chrome lang={lang} k="pilot.night.money" echo="inline" />
        </h3>
        <dl className="pns-money-grid">
          <Money lang={lang} k="pilot.night.money.cash" cents={night.money.cashCents} />
          <Money lang={lang} k="pilot.night.money.card" cents={night.money.cardCents} />
          <Money lang={lang} k="pilot.night.money.reader" cents={night.money.terminalCents} />
        </dl>
        {/* C2 — the register prints this line beside the same buckets and the sheet dropped it.
            A fully-refunded order is NOT in the figures above, so a drawer count that ignores this
            is over by exactly those orders. Shown only when there are any, like the register. */}
        {night.money.refundedCount > 0 && (
          <p className="pns-note pns-note-warn">
            <Chrome
              lang={lang}
              k="pilot.night.money.refunded"
              vars={{
                n: night.money.refundedCount,
                m: `$${(night.money.refundedCents / 100).toFixed(2)}`,
              }}
              echo="stack"
            />
          </p>
        )}
        <p className="pns-note">
          <Chrome lang={lang} k="pilot.night.money.where" echo="stack" />
        </p>
      </div>

      <div className="pns-recovery">
        <h3 className="pns-sub">
          <Chrome lang={lang} k="pilot.night.recovery" echo="inline" />
        </h3>
        {night.unresolvedRecoveries === 0 ? (
          <p className="pns-ok">
            <Chrome lang={lang} k="pilot.night.recovery.none" echo="stack" />
          </p>
        ) : (
          <p className="pns-warn">
            <Link href="/staff/approvals" className="pns-link">
              <Chrome
                lang={lang}
                k="pilot.night.recovery.some"
                vars={{ n: night.unresolvedRecoveries }}
                echo="stack"
              />
            </Link>
          </p>
        )}
        <p className="pns-note">
          <Chrome lang={lang} k="pilot.night.recovery.scope" echo="stack" />
        </p>
        <p className="pns-note">
          <Chrome lang={lang} k="pilot.night.stripe" echo="stack" />
        </p>
      </div>

      <Link href="/staff/glossary" className="pns-cta">
        <Chrome lang={lang} k="pilot.night.glossary" echo="inline" />
      </Link>
    </section>
  );
}

function Unreadable({ lang }: { lang: StaffLang }) {
  return (
    <section className="pns" aria-labelledby="pns-h">
      <h2 className="pns-title" id="pns-h">
        <Chrome lang={lang} k="pilot.night.title" echo="inline" />
      </h2>
      <p className="pns-warn">
        <Chrome lang={lang} k="pilot.night.unreadable" echo="stack" />
      </p>
    </section>
  );
}

/**
 * One counted figure. The NUMBER stays Latin whatever the console's language — it sits in a
 * `tabular-nums` column, and Padauk ships no tabular Myanmar figures, which is the same reason the
 * KDS stat row is Latin by construction (`lib/i18n/fill.ts`'s numeral rule).
 */
function Figure({
  value,
  label,
  detail = null,
}: {
  value: number;
  label: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="pns-cell">
      <dt className="pns-label">{label}</dt>
      <dd className="pns-value">
        <span className="pns-n">{value}</span>
        {detail && <span className="pns-detail">{detail}</span>}
      </dd>
    </div>
  );
}

function Money({
  lang,
  k,
  cents,
}: {
  lang: StaffLang;
  k: "pilot.night.money.cash" | "pilot.night.money.card" | "pilot.night.money.reader";
  cents: number;
}) {
  return (
    <div className="pns-cell">
      <dt className="pns-label">
        <Chrome lang={lang} k={k} echo={false} />
      </dt>
      {/* The same `(cents / 100).toFixed(2)` the register renders — the FIGURE is quoted from
          `summarizeDay`; only its presentation happens here. */}
      <dd className="pns-value">${(cents / 100).toFixed(2)}</dd>
    </div>
  );
}

/** The service day, in the restaurant's own clock — the same TZ every date surface here uses. */
function laDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
