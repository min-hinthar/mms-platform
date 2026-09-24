"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type FocusEvent,
} from "react";
import { SAME_GESTURE_MS } from "@mms/ui";
import {
  dropLeaving,
  landingAfter,
  mergeLeaving,
  reconcileLines,
  renderedOrder,
  type Leaving,
} from "@/lib/line-motion";

/**
 * Phase 1c · cart-motion — the DOM half of a removed line's exit on /cart.
 *
 * WHAT IT DOES. The live list (the optimistic `viewItems`) drops a line at the tap, exactly as
 * before; only the RENDERER merges a snapshot of that row back in as a GHOST — the same key and the
 * same DOM node, so nothing remounts — marked `.mms-remove` (the house `mmsRise` played in reverse),
 * `inert` and `aria-hidden`. In a layout effect, before the first paint, the rows below it are read,
 * the ghost is taken out of flow, they are read again, and each one that moved plays the difference
 * back to zero (FLIP, transform only, `composite: "add"` so two quick removals compose instead of
 * jumping). Both reads sit in ONE synchronous block with scroll anchoring off (`data-flip`), so no
 * scroll can slip between them. Whatever moved under a finger is held from taps (`data-settling`)
 * for `SAME_GESTURE_MS`. A refused removal is the same measurement run the other way: the row comes
 * back in place and the rows below slide down to make room.
 *
 * FOCUS (§7). An own removal moves focus to the NEIGHBOURING dish's name — next, else previous —
 * `preventScroll`, BEFORE the write, while the old control is still live: the name cannot be
 * activated, so a repeated Enter/Space can never delete the next dish the way landing on its "−"
 * (which IS "Remove {next}" at qty 1) could. A peer's removal moves focus only if focus was inside
 * the removed row: the list records the focused line id, because on iOS a tap never focuses a button
 * (so "focus is on <body>" says nothing), and a row that unmounted outright cannot be asked whether
 * it held focus. Detection is keyed on the removed id SET, never a count, so a same-length
 * remove + add refresh is still caught (LEARNINGS #128).
 *
 * THE RULES LIVE IN `lib/line-motion.ts` — which rows leave, where a ghost sits, where focus lands.
 * This file only measures, animates, holds and focuses, and it does every DOM read and write in a
 * handler, an effect or a timer, never in render.
 *
 * ⚠️ STATE IS KEYED ON A VALUE. `useOptimistic` re-runs its reducer on every pending render, so the
 * live array is a new identity each time; keying the derivation on identity would re-derive on every
 * render and loop ("Too many re-renders"). The key is `sig` of every row, joined, plus `scope`.
 *
 * Reduced motion is read SYNCHRONOUSLY from matchMedia at effect time (haptics.ts rule 1 — the
 * `useAnimationPreference` hook starts at `true`). Under it the ghost is `opacity: 0` with no FLIP, so
 * the removal and a refused return are visually instant — and the hold and the focus landing still
 * apply: safety and a11y are not motion.
 */

/** A ghost whose own `animationend` never arrives (a backgrounded tab, a cancelled animation) is
 *  dropped by this bound. Well past the `--dur-base` (240ms) fade it backs up. */
export const LEAVE_BOUND_MS = 1000;

type MotionState<T> = {
  key: string;
  scope: string;
  live: readonly T[];
  /** The drawn order BEFORE the latest change — where a peer-removed row's neighbours were. */
  order: string[];
  leaving: Leaving<T>[];
  gone: string[];
  removed: string[];
  returned: string[];
  epoch: number;
};

/** Focus has nowhere meaningful to be: nothing, the page itself, a node that has left the document,
 *  or inside an inert (leaving) row — engines differ on when a removed/inert focus falls to <body>. */
export function focusWasLost(): boolean {
  const a = document.activeElement;
  return a === null || a === document.body || !a.isConnected || a.closest("[inert]") !== null;
}

