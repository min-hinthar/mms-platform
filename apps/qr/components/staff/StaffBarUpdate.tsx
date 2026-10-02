"use client";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@mms/ui";
import {
  clearRefusal,
  dispatchUpdate,
  readGuardInput,
  subscribeUpdate,
  updateSnapshot,
} from "@/lib/app-update";
import { monoNow } from "@/lib/bounded-write";
import {
  blockKey,
  reloadHolds,
  subscribeReloadHolds,
  type ApplyBlock,
  type GuardInput,
  type Hold,
} from "@/lib/reload-guard";
import { COUNTDOWN_MS, CURRENT, type UpdatePhase } from "@/lib/update-policy";
import { useDeviceOffline } from "@/lib/useConnectionTruth";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * Phase 2i (P2bi) — "A new version of this screen is ready. [Reload the page]": the staff bar's
 * row for a new build, mounted by `StaffBar` between the reader chip and the offline row (which
 * stays LAST). It WIRES the update store (`lib/app-update.ts`) and decides nothing a pure module
 * could: the verdict on a tap is read INSIDE the executor at the tap and again after its awaits —
 * never from this render — so the Reload button is never render-time disabled. Two taps in one
 * frame are one apply because the store's reducer ignores a tap while applying and the executor
 * holds a module latch; a component ref here would be a second guard nothing could ever reach.
 *
 * WHAT IT SAYS, by phase:
 *  - current — nothing (and nothing while the device is offline: the offline row speaks then, and
 *    a reload offline would land on the worker's offline page).
 *  - stale — the plain line, plus the sound sentence while a board's sound is live (the reload
 *    turns it off until someone turns it on again — the cost a person must hear BEFORE tapping).
 *  - retired — this screen's taps may not save: the warn tone, said ONCE as an alert when the phase
 *    flips (never again on a later re-render or after a refusal clears).
 *  - countdown — the automatic reload's visible seconds and [Not now]. The ticking line is
 *    `aria-hidden`; ONE sr-only alert is born with the countdown and says it in words.
 *  - applying — the button busy, "Reloading…".
 *
 * A REFUSED tap replaces the line in the SAME position with `role="alert"` (the LockButton idiom:
 * one element, never said twice). The store keeps a refusal until the next tap, so the row clears it
 * (`clearRefusal`) the moment what it says stops being true — re-checked on every store and hold
 * notification and once a second while it shows (a young write leaving the ledger notifies nothing
 * here).
 *
 * a11y (QA §A): the standing row is NOT a live region; the kit Button (`size="lg"`, 44px floor,
 * aria-disabled/aria-busy, never native disabled); names are `<Chrome>` text; focus never moves.
 * Motion: the entrance is `.mms-rise` (RM-gated by the kit); the countdown does not animate.
 */

type Snapshot = ReturnType<typeof updateSnapshot>;
const SERVER: Snapshot = { phase: CURRENT, refusal: null };
const NO_HOLDS: readonly Hold[] = [];
const serverSnapshot = () => SERVER;
const serverHolds = () => NO_HOLDS;

/** How often the countdown's seconds and a standing refusal are re-read. */
const TICK_MS = 250;
const REFUSAL_RECHECK_MS = 1_000;

/**
 * Does a refusal the row is showing still hold? Only for a STALE screen (a countdown or an apply
 * supersedes what a tap was told). The blocks a re-read can see are re-read: offline, a young write
 * saving, an unsent hold of the same reason (a retired screen skips stashed work, as the verdict
 * does). The pre-flight's own findings — the order system not answering, the new version not
 * reachable — cannot be re-checked without another fetch, so they stand until the next tap.
 */
export function refusalStands(block: ApplyBlock, phase: UpdatePhase, i: GuardInput): boolean {
  if (phase.k !== "stale") return false;
  switch (block.kind) {
    case "offline":
      return !i.online;
    case "saving":
      return i.youngWrite;
    case "hold":
      return i.holds.some(
        (h) => h.kind === "unsent" && h.reason === block.reason && !(i.retired && h.survives),
      );
    default:
      return true;
  }
}

/** Whole seconds left on the countdown, never below 1 while it shows. */
function secondsLeft(endsAt: number, now: number): number {
  return Math.max(1, Math.ceil((endsAt - now) / 1_000));
}

/**
 * The standing line. Its alert is decided ONCE, at its mount, and kept for its life: removing a live
 * role from a node already announced is not something to rely on, and re-adding it on a re-render
 * would re-announce. A retired line is born an alert unless this screen already said it.
 */
