"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getFloorView } from "@/lib/floor";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import type { FloorSnapshot } from "@/lib/floor-types";
import { EmptyState } from "@mms/ui";
import { TableCard } from "./TableCard";
import { StaggerList } from "./StaggerList";

// TTL-derived statuses (`paying` = a fresh cart lock ≤5min; `settling` = a fresh split freeze ≤10min) can
// self-revert to `ordering`/`seated` when their time window elapses with NO real table event. A pulse must
// mean a genuine change, so those reverts are NOT "real" transitions — never fabricate liveness.
const TTL_REVERT_FROM = new Set(["paying", "settling"]);
const TTL_REVERT_TO = new Set(["ordering", "seated"]);
function isRealTransition(was: string, now: string): boolean {
  if (was === now) return false;
  if (TTL_REVERT_FROM.has(was) && TTL_REVERT_TO.has(now)) return false;
  return true;
}

/**
 * The live floor (S1.2). Server-rendered initial snapshot, then kept fresh by Postgres-Changes
 * (useFloorRealtime → re-fetch the server-authoritative getFloorView; never client math) with a 5s poll
 * BACKSTOP so a dropped socket can't leave a server staring at a stale room. Re-fetches are debounced so
 * a burst of changes (a party of 6 joining) collapses to one fetch. One polite live region announces the
 * table count so a screen-reader user hears the room fill/empty without it chattering per card.
 */
export function FloorBoard({ initial }: { initial: FloorSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // R9 live-notice: remember each table's last status so a refresh can flag the ones that just made a REAL
  // transition (seated→ordering→paying→paid). Seeded from the initial snapshot so the first realtime refresh
  // diffs against real state (no false pulse on already-seated tables).
  const prevStatus = useRef<Map<string, string>>(
    new Map(initial.tables.map((t) => [t.sessionId, t.status])),
  );
  // Per-table pulse NONCE (not a shared Set): a fresh nonce per real transition restarts the keyed ring
  // overlay even on a second transition within the window; merged (not replaced) so one table's pulse isn't
  // yanked mid-animation when another changes; each session self-clears on its OWN timer.
  const nonceRef = useRef(0);
  const [pulses, setPulses] = useState<Map<string, number>>(new Map());
  const pulseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // coalesce overlapping fetches
    inFlight.current = true;
    try {
      const next = await getFloorView();
      // Diff status vs the previous snapshot → the tables that made a REAL transition (for the card pulse).
      const bumped: Array<[string, number]> = [];
      for (const t of next.tables) {
        const was = prevStatus.current.get(t.sessionId);
        if (was !== undefined && isRealTransition(was, t.status)) {
          nonceRef.current += 1;
          bumped.push([t.sessionId, nonceRef.current]);
        }
      }
      prevStatus.current = new Map(next.tables.map((t) => [t.sessionId, t.status]));
      setSnap(next);
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
      // realtime self-heal will recover. Surface for triage.
      console.error("[FloorBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

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
        <h2 id="floor-h" style={{ fontSize: 16, margin: 0 }}>
          Tables
        </h2>
        <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13, color: "var(--t2)" }}>
          {count === 0 ? "No active tables" : `${count} active ${count === 1 ? "table" : "tables"}`}
        </p>
      </div>

      {count === 0 ? (
        <EmptyState
          title="The floor is quiet"
          subtitle="Active tables appear here the moment a guest scans in — party, what they’re ordering, and how long they’ve been seated."
        />
      ) : (
        // Card-enter on scan-in / exit on clear (keyed by sessionId → only added/removed tables animate) +
        // a status-change pulse per card. The board's single live region (above) stays the only one.
        <StaggerList
          items={tables}
          getKey={(t) => t.sessionId}
          ariaLabel="Active tables"
          style={grid}
          renderItem={(t) => (
            <TableCard table={t} serverNow={snap.serverNow} pulse={pulses.get(t.sessionId)} />
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
