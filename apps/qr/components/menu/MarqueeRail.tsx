"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Rail } from "../Rail";

/**
 * W22 — the drifting card rail (owner: "two independent moving and micro-interactions rows").
 * A start-here rail that AMBIENTLY drifts sideways like a slow conveyor, looping seamlessly via a
 * duplicated card set. Built on the native scroller (not a transform track) so every existing
 * behavior survives: manual swipe, the <Rail> chevron nudges, keyboard tabbing, scroll-into-view.
 *
 * The drift is a GUEST in the diner's scroll, never the owner of it:
 *   · pauses on hover (fine pointers), on any touch/press, for 2.2s after any scroll it didn't
 *     write itself (manual swipe, wheel, the chevron's smooth scrollBy, momentum), while focus is
 *     inside (a focused card must not slide away), offscreen (IntersectionObserver), and while
 *     the tab is hidden — and the rAF loop STOPS while blocked (Codex P2: a forever-ticking no-op
 *     loop is a battery tax), restarting from the event that unblocks it;
 *   · `prefers-reduced-motion` disables it entirely — no drift, no duplicate set, the exact
 *     pre-W22 static rail (the `motion` prop carries the parent's matchMedia state);
 *   · the parent's visible pause button (WCAG 2.2.2 — moving content needs a real stop control,
 *     not just hover luck) feeds `playing`.
 *
 * a11y: the duplicate set is `aria-hidden` with `tabIndex={-1}` controls (via the renderItem
 * contract), so screen readers and the tab order see exactly the ten real cards — but the copies
 * stay CLICKABLE (`inert` made visibly-on-screen dupes tap-dead — adversarial HIGH on #194).
 * A dupe activation redirects focus to its REAL twin first (Codex P2: an aria-hidden descendant
 * must never end up the sheet's focus-restore target), then its own click opens the same sheet;
 * the twin sits exactly one loop away, so even a focus-driven scroll lands on identical pixels.
 */
