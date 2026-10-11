"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type Ref,
} from "react";
import { chime } from "@/lib/diner-sound";
import { Icon } from "@mms/ui";
import { sendToKitchen } from "@/lib/cart";
import { t, type DictKey } from "@/lib/i18n";
import { STAFF } from "@/lib/i18n/staff";
import { sentCopy } from "@/lib/confirm-copy";
import { undoTapHeld } from "@/lib/send-grace";
import { FROZEN_NOTE, reasonCopy, useGraceCountdown, type UndoGrace } from "./useUndoGrace";

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
 * passes. During that window the control becomes "Undo — Ns": tapping Undo runs the grace-gated
 * mms_undo_fire (a clean fired→draft the kitchen never saw). The countdown is SERVER-clocked — it counts
 * down to the deadline the server returned, and Undo itself re-checks the grace, so a drifted client
 * clock can't extend the window (the server answers `expired` → "ask a server").
 *
 * Phase 3c-i (D13 · D15) — CONTROLLED and presentational. The window (`deadlineMs`, `batch`, the tick,
 * `pending`, the serialized `graceWrites`) is Checkout's `useUndoGrace`, so a stage flip no longer
 * destroys the only UI that can recall the send; `verb` is `orderStageHero`'s decision (lib/
 * checkout-verb) — this component draws exactly what it is told: the filled Send, the outline Undo
 * (REVERSING IS NEVER THE HERO), or the quiet "with the kitchen" line. Every outcome sentence leaves
 * through `onMessage` to the view's ONE live region — the private `role="status"` this component
 * carried was the second polite region on the Order stage (QA §A:25).
 *
 * Phase 3c-ii (D27) — THE TABLE IS A GATE INSIDE `send()`, after the frozen refusal and before the
 * server: when the host says a table is still needed (`needsTable` — `sendNeedsTable`, lib/table-
 * pick: dine-in, unbound, a registry with answers) and offers an ask (`onNeedTable`), the tap opens
 * the host's sheet and RETURNS; the chip there binds the session and runs THIS send again through
 * the handle (`ref` → `SendHandle.send({ tableAnswered: true })`), so the bind and the fire are one
 * gesture with one send body. "Pick your table" is the Send's question, never a verb: the hero is
 * `orderStageHero`'s and nothing here gains a second one. `focus()` is for the sheet's success
 * edge: the Send node the modal would restore to has given way to the Undo by then.
 */
export type SendHandle = {
  /** The SAME send the button runs on its tap. `tableAnswered` skips the table gate (the sheet's
   *  chip has bound the session, or the host chose to send unbound); the frozen refusal stays. */
  send: (opts?: { tableAnswered?: boolean }) => void;
  /** Focus the mounted control — the Undo once the window is open, else the Send. */
  focus: () => void;
};

