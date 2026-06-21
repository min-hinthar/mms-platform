import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { isConsoleLocked } from "@/lib/staff-lock";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { StaffSignOut } from "@/components/staff/StaffSignOut";
import { LockButton } from "@/components/staff/LockButton";

export const metadata = { title: "Floor — Mandalay Morning Star" };

/**
 * Staff console home (S1.1a) — the authed shell behind magic-link sign-in. Gates on a VERIFIED staff
 * identity (the staff row, not a client claim): an anon/no session goes to sign-in; a real account
 * that isn't staff goes to sign-in with a clear reason (?denied) so it can recover instead of looping.
 * The live floor view (per-table state) lands in S1.2 — the placeholder here is honest, not a fake.
 */
export default async function StaffHome() {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  const caller = auth.caller;
  const hasPin = await staffHasPin(caller.staffId);

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Floor
          </p>
          <h1 style={h1}>
            Hi, {caller.displayName} <RoleBadge role={caller.role} />
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", flexWrap: "wrap" }}>
          {hasPin && <LockButton />}
          <StaffSignOut />
        </div>
      </header>

      <section className="card" style={placeholder} aria-labelledby="floor-soon">
        <h2 id="floor-soon" style={{ fontSize: 17, margin: "0 0 6px" }}>
          The live floor view is next
        </h2>
        <p style={{ color: "var(--t2)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Every table’s live cart, party, and last activity will land here (S1.2) — so you can find
          a table, see what they’ve ordered, and settle it (cash included).
        </p>
      </section>

      <nav
        aria-label="Staff tools"
        style={{ marginTop: "var(--s4)", display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}
      >
        <Link href="/staff/profile" style={ownerLink}>
          {hasPin ? "Your PIN →" : "Set a tablet PIN →"}
        </Link>
        {caller.role === "owner" && (
          <Link href="/staff/team" style={ownerLink}>
            Manage staff →
          </Link>
        )}
      </nav>
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "var(--s6)" };
const header: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s6)",
};
const h1: CSSProperties = {
  fontSize: 24,
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const placeholder: CSSProperties = { padding: "var(--s6)" };
const ownerLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--ac)",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};
