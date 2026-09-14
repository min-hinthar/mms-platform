import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A4·4 — the profile is the signed-in state of the sign-in screen (`/staff/login`: who you are ·
 * your PIN · sign out). This route stays so a tablet's bookmark lands there instead of a 404; its
 * whole body is the redirect, which is the exact shape `check-staff-lang` rule 4 exempts.
 */
export default function StaffProfileRedirect(): never {
  redirect("/staff/login");
}
