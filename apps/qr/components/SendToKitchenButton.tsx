"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { sendToKitchen, undoFire } from "@/lib/cart";
import { t, type DictKey } from "@/lib/i18n";
import { confirmCopy } from "@/lib/confirm-copy";
import { ConfirmSwap } from "./ConfirmSwap";

// W16b — ALWAYS bilingual: EN primary + a Padauk MY line on the same surface (the owner's named
// example is this very CTA). T() keeps the call sites; the MY half renders with per-span lang="my".
const T = (k: DictKey) => t("en", k);

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
  draftCount = 0,
  primary = false,
  onUndoWindowChange,
  onChanged,
}: {
  cartId: string;
  /** Any line still 'draft' (i.e. there's something to send). When false and no undo window is open,
   *  everything's already with the kitchen, so we show a quiet confirmation instead of a dead button. */
  hasDraft: boolean;
  /** W12 — the CTA carries what it sends ("Send to kitchen · 3 items"). 0 hides the count. */
  draftCount?: number;
  /** W12 — the Order moment's hero action: render as the filled `.checkout-cta` (shine sweep and
   *  all) instead of the old secondary outline. The undo window keeps the outline (reversing is
   *  never the hero). */
  primary?: boolean;
  /** W12 — mirrors the undo-grace window up to the parent: while open, the Order moment's
   *  View-bill door refuses (flipping stages unmounts this component and destroys the only UI
   *  that can recall the send). Reset to false on close AND on unmount, so a settle/lock flip
   *  that unmounts mid-grace can never leave the parent stuck refusing. */
  onUndoWindowChange?: (open: boolean) => void;
  /** Re-sync the parent cart after a send/undo (solo dine-in isn't on the group realtime channel). */
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // W16c — the confirm step sits between the tap and send(). It stays LOCAL: unlike the undo
  // grace (mirrored to the parent so the View-bill door refuses), an open confirm is safely
  // discarded by a stage flip — nothing was committed.
  const [confirming, setConfirming] = useState(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  // Client-local undo deadline (epoch ms, = receipt + server-measured grace) + a tick so the countdown
  // re-renders each second.
  const [undoUntil, setUndoUntil] = useState<number | null>(null);
  // The fire_batch the server handed back for THIS send — undo targets exactly it (S4-audit P1-3), so the
  // host's Undo never claws back a guest's make-it-now line that shares the grace window.
  const [undoBatch, setUndoBatch] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoBtnRef = useRef<HTMLButtonElement>(null);

  // Drive the countdown while an undo window is open, and close it (drop the Undo affordance — the lines
  // are now truly with the kitchen) the moment it elapses. The clear happens inside the interval
  // callback, not the effect body, so it doesn't trigger a synchronous mid-render setState.
  useEffect(() => {
    if (undoUntil === null) return;
    // The Send button just unmounted in favour of the Undo button — land focus on Undo so a keyboard/SR
    // host can reverse the send without hunting for it (B4: move focus predictably on the state change).
    undoBtnRef.current?.focus();
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

  // W12 — window state up to the parent (see the prop doc). The unmount cleanup is the stuck-open
  // guard: a settling/lock view flip can unmount this component while the grace is live.
  useEffect(() => {
    onUndoWindowChange?.(undoUntil !== null);
  }, [undoUntil, onUndoWindowChange]);
  useEffect(() => () => onUndoWindowChange?.(false), [onUndoWindowChange]);

  // Focus back to the Send trigger when the confirm closes WITHOUT sending (B4 / the staff idiom).
  // After a confirmed send the trigger unmounts and the existing undo-focus effect takes over.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirming && wasConfirming.current) sendBtnRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const send = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await sendToKitchen(cartId);
        // Close the confirm on EVERY outcome — a refusal must return the diner to a live trigger
        // they can retry from, not strand them on a confirm whose proceed already fired.
        setConfirming(false);
        if (res.ok) {
          setMsg({
            kind: "ok",
            text: `Sent to the kitchen — ${res.fired} ${res.fired === 1 ? "item" : "items"} on the way.`,
          });
          // Open the undo window for the server-MEASURED grace, counted from THIS client's receipt:
          // graceMs = undoUntil(server) − serverNow(server), then a client-local deadline of
          // now()+graceMs. Using the measured DURATION (not the absolute server timestamp) keeps the
          // count immune to client-clock skew, and re-seeding `nowMs` to the same instant avoids a
          // first-paint flash. null undoUntil ⇒ no window shown (still sent). The server re-checks
          // fire_at on undo regardless, so the countdown is advisory.
          const graceMs = res.undoUntil ? Date.parse(res.undoUntil) - Date.parse(res.serverNow) : 0;
          const startNow = Date.now();
          setNowMs(startNow);
          // Only open the undo window if we have BOTH a grace and the batch id to target on undo.
          const canUndo = graceMs > 0 && res.undoBatch !== null;
          setUndoBatch(res.undoBatch);
          setUndoUntil(canUndo ? startNow + graceMs : null);
          onChanged(); // steppers → "Sent to kitchen" chips
        } else {
          setMsg({ kind: "err", text: reasonCopy[res.reason] });
        }
      } catch {
        // assertCartMember (not a member / session closed) throws; Next redacts the message in prod.
        setConfirming(false);
        setMsg({ kind: "err", text: "Couldn’t send that just now — please try again." });
      }
    });
  };

  const undo = () => {
    // The window only opens with a batch id (see send()); guard so undo always targets a concrete batch.
    if (undoBatch === null) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await undoFire(cartId, undoBatch);
        if (res.ok) {
          setMsg({ kind: "ok", text: "Brought back to your cart — edit and send again." });
          setUndoUntil(null); // the batch is back in draft → close the window
        } else if (res.reason === "expired") {
          // The grace passed mid-tap — honest steer to a server, and the window is genuinely over.
          setMsg({
            kind: "ok",
            text: "That’s already with the kitchen — ask a server to change it.",
          });
          setUndoUntil(null);
        } else {
          // locked / settling / rate_limited / error: NOTHING was un-fired and the lines may still be in
          // grace — keep the window open so the host can retry; it expires on its own when the grace ends.
          setMsg({ kind: "err", text: reasonCopy[res.reason] });
        }
      } catch {
        // Uncertain outcome — leave the window to expire naturally; the re-sync shows the true state.
        setMsg({ kind: "err", text: "Couldn’t undo that just now — please try again." });
      } finally {
        onChanged(); // re-sync regardless — reveals the true state after a send/undo
      }
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      {remaining > 0 ? (
        // The undo window: "Undo — Ns" counting down the server-measured grace. The changing count lives
        // in the BUTTON label (not the live region), so it isn't re-announced every second.
        <button
          ref={undoBtnRef}
          type="button"
          onClick={undo}
          disabled={pending}
          aria-busy={pending}
          style={{ ...btn, opacity: pending ? 0.7 : 1, cursor: pending ? "default" : "pointer" }}
        >
          {pending ? "Bringing it back…" : `Undo — ${remaining}s`}
        </button>
      ) : hasDraft && confirming ? (
        // W16c — the decision step. The 10s server-clocked undo BELOW stays: the two guard
        // different failure modes (a mis-tap before, a changed mind after), so neither replaces
        // the other.
        <ConfirmSwap
          copy={confirmCopy({ kind: "sendToKitchen", itemCount: draftCount })}
          busy={pending}
          busyLabel={T("sending")}
          onCancel={() => setConfirming(false)}
          onProceed={send}
        />
      ) : hasDraft ? (
        <button
          ref={sendBtnRef}
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          aria-busy={pending}
          className={primary ? "checkout-cta" : undefined}
          // ⚠️ Inline styles outrank the class: when primary, the outline look's background/color/
          // border must NOT ride along or they'd blank the .checkout-cta gradient under the label.
          style={{
            ...(primary
              ? {
                  width: "100%",
                  minHeight: 50,
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 800,
                  fontSize: "var(--fs-body)",
                }
              : btn),
            opacity: pending ? 0.7 : 1,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {/* The label rides above the .checkout-cta ::after shine sweep on its own layer.
              W16b — stacked bilingual (the owner's named example): EN + count primary, MY line
              under it. The MY count word ခု is invariant; digits stay Latin (the money rule). */}
          <span style={{ position: "relative", zIndex: 1, display: "block" }}>
            {pending
              ? T("sending")
              : draftCount > 0
                ? `${T("sendToKitchen")} · ${draftCount} ${draftCount === 1 ? T("countItem") : T("countItems")}`
                : T("sendToKitchen")}
            <span
              lang="my"
              style={{
                display: "block",
                fontFamily: "var(--font-my)",
                fontSize: "var(--fs-sm)",
                fontWeight: 600,
              }}
            >
              {pending
                ? t("my", "sending")
                : draftCount > 0
                  ? `${t("my", "sendToKitchen")} · ${draftCount} ${t("my", "countItems")}`
                  : t("my", "sendToKitchen")}
            </span>
          </span>
        </button>
      ) : (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)", textAlign: "center" }}>
          {T("orderWithKitchen")}
          <span
            lang="my"
            style={{
              display: "block",
              fontFamily: "var(--font-my)",
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              color: "var(--t3)",
            }}
          >
            {t("my", "orderWithKitchen")}
          </span>
        </p>
      )}
      {/* The ONE live region for the send/undo flow — discrete event messages only (never the ticking
          count), so a SR hears "Sent…" / "Brought back…" once, not every second. */}
      <p
        role="status"
        aria-atomic="true"
        style={{
          minHeight: 16,
          margin: "8px 0 0",
          fontSize: "var(--fs-sm)",
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
  fontSize: "var(--fs-body)",
};
