"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { chime } from "@/lib/diner-sound";
import { Icon } from "@mms/ui";
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
/**
 * What this control says when a frozen tap arrives — naming THIS control, never the lock's holder.
 *
 * ⚠️ An earlier draft echoed Checkout's `freezeNotice` through a `frozenNote` prop. Two defects,
 * both caught pre-merge: (1) `frozenNote` carries the SUPPRESSED freeze while `frozen` carries the
 * RAW one, so `frozen && frozenNote === null` is reachable in exactly one state — the viewer's own
 * in-flight `create-intent` — and the `??` fallback would have blamed a peer in the one window
 * where the code knows the holder is the reader (the M116 fabricated-diagnosis class); and (2)
 * setting the region to the string it already holds is a no-op React bails on, so nothing is
 * announced. A sentence about this control is true under every freeze and differs from the bar's.
 */
const FROZEN_NOTE = "The order’s locked while a checkout finishes.";

export function SendToKitchenButton({
  cartId,
  hasDraft,
  draftCount = 0,
  primary = false,
  frozen,
  onUndoWindowChange,
  onChanged,
}: {
  cartId: string;
  /** Any line still 'draft' (i.e. there's something to send). When false and no undo window is open,
   *  everything's already with the kitchen, so we show a quiet confirmation instead of a dead button. */
  hasDraft: boolean;
  /** W12 — the CTA carries what it sends ("Send to kitchen · 3 items"). 0 hides the count. */
  draftCount?: number;
  /**
   * T9 — Checkout's `editsFrozen`, threaded. Both mutations here (`sendToKitchen`, `undoFire`)
   * refuse on bare `locked`, so a live control is one whose write is already decided against.
   *
   * ⚠️ THIS GATES THE UNDO TOO, and that is the honest reading rather than a harsh one. `undoFire`
   * refuses under the same predicate, so a freeze landing mid-grace has ALREADY taken the undo away
   * server-side; leaving the button live would only spend the diner's last seconds on a tap that
   * cannot land. What the gate must NOT do is shorten the window — see `undoUntil` below.
   */
  frozen: boolean;
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
  // W22a — the paper-beat ceremony counter: bumped once per SUCCESSFUL send; the beat glyph is
  // keyed by it so a second send this session replays the beat (a bare boolean wouldn't). 0 = no
  // send yet, nothing rendered. Decorative only — the live region says it in words.
  const [sendBeat, setSendBeat] = useState(0);

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

  // ⚠️ CLEAR THE FREEZE REFUSAL WHEN THE FREEZE LIFTS. `msg` outlives the condition that produced
  // it: a peer takes the lock, the diner taps Send and gets FROZEN_NOTE, the peer reopens, the bar
  // disappears and the CTA lights up again — and this component's `--warn` line was still sitting
  // under it saying the order is locked. Two contradictory statements about the same fact, one of
  // them false. Only this one message is cleared: a send/undo outcome is a report about something
  // that happened and stays until the next action replaces it.
  const wasFrozen = useRef(frozen);
  useEffect(() => {
    if (wasFrozen.current && !frozen) setMsg((m) => (m?.text === FROZEN_NOTE ? null : m));
    // ⚠️ AND CLOSE AN OPEN CONFIRM WHEN THE FREEZE ARRIVES (Codex round 6 on #247). `ConfirmSwap`
    // takes only `busy`, so a confirm opened while editable keeps a Proceed button that looks and
    // reads as live after a peer takes the lock — the handler refuses, but one interaction too
    // late, which is precisely the "refuse at the door" rule the trigger below already follows.
    // Closing it returns the diner to the (now dimmed, `aria-disabled`) Send trigger and says why.
    if (!wasFrozen.current && frozen && confirming) {
      setConfirming(false);
      setMsg({ kind: "err", text: FROZEN_NOTE });
    }
    wasFrozen.current = frozen;
  }, [frozen, confirming]);

  // Focus back to the Send trigger when the confirm closes WITHOUT sending (B4 / the staff idiom).
  // After a confirmed send the trigger unmounts and the existing undo-focus effect takes over.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirming && wasConfirming.current) sendBtnRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const send = () => {
    if (frozen) {
      // ⚠️ CLOSE THE CONFIRM ON THIS PATH TOO. Returning without it stranded the diner on an open
      // confirm whose Proceed can only refuse and whose only escape is Cancel — exactly what the
      // `setConfirming(false)` below is commented as preventing. The freeze can arrive between
      // opening the confirm and pressing Proceed, so this is reachable.
      setConfirming(false);
      // Say why rather than dying quietly — this is the one control the diner came here to press.
      setMsg({ kind: "err", text: FROZEN_NOTE });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await sendToKitchen(cartId);
        // Close the confirm on EVERY outcome — a refusal must return the diner to a live trigger
        // they can retry from, not strand them on a confirm whose proceed already fired.
        setConfirming(false);
        if (res.ok) {
          // W22f — the service bell, on the SUCCESS arm only. Silent unless the diner asked for it,
          // and the visible half (this message + W22a·depth's paper settle) carries the moment for
          // everyone else. Deliberately not in the refusal branch below: a sound on failure turns a
          // recoverable problem into a public one — the whole table looks over.
          chime("sent");
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
          setSendBeat((n) => n + 1); // W22a — one paper beat per successful send
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
    if (frozen) {
      // ⚠️ The window is NOT closed here. `undoUntil` is mirrored to the parent via
      // `onUndoWindowChange` and gates Checkout's View-bill door, so ending it early would both
      // forfeit an undo the SQL would still honour once the lock clears AND un-refuse that door.
      // The countdown keeps running; only the tap is refused, and it says why.
      setMsg({ kind: "err", text: FROZEN_NOTE });
      return;
    }
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
    // position:relative hosts the W22a paper beat (an absolute glyph lifting off the control row).
    <div style={{ marginTop: 12, position: "relative" }}>
      {/* W22a — the send ceremony: a small receipt lifts off toward the kitchen and fades. Keyed
          per successful send so a later send replays it; aria-hidden (the live region below says
          "Sent to the kitchen…" in words); display:none under reduced motion (a static lingering
          glyph would be noise, not a fallback). */}
      {sendBeat > 0 && (
        <span key={sendBeat} className="mms-send-beat" aria-hidden>
          <Icon name="receipt" size={22} />
        </span>
      )}
      {remaining > 0 ? (
        // The undo window: "Undo — Ns" counting down the server-measured grace. The changing count lives
        // in the BUTTON label (not the live region), so it isn't re-announced every second.
        // W22a `.mms-settle` — the control that replaces Send drops in with a soft settle (RM: instant).
        <button
          ref={undoBtnRef}
          type="button"
          onClick={undo}
          disabled={pending}
          /* T9 — `aria-disabled`, never native, for the FREEZE: the grace effect parks focus on this
             very button when the window opens, so a native disable would drop it to <body>
             mid-window (WCAG 2.4.3). `disabled` stays `{pending}` — the user's own in-flight tap. */
          aria-disabled={frozen || undefined}
          aria-busy={pending}
          className="checkout-outline-btn mms-settle"
          // 0.55 is Checkout's own frozen dim (it is what every gated control on that screen uses).
          // Unlike `.checkout-pill`, these two classes carry NO `[aria-disabled]` rule, so without
          // this the freeze would be announced to a screen reader and invisible to everyone else.
          style={{
            ...btn,
            opacity: pending ? 0.7 : frozen ? 0.55 : 1,
            cursor: pending || frozen ? "default" : "pointer",
          }}
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
          // Refuse at the DOOR, not two taps in. Opening the confirm under a freeze would walk the
          // diner through a decision step whose Proceed can only refuse — `send()` still guards
          // (that is the gate; this is the courtesy), but the dead end is avoidable so avoid it.
          onClick={() => {
            if (frozen) {
              setMsg({
                kind: "err",
                text: FROZEN_NOTE,
              });
              return;
            }
            setConfirming(true);
          }}
          disabled={pending}
          aria-disabled={frozen || undefined}
          aria-busy={pending}
          className={primary ? "checkout-cta" : "checkout-outline-btn"}
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
            opacity: pending ? 0.7 : frozen ? 0.55 : 1,
            cursor: pending || frozen ? "default" : "pointer",
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
  // ⚠️ THE SAME STRING AS THE CLIENT-SIDE REFUSAL, DELIBERATELY (Codex round 2 on #247). This is
  // the RACED path: the tap started while the cart was editable and the server took the lock before
  // authorization, so `frozen` was false and the client said nothing. It used to read "Someone’s
  // checking out", which is the peer claim the whole copy change removed — and the lock can be
  // self-held (two tabs on one device) or unattributable, so that sentence is a diagnosis the code
  // never established. Naming it ONCE also means the unfreeze effect above, which clears messages
  // equal to FROZEN_NOTE, clears this one too instead of leaving it stale after the lock lifts.
  // ⚠️ NOT `FROZEN_NOTE` (Codex round 5 on #247, correcting round 2). This is the RACED path — the
  // tap started editable and the server met the lock — so `frozen` is false here by construction
  // and the lock may already have lifted by the time this renders. Round 2 unified the two strings
  // so the unfreeze effect would clear this one too; that only works while an unfreeze EDGE is
  // still coming, and on a lock that took and released mid-request it already went by. A sentence
  // that makes no claim about the lock needs no edge and cannot go stale.
  locked: "That didn’t go through — please try again.",
  settling: "The table is settling up — you can’t send while everyone pays.",
  nothing: "Everything’s already with the kitchen.",
  rate_limited: "One moment — too many taps. Try again in a few seconds.",
  error: "Couldn’t send that just now — please try again.",
};

// W19 — surface colors moved to `.checkout-outline-btn` (a class so :hover/:active press states
// can exist — inline styles beat pseudo-classes); this keeps only layout.
const btn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  fontWeight: 800,
  fontSize: "var(--fs-body)",
};
