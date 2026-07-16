"use client";
import { useEffect } from "react";

/**
 * W3d (O-F): hold a screen wake lock while an always-on ops surface (KDS, expo, order-ready board) is
 * mounted — a kitchen display that sleeps mid-rush is a downed station. Re-acquires on visibilitychange
 * (the platform releases the lock when the tab hides; getting it back on return is on us). Best-effort
 * by design: unsupported browsers (older Safari) just fall back to the device's own display settings —
 * never an error surface, the board works either way.
 */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (power save mode, etc.) — the board still works; the device just sleeps on its own terms.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {
        /* released with the page — nothing to recover */
      });
    };
  }, [enabled]);
}