function StandingLine({
  lang,
  retired,
  said,
  onSaid,
  children,
}: {
  lang: StaffLang;
  retired: boolean;
  said: boolean;
  onSaid: () => void;
  children: ReactNode;
}) {
  const [alert] = useState(() => retired && !said);
  useEffect(() => {
    if (alert) onSaid();
  }, [alert, onSaid]);
  return (
    <p className="staff-update-line" role={alert ? "alert" : undefined}>
      <Chrome lang={lang} k={retired ? "shell.version.retired" : "shell.version.ready"} />
      {children}
    </p>
  );
}

export function StaffBarUpdate({ lang }: { lang: StaffLang }) {
  const { phase, refusal } = useSyncExternalStore(subscribeUpdate, updateSnapshot, serverSnapshot);
  const holds = useSyncExternalStore(subscribeReloadHolds, reloadHolds, serverHolds);
  const offline = useDeviceOffline();
  const retired = phase.k !== "current" && phase.retired;

  // The countdown's clock, never read during render: a new countdown starts its seconds at its own
  // start (`endsAt − COUNTDOWN_MS`, the moment the reducer set it), and a timer re-reads the clock
  // while it shows. (The "adjust state while rendering" shape — React re-runs this render first.)
  const endsAt = phase.k === "countdown" ? phase.endsAt : null;
  const [clock, setClock] = useState<{ endsAt: number | null; now: number }>({
    endsAt: null,
    now: 0,
  });
  let now = clock.now;
  if (endsAt !== null && clock.endsAt !== endsAt) {
    now = endsAt - COUNTDOWN_MS;
    setClock({ endsAt, now });
  }
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setClock({ endsAt, now: monoNow() }), TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);

  // A refusal is cleared the moment what it says stops being true (S0 critic: the store clears it
  // only on the next tap).
  useEffect(() => {
    if (refusal === null) return;
    const recheck = () => {
      const input = readGuardInput({ doc: document, nav: navigator, retired });
      if (!refusalStands(refusal, phase, input)) clearRefusal();
    };
    recheck();
    const id = setInterval(recheck, REFUSAL_RECHECK_MS);
    return () => clearInterval(id);
  }, [refusal, phase, holds, retired]);

  // The retired line is an alert ONCE: the first retired line this screen mounts is born an alert
  // (and stays one for its life); a later one — after a refusal cleared — is a plain line.
  const [retiredSaid, setRetiredSaid] = useState(false);
  const onRetiredSaid = useCallback(() => setRetiredSaid(true), []);
  // A screen that came back current re-arms it: a LATER retirement is news again.
  if (phase.k === "current" && retiredSaid) setRetiredSaid(false);
  const refusalKey = refusal === null ? null : blockKey(refusal);

  if (phase.k === "current" || offline) return null;

  const soundLive = holds.some((h) => h.kind === "sound");
  const sound = soundLive ? (
    <>
      {" "}
      <Chrome lang={lang} k="shell.version.sound" />
    </>
  ) : null;

  let line = null;
  if (phase.k === "stale" && refusalKey !== null) {
    line = (
      <p role="alert" className="staff-update-line staff-bar-msg">
        <Chrome lang={lang} k={refusalKey} />
      </p>
    );
  } else if (phase.k === "stale") {
    line = (
      // Keyed on the tone: the flip to retired MOUNTS a new line, which decides its alert at birth.
      <StandingLine
        key={retired ? "retired" : "ready"}
        lang={lang}
        retired={retired}
        said={retiredSaid}
        onSaid={onRetiredSaid}
      >
        {sound}
      </StandingLine>
    );
  } else if (phase.k === "countdown") {
    line = (
      <>
        <p className="staff-update-line">
          <span aria-hidden>
            <Chrome
              lang={lang}
              k="shell.version.countdown"
              vars={{ n: secondsLeft(phase.endsAt, now) }}
            />
          </span>
          {sound}
        </p>
        <p role="alert" className="sr-only">
          <Chrome lang={lang} k="shell.version.countdown.sr" />
        </p>
      </>
    );
  }

  return (
    <div className="staff-update mms-rise" data-tone={retired ? "warn" : undefined}>
      {line}
      <div className="staff-update-acts">
        {phase.k === "countdown" && (
          <Button
            variant="quiet"
            size="lg"
            onClick={() => dispatchUpdate({ e: "notNow", now: monoNow() })}
          >
            <Chrome lang={lang} k="shell.version.notNow" echo="stack" />
          </Button>
        )}
        <Button
          variant="secondary"
          size="lg"
          busy={phase.k === "applying"}
          busyLabel={<Chrome lang={lang} k="shell.version.reloading" />}
          onClick={() => dispatchUpdate({ e: "tap" })}
        >
          <Chrome lang={lang} k="out.reload" echo="stack" />
        </Button>
      </div>
    </div>
  );
}
