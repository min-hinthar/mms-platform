import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A4·3 — the approvals queue is a ZONE of the counter's one screen (`/staff?floor=1`), the first of
 * the manager rails beneath the bags. This route stays only so a tablet's bookmark lands there
 * instead of on a 404. `?floor=1` is honoured over any remembered door (`resolveStaffHome`), and the
 * fragment lands on the zone's own heading.
 */
export default function ApprovalsRedirect(): never {
  redirect("/staff?floor=1#appr-h");
}
