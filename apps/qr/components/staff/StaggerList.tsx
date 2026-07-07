"use client";
import { AnimatePresence, m } from "framer-motion";
import { useAnimationPreference } from "@mms/ui";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared staff-board list wrapper (R9 live-notice) — renders items in a `role="list"` with a framer
 * card-ENTER on arrival + EXIT on removal, keyed so ONLY added/removed items animate (existing cards don't
 * re-animate on a realtime refresh — the whole point on a live board). Initial mount staggers (40ms gap,
 * capped at 500ms) for a confident fill without a long cascade on a dense board. Reduced-motion → no
 * enter/exit (`initial={false}`, zero-duration). Enter/exit are transform+opacity only (60fps); the board's
 * single live region stays the caller's (this adds none). Uses `m.li` under the root LazyMotion
 * (`domAnimation`) — no `layout` prop, so it needs no `domMax`.
 */
export function StaggerList<T>({
  items,
  getKey,
  renderItem,
  style,
  ariaLabel,
}: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const { shouldAnimate } = useAnimationPreference();
  return (
    <ul role="list" aria-label={ariaLabel} style={style}>
      <AnimatePresence initial={shouldAnimate}>
        {items.map((item, i) => (
          <m.li
            key={getKey(item)}
            style={{ listStyle: "none" }}
            initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            // Exit carries its OWN zero-delay transition — otherwise it inherits the entrance `delay` and a
            // removed card (cleared table / bumped ticket) lingers in the DOM + a11y tree up to ~680ms.
            exit={
              shouldAnimate
                ? {
                    opacity: 0,
                    y: -8,
                    transition: { duration: 0.18, ease: [0.4, 0, 1, 1], delay: 0 },
                  }
                : undefined
            }
            transition={
              shouldAnimate
                ? { duration: 0.28, ease: [0, 0, 0.2, 1], delay: Math.min(i * 0.04, 0.4) }
                : { duration: 0 }
            }
          >
            {renderItem(item)}
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
