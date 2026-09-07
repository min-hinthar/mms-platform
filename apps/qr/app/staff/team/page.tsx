import { type CSSProperties } from "react";
import { requireStaffPage, listStaff } from "@/lib/staff";
import { TeamManager } from "@/components/staff/TeamManager";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { staffHasPin } from "@/lib/staff-pin";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Staff — Mandalay Morning Star" };

/**
 * Team management (S1.1a) — OWNER-only. Provision staff (the email becomes their magic-link login),
 * assign a role, and offboard/reinstate. Gated three ways: requireStaffPage here (default floor — any
 * active staff may LAND here, because a non-owner sees an honest "owners only", not a silent bounce),
 * requireStaff('owner') inside listStaff + every action, and the staff_read_self RLS policy.
 *
 * ⚠️ P2 — THE LANGUAGE CONTROL IS MOUNTED IN BOTH RETURNS, and `lang` is read BEFORE the owner
 * check. Rule 4 in `check-staff-lang.mjs` is a PRESENCE check and would go green on one mount, but
 * the "Owners only" arm is a DEAD END: a server or manager who cannot read English would land on an
 * English sentence with no way to change the console's language and nothing to tap but the back
 * link. The screen that explains why you cannot proceed is exactly the screen that must speak your
 * language.
 */
export default async function TeamPage() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.team" />;
  const hasPin = await staffHasPin(caller.staffId);

  const lang = await readStaffLang();

  if (caller.role !== "owner") {
    return (
      <main className="staff-main">
        {/* The bar's Screens circle is the way back; the old "← Back to the floor" link is gone. */}
        <StaffBar lang={lang} title="floor.team.ownersOnly" lock={hasPin} />
        <div className="staff-col" style={wrap}>
          <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", marginBottom: "var(--s5)" }}>
            <Chrome lang={lang} k="floor.team.ownersOnly.body" echo="stack" />
          </p>
        </div>
      </main>
    );
  }

  const staff = await listStaff();
  return (
    <main className="staff-main">
      <StaffBar lang={lang} title="floor.team.title" lock={hasPin} />
      <div className="staff-col" style={wrap}>
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 var(--s6)" }}>
          <Chrome lang={lang} k="floor.team.sub" echo="stack" />
        </p>
        <TeamManager initial={staff} selfUid={caller.uid} selfEmail={caller.email} />
      </div>
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto" };
// P7·1b — the staff bar is the page's header; the constants below style the content beneath it.
