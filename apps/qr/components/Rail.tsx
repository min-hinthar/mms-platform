"use client";
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

/**
 * W5b — the shared horizontal-rail shell: makes swipe-only scrollers usable with a MOUSE. Every
 * diner rail hides its scrollbar (right call on touch), but the app is a fixed ~440px column even
 * on desktop, so overflowing chips/cards were unreachable for fine-pointer users (no swipe, no
 * scrollbar, no affordance). This wrapper adds chevron nudge buttons that appear ONLY on
 * hover-capable fine-pointer devices (CSS-gated) and only on the side(s) that actually overflow.
 *
 * The scroller keeps its existing class/semantics (`as` renders the same ul/div the CSS targets);
 * the shell is a plain positioning context. The nudges are aria-hidden + untabbable ON PURPOSE:
 * they're redundant for keyboard/AT users (tabbing into a card scrolls it into view natively — the
 * rail's content is the accessible path), so exposing them would only add noise stops.
 */
export function Rail({
  as = "div",
  children,
  scrollerRef,
  ...rest
}: {
  as?: "ul" | "div";
  children: ReactNode;
  /** W22 — optional tap on the scroller element (the marquee drift needs the same node the shell
   *  measures; a second wrapper would double the positioning context). */
  scrollerRef?: (el: HTMLElement | null) => void;
} & HTMLAttributes<HTMLElement>) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const measureRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!el) return;
    let raf = 0;
    // All measurement (and its setState) rides rAF — never synchronous in the effect body
    // (react-hooks/set-state-in-effect), and scroll events collapse to one read per frame.
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // 4px slack: subpixel scroll positions must not flicker a nudge at the extremes.
        setCanBack(el.scrollLeft > 4);
        setCanFwd(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
      });
    };
    measure();
    measureRef.current = measure;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      measureRef.current = () => {};
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [el]);

  // RO only fires on box changes of the SCROLLER — adding/removing a fixed-size card changes
  // scrollWidth without any box resize (the FavoritesRail heart-while-mounted case), so re-measure
  // whenever the children commit. Cheap: rAF-coalesced with the scroll/RO paths above.
  useEffect(() => {
    measureRef.current();
  }, [children]);

  const nudge = (dir: -1 | 1) => {
    if (!el) return;
    el.scrollBy({
      left: dir * el.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  const Tag = as;
  return (
    <div className="rail-shell">
      <Tag
        ref={(node: HTMLElement | null) => {
          setEl(node);
          scrollerRef?.(node);
        }}
        {...rest}
      >
        {children}
      </Tag>
      {canBack && (
        <button
          type="button"
          className="rail-nudge rail-nudge-l"
          aria-hidden
          tabIndex={-1}
          onClick={() => nudge(-1)}
        >
          ‹
        </button>
      )}
      {canFwd && (
        <button
          type="button"
          className="rail-nudge rail-nudge-r"
          aria-hidden
          tabIndex={-1}
          onClick={() => nudge(1)}
        >
          ›
        </button>
      )}
    </div>
  );
}
