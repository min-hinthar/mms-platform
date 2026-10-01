"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { clearTable } from "@/lib/floor";
import { boundWrite } from "@/lib/bounded-write";
import { dropHandoffStash } from "@/lib/floor-pane";
import { useTableNav } from "./TableNav";
import { tf } from "@/lib/i18n/fill";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

/**
 * Clear a table on turnover (S1.2). Two-step confirm (no accidental clear), and DISABLED with an honest
 * reason while a payment is in flight — the server refuses it regardless (the button gating is just the
 * affordance). On success the session is closed; we leave the now-defunct detail page for the floor.
 *
 * Phase 2h (P2fc) — the clear is awaited with a BOUND (`boundWrite`): a hung action used to leave
 * "Clearing…" up with Cancel natively disabled until a reload. Busy is state cleared in a `finally`,
 * every control is `aria-disabled` (never native), and the outcome is said honestly: a lost answer
 * "couldn't confirm" (the table may already be cleared), a slow one "no answer yet — don't clear it
 * again" with the reload beside it; the late answer still lands (a late clear leaves the table).
 * Until it does, "Clear table" is HELD (S2 critic D3): a second clear would only queue behind the
 * stuck one, so the guard stays spent and the trigger says why, described by the waiting line.
 */
export function ClearTableButton({
  sessionId,
  label,
  paymentInFlight,
}: {
  sessionId: string;
  label: string;
  paymentInFlight: boolean;
}) {
  const lang = useStaffLang();
  // Phase 2d · split — the exit is the page's or the pane's (`TableNav`), bound once.
  const nav = useTableNav();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 2f — a counter order whose food reached the kitchen unpaid is refused by code (`sent`):
  // the page's own sentence, which names the way out ("They didn't come"), not the server's English.
  const [sentRefused, setSentRefused] = useState(false);
  // Phase 2h — the clear's own outcome when no answer came: `unknown` (it threw — the answer was
  // lost) or `waiting` (still out at the bound). Kept apart from the server's sentence (`error`).
  const [unanswered, setUnanswered] = useState<"waiting" | "unknown" | null>(null);
  // The tap-time guard — a REF read when the finger lands (two taps in one frame both read the same
  // render), beside the `busy` the buttons say.
  const inFlight = useRef(false);
  // Whether this control is still mounted when a LATE answer lands. Re-armed at setup (Strict Mode).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const midPaymentId = useId();
  const alertId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Keep focus with the flow (S1-audit S6): into the confirm group when it opens, back to the trigger
  // when it closes — never dropped to <body> as the step unmounts. The `wasConfirming` guard avoids
  // grabbing focus on first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  /** The clear's answer, whenever it lands — at once, or after the bound (9e: never dropped). */
  function land(res: Awaited<ReturnType<typeof clearTable>>) {
    if (!res.ok) {
      setConfirming(false);
      setUnanswered(null);
      setError(res.error);
      setSentRefused(res.code === "sent");
      return;
    }
    // Session closed — return to the floor (this detail is now defunct). Phase 2a · tablet: the
    // floor BY NAME — a bare `/staff` resolves by the door cookie and could land on the doors.
    // Phase 2d · split: through `TableNav` — the page replaces to the floor; the pane closes. The
    // table's paid card leaves with it (a cleared table has no card to follow).
    dropHandoffStash(sessionId);
    nav.toFloor("cleared");
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSentRefused(false);
    setUnanswered(null);
    let left = false;
    // Still out at the bound: the guard stays spent until the late answer lands (docblock, D3).
    let outstanding = false;
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(clearTable({ sessionId }));
      if (out.kind === "answer") {
        left = out.value.ok; // a cleared table is leaving: stay busy until the swap
        land(out.value);
        return;
      }
      setConfirming(false); // the effect returns focus to the trigger, beside the line
      if (out.kind === "threw") {
        console.error("[ClearTableButton] clear unconfirmed", out.error);
        setUnanswered("unknown");
        return;
      }
      setUnanswered("waiting");
      outstanding = true;
      void out.late.then((late) => {
        // A detail that is gone has nothing to leave or say; a late clear is seen on the floor.
        if (!alive.current) return;
        // The answer is in: a refusal or a lost answer frees the guard; a clear leaves the table.
        if (late.kind !== "answer" || !late.value.ok) inFlight.current = false;
        if (late.kind === "answer") land(late.value);
        else setUnanswered("unknown");
      });
    } finally {
      // Busy frees AT THE BOUND (fact 3) — unless the table is leaving under this control; the
      // guard stays spent while the answer is still out (`outstanding`).
      if (!left) {
        if (!outstanding) inFlight.current = false;
        setBusy(false);
      }
    }
  }

  const waiting = unanswered === "waiting";

  if (paymentInFlight) {
    return (
      <div>
        {/* Phase 2h — `aria-disabled`, never native: a native disable drops a focused control's
            focus to <body> as the payment starts under it, and hides the reason from a screen
            reader. The note says why (its description); a tap does nothing. */}
        <button
          type="button"
          aria-disabled
          aria-describedby={midPaymentId}
          style={{ ...clearBtn, opacity: 0.5, cursor: "not-allowed" }}
        >
          <Chrome lang={lang} k="settle.clear.btn" echo="stack" />
        </button>
        <p id={midPaymentId} style={hint}>
          <Chrome lang={lang} k="settle.clear.midPayment" echo="stack" />
        </p>
      </div>
    );
  }

  return (
    <div>
      {confirming ? (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={tf(lang, "settle.a11y.confirmClear", { id: label })}
          style={{ ...confirmRow, outline: "none" }}
        >
          <span style={{ fontSize: "var(--fs-sm)" }}>
            {/* Inline echo, not stacked: this row is a flex line with the two buttons beside it,
                and a stacked pair would push its height. */}
            <Chrome lang={lang} k="settle.clear.question" vars={{ id: label }} echo="inline" />
          </span>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            {/* aria-disabled + the handlers' guards (§17, K35) — never native `disabled`, which drops
                focus to <body> under the tap; busy frees at the bound, so neither is stranded. */}
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setConfirming(false);
              }}
              aria-disabled={busy || undefined}
              style={cancelBtn}
            >
              <Chrome lang={lang} k="settle.cancel" echo={false} />
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              style={clearBtn}
            >
              {busy ? (
                <Chrome lang={lang} k="settle.clear.clearing" echo={false} />
              ) : (
                <Chrome lang={lang} k="settle.confirm" echo="stack" />
              )}
            </button>
          </div>
        </div>
      ) : (
        // Held while this clear is still unanswered (aria-disabled + the handler's guard, never
        // native), and described by the waiting line that says why.
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (inFlight.current) return;
            setConfirming(true);
          }}
          aria-disabled={waiting || undefined}
          aria-describedby={waiting ? alertId : undefined}
          style={waiting ? { ...clearBtn, opacity: 0.5, cursor: "not-allowed" } : clearBtn}
        >
          <Chrome lang={lang} k="settle.clear.btn" echo="stack" />
        </button>
      )}
      {/* Assertive alert (not a polite live region) so the detail view keeps ONE polite region — its
          shared line-edit status; parity with CashSettle/Merge (S1-audit S5). */}
      {(error || unanswered) && (
        <p id={alertId} role="alert" style={{ ...hint, color: "var(--warn)" }}>
          {unanswered === "waiting" ? (
            <Chrome lang={lang} k="settle.clear.waiting" echo={false} />
          ) : unanswered === "unknown" ? (
            <Chrome lang={lang} k="settle.clear.unknown" echo={false} />
          ) : sentRefused ? (
            <Chrome lang={lang} k="settle.clear.counterSent" echo="stack" />
          ) : (
            <OutageText lang={lang} error={error ?? ""} />
          )}
        </p>
      )}
      {/* Phase 2h — the waiting line says "reload the page", and the console is installed standalone
          (no browser reload): the one way out sits BESIDE the alert, never inside it. */}
      {waiting && (
        <div style={{ marginTop: "var(--s2)" }}>
          <ReloadButton lang={lang} />
        </div>
      )}
    </div>
  );
}

const clearBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  cursor: "pointer",
};
const confirmRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
};
const hint: CSSProperties = { margin: "8px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" };
