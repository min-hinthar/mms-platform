"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { sendToKitchen } from "@/lib/cart";

/**
 * Dine-in "Send to kitchen" (S2.1b) — the host fires the table's current draft batch so the kitchen can
 * start cooking before the bill is settled (the deferred-settlement flow: order → eat → pay later). Only
 * rendered for the dine-in HOST (a table-level action — a guest adds their own items, the host sends the
 * batch); the server re-enforces host + dine-in + cart-open regardless (sendToKitchen → mms_fire_cart).
 *
 * S2.1b fires immediately. The ~10s "Sent! — Undo" grace lands in S2.2 (server-clocked fire_at = now() +
 * grace); here the confirmation is honest about what happened ("on the way"), with no fabricated ETA.
 */
export function SendToKitchenButton({ cartId }: { cartId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const send = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await sendToKitchen(cartId);
        if (res.ok) {
          setMsg({
            kind: "ok",
            text: `Sent to the kitchen — ${res.fired} ${res.fired === 1 ? "item" : "items"} on the way.`,
          });
        } else {
          setMsg({ kind: "err", text: reasonCopy[res.reason] });
        }
      } catch {
        // assertCartMember (not a member / session closed) throws; Next redacts the message in prod.
        setMsg({ kind: "err", text: "Couldn’t send that just now — please try again." });
      }
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={send}
        disabled={pending}
        aria-busy={pending}
        style={{ ...btn, opacity: pending ? 0.7 : 1, cursor: pending ? "default" : "pointer" }}
      >
        {pending ? "Sending…" : "Send to kitchen"}
      </button>
      <p
        role="status"
        aria-live="polite"
        style={{
          minHeight: 16,
          margin: "8px 0 0",
          fontSize: 13,
          color: msg?.kind === "err" ? "var(--warn)" : "var(--t2)",
        }}
      >
        {msg?.text ?? ""}
      </p>
    </div>
  );
}

const reasonCopy: Record<
  "not_host" | "locked" | "settling" | "nothing" | "rate_limited" | "error",
  string
> = {
  not_host: "Ask the host to send the order to the kitchen.",
  locked: "Someone’s checking out — try again once they’ve finished.",
  settling: "The table is settling up — you can’t send while everyone pays.",
  nothing: "Everything’s already with the kitchen.",
  rate_limited: "One moment — too many taps. Try again in a few seconds.",
  error: "Couldn’t send that just now — please try again.",
};

const btn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  border: "1px solid var(--ac)",
  background: "transparent",
  color: "var(--ac)",
  fontWeight: 800,
  fontSize: 16,
};
