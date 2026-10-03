"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useConnectionTruth } from "@/lib/useConnectionTruth";
import { resetWithEachTest } from "@/lib/test-resets";
import {
  activationFailsafe,
  controllerChange,
  payOwed,
  refreshTap,
  staffOwnsReload,
} from "@/lib/sw-activation";
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
 * Phase 2i (P2bi) — ONLY THE TAB THAT ASKED reloads, and NEVER OFFLINE (`lib/sw-activation.ts`).
 * A worker activated by one tab fires `controllerchange` in EVERY controlled tab of the origin, and
 * this effect runs on /staff, /kiosk and /board too (the strip renders nothing there; the effect
 * does not know the path). It used to reload them all: a diner's Refresh reloaded a KDS mid-service.
 * Now the module-level `requested` — set by THIS tab's Refresh before its SKIP_WAITING — is the only
 * way to a reload; another tab's activation is ignored (documents are network-only, so the page
 * keeps working). A reload due while the device is offline is OWED (the failsafe's too) and paid on
 * `online`: a reload with no network lands on the worker's offline page, which holds nothing. And
 * none of the three is paid while the tab is under /staff (Codex r1 on #311): the staff watcher owns
 * every reload there — and what it takes it releases (Codex r2 on #311): the ask, the debt and the
 * Refresh's one-shot are cleared, so the diner strip works again on the way back.
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

/** THIS tab posted SKIP_WAITING (module state: one document, one ask). */
let requested = false;
/** A reload this tab asked for came due while offline: paid on `online`. */
let owed = false;

/** Test seam: forget the ask and any owed reload — after every case (`lib/test-resets.ts`). */
function resetShellForTests(): void {
  requested = false;
  owed = false;
}
resetWithEachTest(resetShellForTests);

export function ResilienceShell() {
  const pathname = usePathname();
  const { truth } = useConnectionTruth();
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const firedRef = useRef(false);
  const failsafeRef = useRef<number | null>(null);
  // Codex r2 on #311 — what the staff route takes it RELEASES (`lib/sw-activation.ts`): the ask, the
  // debt, the pending failsafe and the Refresh's one-shot, so the diner strip answers a tap again
  // and nothing this tab once asked for is paid later on a page nobody asked about.
  const releaseToStaff = useCallback(() => {
    requested = false;
    owed = false;
    firedRef.current = false;
    if (failsafeRef.current !== null) window.clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
  }, []);

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

    // controllerchange → the new SW took over → reload into the new build, but only in the tab
    // that asked, never offline, and never for the FIRST install (see the header comment).
    let hadController = Boolean(navigator.serviceWorker.controller);
    const handleControllerChange = () => {
      const action = controllerChange({
        hadController,
        requested,
        online: navigator.onLine !== false,
        staff: staffOwnsReload(window.location.pathname),
      });
      hadController = true;
      if (action === "adopt-first" || action === "ignore") return;
      if (action === "release") {
        releaseToStaff();
        return;
      }
      // Cancel the pending failsafe FIRST (review LOW): on a slow connection the normal reload
      // can still be in flight when the 4s timer fires — a second reload() would abort the
      // half-loaded navigation and roughly double time-to-interactive on exactly the network
      // the failsafe exists for. It backstops a STALLED activation only.
      if (failsafeRef.current !== null) window.clearTimeout(failsafeRef.current);
      if (action === "owe") {
        owed = true;
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    // The owed reload is paid the moment the device is back online — off /staff only (Codex r1 on
    // #311): a soft navigation into the staff app leaves this listener mounted, and the staff
    // watcher owns every reload there. Read where the tab is NOW, never the mount's path.
    const payOwedNow = () => {
      const pay = payOwed({ owed, staff: staffOwnsReload(window.location.pathname) });
      if (pay === "none") return;
      if (pay === "release") {
        releaseToStaff();
        return;
      }
      owed = false;
      window.location.reload();
    };
    window.addEventListener("online", payOwedNow);

    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("online", handleWake);
      registration?.removeEventListener("updatefound", handleUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("online", payOwedNow);
    };
  }, [releaseToStaff]);

  const applyUpdate = useCallback(() => {
    // One-shot: a second SKIP_WAITING is a no-op but stacked failsafe reloads are not. The timer
    // id is kept so the controllerchange reload can CANCEL it (see the handler).
    if (firedRef.current) return;
    firedRef.current = true;
    // Another tab's Refresh may already have activated this worker (we ignored that change): no
    // controllerchange will follow a SKIP_WAITING, so reload now rather than after the failsafe.
    const tap = refreshTap({
      workerState: waitingRef.current?.state ?? null,
      online: navigator.onLine !== false,
    });
    if (tap === "owe") {
      owed = true;
      return;
    }
    if (tap === "reload") {
      window.location.reload();
      return;
    }
    // Asked BEFORE the message: the activation it triggers may arrive in the same task.
    requested = true;
    waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
    failsafeRef.current = window.setTimeout(() => {
      const due = activationFailsafe({
        online: navigator.onLine !== false,
        staff: staffOwnsReload(window.location.pathname),
      });
      if (due === "release") {
        releaseToStaff();
        return;
      }
      if (due === "owe") {
        owed = true;
        return;
      }
      window.location.reload();
    }, RELOAD_FAILSAFE_MS);
  }, [releaseToStaff]);

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
  // Phase 3a — above the diner tab bar (`--tabs-h`, 0 where none is drawn): at z 60 this pill sat
  // directly over the Order and Track tabs while offline or mid-update, the moment a diner most
  // needs them (Codex round 1 on #312, P1).
  bottom: "calc(var(--tabs-h, 0px) + env(safe-area-inset-bottom, 0px) + 12px)",
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
  fontWeight: "var(--fw-semibold)",
  boxShadow: "var(--sh-md)", // W22d — was a hardcoded rgb() between four var()s; Night has its own --sh-md
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
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
