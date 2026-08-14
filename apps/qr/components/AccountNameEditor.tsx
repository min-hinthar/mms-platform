"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { setDisplayName } from "@/lib/rewards";
import { DEVICE_NAME_KEY } from "@/lib/device-session";

/**
 * W14 — the inline "Add your name / Edit name" affordance on the /account identity card. The FIRST
 * writer of `mms_profiles.display_name` (three readers shipped in M4 and waited a year for this):
 * saving lights up the heading, the menu's "Mingalaba, {first name} ✦" greeting, the lend confirm,
 * and the switcher chips — one column, four surfaces.
 *
 * - Prefills (never auto-saves) from the device's typed table/pickup name (`mms.name`) — the diner
 *   confirms; we don't assume a per-device string is their durable name.
 * - Server-authoritative: `setDisplayName` re-derives everything from the SSR-verified uid; the
 *   80-char bound is refused with honest copy (a name is never silently truncated) and re-checked
 *   by the column CHECK.
 * - Focus discipline (WCAG 2.4.3, the card's idiom): opening moves focus into the input; save and
 *   cancel return it to the trigger. Failures land in the form's one `role="status"` line.
 */
export function AccountNameEditor({
  name,
  onSaved,
}: {
  name: string | null;
  onSaved: (name: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus({ preventScroll: true });
      wasEditing.current = true;
    } else if (wasEditing.current) {
      triggerRef.current?.focus({ preventScroll: true });
      wasEditing.current = false;
    }
  }, [editing]);

  function open() {
    // Seed from the account name, else the device's typed table/pickup name (a PRE-FILL the diner
    // confirms — never an auto-write; the deliberate seam between device state and account state).
    let seed = name ?? "";
    if (!seed) {
      try {
        seed = localStorage.getItem(DEVICE_NAME_KEY) ?? "";
      } catch {
        /* storage unavailable — start empty */
      }
    }
    setDraft(seed);
    setError(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await setDisplayName(draft);
      if (res.ok) {
        onSaved(res.name);
        setError(null);
        setEditing(false);
      } else {
        setError(
          res.reason === "invalid"
            ? "Keep your name under 80 characters."
            : res.reason === "rate_limited"
              ? "Too many changes — try again in a moment."
              : res.reason === "signed_out"
                ? "Your sign-in lapsed — sign in again to change your name."
                : "We couldn’t save your name just now — try again.",
        );
      }
    } catch {
      setError("We couldn’t save your name just now — try again.");
    }
    setBusy(false);
  }

  if (!editing) {
    return (
      <button type="button" ref={triggerRef} onClick={open} className="nav-link" style={trigger}>
        {name ? "Edit name" : "Add your name"}
      </button>
    );
  }

  return (
    <form onSubmit={save} style={{ margin: "8px 0 2px" }}>
      <label htmlFor="acct-name-input" style={label}>
        Your name
      </label>
      <input
        id="acct-name-input"
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={80}
        autoComplete="name"
        placeholder="How should we greet you?"
        disabled={busy}
        style={input}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="submit" disabled={busy} aria-busy={busy} style={saveBtn}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
          disabled={busy}
          style={cancelBtn}
        >
          Cancel
        </button>
      </div>
      {/* The form's one announcer — empty until a save actually fails (honest, never decorative). */}
      <p role="status" style={statusLine}>
        {error}
      </p>
    </form>
  );
}

const trigger: CSSProperties = {
  minHeight: 44,
  padding: "0 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  justifySelf: "start",
};
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--t2)",
  margin: "0 0 4px",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 11,
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)", // ≥16px — iOS Safari auto-zooms (and stays zoomed) below 16px
};
const saveBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 11,
  border: "1.5px solid var(--ac)",
  background: "transparent",
  color: "var(--ac)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 11,
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const statusLine: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
  minHeight: 0,
};
