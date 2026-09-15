import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A4·5 — guest feedback is a manager zone of the Tips screen (`/staff/tips#fb-h`; the zone's
 * heading takes focus on arrival): the tips and the feedback are the same end-of-day read. This
 * route stays so a bookmark lands there instead of a 404; its whole body is the redirect, which is
 * the exact shape `check-staff-lang` rule 4 exempts.
 */
export default function FeedbackRedirect(): never {
  redirect("/staff/tips#fb-h");
}
