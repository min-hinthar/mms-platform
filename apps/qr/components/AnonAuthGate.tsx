"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { browserClient } from "@mms/db";
import { getSessionKind } from "@/lib/rewards";

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
export function AnonAuthGate() {
  const pathname = usePathname();
  // In-flight guard: the effect re-runs on every pathname change, but the session is global (cookies)
  // and route-independent — so a swap/sign-in already running must not be started a second time (a
  // concurrent swap would see the not-yet-cleared staff session and mint a redundant orphan anon user).
  const running = useRef(false);

  useEffect(() => {
    if (pathname?.startsWith("/staff") || running.current) return;
    running.current = true;
    const supa = browserClient();
    void (async () => {
      try {
        const { data } = await supa.auth.getSession();
        const user = data.session?.user;
        // An anonymous diner is the steady state — keep it.
        if (user && user.is_anonymous !== false) return;
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
          if (kind !== "staff") return; // upgraded diner (or anon) → keep
          await supa.auth.signOut(); // staff on a diner route → swap to an anonymous diner session
        }
        // Establish the anonymous session, with one retry — signInAnonymously can transiently fail
        // (network, or GoTrue's anon-signup rate limit, see app/api/session). Don't strand the diner
        // with NO session after a signOut: retry once, and the downstream session UI surfaces a manual
        // retry; the next route change also re-runs this guard (running resets in finally).
        let { error } = await supa.auth.signInAnonymously();
        if (error) ({ error } = await supa.auth.signInAnonymously());
        if (error) console.error("[AnonAuthGate] anonymous sign-in failed", error.message);
      } finally {
        running.current = false;
      }
    })();
  }, [pathname]);
  return null;
}
