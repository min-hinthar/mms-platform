"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { browserClient } from "@mms/db";

/**
 * Establishes the diner's anonymous-auth session on first load (Supabase Anonymous Auth, decision
 * #2). `signInAnonymously()` mints a real `auth.users` row and persists the session in cookies via
 * `@supabase/ssr`, so Server Actions / route handlers can read + verify `auth.uid()` (see
 * lib/authz.ts) and Realtime can authorize private channels. Idempotent: no-op when a session
 * already exists. Renders nothing; mount once in the root layout.
 *
 * EXCEPT on the /staff console (S1.1a): staff are REAL accounts (magic-link / OTP), not anonymous
 * diners. Auto-signing-in anonymously there would mint an anon session that shadows the staff login,
 * so skip the whole surface — /staff establishes its own session via StaffLogin.
 */
export function AnonAuthGate() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname?.startsWith("/staff")) return;
    const supa = browserClient();
    void supa.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) {
        await supa.auth.signInAnonymously();
        return;
      }
      // A real (staff) account must NEVER back the diner surface: its uid is is_staff() → it would
      // read every table session, and any diner cart write keyed to auth.uid() would be attributed to
      // the staff user instead of an anonymous seat. On a shared browser profile (staff signs in, then
      // opens a diner route) swap the staff session for a fresh anonymous one so the two stay isolated.
      if (user.is_anonymous === false) {
        await supa.auth.signOut();
        await supa.auth.signInAnonymously();
      }
    });
  }, [pathname]);
  return null;
}
