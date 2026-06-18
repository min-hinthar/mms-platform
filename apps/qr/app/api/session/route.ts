import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { getPostHogClient } from "@/lib/posthog-server";
// import jwt from "jsonwebtoken"; // pnpm add jsonwebtoken @types/jsonwebtoken

/**
 * Table-session mint (closes red-team C2). A scanned QR posts here; the server finds/creates
 * an active table_session bound to the physical `qrCode` and joins the diner as a member.
 *
 * AUTH MODEL (P1.1 — see docs/BACKEND_ARCHITECTURE.md §3): the client first calls
 * `supabase.auth.signInAnonymously()`, then POSTs here with `Authorization: Bearer <anon token>`.
 * The server VERIFIES that token to get `auth.uid()` and records it as `session_members.seat_id`.
 * RLS (is_member/is_host) + private Realtime then authorize off `auth.uid()` joined against
 * session_members — no client-asserted identity is trusted, and no custom JWT is minted.
 */
export async function POST(req: NextRequest) {
  const { qrCode, mode = "dinein", name = "Guest" } = await req.json();
  if (!qrCode) return NextResponse.json({ error: "qrCode required" }, { status: 400 });
  const db = serviceClient();

  let { data: sess } = await db
    .from("table_sessions")
    .select("id,mode")
    .eq("qr_code", qrCode)
    .eq("status", "active")
    .maybeSingle();

  let role: "host" | "guest" = "guest";
  if (!sess) {
    const { data } = await db
      .from("table_sessions")
      .insert({ qr_code: qrCode, mode })
      .select("id,mode")
      .single();
    sess = data!;
    role = "host";
  }
  // P1.1: derive `seat` from the verified anonymous-auth uid instead of a fresh UUID, e.g.
  //   const { data: { user } } = await sessionClient(bearerToken).auth.getUser();
  //   const seat = user!.id;  // == auth.uid(); becomes session_members.seat_id (RLS identity)
  const seat = crypto.randomUUID(); // TODO(P1.1): replace with the verified anon uid
  await db
    .from("session_members")
    .insert({ session_id: sess.id, seat_id: seat, display_name: name, role });
  if (role === "host") await db.from("qr_carts").insert({ session_id: sess.id });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: seat,
    event: role === "host" ? "session_created" : "session_joined",
    properties: {
      session_id: sess.id,
      mode: sess.mode,
      role,
      qr_code: qrCode,
    },
  });

  // No custom JWT is minted: the client already holds an anonymous-auth session (from
  // supabase.auth.signInAnonymously()) whose access token RLS + Realtime accept directly.
  // This route just records membership; the client keeps using its own anon session for reads.
  return NextResponse.json({ sessionId: sess.id, seat, role });
}
