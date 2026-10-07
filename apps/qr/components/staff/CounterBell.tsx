"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Icon } from "@mms/ui";
import {
  counterRing,
  mayRing,
  type CounterFacts,
  type CounterRingKind,
} from "@/lib/counter-attention";
import {
  SOUND_HINT_MS,
  soundPosture,
  soundTapIntent,
  soundWord,
  type SoundPosture,
} from "@/lib/counter-chime";
import {
  armWithin,
  counterArmed,
  counterHeard,
  counterSoundServerSnapshot,
  getCounterWanted,
  playCounter,
  rememberCounterHeard,
  setCounterWanted,
  subscribeCounterArmed,
  subscribeCounterWanted,
} from "@/lib/counter-sound";
import { ERR_DWELL_MS } from "@/lib/kds-errors";
import { haptic } from "@/lib/haptics";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { useReloadHold } from "./useReloadHold";

/**
 * Phase 2d · bell — the counter bell (owner decision 5c, 2026-09-29): on the counter HOME only,
 * ringing while the tab is hidden too, for a GUEST (a pay-at-counter ask, "I'm here", a scan-and-go
 * basket at the exit) and for FOOD (a to-go bag done); a fixed 0.6; the `playback` audio session so
 * the silent switch does not mute it; no nag.
 *
 * Three pieces, one file:
 *   · `CounterBellProvider` — mounted by the counter branch of `/staff` INSIDE its
 *     LiveConnectionProvider. It owns the ONE ring gate (`mayRing`: one ring per kind per gap across
 *     both boards) and, while the bell is PAUSED, the silent re-arm off the next tap anywhere.
 *   · `useCounterAttention` — a board's ear: its first good facts merged, silently, into what this
 *     DOCUMENT has already heard (`counterHeard`, `lib/counter-sound.ts`), and every GOOD poll heard
 *     against that set — so a remount never re-rings. Outside the provider it still reports the news
 *     (the lane's one-shot card ring is the visible half and never depends on sound) and rings nothing.
 *   · `CounterSoundChip` — the counter's own control, beside the greeting (not a bar circle: the KDS
 *     rule, and a fifth circle overflows a 390 manager bar). An honest three-way chip: "Turn on sound"
 *     · "Sound on" (the one lit cap) · "Sound off — tap to turn on" (warn). iOS arms audio only
 *     inside a tap, so the chip's tap IS the arming — and the moment the bell is armed it plays the
 *     guest phrase once: the tap is the volume check.
 *
 * Sound is never the only feedback (§15): every event that rings already has a visible half — the
 * floor card's status ring and chip, the lane card's ring and its "Here now" / "Kitchen done" badge.
 * So the bell is silent while that half is off screen: below 48em a table open in the counter's
 * split covers the whole column (`useCounterBellCover`, `counterColumnShown`).
 */

/** `cover` — Phase 2d · review fixes: a probe that says the counter column is covered right now
 *  (registered by the split; the returned function unregisters it). */
type Bell = {
  ring: (kind: CounterRingKind) => void;
  cover: (covered: () => boolean) => () => void;
};
const BellContext = createContext<Bell | null>(null);

/** The chip's marker (`data-counter-sound` on the chip below): a tap on the chip is the chip's own
 *  arm, with its lock — never the page's background re-arm. */
const CHIP_SELECTOR = "[data-counter-sound]";

/** Is the context running right now — the store, not a mirror (off on the server). */
function useCounterArmed(): boolean {
  return useSyncExternalStore(subscribeCounterArmed, counterArmed, counterSoundServerSnapshot);
}

/** §15 — "wanted" and "armed" are two stores, read through `useSyncExternalStore` (the store, not
 *  a mirror), both off on the server. */
function useSoundPosture(): SoundPosture {
  const wanted = useSyncExternalStore(
    subscribeCounterWanted,
    getCounterWanted,
    counterSoundServerSnapshot,
  );
  return soundPosture(wanted, useCounterArmed());
}

