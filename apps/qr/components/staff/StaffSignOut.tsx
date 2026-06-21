"use client";
import { type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";

/**
 * Sign the staff member out (S1.1a) — clears the @supabase/ssr cookie session, then sends them back
 * to the login. Diners never sign out (anonymous, persistent); this exists only for the staff
 * console, where a real account ends its shift on a shared device.
 */
export function StaffSignOut() {
  const router = useRouter();
  async function signOut() {
    await browserClient().auth.signOut();
    router.replace("/staff/login");
    router.refresh();
  }
  return (
    <button type="button" onClick={signOut} style={btn}>
      Sign out
    </button>
  );
}

const btn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
