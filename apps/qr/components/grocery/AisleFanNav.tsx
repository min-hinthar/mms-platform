"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@mms/ui";
import type { Aisle } from "@/lib/grocery-aisles";
import { useAisleSpy } from "@/lib/hooks/useAisleSpy";

/**
 * W4f — the right-edge "you are here" aisle minimap. A fixed vertical strip of aisle ticks that
 * scroll-spies the section currently under the header and fans out to bilingual EN/MY labels to
 * jump between aisles. It floats in the gutter, so it costs zero grid width and never touches the
 * `maxWidth:440` column or the cart/money path — it is pure navigation over the sections
 * `GroceryBrowse` already renders.
 *
 * Complements (does not replace) the horizontal aisle FILTER rail: the strip only earns its place
 * when ≥2 sections are stacked (the "All aisles" view), so it hides the moment the filter narrows
 * to a single aisle (nothing to jump between).
 *
 * Interaction, by input modality:
 *  - fine pointer (desktop): CSS `:hover` fans the labels open; a click jumps.
 *  - keyboard: `:focus-within` fans the labels; Enter/Space jumps.
 *  - coarse pointer (touch): the first tap on the collapsed strip fans it open (no jump); a second
 *    tap on a labelled aisle jumps and collapses. An outside tap or ~3.2s idle also collapses.
 */
export function AisleFanNav({ aisles }: { aisles: Aisle[] }) {
  // Hooks run unconditionally (the render can early-return below); `enabled` no-ops the observer
  // when there's nothing to navigate.
  const { activeSlug, jumpTo } = useAisleSpy(
    aisles.map((a) => a.slug),
    aisles.length > 1,
  );

  const navRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  // Marks the click that FOLLOWS the pointerdown which just opened a collapsed touch strip — that
  // click only revealed the fan, so it must not also jump. (A mouse press has pointerType "mouse"
  // and is never captured here, so desktop clicks always jump; CSS :hover handles the fan there.)
  const openedByThisPress = useRef(false);

  // Collapse the touch-opened fan on an outside tap or after a short idle. (Fine pointers use CSS
  // `:hover`, so `open` only ever drives the coarse-pointer path.)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    const idle = setTimeout(() => setOpen(false), 3200);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      clearTimeout(idle);
    };
  }, [open]);

  // Nothing to navigate between — the horizontal filter already isolates a single aisle.
  if (aisles.length < 2) return null;

  return (
    <nav
      ref={navRef}
      className="aisle-fan"
      aria-label="Jump to aisle"
      data-open={open || undefined}
      // Coarse pointer only: the first press on a collapsed strip fans it open instead of jumping,
      // so a touch shopper reads the labels before committing.
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" && !open) {
          openedByThisPress.current = true;
          setOpen(true);
        }
      }}
      // Keyboard: focus fans the labels (also via CSS :focus-within) and the first Enter jumps
      // (there's no press to swallow); blur out collapses.
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!navRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {aisles.map((a, i) => {
        const on = a.slug === activeSlug;
        return (
          <button
            key={a.slug}
            type="button"
            className="aisle-fan-tick"
            aria-current={on ? "true" : undefined}
            // Stable accessible name even while collapsed (the visible EN/MY spans are aria-hidden
            // visual echoes, so they don't double-speak).
            aria-label={`${a.en} aisle`}
            // Capped stagger index for the fan-out reveal; late ticks don't lag.
            style={{ "--i": Math.min(i, 6) } as CSSProperties}
            onClick={() => {
              // The press that opened a collapsed touch strip only revealed the labels — don't jump.
              if (openedByThisPress.current) {
                openedByThisPress.current = false;
                return;
              }
              jumpTo(a.slug);
              setOpen(false);
            }}
          >
            <span className="aisle-fan-label" aria-hidden>
              <Icon name={a.icon} size={18} strokeWidth={1.5} />
              <span className="aisle-fan-label-text">
                <span className="aisle-fan-label-en">{a.en}</span>
                <span className="aisle-fan-label-my" lang="my">
                  {a.my}
                </span>
              </span>
            </span>
            {/* Decorative resting tick (the lit "you are here" cap when active). */}
            <span className="aisle-fan-mark" aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}
