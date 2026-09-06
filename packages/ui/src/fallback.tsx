"use client";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Card } from "./card";
import { Icon } from "./icon";

/**
 * W10a — the fallback primitives: the ONE encoding of the failure/recovery patterns this repo
 * proved piecemeal (the grocery truth strip, GuestList's retry-survives-its-own-tap, the staff
 * boards' keep-last-known-snapshot banner), so new surfaces stop re-deriving them and drifting
 * (the W9b review caught two independent re-implementations in one diff).
 *
 * Three rules every piece here encodes:
 *  1. **Retry survives its own tap** — the button never unmounts or native-disables mid-flight
 *     (focus would drop to <body>); it swaps its label and turns `aria-disabled`.
 *  2. **Honest attribution** — copy never blames the diner's connection unless the caller proved
 *     `navigator.onLine === false` (thread `useConnectionTruth`'s verdict in via the copy props).
 *  3. **One live region per view** — DegradedStrip is `role="status"`; callers must not stack it
 *     with another live region announcing the same failure (QA §A).
 */

/** ≥44px retry pill that survives its own tap: label swap + aria-disabled, never unmount/disable. */
export function RetryButton({
  onRetry,
  label = "Try again",
  busyLabel = "Trying…",
  style,
}: {
  /** Must perform an IN-PLACE refetch — never `location.reload()` (reload-as-retry loses state). */
  onRetry: () => void | Promise<void>;
  /**
   * ReactNode, not string — P2, for the same reason `OutageState`'s copy props widened: a staff
   * surface passes `<Chrome>`, which carries its own `lang="my"` mark. A string cannot, and this is
   * the ONE control on the outage screen — the button a Burmese-first person taps to get their
   * shift back. The defaults keep every diner caller byte-identical.
   */
  label?: ReactNode;
  busyLabel?: ReactNode;
  style?: CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // double-tap guard that doesn't wait for the re-render
  return (
    <button
      type="button"
      aria-disabled={busy || undefined}
      onClick={async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
          await onRetry();
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      }}
      style={{ ...retryBtn, ...(busy ? { opacity: 0.7 } : null), ...style }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

/**
 * Inline degraded-service strip: the "what you see may be stale, here's Retry" pattern. Pairs with
 * kept-on-screen last-known content (never blank a list because a refresh failed). `role="status"`
 * (polite) — a strip that ships WITH a retry affordance must not interrupt as an alert.
 */
export function DegradedStrip({
  children,
  onRetry,
  retryLabel,
  live = true,
  style,
}: {
  /** The honest one-liner — attribution via `failureCopy`/connection truth, decided by the caller. */
  children: ReactNode;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  /** `true` (default) when the strip APPEARS dynamically — its arrival is the announcement
   *  (role="status"). Pass `false` when it is server-rendered into the initial view: nothing
   *  changes, so a live region would only risk the one-region-per-view rule (role="note"). */
  live?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div role={live ? "status" : "note"} style={{ ...strip, ...style }}>
      <Icon name="alert" size={15} style={{ flexShrink: 0, color: "var(--warn)" }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onRetry ? <RetryButton onRetry={onRetry} label={retryLabel ?? "Retry"} /> : null}
    </div>
  );
}

/**
 * Full-surface branded outage state — the 🫖 medallion card for "we can't reach the kitchen".
 * Bilingual by design (EN title + Padauk MY subtitle, the v7.2 bar: every state speaks both).
 * Focus lands on the heading when `focusOnMount` (§A: the view changed — announce it); escalation
 * copy after two failed retries so a sustained outage stops promising "a moment".
 */
export function OutageState({
  title = "We can’t reach the kitchen right now",
  titleMy = "ခဏလေး — မီးဖိုချောင်နှင့် ဆက်သွယ်၍မရသေးပါ",
  body = "It’s on us, not your connection. Nothing is lost — your order and table are safe.",
  escalatedBody = "Still down on our end — sorry. Your order and table are safe; please give it a few minutes, or ask our staff.",
  onRetry,
  retryLabel,
  retryBusyLabel,
  exit,
  focusOnMount = false,
  headingLevel = "h2",
}: {
  /**
   * ReactNode, not string — P2. A staff surface renders this through `<Chrome>`, which emits the
   * Burmese inside a `lang="my"` span and the English echo as a sibling. A plain string could not
   * carry that mark, and an UNMARKED Burmese heading is the exact defect the staff-locale guard's
   * rule 5 exists for: Padauk-less, tracked, and announced as English. The diner callers still pass
   * strings, which are ReactNodes too, so nothing about them changes.
   */
  title?: ReactNode;
  /** Burmese companion line (Padauk, `lang="my"`). Pass null to opt out on a staff-only surface. */
  titleMy?: string | null;
  body?: ReactNode;
  /** Shown once ≥2 retries have failed — stop promising "a moment" during a sustained outage. */
  escalatedBody?: ReactNode;
  onRetry?: () => void | Promise<void>;
  /**
   * The retry button's label and its busy twin. Defaulted in `RetryButton`, so a caller that says
   * nothing gets the English pair it always got — but a caller that renders the rest of this card
   * in Burmese MUST pass them, or the screen's only action stays English under a Burmese heading.
   * A blind audit found exactly that on the staff shell.
   */
  retryLabel?: ReactNode;
  retryBusyLabel?: ReactNode;
  /** Secondary way out (e.g. a home link) so the state is never a dead end. */
  exit?: ReactNode;
  focusOnMount?: boolean;
  headingLevel?: "h1" | "h2" | "h3";
}) {
  const [failedRetries, setFailedRetries] = useState(0);
  const didFocus = useRef(false);
  const H = headingLevel;
  return (
    <Card style={{ padding: "var(--s6)", textAlign: "center", maxWidth: 380, margin: "0 auto" }}>
      <p aria-hidden style={{ fontSize: 44, margin: 0, lineHeight: 1 }}>
        🫖
      </p>
      <H
        tabIndex={focusOnMount ? -1 : undefined}
        // Focus ONCE — an inline ref re-runs on every commit, and without the guard each retry
        // tap (setFailedRetries → re-render) yanked focus from the RetryButton back here,
        // breaking this component's own rule #1 (pre-PR review, confirmed in jsdom).
        ref={(el: HTMLHeadingElement | null) => {
          if (el && focusOnMount && !didFocus.current) {
            didFocus.current = true;
            el.focus();
          }
        }}
        style={outageTitle}
      >
        {title}
      </H>
      {titleMy ? (
        <p lang="my" style={outageMy}>
          {titleMy}
        </p>
      ) : null}
      <p style={outageBody}>{failedRetries >= 2 ? escalatedBody : body}</p>
      {onRetry ? (
        <RetryButton
          onRetry={async () => {
            try {
              await onRetry();
            } catch {
              /* deliberate: a failed retry only advances the escalation counter below */
            }
            setFailedRetries((n) => n + 1);
          }}
          {...(retryLabel === undefined ? null : { label: retryLabel })}
          {...(retryBusyLabel === undefined ? null : { busyLabel: retryBusyLabel })}
          style={{ minWidth: 160 }}
        />
      ) : null}
      {exit ? <div style={{ marginTop: "var(--s3)" }}>{exit}</div> : null}
    </Card>
  );
}

const retryBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
  font: "inherit",
};
const strip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  borderRadius: 12,
  background: "var(--warnb)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.45,
};
const outageTitle: CSSProperties = {
  fontSize: "var(--fs-h2)",
  lineHeight: "var(--lh-snug)",
  margin: "10px 0 2px",
  outline: "none",
};
const outageMy: CSSProperties = {
  fontFamily: "var(--font-my)",
  lineHeight: "var(--lh-my)",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  margin: "0 0 8px",
};
const outageBody: CSSProperties = {
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  lineHeight: "var(--lh-normal)",
  margin: "0 0 16px",
};
