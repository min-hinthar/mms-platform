"use client";
import { useEffect, useState, useTransition } from "react";
import { Icon, Sheet, Skeleton } from "@mms/ui";
import { getPickupSlots, setPickupSlot, type PickupSlot } from "@/lib/pickup";
import { dayLabel, dayPart, formatSlot, type DayPart } from "@/lib/pickupTime";
import { Rail } from "@/components/Rail";

/**
 * Pickup time picker (v7.2 "Pick a pickup time" sheet). Lists the kitchen's currently-bookable slots
 * (capacity-aware — full ones never appear); choosing one sets it server-side (re-validated) and
 * closes. Honest: if a slot fills between fetch and tap, the server rejects it and we re-list.
 */
export function PickupSlotSheet({
  open,
  onOpenChange,
  cartId,
  onChosen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cartId: string;
  onChosen: (slot: string) => void;
}) {
  const [slots, setSlots] = useState<PickupSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null); // the chip being set (instant feedback)
  const [dayIdx, setDayIdx] = useState(0); // which day section is shown in the time grid
  const [pending, start] = useTransition();

  // Re-fetch availability each time the sheet opens, or if the cart changes (capacity is live). setState
  // lives only in the async callbacks (the allowed "sync from an external system" pattern — no synchronous
  // setState in the effect body); a fresh load also clears any stale error from a prior failed pick.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getPickupSlots(cartId)
      .then((s) => {
        if (!active) return;
        setSlots(s);
        setDayIdx(0); // each open starts on the first day (Today)
        setError(null);
      })
      .catch(() => active && setSlots([]));
    return () => {
      active = false;
    };
  }, [open, cartId]);

  function choose(slot: string) {
    setPendingSlot(slot); // synchronous → the tapped chip shows "Setting…" on tap, before the round-trip
    start(async () => {
      setError(null);
      try {
        const r = await setPickupSlot(cartId, slot);
        if (r.ok) {
          onChosen(slot);
          onOpenChange(false);
          return;
        }
        setError(
          r.reason === "unavailable"
            ? "That time just filled — pick another."
            : "Couldn’t set that time — please try again.",
        );
        // Re-list so a filled slot drops out of the choices.
        getPickupSlots(cartId)
          .then(setSlots)
          .catch(() => {});
      } catch {
        setError("Couldn’t set that time — check your connection and try again.");
      } finally {
        setPendingSlot(null);
      }
    });
  }

  // Slots arrive time-sorted → group into consecutive day sections (Today / Tomorrow / weekday). The
  // selector picks a day; the grid shows just that day's times. `activeDay` clamps so a day that fully
  // fills (and drops out on a re-list) can't leave the grid pointing past the end.
  const groups = slots ? groupByDay(slots) : [];
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
      {slots === null ? (
        // Skeleton mirror of the day rail + time grid. Decorative (aria-hidden) — no live region here, so
        // it can't double-announce with the error region below (one live region per view; the Radix Dialog
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
      ) : slots.length === 0 ? (
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
                    const setting = pendingSlot === s.slot;
                    const soonest = s.slot === soonestSlot;
                    return (
                      <button
                        key={s.slot}
                        type="button"
                        disabled={pending}
                        aria-busy={setting}
                        className={`slot-time${setting ? " slot-time-on" : ""}${soonest ? " slot-time-soonest" : ""}`}
                        onClick={() => choose(s.slot)}
                      >
                        {setting ? (
                          "Setting…"
                        ) : (
                          <>
                            {soonest && (
                              <span className="slot-soonest-tag" aria-hidden>
                                ⚡ Soonest
                              </span>
                            )}
                            {soonest && <span className="sr-only">Soonest available, </span>}
                            <span className="slot-time-h">{formatSlot(s.slot)}</span>
                            {s.remaining <= 2 && (
                              <span className="slot-time-low">
                                <span aria-hidden>🔥 </span>
                                {s.remaining} left
                              </span>
                            )}
                          </>
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
      {error && (
        <p role="alert" style={{ color: "var(--warn)", fontSize: "var(--fs-sm)", marginTop: 12 }}>
          {error}
        </p>
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
