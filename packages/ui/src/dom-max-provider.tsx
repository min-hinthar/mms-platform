"use client";
import type { ReactNode } from "react";
import { LazyMotion } from "framer-motion";

// Async `domMax` feature loader — adds drag + layout/layoutId on top of the root domAnimation set, in a
// separate chunk loaded only when a domMax consumer (e.g. a swipe-to-close Sheet) mounts. A nested
// LazyMotion overrides the outer one for its subtree (framer's documented topology). Keep this OFF the
// root (it would inflate every route's initial JS); mount it only where drag/layout is used.
const loadDomMax = () => import("framer-motion").then((mod) => mod.domMax);

/**
 * Nested framer-motion provider that enables `drag`/`layout` for its subtree (Richness R5b). Used by the
 * `Sheet` swipe-to-close. `strict` keeps `m.*`-only. Caveat (delivery): never wrap a jsdom test in a
 * nested LazyMotion whose framer mock isn't stubbed — QR has no such suite yet, but the first one must.
 */
export function DomMaxProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadDomMax} strict>
      {children}
    </LazyMotion>
  );
}
