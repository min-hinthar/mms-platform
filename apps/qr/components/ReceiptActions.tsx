"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { getReceiptLink, setReceiptEmail, type ReceiptLinkResult } from "@/lib/receipt";

/**
 * W7a — the /track receipt card's door to the ARTIFACT: the durable `?r=` link ("view & print")
 * plus the consent-first "Email me this receipt" capture. Mounted only once the order row exists
 * (post-fulfillment); the server action re-authorizes (earner/payer) on every call, so this
 * component holds no authority — it only asks.
 *
 * The v7.2 prototype promised "Receipt sent to your phone" and the shipped app never kept it;
 * this keeps it honestly: nothing sends until the diner asks, the address is theirs to confirm
 * (account email pre-fills, never auto-submits), and "Sent" is only claimed after the server
 * accepted the ask. Feature-off (C8 from-address unset) simply never renders the email half.
 */
export function ReceiptActions({ orderId }: { orderId: string }) {
  const [link, setLink] = useState<Extract<ReceiptLinkResult, { ok: true }> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return; // one mint per mount — the action is idempotent but not free
    asked.current = true;
    getReceiptLink({ orderId })
      .then((r) => {
        if (r.ok) {
          setLink(r);
          setSentTo(r.emailedTo);
        }
      })
      .catch(() => {
        /* deliberate: the artifact door is decorative here — the tracker itself is unaffected */
      });
  }, [orderId]);

  // Focus follows the form open/close (WCAG 2.4.3 — the AccountNameEditor idiom).
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus({ preventScroll: true });
      wasEditing.current = true;
    } else if (wasEditing.current) {
      triggerRef.current?.focus({ preventScroll: true });
      wasEditing.current = false;
    }
  }, [editing]);

  if (!link) return null;

  function open() {
    setDraft(sentTo ?? link?.accountEmail ?? "");
    setError(null);
    setEditing(true);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await setReceiptEmail({ orderId, email: draft });
      if (r.ok) {
        setSentTo(r.sentTo);
        setError(null);
        setEditing(false);
      } else {
        setError(
          r.reason === "invalid"
            ? "That doesn’t look like an email address — check it and try again."
            : r.reason === "rate_limited"
              ? "A few sends already went out — give it a few minutes."
              : "We couldn’t send your receipt just now — the link above still works.",
        );
      }
    } catch {
      setError("We couldn’t send your receipt just now — the link above still works.");
    }
    setBusy(false);
  }

  return (
    <div style={wrap}>
      <a href={link.path} className="nav-link">
        View &amp; print your full receipt{" "}
        <span aria-hidden className="nav-arrow nav-arrow-fwd">
          →
        </span>
      </a>
      {link.emailEnabled &&
        (editing ? (
          <form onSubmit={send} style={{ marginTop: 6 }}>
            <label htmlFor="receipt-email-input" style={label}>
              Email your receipt to
            </label>
            <input
              id="receipt-email-input"
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={254}
              placeholder="you@example.com"
              disabled={busy}
              style={input}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" disabled={busy} aria-busy={busy} style={sendBtn}>
                {busy ? "Sending…" : "Send receipt"}
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
            {/* The form's one announcer — a failed send never strands the diner (the durable
                link above remains the recovery). */}
            <p role="status" style={statusLine}>
              {error}
            </p>
          </form>
        ) : (
          <p style={emailRow}>
            {sentTo && (
              <span style={sentNote}>
                <span aria-hidden>✓ </span>Receipt sent to {sentTo}
              </span>
            )}
            <button type="button" ref={triggerRef} onClick={open} className="nav-link" style={ask}>
              {sentTo ? "Send again" : "Email me this receipt"}
            </button>
          </p>
        ))}
    </div>
  );
}

const wrap: CSSProperties = { marginTop: 8, display: "grid", gap: 2, justifyItems: "start" };
const emailRow: CSSProperties = {
  margin: 0,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};
const sentNote: CSSProperties = { fontSize: "var(--fs-sm)", color: "var(--ok, var(--ac-strong))" };
const ask: CSSProperties = {
  minHeight: 44,
  padding: "0 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
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
  fontSize: "var(--fs-body)", // ≥16px — iOS Safari zoom rule
};
const sendBtn: CSSProperties = {
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