export function SendToKitchenButton({
  ref,
  cartId,
  verb,
  grace,
  draftCount = 0,
  frozen,
  onMessage,
  onChanged,
  needsTable = false,
  onNeedTable,
  describedBy,
}: {
  /** 3c-ii — the host's handle on this send (the bind sheet's one gesture; the success edge's focus). */
  ref?: Ref<SendHandle>;
  cartId: string;
  /** `orderStageHero(...)` — send (the filled hero) · undo (the outline, during the grace) · bill
   *  (nothing to send here: the door is the hero; with no drafts left, the quiet confirmation). */
  verb: "send" | "undo" | "bill";
  /** Checkout's undo window (`useUndoGrace`). */
  grace: UndoGrace;
  /** W12 — the CTA carries what it sends ("Send to kitchen · 3 items"). 0 hides the count. */
  draftCount?: number;
  /**
   * T9 — Checkout's `editsFrozen`, threaded. Both mutations here (`sendToKitchen`, `undoFire`)
   * refuse on bare `locked`, so a live control is one whose write is already decided against.
   *
   * ⚠️ THIS GATES THE UNDO TOO, and that is the honest reading rather than a harsh one. `undoFire`
   * refuses under the same predicate, so a freeze landing mid-grace has ALREADY taken the undo away
   * server-side; leaving the button live would only spend the diner's last seconds on a tap that
   * cannot land. What the gate must NOT do is shorten the window — the hook keeps it open.
   */
  frozen: boolean;
  /** Every outcome sentence (EN, and the owner's MY where one exists) → the view's one region. */
  onMessage: (text: string, my?: string) => void;
  /** Re-sync the parent cart after a send (solo dine-in isn't on the group realtime channel). */
  onChanged: () => void;
  /** 3c-ii (D27) — the host's answer to `sendNeedsTable` (lib/table-pick): a dine-in session with
   *  no number yet and a registry with answers. Only holds the send when an ask is offered. */
  needsTable?: boolean;
  /** 3c-ii — open the host's "Pick your table" sheet; the send returns and waits for the chip. */
  onNeedTable?: () => void;
  /** PD1 (m1 screen 3) — the ids the drawn control is `aria-describedby`: Send carries the host's
   *  waiting line and the caption, Undo the caption (Checkout renders both, outside this control, so
   *  the caption is the SAME node across the relabel). */
  describedBy?: string;
}) {
  const [pending, startTransition] = useTransition();
  // W22a — the paper-beat ceremony counter: bumped once per SUCCESSFUL send; the beat glyph is
  // keyed by it so a second send this session replays the beat (a bare boolean wouldn't). 0 = no
  // send yet, nothing rendered. Decorative only — the live region says it in words.
  const [sendBeat, setSendBeat] = useState(0);

  /**
   * PD2 · PD1 (P2y; the shared vocabulary's one Undo form) — THE SAME-GESTURE GUARD. The control
   * relabels under the finger (Send → Undo when the send answers, Undo → Send when the window
   * closes), so for `SAME_GESTURE_MS` after each relabel a tap on the new control lands on nothing:
   * the second half of a double-tap never un-sends the round it just sent, nor re-sends the round
   * it just brought back. `undoTapHeld` (lib/send-grace) delegates to `@mms/ui`'s one 350 ms. The
   * stamp is taken in an effect on the verb's edge, never during render (the purity lint).
   */
  const armedAt = useRef<number | null>(null);
  const prevVerb = useRef(verb);
  useEffect(() => {
    if (prevVerb.current !== verb) armedAt.current = Date.now();
    prevVerb.current = verb;
  }, [verb]);

  const send = (opts?: { tableAnswered?: boolean }) => {
    // One send per gesture: the tap path used to rely on a native `disabled` the handle bypassed,
    // and a second `send()` from the host (two bind answers) reached the server twice (the blind
    // pass on 3c-ii). The control stays focusable while pending — see the button below.
    if (pending) return;
    // P2y — a tap inside the same gesture as the relabel is the double-tap's second half.
    if (!opts?.tableAnswered && undoTapHeld(armedAt.current, Date.now())) return;
    if (frozen) {
      // Refuse at the DOOR, and say why rather than dying quietly — this is the one control the diner came here to press.
      onMessage(FROZEN_NOTE);
      return;
    }
    // 3c-ii (D27) — the table's question, AFTER the freeze (a bind under a peer's charge would
    // re-table a paid order) and BEFORE the server: the host's sheet takes the tap, its chip binds,
    // and this same send runs again with the question answered. With no host to ask, the order goes
    // out unbound exactly as before 3c-ii.
    if (!opts?.tableAnswered && needsTable && onNeedTable) {
      onNeedTable();
      return;
    }
    startTransition(async () => {
      try {
        const res = await sendToKitchen(cartId);
        if (res.ok) {
          // W22f — the service bell, on the SUCCESS arm only. Silent unless the diner asked for it,
          // and the visible half (this message + W22a·depth's paper settle) carries the moment for
          // everyone else. Deliberately not in the refusal branch below: a sound on failure turns a
          // recoverable problem into a public one — the whole table looks over.
          chime("sent");
          const sent = sentCopy(res.fired);
          onMessage(sent.en, sent.my);
          // Open the undo window for the server-MEASURED grace, counted from THIS client's receipt
          // (`graceDeadlineMs` inside the hook): immune to client-clock skew; null undoUntil or no
          // batch ⇒ no window (still sent). The server re-checks fire_at on undo regardless.
          grace.open(res, Date.now());
          setSendBeat((n) => n + 1); // W22a — one paper beat per successful send
          onChanged(); // steppers → "Sent to kitchen" chips
        } else {
          onMessage(reasonCopy[res.reason]);
        }
      } catch {
        // assertCartMember (not a member / session closed) throws; Next redacts the message in prod.
        onMessage("Couldn’t send that just now — please try again.");
      }
    });
  };

  // 3c-ii — the mounted control's node, for the host's `focus()`: the Undo (beside the hook's own
  // callback ref, which parks focus there when the window opens) or the Send.
  const undoEl = useRef<HTMLButtonElement | null>(null);
  const sendEl = useRef<HTMLButtonElement | null>(null);
  useImperativeHandle(ref, () => ({
    send,
    focus: () => {
      (undoEl.current ?? sendEl.current)?.focus();
    },
  }));

  return (
    // position:relative hosts the W22a paper beat (an absolute glyph lifting off the control row).
    <div style={{ marginTop: 12, position: "relative" }}>
      {/* W22a — the send ceremony: a small receipt lifts off toward the kitchen and fades. Keyed
          per successful send so a later send replays it; aria-hidden (the view's live region says
          "Sent to the kitchen…" in words); display:none under reduced motion (a static lingering
          glyph would be noise, not a fallback). */}
      {sendBeat > 0 && (
        <span key={sendBeat} className="mms-send-beat" aria-hidden>
          <Icon name="receipt" size={22} />
        </span>
      )}
      {verb === "undo" ? (
        // The undo window: "Undo — Ns" counting down the server-measured grace. The changing count lives
        // in the BUTTON label (never a live region), so it isn't re-announced every second — and it is
        // the label's own leaf (`UndoCountdown`, J34): the host never re-renders for it.
        // W22a `.mms-settle` — the control that replaces Send drops in with a soft settle (RM: instant).
        <button
          // The hook's callback ref, called from OURS at commit: `ref={grace.undoBtnRef}` would make the
          // React Compiler lint read every `grace.*` in this render as a ref access.
          ref={(el) => {
            grace.undoBtnRef(el);
            undoEl.current = el;
          }}
          type="button"
          onClick={() => {
            // P2y — the second half of a double-tap on the Send lands on this Undo: held.
            if (undoTapHeld(armedAt.current, Date.now())) return;
            void grace.undo(cartId, frozen);
          }}
          disabled={grace.pending}
          /* T9 — `aria-disabled`, never native, for the FREEZE: the grace effect parks focus on this
             very button when the window opens, so a native disable would drop it to <body>
             mid-window (WCAG 2.4.3). `disabled` stays `{pending}` — the user's own in-flight tap. */
          aria-disabled={frozen || undefined}
          aria-busy={grace.pending}
          aria-describedby={describedBy}
          // PD2 · PD1 (D3) — the ONE Undo form: `--sf` with a dashed accent edge (`.checkout-undo`),
          // never filled, never the hero.
          className="checkout-outline-btn checkout-undo mms-settle"
          // 0.55 is Checkout's own frozen dim (it is what every gated control on that screen uses).
          // Unlike `.checkout-pill`, these two classes carry NO `[aria-disabled]` rule, so without
          // this the freeze would be announced to a screen reader and invisible to everyone else.
          style={{
            ...btn,
            opacity: grace.pending ? 0.7 : frozen ? 0.55 : 1,
            cursor: grace.pending || frozen ? "default" : "pointer",
          }}
        >
          {/* D3 (one act, one word) — the name is the verb "Undo" and the Burmese is the console's
              own word for the same act, `table.send.undo` (ပြန်ယူ: what you sent away comes back);
              the seconds are an aria-hidden leaf so the name never changes every second (J34).
              Busy reads `table.send.undoing` in both tongues. Verbatim from the staff dictionary,
              pinned equal by a red-first test. */}
          <span style={{ display: "block" }}>
            {grace.pending ? STAFF["table.send.undoing"].en : "Undo"}
            {!grace.pending && <UndoCountdown deadlineMs={grace.deadlineMs} />}
            <span lang="my" className="checkout-undo-my">
              {grace.pending ? STAFF["table.send.undoing"].my : STAFF["table.send.undo"].my}
            </span>
          </span>
        </button>
      ) : verb === "send" ? (
        <button
          ref={sendEl}
          type="button"
          // One tap sends (Phase 1b). `send()` refuses at the door under a freeze and says why, and
          // asks the table (3c-ii) before the server when the host says one is still needed.
          onClick={() => send()}
          /* `aria-disabled`, never native, while PENDING (the Undo's T9 idiom): the host lands focus
             here after the table sheet unmounts — under reduced motion before the send answers — and
             a natively disabled control drops that landing to <body>, where a failed send then
             leaves it (WCAG 2.4.3). `send()` refuses the second tap itself. */
          aria-disabled={pending || frozen || undefined}
          aria-busy={pending}
          aria-describedby={describedBy}
          className="checkout-cta"
          // ⚠️ Inline styles outrank the class: the outline look's background/color/border must NOT
          // ride along or they'd blank the .checkout-cta gradient under the label.
          style={{
            ...btn,
            border: "none",
            opacity: pending ? 0.7 : frozen ? 0.55 : 1,
            cursor: pending || frozen ? "default" : "pointer",
          }}
        >
          {/* The label rides above the .checkout-cta ::after shine sweep on its own layer.
              W16b — stacked bilingual (the owner's named example): EN + count primary, MY line
              under it. The MY count word ခု is invariant; digits stay Latin (the money rule). */}
          <span style={{ position: "relative", zIndex: 1, display: "block" }}>
            {/* PD1 (m1 A5 · B6; DESIGN-LANGUAGE §21) — COUNT-FREE: a table's cart is shared, and
                its count is a tablemate's tap away from wrong. `sentCopy` still reports the
                server's fired count once the send lands. */}
            {pending ? T("sending") : T("sendToKitchen")}
            <span
              lang="my"
              style={{
                display: "block",
                fontFamily: "var(--font-my)",
                fontSize: "var(--fs-sm)",
                fontWeight: "var(--fw-semibold)",
              }}
            >
              {pending ? t("my", "sending") : t("my", "sendToKitchen")}
            </span>
          </span>
        </button>
      ) : draftCount === 0 ? (
        // Everything's already with the kitchen (and no window is open): a quiet confirmation
        // instead of a dead button. With drafts left, the Order stage's hero is the Total door.
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)", textAlign: "center" }}>
          {T("orderWithKitchen")}
          <span
            lang="my"
            style={{
              display: "block",
              fontFamily: "var(--font-my)",
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-semibold)",
              color: "var(--t3)",
            }}
          >
            {t("my", "orderWithKitchen")}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** J34 — the Undo label's count, the ONLY reader of the tick (`useGraceCountdown`): this text re-renders
 *  once a second; Checkout, the hook's host, does not (it re-rendered four times a second).
 *  D3 — an aria-hidden LEAF beside the verb: the accessible name is "Undo" alone. */
function UndoCountdown({ deadlineMs }: { deadlineMs: number | null }) {
  const left = useGraceCountdown(deadlineMs);
  return (
    <span aria-hidden className="checkout-undo-leaf">
      {` — ${left}s`}
    </span>
  );
}

// W19 — surface colors moved to `.checkout-outline-btn` (a class so :hover/:active press states
// can exist — inline styles beat pseudo-classes); this keeps only layout.
const btn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  fontWeight: "var(--fw-heavy)",
  fontSize: "var(--fs-body)",
};
