"use server";
import { serviceClient } from "@mms/db/server";
import { setDisplayNameInput } from "@mms/db/schemas";
import { assertSessionMember } from "./authz";

/**
 * Rename your OWN seat in the presence guest list (M3·P3.1). Server Actions are public POST
 * endpoints (IDOR by default), so this authorizes the caller as a member of `sessionId` and scopes
 * the UPDATE to `seat_id = auth.uid()` — a member can never rename another guest. The name is
 * length-capped by the Zod schema and JSX-escaped at render (RED-TEAM XSS-via-names trap); it is
 * NOT sent to analytics (PostHog stays keyed on the opaque seat uid — QA §C P2, no PII in props).
 */
export async function setDisplayName(sessionId: string, name: string): Promise<{ ok: boolean }> {
  const input = setDisplayNameInput.parse({ sessionId, name });
  const { uid } = await assertSessionMember(input.sessionId);

  const { error } = await serviceClient()
    .from("session_members")
    .update({ display_name: input.name })
    .eq("session_id", input.sessionId)
    .eq("seat_id", uid); // scope to the caller's own seat — never another member's row
  if (error) throw new Error("Could not update name");
  return { ok: true };
}
