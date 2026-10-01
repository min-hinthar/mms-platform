"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@mms/ui";
import { paneUrl } from "@/lib/floor-pane";
import {
  handoffCode,
  readerChip,
  readerChipAlert,
  readerChipLinked,
  readerNameText,
  type ReaderChip,
  type ReaderName,
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
 * while the order is recorded, "Payment didn't go through" when it was declined, and a counter
 * order's "Paid · #A1B2C3" when it landed with its table off screen — the card the cashier hands the
 * bag over by, which used to be lost with the detail. Rendered by `StaffBar` just before its offline
 * row; StaffBar stays hook-free (this is the client child).
 *
 *   · NOT a live region — the bar's `role="status"` is the offline row's, and a view keeps one. The
 *     two outcomes a person must not miss (declined; charged but not recorded for too long) are SAID
 *     once, through `role="alert"` — the bar tail's assertive precedent (the Lock refusal) — and only
 *     here: over its own table the chip is gone and the detail's region speaks.
 *   · "Once" is per outcome, not per mount: the provider remembers what was said
 *     (`alertSaid`), so the chip a navigation remounts on the next page shows the line, quietly.
 *   · The way in is `SplitAwareLink` — the table page on a phone, the counter's pane at split width,
 *     and the split's own opener when the pane is on THIS screen (a same-page hash push fires no
 *     `hashchange`). No link on the lock screen: the PIN comes first.
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
  return <ChipBody lang={lang} reader={reader} chip={chip} />;
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
  const phase = reader.poll.phase;
  const status = chip.kind === "collect" ? reader.status : null;

  // Said ONCE per outcome. The provider's `alertSaid` is the memory across pages; `speaking` keeps
  // THIS chip's alert node standing for its life (its role never flips off under the reader).
  const alertKey = readerChipAlert(chip, phase, reader.recordingLong);
  const said = reader.alertSaid;
  const markSaid = reader.markAlertSaid;
  const [speaking, setSpeaking] = useState<string | null>(null);
  useEffect(() => {
    if (alertKey === null || said === alertKey) return;
    // Scheduled — never a synchronous setState in the effect: the next render INSERTS the alert node
    // with its text (an alert born with its words is the one that is reliably spoken).
    const t = setTimeout(() => {
      markSaid(alertKey);
      setSpeaking(alertKey);
    }, 0);
    return () => clearTimeout(t);
  }, [alertKey, said, markSaid]);
  const alerting = alertKey !== null && speaking === alertKey;

  const warn = status?.tone === "warn" || (chip.kind === "collect" && phase === "failed");
  const paid = chip.kind === "landed" || phase === "recording";
  const dismissible = chip.kind === "landed" || phase === "failed" || phase === "canceled";

  const title =
    chip.kind === "landed" ? (
      <>
        <Chrome lang={lang} k="settle.reader.paid" echo="inline" />
        {" · "}
        <strong>{handoffCode(chip.orderId)}</strong>
      </>
    ) : phase === "collecting" || phase === "recording" ? (
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
  // escalation), the decline's reason, "nothing was charged". Waiting is the title's own news.
  const sub = status !== null && !(phase === "collecting" && status.tone === "ok") ? status : null;
  const text = (
    <>
      <span className="staff-reader-title">{title}</span>
      {sub && (
        <span className="staff-reader-sub">
          <MsgText lang={lang} msg={sub.msg} />
        </span>
      )}
    </>
  );

  return (
    // `role="group"`: a bare <div> is `generic`, which prohibits an author name (rule 3d).
    <div
      className="staff-reader mms-rise"
      role="group"
      aria-label={sx(lang, "settle.a11y.readerPanel")}
      data-tone={warn ? "warn" : paid ? "ok" : undefined}
    >
      <Icon name="card" size={18} />
      {/* Keyed, so the alert is a NEW node inserted with its words — never a role flipped onto the
          node already on screen (which several readers never speak). */}
      {alerting ? (
        <span key="alert" role="alert" className="staff-reader-text">
          {text}
        </span>
      ) : (
        <span key="quiet" className="staff-reader-text">
          {text}
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
          <button
            type="button"
            className="staff-circ staff-press"
            onClick={chip.kind === "landed" ? reader.dismissLanded : reader.dismiss}
          >
            <Icon name="close" size={18} />
            <span className="sr-only">
              <Chrome lang={lang} k="shell.close" />
            </span>
          </button>
        )}
      </span>
    </div>
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
