"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NET_SHOW_MS, offlineSustained } from "./live-connection";

/**
 * W10a — the three truths behind a failed request, so copy can stop guessing:
 *
 *  - `you-offline`  — `navigator.onLine === false`. The ONLY state in which "check your
 *                     connection" copy is permitted anywhere in the app (the W10 audit found that
 *                     string asserted on six surfaces with zero evidence).
 *  - `we-down`      — the device is online but our platform probe (/api/health) says Supabase is
 *                     unreachable — a paused project, an outage, a bad deploy. Copy blames US and
 *                     reassures ("it's on us, not your connection — your order is safe").
 *  - `unknown`      — online and the probe answered ok (a transient blip, a single lost request)
 *                     or the probe itself couldn't run. Copy stays neutral ("couldn't reach the
 *                     kitchen just now — try again").
 *
 * Passive by default: the probe fires only when a consumer ASKS (a failure just happened), is
 * cached for PROBE_TTL_MS so a burst of failures across components costs one request, and re-fires
 * on the browser's online/offline transitions. `truth` is safe for SSR/first paint (`unknown`).
 */
export type ConnectionTruth = "you-offline" | "we-down" | "unknown";

const PROBE_TTL_MS = 15_000;

// Module-scoped cache: many components fail at once during an outage (that is what an outage IS) —
// they must share one probe, not stampede /api/health.
let cachedTruth: ConnectionTruth = "unknown";
let cachedAt = 0;
let inFlight: Promise<ConnectionTruth> | null = null;
// Bumped on every online/offline transition: a probe that STARTED before the transition must not
// commit its now-stale verdict after it (pre-PR review) — the writer checks the epoch it captured.
let epoch = 0;

async function probe(): Promise<ConnectionTruth> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "you-offline";
  if (Date.now() - cachedAt < PROBE_TTL_MS) return cachedTruth;
  if (inFlight) return inFlight;
  const startedEpoch = epoch;
  inFlight = (async () => {
    let verdict: ConnectionTruth = "unknown";
    try {
      const res = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      // "we-down" requires a PARSED verdict from our own probe. A captive portal answers 200 HTML
      // for any URL (restaurant guest wifi) — json() throwing, or a non-ok status, must never be
      // read as proof that WE are down: it isn't proof of anything, so it stays "unknown" and the
      // copy stays neutral (pre-PR review — the old catch asserted "it's not your connection" to
      // a diner whose fix was the portal login page).
      const j = res.ok ? ((await res.json()) as { db?: string }) : null;
      verdict = j?.db === "down" ? "we-down" : "unknown";
    } catch {
      verdict = "unknown"; // probe unreachable/unparseable — no verdict, neutral copy
    }
    inFlight = null;
    if (epoch !== startedEpoch) {
      // Connectivity flipped WHILE this probe was in flight: its verdict is about a network that
      // no longer exists. Don't cache it, and don't return the previous `cachedTruth` either —
      // `diagnose()` commits whatever we return, so a stale value would overwrite the fresher
      // truth the transition handler just set (traced: an offline flip mid-probe came back as
      // "we-down", losing "you-offline"). Re-derive from what is true NOW.
      return typeof navigator !== "undefined" && navigator.onLine === false
        ? "you-offline"
        : "unknown";
    }
    cachedTruth = verdict;
    cachedAt = Date.now();
    return verdict;
  })();
  return inFlight;
}

export function useConnectionTruth(): {
  truth: ConnectionTruth;
  /** Call when a request just failed — resolves (and re-renders with) the current truth. */
  diagnose: () => Promise<ConnectionTruth>;
} {
  const [truth, setTruth] = useState<ConnectionTruth>("unknown");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const onOnline = () => {
      epoch += 1; // void the cache AND any in-flight probe's pending verdict
      cachedAt = 0;
      if (mounted.current) setTruth("unknown");
    };
    const onOffline = () => {
      epoch += 1;
      cachedAt = 0;
      if (mounted.current) setTruth("you-offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const diagnose = useCallback(async () => {
    const t = await probe();
    if (mounted.current) setTruth(t);
    return t;
  }, []);

  return { truth, diagnose };
}