export function CounterBellProvider({ children }: { children: ReactNode }) {
  const posture = useSoundPosture();
  // Phase 2i (P2bi) — a live bell holds the automatic reload for a new build: the reload turns the
  // sound off, and nobody would hear the next guest until a person turns it on again.
  useReloadHold("sound", "bellSound", "counter", posture === "on");
  // The last ring the provider PLAYED (a refused or silent ring records nothing). Monotonic clock:
  // a gap is a duration, and the device's wall clock can jump.
  const last = useRef<{ ring: CounterRingKind; at: number } | null>(null);
  // Is the counter home still here? A board's poll that lands after the view left (a tap into
  // /staff/table/7 while `getExpoQueue` was in flight) still holds this `ring`, and the engine it
  // plays through is a document singleton that stays armed — so without this the bell rang on the
  // table page (owner decision 5c: the counter home only). Re-armed at setup, never latched only in
  // the cleanup: StrictMode replays the effect as cleanup → setup.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Phase 2d · review fixes — below 48em a selected table TAKES the counter's column (the boards
  // stay mounted and polling, not displayed), so the card ring and chip a ring is announcing are
  // not on screen. Sound is never the only feedback (§15): no ring while covered. Nothing is owed
  // later either — the board's ear recorded the facts as heard before it asked for this ring.
  const covers = useRef(new Set<() => boolean>());
  const cover = useCallback((covered: () => boolean) => {
    covers.current.add(covered);
    return () => {
      covers.current.delete(covered);
    };
  }, []);
  const ring = useCallback((kind: CounterRingKind) => {
    if (!mounted.current) return;
    // Read at the instant of the ring (a rotation reflows the split without a render here).
    for (const covered of covers.current) if (covered()) return;
    // Re-read at the instant of the ring, never captured: a mute on the chip or a context that
    // suspended a moment ago is the truth now. Nothing here reads whether the tab is VISIBLE: the
    // counter bell rings while the tab is hidden (owner decision 5c).
    if (soundPosture(getCounterWanted(), counterArmed()) !== "on") return;
    const now = performance.now();
    if (!mayRing(last.current, kind, now)) return;
    last.current = { ring: kind, at: now };
    playCounter(kind);
  }, []);
  const bell = useMemo(() => ({ ring, cover }), [ring, cover]);

  // PAUSED — the counter wanted the bell and the context is not running (a reload, a slept tablet, a
  // call). The first click or key anywhere else on the page re-arms it SILENTLY (nobody asked for a
  // tone), and so does the tab coming back into view (an interrupted context does not resume
  // itself). Both are lock-free: the chip's busy state is the chip's own tap's, never these.
  useEffect(() => {
    if (posture !== "paused") return;
    const rearm = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(CHIP_SELECTOR)) return;
      void armWithin();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void armWithin();
    };
    document.addEventListener("click", rearm, true);
    document.addEventListener("keydown", rearm, true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("click", rearm, true);
      document.removeEventListener("keydown", rearm, true);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [posture]);

  return <BellContext.Provider value={bell}>{children}</BellContext.Provider>;
}

/**
 * Phase 2d · review fixes — the counter's split tells the bell when it covers the counter column
 * (`covered`, read at the instant of each ring). Outside the provider it does nothing.
 */
export function useCounterBellCover(covered: () => boolean): void {
  const bell = useContext(BellContext);
  useEffect(() => bell?.cover(covered), [bell, covered]);
}

/** A seeding call's answer: nothing is news. */
const NO_NEWS: ReadonlySet<string> = new Set();

/**
 * A board's ear. `seed` returns the board's first GOOD facts — or null when it has none yet (a lane
 * that mounted into an outage), and then its first good poll seeds instead. Call the returned
 * `hear(facts)` on every GOOD poll and never on a failed one (a frozen board reports nothing): it
 * rings through the provider when a key is news, and returns the news so the board can light the
 * cards it is about.
 *
 * News is judged against what this DOCUMENT has heard (`counterHeard`), never a per-mount set: the
 * mount's seed is merged INTO it — silently, on the first `hear` — and every good poll grows it. So
 * a remount carrying a stale `initial` (Back restores the counter home's first-load props) never
 * re-rings a fact any earlier mount rang for.
 *
 * `seed` runs once per mount (a lazy state initializer, pure: a StrictMode double render computes the
 * same facts), and the document set is written only from the poll's callback — never in render.
 */
