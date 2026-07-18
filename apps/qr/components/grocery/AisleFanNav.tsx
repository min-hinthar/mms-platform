"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
 * Interaction, by input modality (kept separate so one never sabotages the other):
 *  - fine pointer (desktop): CSS `:hover` fans the labels open; a click jumps + blurs.
 *  - keyboard: CSS `:focus-within` fans the labels; Enter/Space jumps and KEEPS focus on the tick
 *    (never blurs — matching MenuBrowser + the focus-on-route rule, so focus is never stranded).
 *  - coarse pointer (touch): the first tap fans the strip open via the `open` (data-open) state (no
 *    jump); a second tap jumps. `open` is TOUCH-ONLY, so the idle/outside collapse — which blurs the
 *    incidentally-focused tick to release the `:focus-within` that would otherwise pin it open on
 *    Android — never fires for a keyboard user and so can't steal their focus.
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
  // Timestamp of the pointerdown that just fanned a collapsed touch strip open. A click within a
  // short window after it only revealed the labels, so it must NOT jump. Using a timestamp (not a
  // sticky boolean) means a press that never yields a click — a drag-scroll that starts on a tick
  // and ends in `pointercancel` — can't leave the next real tap wrongly swallowed. (A mouse press
  // has pointerType "mouse" and is never captured here, so desktop clicks always jump.)
  const openPressAt = useRef(0);

  // Collapse the touch-opened strip: drop `open` AND blur any focused tick inside the nav, so the
  // `:focus-within` that Android leaves after a focus-on-tap can't hold the labels open + live over
  // the cards. Only ever reached from the touch `open` path (below), never from keyboard focus.
  const close = useCallback(() => {
    setOpen(false);
    const nav = navRef.current;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (nav && active instanceof HTMLElement && nav.contains(active)) active.blur();
  }, []);

  // Only runs while `open` (touch) is true — a keyboard user reveals labels via CSS `:focus-within`
  // and never sets `open`, so no idle timer starts for them and their focus is never blurred.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    const idle = setTimeout(close, 3200);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      clearTimeout(idle);
    };
  }, [open, close]);

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
          openPressAt.current = e.timeStamp;
          setOpen(true);
        }
      }}
      // A press that becomes a scroll (or is otherwise cancelled) produced no click to disarm the
      // open-press window — clear it here so the next genuine tap isn't swallowed.
      onPointerCancel={() => {
        openPressAt.current = 0;
      }}
      // Focus leaving the nav collapses the touch `open` state (keyboard reveal rides CSS
      // :focus-within and needs no JS state — deliberately no onFocus setter, so an idle keyboard
      // focus never starts the blur-on-collapse timer).
      onBlur={(e) => {
        if (!navRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {/* Inner wrapper is content-sized (the nav box is bounded tall for overflow safety), so the
          unifying rail (::before) hugs the dots instead of stretching into an empty capsule. */}
      <div className="aisle-fan-inner">
        {aisles.map((a, i) => {
        const on = a.slug === activeSlug;
        return (
          <button
            key={a.slug}
            type="button"
            className="aisle-fan-tick"
            aria-current={on ? "true" : undefined}
            // Capped stagger index for the fan-out reveal; late ticks don't lag.
            style={{ "--i": Math.min(i, 6) } as CSSProperties}
            onClick={(e) => {
              // A click within ~600ms of the press that OPENED a collapsed touch strip only revealed
              // the labels — don't jump (the shopper is still reading them).
              if (openPressAt.current && e.timeStamp - openPressAt.current < 600) {
                openPressAt.current = 0;
                return;
              }
              openPressAt.current = 0;
              jumpTo(a.slug);
              setOpen(false);
              // Collapse after a POINTER jump (touch/mouse → e.detail ≥ 1) by dropping focus so
              // :focus-within can't keep the labels alive over the cards. A KEYBOARD activation
              // (e.detail === 0) keeps focus on the tick — never stranded on <body> (WCAG 2.4.3).
              if (e.detail > 0) e.currentTarget.blur();
            }}
          >
            {/* The visible bilingual label IS the accessible name (EN + lang-tagged MY, no aria-label
                override), so a screen reader hears both scripts — the app is bilingual throughout.
                The icon + resting mark are decorative. */}
            <span className="aisle-fan-label">
              <span className="aisle-fan-label-icon" aria-hidden>
                <Icon name={a.icon} size={18} strokeWidth={1.5} />
              </span>
              <span className="aisle-fan-label-text">
                <span className="aisle-fan-label-en">{a.en}</span>
                <span className="aisle-fan-label-my" lang="my">
                  {a.my}
                </span>
              </span>
            </span>
            <span className="aisle-fan-mark" aria-hidden />
          </button>
          );
        })}
      </div>
    </nav>
  );
}
