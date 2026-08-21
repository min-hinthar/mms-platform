"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { getSessionKind } from "@/lib/rewards";
import { publishAuthPlaneStatus } from "@/lib/session-status";

/**
 * Establishes the diner's anonymous-auth session on first load (Supabase Anonymous Auth, decision
 * #2). `signInAnonymously()` mints a real `auth.users` row and persists the session in cookies via
 * `@supabase/ssr`, so Server Actions / route handlers can read + verify `auth.uid()` (see
 * lib/authz.ts) and Realtime can authorize private channels. Idempotent: no-op when an ANONYMOUS
 * session already exists. Renders nothing; mount once in the root layout.
 *
 * EXCEPT on the /staff console (S1.1a): staff are REAL accounts (magic-link / OTP), not anonymous
 * diners. Auto-signing-in anonymously there would mint an anon session that shadows the staff login,
 * so skip the whole surface — /staff establishes its own session via StaffLogin. And on a diner route,
 * a REAL (staff) session must be swapped for an anonymous one (a staff uid is is_staff() → it would
 * read every table and attribute diner writes to the staff user).
 */
/**
 * Device surfaces that ACCEPT a staff session but may also run on a device token alone. A staff
 * session here is kept; the anonymous mint still happens when there is no session at all.
 *
 * ⚠️ ACCEPTED RISK, decided by the owner (2026-08-21), not an oversight. Supabase auth is
 * ORIGIN-wide, so the staff session kept here is the same session `/staff` accepts: anyone who
 * walks up to the lobby kiosk and types `/staff` into that browser reaches the floor console as
 * whoever last signed the device in. Asked whether the device surfaces should carry a narrower
 * credential, the owner chose "staff login, no extra restriction" — the point of this slice is
 * testing every flow against production with Stripe test cards, and a second gate on the device is
 * friction against exactly that.
 *
 * What it would take to close, if that trade stops being worth it: the console lock already
 * EXISTS and is already enforced on every staff page (`isConsoleLocked()` → `/staff/lock`, a pure
 * cookie read in `requireStaffPage`). Engaging it when a sign-in lands on a device surface is the
 * whole fix — no new credential type, no new gate. Tracked as M111 in `docs/OPEN-ITEMS.md`
 * (Codex round 2, P1 — reported correctly, deliberately not taken).
 */
const DEVICE_SURFACES = ["/kiosk", "/board"] as const;

export function AnonAuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  // In-flight guard: the effect re-runs on every pathname change, but the session is global (cookies)
  // and route-independent — so a swap/sign-in already running must not be started a second time (a
  // concurrent swap would see the not-yet-cleared staff session and mint a redundant orphan anon user).
  const running = useRef(false);

  useEffect(() => {
    // `/staff` is exempt OUTRIGHT — it needs no anonymous session and never did.
    //
    // `/kiosk` and `/board` are different, and getting this wrong broke the kiosk once already
    // (Codex round 1, P1): they now accept a staff sign-in, so a staff session there must NOT be
    // swapped away — but a TOKEN-only kiosk still needs the anonymous user that `openKioskOrder`
    // requires (it reads `getUser()` and refuses with `no_auth` without one). So they are not
    // skipped; they are marked `keepStaff`, which suppresses only the sign-OUT swap below and
    // leaves the anonymous mint exactly as it was.
    if (pathname?.startsWith("/staff") || running.current) return;
    const keepStaff = DEVICE_SURFACES.some((p) => pathname === p || pathname?.startsWith(`${p}/`));
    running.current = true;
    const supa = browserClient();
    void (async () => {
      try {
        const { data } = await supa.auth.getSession();
        const user = data.session?.user;
        // An anonymous diner is the steady state — keep it.
        if (user && user.is_anonymous !== false) {
          publishAuthPlaneStatus("ok");
          return;
        }
        // A non-anonymous session on a diner route is EITHER an upgraded diner (M4 — same uid that earned
        // the rewards; signing it out would orphan the account) OR staff who navigated here. Distinguish
        // SERVER-SIDE (getSessionKind → getStaffAuth) — never a client-writable marker a staff user could
        // forge to dodge the swap. Keep a diner; swap only confirmed staff. On any resolver error, KEEP
        // (don't risk orphaning a real account — a staff uid left on a diner route is still server-side
        // authz-safe: it's not a session member, so diner mutations fail regardless).
        if (user) {
          let kind: "anon" | "diner" | "staff" = "diner";
          try {
            kind = await getSessionKind();
          } catch {
            return; // resolver unavailable → keep the session rather than orphan it
          }
          if (kind !== "staff") {
            publishAuthPlaneStatus("ok");
            return; // upgraded diner (or anon) → keep
          }
          // Staff on a DINER route → swap to an anonymous diner session. On a device surface the
          // staff session is the credential, so it is kept and we return before the mint below.
          if (keepStaff) {
            publishAuthPlaneStatus("ok");
            return;
          }
          await supa.auth.signOut();
        }
        // Establish the anonymous session, with one retry — signInAnonymously can transiently fail
        // (network, or GoTrue's anon-signup rate limit, see app/api/session). Don't strand the diner
        // with NO session after a signOut: retry once, and the downstream session UI surfaces a manual
        // retry; the next route change also re-runs this guard (running resets in finally).
        let { error } = await supa.auth.signInAnonymously();
        if (error) ({ error } = await supa.auth.signInAnonymously());
        if (error) {
          // W10a — publish the failure instead of dying in the console: pre-session surfaces key
          // their honest "we can't start your session" strip (with retry) off this, ending the
          // eternal-skeleton limbo the paused-project outage exposed. The next route change (or a
          // surface-level retry that calls router.refresh) re-runs this gate.
          console.error("[AnonAuthGate] anonymous sign-in failed", error.message);
          publishAuthPlaneStatus("failed");
        } else {
          publishAuthPlaneStatus("ok");
          // A session was just MINTED client-side, but the current route's server components already
          // rendered with no session (e.g. a cold deep-link straight to /account → the "couldn't load your
          // rewards" fallback). Re-render them now that auth.uid() resolves, so the diner never lands on the
          // sessionless state and has to refresh by hand. Only fires on a fresh mint (the steady-state keep
          // returns above), so no loop: the next getSession sees the anon session and keeps it.
          router.refresh();
        }
      } finally {
        running.current = false;
      }
    })();
  }, [pathname, router]);
  return null;
}
