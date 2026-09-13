import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A4·2 — the takeaway board is a LANE of the counter's one screen (`/staff?floor=1`): the bagger
 * and the register are the same person at this counter. This route stays only so a tablet's
 * bookmark lands there instead of on a 404; `?floor=1` wins over a remembered kitchen door.
 */
export default function ExpoRedirect(): never {
  redirect("/staff?floor=1");
}
