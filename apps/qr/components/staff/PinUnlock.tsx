"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { Icon } from "@mms/ui";
import { unlockConsole } from "@/lib/staff-pin-actions";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/limits";

/**
 * Shared-tablet unlock (S1.1b) — the SAME staff member who locked re-enters their PIN to resume. The
 * verify + lockout are entirely server-side (unlockConsole → mms_staff_verify_pin); this surface only
 * shows honest state: remaining attempts on a miss, a live countdown while locked out, and a sign-out
 * escape for a forgotten PIN (the deliberate way back, which ends the session the lock sits on).
 */
export function PinUnlock({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Seconds left on a lockout; 0 = not locked. Drives the disabled state + the countdown copy.
  const [lockLeft, setLockLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Tick the lockout countdown to zero (interval created once while locked; self-stops at 0).
  const locked = lockLeft > 0;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLockLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH);
  const lengthOk = pin.length >= PIN_MIN_LENGTH;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    setBusy(true);
    setMsg(null);
    const res = await unlockConsole({ pin });
    setBusy(false);
    if (res.ok) {
      router.replace("/staff");
      router.refresh();
      return;
    }
    setPin("");
    inputRef.current?.focus();
    if (res.reason === "wrong") {
      setMsg(
        res.attemptsRemaining > 0
          ? `Wrong PIN — ${res.attemptsRemaining} ${res.attemptsRemaining === 1 ? "try" : "tries"} left.`
          : "Wrong PIN.",
      );
      return;
    }
    if (res.reason === "locked") {
      const left = Math.max(
        0,
        Math.ceil((new Date(res.lockedUntil).getTime() - Date.now()) / 1000),
      );
      setLockLeft(left);
      setMsg("Too many tries.");
      return;
    }
    if (res.reason === "no_pin") {
      // The PIN was removed elsewhere while locked — sign out is the honest way back.
      setMsg("No PIN is set on this account. Sign out to continue.");
      return;
    }
    setMsg("Couldn’t check that PIN. Try again.");
  }

  async function signOut() {
    setMsg(null);
    const { error } = await browserClient().auth.signOut();
    if (error) {
      setMsg("Couldn’t sign out — check your connection and try again.");
      return;
    }
    router.replace("/staff/login");
    router.refresh();
  }

  const mins = Math.floor(lockLeft / 60);
  const secs = lockLeft % 60;
  const lockCopy = locked ? `Locked — try again in ${mins > 0 ? `${mins}m ` : ""}${secs}s.` : null;

  return (
    <main style={wrap}>
      <div className="card" style={card}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          <Icon name="lock" size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Tablet locked
        </p>
        <h1 style={h1}>Welcome back, {displayName}</h1>
        <p style={sub}>Enter your PIN to resume.</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="unlock-pin" style={label}>
            PIN
          </label>
          <input
            ref={inputRef}
            id="unlock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_MAX_LENGTH}
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            placeholder="••••"
            disabled={locked}
            aria-describedby="unlock-msg"
            style={input}
          />
          <button type="submit" disabled={busy || locked || !lengthOk} style={primaryBtn}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>

        <button type="button" onClick={signOut} style={linkBtn}>
          Forgot PIN? Sign out
        </button>

        {/* One live region (QA §A): the lockout countdown takes precedence over a transient message. */}
        <p id="unlock-msg" role="status" style={{ margin: "var(--s4) 0 0", minHeight: 20 }}>
          {(lockCopy ?? msg) && (
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
              {lockCopy ?? msg}
            </span>
          )}
        </p>
      </div>
    </main>
  );
}

const wrap: CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: "var(--s6)",
};
const card: CSSProperties = { width: "100%", maxWidth: 360, padding: "var(--s6)" };
const h1: CSSProperties = { fontSize: "var(--fs-h2)", margin: "0 0 6px" };
const sub: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s5)",
};
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: "var(--fs-body)",
  letterSpacing: "0.3em",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  marginBottom: "var(--s4)",
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const linkBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  marginTop: 4,
  border: "none",
  background: "transparent",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
