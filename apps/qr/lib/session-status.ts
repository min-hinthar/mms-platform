"use client";
import { useSyncExternalStore } from "react";

/**
 * W10a — the auth-plane truth every pre-session surface can read. During the paused-project outage
 * `signInAnonymously` failed silently (console.error only) and every bearer-gated consumer sat in
 * a permanent "not loaded yet" indistinguishable from loading — the eternal-skeleton class. The
 * gate now PUBLISHES its outcome here; surfaces render an honest strip on `failed` instead of a
 * spinner that spins for nobody.
 *
 * Tiny external store (not context): the gate renders `null` in the root layout, ABOVE any
 * provider a consumer could reach, and the status is global by nature (cookies are).
 */
export type AuthPlaneStatus = "establishing" | "ok" | "failed";

let status: AuthPlaneStatus = "establishing";
const listeners = new Set<() => void>();

export function publishAuthPlaneStatus(next: AuthPlaneStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

export function useAuthPlaneStatus(): AuthPlaneStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    // SSR snapshot: "establishing" — the server can't know, and the honest strip must never flash
    // on a healthy first paint.
    () => "establishing" as const,
  );
}
