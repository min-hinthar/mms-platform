"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button, EmptyState, Icon, Skeleton } from "@mms/ui";
import { getTableDetail } from "@/lib/floor";
import { type TableDetail, tableDisplay } from "@/lib/floor-types";
import { raceTimeout } from "@/lib/staff-outage";
import {
  PANE_QUERY,
  acceptPaneRead,
  liveTwinOf,
  paneEscapeCloses,
  paneFailKeys,
  readHandoffStash,
} from "@/lib/floor-pane";
import { tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { FloorDetailLive } from "./FloorDetailLive";
import { HandoffCard } from "./HandoffCard";
import { TableDetailSkeleton } from "./TableDetailSkeleton";
import { TableNavProvider, type TableHint } from "./TableNav";
import type { CloseReason, PaneRow } from "./TablePaneContext";
import type { Handoff } from "@/lib/register-ui";

/**
 * Phase 2d · split — the selected table, beside the floor. States:
 *
 *   unknown  SSR + the hydration frame: the divider only (≥64em), `aria-busy`, no copy.
 *   empty    nothing picked (shown ≥64em by CSS): "Pick a table" — no button, the card is the act.
 *   loading  the head names the tapped card at once; the body is the table skeleton.
 *   detail   `FloorDetailLive variant="pane"`, keyed per selection.
 *   closed   the head keeps its name and ✕; the notice, the live namesake's "View", and the table's
 *            paid card (if its stash stands) above it.
 *   failure  the first read failed, said by CAUSE (`paneFailKeys` — never paper), with a retry and a
 *            quiet retry every 5 s.
 *
 * Live regions: while a detail is mounted its ONE polite region speaks (and carries a lost write for
 * another table); otherwise this pane's single sr-only `role=status` does. Never two at once.
 */
type Read =
  | { id: string; kind: "loading" }
  | { id: string; kind: "detail"; detail: TableDetail }
  | { id: string; kind: "closed"; label: string | null; counter: boolean }
  | { id: string; kind: "fail"; cause: "outage" | "unknown" };

const RETRY_MS = 5000; // parity with the page's 5 s poll (owner decision: pane poll cadence)

export function TablePane({
  paneRef,
  hydrated,
  sel,
  selectedNow,
  rows,
  lostWrite,
  settleOnce,
  onSettleConsumed,
  terminalReady,
  onClose,
  onSelect,
  onLostWrite,
}: {
  paneRef: RefObject<HTMLElement | null>;
  hydrated: boolean;
  sel: { id: string; hint: TableHint | null; focus: number } | null;
  /** The selection NOW (a ref read) — a read resolving late is gated on it, never on a closure. */
  selectedNow: () => string | null;
  rows: readonly PaneRow[];
  lostWrite: { sessionId: string; hint: TableHint } | null;
  settleOnce: string | null;
  onSettleConsumed: () => void;
  terminalReady: boolean;
  onClose: (reason: CloseReason) => void;
  onSelect: (id: string, hint: TableHint) => void;
  onLostWrite: (sessionId: string, hint: TableHint) => void;
}) {
  const lang = useStaffLang();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const id = sel?.id ?? null;
  // A read belongs to ONE selection: anything else in state is a previous table's.
  const cur: Read | null = id === null ? null : read?.id === id ? read : { id, kind: "loading" };

  // The first read, per selection (and per retry). Gated by `acceptPaneRead` at landing.
  useEffect(() => {
    if (id === null) return;
    let live = true;
    raceTimeout(getTableDetail(id))
      .then((res) => {
        if (!live || !acceptPaneRead(id, selectedNow())) return;
        if (res.kind === "detail") setRead({ id, kind: "detail", detail: res.detail });
        else if (res.kind === "closed")
          setRead({ id, kind: "closed", label: null, counter: false });
        else if (res.kind === "signin") window.location.assign("/staff/login");
        else setRead({ id, kind: "fail", cause: "outage" });
      })
      .catch((e: unknown) => {
        // A timeout or a dropped transport: this end failed, which is not evidence of an outage.
        console.error("[TablePane] first read failed", e);
        if (live && acceptPaneRead(id, selectedNow()))
          setRead({ id, kind: "fail", cause: "unknown" });
      })
      .finally(() => {
        if (live) setRetrying(false);
      });
    return () => {
      live = false;
    };
  }, [id, attempt, selectedNow]);

  // The quiet retry while a first read stands failed.
  const failed = cur?.kind === "fail";
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearTimeout(t);
  }, [failed, attempt]);

  // Focus the heading ONCE per selection that asked for it (a tap, a merge, Forward, a deep link):
  // it renders from the hint, so focus never moves again when the detail arrives. The pane's own
  // scroll resets to its top; nothing else jumps (preventScroll at split width).
  const focusNonce = sel?.focus ?? 0;
  useEffect(() => {
    if (focusNonce === 0) return;
    if (paneRef.current) paneRef.current.scrollTop = 0;
    const split = typeof window.matchMedia === "function" && window.matchMedia(PANE_QUERY).matches;
    headingRef.current?.focus({ preventScroll: split });
  }, [focusNonce, paneRef]);

  // Closed while shown: the notice's title takes focus only if focus was inside the pane.
  const closedNow = cur?.kind === "closed";
  useEffect(() => {
    if (!closedNow) return;
    if (paneRef.current?.contains(document.activeElement))
      document.getElementById("table-pane-closed-h")?.focus();
  }, [closedNow, paneRef]);

  // The closed table's paid card, from this tab's stash (read after mount, never during render).
  const [stashed, setStashed] = useState<{ id: string; h: Handoff | null } | null>(null);
  useEffect(() => {
    if (!closedNow || id === null) return;
    const t = setTimeout(() => setStashed({ id, h: readHandoffStash(id) }), 0);
    return () => clearTimeout(t);
  }, [closedNow, id]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    const editable = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? "");
    if (
      id !== null &&
      paneEscapeCloses({
        key: e.key,
        defaultPrevented: e.defaultPrevented,
        isComposing: e.nativeEvent.isComposing,
        targetEditable: editable,
      })
    ) {
      e.preventDefault();
      onClose("user");
    }
  };

  // The head's name: the detail's own, else the tapped card's hint, else a skeleton bar.
  const detailName =
    cur?.kind === "detail"
      ? { counter: cur.detail.label.startsWith("reg-"), display: tableDisplay(cur.detail).text }
      : null;
  const name = detailName ?? sel?.hint ?? null;
  const nameText = (h: TableHint) =>
    h.counter ? ts(lang, "floor.counter") : tf(lang, "floor.table", { id: h.display });

  const lostName = lostWrite ? nameText(lostWrite.hint) : null;
  const lostLine = lostWrite ? (
    <Chrome lang={lang} k="floor.pane.lostWrite" vars={{ x: lostName! }} echo="stack" />
  ) : null;
  const detailMounted = cur?.kind === "detail";

  const twin =
    cur?.kind === "closed" && cur.label !== null
      ? liveTwinOf({ sessionId: cur.id, label: cur.label }, rows)
      : null;
  const twinRow = twin ? rows.find((r) => r.sessionId === twin) : undefined;
  const closedHandoff = cur?.kind === "closed" && stashed?.id === cur.id ? stashed.h : null;

  return (
    <section
      ref={paneRef}
      className="staff-split-pane"
      aria-labelledby="table-pane-h"
      aria-busy={!hydrated || cur?.kind === "loading" || undefined}
      onKeyDown={onKeyDown}
    >
      {!hydrated ? null : sel === null ? (
        <>
          {lostWrite && (
            <LostWrite line={lostLine} lang={lang} lw={lostWrite} onSelect={onSelect} />
          )}
          <EmptyState
            titleAs="h2"
            titleId="table-pane-h"
            icon={<Icon name="receipt" size={24} />}
            title={<Chrome lang={lang} k="floor.pane.empty.title" />}
            subtitle={<Chrome lang={lang} k="floor.pane.empty.sub" echo="stack" />}
          />
          <p role="status" className="sr-only">
            {lostLine}
          </p>
        </>
      ) : (
        <>
          <div className="staff-pane-head">
            {/* `echo={false}`: the region's aria-labelledby target and a focus target. */}
            <h2 id="table-pane-h" ref={headingRef} tabIndex={-1} className="staff-pane-title">
              {name ? (
                name.counter ? (
                  <Chrome lang={lang} k="floor.counter" />
                ) : (
                  <Chrome lang={lang} k="floor.table" vars={{ id: name.display }} />
                )
              ) : (
                <>
                  <Skeleton width={180} height={30} radius={8} />
                  <span className="sr-only">
                    <Chrome lang={lang} k="shell.loading" vars={{ what: ts(lang, "what.table") }} />
                  </span>
                </>
              )}
            </h2>
            <button
              type="button"
              className="staff-circ staff-press"
              onClick={() => onClose("user")}
            >
              <Icon name="close" size={20} />
              <span className="sr-only">
                <Chrome lang={lang} k="shell.close" />
              </span>
            </button>
          </div>
          {lostWrite && (
            <LostWrite line={lostLine} lang={lang} lw={lostWrite} onSelect={onSelect} />
          )}
          <div className="staff-pane-body mms-rise" key={sel.id}>
            {cur?.kind === "loading" && <TableDetailSkeleton />}
            {cur?.kind === "detail" && (
              <TableNavProvider
                value={{
                  inPane: true,
                  toFloor: (reason) => onClose(reason),
                  toTable: (to, hint) => onSelect(to, hint),
                }}
              >
                <FloorDetailLive
                  key={cur.id}
                  variant="pane"
                  initial={cur.detail}
                  sessionId={cur.id}
                  terminalReady={terminalReady}
                  focusSettle={settleOnce === cur.id}
                  paneNotice={lostLine}
                  onClosed={(sid) => {
                    if (!acceptPaneRead(sid, selectedNow())) return;
                    setRead({
                      id: sid,
                      kind: "closed",
                      label: cur.detail.label,
                      counter: cur.detail.label.startsWith("reg-"),
                    });
                  }}
                  onLostWrite={onLostWrite}
                />
                <SettleConsumed when={settleOnce === cur.id} done={onSettleConsumed} />
              </TableNavProvider>
            )}
            {cur?.kind === "closed" && (
              <>
                {closedHandoff && (
                  <HandoffCard lang={lang} handoff={closedHandoff} onDone={() => onClose("user")} />
                )}
                <EmptyState
                  titleAs="h3"
                  titleId="table-pane-closed-h"
                  title={
                    <Chrome
                      lang={lang}
                      k={
                        cur.counter || sel.hint?.counter
                          ? "floor.pane.closed.counterTitle"
                          : "table.detail.closed.title"
                      }
                    />
                  }
                  subtitle={<Chrome lang={lang} k="floor.pane.closed.body" echo="stack" />}
                />
                {twinRow && (
                  <div className="staff-pane-actions">
                    <Button
                      variant="secondary"
                      size="xl"
                      block
                      onClick={() => onSelect(twinRow.sessionId, twinRow.hint)}
                    >
                      <Chrome
                        lang={lang}
                        k="floor.pane.closed.openCurrent"
                        vars={{ x: nameText(twinRow.hint) }}
                        echo="stack"
                      />
                    </Button>
                  </div>
                )}
              </>
            )}
            {cur?.kind === "fail" && (
              <>
                <EmptyState
                  titleAs="h3"
                  tone="error"
                  title={<Chrome lang={lang} k={paneFailKeys(cur.cause).title} />}
                  subtitle={<Chrome lang={lang} k={paneFailKeys(cur.cause).sub} echo="stack" />}
                />
                <div className="staff-pane-actions">
                  <Button
                    variant="secondary"
                    size="xl"
                    block
                    busy={retrying}
                    busyLabel={<Chrome lang={lang} k="out.shell.retrying" />}
                    onClick={() => {
                      setRetrying(true);
                      setAttempt((n) => n + 1);
                    }}
                  >
                    <Chrome lang={lang} k="out.shell.retry" echo="stack" />
                  </Button>
                </div>
              </>
            )}
          </div>
          {/* The pane's ONE region while no detail (with its own region) is mounted. */}
          {!detailMounted && (
            <p role="status" className="sr-only">
              {lostLine ??
                (cur?.kind === "closed" ? (
                  <Chrome
                    lang={lang}
                    k={
                      cur.counter || sel.hint?.counter
                        ? "floor.pane.closed.counterTitle"
                        : "table.detail.closed.title"
                    }
                  />
                ) : cur?.kind === "fail" ? (
                  <Chrome lang={lang} k={paneFailKeys(cur.cause).title} />
                ) : null)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** A change on another table that did not save: the words (warn ink) and the one-tap way to check.
 *  Shown here; SAID by the pane's region (or the mounted detail's). */
function LostWrite({
  line,
  lang,
  lw,
  onSelect,
}: {
  line: ReactNode;
  lang: StaffLang;
  lw: { sessionId: string; hint: TableHint };
  onSelect: (id: string, hint: TableHint) => void;
}) {
  const name = lw.hint.counter
    ? ts(lang, "floor.counter")
    : tf(lang, "floor.table", { id: lw.hint.display });
  return (
    <div className="staff-pane-lost">
      <Icon name="alert" size={16} aria-hidden />
      <span aria-hidden="true">{line}</span>
      <button
        type="button"
        className="staff-btn staff-press"
        onClick={() => onSelect(lw.sessionId, lw.hint)}
      >
        <Chrome lang={lang} k="floor.pane.open" vars={{ x: name }} />
      </button>
    </div>
  );
}

/** Drops the one-shot `?settle=1` once the detail it was for has mounted (after its own effect). */
function SettleConsumed({ when, done }: { when: boolean; done: () => void }) {
  useEffect(() => {
    if (when) done();
  }, [when, done]);
  return null;
}
