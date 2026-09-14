import { redirect } from "next/navigation";

/**
 * A4·4 — the roster is a manager zone of the sign-in screen (`/staff/login#team-h`; the zone's
 * heading takes focus on arrival). This route stays so a bookmark lands there instead of a 404;
 * its whole body is the redirect, which is the exact shape `check-staff-lang` rule 4 exempts.
 */
export default function TeamRedirect(): never {
  redirect("/staff/login#team-h");
}
