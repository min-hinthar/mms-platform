"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getFloorView } from "@/lib/floor";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { createPollGate, type PollGate } from "@/lib/poll-gate";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { floorFacts } from "@/lib/counter-attention";
import type { FloorSnapshot } from "@/lib/floor-types";
import { floorRowKey, mergeFloorRows } from "@/lib/floor-rows";
import { Button, EmptyState } from "@mms/ui";
import { TableCard } from "./TableCard";
import { CounterOrderCard } from "./CounterOrderCard";
import { StaggerList } from "./StaggerList";
import { isRealTransition, type PulseMeta } from "@/lib/floor-pulse";
import { useStaffLang } from "./StaffLangProvider";
import { sx } from "@/lib/staff-labels";
import { Chrome } from "./Chrome";
import { useReportLive } from "./LiveConnection";
// ── Phase 2d · floor ──
import { UP_NOTICE_DWELL_MS, heardUp, upRose } from "@/lib/floor-kitchen";
import { ERR_DWELL_MS } from "@/lib/kds-errors";
import { localizeCount, plural } from "@/lib/i18n/fill";
import { COUNTER_UNCOLLECTED_HOURS } from "@/lib/counter-order";
import { paneUrl } from "@/lib/floor-pane";
import { tableDisplay } from "@/lib/floor-types";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { TableStrip } from "./TableStrip";
import { useCounterAttention } from "./CounterBell";
// ── Phase 2d · split ──
import { useTablePane } from "./TablePaneContext";
// ── Phase 2g · counter ──
import { CounterOlderSheet } from "./CounterOlderSheet";

const metaOf = (t: { status: string; lastActivityAt: string }): PulseMeta => ({
  status: t.status,
  activityMs: Date.parse(t.lastActivityAt) || 0,
});

/**
 * The live floor (S1.2) — and, since A4·2, the counter orders beside it in ONE list. Server-rendered
 * initial snapshot, then kept fresh by Postgres-Changes (useFloorRealtime → re-fetch the
 * server-authoritative getFloorView; never client math) with a 5s poll BACKSTOP so a dropped socket
 * can't leave a server staring at a stale room. Re-fetches are debounced so a burst of changes (a
 * party of 6 joining) collapses to one fetch. One polite live region announces the table and counter
 * counts so a screen-reader user hears the room fill/empty without it chattering per card.
 *
 * The counter orders ride the SAME snapshot (`snapshot.counter`, read by `readRegisterQueue` inside
 * `getFloorView`), so they refresh on the same tick and freeze on the same outage; `mergeFloorRows`
 * decides where the two lists meet and `floorRowKey` keys every row by its session.
 */
