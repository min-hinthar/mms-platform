"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEND_CHANGE_EVENT } from "@/lib/deviceIdentity";

const HEADER_FALLBACK = 56;

/**
 * Top inset a section must clear before it counts as the "active" aisle: the sticky AppHeader
 * (`--header-height`) plus the K7 lend ribbon (`--lend-offset`, 0 when the device isn't lent).
 * Mirrors MenuBrowser's scroll-spy inset — the grocery page has no measurable toolbar of its own,
 * so we read the layout tokens directly. Both terms are constant across a window resize (the header
 * is a fixed token; the ribbon changes only via LEND_CHANGE_EVENT), so the inset never shifts on the
 * mobile URL-bar show/hide that fires `resize` mid-scroll — which is why the observer is NOT rebuilt
 * on resize. The generous `-55%` bottom margin absorbs the safe-area slack (env() isn't JS-readable).
 */
function topInset(): number {
  if (typeof window === "undefined") return HEADER_FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const header = parseFloat(cs.getPropertyValue("--header-height")) || HEADER_FALLBACK;
  const lend = parseFloat(cs.getPropertyValue("--lend-offset")) || 0;
  return Math.round(header + lend);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * W4f — scroll-spy over the rendered grocery aisle sections (elements carrying `data-aisle` +
 * `id="aisle-sec-<slug>"`). Returns the aisle currently under the header and a `jumpTo` that
 * smooth-scrolls to one. Pure navigation state — it never reads or writes the cart.
 *
 * Pattern is lifted from `MenuBrowser`'s in-app spy (same tokens, same lend-offset handling) rather
 * than the delivery repo's hook, per the one-way-deps rule — hardened with a full-set visibility map
 * (so the topmost pick can't be wrong when only one entry changes in a callback batch).
 *
 * @param slugs   the aisle slugs currently on screen, in render order.
 * @param enabled false when there's nothing to navigate (a single filtered aisle) — the observer is
 *                never built, so a hidden nav costs zero.
 */
export function useAisleSpy(slugs: string[], enabled: boolean) {
  const [activeSlug, setActiveSlug] = useState<string | null>(() => slugs[0] ?? null);
  // While a click-jump animates, freeze the spy so the lit marker doesn't flicker through every
  // section the smooth-scroll passes over — it stays on the target set synchronously in jumpTo.
  const jumping = useRef(false);

  // Re-run the effect only when the SET of slugs changes, not on every render's fresh array identity.
  const slugKey = slugs.join("|");

  useEffect(() => {
    if (!enabled || slugs.length === 0 || typeof window === "undefined") return;

    // slug -> viewport top while intersecting, or null when off. Keyed across ALL observed sections
    // so a callback that only reports one changed entry still picks the true topmost.
    const tops = new Map<string, number | null>();
    const recompute = () => {
      if (jumping.current) return;
      let bestSlug: string | null = null;
      let bestTop = Infinity;
      tops.forEach((top, slug) => {
        if (top !== null && top < bestTop) {
          bestTop = top;
          bestSlug = slug;
        }
      });
      if (bestSlug) setActiveSlug(bestSlug);
    };

    let io: IntersectionObserver | null = null;
    let lastInset = -1;
    const build = () => {
      lastInset = topInset();
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const slug = e.target.getAttribute("data-aisle");
            if (slug) tops.set(slug, e.isIntersecting ? e.boundingClientRect.top : null);
          }
          recompute();
        },
        // Active once a section clears the sticky header; -55% bottom so only the upper band counts.
        { rootMargin: `-${lastInset}px 0px -55% 0px`, threshold: 0 },
      );
      for (const slug of slugs) {
        const el = document.getElementById(`aisle-sec-${slug}`);
        if (el) io.observe(el);
      }
    };
    build();

    // Only the lend ribbon toggling changes the inset — rebuild then (and only if it actually moved).
    const onLend = () => {
      if (topInset() !== lastInset) build();
    };
    window.addEventListener(LEND_CHANGE_EVENT, onLend);
    return () => {
      io?.disconnect();
      window.removeEventListener(LEND_CHANGE_EVENT, onLend);
    };
    // slugKey stands in for the slugs array identity (exhaustive-deps can't see through the join).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugKey, enabled]);

  const jumpTo = useCallback((slug: string) => {
    const el = document.getElementById(`aisle-sec-${slug}`);
    if (!el) return;
    setActiveSlug(slug); // light the target immediately — don't wait for the observer
    // Freeze the spy until the smooth-scroll settles. `scrollend` ends it precisely (any length of
    // jump); a 1.5s timeout is the fallback where scrollend isn't supported (older Safari) or the
    // scroll is a no-op (already in view / reduced-motion).
    jumping.current = true;
    let done = false;
    const unfreeze = () => {
      if (done) return;
      done = true;
      jumping.current = false;
      window.removeEventListener("scrollend", unfreeze);
    };
    window.addEventListener("scrollend", unfreeze);
    window.setTimeout(unfreeze, 1500);
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  return { activeSlug, jumpTo };
}
