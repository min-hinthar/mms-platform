"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setPin, removePin } from "@/lib/staff-pin-actions";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/limits";

/**
 * Self-service PIN management (S1.1b) — a staff member sets / rotates / removes their own shared-tablet
 * PIN. Authority is server-side (every action re-checks requireStaff + operates on caller.staffId); this
 * is the affordance + honest feedback. A confirm field catches a typo before it becomes a PIN you can't
 * reproduce. The PIN is masked and never echoed back from the server (set-only, write-only).
 */
export function PinManager({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Strip to digits as the user types — the field is numeric-only; mirrors the 4–8 digit server rule.
  const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH);
  const lengthOk = pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH;
  const matches = pin === confirm;

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!lengthOk) {
      setMsg({ ok: false, text: `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.` });
      return;
    }
    if (!matches) {
      setMsg({ ok: false, text: "Those PINs don’t match." });
      return;
    }
    setBusy(true);
    const res = await setPin({ pin });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setPinValue("");
    setConfirm("");
    setMsg({ ok: true, text: hasPin ? "PIN updated." : "PIN set — you can now lock the tablet." });
    router.refresh();
  }

  async function remove() {
    setRemoving(true);
    setMsg(null);
    const res = await removePin();
    setRemoving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: "PIN removed." });
    router.refresh();
  }

  return (
    <section className="card" style={card} aria-labelledby="pin-h">
      <h2 id="pin-h" style={{ fontSize: "var(--fs-body)", margin: "0 0 4px" }}>
        {hasPin ? "Change your PIN" : "Set a tablet PIN"}
      </h2>
      <p style={sub}>
        A {PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} digit PIN lets you lock and resume the floor tablet
        without signing in by email again. It’s yours alone — never share it.
      </p>

      <form onSubmit={save} noValidate>
        <label htmlFor="pin-new" style={label}>
          {hasPin ? "New PIN" : "PIN"}
        </label>
        <input
          id="pin-new"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX_LENGTH}
          value={pin}
          onChange={(e) => setPinValue(onlyDigits(e.target.value))}
          placeholder="••••"
          aria-describedby="pin-msg"
          style={input}
        />
        <label htmlFor="pin-confirm" style={label}>
          Confirm PIN
        </label>
        <input
          id="pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(onlyDigits(e.target.value))}
          placeholder="••••"
          style={input}
        />
        <button type="submit" disabled={busy || !lengthOk || !matches} style={primaryBtn}>
          {busy ? "Saving…" : hasPin ? "Update PIN" : "Set PIN"}
        </button>
      </form>

      {hasPin && (
        <button type="button" onClick={remove} disabled={removing} style={removeBtn}>
          {removing ? "Removing…" : "Remove PIN"}
        </button>
      )}

      {/* One live region for the form (QA §A). Also the PIN field's aria-describedby target. */}
      <p id="pin-msg" role="status" style={{ minHeight: 20, margin: "var(--s4) 0 0" }}>
        {msg && (
          <span style={{ fontSize: "var(--fs-sm)", color: msg.ok ? "var(--ok)" : "var(--warn)" }}>
            {msg.text}
          </span>
        )}
      </p>
    </section>
  );
}

const card: CSSProperties = { padding: "var(--s5)" };
const sub: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.5,
  margin: "0 0 var(--s4)",
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
  fontSize: "var(--fs-body)", // ≥16px so iOS doesn't zoom on focus
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
const removeBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  marginTop: "var(--s3)",
  border: "1px solid var(--bd)",
  borderRadius: "var(--r-full)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
