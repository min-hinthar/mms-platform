import { NextRequest, NextResponse } from "next/server";
import { serviceClient, sessionClient } from "@mms/db/server";
import { sessionMintInput } from "@mms/db/schemas";
import { generateJoinCode } from "@/lib/session-code";
import { getPostHogClient } from "@/lib/posthog-server";

type Sess = { id: string; mode: string; host_seat: string | null; qr_code: string };

/**
 * Table-session mint/join (closes red-team C2). A scanned QR — or, for the dine-in group cart
 * (M3·P3.1), a second phone scanning the same sticker or entering the host's invite code — posts
 * here; the server finds/creates ONE active table_session per code and joins the diner as a member.
 *
 * AUTH MODEL (P1.1 — docs/BACKEND_ARCHITECTURE.md §3): the client first calls
 * `supabase.auth.signInAnonymously()`, then POSTs here with `Authorization: Bearer <anon token>`.
 * The server VERIFIES that token (`getUser(token)` is a network round-trip to the auth server) to
 * get `auth.uid()`, and records it as `session_members.seat_id`. RLS (is_member/is_host) + private
 * Realtime then authorize off `auth.uid()` joined against session_members — no client-asserted
 * identity is trusted, and no custom JWT is minted (the diner keeps using its own anon session).
 *
 * GROUP JOIN (M3·P3.1): `qrCode` may be omitted — a host starting a fresh dine-in session with no
 * sticker. The SERVER then mints an unguessable join code (generateJoinCode) and returns it, so the
 * code is server-issued (QA §C). Find-or-create races safely: the table_sessions_active_qr_uniq
 * partial index makes two phones joining the same code at once collide (23505) → re-read → converge.
 */
export async function POST(req: NextRequest) {
  let body;
  try {
    body = sessionMintInput.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const { qrCode, mode, name, joinOnly } = body;

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
  const cols = "id,mode,host_seat,qr_code";
  const findActive = async (code: string): Promise<Sess | null> =>
    (
      await db
        .from("table_sessions")
        .select(cols)
        .eq("qr_code", code)
        .eq("status", "active")
        .maybeSingle()
    ).data ?? null;

  let sess: Sess | null = qrCode ? await findActive(qrCode) : null;
  let created = false;

  // Invite-code join (`?j=`) that matched nothing → don't mint a phantom table; tell the guest the
  // code is wrong. (A scanned sticker `?t=` or a host-start leaves joinOnly false → may provision.)
  if (joinOnly && !sess)
    return NextResponse.json({ error: "No table found for that code" }, { status: 404 });

  // Create when no active session exists for the code (or when the host omitted one → mint a code).
  // Up to a few attempts: a *generated* code that collides regenerates; a *provided* code that
  // collides means a concurrent joiner won the insert, so we re-read and join theirs.
  for (let attempt = 0; attempt < 6 && !sess; attempt++) {
    const code = qrCode ?? generateJoinCode();
    const { data, error } = await db
      .from("table_sessions")
      .insert({ qr_code: code, mode, host_seat: seat })
      .select(cols)
      .single();
    if (data) {
      sess = data;
      created = true;
      break;
    }
    if (error?.code === "23505") {
      // Unique violation on table_sessions_active_qr_uniq.
      if (qrCode) {
        sess = await findActive(qrCode); // concurrent first-joiner won → converge on their session
        break;
      }
      continue; // our generated code collided with a live session → try a fresh one
    }
    return NextResponse.json({ error: "Could not create session" }, { status: 500 });
  }
  if (!sess) return NextResponse.json({ error: "Could not create session" }, { status: 500 });

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
    const { error: memErr } = await db
      .from("session_members")
      .insert({ session_id: sess.id, seat_id: seat, display_name: name, role });
    // 23505 = unique_violation: a concurrent join already inserted this membership → fine, the row
    // exists. Any other error means the diner is NOT actually a member, so fail loudly instead of
    // returning a cartId that every later assertCartMember would 403 on (silently broken session).
    if (memErr && memErr.code !== "23505")
      return NextResponse.json({ error: "Could not join session" }, { status: 500 });
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
    const { data } = await db
      .from("qr_carts")
      .insert({ session_id: sess.id })
      .select("id")
      .single();
    if (data) {
      cart = data;
    } else {
      // Lost an insert race (partial unique index qr_carts_one_open_per_session) — the winner's
      // open cart exists now; re-read so concurrent joins converge on a single cart.
      const reread = await db
        .from("qr_carts")
        .select("id")
        .eq("session_id", sess.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!reread.data)
        return NextResponse.json({ error: "Could not create cart" }, { status: 500 });
      cart = reread.data;
    }
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: seat, // opaque uid — no PII in event props (QA §C P2)
    event: created ? "session_created" : "session_joined",
    properties: { session_id: sess.id, mode: sess.mode, role },
  });

  // `joinCode` = the session's qr_code → the code other phones scan/enter to join (dine-in group).
  return NextResponse.json({
    sessionId: sess.id,
    seat,
    role,
    cartId: cart.id,
    joinCode: sess.qr_code,
  });
}
