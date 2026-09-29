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
  type SoundPosture,
} from "@/lib/counter-chime";
import {
  armWithin,
  counterArmed,
  counterSoundServerSnapshot,
  getCounterWanted,
  playCounter,
  setCounterWanted,
  subscribeCounterArmed,
  subscribeCounterWanted,
} from "@/lib/counter-sound";
import { ERR_DWELL_MS } from "@/lib/kds-errors";
import { haptic } from "@/lib/haptics";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";

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
 *   · `useCounterAttention` — a board's ear: its per-mount seen set, seeded with the board's first
 *     good facts, heard on every GOOD poll. Outside the provider it still reports the news (the
 *     lane's one-shot card ring is the visible half and never depends on sound) and rings nothing.
 *   · `CounterSoundChip` — the counter's own control, beside the greeting (not a bar circle: the KDS
 *     rule, and a fifth circle overflows a 390 manager bar). An honest three-way chip: "Enable sound"
 *     · "Sound on" (the one lit cap) · "Sound off — tap to turn on" (warn). iOS arms audio only
 *     inside a tap, so the chip's tap IS the arming — and the moment the bell is armed it plays the
 *     guest phrase once: the tap is the volume check.
 *
 * Sound is never the only feedback (§15): every event that rings already has a visible half — the
 * floor card's status ring and chip, the lane card's ring and its "Here now" / "Kitchen done" badge.
 */

type Bell = { ring: (kind: CounterRingKind) => void };
const BellContext = createContext<Bell | null>(null);

/** The chip's marker (`data-counter-sound` on the chip below): a tap on the chip is the chip's own
 *  arm, with its lock — never the page's background re-arm. */
const CHIP_SELECTOR = "[data-counter-sound]";

/** §15 — "wanted" and "armed" are two stores, read through `useSyncExternalStore` (the store, not
 *  a mirror), both off on the server. */
function useSoundPosture(): SoundPosture {
  const wanted = useSyncExternalStore(
    subscribeCounterWanted,
    getCounterWanted,
    counterSoundServerSnapshot,
  );
  const armed = useSyncExternalStore(
    subscribeCounterArmed,
    counterArmed,
    counterSoundServerSnapshot,
  );
  return soundPosture(wanted, armed);
}

export function CounterBellProvider({ children }: { children: ReactNode }) {
  const posture = useSoundPosture();
  // The last ring the provider PLAYED (a refused or silent ring records nothing). Monotonic clock:
  // a gap is a duration, and the device's wall clock can jump.
  const last = useRef<{ ring: CounterRingKind; at: number } | null>(null);
  const ring = useCallback((kind: CounterRingKind) => {
    // Re-read at the instant of the ring, never captured: a mute on the chip or a context that
    // suspended a moment ago is the truth now.
    if (soundPosture(getCounterWanted(), counterArmed()) !== "on") return;
    const now = performance.now();
    if (!mayRing(last.current, kind, now)) return;
    last.current = { ring: kind, at: now };
    playCounter(kind);
  }, []);
  const bell = useMemo(() => ({ ring }), [ring]);

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
 * A board's ear. `seed` returns the board's first GOOD facts — or null when it has none yet (a lane
 * that mounted into an outage), and then its first good poll seeds instead. Call the returned
 * `hear(facts)` on every GOOD poll and never on a failed one (a frozen board reports nothing): it
 * rings through the provider when a key is news, and returns the news so the board can light the
 * cards it is about.
 *
 * The seed runs once per mount (a lazy state initializer: pure, so a StrictMode double render seeds
 * the same set), and the set lives in a ref the poll's callback owns — never written in render.
 */
export function useCounterAttention(
  seed: () => CounterFacts | null,
): (next: CounterFacts) => ReadonlySet<string> {
  const bell = useContext(BellContext);
  const [first] = useState(() => {
    const facts = seed();
    return facts === null ? null : counterRing(null, facts).seen;
  });
  const seen = useRef<ReadonlySet<string> | null>(first);
  return useCallback(
    (next: CounterFacts) => {
      const r = counterRing(seen.current, next);
      seen.current = r.seen;
      if (r.ring !== null) bell?.ring(r.ring);
      return r.fresh;
    },
    [bell],
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

  const word =
    posture === "on"
      ? "board.sound.on"
      : posture === "paused"
        ? "kds.sound.off"
        : "kds.sound.enable";
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
        <p role="alert" className="staff-sound-line staff-sound-line-warn">
          <Chrome lang={lang} k="floor.sound.refused" />
        </p>
      ) : line?.kind === "hint" ? (
        <p className="staff-sound-line">
          <Chrome lang={lang} k="floor.sound.hint" />
        </p>
      ) : null}
    </>
  );
}