/** Focus an element where it is — no scroll — and bring it into view only for a keyboard user. */
export function focusInPlace(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    if (el.matches(":focus-visible") && typeof el.scrollIntoView === "function")
      el.scrollIntoView({ block: "nearest" });
  } catch {
    // `:focus-visible` unsupported by this engine — focus already landed in place, which is the rule.
  }
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** A `:root` token's value, whitespace collapsed (a multi-line `linear()` is still one easing). */
function token(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace(/\s+/g, " ");
}

function durationMs(v: string): number {
  const m = /^([\d.]+)(ms|s)$/.exec(v);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
}

/**
 * Everything that sits AFTER `el` in the page: its following siblings, then each ancestor's
 * following siblings, up to the page's <main>. Fixed and sticky boxes never move with the flow, so
 * they are skipped (the fixed cart dock is not held and not animated).
 */
function tailOf(el: Element): Element[] {
  const out: Element[] = [];
  const stop = el.closest("main") ?? el.ownerDocument.body;
  let node: Element | null = el;
  while (node && node !== stop) {
    for (let s = node.nextElementSibling; s; s = s.nextElementSibling) {
      const pos = getComputedStyle(s).position;
      if (pos === "fixed" || pos === "sticky") continue;
      out.push(s);
    }
    node = node.parentElement;
  }
  return out;
}

const OUT_OF_FLOW = ["position", "top", "left", "width", "boxSizing"] as const;

