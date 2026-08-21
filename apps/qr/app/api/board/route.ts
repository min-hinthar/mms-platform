import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { authorizeDevice } from "@/lib/device-auth";

export const runtime = "nodejs"; // node:crypto timingSafeEqual
export const dynamic = "force-dynamic";

/**
 * W3e: the order-ready board's poll (GET /api/board?k=<device token>). The TV can't join the private
 * RLS-gated realtime channels (an unauthenticated browser has no staff JWT), so it polls this SANITIZED
 * read on the house 5s-backstop cadence — no `realtime.messages` policy change, no staff session on a
 * wall-mounted device.
 *
 * Auth = `authorizeDevice` (lib/device-auth.ts), shared with the kiosk: the BOARD_DEVICE_TOKEN in the
 * URL — constant-time, checked BEFORE any DB read and before any auth round-trip, so a TV that is
 * already bookmarked keeps working through an auth-plane outage — OR a staff session, so a display
 * can be signed in with the same email OTP as the portals (owner, 2026-08-21). Neither credential ⇒
 * 401; no token configured AND not staff ⇒ 503 (the board stays opt-in config, docs/ENV.md); an auth
 * read that FAILS ⇒ 503 with the outage sentence, never 401 — "we cannot tell" is not "you are not
 * allowed". The response is deliberately minimal — first name (diner-chosen call-out),
 * short order code, status, ready-time — never items, amounts, tables, or ids beyond the 6-char tail
 * the diner's own /track shows.
 *
 * Scope: takeout + grocery ONLY (`table_number is null` — dine-in status stays on the diner's phone).
 * picked_up rows ride along for 10 minutes (togo_picked_up_at) so a just-collected name lingers briefly
 * in the Ready column, then auto-clears (SPEC-KDS §6).
 */
export async function GET(req: NextRequest) {
  const gate = await authorizeDevice("board", req.nextUrl.searchParams.get("k") ?? "");
  if (!gate.ok) {
    if (gate.reason === "not_configured") {
      return NextResponse.json(
        {
          error:
            "The order-ready board isn’t configured — set BOARD_DEVICE_TOKEN, or sign in on this device with a staff account.",
        },
        { status: 503 },
      );
    }
    if (gate.reason === "unavailable") {
      // W10b: the auth read failed, so whether this device is allowed is UNKNOWABLE. A 401 here
      // would tell a running TV it had been de-authorized during a database blip.
      return NextResponse.json(
        { error: "We can’t reach the sign-in service right now." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = serviceClient();
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // the picked-up linger window
  // Bound the scan to today's service (parity with the reconciler's 24h window) — an unbumped stray
  // "ready" from the morning must never crowd a just-ready customer off the ASC + limit read.
  const dayFloor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("qr_orders")
    .select("id,session_id,togo_status,customer_name,togo_ready_at,togo_picked_up_at,created_at")
    .is("table_number", null)
    .gte("created_at", dayFloor)
    .or(
      `togo_status.in.(preparing,ready),and(togo_status.eq.picked_up,togo_picked_up_at.gte.${since})`,
    )
    // A HELD scheduled order (fire_at still in the future) isn't being prepared yet — keep it off the
    // public board until the kitchen actually starts (the diner's own /track carries their status).
    // Separate .or() calls AND together in PostgREST.
    .or(`fire_at.is.null,fire_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(60);
  if (error) {
    console.error("[board] read failed:", error.message);
    return NextResponse.json({ error: "Board read failed" }, { status: 500 });
  }

  // Takeout + grocery ONLY (SPEC-KDS §6: dine-in status stays on the diner's phone). `table_number
  // is null` alone isn't sufficient — a dine-in session at an UNREGISTERED sticker stamps null too,
  // and its to-go box gets a togo_status (adversarial MED-2). Resolve the session's mode (sessions
  // are closed, never deleted — the read is durable; the expo does the same) and drop dine-in rows.
  const sessionIds = [
    ...new Set((data ?? []).map((o) => o.session_id).filter((s): s is string => !!s)),
  ];
  const { data: sessions } = sessionIds.length
    ? await db.from("table_sessions").select("id,mode").in("id", sessionIds)
    : { data: [] as { id: string; mode: string }[] };
  const modeBySession = new Map((sessions ?? []).map((s) => [s.id, s.mode]));

  const orders = (data ?? [])
    .filter((o) => (o.session_id ? modeBySession.get(o.session_id) !== "dinein" : true))
    .map((o) => ({
      code: o.id.slice(-6).toUpperCase(), // the same uuid-tail code the diner's /track + exit pass show
      name: o.customer_name ?? null,
      // A just-picked-up bag stays visible under Ready for its linger window, then drops.
      status: o.togo_status === "preparing" ? ("preparing" as const) : ("ready" as const),
      readyAt: o.togo_ready_at ?? null,
    }));

  return NextResponse.json(
    { orders, serverNow: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
