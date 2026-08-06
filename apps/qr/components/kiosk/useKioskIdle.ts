"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The kiosk idle machinery (W6b): any pointer/touch/key activity re-arms a quiet timer; after
 * `idleMs` of silence a COUNTDOWN starts (the "Still there?" modal renders off `countdown`), and
 * activity during the countdown cancels it. At zero, `onExpire` fires exactly once per idle episode.
 * Timers only — the caller owns what expiry MEANS (abandon-reset mid-order vs screen-clear on the
 * handoff screen), because the two are different machines (see W6B_PLAN "the reset FORKS").
 */
export function useKioskIdle({
  enabled,
  idleMs = 45_000,
  countdownS = 15,
  onExpire,
}: {
  enabled: boolean;
  idleMs?: number;
  countdownS?: number;
  onExpire: () => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  const clearAll = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (tick.current) clearInterval(tick.current);
    idleTimer.current = null;
    tick.current = null;
  }, []);

  // schedule() touches TIMERS only (safe to call synchronously inside the effect); arm() is the
  // event-handler face that also dismisses a running countdown (setState belongs in handlers/timers).
  const schedule = useCallback(() => {
    clearAll();
    idleTimer.current = setTimeout(() => {
      setCountdown(countdownS);
      tick.current = setInterval(() => {
        setCountdown((c) => {
          if (c == null) return null;
          if (c <= 1) {
            clearAll();
            expireRef.current();
            return null;
          }
          return c - 1;
        });
      }, 1000);
    }, idleMs);
  }, [clearAll, countdownS, idleMs]);

  const arm = useCallback(() => {
    schedule();
    setCountdown(null);
  }, [schedule]);

  useEffect(() => {
    if (!enabled) {
      clearAll();
      return;
    }
    schedule();
    // Every activity re-arms — including during the countdown (tapping "I'm still here" is just
    // activity too, but the modal button also calls keepAlive explicitly for the SR announcement).
    const onActivity = () => arm();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity);
    return () => {
      clearAll();
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [enabled, arm, schedule, clearAll]);

  return { countdown, keepAlive: arm };
}
