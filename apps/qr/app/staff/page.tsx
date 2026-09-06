import { type CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Icon } from "@mms/ui";
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
import { StaffDoors, MoreGrid, type MoreTile } from "@/components/staff/StaffDoors";
import { ScreensLink } from "@/components/staff/ScreensLink";
import { readStaffLang } from "@/lib/staff-lang-server";
import { readStaffDoor } from "@/lib/staff-door-server";
import { isColdStart, resolveStaffHome } from "@/lib/staff-door";
import { sx } from "@/lib/staff-labels";

export const metadata = { title: "Floor — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff console home (S1.1a shell · S1.2 floor · P7 doors). Gated by requireStaffPage (verified
 * staff row → console lock).
 *
 * P7 — `/staff` is THREE things, decided by `resolveStaffHome` from this device's remembered door:
 *
 *   doors  — no door yet, or `?doors=1` (the Screens chip), or an in-app arrival on a kitchen
 *            device: two big tiles, Kitchen and Counter, and the manager pages beneath as More.
 *   floor  — a counter device: the register-first row, then the live floor, then More.
 *   redirect → /staff/kitchen — a kitchen device on a COLD start (the app icon, a bookmark): Mom's
 *            tablet opens on her board with nothing to tap. Never on an in-app tap, so a tablet can
 *            always reach the doors (`isColdStart` reads the referer).
 *
 * The greeting, the switch, Lock and Sign out are the same header in every branch, mounted HERE
 * rather than by the layout (`check-staff-lang.mjs` rule 4 holds this page to the mount).
 */
