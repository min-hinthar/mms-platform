import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A4·3 — the settled list (today's paid orders, the refund console) is a ZONE of the counter's one
 * screen (`/staff?floor=1`), the last of the manager rails. This route stays only so a tablet's
 * bookmark lands there instead of on a 404. `?floor=1` is honoured over any remembered door
 * (`resolveStaffHome`), and the fragment lands on the zone's own heading.
 */
export default function OrdersRedirect(): never {
  redirect("/staff?floor=1#settled-h");
}
