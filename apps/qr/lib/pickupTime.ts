// Display helper for pickup slot times. The restaurant tz is fixed (Covina, CA); the server stores
// slots as absolute instants (timestamptz), so we render them in the shop's wall clock — not the
// device's. Client + server safe (no directive). Keep in sync with pickup_config.tz.
export const RESTAURANT_TZ = "America/Los_Angeles";

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: RESTAURANT_TZ,
  });
}

const localDate = (d: Date): string => d.toLocaleDateString("en-CA", { timeZone: RESTAURANT_TZ });

/** "Today" / "Tomorrow" / "Sat Jun 21" for a slot's day, in the shop tz (slots can roll to next days). */
export function dayLabel(iso: string): string {
  const slot = localDate(new Date(iso));
  const now = new Date();
  if (slot === localDate(now)) return "Today";
  if (slot === localDate(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: RESTAURANT_TZ,
  });
}

/** Time, prefixed with the day when it isn't today ("10:30 AM" vs "Tomorrow 10:30 AM"). */
export function formatSlotLong(iso: string): string {
  const day = dayLabel(iso);
  return day === "Today" ? formatSlot(iso) : `${day} ${formatSlot(iso)}`;
}

export type DayPart = { key: "morning" | "afternoon" | "evening"; label: string; emoji: string };

/** Which part of the day a slot falls in (shop tz), for grouping the picker into scannable sections.
 *  Morning < 12pm · Afternoon 12–5pm · Evening 5pm+. The emoji is decorative (aria-hidden at render). */
export function dayPart(iso: string): DayPart {
  // hour12:false → 0–23 in the shop's wall clock (pickup hours are ~10–19, so no midnight edge here).
  const hour = Number(
    new Date(iso).toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: RESTAURANT_TZ,
    }),
  );
  if (hour < 12) return { key: "morning", label: "Morning", emoji: "🌅" };
  if (hour < 17) return { key: "afternoon", label: "Afternoon", emoji: "☀️" };
  return { key: "evening", label: "Evening", emoji: "🌆" };
}
