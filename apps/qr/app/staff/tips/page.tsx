import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getDayTips } from "@/lib/register";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

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
 */
export default async function StaffTipsPage() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="today’s tips" />;

  const res = await getDayTips();
  // A failed read must never render as "you were tipped nothing" — the worst false verdict on a
  // screen whose whole job is telling someone what they earned.
  if (!res.ok) return <StaffOutageShell what="today’s tips" />;

  const { report, names, scope } = res;
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const nameFor = (id: string) => names[id] ?? "A teammate";

  return (
    <main style={wrap}>
      <Link href="/staff" style={{ ...back, marginBottom: "var(--s4)" }}>
        ← Floor
      </Link>
      <h1 style={{ fontSize: "var(--fs-h1)", margin: "0 0 4px" }}>Tips today</h1>
      <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 var(--s6)" }}>
        {scope === "all"
          ? "Everything guests tipped since midnight, and who took it."
          : "What you were handed since midnight."}{" "}
        Real amounts only — nothing here is an estimate or a projection.
      </p>

      <section aria-labelledby="tips-total-h" className="card" style={totalCard}>
        <h2 id="tips-total-h" style={h2}>
          {scope === "all" ? "All tips today" : "Your tips today"}
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
          Handed to a person
        </h2>
        {report.attributed.length === 0 ? (
          <p style={muted}>
            {scope === "all"
              ? "Nobody has settled a tipped order yet today."
              : "You haven’t settled a tipped order yet today."}
          </p>
        ) : (
          <ul role="list" aria-label="Tips by person" style={list}>
            {report.attributed.map((a) => (
              <li key={a.staffId} className="card" style={row}>
                <div style={{ minWidth: 0 }}>
                  <p style={name}>
                    {nameFor(a.staffId)}
                    {a.staffId === caller.staffId && <span style={youTag}> · you</span>}
                  </p>
                  <p style={muted}>
                    {a.orderCount} {a.orderCount === 1 ? "order" : "orders"}
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
          Paid on a phone
        </h2>
        {report.unattributedCount === 0 ? (
          // The zero state is an ABSENCE, not a verdict — "tipped $0.00 across 0 orders" reads like
          // a measured judgement of the day, when nothing has happened yet.
          <p style={muted}>No tips from phone payments yet today.</p>
        ) : (
          <p style={muted}>
            Guests who paid on their own phones tipped{" "}
            <strong style={{ color: "var(--tx)" }}>{dollars(report.unattributedCents)}</strong>{" "}
            across {report.unattributedCount} {report.unattributedCount === 1 ? "order" : "orders"}.
            Nobody handed this to anyone, so it isn’t credited to a person — how it’s shared is the
            owner’s call, and this screen won’t guess at it.
          </p>
        )}
      </section>

      {scope === "self" && (
        <p style={{ ...muted, marginTop: "var(--s6)" }}>
          You’re seeing your own line. Managers see the whole team’s.
        </p>
      )}
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "var(--s6)" };
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