export default async function StaffHome({
  searchParams,
}: {
  searchParams: Promise<{ doors?: string }>;
}) {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate renders the outage shell in place (URL kept) — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.floor" />;
  const isManager = roleAtLeast(caller.role, "manager");
  // Next request-memoizes `cookies()` and `headers()`, so these cost one read each.
  const [lang, door, sp, hdrs] = await Promise.all([
    readStaffLang(),
    readStaffDoor(),
    searchParams,
    headers(),
  ]);
  const home = resolveStaffHome({
    door,
    doorsParam: sp.doors === "1",
    coldStart: isColdStart(hdrs.get("referer"), hdrs.get("x-forwarded-host") ?? hdrs.get("host")),
  });
  if ("redirect" in home) redirect(home.redirect);

  const [hasPin, pendingApprovals] = await Promise.all([
    staffHasPin(caller.staffId),
    isManager ? countPendingApprovals() : Promise.resolve(0),
  ]);

  // The More grid — every page that is not a door, role-gated exactly as the old pill row was.
  // Two of these were reachable from nowhere in-app before P7: the TV board (bookmark only) and the
  // word-check sheet (only from the manager-only pilot sheet, so Mom could never print her own).
  const more: MoreTile[] = [
    { href: "/staff/expo", k: "floor.nav.expo", icon: "bag" },
    { href: "/board", k: "floor.nav.board", icon: "tv" },
    ...(isManager
      ? ([
          {
            href: "/staff/approvals",
            k: pendingApprovals > 0 ? "floor.nav.approvalsCount" : "floor.nav.approvals",
            icon: "check",
          },
          { href: "/staff/feedback", k: "floor.nav.feedback", icon: "star" },
          { href: "/staff/orders", k: "floor.nav.orders", icon: "receipt" },
        ] as MoreTile[])
      : []),
    { href: "/staff/glossary", k: "floor.nav.glossary", icon: "print" },
    {
      href: "/staff/menu",
      k: isManager ? "floor.nav.menuPrices" : "floor.nav.menuAvailability",
      icon: "cat-dish",
    },
    { href: "/staff/tips", k: "floor.nav.tips", icon: "gift" },
    { href: "/staff/profile", k: hasPin ? "floor.nav.pin" : "floor.nav.pinSet", icon: "lock" },
    ...(caller.role === "owner"
      ? ([{ href: "/staff/team", k: "floor.nav.team", icon: "people" }] as MoreTile[])
      : []),
  ];
  // `floor.nav.approvalsCount` carries an `{n}` slot; MoreGrid renders keys without vars, so the
  // count rides a dedicated tile label built here. Kept as one key so the zero case has no "(0)".
  const approvalsVars = pendingApprovals > 0 ? { n: pendingApprovals } : undefined;

  const header = (
    <header style={headerStyle}>
      <div>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
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
        {home.view === "floor" && <ScreensLink lang={lang} />}
        <StaffLangSwitch lang={lang} />
        {hasPin && <LockButton />}
        <StaffSignOut />
      </div>
    </header>
  );

  if (home.view === "doors") {
    return (
      <main style={wrapWide}>
        {header}
        <StaffDoors lang={lang} current={door} more={withApprovals(more, approvalsVars)} />
      </main>
    );
  }

  // The counter's floor. The read is only made on this branch: the doors need no floor, and a
  // floor outage must not hide the doors from a tablet that has not chosen one yet.
  const floor = await getFloorView();
  if (!floor.ok) {
    if (floor.reason === "outage") return <StaffOutageShell what="what.floor" />;
    redirect("/staff/login"); // gate race between requireStaffPage and the read
  }

  return (
    <main style={wrapWide}>
      {header}
      {/* Register first — the one action Dad takes most, gold-capped; Approvals and Expo beside it.
          The remaining pages sit under More below the floor, so nothing the old pill row reached is
          further than one screen away. */}
      <nav className="staff-counter-row" aria-label={sx(lang, "floor.a11y.tools")}>
        <Link href="/staff/register" className="staff-counter-primary">
          <span className="staff-door-icon" aria-hidden>
            <Icon name="cash" size={36} />
          </span>
          <span className="staff-door-name">
            <Chrome lang={lang} k="floor.nav.register" echo="stack" />
            <span className="staff-door-sub">
              <Chrome lang={lang} k="floor.door.counter.sub" echo="stack" />
            </span>
          </span>
        </Link>
        {isManager ? (
          <Link href="/staff/approvals" className="staff-counter-side">
            <span className="staff-tile-icon" aria-hidden>
              <Icon name="check" size={30} />
            </span>
            <span className="staff-tile-name">
              {pendingApprovals > 0 ? (
                <Chrome lang={lang} k="floor.nav.approvalsCount" vars={{ n: pendingApprovals }} />
              ) : (
                <Chrome lang={lang} k="floor.nav.approvals" />
              )}
            </span>
          </Link>
        ) : (
          <Link href="/staff/kitchen" className="staff-counter-side">
            <span className="staff-tile-icon" aria-hidden>
              <Icon name="flame" size={30} />
            </span>
            <span className="staff-tile-name">
              <Chrome lang={lang} k="floor.nav.kitchen" />
            </span>
          </Link>
        )}
        <Link href="/staff/expo" className="staff-counter-side">
          <span className="staff-tile-icon" aria-hidden>
            <Icon name="bag" size={30} />
          </span>
          <span className="staff-tile-name">
            <Chrome lang={lang} k="floor.nav.expo" />
          </span>
        </Link>
      </nav>

      <FloorBoard initial={floor.snapshot} />

      <div style={{ marginTop: "var(--s6)" }}>
        <MoreGrid
          lang={lang}
          more={withApprovals(
            more.filter((t) => t.href !== "/staff/expo" && t.href !== "/staff/approvals"),
            approvalsVars,
          )}
        />
      </div>
    </main>
  );
}

/** Threads the approvals count into the one tile that carries an `{n}` slot. */
function withApprovals(more: MoreTile[], vars: { n: number } | undefined): MoreTile[] {
  return vars ? more.map((t) => (t.k === "floor.nav.approvalsCount" ? { ...t, vars } : t)) : more;
}

const wrapWide: CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "var(--s6)" };
const headerStyle: CSSProperties = {
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
