"use client";
import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "framer-motion";

/**
 * Root framer-motion provider (Richness R3). `LazyMotion features={domAnimation}` async-loads the
 * animation/gesture feature bundle AFTER hydration (never blocks first paint), keeping the initial JS
 * lean (~18KB gz for `m` + domAnimation vs ~34KB for full `motion`). `strict` forbids the
 * un-treeshakeable `motion.*` — only `m.*` is allowed — so the heavy bundle can't sneak in.
 *
 * `domAnimation` covers animations, variants, exit, and press/hover/focus gestures (`whileTap` etc.).
 * Drag + `layout`/`layoutId` need `domMax`; load that ONLY where used via a nested DomMaxProvider
 * (R5 sheets), never at the root (it would inflate every route's chunk).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
