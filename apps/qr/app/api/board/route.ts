import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serviceClient } from "@mms/db/server";

export const runtime = "nodejs"; // node:crypto timingSafeEqual
export const dynamic = "force-dynamic";

/**
 * W3e: the order-ready board's poll (GET /api/board?k=<device token>). The TV can't join the private
 * RLS-gated realtime channels (an unauthenticated browser has no staff JWT), so it polls this SANITIZED
 * read on the house 5s-backstop cadence — no `realtime.messages` policy change, no staff session on a
 * wall-mounted device.
 *
 * Auth = a single device token (BOARD_DEVICE_TOKEN) carried in the board URL. Constant-time compare,
 * checked BEFORE any DB read (an invalid token costs nothing); unset env ⇒ 503 (the board is opt-in
 * config, docs/ENV.md). The response is deliberately minimal — first name (diner-chosen call-out),
 * short order code, status, ready-time — never items, amounts, tables, or ids beyond the 6-char tail
 * the diner's own /track shows.
 *
 * Scope: takeout + grocery ONLY (`table_number is null` — dine-in status stays on the diner's phone).
 * picked_up rows ride along for 10 minutes (togo_picked_up_at) so a just-collected name lingers briefly
 * in the Ready column, then auto-clears (SPEC-KDS §6).
 */
export async function GET(req: NextRequest) {
  const expected = process.env.BOARD_DEVICE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "The order-ready board isn’t configured (BOARD_DEVICE_TOKEN)." },
      { status: 503 },
    );
  }
  const given = req.nextUrl.searchParams.get("k") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = serviceClient();
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // the picked-up linger window
  const { data, error } = await db
    .from("qr_orders")
    .select("id,togo_status,customer_name,togo_ready_at,togo_picked_up_at,created_at")
    .is("table_number", null)
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

  const orders = (data ?? []).map((o) => ({
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
