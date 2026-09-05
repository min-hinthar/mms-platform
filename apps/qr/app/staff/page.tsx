import { type CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage, roleAtLeast } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { getFloorView } from "@/lib/floor";
import { countPendingApprovals } from "@/lib/approvals";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { StaffSignOut } from "@/components/staff/StaffSignOut";
import { LockButton } from "@/components/staff/LockButton";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { Chrome } from "@/components/staff/Chrome";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { sx } from "@/lib/staff-labels";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Floor — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff console home + live floor (S1.1a shell · S1.2 floor). Gated by requireStaffPage (verified
 * staff row → console lock). The floor itself is the server-rendered initial snapshot, kept live
 * client-side.
 *
 * P2 — the console home speaks the device language: the kicker, the greeting and all ten tool pills
 * come from the dictionary, and the switch is mounted HERE in the page's own header rather than by
 * the layout (`check-staff-lang.mjs` rule 4 deliberately refuses `StaffOutageShell` as evidence —
 * the shell only exists while the ordering system is unreachable, and the question the rule asks is
 * whether a person can change the language on the page they are actually looking at).
 */
export default async function StaffHome() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate renders the outage shell in place (URL kept) — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.floor" />;
  const isManager = roleAtLeast(caller.role, "manager");
  // Next request-memoizes `cookies()`, so this costs one read even though the layout read it too.
  const lang = await readStaffLang();
  const [hasPin, floor, pendingApprovals] = await Promise.all([
    staffHasPin(caller.staffId),
    getFloorView(),
    isManager ? countPendingApprovals() : Promise.resolve(0),
  ]);
  if (!floor.ok) {
    if (floor.reason === "outage") return <StaffOutageShell what="what.floor" />;
    redirect("/staff/login"); // gate race between requireStaffPage and the read
  }

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            {/* `inline` rather than `stack`: a kicker one line above the h1, where a stacked pair
                would read as two headings. */}
            <Chrome lang={lang} k="floor.eyebrow" echo="inline" />
          </p>
          <h1 style={h1}>
            {/* The name is a `{x}` — rendered verbatim in whatever script it arrives in, and marked
                `lang="en"` by <Chrome> when it is Latin, so it keeps the body face inside a Burmese
                run. Nothing on this page is `aria-labelledby` this heading, so the echo is safe. */}
            <Chrome lang={lang} k="floor.hi" vars={{ x: caller.displayName }} echo="stack" />{" "}
            <RoleBadge role={caller.role} />
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", flexWrap: "wrap" }}>
          <StaffLangSwitch lang={lang} />
          {hasPin && <LockButton />}
          <StaffSignOut />
        </div>
      </header>

      <FloorBoard initial={floor.snapshot} />

      <nav
        aria-label={sx(lang, "floor.a11y.tools")}
        style={{ marginTop: "var(--s6)", display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}
      >
        {/* Every pill is a 44px chip, so every one takes NO echo — two scripts cannot legibly stack
            in a chip (Chrome.tsx's echo policy, whose default is `echo={false}`; the prop is omitted
            here as it is at the other ~118 call sites, so this reads as "the default", not as an
            explicit choice). The `→` lives inside the dictionary value, the way `floor.back` carries
            its `←`: it is part of the label, not a glyph beside it. */}
        <Link href="/staff/register" style={ownerLink}>
          <Chrome lang={lang} k="floor.nav.register" />
        </Link>
        <Link href="/staff/kitchen" style={ownerLink}>
          <Chrome lang={lang} k="floor.nav.kitchen" />
        </Link>
        <Link href="/staff/expo" style={ownerLink}>
          <Chrome lang={lang} k="floor.nav.expo" />
        </Link>
        {isManager && (
          <Link href="/staff/approvals" style={ownerLink}>
            {/* A COUNT, so it rides an `{n}` slot and becomes Burmese numerals at render — never a
                number concatenated onto a label. Two keys rather than one with an empty slot: the
                zero case has no parentheses at all in either tongue. */}
            {pendingApprovals > 0 ? (
              <Chrome lang={lang} k="floor.nav.approvalsCount" vars={{ n: pendingApprovals }} />
            ) : (
              <Chrome lang={lang} k="floor.nav.approvals" />
            )}
          </Link>
        )}
        {isManager && (
          <Link href="/staff/feedback" style={ownerLink}>
            <Chrome lang={lang} k="floor.nav.feedback" />
          </Link>
        )}
        {isManager && (
          <Link href="/staff/orders" style={ownerLink}>
            <Chrome lang={lang} k="floor.nav.orders" />
          </Link>
        )}
        {/* W23a (Codex P2) — everyone sees this: the page renders the 86 control for every staff
            member and the price editor only for managers, so the link is safe to show to all. A
            server who runs out at the counter needs a menu-wide surface, not just whatever dish
            happens to be on a KDS ticket. */}
        <Link href="/staff/menu" style={ownerLink}>
          <Chrome
            lang={lang}
            k={isManager ? "floor.nav.menuPrices" : "floor.nav.menuAvailability"}
          />
        </Link>
        {/* W17c-4 — everyone sees this: a server sees their own line, a manager the whole team's.
            The role rule lives in getDayTips, so the link is safe to show to all staff. */}
        <Link href="/staff/tips" style={ownerLink}>
          <Chrome lang={lang} k="floor.nav.tips" />
        </Link>
        <Link href="/staff/profile" style={ownerLink}>
          <Chrome lang={lang} k={hasPin ? "floor.nav.pin" : "floor.nav.pinSet"} />
        </Link>
        {caller.role === "owner" && (
          <Link href="/staff/team" style={ownerLink}>
            <Chrome lang={lang} k="floor.nav.team" />
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
  fontSize: "var(--fs-h1)",
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const ownerLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  textDecoration: "none",
};
