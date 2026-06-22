"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { sendToKitchen, undoFire } from "@/lib/cart";

/**
 * Dine-in "Send to kitchen" (S2.1b) + the server-clocked undo grace (S2.2) — the host fires the table's
 * current draft batch so the kitchen can start cooking before the bill is settled (order → eat → pay
 * later). Only rendered for the dine-in HOST; the server re-enforces host + dine-in + cart-open
 * regardless (sendToKitchen → mms_fire_cart).
 *
 * S2.2: the fire stamps fire_at = now() + 10s, so the lines are 'fired' (the diner cart swaps their
 * steppers for "Sent to kitchen" chips immediately) but stay INVISIBLE to the KDS until the grace
 * passes. During that window the button becomes "Sent ✓ — Undo (Ns)": tapping Undo runs the grace-gated
 * mms_undo_fire (a clean fired→draft the kitchen never saw). The countdown is SERVER-clocked — it counts
 * down to the deadline the server returned, and Undo itself re-checks the grace, so a drifted client
 * clock can't extend the window (the server answers `expired` → "ask a server").
 */
export function SendToKitchenButton({
  cartId,
  hasDraft,
  onChanged,
}: {
  cartId: string;
  /** Any line still 'draft' (i.e. there's something to send). When false and no undo window is open,
   *  everything's already with the kitchen, so we show a quiet confirmation instead of a dead button. */
  hasDraft: boolean;
  /** Re-sync the parent cart after a send/undo (solo dine-in isn't on the group realtime channel). */
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Server-clocked undo deadline (epoch ms) + a tick so the countdown re-renders each second.
  const [undoUntil, setUndoUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drive the countdown while an undo window is open, and close it (drop the Undo affordance — the lines
  // are now truly with the kitchen) the moment it elapses. The clear happens inside the interval
  // callback, not the effect body, so it doesn't trigger a synchronous mid-render setState.
  useEffect(() => {
    if (undoUntil === null) return;
    timer.current = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= undoUntil) setUndoUntil(null); // window elapsed → cleanup below clears the interval
    }, 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [undoUntil]);

  const remaining = undoUntil === null ? 0 : Math.max(0, Math.ceil((undoUntil - nowMs) / 1000));

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
          // Open the undo window to the SERVER's deadline (null ⇒ no window shown, still sent). Re-seed
          // `nowMs` to the same instant so the FIRST painted count is accurate — a long-open cart's
          // mount-time `nowMs` would otherwise make `remaining` flash too large until the first tick.
          setNowMs(Date.now());
          setUndoUntil(res.undoUntil ? Date.parse(res.undoUntil) : null);
          onChanged(); // steppers → "Sent to kitchen" chips
        } else {
          setMsg({ kind: "err", text: reasonCopy[res.reason] });
        }
      } catch {
        // assertCartMember (not a member / session closed) throws; Next redacts the message in prod.
        setMsg({ kind: "err", text: "Couldn’t send that just now — please try again." });
      }
    });
  };

  const undo = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await undoFire(cartId);
        if (res.ok) {
          setMsg({ kind: "ok", text: "Brought back to your cart — edit and send again." });
        } else {
          // `expired` is the common close: the grace passed mid-tap. Honest steer to a server; the other
          // reasons reuse the send copy. Either way the lines may have changed → re-sync below.
          setMsg({
            kind: res.reason === "expired" ? "ok" : "err",
            text:
              res.reason === "expired"
                ? "That’s already with the kitchen — ask a server to change it."
                : reasonCopy[res.reason],
          });
        }
      } catch {
        setMsg({ kind: "err", text: "Couldn’t undo that just now — please try again." });
      } finally {
        setUndoUntil(null); // close the window regardless — re-sync reveals the true state
        onChanged();
      }
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      {remaining > 0 ? (
        // The undo window: confirmation + a server-clocked "Undo (Ns)". The changing count lives in the
        // BUTTON label (not the live region), so it isn't re-announced every second.
        <button
          type="button"
          onClick={undo}
          disabled={pending}
          aria-busy={pending}
          style={{ ...btn, opacity: pending ? 0.7 : 1, cursor: pending ? "default" : "pointer" }}
        >
          {pending ? "Bringing it back…" : `Undo — ${remaining}s`}
        </button>
      ) : hasDraft ? (
        <button
          type="button"
          onClick={send}
          disabled={pending}
          aria-busy={pending}
          style={{ ...btn, opacity: pending ? 0.7 : 1, cursor: pending ? "default" : "pointer" }}
        >
          {pending ? "Sending…" : "Send to kitchen"}
        </button>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: "var(--t2)", textAlign: "center" }}>
          Your order’s with the kitchen.
        </p>
      )}
      {/* The ONE live region for the send/undo flow — discrete event messages only (never the ticking
          count), so a SR hears "Sent…" / "Brought back…" once, not every second. */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
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
