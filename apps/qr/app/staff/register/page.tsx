import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A4·2 — the register is a ZONE of the counter's one screen (`/staff?floor=1`): the Start zone,
 * the counter orders beside the tables, and today's takings beneath. This route stays only so a
 * tablet's bookmark lands there instead of on a 404. `?floor=1` is honoured over any remembered
 * door (`resolveStaffHome`), so a kitchen-doored tablet following an old link sees the counter it
 * asked for, not the doors.
 */
export default function RegisterRedirect(): never {
  redirect("/staff?floor=1");
}
