import { type CSSProperties } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Icon } from "@mms/ui";
import { requireStaffPage, roleAtLeast } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { getFloorView } from "@/lib/floor";
import { getExpoQueue } from "@/lib/expo";
import { getDayCashSummary } from "@/lib/register";
import { countPendingApprovals, listPendingApprovals, listRefundsNeeded } from "@/lib/approvals";
import { listApprovers } from "@/lib/voids";
import { getSettledToday } from "@/lib/refunds";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { ExpoBoard } from "@/components/staff/ExpoBoard";
import { RegisterStart } from "@/components/staff/RegisterStart";
import { DayCash } from "@/components/staff/DayCash";
import { ApprovalsBoard } from "@/components/staff/ApprovalsBoard";
import { RefundsNeededStrip } from "@/components/staff/RefundsNeededStrip";
import { SettledToday } from "@/components/staff/SettledToday";
import { LiveConnectionProvider } from "@/components/staff/LiveConnection";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { Chrome } from "@/components/staff/Chrome";
import { StaffDoors, MoreGrid, type MoreTile } from "@/components/staff/StaffDoors";
import { StaffBar } from "@/components/staff/StaffBar";
import { HelpButton } from "@/components/staff/HelpButton";
import { readStaffLang } from "@/lib/staff-lang-server";
import { readStaffDoor } from "@/lib/staff-door-server";
import { isColdStart, resolveStaffHome } from "@/lib/staff-door";
import { localizeCount } from "@/lib/i18n/fill";

export const dynamic = "force-dynamic";

type StaffHomeProps = { searchParams: Promise<{ doors?: string; floor?: string }> };

/**
 * The one decision, read once per request (Next memoizes `cookies()`/`headers()`/`searchParams`
 * across the page and its metadata): which of the three things `/staff` is right now.
 */
async function staffHomeFor(searchParams: StaffHomeProps["searchParams"]) {
  const [door, sp, hdrs] = await Promise.all([readStaffDoor(), searchParams, headers()]);
  const home = resolveStaffHome({
    door,
    doorsParam: sp.doors === "1",
    floorParam: sp.floor === "1",
    coldStart: isColdStart(hdrs.get("referer"), hdrs.get("x-forwarded-host") ?? hdrs.get("host")),
  });
  return { door, home };
}

/** The tab reads what the page shows: the doors are "Screens", the counter home is "Floor". */
export async function generateMetadata({ searchParams }: StaffHomeProps): Promise<Metadata> {
  const { home } = await staffHomeFor(searchParams);
  const what = "redirect" in home || home.view === "floor" ? "Floor" : "Screens";
  return { title: `${what} — Mandalay Morning Star` };
}

/**
 * Staff console home (S1.1a shell · S1.2 floor · P7 doors · A4·2 the counter's ONE screen). Gated
 * by requireStaffPage (verified staff row → console lock).
 *
 * P7 — `/staff` is THREE things, decided by `resolveStaffHome` from this device's remembered door:
 *
 *   doors  — no door yet, or `?doors=1` (the Screens chip), or an in-app arrival on a kitchen
 *            device: two big tiles, Kitchen and Counter, and the manager pages beneath as More.
 *   floor  — a counter device: the counter's one screen (A4·2 · A4·3), in the order the counter
 *            person works it — START an order (walk-up · phone · a table), the TABLES and the
 *            counter orders being built in one list, the TO-GO BAGS lane, then the manager rails
 *            (manager+): REFUNDS NEEDED · APPROVALS · TODAY'S TAKINGS · SETTLED TODAY (the refund
 *            console reading the receipt) — then More. `/staff/register`, `/staff/expo`,
 *            `/staff/approvals` and `/staff/orders` redirect here: each is a zone of this screen.
 *   redirect → /staff/kitchen — a kitchen device on a COLD start (the app icon, a bookmark): Mom's
 *            tablet opens on her board with nothing to tap. Never on an in-app tap, so a tablet can
 *            always reach the doors (`isColdStart` reads the referer).
 *
 * The staff bar (P7·1b) is the header in every branch — the switch and Lock ride in it, Sign out
 * lives on the profile page — and `check-staff-lang.mjs` rule 4 reaches the switch through the bar.
 * The two live boards keep their own subscriptions and 5s backstops for this slice (two pollers on
 * one screen is measured, not assumed, before a unified poll is built — `docs/A4_PLAN.md`).
 */
