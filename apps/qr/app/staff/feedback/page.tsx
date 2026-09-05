import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getStaffFeedback } from "@/lib/feedback";
import { Card, Icon } from "@mms/ui";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { PilotNightSheet } from "@/components/staff/PilotNightSheet";

export const metadata = { title: "Feedback — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Manager+ feedback triage (M4 P4.3) — the staff side of the UNGATED review loop. Diners rate every order
 * (ungated; the public-review link is offered to all on /track); here a manager sees recent feedback with
 * LOW ratings (≤3) surfaced for recovery. Same verified-staff gate as the floor/approvals + a MANAGER role
 * floor. Read-only (owner-read RLS backs the table); a server snapshot — low volume, no live poll needed.
 */
export default async function FeedbackPage() {
  const caller = await requireStaffPage("manager");
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="feedback" />;

  // P5 — the read reports its OUTCOME now (lib/feedback.ts): a failed read must not render as
  // "No feedback yet", least of all directly beneath a pilot sheet that reads its own rating count
  // from a query that fails loud. `rows` is only ever consulted when the read actually happened.
  const feedback = await getStaffFeedback();
  const rows = feedback.ok ? feedback.rows : [];
  const lowCount = rows.filter((r) => r.rating <= 3).length;

  return (
    <main style={wrap}>
      <Link href="/staff" style={back}>
        ← Floor
      </Link>
      {/* P5 — tonight's pilot numbers sit ABOVE the feedback list because they are the other half of
          the same 9pm read, and because the feedback list below is unbounded while the sheet is not.

          ⚠️ THE SHEET RE-CHECKS THE MANAGER FLOOR ITSELF rather than trusting this page's, and the
          first draft of this comment got the reason wrong — it said "a server's view of this page is
          unchanged", which is vacuous: `requireStaffPage("manager")` above redirects a server before
          they reach any of this. The real reason is the one `lib/feedback.ts` gives for re-checking
          inside `getStaffFeedback`: a gate that lives only at the mount point is a gate that a later
          re-mount, or a lowered floor on this page, silently removes. `getPilotNight` carries its
          own, so the component is safe to mount anywhere. */}
      <PilotNightSheet />
      <h1 style={h1}>Guest feedback</h1>
      <p style={sub}>
        {!feedback.ok
          ? "We can’t read the feedback list right now — nothing is lost. Try again in a moment."
          : rows.length === 0
            ? "No feedback yet. Diners are asked to rate after every order."
            : lowCount > 0
              ? `${lowCount} recent rating${lowCount === 1 ? "" : "s"} need follow-up.`
              : "All recent ratings look good."}
      </p>

      {rows.length > 0 && (
        <ul
          role="list"
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
                    aria-label={`${r.rating} of 5 stars`}
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
                  {low && <span style={followChip}>Needs follow-up</span>}
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
    </main>
  );
}

const wrap: CSSProperties = { padding: 24, maxWidth: 560, margin: "0 auto" };
const back: CSSProperties = {
  color: "var(--ac)",
  fontWeight: 700,
  display: "inline-block",
  padding: "12px 0",
};
const h1: CSSProperties = {
  fontSize: "var(--fs-h1)",
  fontWeight: 900,
  margin: "4px 0 2px",
  color: "var(--tx)",
};
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
