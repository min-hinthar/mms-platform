"use client";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { getTableDetail } from "@/lib/floor";
import { nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import type { TableDetail } from "@/lib/floor-types";

/**
 * Phase 2c · pad — the ORDER PAD's own live table detail (DESIGN-LANGUAGE §28).
 *
 * The same discipline as `FloorDetailLive`'s refresh (W10b · Phase 2a), deliberately NOT extracted
 * from it this PR (a shared detail hook is filed): a `raceTimeout` read so a hung poll degrades
 * instead of freezing the lock; a 5s poll plus a realtime channel on its own topic (`pad`, so the
 * table page and the pad never share a channel name); `closed` returns to the floor BY NAME,
 * `signin` goes to login, an outage freezes the last-known detail and says so.
 *
 * ⚠️ EVERY READ CARRIES A START SEQUENCE (`readsRef`, owned by the pad and shared with its add
 * chain). Reads run one at a time — a refresh asked for while one is in the air runs once after it
 * — so a read that started earlier can never commit over one that started later; and each commit
 * hands its START sequence to the add chain (`onCommit`), which drops a landed ghost only when the
 * committed read began AFTER the add landed (`pendingReduce`'s `commit`).
 */
export function usePadDetailLive({
  initial,
  sessionId,
  readsRef,
  onCommit,
}: {
  initial: TableDetail;
  sessionId: string;
  /** The last read STARTED — bumped here, read by the add chain when an add lands. */
  readsRef: MutableRefObject<number>;
  /** A read committed: its start sequence. */
  onCommit: (readStartSeq: number) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TableDetail>(initial);
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Commits, counted (the reused send controller's post-undo hold counts commits, not time).
  const [detailSeq, setDetailSeq] = useState(0);
  const fails = useRef(0);
  const inFlight = useRef(false);
  const rerun = useRef(false);
  const alive = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      rerun.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        rerun.current = false;
        const ticket = ++readsRef.current;
        try {
          const res = await raceTimeout(getTableDetail(sessionId));
          if (!alive.current) return;
          if (res.kind === "detail") {
            setDetail(res.detail);
            setDetailSeq((n) => n + 1);
            fails.current = 0;
            setDegraded(null);
            commitRef.current(ticket);
          } else if (res.kind === "closed") {
            // Cleared or closed elsewhere: the floor BY NAME (a bare `/staff` resolves by the door
            // cookie and can land a counter tablet on the kitchen board).
            router.replace(STAFF_DOOR_TARGET.counter);
          } else if (res.kind === "signin") {
            window.location.assign("/staff/login");
          } else {
            setNowMs(Date.now());
            setDegraded((d) => nextDegraded(d, "outage", Date.now()));
          }
        } catch (e) {
          if (!alive.current) return;
          // This end failed — not evidence the platform is down (cause `unknown`, after two misses).
          fails.current += 1;
          setNowMs(Date.now());
          if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
          console.error("[usePadDetailLive] refresh failed", e);
        }
      } while (rerun.current && alive.current);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router, readsRef]);

  // The slow escalation tick while frozen (the ≥2min paper-flow wording needs a re-render).
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange, sessionId, detail.cartId, "pad");

  useEffect(() => {
    alive.current = true; // re-armed at setup (Strict Mode runs cleanup between two setups)
    const id = setInterval(refresh, 5000);
    return () => {
      alive.current = false;
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  return { detail, degraded, nowMs, detailSeq, refresh };
}
