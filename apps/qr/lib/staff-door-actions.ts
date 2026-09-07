"use server";
import { cookies } from "next/headers";
import { staffDoorInput } from "@mms/db/schemas";
import { STAFF_DOOR_COOKIE, staffDoorCookieOptions, type StaffDoor } from "./staff-door";

export type SetStaffDoorResult =
  | { ok: true; door: StaffDoor | null }
  | { ok: false; error: string };

/**
 * P7 — remember (or forget) this DEVICE's door.
 *
 * UNGATED, for the same reason `setStaffLang` is: the value carries no authority — it picks which of
 * two staff pages a tablet lands on, and every one of those pages still runs `requireStaffPage`. A
 * gate would add a live auth round trip to a tap that must feel instant, and would fail exactly when
 * the platform is flaky. Validation is the enum. `null` forgets the door (the doors screen returns).
 *
 * No `revalidatePath`: `/staff` is `force-dynamic`, and the caller navigates after the write.
 */
export async function setStaffDoor(raw: unknown): Promise<SetStaffDoorResult> {
  const parsed = staffDoorInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick the kitchen or the counter." };
  try {
    const jar = await cookies();
    if (parsed.data.door === null) jar.delete(STAFF_DOOR_COOKIE);
    else jar.set(STAFF_DOOR_COOKIE, parsed.data.door, staffDoorCookieOptions());
  } catch {
    // Only reachable outside a request scope. A refusal, never a throw — a door tap must not take
    // the whole staff screen to its error boundary.
    return { ok: false, error: "Couldn’t save that — tap again." };
  }
  return { ok: true, door: parsed.data.door };
}
