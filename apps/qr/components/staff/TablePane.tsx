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
  paneStatusSays,
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
 *            quiet retry 5 s after each failed answer (never over a read still in the air).
 *
 * Live regions: while a detail is mounted its ONE polite region speaks (and carries a lost write for
 * another table); otherwise this pane's single sr-only `role=status` does (`paneStatusSays`: a lost
 * write, "Loading…" when the head is a name, the closed title, the failure). Never two at once.
 */
/** Every read carries its selection's `gen`: a table picked AGAIN (A → ✕ → A, A → B → A) starts in
 *  `loading` and reads afresh — a previous pick's detail would seed `FloorDetailLive`'s state
 *  (`useState(initial)`) with an order minutes old until the next poll. */
type Read = { id: string; gen: number } & (
  | { kind: "loading" }
  | { kind: "detail"; detail: TableDetail }
  | { kind: "closed"; label: string | null; hint: TableHint | null }
  | { kind: "fail"; cause: "outage" | "unknown" }
);

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
  sel: { id: string; hint: TableHint | null; focus: number; gen: number } | null;
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
  const gen = sel?.gen ?? 0;
  // Phase 2d · review fixes — the read that last ANSWERED, named by (id, gen, attempt). The quiet
  // retry is timed from an answer, never from a start: armed while a read is still in the air, it
  // cancelled that read every 5 s, so a database answering in 5–15 s (inside `raceTimeout`'s bound)
  // never landed and the pane said "couldn't" for as long as it stayed slow.
  const readKey = `${id}:${gen}:${attempt}`;
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  // A read belongs to ONE selection: anything else in state is a previous pick's.
  const cur: Read | null =
    id === null ? null : read?.id === id && read.gen === gen ? read : { id, gen, kind: "loading" };

  // The first read, per selection (`gen`) and per retry — NEVER per render: `selectedNow` is one
  // stable function for the mount, so a floor publish cannot re-run this. That matters beyond the
  // wasted read: once a detail is mounted, a later `closed` is the detail's own to say (`onClosed`,
  // behind its terminal hold — the reader panel and the counter's #CODE card); a re-run first read
  // would land it past that hold. Gated by `acceptPaneRead` at landing.
  useEffect(() => {
    if (id === null) return;
    let live = true;
    const key = `${id}:${gen}:${attempt}`;
    raceTimeout(getTableDetail(id))
      .then((res) => {
        if (!live || !acceptPaneRead(id, selectedNow())) return;
        if (res.kind === "detail") setRead({ id, gen, kind: "detail", detail: res.detail });
        else if (res.kind === "closed")
          setRead({
            id,
            gen,
            kind: "closed",
            label: res.label ?? null,
            hint: res.label === undefined ? null : closedHint(res.label, res.tableNumber ?? null),
          });
        else if (res.kind === "signin") window.location.assign("/staff/login");
        else setRead({ id, gen, kind: "fail", cause: "outage" });
      })
      .catch((e: unknown) => {
        // A timeout or a dropped transport: this end failed, which is not evidence of an outage.
        console.error("[TablePane] first read failed", e);
        if (live && acceptPaneRead(id, selectedNow()))
          setRead({ id, gen, kind: "fail", cause: "unknown" });
      })
      .finally(() => {
        if (!live) return;
        setRetrying(false);
        setAnsweredKey(key);
      });
    return () => {
      live = false;
    };
  }, [id, gen, attempt, selectedNow]);

  // The quiet retry while a first read stands failed — RETRY_MS after the current attempt's read
  // answered (`answeredKey`), never over one still in the air.
  const failed = cur?.kind === "fail";
  const answered = answeredKey === readKey;
  useEffect(() => {
    if (!failed || !answered) return;
    const t = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearTimeout(t);
  }, [failed, answered, readKey]);

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

  // Closed while shown: the notice's title takes focus only if focus was inside the pane. SAMPLED
  // BEFORE the swap (`onClosed` runs while the detail's focused control is still in the DOM): by
  // this effect that control is gone and focus is on <body>, which says nothing about where it was.
  const closedNow = cur?.kind === "closed";
  const focusWasInPane = useRef(false);
  useEffect(() => {
    if (!closedNow) return;
    const had = focusWasInPane.current;
    focusWasInPane.current = false;
    if (had || paneRef.current?.contains(document.activeElement))
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
  const name = detailName ?? (cur?.kind === "closed" ? cur.hint : null) ?? sel?.hint ?? null;
  // A settled read with no name (a deep link to a vanished session, a failed first read): a neutral
  // head — never the loading skeleton beside a body that is no longer loading.
  const settled = cur !== null && cur.kind !== "loading";
  const nameText = (h: TableHint) =>
    h.counter ? ts(lang, "floor.counter") : tf(lang, "floor.table", { id: h.display });

  const lostName = lostWrite ? nameText(lostWrite.hint) : null;
  const lostLine = lostWrite ? (
    <Chrome lang={lang} k="floor.pane.lostWrite" vars={{ x: lostName! }} echo="stack" />
  ) : null;
  const detailMounted = cur?.kind === "detail";
  // Phase 2d · review fixes — the pane's ONE region while no detail (with its own) is mounted.
  const closedKey =
    cur?.kind === "closed" && (cur.hint?.counter || sel?.hint?.counter)
      ? "floor.pane.closed.counterTitle"
      : "table.detail.closed.title";
  const says = paneStatusSays({
    lost: lostWrite !== null,
    read: cur === null || cur.kind === "detail" ? null : cur.kind,
    headNamed: name !== null,
  });

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
      aria-busy={!hydrated || undefined}
      onKeyDown={onKeyDown}
    >
      {!hydrated ? null : sel === null ? (
        <>
          {lostWrite && (
            <LostWrite line={lostLine} lang={lang} lw={lostWrite} onSelect={onSelect} />
          )}
          {/* Hidden below 64em while only a lost write stands (`data-pane="lost"`): there the pane
              is the warning line above the floor, never a "Pick a table" page over it. */}
          <div className="staff-pane-empty">
            <EmptyState
              titleAs="h2"
              titleId="table-pane-h"
              icon={<Icon name="receipt" size={24} />}
              title={<Chrome lang={lang} k="floor.pane.empty.title" />}
              subtitle={<Chrome lang={lang} k="floor.pane.empty.sub" echo="stack" />}
            />
          </div>
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
              ) : settled ? (
                <Chrome lang={lang} k="floor.pane.head.unnamed" />
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
          {/* Busy is the BODY's (the skeleton), never the section's: the pane's one region below
              must not sit inside a busy subtree, whose announcements may be held until it clears. */}
          <div
            className="staff-pane-body mms-rise"
            key={sel.id}
            aria-busy={cur?.kind === "loading" || undefined}
          >
            {cur?.kind === "loading" && <TableDetailSkeleton />}
            {cur?.kind === "detail" && (
              <TableNavProvider
                value={{
                  inPane: true,
                  // Bound to THIS table: a Clear or Merge answering after the pane moved on (or
                  // closed) must not close — or switch away from — the table shown now. The
                  // control's own work (the server write, its stash drop) is already done.
                  toFloor: (reason) => {
                    if (acceptPaneRead(cur.id, selectedNow())) onClose(reason);
                  },
                  toTable: (to, hint) => {
                    if (acceptPaneRead(cur.id, selectedNow())) onSelect(to, hint);
                  },
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
                    focusWasInPane.current =
                      paneRef.current?.contains(document.activeElement) ?? false;
                    setRead({
                      id: sid,
                      gen: cur.gen,
                      kind: "closed",
                      label: cur.detail.label,
                      hint: closedHint(cur.detail.label, cur.detail.tableNumber),
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
                  <HandoffCard
                    lang={lang}
                    handoff={closedHandoff}
                    onDone={() => onClose("user")}
                    headingLevel={3}
                  />
                )}
                <EmptyState
                  titleAs="h3"
                  titleId="table-pane-closed-h"
                  title={<Chrome lang={lang} k={closedKey} />}
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
        </>
      )}
      {/* The pane's ONE region while no detail (with its own region) is mounted — ONE node across
          "nothing picked" and every read state (outside the branches above), so a tap's "Loading…"
          is a CHANGE to a region that already stood, never a region inserted with its text. */}
      {hydrated && !detailMounted && (
        <PaneRegion>
          {says === "lost" ? (
            lostLine
          ) : says === "loading" ? (
            <Chrome lang={lang} k="shell.loading" vars={{ what: ts(lang, "what.table") }} />
          ) : says === "closed" ? (
            <Chrome lang={lang} k={closedKey} />
          ) : says === "fail" && cur?.kind === "fail" ? (
            <Chrome lang={lang} k={paneFailKeys(cur.cause).title} />
          ) : null}
        </PaneRegion>
      )}
    </section>
  );
}

/** A closed table's name from its label (`reg-*` is a counter order) and number. */
function closedHint(label: string, tableNumber: number | null): TableHint {
  return {
    counter: label.startsWith("reg-"),
    display: tableDisplay({ tableNumber, label }).text,
  };
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
      <Button variant="secondary" size="sm" onClick={() => onSelect(lw.sessionId, lw.hint)}>
        <Chrome lang={lang} k="floor.pane.open" vars={{ x: name }} />
      </Button>
    </div>
  );
}

/** The pane's ONE region. It stands across "nothing picked" and every read state, and when it does
 *  mount fresh — a switch away from a mounted detail, whose own region just left — it mounts EMPTY
 *  and is filled a tick later: a live region inserted WITH its text is often never spoken. */
function PaneRegion({ children }: { children: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    // Scheduled, never a synchronous setState in the effect (the react-hooks rule).
    const t = setTimeout(() => setArmed(true), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <p role="status" className="sr-only">
      {armed ? children : null}
    </p>
  );
}

/** Drops the one-shot `?settle=1` once the detail it was for has mounted (after its own effect). */
function SettleConsumed({ when, done }: { when: boolean; done: () => void }) {
  useEffect(() => {
    if (when) done();
  }, [when, done]);
  return null;
}
