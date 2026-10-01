"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@mms/ui";
import { paneUrl } from "@/lib/floor-pane";
import {
  readerChip,
  readerChipAlert,
  readerChipDismissible,
  readerChipLinked,
  readerChipShownAt,
  readerChipStatus,
  readerNameText,
  type ReaderChip,
  type ReaderName,
  type ReaderPhase,
  type ReaderStatus,
} from "@/lib/reader-collect";
import { sx } from "@/lib/staff-labels";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { MsgText } from "./StaffMsg";
import { SplitAwareLink } from "./SplitAwareLink";
import { useReaderCollectOptional, type ReaderCollectApi } from "./ReaderCollectContext";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Phase 2g · reader — the card reader's collect, in the staff bar of every page that is NOT showing
 * its table (`readerChip`): "On the reader · $42.10 · View Table 7" while it collects, "Paid · $42.10"
 * while the order is recorded (and, given up, the line that says not to take payment again),
 * "Payment didn't go through" when it was declined, and — once it LANDED with its table off screen —
 * a counter order's "Paid · #A1B2C3" (the card the cashier hands the bag over by, which used to be
 * lost with the detail) or a table's "Paid · $42.10". Landings queue; the chip shows the oldest.
 * Rendered by `StaffBar` just before its offline row; StaffBar stays hook-free (this is the client
 * child).
 *
 *   · The visible row is NEVER a live region — the bar's `role="status"` is the offline row's, and a
 *     view keeps one. The outcomes a person must not miss off their table (a decline, a charge slow to
 *     record or given up, a landing) are SAID once, through a SEPARATE sr-only `role="alert"` node —
 *     the bar tail's assertive precedent (the Lock refusal) — whose words are echo-free (a bilingual
 *     announcement says everything twice) and name the table; the visible row is hidden from the
 *     ear while it stands, so a browse-mode pass never reads it twice.
 *   · "Once" is per outcome, not per mount: the provider remembers what was said (`alertSaid`, which
 *     the table's own panel also writes — A11Y-6), so the chip a navigation remounts on the next page
 *     shows the line, quietly. And only where it can be HEARD: under a modal Sheet the bar is
 *     `aria-hidden` (Radix's `hideOthers`), so the alert waits for the Sheet to close (A11Y-1).
 *   · The way in is `SplitAwareLink` — the table page on a phone, the counter's pane at split width,
 *     and the split's own opener when the pane is on THIS screen (a same-page hash push fires no
 *     `hashchange`). No link on the lock screen: the PIN comes first.
 *   · The ✕ is named by its act and subject ("Dismiss — Table 7"), and hands focus to the bar's title
 *     before the chip leaves (A11Y-2 — never <body>).
 *   · Every control 44px (the bar's units: the Back pill, the circle); tokens only; the entrance is
 *     the kit's `.mms-rise` (RM-gated there).
 *   · check-staff-lang rule 4a: this module reaches no language control — the bar never carries one.
 */
export function ReaderCollectChip({ lang }: { lang: StaffLang }) {
  // The tolerant read: a bar a test mounts bare has no provider, and no collect can exist without
  // one (the reader's own controls use the throwing hook).
  const reader = useReaderCollectOptional();
  const chip =
    reader === null
      ? null
      : readerChip({ collect: reader.record, landed: reader.landed, shown: reader.shown });
  if (reader === null || chip === null) return null;
  return <ChipOnRoute lang={lang} reader={reader} chip={chip} />;
}

/** Never on the signed-out sign-in screen — no table, amount or code before a sign-in (Codex r1 on
 *  #309). Its own component so the route read stays unconditional (rules of hooks) and a bar mounted
 *  with no collect reads no route at all. */
function ChipOnRoute(p: { lang: StaffLang; reader: ReaderCollectApi; chip: ReaderChip }) {
  const pathname = usePathname();
  if (!readerChipShownAt(pathname)) return null;
  return <ChipBody {...p} />;
}

/** True while `el` can be heard: not inside a subtree a modal hid from assistive tech. */
const exposed = (el: HTMLElement | null) =>
  el !== null && el.closest('[aria-hidden="true"]') === null;

/** A11Y-2 — the ✕ unmounts with the chip: focus goes to the bar's own title first (StaffBar stays
 *  hook-free, so the chip reaches its enclosing header's h1, making it programmatically focusable). */
function focusBarTitle(from: HTMLElement | null) {
  const h = from?.closest("header")?.querySelector<HTMLElement>("h1") ?? null;
  if (h === null) return;
  if (!h.hasAttribute("tabindex")) h.tabIndex = -1;
  h.focus({ preventScroll: true });
}

function ChipBody({
  lang,
  reader,
  chip,
}: {
  lang: StaffLang;
  reader: ReaderCollectApi;
  chip: ReaderChip;
}) {
  const pathname = usePathname();
  const linked = readerChipLinked(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const phase = reader.poll.phase;
  const status =
    chip.kind === "collect" && reader.status !== null ? readerChipStatus(reader.status) : null;

  // Said ONCE per outcome. The provider's `alertSaid` is the memory across pages; `speaking` keeps
  // THIS chip's alert node standing for its life (it never flips off under the reader).
  const alertKey = readerChipAlert(chip, phase, reader.recordingLong);
  const said = reader.alertSaid;
  const markSaid = reader.markAlertSaid;
  const [speaking, setSpeaking] = useState<string | null>(null);
  useEffect(() => {
    if (alertKey === null || said.has(alertKey)) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    // Scheduled — never a synchronous setState in the effect: the next render INSERTS the alert node
    // with its words (an alert born with its words is the one that is reliably spoken).
    const say = () => {
      t = setTimeout(() => {
        markSaid(alertKey);
        setSpeaking(alertKey);
      }, 0);
    };
    if (exposed(rootRef.current)) {
      say();
      return () => clearTimeout(t);
    }
    // A11Y-1 — inside an aria-hidden subtree (a modal Sheet is open) an alert is inserted unheard and
    // never re-said when the Sheet closes: the key stays PENDING, and is said the moment the bar is
    // exposed again.
    const mo = new MutationObserver(() => {
      if (!exposed(rootRef.current)) return;
      mo.disconnect();
      say();
    });
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-hidden"],
      subtree: true,
    });
    return () => {
      mo.disconnect();
      clearTimeout(t);
    };
  }, [alertKey, said, markSaid]);
  const alerting = alertKey !== null && speaking === alertKey;

  const warn = status?.tone === "warn" || (chip.kind === "collect" && phase === "failed");
  const paid = chip.kind === "landed" || phase === "recording";
  const dismissible = readerChipDismissible(chip, phase);

  const title =
    chip.kind === "landed" ? (
      <>
        <Chrome lang={lang} k="settle.reader.paid" echo="inline" />
        {" · "}
        <strong>{chip.code ?? fmt(chip.totalCents)}</strong>
      </>
    ) : phase === "collecting" || phase === "recording" || phase === "unrecorded" ? (
      <>
        <Chrome
          lang={lang}
          k={phase === "collecting" ? "settle.reader.onReader" : "settle.reader.paid"}
          echo="inline"
        />
        {" · "}
        <strong>{fmt(chip.totalCents)}</strong>
      </>
    ) : phase === "failed" ? (
      <Chrome lang={lang} k="settle.reader.failedTitle" echo="inline" />
    ) : (
      <Chrome lang={lang} k="settle.reader.canceledTitle" echo="inline" />
    );
  // The status line, when it says more than the title: a blind poll, the recording (and its
  // escalation), a charge given up, the decline's reason, "nothing was charged". Waiting is the
  // title's own news.
  const sub = status !== null && !(phase === "collecting" && status.tone === "ok") ? status : null;

  const onDismiss = () => {
    focusBarTitle(rootRef.current);
    if (chip.kind === "landed") reader.dismissLanded(chip.sessionId);
    else reader.dismiss();
  };

  return (
    // `role="group"`: a bare <div> is `generic`, which prohibits an author name (rule 3d).
    <div
      ref={rootRef}
      className="staff-reader mms-rise"
      role="group"
      aria-label={sx(lang, "settle.a11y.readerPanel")}
      data-tone={warn ? "warn" : paid ? "ok" : undefined}
    >
      <Icon name="card" size={18} />
      {/* SHOWN, never live; hidden from the ear only while the alert below says the same thing. */}
      <span className="staff-reader-text" aria-hidden={alerting || undefined}>
        <span className="staff-reader-title">{title}</span>
        {sub && (
          <span className="staff-reader-sub">
            <MsgText lang={lang} msg={sub.msg} />
          </span>
        )}
      </span>
      {/* Keyed by the outcome, so each alert is a NEW node inserted with its words — never a role
          flipped onto a node already on screen (which several readers never speak). */}
      {alerting && (
        <span key={alertKey} role="alert" className="sr-only">
          <ChipSpoken lang={lang} chip={chip} phase={phase} sub={sub} />
        </span>
      )}
      <span className="staff-reader-acts">
        {linked ? (
          <SplitAwareLink
            href={`/staff/table/${chip.sessionId}`}
            paneHref={paneUrl(chip.sessionId)}
            className="staff-back staff-press"
            onPane={() => reader.openInPane(chip.sessionId, chip.name)}
          >
            <TableView lang={lang} name={chip.name} />
          </SplitAwareLink>
        ) : (
          <span className="staff-reader-name">
            <TableName lang={lang} name={chip.name} />
          </span>
        )}
        {dismissible && (
          <button type="button" className="staff-circ staff-press" onClick={onDismiss}>
            <Icon name="close" size={18} />
            <span className="sr-only">
              <Chrome
                lang={lang}
                k="settle.reader.chip.dismiss"
                vars={{ x: readerNameText(lang, chip.name) }}
              />
            </span>
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The alert's words — echo-free (`<Chrome>` with no echo: the live-region rule) and naming the table,
 * which sits outside the alert in the visible row: "Payment didn't go through · Table 7 · The card
 * was declined.", "Paid · #A1B2C3 · Counter order", "Paid · $42.10 · Table 7 · The guest has paid…".
 */
function ChipSpoken({
  lang,
  chip,
  phase,
  sub,
}: {
  lang: StaffLang;
  chip: ReaderChip;
  phase: ReaderPhase;
  sub: ReaderStatus | null;
}) {
  const failed = chip.kind === "collect" && phase === "failed";
  return (
    <>
      <Chrome lang={lang} k={failed ? "settle.reader.failedTitle" : "settle.reader.paid"} />
      {!failed && (
        <>
          {" · "}
          {chip.kind === "landed" ? (chip.code ?? fmt(chip.totalCents)) : fmt(chip.totalCents)}
        </>
      )}
      {" · "}
      <TableName lang={lang} name={chip.name} />
      {sub && (
        <>
          {" · "}
          <MsgText lang={lang} msg={sub.msg} />
        </>
      )}
    </>
  );
}

/** "View Table 7" / "View Counter order" — the link's whole name (a link list reads it alone). */
function TableView({ lang, name }: { lang: StaffLang; name: ReaderName }) {
  return <Chrome lang={lang} k="floor.pane.open" vars={{ x: readerNameText(lang, name) }} />;
}

function TableName({ lang, name }: { lang: StaffLang; name: ReaderName }) {
  return name.counter ? (
    <Chrome lang={lang} k="floor.counter" />
  ) : (
    <Chrome lang={lang} k="floor.table" vars={{ id: name.display }} />
  );
}
