import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { authorizeDevice } from "@/lib/device-auth";
import { isUuid } from "@/lib/ticket-names";
import {
  PULSE_READY_LINGER_MS,
  shapeBoardPulse,
  type BoardPulse,
  type PulseCartRow,
  type PulseLineRow,
  type PulseSessionRow,
} from "@/lib/board-pulse";

export const runtime = "nodejs"; // node:crypto timingSafeEqual
export const dynamic = "force-dynamic";

/**
 * The session modes whose orders belong on a public screen — takeout and scan-and-go (SPEC-KDS §6).
 * `table_sessions.mode`'s CHECK admits exactly `dinein` · `scango` · `pickup`
 * (`20260618000000_qr_platform_init.sql`), so this is that set minus dine-in — written as the set it
 * IS, so a mode added later has to be added here deliberately instead of appearing on the wall.
 */
const BOARD_MODES = new Set(["pickup", "scango"]);

/** Bound the pulse's line scan the way the KDS bounds its own (`lib/kitchen.ts`). */
const PULSE_LINE_CAP = 500;

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
 *
 * P6 — the SECOND section, for the second audience in the same room. `pulse` carries the kitchen's
 * load (ticket count · oldest fire time · an unattributed dish rail) and dine-in as TABLE NUMBER +
 * a coarse status, and NOTHING else: the boundary is `lib/board-pulse.ts`'s output type, which has
 * no field for a name, an id, a per-table dish list, a modifier or an amount. The `orders` array
 * above is untouched by this — dine-in still never reaches it.
 *
 * ⚠️ TWO READ POSTURES, and the difference between them is the point:
 *  · the SESSION-MODE read is fail-CLOSED (503, nothing published). Its failure would let dine-in
 *    names onto the Ready column, so a dropped read there exposes MORE than a successful one.
 *  · the PULSE reads are fail-DEGRADED (`pulse: null`, the Ready column still publishes). Their
 *    failure can only REMOVE information, never add any — and `null` is not zero: the screen renders
 *    "we can't read the kitchen", never "all clear" over a full wok, which is the lie `lib/kitchen.ts`
 *    already learned to refuse.
 */
