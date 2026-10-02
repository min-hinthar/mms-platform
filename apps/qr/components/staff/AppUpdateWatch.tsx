"use client";
import { useEffect } from "react";
import {
  RELOAD_STUCK_MS,
  afterLoad,
  dispatchUpdate,
  installApplyDeps,
  makeFetchServed,
  markAppliedIn,
  noteInput,
  onCheckRequested,
  readGuardInput,
  subscribeUpdate,
  triedTargetIn,
  updateSnapshot,
} from "@/lib/app-update";
import { monoNow, onTrackedRejection } from "@/lib/bounded-write";
import { CLIENT_BUILD } from "@/lib/build-stamp";
import { autoBlock } from "@/lib/reload-guard";
import { isRetiredActionError } from "@/lib/retired-action";
import { tabStore } from "@/lib/settled-view";
import { VERSION_POLL_MS } from "@/lib/update-policy";
import { freshTruth } from "@/lib/useConnectionTruth";

/** How often the automatic path re-reads its verdict while a new version waits (and the screen is
 *  seen). Drives the countdown's START and its END only: a countdown tick that changes nothing
 *  publishes nothing (`stepUpdate` returns the same phase; `publish` drops it), so no subscriber
 *  re-renders each second. A surface that SHOWS the seconds runs its own clock from `endsAt`. */
export const WATCH_TICK_MS = 1_000;

/** Input that keeps the screen "in use": a tap, a key, a touch — and a wheel or trackpad scroll
 *  (someone reading a long list on a counter terminal is using it, with no click). */
const INPUT_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

/**
 * Phase 2i (P2bi) — the staff screens' version watcher. Renders NOTHING; mounted ONCE in
 * `app/staff/layout.tsx`, the one tree no staff navigation leaves, so one watcher serves every
 * staff page of the tab for the life of the document.
 *
 * It only WIRES: every decision is the contract's (`lib/app-update.ts` — the store and the one
 * executor; `lib/update-policy.ts` — when; `lib/reload-guard.ts` — whether). At mount it:
 *  - settles the one-shot record (`afterLoad`): a reload that ARRIVED at its target clears it;
 *  - installs the executor's live dependencies — the fetch is `makeFetchServed` (no-store, no
 *    credentials, strict) and the health read is `freshTruth` (never the 15s cache);
 *  - hears every tracked rejection, and one `UnrecognizedActionError` marks the tab retired;
 *  - asks `/api/version` every VERSION_POLL_MS while the screen is SEEN and the device ONLINE, and
 *    at once on becoming visible, on `online`, on a `pageshow` that RESTORED the page from the
 *    back-forward cache (`persisted` — the first load's own pageshow is not one; it can fire after
 *    this effect when images are still loading), and when the reducer asks (`check`) — one request
 *    at a time. Never at mount: a document that just loaded IS the served build;
 *  - feeds input (pointer, key, touch, wheel — capture, passive) to the quiet clock and the countdown;
 *  - ticks every WATCH_TICK_MS only while a new version waits AND the screen is seen.
 *
 * Inert in a bundle with no stamp (dev, tests, a stampless build): such a screen cannot say which
 * build it is, so it never calls itself stale — and with no executor installed a tap is refused.
 * `own` is this bundle's build (`CLIENT_BUILD`); the layout never passes it — it is the seam a
 * suite uses, because `CLIENT_BUILD` is fixed when the module loads.
 *
 * ⚠️ Everything is armed in the effect's SETUP and released in its cleanup; nothing is latched in a
 * cleanup (Strict Mode runs setup → cleanup → setup, and a latch set in a cleanup would stay set).
 */
export function AppUpdateWatch({ own = CLIENT_BUILD }: { own?: string | null }): null {
  useEffect(() => {
    if (own === null) return;
    afterLoad(tabStore(), own);

    const retired = () => {
      const p = updateSnapshot().phase;
      return p.k !== "current" && p.retired;
    };
    let disposed = false;
    // An attempt already past its awaits when this watcher unmounts re-reads the verdict through
    // HERE before it marks, freezes or reloads: a gone watcher's input cannot be read, the executor
    // catches the throw (refused, latch released), and no page this watcher no longer serves is
    // reloaded.
    const guardInput = () => {
      if (disposed) throw new Error("AppUpdateWatch: unmounted");
      return readGuardInput({ doc: document, nav: navigator, retired: retired() });
    };
    // Read `fetch` at the call, so the request is whatever the page's fetch is NOW.
    const fetchServed = makeFetchServed((input, init) => fetch(input, init), own);
    const uninstall = installApplyDeps({
      guardInput,
      online: () => navigator.onLine !== false,
      fetchServed,
      freshTruth,
      triedTarget: (build) => triedTargetIn(tabStore(), build),
      markApplied: (build) => markAppliedIn(tabStore(), build),
      freeze: () => {
        document.body.inert = true;
        document.documentElement.dataset.reloading = "";
      },
      reload: () => {
        location.reload();
        // One re-issue: a document fetch that hangs would otherwise leave the inert page standing.
        window.setTimeout(() => location.reload(), RELOAD_STUCK_MS);
      },
    });

    const offRejection = onTrackedRejection((error) => {
      if (isRetiredActionError(error)) dispatchUpdate({ e: "retired", now: monoNow() });
    });

    // ── the version check ──
    let checking = false;
    const check = () => {
      if (checking) return;
      if (document.visibilityState !== "visible") return;
      if (navigator.onLine === false) return;
      checking = true;
      // `makeFetchServed` never rejects (anything unexpected is "unknown"); the second arm only
      // frees the one-at-a-time latch if that ever changes.
      fetchServed().then(
        (v) => {
          checking = false;
          if (!disposed) dispatchUpdate({ e: "verdict", v, now: monoNow() });
        },
        () => {
          checking = false;
        },
      );
    };
    const poll = window.setInterval(check, VERSION_POLL_MS);
    const offCheck = onCheckRequested(check);

    // ── the tick: only while a new version waits and the screen is seen ──
    let tick: number | null = null;
    const onTick = () => {
      const p = updateSnapshot().phase;
      if (p.k !== "stale" && p.k !== "countdown") return;
      const autoClear = autoBlock(guardInput()) === null;
      const tried = p.served !== null && triedTargetIn(tabStore(), p.served.build);
      dispatchUpdate({ e: "tick", now: monoNow(), autoClear, tried });
    };
    const syncTick = () => {
      const k = updateSnapshot().phase.k;
      const want = (k === "stale" || k === "countdown") && document.visibilityState === "visible";
      if (want && tick === null) tick = window.setInterval(onTick, WATCH_TICK_MS);
      else if (!want && tick !== null) {
        window.clearInterval(tick);
        tick = null;
      }
    };
    const offUpdate = subscribeUpdate(syncTick);
    syncTick();

    // ── input, visibility, the network ──
    const onInput = () => {
      noteInput();
      dispatchUpdate({ e: "input" });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
      // A countdown nobody can see must never complete: hidden cancels it, like a touch.
      else dispatchUpdate({ e: "input" });
      syncTick();
    };
    for (const type of INPUT_EVENTS)
      window.addEventListener(type, onInput, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", check);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      disposed = true;
      uninstall();
      offRejection();
      offCheck();
      offUpdate();
      window.clearInterval(poll);
      if (tick !== null) window.clearInterval(tick);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", check);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [own]);
  return null;
}