export function useCounterAttention(
  seed: () => CounterFacts | null,
): (next: CounterFacts) => ReadonlySet<string> {
  const bell = useContext(BellContext);
  const [first] = useState(seed);
  const seeded = useRef(false);
  return useCallback(
    (next: CounterFacts) => {
      if (!seeded.current) {
        seeded.current = true;
        // The mount's own facts are never news — added to what the document heard, never replacing
        // it. A board with no facts of its own yet (null) takes its first good poll as the seed.
        const base = first ?? next;
        rememberCounterHeard(counterRing(null, base).seen);
        if (first === null) return NO_NEWS;
      }
      const r = counterRing(counterHeard(), next);
      rememberCounterHeard(r.seen);
      if (r.ring !== null) bell?.ring(r.ring);
      return r.fresh;
    },
    [bell, first],
  );
}

/** The chip's one transient line: the post-arm hint (plain, not live) or the refusal (an alert,
 *  mounted only when there is one). */
type SoundLine = { kind: "hint" | "refused" };

export function CounterSoundChip() {
  const lang = useStaffLang();
  const posture = useSoundPosture();
  // §17 — busy is the attribute and the dim, the label kept; the in-flight guard is a REF read at
  // tap time (the state is only what renders).
  const arming = useRef(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<SoundLine | null>(null);
  useEffect(() => {
    if (line === null) return;
    const id = setTimeout(
      () => setLine((l) => (l === line ? null : l)),
      line.kind === "hint" ? SOUND_HINT_MS : ERR_DWELL_MS,
    );
    return () => clearTimeout(id);
  }, [line]);
  // Render-time adjustment (guarded set-during-render): a refusal is only true while the context is
  // NOT running. A resume the browser left pending past ARM_TIMEOUT_MS can still land (`armWithin`);
  // on a PAUSED chip that lights the cap, and "tap to try again" beside a lit chip sends the tap that
  // MUTES it. So the refusal is DROPPED — not merely hidden, or a context that pauses again inside
  // the dwell would bring back a stale alert — the moment the store says the context runs.
  const armed = useCounterArmed();
  if (line?.kind === "refused" && armed) setLine(null);
  // Is the chip still on the screen? The arm's answer can land after the counter home was left (a
  // tap, then straight into a table inside ARM_TIMEOUT_MS): the answer is kept, but the volume-check
  // tone is not played on a page that has no bell. Re-armed at setup (StrictMode's replay).
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onTap = () => {
    if (arming.current) return;
    // The intent is read from the stores at the tap, not from the render that drew the chip.
    if (soundTapIntent(soundPosture(getCounterWanted(), counterArmed())) === "mute") {
      haptic("pick"); // the chip leaving the lit cap is the visible half
      setCounterWanted(false);
      setLine(null);
      return;
    }
    arming.current = true;
    setBusy(true);
    setLine(null);
    // Synchronously, inside this handler: the resume must ride the tap (iOS arms audio nowhere else).
    // `armWithin` never rejects — the engine answers false for any failure and the timer bounds it.
    void armWithin().then((ok) => {
      arming.current = false;
      setBusy(false);
      if (!live.current) {
        if (ok) setCounterWanted(true); // the tap asked for the bell, and it armed: say so on return
        return;
      }
      if (!ok) {
        // Never blames the volume or the silent switch: neither can refuse an arm.
        setLine({ kind: "refused" });
        return;
      }
      setCounterWanted(true);
      haptic("pick"); // …with the chip lighting as its visible half
      playCounter("guest"); // the tap IS the volume check
      setLine({ kind: "hint" });
    });
  };

  // Phase 3d — the one word map (`lib/counter-chime.ts`), shared with the kitchen's bar circle.
  const word = soundWord(posture);
  return (
    <>
      <button
        type="button"
        className="staff-chip staff-sound-chip"
        data-counter-sound=""
        aria-pressed={posture === "on"}
        data-muted={posture === "paused" || undefined}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={onTap}
      >
        <Icon name={posture === "on" ? "volume" : "volume-off"} size={18} />
        <Chrome lang={lang} k={word} />
      </button>
      {line?.kind === "refused" ? (
        <p role="alert" className="staff-sound-line staff-sound-line-warn mms-rise">
          <Chrome lang={lang} k="floor.sound.refused" />
        </p>
      ) : line?.kind === "hint" ? (
        <p className="staff-sound-line mms-rise">
          <Chrome lang={lang} k="floor.sound.hint" />
        </p>
      ) : null}
    </>
  );
}