export default async function StaffHome({ searchParams }: StaffHomeProps) {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate renders the outage shell in place (URL kept) — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.floor" />;
  const isManager = roleAtLeast(caller.role, "manager");
  const [lang, { door, home }] = await Promise.all([readStaffLang(), staffHomeFor(searchParams)]);
  if ("redirect" in home) redirect(home.redirect);

  const [hasPin, pendingApprovals] = await Promise.all([
    staffHasPin(caller.staffId),
    isManager ? countPendingApprovals() : Promise.resolve(0),
  ]);

  // The More grid — every page that is not a door, role-gated exactly as the old pill row was.
  // Two of these were reachable from nowhere in-app before P7: the TV board (bookmark only) and the
  // word-check sheet (only from the manager-only pilot sheet, so Mom could never print her own).
  // The kitchen board is here as a PLAIN link for everyone (blind pass CRITICAL 3): the only other
  // way to the board was the Kitchen DOOR — which remembers itself, so a manager peeking at the
  // board re-doored the counter tablet as a kitchen one. A tile is a look; a door is a decision.
  // A4·2: no Register and no Expo tile — both are zones of the floor view now. A4·3: the two
  // manager tiles point at their ZONES on the floor (the doors' More still needs a way there);
  // the floor branch drops both, because that screen carries them.
  const more: MoreTile[] = [
    { href: "/staff/kitchen", k: "floor.nav.kitchen", icon: "flame" },
    { href: "/board", k: "floor.nav.board", icon: "tv" },
    ...(isManager
      ? ([
          {
            href: APPROVALS_ZONE,
            k: pendingApprovals > 0 ? "floor.nav.approvalsCount" : "floor.nav.approvals",
            icon: "check",
          },
          { href: "/staff/feedback", k: "floor.nav.feedback", icon: "star" },
          { href: SETTLED_ZONE, k: "floor.nav.settled", icon: "receipt" },
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
    // A6 — MANAGER, matching the screen's own floor. Left at `owner`, the whole feature was
    // reachable only by typing the URL: the page, `listStaff` and all three actions admit a
    // manager, and the one link to them did not. Found by a blind audit of this diff.
    ...(roleAtLeast(caller.role, "manager")
      ? ([{ href: "/staff/team", k: "floor.nav.team", icon: "people" }] as MoreTile[])
      : []),
  ];
  // `floor.nav.approvalsCount` carries an `{n}` slot; MoreGrid renders keys without vars, so the
  // count rides a dedicated tile label built here. Kept as one key so the zero case has no "(0)".
  const approvalsVars = pendingApprovals > 0 ? { n: pendingApprovals } : undefined;

  // A4·2 — the approvals count rides the counter's BAR (a manager's, in the trailing slot before
  // Help): the row of tiles it used to sit in is gone, and a manager on this screen should see a
  // pending void or refund without scrolling to More. The circle is icon-only to the eye, the count
  // a small badge (Burmese numerals under my — it is a COUNT), and NAMED by the same dictionary key
  // the More tile uses, so the two never say different things. A4·3: it scrolls to the zone — a
  // NATIVE anchor, not <Link>: a same-page fragment through the router changes the URL without a
  // `hashchange`, and the zone's heading takes focus on that event (Codex round 1 on #283, P2 —
  // the router scrolled and left focus on this circle).
  const approvalsChip = isManager ? (
    <a href="#appr-h" className="staff-circ staff-press staff-circ-count-host">
      <Icon name="check" size={20} />
      {pendingApprovals > 0 && (
        <span className="staff-circ-count" aria-hidden>
          {localizeCount(pendingApprovals, lang)}
        </span>
      )}
      <span className="sr-only">
        <Chrome
          lang={lang}
          k={pendingApprovals > 0 ? "floor.nav.approvalsCount" : "floor.nav.approvals"}
          vars={approvalsVars}
        />
      </span>
    </a>
  ) : undefined;

  // P7·1b — the bar names the page (Screens over the doors, Floor over the floor) and carries the
  // Screens circle only where it leads somewhere else. The greeting is a line beneath it — the
  // person's name is a `{x}`, rendered verbatim in whatever script it arrives in and marked
  // `lang="en"` by <Chrome> when it is Latin. Sign out is on the profile page, not in any bar.
  const header = (
    <StaffBar
      lang={lang}
      title={home.view === "floor" ? "floor.eyebrow" : "shell.screens"}
      leading={home.view === "floor" ? { kind: "screens" } : { kind: "here" }}
      after={<RoleBadge role={caller.role} />}
      trailing={home.view === "floor" ? approvalsChip : undefined}
      // P7·3 — the Help door rides the counter's bar, not the doors': the doors explain themselves
      // (two named tiles), and a help circle beside a static mark would be a control that leads
      // somewhere from a screen that has nothing to explain.
      help={home.view === "floor" ? <HelpButton lang={lang} screen="counter" /> : undefined}
      lock={hasPin}
    />
  );
  const greeting = (
    <p className="staff-greeting">
      <Chrome lang={lang} k="floor.hi" vars={{ x: caller.displayName }} echo="inline" />
    </p>
  );

  if (home.view === "doors") {
    return (
      <main className="staff-main">
        {header}
        <div className="staff-col" style={wrapWide}>
          {greeting}
          <StaffDoors
            lang={lang}
            current={door}
            more={withApprovals(
              more.filter((t) => t.href !== "/staff/kitchen"), // the Kitchen DOOR is above it
              approvalsVars,
            )}
          />
        </div>
      </main>
    );
  }

  // The counter's one screen. The reads are only made on this branch: the doors need none of them,
  // and an outage must not hide the doors from a tablet that has not chosen one yet. Three
  // postures, each the one its zone takes on the client too: the FLOOR unreadable is the outage
  // shell (it is the screen); the LANE unreadable alone starts the lane frozen beside a live floor
  // (`initialOutage` — never an all-clear, never the whole screen gone over one lane); the
  // TAKINGS unreadable is one honest line in the manager's zone (`DayCash`). The manager rails
  // (A4·3) read the same way — each zone fails alone and says so: the approvals queue starts
  // frozen, the roster loads on its poll, the refunds ledger and the settled list each print one
  // honest line. `allSettled`, because `listPendingApprovals`/`listApprovers`/`listRefundsNeeded`
  // THROW on an unreadable table (a false "all clear" is worse), and one thrown read must not take
  // the whole screen down for a server who cannot even see these zones.
  const [floor, expo, day, rails] = await Promise.all([
    getFloorView(),
    getExpoQueue(),
    getDayCashSummary(),
    isManager
      ? Promise.allSettled([
          listPendingApprovals(),
          listApprovers(),
          listRefundsNeeded(),
          getSettledToday(),
        ])
      : Promise.resolve(null),
  ]);
  if (!floor.ok) {
    if (floor.reason === "outage") return <StaffOutageShell what="what.floor" />;
    redirect("/staff/login"); // gate race between requireStaffPage and the read
  }
  if (!expo.ok && expo.reason !== "outage")
    redirect(expo.reason === "locked" ? "/staff/lock" : "/staff/login");
  const lane = expo.ok ? expo.queue : { tickets: [], serverNow: new Date().toISOString() };

  return (
    <main className="staff-main">
      {/* A4·2 — the two live boards report their feed to the bar's help door through this
          provider, so a "Something's wrong" filed from a frozen lane still says `not_updating`. */}
      <LiveConnectionProvider>
        {header}
        <div className="staff-col" style={wrapWide}>
          {greeting}
          {/* 1 · START — the one action taken most, first. The zone's region is `RegisterStart`'s own,
            named by this heading. */}
          <div className="staff-zone">
            <h2 id="start-h" className="staff-zone-head">
              <Chrome lang={lang} k="floor.zone.start" />
            </h2>
            <p style={sub}>
              <Chrome lang={lang} k="reg.sub" echo="stack" />
            </p>
            <RegisterStart labelledBy="start-h" />
          </div>

          {/* 2 · TABLES & COUNTER ORDERS — one list, keyed by session; the board owns its heading. */}
          <FloorBoard initial={floor.snapshot} />

          {/* 3 · TO-GO BAGS — post-settlement work, its own list; the lane owns its heading. */}
          <ExpoBoard initial={lane} initialOutage={!expo.ok} />

          {/* 4 · THE MANAGER RAILS (A4·3) — money taken with no order behind it, then the open
              void/comp requests. Each read fails alone: a rejected queue starts the zone frozen
              (never all-clear), a rejected roster loads on the poll, a rejected ledger says so. */}
          {rails && (
            <>
              <RefundsNeededStrip lang={lang} refunds={settledValue(rails[2], null)} />
              <ApprovalsBoard
                initial={settledValue(rails[0], [])}
                approvers={settledValue(rails[1], null)}
                initialOutage={rails[0].status === "rejected"}
              />
            </>
          )}

          {/* 5 · TODAY'S TAKINGS — manager+ (the read hides itself otherwise). */}
          <DayCash lang={lang} day={day} />

          {/* 6 · SETTLED TODAY — the refund console reading the receipt (M204); manager+. */}
          {rails && (
            <SettledToday initial={settledValue(rails[3], { ok: false, reason: "outage" })} />
          )}

          <div style={{ marginTop: "var(--s6)" }}>
            {/* The bar carries Approvals for a manager and this screen carries both manager
                zones, so More drops exactly those two tiles. */}
            <MoreGrid
              lang={lang}
              more={withApprovals(
                more.filter((t) => t.href !== APPROVALS_ZONE && t.href !== SETTLED_ZONE),
                approvalsVars,
              )}
            />
          </div>
        </div>
      </LiveConnectionProvider>
    </main>
  );
}

/** The two manager zones, as the doors' More tiles reach them (`?floor=1` wins over a remembered
 *  kitchen door; the fragment lands on the zone's heading). The folded routes redirect here too. */
const APPROVALS_ZONE = "/staff?floor=1#appr-h";
const SETTLED_ZONE = "/staff?floor=1#settled-h";

/** One `allSettled` slot → its value, or the zone's own posture for a rejected read. */
function settledValue<T, F>(r: PromiseSettledResult<T>, fallback: F): T | F {
  return r.status === "fulfilled" ? r.value : fallback;
}

/** Threads the approvals count into the one tile that carries an `{n}` slot. */
function withApprovals(more: MoreTile[], vars: { n: number } | undefined): MoreTile[] {
  return vars ? more.map((t) => (t.k === "floor.nav.approvalsCount" ? { ...t, vars } : t)) : more;
}

const wrapWide: CSSProperties = { maxWidth: 1080 };
const sub: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 };
