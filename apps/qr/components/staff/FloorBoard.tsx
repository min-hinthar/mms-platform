"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getFloorView } from "@/lib/floor";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import type { FloorSnapshot } from "@/lib/floor-types";
import { EmptyState } from "@mms/ui";
import { TableCard } from "./TableCard";
import { StaggerList } from "./StaggerList";
import { isRealTransition, type PulseMeta } from "@/lib/floor-pulse";
import { useStaffLang } from "./StaffLangProvider";
import { sx } from "@/lib/staff-labels";
import { Chrome } from "./Chrome";

const metaOf = (t: { status: string; lastActivityAt: string }): PulseMeta => ({
  status: t.status,
  activityMs: Date.parse(t.lastActivityAt) || 0,
});

/**
 * The live floor (S1.2). Server-rendered initial snapshot, then kept fresh by Postgres-Changes
 * (useFloorRealtime → re-fetch the server-authoritative getFloorView; never client math) with a 5s poll
 * BACKSTOP so a dropped socket can't leave a server staring at a stale room. Re-fetches are debounced so
 * a burst of changes (a party of 6 joining) collapses to one fetch. One polite live region announces the
 * table count so a screen-reader user hears the room fill/empty without it chattering per card.
 */
export function FloorBoard({ initial }: { initial: FloorSnapshot }) {
  // P2 — the device language, from app/staff/layout.tsx. The outage banner below and the grid's
  // accessible name are what speak it today; the rest of this board's copy follows in its own
  // commit (OPEN-ITEMS P2c).
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
  // state (no false pulse on already-seated tables).
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

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // coalesce overlapping fetches
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      const res = await raceTimeout(getFloorView());
      if (!alive.current) return; // unmounted mid-fetch — don't setState / schedule timers
      if (!res.ok) {
        if (res.reason === "outage") {
          // W10b (M32): platform unreachable — keep the last-known room and keep polling.
          setNowMs(Date.now());
          setDegraded((d) => nextDegraded(d, "outage", Date.now()));
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
      setSnap(next);
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
      if (alive.current) {
        // Cause `unknown` — this end failed, which isn't evidence the platform is down.
        fails.current += 1;
        setNowMs(Date.now());
        if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
      }
      console.error("[FloorBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

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

  // 5s poll backstop (independent of the socket); cleared on unmount.
  useEffect(() => {
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

  const tables = snap.tables;
  const count = tables.length;

  return (
    <section aria-labelledby="floor-h">
      <div style={headRow}>
        <h2 id="floor-h" style={{ fontSize: "var(--fs-body)", margin: 0 }}>
          {/* `echo={false}`: this heading is the `aria-labelledby` target for the whole section, and
              a `chrome-pair` echo would name it "စားပွဲများTables". */}
          <Chrome lang={lang} k="floor.tables.title" />
        </h2>
        {/* P2 — the `lang` mark is STILL conditional, and now for one reason only: `frozenBoardCopy`
              returns a flat STRING, so the freeze branch has nowhere else to carry its mark. Every
              other branch renders <Chrome>, which marks itself, and an unconditional `lang={lang}`
              on the <p> would then double-mark them. (It used to be conditional because the other
              branches were English literals "until PR B converts them" — this is PR B.) */}
        <p
          role="status"
          lang={degraded ? lang : undefined}
          style={{
            margin: 0,
            fontSize: "var(--fs-sm)",
            color: degraded ? "var(--warn)" : "var(--t2)",
          }}
        >
          {degraded ? (
            frozenBoardCopy(
              lang,
              snap.serverNow,
              nowMs - degraded.since,
              "what.room",
              degraded.cause,
            )
          ) : count === 0 ? (
            <Chrome lang={lang} k="floor.tables.none" />
          ) : (
            <Chrome
              lang={lang}
              k={count === 1 ? "floor.tables.count.one" : "floor.tables.count.many"}
              vars={{ n: count }}
            />
          )}
        </p>
      </div>

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
          subtitle={
            <Chrome
              lang={lang}
              k={degraded ? "floor.tables.emptyFrozenSub" : "floor.tables.emptySub"}
              echo="stack"
            />
          }
        />
      ) : (
        // Card-enter on scan-in / exit on clear (keyed by sessionId → only added/removed tables animate) +
        // a status-change pulse per card. The board's single live region (above) stays the only one.
        <StaggerList
          items={tables}
          getKey={(t) => t.sessionId}
          // The grid is a `role="list"` with no visible label of its own, so the name is aria-only
          // (`sx`) rather than an al() pair — there is no visible text for WCAG 2.5.3 to contain.
          ariaLabel={sx(lang, "floor.a11y.tables")}
          style={grid}
          renderItem={(t) => (
            <TableCard
              table={t}
              serverNow={snap.serverNow}
              pulse={pulses.get(t.sessionId)}
              lang={lang}
            />
          )}
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
  marginBottom: "var(--s4)",
};
const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
};
