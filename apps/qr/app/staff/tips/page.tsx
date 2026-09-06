import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getDayTips } from "@/lib/register";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";
import { plural } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";

export const metadata = { title: "Tips today — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * W17c-4 — tip transparency for the team.
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
 * ⚠️ P2 — THE THREE <h2>s TAKE echo={false}, AND THAT IS NOT AN ECHO-POLICY LAPSE. Each one is the
 * target of its section's `aria-labelledby`, and a computed accessible name is the element's FULL
 * text: with an echo, the section would be named "ဒီနေ့ အပိုကြေး အားလုံးAll tips today". The heading
 * is bilingual for the eye through the page's other chrome, never by concatenating two scripts into
 * one region name.
 */
export default async function StaffTipsPage() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.tips" />;

  const res = await getDayTips();
  // A failed read must never render as "you were tipped nothing" — the worst false verdict on a
  // screen whose whole job is telling someone what they earned.
  if (!res.ok) return <StaffOutageShell what="what.tips" />;

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
    <main style={wrap}>
      <div style={topRow}>
        <Link href="/staff" style={back}>
          <Chrome lang={lang} k="floor.back" />
        </Link>
        <StaffLangSwitch lang={lang} />
      </div>
      <h1 style={{ fontSize: "var(--fs-h1)", margin: "0 0 4px" }}>
        <Chrome lang={lang} k="floor.tips.title" echo="stack" />
      </h1>
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
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "var(--s6)" };
// The back link and the language control share one row — no vertical cost on a money screen.
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  marginBottom: "var(--s4)",
};
const back: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  textDecoration: "none",
};
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
