import { type CSSProperties } from "react";
import { requireStaffPage, roleAtLeast } from "@/lib/staff";
import { getDayTips } from "@/lib/register";
import { getStaffFeedback, type StaffFeedbackResult } from "@/lib/feedback";
import { Card, Icon } from "@mms/ui";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { PilotNightSheet } from "@/components/staff/PilotNightSheet";
import { ZoneFocus } from "@/components/staff/ZoneFocus";
import { staffHasPin } from "@/lib/staff-pin";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";
import { plural, tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";

export const metadata = { title: "Tips today — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * W17c-4 — tip transparency for the team; since A4·5 the TIPS screen, one of the five, with the
 * day's guest feedback beneath it for a manager (the old `/staff/feedback`, which redirects here:
 * the tips and the feedback are the same end-of-day read).
 *
 * Two buckets, never blended, because only some tips can be attributed to a person: `settled_by` is
 * stamped when a staff member took the money, and null when the guest paid on their own phone. This
 * screen states that distinction out loud rather than papering over it — a per-head split of the
 * shared pool would be a number this app invented, and it would look exactly like a number the owner
 * had agreed to.
 *
 * A server sees their own line; a manager or owner sees everyone's. The role rule lives in
 * `getDayTips`, not here — this is a read of what colleagues earned.
 *
 * ⚠️ P2 — THE <h2>s TAKE echo={false}, AND THAT IS NOT AN ECHO-POLICY LAPSE. Each one is the
 * target of its section's `aria-labelledby`, and a computed accessible name is the element's FULL
 * text: with an echo, the section would be named "ဒီနေ့ အပိုကြေး အားလုံးAll tips today". The heading
 * is bilingual for the eye through the page's other chrome, never by concatenating two scripts into
 * one region name.
 *
 * A4·5 — the feedback zone is ADVISORY, like the roster on the sign-in screen: its read is made
 * only for a manager (the read itself re-checks that floor — `getStaffFeedback` is public POST
 * shape), and a failed read prints its own honest line (`floor.fb.unavailable`) beneath the zone's
 * heading rather than taking the tips above it down. The pilot's nightly sheet (P5) sits above
 * the zone as it sat above the old page's list, behind its own gate.
 */
export default async function StaffTipsPage() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.tips" />;
  const hasPin = await staffHasPin(caller.staffId);
  const isManager = roleAtLeast(caller.role, "manager");

  const res = await getDayTips();
  // A failed read must never render as "you were tipped nothing" — the worst false verdict on a
  // screen whose whole job is telling someone what they earned.
  if (!res.ok) return <StaffOutageShell what="what.tips" />;

  // The feedback read, for a manager only, AFTER the tips gate held: `getStaffFeedback` answers an
  // OUTCOME for a failed table read, and a thrown gate (an outage between the two reads) is caught
  // to the same outcome — a zone's read must not take the screen down (the A4·3 posture).
  //
  // ⚠️ THE CATCH IS SAFE ONLY WHILE `getStaffFeedback` NAVIGATES FOR NOTHING. Next signals
  // `redirect()` and `notFound()` by THROWING, so a blanket catch on a call that used either would
  // swallow the navigation and print "Feedback unavailable" over it. It does not: its only throw is
  // `requireStaff("manager")`'s `AuthzError` (`lib/staff.ts`), an ordinary error. If that function
  // ever grows a redirect, this catch has to re-throw it rather than widen.
  const feedback: StaffFeedbackResult | null = isManager
    ? await getStaffFeedback().catch((e: unknown) => {
        console.error("[tips] feedback zone read threw", e);
        return { ok: false } as const;
      })
    : null;

  const lang = await readStaffLang();
  const { report, names, scope } = res;
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  // W21d (Codex P2 on #186) — when the (deliberately non-fatal) name lookup fails, fall back to
  // the ID the lib promised, shortened: "A teammate" collapsed every row into one label (a manager
  // couldn't tell whose amount was whose, and a server read the absurd "A teammate · you").
  //
  // P2: a REAL name is data and renders verbatim in whatever script it arrives in; the fallback is
  // CHROME and goes through the dictionary. This was the one authored string on the page built
  // outside JSX, where no guard reaches it — so it returns a node, not a string.
  const nameFor = (id: string) =>
    names[id] ?? <Chrome lang={lang} k="floor.tips.staffFallback" vars={{ x: id.slice(0, 8) }} />;

  return (
    <main className="staff-main">
      <StaffBar lang={lang} title="floor.tips.title" lock={hasPin} />
      <div className="staff-col" style={wrap}>
        {/* TWO keys, not one merged paragraph: the honesty sentence is shared by both scopes, and
          folding it into each scope key would duplicate a sentence K15 then has to correct twice.
          Both stack, so under Burmese this reads as two MY/EN pairs rather than one interleaved
          run — `.chrome-pair` is `display: block`, so each pair takes its own two lines. */}
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 var(--s6)" }}>
          <Chrome
            lang={lang}
            k={scope === "all" ? "floor.tips.sub.all" : "floor.tips.sub.self"}
            echo="stack"
          />{" "}
          <Chrome lang={lang} k="floor.tips.sub.real" echo="stack" />
        </p>

        <section aria-labelledby="tips-total-h" className="card" style={totalCard}>
          <h2 id="tips-total-h" style={h2}>
            {/* echo={false} — an aria-labelledby target; see the module docblock. */}
            <Chrome
              lang={lang}
              k={scope === "all" ? "floor.tips.total.all" : "floor.tips.total.self"}
            />
          </h2>
          {/* A server's headline is THEIR money only — folding the shared pool in would tell them
            it is theirs. A manager's is the day's whole take. */}
          <p style={bigNumber}>
            {dollars(scope === "all" ? report.totalCents : report.attributedCents)}
          </p>
        </section>

        {/* Attributed — someone was handed this money. */}
        <section aria-labelledby="tips-people-h" style={{ marginTop: "var(--s6)" }}>
          <h2 id="tips-people-h" style={h2}>
            {/* echo={false} — an aria-labelledby target; see the module docblock. */}
            <Chrome lang={lang} k="floor.tips.people" />
          </h2>
          {report.attributed.length === 0 ? (
            <p style={muted}>
              <Chrome
                lang={lang}
                k={scope === "all" ? "floor.tips.people.empty.all" : "floor.tips.people.empty.self"}
                echo="stack"
              />
            </p>
          ) : (
            <ul role="list" aria-label={sx(lang, "floor.tips.a11y.people")} style={list}>
              {report.attributed.map((a) => (
                <li key={a.staffId} className="card" style={row}>
                  <div style={{ minWidth: 0 }}>
                    <p style={name}>
                      {nameFor(a.staffId)}
                      {a.staffId === caller.staffId && (
                        <span style={youTag}>
                          <Chrome lang={lang} k="floor.tips.you" />
                        </span>
                      )}
                    </p>
                    <p style={muted}>
                      <Chrome
                        lang={lang}
                        k={plural(a.orderCount, "floor.tips.orders.one", "floor.tips.orders.many")}
                        vars={{ n: a.orderCount }}
                      />
                    </p>
                  </div>
                  <span style={amount}>{dollars(a.tipCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Shared — nobody took this money from a guest's hand, so it belongs to nobody in particular. */}
        <section aria-labelledby="tips-shared-h" style={{ marginTop: "var(--s6)" }}>
          <h2 id="tips-shared-h" style={h2}>
            {/* echo={false} — an aria-labelledby target; see the module docblock. */}
            <Chrome lang={lang} k="floor.tips.phone" />
          </h2>
          {report.unattributedCount === 0 ? (
            // The zero state is an ABSENCE, not a verdict — "tipped $0.00 across 0 orders" reads like
            // a measured judgement of the day, when nothing has happened yet.
            <p style={muted}>
              <Chrome lang={lang} k="floor.tips.phone.empty" echo="stack" />
            </p>
          ) : (
            // ONE sentence, split at the <strong> that emphasises the amount: Chrome's slot filler
            // emits text and <span lang="en">, never arbitrary markup, so the emphasis survives only
            // as a split. Both halves are echo={false} ON PURPOSE — a stacked or inline English echo
            // between the two halves would cut BOTH sentences in half, and the amount between them is
            // Latin and identical either way. The heading above carries this section's meaning.
            <p style={muted}>
              <Chrome lang={lang} k="floor.tips.shared.lead" />{" "}
              <strong style={{ color: "var(--tx)" }}>{dollars(report.unattributedCents)}</strong>{" "}
              <Chrome
                lang={lang}
                k={plural(
                  report.unattributedCount,
                  "floor.tips.shared.tail.one",
                  "floor.tips.shared.tail.many",
                )}
                vars={{ n: report.unattributedCount }}
              />
            </p>
          )}
        </section>

        {scope === "self" && (
          <p style={{ ...muted, marginTop: "var(--s6)" }}>
            <Chrome lang={lang} k="floor.tips.selfNote" echo="stack" />
          </p>
        )}

        {/* A4·5 — the manager's end-of-day read continues beneath the tips: tonight's pilot sheet
          (P5, behind its own gate), then the guest feedback zone the old `/staff/feedback` page was.
          A server sees neither — no "managers only" dead end, the screen simply ends. */}
        {feedback !== null && (
          <>
            <div style={{ marginTop: "var(--s6)" }}>
              <PilotNightSheet />
            </div>
            <FeedbackZone lang={lang} feedback={feedback} />
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Manager+ feedback triage (M4 P4.3) — the staff side of the UNGATED review loop. Diners rate every
 * order (ungated; the public-review link is offered to all on /track); here a manager sees recent
 * feedback with LOW ratings (≤3) surfaced for recovery. Read-only (owner-read RLS backs the table);
 * a server snapshot — low volume, no live poll needed. A zone of the Tips screen since A4·5.
 */
function FeedbackZone({ lang, feedback }: { lang: StaffLang; feedback: StaffFeedbackResult }) {
  // P5 — the read reports its OUTCOME (lib/feedback.ts): a failed read must not render as "No
  // feedback yet", least of all beside a pilot sheet that reads its own rating count from a query
  // that fails loud. `rows` is only ever consulted when the read actually happened.
  const rows = feedback.ok ? feedback.rows : [];
  const lowCount = rows.filter((r) => r.rating <= 3).length;
  return (
    <section className="staff-zone" aria-labelledby="fb-h" style={{ marginTop: "var(--s6)" }}>
      {/* echo={false}: this heading IS the zone's accessible name. `/staff/feedback` redirects onto
          this fragment; the heading takes focus on arrival (`ZoneFocus`). */}
      <h2 id="fb-h" tabIndex={-1} className="staff-zone-head">
        <Chrome lang={lang} k="floor.fb.title" />
      </h2>
      <ZoneFocus id="fb-h" />
      <p style={{ ...sub, marginTop: "var(--s3)" }}>
        {/* P5 ∩ P2 — the FAILURE arm comes first and is its own sentence, never a fall-through to
          `floor.fb.empty`: "No feedback yet" on a read that never happened is the exact fabricated
          verdict M116/M119 were filed for. Bilingual like every other arm — a manager who reads
          Burmese must not be the only one told nothing went wrong. */}
        {!feedback.ok ? (
          <Chrome lang={lang} k="floor.fb.unavailable" echo="stack" />
        ) : rows.length === 0 ? (
          <Chrome lang={lang} k="floor.fb.empty" echo="stack" />
        ) : lowCount > 0 ? (
          <Chrome
            lang={lang}
            k={plural(lowCount, "floor.fb.low.one", "floor.fb.low.many")}
            vars={{ n: lowCount }}
            echo="stack"
          />
        ) : (
          <Chrome lang={lang} k="floor.fb.allGood" echo="stack" />
        )}
      </p>

      {rows.length > 0 && (
        <ul
          role="list"
          // QA §A: a `role="list"` with `list-style: none` needs a name. It has no visible label of
          // its own, so the name is aria-only — `sx()`, never `al()`.
          aria-label={sx(lang, "floor.fb.a11y.list")}
          style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 10 }}
        >
          {rows.map((r) => {
            const low = r.rating <= 3;
            return (
              <Card
                as="li"
                key={r.id}
                style={{ ...rowCard, borderColor: low ? "var(--warn)" : "var(--bd)" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    role="img"
                    // Two runtime counts, so this is `tf` and not `sx` — `sx()` takes no vars. Both
                    // ride count slots, so a Burmese console announces "ကြယ် ၅ ထဲမှ ၄ ကြယ်".
                    aria-label={tf(lang, "floor.fb.a11y.stars", { n: r.rating, total: 5 })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                      color: low ? "var(--warn)" : "var(--ac)",
                    }}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <Icon
                        key={i}
                        name="star"
                        size={15}
                        fill={i < r.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </span>
                  {/* A badge, not a control — echo={false}: two scripts cannot legibly stack in a chip. */}
                  {low && (
                    <span style={followChip}>
                      <Chrome lang={lang} k="floor.fb.followUp" />
                    </span>
                  )}
                  <span
                    style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--t3)" }}
                  >
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {r.comment && (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: "var(--fs-sm)",
                      color: "var(--tx)",
                      lineHeight: 1.5,
                    }}
                  >
                    “{r.comment}”
                  </p>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto" };
// P7·1b — the staff bar is the page's header; the constants below style the content beneath it.
const h2: CSSProperties = { fontSize: "var(--fs-h3)", margin: "0 0 var(--s3)" };
const totalCard: CSSProperties = { padding: "var(--s5)" };
const bigNumber: CSSProperties = { fontSize: "var(--fs-h1)", fontWeight: 800, margin: 0 };
const list: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: "var(--s2)",
};
const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--s3)",
  padding: "var(--s3) var(--s4)",
};
const name: CSSProperties = { margin: 0, fontWeight: 700, fontSize: "var(--fs-body)" };
const youTag: CSSProperties = { color: "var(--ac-strong)", fontWeight: 600 };
const amount: CSSProperties = { fontWeight: 800, fontSize: "var(--fs-body)" };
const muted: CSSProperties = { margin: 0, color: "var(--t2)", fontSize: "var(--fs-sm)" };
const sub: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
// Surface comes from `.card` via <Card>; this is layout only (borderColor is overridden per-row).
const rowCard: CSSProperties = {
  padding: "12px 14px",
};
const followChip: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  color: "var(--warn)",
  border: "1px solid var(--warn)",
  borderRadius: 999,
  padding: "2px 8px",
};
