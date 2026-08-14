"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useConnectionTruth } from "@/lib/useConnectionTruth";
import { Icon } from "@mms/ui";

/**
 * The resilience shell (W7b — S3): SW registration + the hardened update flow + the ambient
 * device-offline pill, mounted once in the root layout. The update flow is the delivery repo's
 * production pattern, slimmed (no countdown/auto-activate — a quiet strip):
 *
 *  - browsers re-fetch sw.js only on hard navigations, and the installed-PWA / staff-tablet
 *    population never hard-navigates — so `registration.update()` runs on a 10-min HEARTBEAT plus
 *    visibility/online wakes;
 *  - `controllerchange` is guarded against the FIRST install (clientsClaim fires it for brand-new
 *    visitors; reloading them mid-browse races in-flight chunk loads);
 *  - activation is explicit: the strip's Refresh posts SKIP_WAITING, the guarded controllerchange
 *    reloads into the new build, and a 4s failsafe reloads anyway if activation stalls.
 *
 * The offline pill reads `useConnectionTruth` — never a second bare navigator.onLine listener with
 * its own copy (the W10a single-truth rule). `you-offline` is the only state it renders: `we-down`
 * (backend down, device fine) keeps the per-surface outage states as the voice. role="note", not a
 * live region — every view already owns its one announcer (QA §A); the pill is ambient truth.
 * Hidden on /staff (its own frozen-ledger vocabulary), /kiosk (clears to attract), /board.
 */

const HEARTBEAT_MS = 10 * 60_000;
const RELOAD_FAILSAFE_MS = 4000;
const HIDDEN_PREFIXES = ["/staff", "/kiosk", "/board"];

export function ResilienceShell() {
  const pathname = usePathname();
  const { truth } = useConnectionTruth();
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    )
      return;

    let registration: ServiceWorkerRegistration | null = null;
    let disposed = false;

    const adoptWaiting = (worker: ServiceWorker | null) => {
      if (!worker || disposed) return;
      waitingRef.current = worker;
      setUpdateReady(true);
    };

    const handleUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // installed + an existing controller = a NEW version waiting. No controller = the very
        // first install — never prompt for that.
        if (installing.state === "installed" && navigator.serviceWorker.controller)
          adoptWaiting(installing);
      });
    };

    const adoptRegistration = (reg: ServiceWorkerRegistration) => {
      if (registration || disposed) return;
      registration = reg;
      registration.addEventListener("updatefound", handleUpdateFound);
      if (registration.waiting) adoptWaiting(registration.waiting);
    };

    const checkNow = async () => {
      try {
        if (!registration) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) adoptRegistration(reg);
        }
        if (!registration || disposed) return;
        await registration.update().catch(() => {
          /* deliberate: a network blip — the next heartbeat retries */
        });
        if (registration.waiting) adoptWaiting(registration.waiting);
      } catch (e) {
        console.error("[resilience] update check failed", e);
      }
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(adoptRegistration)
      .catch((e) => console.error("[resilience] SW registration failed", e));

    const handleWake = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    const interval = setInterval(() => void checkNow(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("online", handleWake);

    // controllerchange → the new SW took over → reload into the new build. Guarded against the
    // FIRST install (see the header comment).
    let hadController = Boolean(navigator.serviceWorker.controller);
    const handleControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("online", handleWake);
      registration?.removeEventListener("updatefound", handleUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    // One-shot: a second SKIP_WAITING is a no-op but stacked failsafe reloads are not.
    if (firedRef.current) return;
    firedRef.current = true;
    waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(() => window.location.reload(), RELOAD_FAILSAFE_MS);
  }, []);

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const offline = truth === "you-offline";
  return (
    <>
      {offline && (
        <div role="note" aria-label="Offline" style={pill}>
          <Icon name="offline" size={16} />
          <span>
            You’re offline · <span lang="my">အော့ဖ်လိုင်း</span>
          </span>
        </div>
      )}
      {!offline && updateReady && (
        <div role="note" aria-label="Update available" style={{ ...pill, gap: "var(--s3)" }}>
          <span>A new version is ready</span>
          <button type="button" onClick={applyUpdate} style={refreshBtn}>
            Refresh
          </button>
        </div>
      )}
    </>
  );
}

const pill: CSSProperties = {
  position: "fixed",
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  gap: "var(--s2)",
  padding: "8px 16px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  boxShadow: "0 6px 24px -8px rgb(0 0 0 / 0.25)",
  maxWidth: "calc(100vw - 32px)",
};
const refreshBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: "var(--r-full)",
  border: "1px solid transparent",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
