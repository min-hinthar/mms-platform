"use client";
import { useState } from "react";
import type { CartItem } from "@mms/db";
import { Sheet } from "@mms/ui";
import { boundWrite } from "@/lib/bounded-write";
import { t } from "@/lib/i18n";

/**
 * Phase 3c-i (D17) — the dish's ⋯ sheet: where the line goes (For here / To go) and, for a to-go
 * line, "Send to kitchen now". The line itself is a receipt row again — the Stepper and the state
 * chip stay on the card; these two choices moved here so the Order stage reads as a bill you can
 * read, not a control panel.
 *
 * SUBJECT-KEYED by the parent (`useSheetSubject`, the KdsLineMenu idiom): `line` is the LIVE line, so
 * a refresh mid-open reaches it, and when the line stops being draft (Send-now landed, a tablemate's
 * send fired it) the parent closes the sheet and lands focus on the line's `data-line-name`. A
 * normal close returns focus to the ⋯ that opened it (the parent's `onCloseAutoFocus`).
 *
 * ONE selection vocabulary: the lit-gold `.checkout-pill-on` on the pressed pill; the ⋯ never lights.
 * Pills are `aria-disabled` under a freeze, never native — a peer can take the lock while a pill
 * holds focus, and a native disable would drop it to <body> mid-interaction (WCAG 2.4.3).
 *
 * GUARDED (M82, `lib/sheet-busy-callers.test.ts`): "Send to kitchen now" fires a line the kitchen
 * will cook — one-way for the guest who tapped it, so dismissing mid-write would hide how it ended.
 * `busy` is bounded STATE in the Phase 2h shape (set at the tap, cleared in the `finally` around
 * `await boundWrite(onMakeNow())`, outside any transition), never a transition's pending: the raw
 * action may stay out for as long as the network likes, and a modal that cannot be left is a
 * keyboard trap (WCAG 2.1.2). At the bound the sheet frees; the late answer lands through the
 * parent's own re-sync.
 *
 * ONE `role="status"` INSIDE the sheet: Radix hides the page's content (and its region) under an
 * open dialog, so the view's sentence — a refused toggle, a refused fire, the freeze banner — is
 * mirrored here, where a reader can hear it.
 */
export function LineOptionsSheet({
  line,
  open,
  frozen,
  prepMinutes,
  notice,
  onOpenChange,
  onChoose,
  onMakeNow,
  onCloseAutoFocus,
}: {
  /** The LIVE line (held through the exit by the parent's `useSheetSubject`). */
  line: CartItem;
  open: boolean;
  /** Checkout's `editsFrozen` — every write here refuses on bare `locked`. */
  frozen: boolean;
  /** S4.2 — the configured kitchen prep estimate; "usually" hedges it. */
  prepMinutes: number;
  /** The view's one sentence (`payError ?? status`), mirrored into this sheet's region. */
  notice: string | null;
  onOpenChange: (open: boolean) => void;
  /** A destination chosen — the parent closes the sheet and runs its optimistic toggle. */
  onChoose: (ful: "dinein" | "togo") => void;
  /** The raw fire, as the parent runs it (write → re-sync, or diagnosis). Awaited BOUNDED here. */
  onMakeNow: () => Promise<void>;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function sendNow() {
    if (busy || frozen) return;
    setBusy(true);
    try {
      // The RAW write, awaited bounded, outside any transition (9b). `waiting` at the bound frees
      // the sheet; the parent's re-sync applies the late answer either way.
      await boundWrite(onMakeNow());
    } finally {
      setBusy(false); // frees AT THE BOUND on every path — the M82 guard parses for it
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onCloseAutoFocus={onCloseAutoFocus}
      title={
        <>
          {line.name}
          {line.nameMy && (
            <span
              lang="my"
              style={{
                display: "block",
                fontFamily: "var(--font-my)",
                fontSize: "var(--fs-sm)",
                fontWeight: "var(--fw-semibold)",
                color: "var(--t2)",
              }}
            >
              {line.nameMy}
            </span>
          )}
        </>
      }
    >
      <div className="checkout-line-sheet">
        {/* For-here / To-go (S4): the server recomputes per-line tax (cold food flips taxability);
            the parent's toggle is optimistic (instant re-group), reconciled on refresh. */}
        <div role="group" aria-label={`Where ${line.name} goes`} className="checkout-pill-row">
          {(["dinein", "togo"] as const).map((f) => {
            const on = line.fulfillment === f;
            return (
              <button
                key={f}
                type="button"
                data-ful-line={line.id}
                data-ful-val={f}
                aria-pressed={on}
                aria-disabled={frozen || undefined}
                onClick={() => {
                  if (frozen || busy) return;
                  onChoose(f);
                }}
                className={`checkout-pill${on ? " checkout-pill-on" : ""}`}
                style={frozen ? { opacity: 0.55 } : undefined}
              >
                {f === "dinein" ? "For here" : "To go"}
              </button>
            );
          })}
        </div>
        {/* Make it now (S4.2): a to-go food line waits for checkout by default; this fires it to the
            kitchen early. NOT optimistic — a fire is one-way, so the sheet holds for the answer and
            the line's chip changes only when the server says so. */}
        {line.fulfillment === "togo" && (
          <button
            type="button"
            aria-disabled={frozen || undefined}
            aria-busy={busy || undefined}
            onClick={() => void sendNow()}
            className="checkout-pill checkout-pill-accent"
            style={{
              display: "flex",
              width: "100%",
              marginTop: 8,
              ...(frozen ? { opacity: 0.55 } : null),
            }}
          >
            {/* W19 — "Send" names what the tap really is (a per-line kitchen commit, same vocabulary
                as the batch CTA and the "Sent to kitchen" chip this line becomes); "usually" hedges
                the config estimate. While the write is out, the shipped "Sending…". */}
            {busy ? t("en", "sending") : `Send to kitchen now · usually ~${prepMinutes} min`}
          </button>
        )}
        {/* The sheet's ONE region — the view's sentence, where a reader can hear it. Plain text
            colour follows the sentence's kind on the page; here it stays quiet. */}
        <p
          role="status"
          aria-atomic="true"
          style={{
            minHeight: 16,
            margin: "10px 0 0",
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
          }}
        >
          {notice ?? ""}
        </p>
      </div>
    </Sheet>
  );
}
