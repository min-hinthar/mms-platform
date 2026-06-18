"use client";
import { useEffect } from "react";
import { browserClient } from "@mms/db";

/**
 * Establishes the diner's anonymous-auth session on first load (Supabase Anonymous Auth, decision
 * #2). `signInAnonymously()` mints a real `auth.users` row and persists the session in cookies via
 * `@supabase/ssr`, so Server Actions / route handlers can read + verify `auth.uid()` (see
 * lib/authz.ts) and Realtime can authorize private channels. Idempotent: no-op when a session
 * already exists. Renders nothing; mount once in the root layout.
 */
export function AnonAuthGate() {
  useEffect(() => {
    const supa = browserClient();
    supa.auth.getSession().then(({ data }) => {
      if (!data.session) void supa.auth.signInAnonymously();
    });
  }, []);
  return null;
}
