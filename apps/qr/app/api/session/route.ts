import { NextRequest, NextResponse } from "next/server";
import { serviceClient, sessionClient } from "@mms/db/server";
import { sessionMintInput } from "@mms/db/schemas";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * Table-session mint (closes red-team C2). A scanned QR posts here; the server finds/creates an
 * active table_session bound to the physical `qrCode` and joins the diner as a member.
 *
 * AUTH MODEL (P1.1 — docs/BACKEND_ARCHITECTURE.md §3): the client first calls
 * `supabase.auth.signInAnonymously()`, then POSTs here with `Authorization: Bearer <anon token>`.
 * The server VERIFIES that token (`getUser(token)` is a network round-trip to the auth server) to
 * get `auth.uid()`, and records it as `session_members.seat_id`. RLS (is_member/is_host) + private
 * Realtime then authorize off `auth.uid()` joined against session_members — no client-asserted
 * identity is trusted, and no custom JWT is minted (the diner keeps using its own anon session).
 */
export async function POST(req: NextRequest) {
  let body;
  try {
    body = sessionMintInput.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const { qrCode, mode, name } = body;

  // Verify the caller actually holds a valid anonymous-auth session.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const {
    data: { user },
    error: authErr,
  } = await sessionClient(token).auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const seat = user.id; // == auth.uid() → becomes session_members.seat_id (the RLS identity)

  const db = serviceClient();
  let { data: sess } = await db
    .from("table_sessions")
    .select("id,mode,host_seat")
    .eq("qr_code", qrCode)
    .eq("status", "active")
    .maybeSingle();

  let created = false;
  if (!sess) {
    const { data, error } = await db
      .from("table_sessions")
      .insert({ qr_code: qrCode, mode, host_seat: seat })
      .select("id,mode,host_seat")
      .single();
    if (error || !data)
      return NextResponse.json({ error: "Could not create session" }, { status: 500 });
    sess = data;
    created = true;
  }

  // Host identity is the seat that created the session — preserved across rejoins.
  const role: "host" | "guest" = sess.host_seat === seat ? "host" : "guest";

  // Idempotent membership: a refresh / rejoin must not trip unique(session_id, seat_id).
  const { data: existing } = await db
    .from("session_members")
    .select("id")
    .eq("session_id", sess.id)
    .eq("seat_id", seat)
    .maybeSingle();
  if (!existing) {
    await db
      .from("session_members")
      .insert({ session_id: sess.id, seat_id: seat, display_name: name, role });
  }

  // Find-or-create the session's OPEN cart (P1.2 "create-cart"). Idempotent: returns the existing
  // open cart, or a fresh one — so after a previous cart is paid (status≠'open') the next order
  // starts clean. The client drives /cart off the returned cartId; it never invents one.
  let { data: cart } = await db
    .from("qr_carts")
    .select("id")
    .eq("session_id", sess.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cart) {
    const { data, error } = await db
      .from("qr_carts")
      .insert({ session_id: sess.id })
      .select("id")
      .single();
    if (error || !data)
      return NextResponse.json({ error: "Could not create cart" }, { status: 500 });
    cart = data;
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: seat, // opaque uid — no PII in event props (QA §C P2)
    event: created ? "session_created" : "session_joined",
    properties: { session_id: sess.id, mode: sess.mode, role, qr_code: qrCode },
  });

  return NextResponse.json({ sessionId: sess.id, seat, role, cartId: cart.id });
}
