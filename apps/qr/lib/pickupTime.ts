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