export async function GET(req: NextRequest) {
  const gate = await authorizeDevice("board", req.nextUrl.searchParams.get("k") ?? "");
  if (!gate.ok) {
    if (gate.reason === "not_configured") {
      return NextResponse.json(
        {
          reason: "not_configured",
          error:
            "The order-ready board isn’t configured — set BOARD_DEVICE_TOKEN, or sign in on this device with a staff account.",
        },
        { status: 503 },
      );
    }
    if (gate.reason === "unavailable") {
      // W10b: the auth read failed, so whether this device is allowed is UNKNOWABLE. A 401 here
      // would tell a running TV it had been de-authorized during a database blip.
      // The `reason` is what lets the TV tell this apart from `not_configured`: both are 503, but
      // one is a setup answer and the other is a blip. Without it the client blanked a live board
      // on an auth wobble — the opposite of what this branch exists for (Codex round 1, P2).
      return NextResponse.json(
        { reason: "unavailable", error: "We can’t reach the sign-in service right now." },
        { status: 503 },
      );
    }
    // `reason` on the 401 too, not just on the 503s: it is what lets the TV tell OUR denial apart
    // from any other 401 it might receive. An edge service in front of this route — Vercel's own
    // deployment protection on a protected preview, a corporate proxy, an SSO gateway — answers 401
    // with HTML or its own envelope, and a client that trusts the status alone blanks a live board
    // on it (Codex round 2 on #222). Naming the reason makes the discriminator explicit rather than
    // a shape heuristic.
    return NextResponse.json(
      { reason: "denied", error: "This screen isn’t authorized for the order-ready board." },
      { status: 401 },
    );
  }

  const db = serviceClient();
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // the picked-up linger window
  // Bound the scan to today's service (parity with the reconciler's 24h window) — an unbumped stray
  // "ready" from the morning must never crowd a just-ready customer off the ASC + limit read.
  const dayFloor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // P6 — the DATABASE clock, for the pulse alone. Every other window on this route is coarse
  // (10 minutes, 24 hours) and app-clock skew cannot reach it; the pulse's undo-grace comparison is
  // 10 SECONDS wide, and `lib/kitchen.ts` documents what a skew does there — a line the DB still
  // considers undoable surfaces as cooking. `mms_now` is the same read the KDS makes, with the same
  // app-clock fallback when the rpc itself fails.
  const [nowRes, ordersRes] = await Promise.all([
    db.rpc("mms_now"),
    db
      .from("qr_orders")
      .select("id,session_id,togo_status,customer_name,togo_ready_at,togo_picked_up_at,created_at")
      .is("table_number", null)
      .gte("created_at", dayFloor)
      .or(
        `togo_status.in.(preparing,ready),and(togo_status.eq.picked_up,togo_picked_up_at.gte.${since})`,
      )
      // A HELD scheduled order (fire_at still in the future) isn't being prepared yet — keep it off
      // the public board until the kitchen actually starts (the diner's own /track carries their
      // status). Separate .or() calls AND together in PostgREST.
      .or(`fire_at.is.null,fire_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(60),
  ]);
  const { data, error } = ordersRes;
  if (error) {
    console.error("[board] read failed:", error.message);
    return NextResponse.json({ error: "Board read failed" }, { status: 500 });
  }
  const dbNowIso = nowRes.data ?? nowIso;
  const dbNowMs = new Date(dbNowIso).getTime();

  // ── P6: the kitchen pulse's own reads ────────────────────────────────────────────────────────
  // Live kitchen lines, plus the just-bumped ones a `ready` table is derived from. Bounded to
  // today's service for the same reason the orders read is, and ordered oldest-first so a
  // truncation at the cap drops the NEWEST rows — an under-report, which is the safe direction for
  // both honesty (the count only ever understates the wok) and exposure (fewer rows, never more).
  const pulseDayFloor = new Date(dbNowMs - 24 * 60 * 60 * 1000).toISOString();
  const readyFloor = new Date(dbNowMs - PULSE_READY_LINGER_MS).toISOString();
  const linesRes = await db
    .from("qr_cart_items")
    .select("cart_id,menu_item_id,name,qty,state,fire_at,bumped_at")
    .not("fire_at", "is", null)
    .gte("fire_at", pulseDayFloor)
    .or(`state.in.(fired,in_progress),and(state.eq.served,bumped_at.gte.${readyFloor})`)
    .order("fire_at", { ascending: true })
    .limit(PULSE_LINE_CAP);
  if (linesRes.error) console.error("[board] pulse line read failed:", linesRes.error.message);
  const lines = (linesRes.data ?? []) as PulseLineRow[];

  // The parent carts, filtered to the two statuses whose lines are legitimately in the kitchen —
  // `lib/kitchen.ts`'s rule, restated: dine-in cooks while OPEN, and a to-go batch fired at
  // checkout lives on a PAID cart. A line whose cart is absent from this answer is dropped by the
  // shaper, never counted anonymously.
  const cartIds = [...new Set(lines.map((l) => l.cart_id))];
  const cartsRes = cartIds.length
    ? await db
        .from("qr_carts")
        .select("id,session_id,status")
        .in("id", cartIds)
        .in("status", ["open", "paid"])
    : { data: [] as { id: string; session_id: string; status: string }[], error: null };
  if (cartsRes.error) console.error("[board] pulse cart read failed:", cartsRes.error.message);
  const pulseCarts = (cartsRes.data ?? []) as PulseCartRow[];
  // A failed read is UNKNOWN, not empty. `pulse: null` is the whole degrade: the Ready column above
  // still publishes, and the screen says it cannot read the kitchen rather than drawing an empty
  // band that reads "all clear".
  const pulseReadable = !linesRes.error && !cartsRes.error;

  // Takeout + grocery ONLY (SPEC-KDS §6: dine-in status stays on the diner's phone). `table_number
  // is null` alone isn't sufficient — a dine-in session at an UNREGISTERED sticker stamps null too,
  // and its to-go box gets a togo_status (adversarial MED-2). Resolve the session's mode (sessions
  // are closed, never deleted — the read is durable; the expo does the same) and drop dine-in rows.
  //
  // P6 widens this ONE read rather than adding a second: the pulse needs `status` and
  // `table_number` for the same rows plus the pulse carts' sessions, and two reads of one table
  // could disagree about a session mid-transition — the orders half publishing a name the pulse
  // half had already reclassified. One read, one answer, one failure posture.
  const sessionIds = [
    ...new Set(
      [...(data ?? []).map((o) => o.session_id), ...pulseCarts.map((c) => c.session_id)].filter(
        (s): s is string => !!s,
      ),
    ),
  ];
  const { data: sessions, error: sessionsError } = sessionIds.length
    ? await db.from("table_sessions").select("id,mode,status,table_number").in("id", sessionIds)
    : { data: [] as PulseSessionRow[], error: null };
  // M108-adjacent: this filter is the ONLY thing keeping dine-in off a wall-mounted public screen,
  // and it read fail-OPEN — a failed read left the map empty, every `undefined !== "dinein"` passed,
  // and the whole table's diner-chosen first names went up on the TV. The exposure a dropped read
  // causes must never exceed the one a successful read allows, so an unknowable mode is 503 (the
  // board's own retry-and-hold refusal, already handled by `readBoardRefusal`), never a publish.
  if (sessionsError) {
    console.error("[board] session mode read failed:", sessionsError.message);
    // `unavailable`, the reason the board's client already folds to retry-and-hold (board-poll.ts) —
    // but its OWN sentence: the sign-in service is fine here, the second read is what dropped, and a
    // message that names the wrong subsystem is the next reader's first wrong turn.
    return NextResponse.json(
      { reason: "unavailable", error: "We can’t read the board right now." },
      { status: 503 },
    );
  }
  const modeBySession = new Map((sessions ?? []).map((s) => [s.id, s.mode]));

  const orders = (data ?? [])
    // ALLOWLIST, not "anything that isn't dine-in". Two rounds got this wrong in the same direction:
    // the shipped `!== "dinein"` on an EMPTY map published everything, and the first fix
    // (`mode !== undefined && mode !== "dinein"`) only closed the absent-row half — it is still a
    // one-string blacklist, so the day `table_sessions.mode`'s CHECK gains a fourth value that means
    // table service, every such order publishes a name with nobody having decided that. The board is
    // defined POSITIVELY (SPEC-KDS §6: takeout + grocery), so name those modes and let a mode this
    // code has never heard of be absent from the wall rather than on it — staff can see a missing
    // name; nobody can see a name that should not be there. A null session_id is unknowable, not
    // to-go: the column is nullable, but every insert sources it from `qr_carts.session_id`, which is
    // NOT NULL, so today it cannot happen at all and the safe reading costs nothing.
    .filter((o) => {
      const mode = o.session_id ? modeBySession.get(o.session_id) : undefined;
      return mode !== undefined && BOARD_MODES.has(mode);
    })
    .map((o) => ({
      code: o.id.slice(-6).toUpperCase(), // the same uuid-tail code the diner's /track + exit pass show
      name: o.customer_name ?? null,
      // A just-picked-up bag stays visible under Ready for its linger window, then drops.
      status: o.togo_status === "preparing" ? ("preparing" as const) : ("ready" as const),
      readyAt: o.togo_ready_at ?? null,
    }));

  // The Burmese half of the all-day rail, from the LIVE catalog — ADVISORY, the P1 posture: a failed
  // read logs and the rail renders the English snapshot names, which is exactly what a wall with no
  // rail at all showed yesterday. A name read cannot misidentify anything, and withholding the whole
  // band over a label would be the over-blocking direction. Partitioned to uuid-shaped ids BEFORE
  // the IN-list: `menu_item_id` is a soft ref that also carries grocery barcodes, and one malformed
  // value fails the whole query.
  const menuIds = [...new Set(lines.map((l) => l.menu_item_id).filter(isUuid))];
  const menuRes =
    pulseReadable && menuIds.length
      ? await db.from("menu_items").select("id,name_my").in("id", menuIds)
      : { data: [] as { id: string; name_my: string | null }[], error: null };
  if (menuRes.error)
    console.error(
      "[board] pulse name_my read failed — the rail renders EN:",
      menuRes.error.message,
    );

  const pulse: BoardPulse | null = pulseReadable
    ? shapeBoardPulse({
        lines,
        cartById: new Map(pulseCarts.map((c) => [c.id, c])),
        sessionById: new Map((sessions ?? []).map((s) => [s.id, s as PulseSessionRow])),
        nameMyByItem: new Map(
          (menuRes.error ? [] : (menuRes.data ?? [])).map((m) => [m.id, m.name_my]),
        ),
        nowMs: dbNowMs,
      })
    : null;

  return NextResponse.json(
    { orders, pulse, serverNow: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
