import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage, listStaff } from "@/lib/staff";
import { TeamManager } from "@/components/staff/TeamManager";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
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

  const lang = await readStaffLang();

  if (caller.role !== "owner") {
    return (
      <main style={wrap}>
        {/* `justify-content: flex-end` explicitly: `space-between` with a SINGLE child parks it at
            the start, which would put the control where the back link sits on the owner arm. */}
        <div style={{ ...topRow, justifyContent: "flex-end", marginBottom: "var(--s4)" }}>
          <StaffLangSwitch lang={lang} />
        </div>
        <h1 style={{ fontSize: "var(--fs-h2)", margin: "0 0 8px" }}>
          <Chrome lang={lang} k="floor.team.ownersOnly" echo="stack" />
        </h1>
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", marginBottom: "var(--s5)" }}>
          <Chrome lang={lang} k="floor.team.ownersOnly.body" echo="stack" />
        </p>
        <Link href="/staff" style={back}>
          {/* The arrow is part of the label and lives inside the dictionary value. The visible text
              is an adequate accessible name on its own — no aria-label to keep in sync. */}
          <Chrome lang={lang} k="floor.team.backToFloor" />
        </Link>
      </main>
    );
  }

  const staff = await listStaff();
  return (
    <main style={wrap}>
      <div style={{ ...topRow, marginBottom: "var(--s4)" }}>
        <Link href="/staff" style={back}>
          <Chrome lang={lang} k="floor.back" />
        </Link>
        <StaffLangSwitch lang={lang} />
      </div>
      <h1 style={{ fontSize: "var(--fs-h1)", margin: "0 0 4px" }}>
        <Chrome lang={lang} k="floor.team.title" echo="stack" />
      </h1>
      <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 var(--s6)" }}>
        <Chrome lang={lang} k="floor.team.sub" echo="stack" />
      </p>
      <TeamManager initial={staff} selfUid={caller.uid} selfEmail={caller.email} />
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "var(--s6)" };
// The back link and the language control share one row. On the "Owners only" arm the back link sits
// BELOW the copy (it is the only way out and reads as the action), so that row carries the control
// alone and overrides `justify-content` to keep it on the right.
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
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
