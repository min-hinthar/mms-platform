"use client";
import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";

// Async feature loader — dynamic-imports the domAnimation bundle so it's code-split into its own chunk
// and loaded AFTER hydration, never in the initial client JS. `features={domAnimation}` (a STATIC
// import) is framer's synchronous path: it would bundle the feature set into every route's initial JS,
// defeating the lazy win. This loader form is delivery's proven DomMaxProvider pattern.
const loadDomAnimation = () => import("framer-motion").then((mod) => mod.domAnimation);

/**
 * Root framer-motion provider (Richness R3). `LazyMotion` with an async `features` loader keeps the
 * initial client JS lean (~`m` core only) and pulls the animation/gesture feature bundle after
 * hydration. `strict` forbids the un-treeshakeable `motion.*` — only `m.*` is allowed.
 *
 * `domAnimation` covers animations, variants, exit, and press/hover/focus gestures (`whileTap` etc.).
 * Drag + `layout`/`layoutId` need `domMax`; load that ONLY where used via a nested DomMaxProvider
 * (R5 sheets), never at the root (it would inflate every route's chunk).
 *
 * `MotionConfig reducedMotion="user"` makes framer honor `prefers-reduced-motion` for transform/layout
 * animations app-wide (framer defaults to "never") — belt-and-suspenders with our explicit `shouldAnimate`
 * gates, and it's what reduces the Sheet drag's spring snap-back (R5b) for RM users without a manual gate.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadDomAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
