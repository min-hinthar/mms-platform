"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, Sheet, Skeleton } from "@mms/ui";
import { getPickupSlots, type PickupSlot } from "@/lib/pickup";
import { sameSlot } from "@/lib/pickup-slot";
import { dayLabel, dayPart, formatSlot, type DayPart } from "@/lib/pickupTime";
import { Rail } from "@/components/Rail";

/**
 * Pickup time picker (v7.2 "Pick a pickup time" sheet). Lists the kitchen's currently-bookable slots
 * (capacity-aware — full ones never appear). W20: a PURE picker — tapping a chip reports the choice
 * up and closes INSTANTLY; the parent (PickupWhenChoice) owns the optimistic state + the server
 * write + the revert, so the pick never waits on a round-trip. Slot identity is compared by INSTANT
 * (sameSlot), never by string — the two server serializations of one slot differ.
 */
export function PickupSlotSheet({
  open,
  onOpenChange,
  cartId,
  currentSlot = null,
  onChosen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cartId: string;
  /** W19 — the cart's currently-chosen slot, so re-opening the sheet highlights THE DINER'S pick.
   *  Before this prop existed the sheet had no concept of the current choice: `slot-time-on` lit
   *  only mid-write, every open reset to Today, and the permanently-glowing "⚡ Soonest" chip wore
   *  near-identical styling — reading exactly as "selection always on soonest even after selected". */
  currentSlot?: string | null;
  onChosen: (slot: string) => void;
}) {
  // W9b — three states, not two. `failed` exists so a read miss can never wear the sold-out copy.
  const [load, setLoad] = useState<
    { s: "loading" } | { s: "ok"; slots: PickupSlot[] } | { s: "failed" }
  >({ s: "loading" });
  const [reloadNonce, setReloadNonce] = useState(0); // bumped by "Try again" to re-run the effect
  // W9b review — the retry must NOT unmount itself. Swapping straight back to the skeleton deletes the
  // button the user just pressed, dropping focus to <body> with nothing announced: verbatim the defect
  // W9a fixed in GuestList. The card stays mounted and the label narrates the attempt instead.
  const [retrying, setRetrying] = useState(false);
  const [dayIdx, setDayIdx] = useState(0); // which day section is shown in the time grid
  // W20 — the diner's chip scrolls into view when the sheet opens on a long day grid.
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Re-fetch availability each time the sheet opens, or if the cart changes (capacity is live). setState
  // lives only in the async callbacks (the allowed "sync from an external system" pattern — no synchronous
  // setState in the effect body). The load-failure card below is the view's ONLY live region (QA §A).
  useEffect(() => {
    if (!open) return;
    let active = true;
    getPickupSlots(cartId)
      .then((r) => {
        if (!active) return;
        setLoad(r.ok ? { s: "ok", slots: r.slots } : { s: "failed" });
        // W19 — open on the day of the DINER'S chosen slot (a tomorrow pick used to reopen on
        // Today with the Soonest chip glowing — half the "always on soonest" complaint). Falls to
        // Today when nothing is chosen, or the chosen slot has since filled out of the list.
        const chosenDay = r.ok
          ? groupByDay(r.slots).findIndex((g) => g.slots.some((s) => sameSlot(s.slot, currentSlot)))
          : -1;
        setDayIdx(chosenDay >= 0 ? chosenDay : 0);
        setRetrying(false);
      })
      .catch(() => {
        if (!active) return;
        setLoad({ s: "failed" });
        setRetrying(false);
      });
    return () => {
      active = false;
    };
  }, [open, cartId, reloadNonce, currentSlot]);

  // W20 — the pick is INSTANT: report up + close. The parent applies it optimistically, runs the
  // server write in the background, and reverts + announces if the slot just filled.
  function choose(slot: string) {
    onChosen(slot);
    onOpenChange(false);
  }

  // W21 (owner: "pickup time slot still focus on soonest after selection") — scrolling wasn't
  // enough: the dialog's auto-focus parks on the FIRST focusable chip (the earliest = Soonest), so
  // a keyboard/SR diner reopened the sheet "on" Soonest even with their pick lit further down.
  // Once per open, move real focus to the diner's chip (announcing "Your current time, …"); the
  // guard keeps later day-browsing from having focus yanked back. Scroll stays RM-aware.
  const focusedThisOpen = useRef(false);
  useEffect(() => {
    if (!open) focusedThisOpen.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || load.s !== "ok") return;
    const el = selectedRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!focusedThisOpen.current) {
      focusedThisOpen.current = true;
      el.focus({ preventScroll: true });
    }
    el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [open, load, dayIdx]);

  // Slots arrive time-sorted → group into consecutive day sections (Today / Tomorrow / weekday). The
  // selector picks a day; the grid shows just that day's times. `activeDay` clamps so a day that fully
  // fills (and drops out on a re-list) can't leave the grid pointing past the end.
  const groups = load.s === "ok" ? groupByDay(load.slots) : [];
  const activeDay = Math.min(dayIdx, Math.max(0, groups.length - 1));
  const dayTimes = groups[activeDay]?.slots ?? [];
  // Organize the selected day's times into daypart sections (🌅 Morning · ☀️ Afternoon · 🌆 Evening)
  // so a long 15-min grid reads as scannable blocks. `soonestSlot` = the single earliest bookable slot
  // (groups[0].slots[0]) — surfaced only while the FIRST bookable day is selected (usually Today, but
  // Tomorrow if today's slots are all gone; either way it's the genuinely-soonest pickup).
  const dayParts = groupByPart(dayTimes);
  const soonestSlot = activeDay === 0 ? groups[0]?.slots[0]?.slot : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick a pickup time">
      <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 14px" }}>
        <Icon
          name="pin"
          size={14}
          style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
        />
        750 Terrado Plaza, Covina
      </p>
      {load.s === "loading" ? (
        // Skeleton mirror of the day rail + time grid. Decorative (aria-hidden) — no live region here, so
        // it can't double-announce with the failed-load alert (one live region per view; the Radix Dialog
        // title already names the sheet). A sibling sr-only string keeps an SR loading cue.
        <>
          <span className="sr-only">Loading pickup times…</span>
          <div aria-hidden>
            <div className="slot-days">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={70} height={60} radius={14} />
              ))}
            </div>
            <div className="slot-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={50} radius={12} />
              ))}
            </div>
          </div>
        </>
      ) : load.s === "failed" ? (
        // W9b — the "we couldn't ask" state. A genuinely sold-out day keeps the calm copy below; this
        // branch only fires when the availability read itself failed, so it offers the way out (retry in
        // place) instead of quietly reporting a closed kitchen. Mirrors the SettlementBoard retry.
        <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
          {retrying ? "Looking for pickup times…" : "Couldn’t load pickup times."}{" "}
          <button
            type="button"
            // aria-disabled, not `disabled`: a natively-disabled button leaves the focus order, so the
            // keyboard user who just pressed it would lose their place mid-retry.
            aria-disabled={retrying}
            onClick={() => {
              if (retrying) return;
              setRetrying(true);
              setReloadNonce((n) => n + 1);
            }}
            style={{
              minHeight: 44,
              padding: "0 4px",
              background: "none",
              border: "none",
              color: "var(--warn)",
              fontWeight: 800,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </p>
      ) : load.slots.length === 0 ? (
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
          No pickup times available right now — please check back soon.
        </p>
      ) : (
        <>
          {/* Day selector — one card per bookable day, with its available-slot count. Hidden when there's
              only a single day (no choice to make). */}
          {groups.length > 1 && (
            <Rail className="slot-days" role="group" aria-label="Pickup day">
              {groups.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  aria-pressed={i === activeDay}
                  className={`slot-day${i === activeDay ? " slot-day-on" : ""}`}
                  onClick={() => setDayIdx(i)}
                >
                  <span className="slot-day-kicker">{g.label}</span>
                  <span className="slot-day-count">
                    {g.slots.length} {g.slots.length === 1 ? "time" : "times"}
                  </span>
                </button>
              ))}
            </Rail>
          )}
          {/* Times for the selected day, in daypart sections. Each section is its own labeled group so a
              screen-reader hears "Afternoon pickup times, Today" before its chips; the emoji is decorative. */}
          <div className="slot-parts">
            {dayParts.map(({ part, slots: partSlots }) => (
              <section
                key={part.key}
                className="slot-part"
                role="group"
                aria-label={`${part.label} pickup times — ${groups[activeDay]?.label ?? ""}`}
              >
                <p className="slot-part-head">
                  <span className="slot-part-emoji" aria-hidden>
                    {part.emoji}
                  </span>
                  <span className="slot-part-label">{part.label}</span>
                  <span className="slot-part-count">
                    {partSlots.length} {partSlots.length === 1 ? "time" : "times"}
                  </span>
                </p>
                <div className="slot-grid">
                  {partSlots.map((s) => {
                    const selected = sameSlot(s.slot, currentSlot);
                    const soonest = s.slot === soonestSlot;
                    return (
                      <button
                        key={s.slot}
                        ref={selected ? selectedRef : undefined}
                        type="button"
                        aria-pressed={selected}
                        // W19→W20 — the DINER'S slot wears the lit state (compared by INSTANT); the
                        // Soonest chip keeps its ⚡ tag always but its gold-glow fill ONLY while
                        // nothing is chosen (or it IS the choice).
                        className={`slot-time${selected ? " slot-time-on" : ""}${
                          soonest && (currentSlot == null || selected) ? " slot-time-soonest" : ""
                        }`}
                        onClick={() => choose(s.slot)}
                      >
                        {soonest && (
                          <span className="slot-soonest-tag" aria-hidden>
                            ⚡ Soonest
                          </span>
                        )}
                        {soonest && <span className="sr-only">Soonest available, </span>}
                        {selected && <span className="sr-only">Your current time, </span>}
                        <span className="slot-time-h">{formatSlot(s.slot)}</span>
                        {selected && (
                          <span className="slot-time-low" aria-hidden>
                            ✓ Yours
                          </span>
                        )}
                        {!selected && s.remaining <= 2 && (
                          <span className="slot-time-low">
                            <span aria-hidden>🔥 </span>
                            {s.remaining} left
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

// Collapse the time-sorted slots into consecutive day sections (Today / Tomorrow / weekday).
function groupByDay(slots: PickupSlot[]): { label: string; slots: PickupSlot[] }[] {
  const groups: { label: string; slots: PickupSlot[] }[] = [];
  for (const s of slots) {
    const label = dayLabel(s.slot);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.slots.push(s);
    else groups.push({ label, slots: [s] });
  }
  return groups;
}

// Collapse ONE day's time-sorted slots into consecutive daypart sections (Morning → Afternoon → Evening).
function groupByPart(slots: PickupSlot[]): { part: DayPart; slots: PickupSlot[] }[] {
  const parts: { part: DayPart; slots: PickupSlot[] }[] = [];
  for (const s of slots) {
    const part = dayPart(s.slot);
    const last = parts[parts.length - 1];
    if (last && last.part.key === part.key) last.slots.push(s);
    else parts.push({ part, slots: [s] });
  }
  return parts;
}
