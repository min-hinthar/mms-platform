"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { resolveRefundNeeded, type RefundNeeded } from "@/lib/approvals";
import type { StaffLang } from "@/lib/staff-lang";
import { al, sx } from "@/lib/staff-labels";
import { ts } from "@/lib/i18n/staff";
import { plural, tf } from "@/lib/i18n/fill";
import { Chrome } from "./Chrome";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * A4·3 — the refunds-needed strip (W11 / M43), moved from `/staff/approvals` onto the counter's one
 * screen as the first of the manager rails. Every row is a charge (or a hold we knowingly
 * abandoned) that no order accounts for; the manager refunds it in the processor's dashboard and
 * marks it done here. Renders nothing when the ledger is empty; an UNREADABLE ledger says so —
 * an empty strip must MEAN empty. A client component since Codex round 2 on #283: its rows ride
 * the approvals poll (`ApprovalsBoard`), because a server-rendered strip never re-read the ledger
 * and a tablet left on the one screen hid a stranded charge the webhook wrote after load. The
 * resolve is the exported server action; the row leaves the strip only once the server confirmed.
 *
 * manager-3 — "Mark refunded" is TWO taps now (the ClearTableButton shape): the first opens an
 * inline confirm group naming the amount and the processor, the second commits. It was one tap
 * with no confirm, no undo and no busy state — a mis-tap hid a stranded charge from the console,
 * and a double-tap submitted twice — on the one surface where every other destructive control is
 * two-step or PIN-gated. Focus moves into the group when it opens and back to the trigger when it
 * closes; the commit is `aria-disabled` + `aria-busy` while in flight (§17), never native.
 */
