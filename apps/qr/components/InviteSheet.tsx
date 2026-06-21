"use client";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Sheet } from "@mms/ui";
import { useCart } from "./TableCartProvider";
import { MAX_PARTY_SIZE } from "@/lib/limits";

/**
 * Dine-in invite (M3·P3.1 host-invite fallback to the physical sticker). Surfaces the server-issued
 * join code (the session's qr_code) + a shareable deep link, so a second phone with no sticker can
 * join the SAME cart. Also lets the diner name their own seat for the presence guest list.
 *
 * Honest scope: P3.1 is "join + presence" — everyone orders into one shared cart. Live cart sync
 * (a peer's add appearing without refresh) is P3.2; splitting the bill is P3.3. The copy here
 * promises neither.
 */
export function InviteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { joinCode, role, me, setName } = useCart();
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const nameId = useId();

  const notify = (m: string) => {
    setStatus(m);
    window.setTimeout(() => setStatus(null), 2200);
  };

  const inviteLink = () =>
    `${window.location.origin}/menu?mode=dinein&j=${encodeURIComponent(joinCode ?? "")}`;

  async function copy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(msg);
    } catch {
      notify("Couldn’t copy — long-press to copy it manually.");
    }
  }

  async function share() {
    const url = inviteLink();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join my table",
          text: "Order with me at Mandalay Morning Star",
          url,
        });
        return;
      } catch {
        // Share sheet dismissed/declined → fall back to copying the link.
      }
    }
    await copy(url, "Invite link copied");
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next) return;
    await setName(next);
    setDraft("");
    notify("Name saved");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Invite to your table">
      <p style={muted}>
        Everyone at the table orders together into one cart. Share this to add a phone — or just
        scan the table’s QR sticker. Up to {MAX_PARTY_SIZE} guests per table.
      </p>

      {joinCode && (
        <div style={codeCard}>
          <span style={codeLabel}>Table code</span>
          <button
            type="button"
            onClick={() => copy(joinCode, "Code copied")}
            aria-label={`Copy table code, ${joinCode.split("").join(" ")}`}
            style={codeBtn}
          >
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: ".14em" }}>
              {joinCode}
            </span>
            <span aria-hidden style={{ fontSize: 12, color: "var(--t2)", fontWeight: 700 }}>
              Tap to copy
            </span>
          </button>
        </div>
      )}

      <button type="button" onClick={share} style={primaryBtn}>
        Share invite link
      </button>

      <form onSubmit={saveName} style={{ marginTop: 20 }}>
        <label htmlFor={nameId} style={fieldLabel}>
          Your name{" "}
          {me ? (
            <span style={{ color: "var(--t3)", fontWeight: 600 }}>· shows as “{me.name}”</span>
          ) : null}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id={nameId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={40}
            placeholder={me?.name ?? "Guest"}
            autoComplete="given-name"
            style={input}
          />
          <button type="submit" disabled={!draft.trim()} style={saveBtn}>
            Save
          </button>
        </div>
      </form>

      <p style={{ ...muted, marginTop: 16 }}>
        {role === "host" ? "You started this table." : "You joined this table."}
      </p>

      {/* Single polite live region for this modal view (the page's region is inert behind the scrim).
          role="status" already implies aria-live="polite" + aria-atomic — no redundant attrs. */}
      <p role="status" style={statusLine}>
        {status}
      </p>
    </Sheet>
  );
}

const muted: CSSProperties = {
  color: "var(--t2)",
  fontSize: 13.5,
  lineHeight: 1.5,
  margin: "0 0 14px",
};
const codeCard: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  marginBottom: 12,
};
const codeLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--t3)",
};
const codeBtn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  minHeight: 44,
  padding: 0,
  background: "none",
  border: "none",
  color: "var(--tx)",
  cursor: "pointer",
  fontVariantNumeric: "tabular-nums",
};
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 13,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
};
const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  display: "block",
  marginBottom: 6,
};
const input: CSSProperties = {
  flex: 1,
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 11,
  border: "1.5px solid var(--bd)",
  background: "var(--pg)",
  color: "var(--tx)",
  fontSize: 15,
  font: "inherit",
};
const saveBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 11,
  border: "1.5px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
const statusLine: CSSProperties = {
  minHeight: 18,
  marginTop: 12,
  marginBottom: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--ac)",
};