export function MarqueeRail<T>({
  items,
  itemKey,
  renderItem,
  direction = 1,
  speed = 28,
  motion,
  playing,
  ...railProps
}: {
  items: readonly T[];
  itemKey: (item: T) => string;
  /** `dupe` = this render is the loop copy: put `tabIndex={-1}` on its interactive element. */
  renderItem: (item: T, dupe: boolean) => ReactNode;
  /** 1 = content drifts leftward (reads forward); -1 = rightward. */
  direction?: 1 | -1;
  /** Drift speed in px/s — slow enough to read, distinct per row so the pair feels alive. */
  speed?: number;
  /** Motion is ELIGIBLE (mounted, no reduced-motion): render the loop set and allow drifting. */
  motion: boolean;
  /** The parent pause control (and its own gates): actually advance right now. */
  playing: boolean;
  className?: string;
  "aria-labelledby"?: string;
}) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const playingRef = useRef(playing);
  // The drift effect parks its restart hook here so the `playing` flip can wake a stopped loop.
  const resumeRef = useRef<() => void>(() => {});
  useEffect(() => {
    playingRef.current = playing;
    if (playing) resumeRef.current();
  }, [playing]);

  useEffect(() => {
    const el = scroller;
    if (!el || !motion) return;
    const firstReal = el.querySelector<HTMLElement>("li");
    const firstDupe = el.querySelector<HTMLElement>("li[data-dupe]");
    if (!firstReal || !firstDupe) return;
    // One full set's width incl. its trailing gap — the seamless wrap distance. Positions p and
    // p±loop paint identical pixels, so a wrap write is invisible.
    const loop = firstDupe.offsetLeft - firstReal.offsetLeft;
    // Degenerate guard: content must genuinely overflow, or drifting just teleports a short row.
    if (loop <= el.clientWidth + 24) return;
    let hover = false;
    let focus = false;
    let pressed = false;
    let onscreen = true;
    let visible = document.visibilityState === "visible";
    let idleUntil = 0;
    let raf = 0;
    let last = 0;
    let running = false;
    let disposed = false;
    // A FLOAT accumulator owns the drift position (adversarial HIGH on #194): per-frame deltas
    // are 0.18–0.5px, and browsers quantize scrollLeft — re-deriving from the read-back rounds
    // the fraction away every frame and the row sits frozen on DPR-1 desktops / 120Hz phones.
    // scrollLeft is only READ to detect someone else steering.
    let pos = el.scrollLeft;
    // The reverse row opens at the duplicate set's start so there's content to drift back into —
    // identical pixels, an invisible jump. (scrollTo, not a scrollLeft write — the compiler lint
    // treats property writes on state-held elements as render mutations.)
    if (direction === -1 && el.scrollLeft === 0) {
      pos = loop;
      el.scrollTo({ left: loop });
    }
    // Hard blocks are event-cleared, so the loop can SLEEP through them instead of no-op ticking
    // at refresh rate (Codex P2 on #194) — every clearing site below calls resume(). The idle
    // grace is time-bounded (2.2s), so the loop just ticks through it.
    const blocked = () =>
      !playingRef.current || hover || focus || pressed || !onscreen || !visible;
    const step = (t: number) => {
      if (disposed) return;
      if (blocked()) {
        running = false;
        last = 0;
        return; // no reschedule — resume() restarts us
      }
      const dt = last === 0 ? 0 : Math.min(t - last, 64); // clamp: no lurch after a sleep
      last = t;
      if (dt > 0 && t >= idleUntil) {
        // Normalize into [0, loop) — also swallows any manual scroll into the duplicate set.
        pos = (((pos + direction * speed * (dt / 1000)) % loop) + loop) % loop;
        el.scrollTo({ left: pos });
      }
      raf = requestAnimationFrame(step);
    };
    const resume = () => {
      if (disposed || running || blocked()) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(step);
    };
    running = true;
    raf = requestAnimationFrame(step);
    resumeRef.current = resume;

    // Any scroll the drift didn't write is someone else steering — the <Rail> chevron's smooth
    // scrollBy (a sibling: no pointer event ever reaches this scroller), a keyboard
    // scrollIntoView, iOS momentum — so ADOPT their position into the accumulator and yield the
    // same idle grace as a manual swipe (Codex P2 on #194: the per-frame write was fighting the
    // chevron's smooth scroll mid-animation). 2px tolerance covers the quantization of our own
    // fractional writes.
    const onScroll = () => {
      if (Math.abs(el.scrollLeft - pos) > 2) {
        pos = el.scrollLeft;
        idleUntil = performance.now() + 2200;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onEnter = () => {
      if (fine) hover = true;
    };
    const onLeave = () => {
      hover = false;
      resume();
    };
    const onDown = () => {
      pressed = true;
    };
    // The release listens on the WINDOW (Codex P2 on #194): a mouse press that starts on the rail
    // and releases outside it never delivers pointerup to the rail (no implicit capture for mice),
    // which latched `pressed` and killed the drift for good.
    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      idleUntil = performance.now() + 2200; // let momentum/intent settle before drifting again
      resume();
    };
    const onFocusIn = () => {
      focus = true;
    };
    const onFocusOut = (e: FocusEvent) => {
      focus = e.relatedTarget instanceof Node && el.contains(e.relatedTarget);
      if (!focus) resume();
    };
    const onVis = () => {
      visible = document.visibilityState === "visible";
      if (visible) resume();
    };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry?.isIntersecting ?? true;
      if (onscreen) resume();
    });
    io.observe(el);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resumeRef.current = () => {};
      // Fold the offset back into the REAL set (Codex round 4 on #194): reduced-motion flipped
      // mid-visit unmounts the duplicate set, and a viewport sitting in dupe territory (the
      // reverse row lives around the seam) gets clamped to the static rail's tail — a visible
      // jump. Positions p and p−loop are pixel-identical while the dupes exist, so re-writing
      // the normalized offset after the clamp restores what the diner was looking at. This
      // effect's cleanup runs after the DOM update, exactly when the clamp has happened.
      el.scrollTo({ left: ((pos % loop) + loop) % loop });
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
    };
  }, [scroller, motion, direction, speed, items.length]);

  return (
    <Rail
      as="ul"
      role="list"
      scrollerRef={setScroller}
      {...railProps}
      className={`start-here-rail${motion ? " start-here-marquee" : ""} ${railProps.className ?? ""}`.trimEnd()}
    >
      {items.map((i) => (
        <li key={itemKey(i)}>{renderItem(i, false)}</li>
      ))}
      {/* The loop set — see the header comment for why it is clickable-but-aria-hidden and how a
          dupe activation routes focus through its real twin. preventDefault on pointerdown stops
          the browser focusing the aria-hidden control; the capture-phase click handler then parks
          focus on the twin BEFORE the dupe's own onClick opens the sheet, so the sheet's
          focus-restore target is always a real, AT-visible card. */}
      {motion &&
        items.map((i, idx) => (
          <li
            key={`dupe-${itemKey(i)}`}
            data-dupe
            aria-hidden
            onPointerDown={(e) => e.preventDefault()}
            onClickCapture={() => {
              const reals = scroller?.querySelectorAll<HTMLElement>(":scope > li:not([data-dupe])");
              reals?.[idx]
                ?.querySelector<HTMLElement>("button, a, [tabindex]")
                ?.focus({ preventScroll: true });
            }}
          >
            {renderItem(i, true)}
          </li>
        ))}
    </Rail>
  );
}
