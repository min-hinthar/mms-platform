"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { isRetryableAuthShape } from "@/lib/staff-outage";

/**
 * Sign the staff member out (S1.1a) — clears the @supabase/ssr cookie session, then sends them back
 * to the login. Diners never sign out (anonymous, persistent); this exists only for the staff
 * console, where a real account ends its shift on a shared device. W10b: a FAILED sign-out (auth
 * plane unreachable) must not silently route to the login wearing a still-live session — say what
 * happened and stay put. The failure rides the sibling `role="alert"` idiom LockButton established
 * (a discrete action's own failure, distinct from the board's polling `role="status"` region).
 */
export function StaffSignOut() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function signOut() {
    setMsg(null);
    const { error } = await browserClient().auth.signOut();
    if (error) {
      setMsg(
        isRetryableAuthShape(error)
          ? "We can’t reach the sign-in service — you’re still signed in. Try again in a moment."
          : "Couldn’t sign out just now — try again.",
      );
      return;
    }
    router.replace("/staff/login");
    router.refresh();
  }
  return (
    <>
      <button type="button" onClick={signOut} style={btn}>
        Sign out
      </button>
      {msg && (
        <span role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
          {msg}
        </span>
      )}
    </>
  );
}

const btn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