/**
 * The copy matrix, in ONE place so surfaces can't drift (the audit found six divergent
 * connection-blaming strings). `what` names the failed thing in the surface's own vocabulary
 * ("add that", "load the menu", "check your basket").
 */
export function failureCopy(truth: ConnectionTruth, what: string): string {
  switch (truth) {
    case "you-offline":
      return `You look offline — couldn’t ${what}. Reconnect and try again.`;
    case "we-down":
      return `We’re having trouble on our end — couldn’t ${what}. It’s not your connection; hang tight and try again in a bit.`;
    default:
      return `Couldn’t ${what} just now — try again.`;
  }
}

// ── Phase 2b · feedback ──
/**
 * The DEVICE's offline truth for the staff console's chrome — the `you-offline` fact above, read as
 * a store instead of an event handler. `useConnectionTruth` starts every mount at `unknown` and
 * changes only on an online/offline EVENT, so a soft navigation (the staff bar remounts per page)
 * forgot an outage that was already under way, and an event fired while the page sat in bfcache was
 * never seen. Here:
 *
 *  - `offlineSince` is MODULE state, so a remount keeps the clock (the sustain does not restart);
 *  - every read is `navigator.onLine` itself, re-synced on `online`, `offline` and `pageshow` (a
 *    bfcache restore) and at the first subscribe — never a stale copy of the last event;
 *  - the server snapshot is `online`, so SSR and hydration never draw an offline state.
 *
 * The verdict is `offlineSustained` (lib/live-connection.ts): true only after `sustainMs` of
 * UNBROKEN offline, so a one-second wifi blip never flaps a row. One timer re-checks at
 * `offlineSince + sustainMs`; nothing reads a clock during render except the lazy first state.
 */
let offlineSince: number | null = null;
const netListeners = new Set<() => void>();

/** Re-read the device; true when `offlineSince` changed. */
function syncOffline(): boolean {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const next = online ? null : (offlineSince ?? Date.now());
  if (next === offlineSince) return false;
  offlineSince = next;
  return true;
}
function onNetChange() {
  if (syncOffline()) for (const l of netListeners) l();
}
function subscribeNet(listener: () => void): () => void {
  netListeners.add(listener);
  if (netListeners.size === 1) {
    window.addEventListener("online", onNetChange);
    window.addEventListener("offline", onNetChange);
    window.addEventListener("pageshow", onNetChange);
  }
  // An outage that began while nothing was listening (a device already offline at the first
  // mount) starts its clock HERE — and every listener hears it, not only this one.
  onNetChange();
  return () => {
    netListeners.delete(listener);
    if (netListeners.size === 0) {
      window.removeEventListener("online", onNetChange);
      window.removeEventListener("offline", onNetChange);
      window.removeEventListener("pageshow", onNetChange);
    }
  };
}
const readOfflineSince = () => offlineSince;
const serverOfflineSince = () => null;

export function useDeviceOffline(sustainMs = NET_SHOW_MS): boolean {
  const since = useSyncExternalStore(subscribeNet, readOfflineSince, serverOfflineSince);
  // The `since` whose sustain has been SEEN to elapse. A remount mid-outage (a soft navigation)
  // starts already shown, so the row never blinks out and back across a page change.
  const [shownFor, setShownFor] = useState<number | null>(() =>
    offlineSustained(since, Date.now(), sustainMs) ? since : null,
  );
  useEffect(() => {
    if (since === null || shownFor === since) return;
    const id = setTimeout(
      () => setShownFor(offlineSustained(since, Date.now(), sustainMs) ? since : null),
      Math.max(0, since + sustainMs - Date.now()),
    );
    return () => clearTimeout(id);
  }, [since, shownFor, sustainMs]);
  return since !== null && shownFor === since;
}
