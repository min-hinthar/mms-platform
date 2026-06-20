"use client";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@mms/ui";

/**
 * Entry-screen "join a table" path (M3·P3.1 host-invite fallback). A guest who was given a code but
 * has no sticker to scan enters it here → routes to the dine-in menu with `?j=<code>`, where the
 * session mint joins them to the host's shared cart. (Scanning the sticker or the host's link is the
 * primary path and skips this entirely.)
 */
export function JoinTable() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const id = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    router.push(`/menu?mode=dinein&j=${encodeURIComponent(c)}`);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={linkBtn}>
        Have a table code? Join a table
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Join a table">
        <p style={{ color: "var(--t2)", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 12px" }}>
          Enter the code your host shared to order together on one cart.
        </p>
        <form onSubmit={submit}>
          <label htmlFor={id} style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
            Table code
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id={id}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              placeholder="e.g. K7M9PQRT"
              style={input}
            />
            <button type="submit" disabled={!code.trim()} style={joinBtn}>
              Join
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

const linkBtn: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 14,
  minHeight: 44,
  background: "none",
  border: "none",
  color: "var(--ac)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const input: CSSProperties = {
  flex: 1,
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 12,
  border: "1.5px solid var(--bd)",
  background: "var(--pg)",
  color: "var(--tx)",
  fontSize: 16,
  font: "inherit",
  letterSpacing: ".08em",
  textTransform: "uppercase",
};
const joinBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 22px",
  borderRadius: 12,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
};
