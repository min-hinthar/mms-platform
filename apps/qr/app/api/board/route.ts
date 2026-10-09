import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { authorizeDevice } from "@/lib/device-auth";
import { loadLineNames } from "@/lib/line-names";
import { queueEmptiness, queueFloorIso } from "@/lib/queue-window";
import {
  PULSE_PASS_LINGER_MS,
  PULSE_TABLE_MODES,
  type PulseCartRow,
  type PulseSessionRow,
} from "@/lib/board-pulse";
import { shapeBoardTables, type BoardLineRow, type BoardTable } from "@/lib/board-tables";
import { readRounds, roundFor } from "@/lib/kitchen-round-read";

export const runtime = "nodejs"; // node:crypto timingSafeEqual
export const dynamic = "force-dynamic";

/**
 * The session modes whose ORDER CODES belong on the wall — takeout and scan-and-go (SPEC-KDS §6).
 * `table_sessions.mode`'s CHECK admits exactly `dinein` · `scango` · `pickup`
 * (`20260618000000_qr_platform_init.sql`), so this is that set minus dine-in — written as the set it
 * IS, so a mode added later has to be added here deliberately instead of appearing on the wall.
 * (A dine-in table reaches the wall too since PD9 — as a table pass, through `lib/board-tables.ts`,
 * never as a code.)
 */
const BOARD_MODES = new Set(["pickup", "scango"]);

/** PD9 — the kitchen half's line read is bounded the way the KDS bounds its own (`lib/kitchen.ts`).
 *  Past it the read did not answer which food is on the wall: `tables: null`, never a partial wall
 *  (m9 decision 23: an incomplete pass is a lie a guest reads as "they forgot my tea"). */
const TABLE_LINE_CAP = 500;
/** PD9 (Codex round 4 on #319) — the second read that completes every Send on the wall: every line of
 *  each of its batches, whenever it was bumped. Same bound, same refusal. */
const SEND_LINE_CAP = 500;

/**
 * W3e: the order-ready board's poll (GET /api/board?k=<device token>). The TV can't join the private
 * RLS-gated realtime channels (an unauthenticated browser has no staff JWT), so it polls this SANITIZED
 * read on the house 5s-backstop cadence — no `realtime.messages` policy change, no staff session on a
 * wall-mounted device. Every read below is the service client's; nothing here is an RLS path, and
 * nothing writes.
 *
 * Auth = `authorizeDevice` (lib/device-auth.ts), shared with the kiosk: the BOARD_DEVICE_TOKEN in the
 * URL — constant-time, checked BEFORE any DB read and before any auth round-trip, so a TV that is
 * already bookmarked keeps working through an auth-plane outage — OR a staff session, so a display
 * can be signed in with the same email OTP as the portals (owner, 2026-08-21). Neither credential ⇒
 * 401; no token configured AND not staff ⇒ 503 (the board stays opt-in config, docs/ENV.md); an auth
 * read that FAILS ⇒ 503 with the outage sentence, never 401 — "we cannot tell" is not "you are not
 * allowed".
 *
 * WHAT IT PUBLISHES (PD9 — the owner's 2026-10-07 reversal of the shipped boundary; m9; PATH_DESIGN
 * decision 11), and nothing else:
 *
 *  · `orders` — pickup and scan-and-go bags as `{ code, status }`: the 6-character uuid tail the
 *    guest's own /track and claim ticket show, and `preparing` / `ready`. NO guest name (m9 decision
 *    19: the code is the one identity on the wall; Dad still calls the name aloud, the shipped
 *    checkout promise), NO wait or ready time (m9 critic B4: the wall never shows an age that ticks
 *    with no food changing state), and NO collected bag (critic B4: a handed-over bag drawn as a
 *    Ready pass would be the room's one CALL for food someone is holding). Ready newest readiness
 *    first, then Preparing next up first — the order the wall draws them in.
 *  · `tables` — every dine-in table with food in the kitchen: a table number, per Send its round,
 *    per dish its name and stage on the ONE KITCHEN TRACK. The boundary is `lib/board-tables.ts`'s
 *    output type: no name, id, quantity, modifier, note, seat, comp, void, amount, time or age.
 *    THIS IS THE REVERSAL: the room now reads what each table ordered while it cooks (OPEN-ITEMS
 *    K32(b), P6a; `lib/board-pulse.ts` keeps the record of the rule it replaces).
 *
 * ⚠️ TWO READ POSTURES, and the difference between them is the point:
 *  · the SESSION-MODE read is fail-CLOSED (503, nothing published). Its failure would let a dine-in
 *    session's bag onto the code column, so a dropped read there exposes MORE than a successful one.
 *  · the KITCHEN reads are fail-DEGRADED (`tables: null`, the code column still publishes). Their
 *    failure can only REMOVE information — and `null` is not zero: the screen says it cannot read
 *    the kitchen, never "all clear" over a full wok, the lie `lib/kitchen.ts` already refuses. The
 *    round read and the name read are ADVISORY below that: a failure leaves rounds unnumbered and
 *    names English, and the tables still publish.
 */