export function useLineMotion<T extends { id: string }>(
  live: readonly T[],
  opts: {
    group: (t: T) => string;
    groupOrder: readonly string[];
    sig: (t: T) => string;
    scope: string;
  },
) {
  const { group, groupOrder, sig, scope } = opts;
  const key = live.map(sig).join("\u0001");
  const [state, setState] = useState<MotionState<T>>(() => ({
    key,
    scope,
    live,
    order: renderedOrder(live, group, groupOrder),
    leaving: [],
    gone: [],
    removed: [],
    returned: [],
    epoch: 0,
  }));
  // React's "store information from previous renders" form: ONE conditional setState whose value is
  // derived here, so the ghost is in the very commit that dropped the line (an effect would paint one
  // frame with the row simply gone). Keyed on the value — see the file docblock.
  let st = state;
  if (state.key !== key || state.scope !== scope) {
    const r = reconcileLines(state.live, live, state, { group, reset: state.scope !== scope });
    st = {
      key,
      scope,
      live,
      order: renderedOrder(state.live, group, groupOrder),
      leaving: r.leaving,
      gone: r.gone,
      removed: r.removed,
      returned: r.returned,
      epoch: state.epoch + 1,
    };
    setState(st);
  }

  // DOM bookkeeping — refs only, touched in handlers, effects and timers.
  const lists = useRef(new Set<Element>());
  const lastFocusLine = useRef<string | null>(null);
  const dropTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const holds = useRef(new Map<Element, ReturnType<typeof setTimeout>>());
  const flipping = useRef(new Map<Element, number>());
  const running = useRef(new Set<Animation>());
  const styled = useRef(new WeakSet<HTMLElement>());
  const seenEpoch = useRef(0);

  const drop = useCallback((id: string) => {
    const t = dropTimers.current.get(id);
    if (t !== undefined) clearTimeout(t);
    dropTimers.current.delete(id);
    setState((s) => {
      const leaving = dropLeaving(s.leaving, id);
      return leaving === s.leaving ? s : { ...s, leaving };
    });
  }, []);

  const registerList = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const set = lists.current;
    set.add(el);
    return () => {
      set.delete(el);
    };
  }, []);

  /** The drawn row for a line id (a direct child of one of the registered lists), or null. */
  const rowEl = (id: string): HTMLElement | null => {
    for (const list of lists.current)
      for (const child of Array.from(list.children))
        if (child instanceof HTMLElement && child.dataset.lineId === id) return child;
    return null;
  };
  const nameOf = (id: string) => rowEl(id)?.querySelector<HTMLElement>("[data-line-name]") ?? null;

  /** Hold elements from taps for `ms` — idempotent; a re-hold extends the release. */
  const hold = (els: Iterable<Element>, ms = SAME_GESTURE_MS) => {
    for (const el of els) {
      el.setAttribute("data-settling", "");
      const prior = holds.current.get(el);
      if (prior !== undefined) clearTimeout(prior);
      holds.current.set(
        el,
        setTimeout(() => {
          el.removeAttribute("data-settling");
          holds.current.delete(el);
        }, ms),
      );
    }
  };

  const markFlip = (el: Element) => {
    flipping.current.set(el, (flipping.current.get(el) ?? 0) + 1);
    el.setAttribute("data-flip", "");
  };
  const unmarkFlip = (el: Element) => {
    const n = (flipping.current.get(el) ?? 1) - 1;
    if (n > 0) flipping.current.set(el, n);
    else {
      flipping.current.delete(el);
      el.removeAttribute("data-flip");
    }
  };

  const outOfFlow = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    const top = el.offsetTop - (parseFloat(cs.marginTop) || 0);
    const left = el.offsetLeft - (parseFloat(cs.marginLeft) || 0);
    const width = el.offsetWidth;
    el.style.position = "absolute";
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.width = `${width}px`;
    el.style.boxSizing = "border-box";
    styled.current.add(el);
  };
  const backInFlow = (el: HTMLElement) => {
    for (const p of OUT_OF_FLOW) el.style[p] = "";
    styled.current.delete(el);
  };

  /** Play each element's layout delta back to zero on the house spring. Transform only. */
  const animateFlip = (moved: [Element, number][]) => {
    const dur = durationMs(token("--dur-base"));
    const spring = token("--spring");
    const fallback = token("--ease-out");
    for (const [el, dy] of moved) {
      let a: Animation | null = null;
      if (dur > 0) {
        const frames = [{ transform: `translateY(${dy}px)` }, { transform: "none" }];
        try {
          a = el.animate(frames, { duration: dur, easing: spring, composite: "add" });
        } catch {
          // `linear()` easing throws before Safari 17.2 — the house ease-out is the fallback curve.
          try {
            a = el.animate(frames, { duration: dur, easing: fallback, composite: "add" });
          } catch {
            a = null; // no usable easing: the layout change stands without motion, as it did before
          }
        }
      }
      if (!a) {
        unmarkFlip(el);
        continue;
      }
      const anim = a;
      running.current.add(anim);
      const done = () => {
        running.current.delete(anim);
        unmarkFlip(el);
      };
      anim.finished.then(done, done);
    }
  };

  /**
   * ONE synchronous measurement: read the tail, apply `change`, read again. Holds what moved and, when
   * `anim`, FLIPs it. `data-flip` goes on first, so the browser's scroll anchoring cannot adjust the
   * page between the two reads.
   */
  const measure = (tail: Element[], change: () => void, anim: boolean, prepare?: () => void) => {
    if (anim) tail.forEach(markFlip);
    prepare?.();
    const before = tail.map((t) => t.getBoundingClientRect().top);
    change();
    const moved: [Element, number][] = [];
    tail.forEach((t, i) => {
      const dy = before[i]! - t.getBoundingClientRect().top;
      if (Math.abs(dy) >= 0.5) moved.push([t, dy]);
      else if (anim) unmarkFlip(t);
    });
    hold(moved.map(([t]) => t));
    if (anim) animateFlip(moved);
  };

  useLayoutEffect(() => {
    if (st.epoch === seenEpoch.current) return;
    seenEpoch.current = st.epoch;
    const reduced = prefersReducedMotion();

    // A peer's removal (or a refresh) took the row focus was in: land on its neighbour, in place.
    const was = lastFocusLine.current;
    if (was !== null && st.removed.includes(was) && focusWasLost()) {
      const target = landingAfter(st.order, was, new Set(st.live.map((t) => t.id)));
      if (target) focusInPlace(nameOf(target));
    }

    // A refused removal came back: in place, and the rows below slide DOWN to make room.
    for (const id of st.returned) {
      const t = dropTimers.current.get(id);
      if (t !== undefined) clearTimeout(t);
      dropTimers.current.delete(id);
      const el = rowEl(id);
      if (!el) continue;
      if (styled.current.has(el)) backInFlow(el);
      if (el.getBoundingClientRect().bottom <= 0) continue; // above the fold: anchoring keeps it still
      const anim = !reduced && typeof el.animate === "function";
      measure(
        tailOf(el),
        () => backInFlow(el),
        anim,
        () => outOfFlow(el), // 'before' is the list as the diner saw it: without the row
      );
    }

    // A new ghost: out of flow, the rows below close over it, and it drops on its own fade.
    const ghosts = new Set(st.leaving.map((l) => l.item.id));
    for (const id of st.removed) {
      if (!ghosts.has(id)) continue;
      const el = rowEl(id);
      if (!el) continue;
      const anim = !reduced && typeof el.animate === "function";
      if (el.getBoundingClientRect().bottom > 0) measure(tailOf(el), () => outOfFlow(el), anim);
      else outOfFlow(el); // entirely above the viewport: nothing visible moves; anchoring holds the page
      const prior = dropTimers.current.get(id);
      if (prior !== undefined) clearTimeout(prior);
      dropTimers.current.set(
        id,
        setTimeout(() => drop(id), anim ? LEAVE_BOUND_MS : SAME_GESTURE_MS),
      );
    }
  });

  useEffect(() => {
    const timers = dropTimers.current;
    const held = holds.current;
    const flips = flipping.current;
    const anims = running.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      held.forEach((t, el) => {
        clearTimeout(t);
        el.removeAttribute("data-settling");
      });
      flips.forEach((_, el) => el.removeAttribute("data-flip"));
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return {
    /** The rows to draw for one section: its live rows plus its ghosts, in place. */
    rowsFor: (groupKey: string, liveInGroup: readonly T[]) =>
      mergeLeaving(
        liveInGroup,
        st.leaving.filter((l) => group(l.item) === groupKey),
      ),
    /** Spread on each row's element. A ghost is inert and hidden, and drops on its OWN animationend
     *  (a descendant's `.mms-pop` bubbles an animationend too, and must not end the exit). */
    rowProps: (id: string, leaving: boolean) =>
      leaving
        ? {
            "data-line-id": id,
            inert: true,
            "aria-hidden": true as const,
            onAnimationEnd: (e: AnimationEvent<HTMLElement>) => {
              if (e.target === e.currentTarget) drop(id);
            },
          }
        : { "data-line-id": id },
    /** Spread on each list. Records which line focus is in, for a peer's removal. */
    listProps: {
      ref: registerList,
      onFocus: (e: FocusEvent<HTMLElement>) => {
        const row = e.target instanceof Element ? e.target.closest("[data-line-id]") : null;
        lastFocusLine.current = row?.getAttribute("data-line-id") ?? null;
      },
      onBlur: (e: FocusEvent<HTMLElement>) => {
        const to = e.relatedTarget;
        // Keep the record when focus goes nowhere (null — a tap on blank page, or the row unmounting):
        // that is exactly the case a later removal must still be able to see.
        if (to instanceof Element && !to.closest("[data-line-id]")) lastFocusLine.current = null;
      },
    },
    /** Call from the tap handler BEFORE the write: focus lands on the neighbour while the old control
     *  is still live (so it leaves before the row turns inert), and what sits below is held. */
    noteRemoval: (id: string) => {
      const liveIds = new Set(live.map((t) => t.id));
      liveIds.delete(id);
      const target = landingAfter(renderedOrder(live, group, groupOrder), id, liveIds);
      if (target) focusInPlace(nameOf(target));
      const row = rowEl(id);
      if (row) hold(tailOf(row));
    },
  };
}