export function FloorBoard({ initial }: { initial: FloorSnapshot }) {
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  // W10b — outage parity with the KDS/expo boards (the floor previously had NO degraded state: a
  // failing poll wore its live face forever). One state carrying WHEN it started and WHY: `outage`
  // = the server said the platform is unreachable (immediate); `unknown` = repeated transport
  // failures from this device (2 misses), which must not assert whose fault it is. `since` and
  // `nowMs` are both the device clock, so the escalation elapsed is measured in one domain.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // R9 live-notice: remember each table's last {status, activity} so a refresh can flag the ones that made a
  // REAL transition (seated→ordering→paying→paid, or a void/edit revert — but NOT a passive TTL self-revert;
  // see isRealTransition). Seeded from the initial snapshot so the first realtime refresh diffs against real
  // state (no false pulse on already-seated tables). Tables only — a counter order has no status to pulse.
  const prevMeta = useRef<Map<string, PulseMeta>>(
    new Map(initial.tables.map((t) => [t.sessionId, metaOf(t)])),
  );
  // Per-table pulse NONCE (not a shared Set): a fresh nonce per real transition restarts the keyed ring
  // overlay even on a second transition within the window; merged (not replaced) so one table's pulse isn't
  // yanked mid-animation when another changes; each session self-clears on its OWN timer.
  const nonceRef = useRef(0);
  const [pulses, setPulses] = useState<Map<string, number>>(new Map());
  const pulseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Guard against a fetch that resolves AFTER unmount (getFloorView has no AbortController) — otherwise we'd
  // schedule pulse timers the cleanup already ran past + setState on a dead component.
  const alive = useRef(true);
  // ── Phase 2d · floor ── the region's two notices (precedence in the render), each with its own
  // dwell, and the "ready to serve" keys each table has HEARD (`heardUp`) so a bump it has not can
  // cue. Seeded from the initial snapshot: a table already showing food up when the screen loads
  // never rings. Phase 2d · Codex round 1 · ready — keys, never the count (`upRose`).
  const [stripNotice, setStripNotice] = useState<StaffMsg | null>(null);
  const [upNotice, setUpNotice] = useState<string[] | null>(null);
  const stripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUp = useRef<Map<string, ReadonlySet<string>>>(
    new Map(
      initial.kitchenUnknown
        ? []
        : initial.tables.map((t) => [t.sessionId, heardUp(undefined, t.kitchen?.upKeys ?? [])]),
    ),
  );
  const onStripNotice = useCallback((n: StaffMsg | null) => {
    if (stripTimer.current) clearTimeout(stripTimer.current);
    stripTimer.current = null;
    setStripNotice(n);
    if (n !== null)
      stripTimer.current = setTimeout(() => {
        stripTimer.current = null;
        setStripNotice(null);
      }, ERR_DWELL_MS); // a refused start must outlive the poll that follows it (kitchen-10)
  }, []);
  // Phase 2d · bell — the floor's ear: a table asking to pay at the counter. Seeded with the room as
  // it rendered (the mount never rings), heard on every GOOD poll below (a frozen floor rings nothing).
  const hear = useCounterAttention(() => floorFacts(initial.tables));

  // ── Phase 2h (9f) ── polls never stack (`lib/poll-gate.ts`). Next runs Server Actions one at a time
  // per tab, so a read that `raceTimeout` gave up on at 15 s is still IN the queue: a 5 s tick that
  // started a "fresh" read after it only queued another abandoned call behind the hung one, every
  // 5 s, each of which had to drain before the next write anyone tapped could even be sent. While
  // the RAW read is unanswered no new read starts; the ticks it refused are owed ONE read, kicked
  // just after it answers. The gate is made ONCE for the board's life (on first use, from a
  // callback — never during render, never in an effect's setup, which Strict Mode and a new
  // `refresh` re-run and which would forget the hung read), and never disposed from a cleanup
  // (Strict Mode would latch that for good): the kick is guarded by `alive`, re-armed at setup.
  const kick = useRef<() => void>(() => {});
  const gateRef = useRef<PollGate | null>(null);
  const gateOf = useCallback((): PollGate => {
    if (gateRef.current === null) {
      gateRef.current = createPollGate(() => {
        if (alive.current) kick.current();
      });
    }
    return gateRef.current;
  }, []);
  /** One missed read — a failed, hung, or refused-past-the-bound one. Two in a row arm the freeze
   *  (cause `unknown`: this end failing is not evidence the platform is down). */
  const miss = useCallback(() => {
    fails.current += 1;
    setNowMs(Date.now());
    if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
  }, []);

  const refresh = useCallback(async () => {
    const gate = gateOf();
    const asked = gate.ask();
    if (asked.go === "owed") {
      // Phase 2h (9f) — a tick refused while the raw read has been out a hang's worth of time IS a
      // miss: before, the race's give-up was the only miss a hang ever produced, and every tick after
      // it re-armed a fresh read whose own give-up kept the count honest only by stacking calls.
      if (asked.missed) miss();
      return;
    }
    // A bare coalesce is safe here: the gate's owed kick is deferred past this read's `finally`, and
    // nothing below is awaited after the read.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight. The
      // gate watches the RAW read (the race frees this caller at 15 s, never the queue).
      const res = await raceTimeout(gate.watch(getFloorView()));
      if (!alive.current) return; // unmounted mid-fetch — don't setState / schedule timers
      if (!res.ok) {
        if (res.reason === "outage") {
          // W10b (M32): platform unreachable — keep the last-known room and keep polling.
          setNowMs(Date.now());
          setDegraded((d) => nextDegraded(d, "outage", Date.now()));
          return;
        }
        // Phase 2d · floor (K14) — locked from another tab: the lock screen, the KDS's rule.
        if (res.reason === "locked") {
          window.location.assign("/staff/lock");
          return;
        }
        // A genuinely expired/invalid staff session: the honest surface is the login, K10-style.
        window.location.assign("/staff/login");
        return;
      }
      const next = res.snapshot;
      // Diff vs the previous snapshot → the tables that made a REAL transition (for the card pulse).
      const bumped: Array<[string, number]> = [];
      for (const t of next.tables) {
        const prev = prevMeta.current.get(t.sessionId);
        if (prev !== undefined && isRealTransition(prev, metaOf(t))) {
          nonceRef.current += 1;
          bumped.push([t.sessionId, nonceRef.current]);
        }
      }
      prevMeta.current = new Map(next.tables.map((t) => [t.sessionId, metaOf(t)]));
      // Phase 2d · floor — food coming OUT is the one kitchen event that cues: the card's ring (the
      // same nonce machinery, once per card per poll) and the region's "Ready to serve — Table 7".
      const upNow: string[] = [];
      for (const t of next.tables) {
        const keys = t.kitchen?.upKeys ?? [];
        if (!upRose(prevUp.current.get(t.sessionId), keys)) continue;
        upNow.push(tableDisplay(t).text);
        if (!bumped.some(([id]) => id === t.sessionId)) {
          nonceRef.current += 1;
          bumped.push([t.sessionId, nonceRef.current]);
        }
      }
      // Phase 2d · review — an UNKNOWN kitchen is no baseline: its zeros are not "nothing up", so
      // the kitchen's return is first sight (never a rise) — never "Ready to serve" for food that
      // was already out.
      prevUp.current = next.kitchenUnknown
        ? new Map()
        : new Map(
            next.tables.map((t) => [
              t.sessionId,
              heardUp(prevUp.current.get(t.sessionId), t.kitchen?.upKeys ?? []),
            ]),
          );
      if (upNow.length > 0) {
        if (upTimer.current) clearTimeout(upTimer.current);
        setUpNotice(upNow);
        upTimer.current = setTimeout(() => {
          upTimer.current = null;
          setUpNotice(null);
        }, UP_NOTICE_DWELL_MS);
      }
      setSnap(next);
      hear(floorFacts(next.tables)); // Phase 2d · bell — the visible half is the card's status ring
      fails.current = 0;
      setDegraded(null);
      if (bumped.length > 0) {
        setPulses((prev) => {
          const m = new Map(prev);
          for (const [id, n] of bumped) m.set(id, n);
          return m;
        });
        for (const [id, n] of bumped) {
          const existing = pulseTimers.current.get(id);
          if (existing) clearTimeout(existing);
          pulseTimers.current.set(
            id,
            setTimeout(() => {
              pulseTimers.current.delete(id);
              // Clear only if a newer pulse hasn't superseded this one (else we'd cut its ring short).
              setPulses((prev) => {
                if (prev.get(id) !== n) return prev;
                const m = new Map(prev);
                m.delete(id);
                return m;
              });
            }, 1100),
          );
        }
      }
    } catch (e) {
      // Don't blank the floor on a transient fetch error — keep the last good snapshot; the poll + the
      // realtime self-heal will recover. After 2 consecutive failures, say so (KDS/expo parity).
      // Cause `unknown` — this end failed, which isn't evidence the platform is down.
      if (alive.current) miss();
      console.error("[FloorBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, [hear, gateOf, miss]);
  useEffect(() => {
    kick.current = () => void refresh();
  }, [refresh]);

  // Slow escalation tick while frozen/stale — the ≥2min paper-flow flip needs a re-render even if
  // every poll keeps failing silently.
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

  // Debounced trigger for realtime bursts.
  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange);
  // A4·2 — the floor reports its feed to the screen's help door (`LiveConnection`).
  useReportLive("floor", degraded ? "not_updating" : "live");

  // 5s poll backstop (independent of the socket); cleared on unmount.
  useEffect(() => {
    // Phase 2d · bell — RE-ARMED at setup, not only latched in the cleanup: StrictMode (on in dev)
    // replays this effect as cleanup → setup, and a cleanup-only latch left every poll after it
    // returning early — a floor that never refreshed and a bell that never rang.
    alive.current = true;
    const id = setInterval(refresh, 5000);
    const timers = pulseTimers.current;
    return () => {
      alive.current = false; // an in-flight refresh must not setState / schedule timers after this
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [refresh]);
  // Phase 2d · floor — the notices' dwell timers die with the board.
  useEffect(
    () => () => {
      if (stripTimer.current) clearTimeout(stripTimer.current);
      if (upTimer.current) clearTimeout(upTimer.current);
    },
    [],
  );

  // ── Phase 2d · split ── the counter's pane (null off the counter screen): the selected card, its
  // tap, and the live rows a hash selection and a closed table's namesake read.
  const pane = useTablePane();
  const publishFloor = pane?.publishFloor;
  useEffect(() => {
    publishFloor?.([
      ...snap.tables.map((t) => ({
        sessionId: t.sessionId,
        label: t.label,
        hint: { counter: false, display: tableDisplay(t).text },
      })),
      ...snap.counter.map((o) => ({
        sessionId: o.sessionId,
        // The queue row carries no sticker label; a counter order names no place, so `liveTwinOf`
        // must never match it — the `reg-` prefix is exactly how that is said.
        label: "reg-",
        hint: { counter: true, display: "" },
      })),
    ]);
  }, [snap, publishFloor]);

  // A4·2 — ONE list, keyed by session: the floor's tables and the open counter orders, in the order
  // `mergeFloorRows` states once (a table asking to pay, the counter orders, the rest of the room).
  const rows = mergeFloorRows(snap.tables, snap.counter);
  const count = rows.length;
  const tableCount = snap.tables.length;
  const counterCount = snap.counter.length;
  // Phase 2d · floor — the ask a screen-reader user must hear when it appears.
  const askCount = snap.tables.filter((t) => t.status === "counter").length;
  // Phase 2g · P2fk — counter orders whose food nobody has come for in hours (an absent flag is not).
  const uncollectedCount = snap.counter.filter((o) => o.uncollected === true).length;

  // ── Phase 2g · P2fz ── the oldest-first sheet. Mounted fresh on EVERY open (`seq` keys it), so a
  // reopen re-reads page one. A row that opens the PANE unmounts it (`handedOff`) rather than closing
  // it: an exiting sheet keeps the page under `aria-hidden` while focus is already on the pane, and
  // its close-restore would pull focus back to the door.
  const [older, setOlder] = useState({ seq: 0, open: false, handedOff: false });
  const olderDoor = useRef<HTMLButtonElement>(null);
  const olderHandedOff = useRef(false);
  const openOlder = () => {
    olderHandedOff.current = false;
    setOlder((o) => ({ seq: o.seq + 1, open: true, handedOff: false }));
  };
  const openOlderInPane = (sessionId: string) => {
    olderHandedOff.current = true;
    setOlder((o) => ({ ...o, open: false, handedOff: true }));
    // The split's own opener (it selects and focuses the pane in place — a router push of the hash
    // would fire no `hashchange` on this screen). A counter order names no place, so its hint says
    // only that it is one. With no split mounted (never on the counter screen, which is always one),
    // a real navigation to the pane URL, whose hash the split seeds from on load.
    if (!pane?.openSession(sessionId, { counter: true, display: "" }))
      window.location.assign(paneUrl(sessionId));
  };

  return (
    <section aria-labelledby="floor-h" className="staff-zone">
      <div style={headRow}>
        {/* Phase 2d · split — a focus target: a cleared table's pane closes onto it. */}
        <h2 id="floor-h" className="staff-zone-head" tabIndex={-1}>
          {/* `echo={false}`: this heading is the `aria-labelledby` target for the whole section, and
              a `chrome-pair` echo would name it "စားပွဲများ…Tables…". */}
          <Chrome lang={lang} k="floor.tables.title" />
        </h2>
        {/* P2 — the `lang` mark is STILL conditional, and now for one reason only: `frozenBoardCopy`
              returns a flat STRING, so the freeze branch has nowhere else to carry its mark. Every
              other branch renders <Chrome>, which marks itself, and an unconditional `lang={lang}`
              on the <p> would then double-mark them. */}
        {/* Phase 2d · floor — the ONE region's precedence: a strip refusal (a start that did not
              happen, or whose answer never came) > the freeze > "Ready to serve" > the counts. */}
        <p
          role="status"
          lang={!stripNotice && degraded ? lang : undefined}
          style={{
            margin: 0,
            fontSize: "var(--fs-sm)",
            color: stripNotice || degraded ? "var(--warn)" : upNotice ? "var(--ok)" : "var(--t2)",
          }}
        >
          {stripNotice ? (
            <MsgText lang={lang} msg={stripNotice} />
          ) : degraded ? (
            // A4·2 — this is the counter screen's ONE state region: the lane beside it freezes on
            // the same outage and says so in plain text, never in a second live region (two
            // near-identical announcements in one second, the blind pass measured). So the freeze
            // names the floor — the screen — not the room.
            frozenBoardCopy(
              lang,
              snap.serverNow,
              nowMs - degraded.since,
              "what.floor",
              degraded.cause,
            )
          ) : upNotice ? (
            <Chrome
              lang={lang}
              k={plural(
                upNotice.length,
                "floor.kitchen.upNotice.one",
                "floor.kitchen.upNotice.many",
              )}
              vars={{ id: upNotice.join(", ") }}
            />
          ) : count === 0 ? (
            <Chrome lang={lang} k="floor.rows.none" />
          ) : (
            // Two counts as ELEMENTS (the expo's pattern): the middot is rendered between the
            // surviving segments, and each segment carries its own `lang` mark.
            [
              tableCount > 0 ? (
                <Chrome
                  key="tables"
                  lang={lang}
                  k={tableCount === 1 ? "floor.tables.count.one" : "floor.tables.count.many"}
                  vars={{ n: tableCount }}
                />
              ) : null,
              // Phase 2d · floor — a table asking to pay is the one ask that needs a person.
              askCount > 0 ? (
                <Chrome key="asks" lang={lang} k="floor.tables.asks" vars={{ n: askCount }} />
              ) : null,
              counterCount > 0 ? (
                <Chrome
                  key="counter"
                  lang={lang}
                  k={counterCount === 1 ? "floor.counter.count.one" : "floor.counter.count.many"}
                  vars={{ n: counterCount }}
                />
              ) : null,
              // A TRUNCATED counter read says so HERE, in the live region and above the cards — the
              // newest-first cap (Phase 2f review M1) hides the OLDEST orders, and a caveat beneath
              // forty cards is one a screen-reader user never reaches.
              snap.counterTruncated ? (
                <Chrome key="truncated" lang={lang} k="floor.counter.truncated" />
              ) : null,
              // Phase 2g · P2fk — how many counter orders have waited past the horizon. {h} is a
              // second count, localized here (only {n} is a count slot).
              uncollectedCount > 0 ? (
                <Chrome
                  key="uncollected"
                  lang={lang}
                  k={plural(
                    COUNTER_UNCOLLECTED_HOURS,
                    "floor.counter.uncollected.one",
                    "floor.counter.uncollected.many",
                  )}
                  vars={{
                    n: uncollectedCount,
                    h: localizeCount(COUNTER_UNCOLLECTED_HOURS, lang),
                  }}
                />
              ) : null,
              // Phase 2d · review (floor #6) — the kitchen read came back full: every card's
              // kitchen row is unknown this poll, said once here rather than vanishing unsaid.
              snap.kitchenUnknown ? (
                <Chrome key="kitchen" lang={lang} k="floor.kitchen.unknown" />
              ) : null,
            ]
              .filter(Boolean)
              .map((seg, i) => (
                <Fragment key={i}>
                  {i > 0 ? " · " : null}
                  {seg}
                </Fragment>
              ))
          )}
        </p>
      </div>
      {/* Phase 2g · P2fz — the door to every open counter order, oldest first: shown when the list
          below is cut short or an order has waited past the horizon. UNDER the head row and outside
          the region above (no control inside a live region); the region already said why. */}
      {(snap.counterTruncated || uncollectedCount > 0) && (
        <div style={olderDoorRow}>
          <Button ref={olderDoor} variant="secondary" onClick={openOlder}>
            <Chrome lang={lang} k="floor.counter.older.open" echo="inline" />
          </Button>
        </div>
      )}
      {older.seq > 0 && !older.handedOff && (
        <CounterOlderSheet
          key={older.seq}
          open={older.open}
          onOpenChange={(open) => setOlder((o) => ({ ...o, open }))}
          onPaneOpen={openOlderInPane}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            // Handed to the pane: focus is already there. Otherwise back to the door — by hand, since
            // a tapped button is not focused on WebKit — or, if the door has gone (the list caught
            // up), the floor's heading.
            if (olderHandedOff.current) return;
            const door = olderDoor.current;
            if (door?.isConnected) door.focus();
            else document.getElementById("floor-h")?.focus();
          }}
          lang={lang}
          thresholds={snap.thresholds}
        />
      )}

      {/* Phase 2d · floor — THE STRIP: the room's map and its one-tap start, above the cards (and
          above the empty state: at open, every table free is the most useful screen). */}
      {snap.registry.length > 0 ? (
        <TableStrip
          registry={snap.registry}
          tables={snap.tables}
          lang={lang}
          onNotice={onStripNotice}
        />
      ) : (
        // Phase 2d · review (floor #3) — no registered table: the strip's place SAYS so, plainly
        // and not live (it is the room as it is), instead of a silent gap the help's "under Tables"
        // points at. There is no setup screen in the app to name, so it names only the fact.
        <p className="floor-strip-label floor-strip-none">
          <Chrome lang={lang} k="floor.strip.none" />
        </p>
      )}

      {count === 0 ? (
        // W10b — mid-freeze "the floor is quiet" would be an authoritative lie about a full room.
        <EmptyState
          title={
            <Chrome
              lang={lang}
              k={degraded ? "floor.tables.emptyFrozen" : "floor.tables.empty"}
              echo="stack"
            />
          }
          // Phase 2d · review (floor #3) — with no table set up, never promise a table start.
          subtitle={
            <Chrome
              lang={lang}
              k={
                degraded
                  ? "floor.tables.emptyFrozenSub"
                  : snap.registry.length === 0
                    ? "floor.tables.emptySubNoTables"
                    : "floor.tables.emptySub"
              }
              echo="stack"
            />
          }
        />
      ) : (
        // Card-enter on scan-in / exit on clear (keyed by sessionId → only added/removed rows animate) +
        // a status-change pulse per table card. The board's single live region (above) stays the only one.
        <StaggerList
          items={rows}
          getKey={floorRowKey}
          // The grid is a `role="list"` with no visible label of its own, so the name is aria-only
          // (`sx`) rather than an al() pair — there is no visible text for WCAG 2.5.3 to contain.
          // It names what the list HOLDS (tables and counter orders), the same fact as the heading.
          ariaLabel={sx(lang, "floor.a11y.rows")}
          style={grid}
          renderItem={(r) =>
            r.kind === "table" ? (
              <TableCard
                table={r.table}
                serverNow={snap.serverNow}
                thresholds={snap.thresholds}
                pulse={pulses.get(r.table.sessionId)}
                lang={lang}
                // Phase 2d · review — a frozen floor holds every wait pill at the last read.
                frozen={degraded !== null}
                selected={pane?.selectedId === r.table.sessionId}
                onSelect={
                  pane
                    ? (e) =>
                        pane.openFromCard(e, r.table.sessionId, {
                          counter: false,
                          display: tableDisplay(r.table).text,
                        })
                    : undefined
                }
              />
            ) : (
              <CounterOrderCard
                order={r.order}
                serverNow={snap.serverNow}
                lang={lang}
                thresholds={snap.thresholds}
                // Written apart from the table card's (an anchored line): the same freeze fact.
                frozen={degraded != null}
              />
            )
          }
        />
      )}
    </section>
  );
}

const headRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
};
const olderDoorRow: CSSProperties = { display: "flex", margin: "var(--s2) 0 0" };
const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
  // Phase 2d · floor — 18rem: two cards across a 768 tablet's column, three across the 1080.
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 18rem), 1fr))",
};
