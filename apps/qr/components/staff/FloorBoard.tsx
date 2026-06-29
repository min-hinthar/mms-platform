"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getFloorView } from "@/lib/floor";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import type { FloorSnapshot } from "@/lib/floor-types";
import { EmptyState } from "@mms/ui";
import { TableCard } from "./TableCard";

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

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // coalesce overlapping fetches
    inFlight.current = true;
    try {
      setSnap(await getFloorView());
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
    return () => {
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
        <ul role="list" aria-label="Active tables" style={grid}>
          {tables.map((t) => (
            <li key={t.sessionId}>
              <TableCard table={t} serverNow={snap.serverNow} />
            </li>
          ))}
        </ul>
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
