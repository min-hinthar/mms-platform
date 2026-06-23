import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth, roleAtLeast } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { getStaffFeedback } from "@/lib/feedback";

export const metadata = { title: "Feedback — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Manager+ feedback triage (M4 P4.3) — the staff side of the UNGATED review loop. Diners rate every order
 * (ungated; the public-review link is offered to all on /track); here a manager sees recent feedback with
 * LOW ratings (≤3) surfaced for recovery. Same verified-staff gate as the floor/approvals + a MANAGER role
 * floor. Read-only (owner-read RLS backs the table); a server snapshot — low volume, no live poll needed.
 */
export default async function FeedbackPage() {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  if (!roleAtLeast(auth.caller.role, "manager")) redirect("/staff");

  const rows = await getStaffFeedback();
  const lowCount = rows.filter((r) => r.rating <= 3).length;

  return (
    <main style={wrap}>
      <Link href="/staff" style={back}>
        ← Floor
      </Link>
      <h1 style={h1}>Guest feedback</h1>
      <p style={sub}>
        {rows.length === 0
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
              <li key={r.id} style={{ ...rowCard, borderColor: low ? "var(--warn)" : "var(--bd)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{ fontWeight: 800, color: low ? "var(--warn)" : "var(--ac)" }}
                    aria-label={`${r.rating} of 5 stars`}
                  >
                    <span aria-hidden>
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </span>
                  </span>
                  {low && <span style={followChip}>Needs follow-up</span>}
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--t3)" }}>
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
                      fontSize: 13.5,
                      color: "var(--tx)",
                      lineHeight: 1.5,
                    }}
                  >
                    “{r.comment}”
                  </p>
                )}
              </li>
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
  fontSize: 24,
  fontWeight: 900,
  margin: "4px 0 2px",
  color: "var(--tx)",
};
const sub: CSSProperties = { margin: 0, fontSize: 14, color: "var(--t2)" };
const rowCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
};
const followChip: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--warn)",
  border: "1px solid var(--warn)",
  borderRadius: 999,
  padding: "2px 8px",
};
