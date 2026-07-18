"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEND_CHANGE_EVENT } from "@/lib/deviceIdentity";

const HEADER_FALLBACK = 56;

/**
 * Top inset a section must clear before it counts as the "active" aisle: the sticky AppHeader
 * (`--header-height`) plus the K7 lend ribbon (`--lend-offset`, 0 when the device isn't lent).
 * Mirrors MenuBrowser's scroll-spy inset — the grocery page has no measurable toolbar of its own,
 * so we read the layout tokens directly. The generous `-55%` bottom margin absorbs the safe-area
 * slack (env() isn't readable in JS), so a few px of drift on the top inset never matters.
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
 * Pattern is lifted verbatim from `MenuBrowser`'s in-app spy (same tokens, same lend-offset
 * handling) rather than the delivery repo's hook, per the one-way-deps rule.
 *
 * @param slugs   the aisle slugs currently on screen, in render order.
 * @param enabled false when there's nothing to navigate (a single filtered aisle) — the observer
 *                is never built, so a hidden nav costs zero.
 */
export function useAisleSpy(slugs: string[], enabled: boolean) {
  const [activeSlug, setActiveSlug] = useState<string | null>(() => slugs[0] ?? null);
  // While a click-jump animates, freeze the spy so the lit marker doesn't flicker through every
  // section the smooth-scroll passes over — it stays on the target we set synchronously in jumpTo.
  const jumpingUntil = useRef(0);

  // Re-run the effect only when the SET of slugs changes, not on every render's fresh array identity.
  const slugKey = slugs.join("|");

  useEffect(() => {
    if (!enabled || slugs.length === 0 || typeof window === "undefined") return;

    let io: IntersectionObserver | null = null;
    const build = () => {
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          if (Date.now() < jumpingUntil.current) return; // frozen mid-jump
          const top = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (top) setActiveSlug(top.target.getAttribute("data-aisle"));
        },
        // Active once a section clears the sticky header; -55% bottom so only the upper band counts.
        { rootMargin: `-${topInset()}px 0px -55% 0px`, threshold: 0 },
      );
      for (const slug of slugs) {
        const el = document.getElementById(`aisle-sec-${slug}`);
        if (el) io.observe(el);
      }
    };
    build();
    // The top inset shifts when the viewport resizes/rotates or the lend ribbon toggles the header
    // offset — rebuild the observer with the fresh inset in both cases.
    window.addEventListener("resize", build);
    window.addEventListener(LEND_CHANGE_EVENT, build);
    return () => {
      io?.disconnect();
      window.removeEventListener("resize", build);
      window.removeEventListener(LEND_CHANGE_EVENT, build);
    };
    // slugKey stands in for the slugs array identity (exhaustive-deps can't see through the join).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugKey, enabled]);

  const jumpTo = useCallback((slug: string) => {
    const el = document.getElementById(`aisle-sec-${slug}`);
    if (!el) return;
    setActiveSlug(slug); // light the target immediately — don't wait for the observer
    jumpingUntil.current = Date.now() + 600; // freeze the spy through the smooth scroll
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  return { activeSlug, jumpTo };
}
