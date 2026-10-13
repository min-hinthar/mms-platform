"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { Button, Icon, buttonClass } from "@mms/ui";
import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { t } from "@/lib/i18n";
import { endCardWords, type TableEnd } from "@/lib/session-truth";

/**
 * Session truth — the ONE card a table that ENDED shows, on the menu and on the Bill.
 *
 * A staff Clear, a Merge into another table, the 4-hour sweep and the table paying all end a
 * diner's order from somewhere else, and the first three reach the phone by no event at all. This
 * card is what the phone says once a failed read has been explained (`counterPayOutcome` →
 * `cartFate`, lib/session-truth): the cause in plain words and both tongues (`endCardWords` — the
 * paid arms are the Bill's own shipped close), and the way forward — "Track your order" for a paid
 * table whose order this seat may see, "Start a new order", and "Ask our staff" wherever the diner
 * may be at a table that is no longer theirs.
 *
 * It is NOT a live region: the provider says the title once through the view's one region when it
 * holds the table, and the Bill says it through its own. A persistent card, never a toast — the
 * fact does not expire. When it arrives while keyboard focus was orphaned (the Add the diner was on
 * goes inert under it), focus lands on its heading; otherwise it is left where the diner put it.
 * Motion is the kit's dynamic-mount rise, reduced-motion-escorted by the kit.
 *
 * Pure props — the menu's mount (`MenuTableEnded`) reads the cart provider in its own file, so the
 * Bill, which mounts no provider, never ships it.
 */
export function TableEndedCard({
  end,
  trackHref,
  start,
}: {
  end: TableEnd;
  /** The live tracker for a paid order this seat may see (`endTrackHref`), or null. */
  trackHref: string | null;
  /** "Start a new order": the menu re-mints in place (`startNewOrder`); the Bill links to the menu. */
  start:
    | { kind: "mint"; onStart: () => void; busy: boolean; failed: boolean }
    | { kind: "link"; href: string };
}) {
  const words = endCardWords(end);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus({ preventScroll: true });
  }, []);
  const startPrimary = trackHref === null;
  const startLabel = (
    <>
      {t("en", "startNewOrder")}
      <span lang="my" style={actionMy}>
        {t("my", "startNewOrder")}
      </span>
    </>
  );
  return (
    <section className="card card-textured mms-rise" style={card} aria-labelledby="table-ended-h">
      <p style={{ ...eyebrow, color: end.kind === "paid" ? "var(--ok)" : "var(--t2)" }}>
        <Icon name={end.kind === "paid" ? "check" : "receipt"} size={14} /> {words.eyebrow}
      </p>
      <h2 id="table-ended-h" ref={headingRef} tabIndex={-1} style={title}>
        {t("en", words.title)}
        <span lang="my" style={titleMy}>
          {t("my", words.title)}
        </span>
      </h2>
      {words.body && (
        <p style={body}>
          {t("en", words.body)}
          <span lang="my" style={bodyMy}>
            {t("my", words.body)}
          </span>
        </p>
      )}
      <div style={actions}>
        {trackHref && (
          <Link href={trackHref} className={buttonClass({ variant: "primary", block: true })}>
            {t("en", "trackYourOrder")}
            <span lang="my" style={actionMy}>
              {t("my", "trackYourOrder")}
            </span>
          </Link>
        )}
        {start.kind === "mint" ? (
          <Button
            variant={startPrimary ? "primary" : "secondary"}
            block
            busy={start.busy}
            busyLabel="Starting your new order…"
            onClick={start.onStart}
          >
            {startLabel}
          </Button>
        ) : (
          <Link
            href={start.href}
            className={buttonClass({
              variant: startPrimary ? "primary" : "secondary",
              block: true,
            })}
          >
            {startLabel}
          </Link>
        )}
      </div>
      {start.kind === "mint" && start.failed && !start.busy && (
        <p style={{ ...quiet, color: "var(--warn)" }}>Couldn’t start a new order — try again.</p>
      )}
      {words.staffLine && (
        <p style={quiet}>
          {t("en", "askOurStaff")}
          <span lang="my" style={bodyMy}>
            {t("my", "askOurStaff")}
          </span>
        </p>
      )}
    </section>
  );
}

const card: CSSProperties = { marginTop: 14, padding: "18px 18px 16px", display: "grid", gap: 8 };
const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  fontWeight: "var(--fw-bold)",
  letterSpacing: "var(--track-caps)",
  textTransform: "uppercase",
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const title: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h2)",
  fontWeight: "var(--fw-heavy)",
  lineHeight: 1.15,
  outline: "none",
};
const titleMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--t2)",
  marginTop: 4,
};
const body: CSSProperties = {
  margin: 0,
  color: "var(--t2)",
  fontSize: "var(--fs-body)",
  lineHeight: 1.5,
};
const bodyMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-sm)",
  marginTop: 2,
};
const actions: CSSProperties = { display: "grid", gap: 8, marginTop: 6 };
// The Burmese half of a button's label: a margin, never a whitespace node (DESIGN-LANGUAGE §6 — a
// flex container drops a whitespace-only child).
const actionMy: CSSProperties = {
  marginInlineStart: 8,
  fontFamily: "var(--font-my)",
  fontWeight: "var(--fw-semibold)",
};
const quiet: CSSProperties = {
  margin: 0,
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.45,
};
