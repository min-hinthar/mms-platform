"use client";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { getTableDetail } from "@/lib/floor";
import { nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { createPollGate, type PollGate } from "@/lib/poll-gate";
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
  // ── Phase 2c · review fixes · pad2 ── the RAW read, watched apart from its 15s give-up (P5).
  // Next runs Server Actions one at a time, so a read that timed out is still IN the queue (behind a
  // hung add, usually): starting another only stacks a second abandoned call behind the first, every
  // 5s. While the raw call is unanswered no new read starts; the asks it refused are owed ONE fresh
  // read the moment it answers (kicked through `kick` — the refresh itself, mirrored).
  // ── Phase 2h (9f) ── that pattern now lives in `lib/poll-gate.ts`, shared with every board. The
  // gate is made ONCE for the hook's life (on first use, from a callback — never during render,
  // never in an effect's setup): it holds the hung read's state, and an effect re-setup — Strict
  // Mode's mount, or a new `refresh` — must not forget it and let one more read stack. So it is
  // never disposed from a cleanup (Strict Mode would latch that for good); the kick is guarded by
  // `alive`, re-armed at every setup, instead.
  const kick = useRef<() => void>(() => {});
  const gateRef = useRef<PollGate | null>(null);
  /** The gate, made on first use — from callbacks only, never during render. */
  const gateOf = useCallback((): PollGate => {
    if (gateRef.current === null) {
      gateRef.current = createPollGate(() => {
        if (alive.current) kick.current();
      });
    }
    return gateRef.current;
  }, []);

  /** One missed read — a failed or hung one. Two in a row arm the not-updating line (cause
   *  `unknown`: this end failing is not evidence the platform is down). */
  const miss = useCallback(() => {
    fails.current += 1;
    setNowMs(Date.now());
    if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
  }, []);

  const refresh = useCallback(async () => {
    const gate = gateOf();
    const asked = gate.ask();
    if (asked.go === "owed") {
      // Phase 2h (9f) — a tick refused while the raw read has been out a hang's worth of time is a
      // MISS. Before, the skip never counted: the race's give-up was the only miss a hang ever
      // produced, so the line (two misses) never armed and the pad wore its live face over a frozen
      // order for as long as the read hung.
      if (asked.missed) miss();
      return;
    }
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
          const raw = gate.watch(getTableDetail(sessionId));
          const res = await raceTimeout(raw);
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
          miss();
          console.error("[usePadDetailLive] refresh failed", e);
        }
        // ⚠️ No `gate.pending()` conjunct here, and no "owe the rerun to the hung read" after the
        // loop — both existed, and both were UNREACHABLE (the Phase 2h contract critic's F11 asked for
        // their mutants; each survived the whole pad suite, measured): `rerun` is set only by a
        // refresh that found the gate OPEN while this loop was in flight, i.e. in the instant between
        // a raw's answer and this continuation, so at this condition the gate is open by
        // construction. A refresh while the raw is still out never reaches `rerun` — `ask` owes it
        // to the gate first.
      } while (rerun.current && alive.current);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router, readsRef, gateOf, miss]);
  useEffect(() => {
    kick.current = () => void refresh();
  }, [refresh]);

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
