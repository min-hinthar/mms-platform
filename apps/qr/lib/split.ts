"use server";
import { serviceClient } from "@mms/db/server";
import { cartViewInput } from "@mms/db/schemas";
import { assertCartMember } from "./authz";

export type SplitContext = {
  mode: string;
  mySeat: string;
  myRole: "host" | "guest";
  members: { seat: string; name: string; role: "host" | "guest" }[];
};

/**
 * Group context the /cart split UI needs (M3·P3.3a): the session mode (the split shows for dine-in
 * groups only), the viewer's seat + role (drives canMutateLine in the UI), and the table's members
 * (the people a line can be assigned to + whose shares to show). Member-gated.
 *
 * The per-seat SHARES are computed client-side from the server-authoritative total + lines via the
 * isomorphic `split-math` (instant, cent-reconciled — see SplitSection). The SERVER share derivation
 * lands with P3.3b, where each share backs a real PaymentIntent and must be server-issued + stored.
 */
export async function getSplitContext(cartId: string): Promise<SplitContext> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { sessionId, uid, role } = await assertCartMember(id);
  const db = serviceClient();
  const { data: sess } = await db
    .from("table_sessions")
    .select("mode")
    .eq("id", sessionId)
    .maybeSingle();
  const { data: members } = await db
    .from("session_members")
    .select("seat_id,display_name,role,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return {
    // Default to "" (not "dinein") on a missing session row, so a transient read miss can't switch
    // on the group UI; a real dine-in session reports "dinein".
    mode: sess?.mode ?? "",
    mySeat: uid,
    myRole: role,
    members: (members ?? []).map((m) => ({
      seat: m.seat_id,
      name: m.display_name,
      role: m.role === "host" ? "host" : "guest",
    })),
  };
}
