"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@mms/ui";
import { lockConsole } from "@/lib/staff-pin-actions";

/**
 * Lock the shared tablet (S1.1b). Sets the device-local lock (server action, httpOnly cookie) and sends
 * the staff member to the PIN screen. Only rendered when a PIN is set (lockConsole also refuses without
 * one) — locking with no PIN would strand the device behind an unenterable screen.
 */
export function LockButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lock() {
    setBusy(true);
    setErr(null);
    const res = await lockConsole();
    if (!res.ok) {
      setBusy(false);
      setErr(res.error);
      return;
    }
    router.replace("/staff/lock");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={lock} disabled={busy} style={btn}>
        {/* Decorative lock glyph — the text label carries the meaning. */}
        <Icon name="lock" size={16} />
        {busy ? "Locking…" : "Lock"}
      </button>
      {err && (
        <span role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
          {err}
        </span>
      )}
    </>
  );
}

const btn: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 16px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