export function RefundsNeededStrip({
  lang,
  refunds,
  stale = false,
  onResolved,
}: {
  lang: StaffLang;
  /** null — the ledger could not be read (the page's read rejected, and no poll has since). */
  refunds: RefundNeeded[] | null;
  /** The ledger loaded once but the latest poll could not read it: the rows below are the last
   *  good ones and new stranded charges may be missing — said, never an all-clear (Codex round 3
   *  on #283). */
  stale?: boolean;
  /** The server confirmed the row resolved: drop it and re-poll. */
  onResolved?: (id: string) => void;
}) {
  // The row whose resolve the server refused — caught HERE (Codex round 4 on #283, P1): uncaught,
  // the action's rejection reached the route's error boundary and replaced the whole counter
  // screen with it. The row stays (nothing was recorded) and the line says try again; the region
  // exists only after the person's own tap failed, so it never announces on load.
  const [failedId, setFailedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Which row is marking — `pending` is the strip's one flag (one mark at a time), this names it.
  const [markingId, setMarkingId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // The group that is OPEN is derived from the live rows, never the raw id: the poll (or the other
  // tablet) can drop the row whose group is open, and a stale id would keep the next open from
  // ever taking focus. A landed mark leaves the same way — the row goes, the group goes with it.
  const confirming =
    confirmingId !== null && refunds !== null && refunds.some((r) => r.id === confirmingId)
      ? confirmingId
      : null;
  // Focus follows the flow: into the group as it opens — including straight from ANOTHER row's
  // group (the blind pass's interleaving) — and, as it closes, back to that row's trigger; when the
  // row itself has gone (marked here, or by the poll), to the strip, or to the zone's heading once
  // the strip has no rows left. Edge-triggered on the PREVIOUS id, so a first mount never grabs.
  const wasConfirming = useRef<string | null>(null);
  useEffect(() => {
    const prev = wasConfirming.current;
    wasConfirming.current = confirming;
    if (confirming !== null && prev !== confirming) {
      document.getElementById(`refund-confirm-${confirming}`)?.focus();
    } else if (confirming === null && prev !== null) {
      const landing =
        document.getElementById(`refund-mark-${prev}`) ??
        sectionRef.current ??
        document.getElementById("appr-h");
      landing?.focus({ preventScroll: true });
    }
  }, [confirming]);

  function openConfirm(id: string) {
    if (pending) return;
    setFailedId(null);
    setConfirmingId(id);
  }
  function cancel() {
    if (pending) return;
    setConfirmingId(null);
  }
  function confirm(id: string) {
    if (pending) return;
    setMarkingId(id);
    setFailedId(null);
    startTransition(async () => {
      try {
        // The server action throws on an unreadable table — the row then stays, honestly.
        await resolveRefundNeeded(id);
        // Both land in one batch (React batches every update in a continuation): the row leaves
        // with the group inside it, and the focus effect above lands on the strip or the heading.
        setConfirmingId(null);
        onResolved?.(id);
      } catch (e) {
        console.error("[RefundsNeededStrip] resolve failed — the row stays", e);
        setFailedId(id);
        setConfirmingId(null); // the effect returns focus to the trigger, beside the line
      } finally {
        setMarkingId(null);
      }
    });
  }

  if (refunds === null)
    return (
      <p style={outageText}>
        <Chrome lang={lang} k="table.appr.refunds.outage" echo="stack" />
      </p>
    );
  const staleLine = stale ? (
    <p style={outageText}>
      <Chrome lang={lang} k="table.appr.refunds.stale" echo="stack" />
    </p>
  ) : null;
  if (refunds.length === 0) return staleLine;
  const processor = ts(lang, "table.appr.stripe");
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={sx(lang, "table.appr.a11y.refunds")}
      style={{ ...refundsStrip, outline: "none" }}
    >
      {staleLine}
      <p style={refundsHead}>
        <strong>
          <Chrome
            lang={lang}
            k={plural(refunds.length, "table.appr.refunds.one", "table.appr.refunds.many")}
            vars={{ n: refunds.length }}
            echo="inline"
          />
        </strong>{" "}
        <Chrome lang={lang} k="table.appr.refundsHint" vars={{ x: processor }} echo="stack" />
      </p>
      <ul role="list" aria-label={sx(lang, "table.appr.a11y.refundsList")} style={refundsList}>
        {refunds.map((r) => {
          const marking = pending && markingId === r.id;
          return (
            <li key={r.id} style={refundsRow}>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--fw-bold)" }}>
                {r.amountCents != null ? (
                  fmt(r.amountCents)
                ) : (
                  <Chrome lang={lang} k="table.appr.amountUnknown" />
                )}
              </span>{" "}
              {/* ⚠️ `r.reason` is the RAW `qr_refunds_needed.reason` column with its underscores
                  swapped for spaces — a database status key printed to a manager, which is the
                  OPEN-ITEMS P2g shape (a raw key where a label belongs). It is NOT localized here
                  on purpose: guessing a Burmese word per undeclared code would invent a label,
                  and the fix is a `what.*`-style key map over the column's real domain. Filed. */}
              · {r.reason.replaceAll("_", " ")} ·{" "}
              <code style={{ fontSize: "var(--fs-xs)", overflowWrap: "anywhere" }}>
                {r.paymentIntent}
              </code>
              {confirming === r.id ? (
                <div
                  id={`refund-confirm-${r.id}`}
                  tabIndex={-1}
                  role="group"
                  aria-label={tf(lang, "table.appr.a11y.confirmRefunded", { x: r.paymentIntent })}
                  style={{ ...confirmRow, outline: "none" }}
                >
                  <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)" }}>
                    {/* Inline echo, not stacked: a flex line with the two buttons beside it. */}
                    {r.amountCents != null ? (
                      <Chrome
                        lang={lang}
                        k="table.appr.confirmRefunded.q"
                        vars={{ m: fmt(r.amountCents), x: processor }}
                        echo="inline"
                      />
                    ) : (
                      <Chrome
                        lang={lang}
                        k="table.appr.confirmRefunded.qUnknown"
                        vars={{ x: processor }}
                        echo="inline"
                      />
                    )}
                  </span>
                  <div style={{ display: "flex", gap: "var(--s3)" }}>
                    <button
                      type="button"
                      className="staff-btn"
                      onClick={cancel}
                      aria-disabled={pending || undefined}
                      style={cancelBtn}
                    >
                      <Chrome lang={lang} k="settle.cancel" echo={false} />
                    </button>
                    {/* No aria-label, deliberately: the label SWAPS to "Marking…" mid-commit, and
                        a fixed name would then no longer contain the visible text. The group's
                        name carries the payment intent; the label alone is the honest name. */}
                    <button
                      type="button"
                      className="staff-btn"
                      onClick={() => confirm(r.id)}
                      aria-disabled={pending || undefined}
                      aria-busy={marking || undefined}
                      style={resolveBtn}
                    >
                      {marking ? (
                        <Chrome lang={lang} k="table.appr.marking" echo={false} />
                      ) : (
                        <Chrome lang={lang} k="table.appr.verb.markRefunded.confirm" echo="stack" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Every row shows the same two words, so the visible label alone names nothing —
                   the name carries the payment intent, which is what the manager matches against
                   the processor. `al()` takes the same `echo` this button renders and composes
                   through `chromeVisible()`, so under `my` the name contains both visible strings
                   (WCAG 2.5.3); rule 3c compares the two echoes. */
                <button
                  id={`refund-mark-${r.id}`}
                  type="button"
                  className="staff-btn"
                  onClick={() => openConfirm(r.id)}
                  aria-disabled={pending || undefined}
                  style={{ ...resolveBtn, marginLeft: "var(--s2)" }}
                  aria-label={
                    al(lang, {
                      kind: "verb",
                      echo: "stack",
                      verb: "table.appr.verb.markRefunded",
                      subject: r.paymentIntent,
                    }).aria
                  }
                >
                  <Chrome lang={lang} k="table.appr.verb.markRefunded" echo="stack" />
                </button>
              )}
              {failedId === r.id && (
                <span role="status" style={failText}>
                  <Chrome lang={lang} k="table.appr.msg.failed" echo="stack" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const refundsStrip: CSSProperties = {
  // The staff boards' existing warn pair — theme-aware, per the tokens-never-hex rule.
  border: "1px solid var(--warn)",
  borderRadius: 12,
  padding: "var(--s3) var(--s4)",
  marginTop: "var(--s6)",
  background: "var(--warnb)",
};
const outageText: CSSProperties = {
  margin: "var(--s6) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
const resolveBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: 10,
  border: "1px solid var(--warn)",
  background: "transparent",
  color: "var(--warn)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontWeight: "var(--fw-semibold)",
  cursor: "pointer",
};
const confirmRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  flexWrap: "wrap",
  marginTop: "var(--s2)",
};
const refundsHead: CSSProperties = { margin: 0, marginBottom: 8 };
const refundsList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 6,
};
const refundsRow: CSSProperties = { fontSize: "var(--fs-sm)" };
const failText: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
