import { redirect } from "next/navigation";
import { getStaffAuth, roleAtLeast, listStaff, type StaffRow } from "@/lib/staff";
import { DEFAULT_NEXT, safeNext } from "@/lib/safe-next";
import { isConsoleLocked } from "@/lib/staff-lock";
import { staffHasPin } from "@/lib/staff-pin";
import { resolveSignInState } from "@/lib/sign-in-state";
import { StaffLogin } from "@/components/staff/StaffLogin";
import { SignedInCard } from "@/components/staff/SignedInCard";
import { TeamManager } from "@/components/staff/TeamManager";
import { ViewStatusProvider } from "@/components/staff/ViewStatus";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Staff sign-in — Mandalay Morning Star" };

// The login surface establishes its OWN session (magic-link / OTP), so it must not be statically
// prerendered with a baked nonce — the root layout already forces dynamic; keep parity here.
export const dynamic = "force-dynamic";

/**
 * A4·4 — the Sign-in screen: ONE route with states. `resolveSignInState` (pure, value-tested)
 * picks the state; this page renders it:
 *
 *   · **form** — `StaffLogin` (email · code · Google), the bar wearing a static people mark: there
 *     is nothing behind the door before a sign-in (P7·2);
 *   · **redirect** — a signed-in staff member with an explicit `?next=` lands where the sign-in
 *     was for (a bookmarked `/staff/login?next=/kiosk` on the lobby iPad stays idempotent); a
 *     locked tablet with no destination goes to `/staff/lock`, like every other console page;
 *   · **me** — who you are · your PIN · sign out (the old `/staff/profile`, `SignedInCard`), the
 *     bar now the console's (the Screens circle, the person's name, their role, Lock when they have
 *     a PIN), and for a manager the roster beneath it as a zone (`TeamManager`, `#team-h` — the
 *     old `/staff/team`, whose redirect lands on that fragment);
 *   · **outage** — the shell, keeping the URL (W10b: unknowable ≠ signed out; the old login
 *     rendered the FORM here, which on this folded screen would tell a staff member who tapped
 *     "Your PIN" that they had been logged out).
 *
 * `/staff/lock` stays its own route: the lock is a device cookie every console page redirects to,
 * and its card is already this screen's vocabulary (`.entry-*`, the same bar shape).
 *
 * P2 — the language control belongs HERE above all other staff surfaces: this is the first screen
 * the kitchen tablet shows, before anyone is signed in. It is also why `setStaffLang` is ungated —
 * a `staffGate` on the writer would make this control inert on exactly this page.
 */
export default async function StaffLoginPage({
  searchParams,
}: {
  // `next` is typed as it ACTUALLY arrives, not as it is usually written: Next hands a REPEATED
  // query parameter (`?next=/board&next=/kiosk`) through as a `string[]`. The narrow `string` type
  // was a claim about the URL that a caller controls, and `safeNext` now rejects the array itself —
  // this signature just stops the lie (Codex round 2, P2).
  searchParams: Promise<{ denied?: string; next?: string | string[] }>;
}) {
  const auth = await getStaffAuth();
  const params = await searchParams;
  // VALIDATED here, once, before it can reach a redirect or the magic link (`?next=` arrives from a
  // URL and later rides into a mailbox — `safeNext` rejects off-origin and non-sign-in destinations).
  // `null` when the URL carried no `next` at all: ABSENT is the signed-in state's cue, a present
  // value (even one that fell back to `/staff`) is a destination.
  const next = params.next === undefined ? null : safeNext(params.next);
  // The lock check is a pure cookie read — it cannot fail during an outage, and the resolver reads
  // it only for a verified staff member with no destination.
  const state = resolveSignInState(auth, {
    locked: await isConsoleLocked(),
    next,
    denied: params.denied === "1",
  });

  if (state.kind === "redirect") redirect(state.to);
  // W10b: keeps the URL and renders the shell — never a login redirect, never the form.
  // `what.console`, not "your profile": this arm is reached from every visit — a lobby iPad on its
  // way to `?next=/kiosk` included — so the noun must be true for all of them (blind pass).
  if (state.kind === "outage") return <StaffOutageShell what="what.console" />;

  // Next request-memoizes `cookies()`, so this costs one read even though the layout read it too.
  const lang = await readStaffLang();

  if (state.kind === "form") {
    // P7·2 — the same bar as every other page (a static mark, the title, the switch; no Lock and no
    // Screens circle, because there is nothing behind either door before a sign-in), and the form
    // beneath it speaks the device language too. `next` for the form is the VALIDATED destination
    // with the absent case at its default, exactly as before.
    return (
      <main className="staff-main">
        <StaffBar
          lang={lang}
          title="entry.login.title"
          leading={{ kind: "here", icon: "people" }}
        />
        <div className="staff-col entry-col">
          <StaffLogin lang={lang} denied={state.denied} next={next ?? DEFAULT_NEXT} />
        </div>
      </main>
    );
  }

  // The signed-in state — the resolver's `me` arm carries the verified caller.
  const caller = state.caller;
  const hasPin = await staffHasPin(caller.staffId);
  // A6 — MANAGER and above see the roster. A server sees no zone rather than an "only managers"
  // dead end: on this screen there is nothing to explain — the card above is theirs.
  //
  // The read stays ADVISORY on this screen (A4's rule): the old `/staff/team` threw a failed read
  // to the error boundary, which was its whole page; here it would take the person's own PIN and
  // sign-out down with it. `null` reaches the zone, which prints one honest line — never an empty
  // roster (W10b: the owner would read "no staff" as real).
  const manager = roleAtLeast(caller.role, "manager");
  let roster: StaffRow[] | null = null;
  if (manager) {
    try {
      roster = await listStaff();
    } catch (e) {
      console.error("[sign-in] roster read failed", e);
    }
  }

  return (
    <main className="staff-main">
      <StaffBar
        lang={lang}
        titleNode={<span>{caller.displayName}</span>}
        after={<RoleBadge role={caller.role} />}
        lock={hasPin}
      />
      <div className="staff-col entry-col">
        {/* ONE polite live region for the view (QA §A): the card and the roster each used to carry
            their own, and two regions flip together. The provider owns the region at the end of the
            column; both cards speak through it and show their line as an aria-hidden echo. */}
        <ViewStatusProvider>
          <SignedInCard
            lang={lang}
            hasPin={hasPin}
            displayName={caller.displayName}
            email={caller.email}
          />
          {manager && (
            // A6 — `callerRole` drives the ceiling in the UI: the role <select>s offer only what
            // this caller may actually grant, and a row they cannot reach loses its controls. The
            // server refuses either way (`canActOn` in every action); this is the affordance, so a
            // manager is never shown an option that answers "only the owner can".
            <TeamManager
              initial={roster}
              selfUid={caller.uid}
              selfEmail={caller.email}
              callerRole={caller.role}
            />
          )}
        </ViewStatusProvider>
      </div>
    </main>
  );
}
