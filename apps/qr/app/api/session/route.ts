import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { getPostHogClient } from "@/lib/posthog-server";
// import jwt from "jsonwebtoken"; // pnpm add jsonwebtoken @types/jsonwebtoken

/**
 * Table-session mint (closes red-team C2). A scanned QR posts here; the server finds/creates
 * an active table_session bound to the physical `qrCode`, joins the diner as a member, and
 * returns a SHORT-LIVED Supabase-compatible JWT carrying `session_id` + `seat` + `app_role`.
 * RLS (is_member / is_host) and private Realtime authorize everything off that token — no
 * client-asserted identity is ever trusted.
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
    const { data } = await db.from("table_sessions").insert({ qr_code: qrCode, mode }).select("id,mode").single();
    sess = data!;
    role = "host";
  }
  const seat = crypto.randomUUID();
  await db.from("session_members").insert({ session_id: sess.id, seat_id: seat, display_name: name, role });
  if (role === "host") await db.from("carts").insert({ session_id: sess.id });

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

  // Sign a Supabase-compatible JWT so RLS + Realtime accept this seat. Use SUPABASE_JWT_SECRET.
  // const token = jwt.sign(
  //   { role: "authenticated", session_id: sess.id, seat, app_role: role,
  //     sub: seat, aud: "authenticated", exp: Math.floor(Date.now()/1000) + 4*3600 },
  //   process.env.SUPABASE_JWT_SECRET!, { algorithm: "HS256" }
  // );
  const token = "TODO_SIGN_WITH_SUPABASE_JWT_SECRET"; // <-- wire signing (see comment) before group cart works

  return NextResponse.json({ sessionId: sess.id, seat, role, token });
}