/** K32 (A4·1) — the orders scan's cap, named so the saturation guard and the read agree. */
const BOARD_ORDER_CAP = 60;

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
      { reason: "denied", error: "This screen isn’t allowed to show the order-ready board." },
      { status: 401 },
    );
  }

  const db = serviceClient();
  const nowIso = new Date().toISOString();
  // Bound the scan to today's service — an unbumped stray "ready" from the morning must never crowd
  // a just-ready bag off the capped read. K32 (A4·1) — the SHARED window rule the KDS and expo read.
  const dayFloor = queueFloorIso(nowIso);
  // The DATABASE clock, for the kitchen half: its send-grace comparison is 10 SECONDS wide and the
  // Served stamp waits out `KDS_UNDO_MS` (6 s) — an app-clock skew there surfaces a dish the DB still
  // considers undoable. `mms_now` is the KDS's own read, with the same app-clock fallback.
  const [nowRes, ordersRes] = await Promise.all([
    db.rpc("mms_now"),
    db
      .from("qr_orders")
      .select("id,session_id,togo_status,togo_ready_at,created_at")
      .is("table_number", null)
      .gte("created_at", dayFloor)
      .in("togo_status", ["preparing", "ready"])
      // A HELD scheduled order (fire_at still in the future) isn't being prepared yet — keep it off
      // the public board until the kitchen actually starts (the diner's own /track carries their
      // status).
      .or(`fire_at.is.null,fire_at.lte.${nowIso}`)
      // NEWEST READINESS first, then creation (the blind pass on A4·1, CRITICAL 3; the key reshaped
      // by Codex round 1): `picked_up` is a manual expo tap, so untapped `ready` rows accumulate all
      // day and an oldest-first cap would drop the bag that just came up in favour of one handed over
      // at lunch — and `created_at` is the wrong key for a cap: a scheduled pickup placed at
      // breakfast and readied at six is the OLDEST creation on the wall. `togo_ready_at DESC NULLS
      // LAST` keeps the newest readiness first and the still-preparing bags after it.
      .order("togo_ready_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(BOARD_ORDER_CAP),
  ]);
  const { data, error } = ordersRes;
  if (error) {
    console.error("[board] read failed:", error.message);
    return NextResponse.json({ error: "Board read failed" }, { status: 500 });
  }
  // K32 (A4·1) — a capped read that came back FULL did not see the whole window. It is LOGGED and the
  // newest bags publish; it is never a refusal (the blind pass on A4·1, CRITICAL 3). The cure is
  // tapping old bags picked up, and the log says so.
  if (queueEmptiness((data ?? []).length, BOARD_ORDER_CAP) === "cannot-say")
    console.warn(
      "[board] orders read saturated — the bags readied longest ago are off the wall; tap them picked up",
      { cap: BOARD_ORDER_CAP },
    );
  // ⚠️ VALIDATED, not merely defaulted: `dbNowMs` feeds `toISOString()` below, which THROWS on a NaN
  // date — and would 500 the customer-facing code column over one unparseable rpc answer.
  const dbNowMs = (() => {
    const fromDb = nowRes.data === null ? NaN : new Date(nowRes.data).getTime();
    return Number.isFinite(fromDb) ? fromDb : Date.parse(nowIso);
  })();
  const dbNowIso = new Date(dbNowMs).toISOString();

  // ── PD9: the kitchen half's reads ────────────────────────────────────────────────────────────
  // Live kitchen lines and the just-bumped ones, in the KDS's own window: a stamped line inside the
  // day floor, or a fired line with NO fire time created inside it (`lib/kitchen.ts`'s M2 arm), so a
  // dish is on the wall exactly when it is on the KDS. Only the columns the shaper reads: never a
  // quantity, a modifier or a note — the wall never publishes them, so the route never fetches them.
  const tableDayFloor = queueFloorIso(dbNowIso);
  const passFloor = new Date(dbNowMs - PULSE_PASS_LINGER_MS).toISOString();
  const LINE_COLS =
    "id,cart_id,menu_item_id,name,state,fire_at,fire_batch,fulfillment,created_at,bumped_at";
  const linesRes = await db
    .from("qr_cart_items")
    .select(LINE_COLS)
    .or(`fire_at.gte.${tableDayFloor},and(fire_at.is.null,created_at.gte.${tableDayFloor})`)
    .or(`state.in.(fired,in_progress),and(state.eq.served,bumped_at.gte.${passFloor})`)
    .order("fire_at", { ascending: true })
    .limit(TABLE_LINE_CAP);
  if (linesRes.error) console.error("[board] kitchen line read failed:", linesRes.error.message);
  const linesSaturated =
    !linesRes.error &&
    queueEmptiness((linesRes.data ?? []).length, TABLE_LINE_CAP) === "cannot-say";
  if (linesSaturated)
    console.error(
      "[board] kitchen line read saturated — the wall shows no tables rather than some",
      {
        cap: TABLE_LINE_CAP,
      },
    );
  // ANNOTATED, never `as`: the generated types are the only mechanical check that the shaper's row
  // type still describes the columns this route selects.
  const lines: BoardLineRow[] = linesRes.data ?? [];

  // The parent carts, filtered to the two statuses whose lines are legitimately in the kitchen —
  // `lib/kitchen.ts`'s rule: dine-in cooks while OPEN, and food fired at a settlement lives on a PAID
  // cart. A line whose cart is absent is dropped by the shaper, never published.
  const cartIds = [...new Set(lines.map((l) => l.cart_id))];
  const cartsRes = cartIds.length
    ? await db
        .from("qr_carts")
        .select("id,session_id,status")
        .in("id", cartIds)
        .in("status", ["open", "paid"])
    : { data: [] as PulseCartRow[], error: null };
  if (cartsRes.error) console.error("[board] kitchen cart read failed:", cartsRes.error.message);
  const kitchenCarts: PulseCartRow[] = cartsRes.data ?? [];

  // ONE session read for both halves: the orders' modes (the code column's allowlist) and the
  // kitchen carts' sessions (which are tables, and which number). Two reads of one table could
  // disagree about a session mid-transition. One read, one answer, one failure posture.
  const sessionIds = [
    ...new Set(
      [...(data ?? []).map((o) => o.session_id), ...kitchenCarts.map((c) => c.session_id)].filter(
        (s): s is string => !!s,
      ),
    ),
  ];
  const { data: sessions, error: sessionsError } = sessionIds.length
    ? await db
        .from("table_sessions")
        .select("id,mode,status,table_number,expires_at")
        .in("id", sessionIds)
    : { data: [] as PulseSessionRow[], error: null };
  // M108-adjacent: this read is the ONLY thing keeping a dine-in session's bag off the code column,
  // and it read fail-OPEN once — a failed read left the map empty and every `undefined !== "dinein"`
  // passed. The exposure a dropped read causes must never exceed the one a successful read allows,
  // so an unknowable mode is 503 (the board's own retry-and-hold refusal), never a publish.
  if (sessionsError) {
    console.error("[board] session mode read failed:", sessionsError.message);
    return NextResponse.json(
      { reason: "unavailable", error: "We can’t read the board right now." },
      { status: 503 },
    );
  }
  const sessionById = new Map<string, PulseSessionRow>((sessions ?? []).map((s) => [s.id, s]));

  const orders = (data ?? [])
    // ALLOWLIST, not "anything that isn't dine-in": a mode this code has never heard of is absent
    // from the wall rather than on it. A null session_id is unknowable, not to-go.
    .filter((o) => {
      const mode = o.session_id ? sessionById.get(o.session_id)?.mode : undefined;
      return mode !== undefined && BOARD_MODES.has(mode);
    })
    .map((o) => ({
      code: o.id.slice(-6).toUpperCase(), // the same uuid-tail code the guest's /track + claim ticket show
      status: o.togo_status === "ready" ? ("ready" as const) : ("preparing" as const),
      created: o.created_at,
    }));
  // The order the wall draws them in, decided here so no instant ever crosses to the screen: Ready
  // as the read ranked it (newest readiness first), Preparing next up first (oldest creation).
  const published = [
    ...orders.filter((o) => o.status === "ready"),
    ...orders
      .filter((o) => o.status === "preparing")
      .sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0)),
  ].map(({ code, status }) => ({ code, status }));

  // Every Send on the wall, COMPLETE (Codex round 4 on #319): the line read's `bumped_at >=
  // passFloor` cut would drop a dish served long before its round finished, so every line of each
  // dine-in batch on the wall is read again, whenever it was bumped — the shaper then sees the whole
  // Send until its last dish is out. Bounded, refused at the cap like the line read.
  const kitchenReadable = !linesRes.error && !linesSaturated && !cartsRes.error;
  const cartById = new Map(kitchenCarts.map((c) => [c.id, c]));
  const isTableCart = (cartId: string) => {
    const cart = cartById.get(cartId);
    const sess = cart ? sessionById.get(cart.session_id) : undefined;
    return sess !== undefined && PULSE_TABLE_MODES.has(sess.mode);
  };
  const batches = kitchenReadable
    ? [
        ...new Set(
          lines.flatMap((l) =>
            l.fire_batch !== null && isTableCart(l.cart_id) ? [l.fire_batch] : [],
          ),
        ),
      ]
    : [];
  const tableSessionIds = [
    ...new Set(kitchenCarts.filter((c) => isTableCart(c.id)).map((c) => c.session_id)),
  ];
  // The rounds are the KDS's own read (`lib/kitchen-round-read.ts`), so the wall and Mom's board give
  // one card one number. ADVISORY: `null` leaves every round unnumbered; it never blocks the wall.
  const [sendRes, rounds] = await Promise.all([
    batches.length
      ? db
          .from("qr_cart_items")
          .select(LINE_COLS)
          .in("fire_batch", batches)
          .in("state", ["fired", "in_progress", "served"])
          .limit(SEND_LINE_CAP)
      : Promise.resolve({ data: [] as BoardLineRow[], error: null }),
    kitchenReadable ? readRounds(db, tableSessionIds, dbNowIso) : Promise.resolve(null),
  ]);
  if (sendRes.error) console.error("[board] send completion read failed:", sendRes.error.message);
  const sendSaturated =
    !sendRes.error && queueEmptiness((sendRes.data ?? []).length, SEND_LINE_CAP) === "cannot-say";
  if (sendSaturated)
    console.error(
      "[board] send completion read saturated — the wall shows no tables rather than some",
      {
        cap: SEND_LINE_CAP,
      },
    );
  const tablesReadable = kitchenReadable && !sendRes.error && !sendSaturated;
  const sendLines: BoardLineRow[] = sendRes.data ?? [];
  const allLines = [...new Map([...lines, ...sendLines].map((l) => [l.id, l])).values()];

  // The catalog's Burmese, through the ONE loader — ADVISORY (the P1 posture): a failed read logs and
  // the dish rows draw the English snapshot names. Not asked when there are no tables to name.
  const names = tablesReadable
    ? await loadLineNames(db, allLines, { tag: "board" })
    : { nameMyByRef: new Map<string, string | null>() };

  const tables: BoardTable[] | null = tablesReadable
    ? shapeBoardTables({
        lines: allLines,
        cartById,
        sessionById,
        nameMyByItem: names.nameMyByRef,
        roundOf: (sessionId, batch) => roundFor(rounds, sessionId, batch),
        nowIso: dbNowIso,
      })
    : null;

  return NextResponse.json(
    { orders: published, tables, serverNow: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
