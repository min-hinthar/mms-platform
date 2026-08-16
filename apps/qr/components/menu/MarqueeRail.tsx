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
 *   · pauses on hover (fine pointers), on any touch/press, for 2.2s after a manual scroll/wheel,
 *     while focus is inside (a focused card must not slide away), offscreen (IntersectionObserver),
 *     and while the tab is hidden;
 *   · `prefers-reduced-motion` disables it entirely — no drift, no duplicate set, the exact
 *     pre-W22 static rail (the `motion` prop carries the parent's matchMedia state);
 *   · the parent's visible pause button (WCAG 2.2.2 — moving content needs a real stop control,
 *     not just hover luck) feeds `playing`.
 *
 * a11y: the duplicate set is `aria-hidden` + `inert` (invisible to AT, unfocusable), so screen
 * readers and the tab order see exactly the ten real cards.
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
  /** `dupe` = this render is the loop copy: put `tabIndex={-1}` on its interactive element (it is
   *  aria-hidden but must stay CLICKABLE — see the duplicate-set note below). */
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
  useEffect(() => {
    playingRef.current = playing;
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
    const step = (t: number) => {
      const dt = last === 0 ? 0 : Math.min(t - last, 64); // clamp: no lurch after a hidden tab
      last = t;
      const active =
        playingRef.current && !hover && !focus && !pressed && onscreen && visible && t >= idleUntil;
      if (active && dt > 0) {
        // Normalize into [0, loop) — also swallows any manual scroll into the duplicate set.
        pos = (((pos + direction * speed * (dt / 1000)) % loop) + loop) % loop;
        el.scrollTo({ left: pos });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
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
    };
    const onDown = () => {
      pressed = true;
    };
    const onUp = () => {
      pressed = false;
      idleUntil = performance.now() + 2200; // let momentum/intent settle before drifting again
    };
    const onWheel = () => {
      idleUntil = performance.now() + 2200;
    };
    const onFocusIn = () => {
      focus = true;
    };
    const onFocusOut = (e: FocusEvent) => {
      focus = e.relatedTarget instanceof Node && el.contains(e.relatedTarget);
    };
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry?.isIntersecting ?? true;
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
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
      {/* The loop set. aria-hidden + tabIndex -1 (via the renderItem contract) keeps AT and the
          tab order on the ten real cards, but the copies stay CLICKABLE — `inert` made every
          visibly-on-screen dupe tap-dead (adversarial HIGH on #194: the reverse row OPENS on its
          dupe set, and any pause near the seam froze a dead viewport). A sighted diner tapping a
          dupe gets the same sheet as the real card. Mounted only when motion is eligible, so
          reduced-motion (and SSR) render the plain finite rail. */}
      {motion &&
        items.map((i) => (
          <li key={`dupe-${itemKey(i)}`} data-dupe aria-hidden>
            {renderItem(i, true)}
          </li>
        ))}
    </Rail>
  );
}
