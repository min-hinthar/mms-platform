import { NextRequest, NextResponse } from "next/server";
import { serviceClient, sessionClient } from "@mms/db/server";
import { sessionMintInput } from "@mms/db/schemas";
import { generateJoinCode, isReservedSessionCode } from "@/lib/session-code";
import { sessionExpiryFromNow } from "@/lib/session-ttl";
import { withinJoinRate } from "@/lib/rate";
import { isTransportFailure } from "@/lib/authz";
import { MAX_PARTY_SIZE } from "@/lib/limits";
import { getPostHogClient } from "@/lib/posthog-server";

type Sess = {
  id: string;
  mode: string;
  host_seat: string | null;
  qr_code: string;
  table_number: number | null;
};

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
  const { qrCode, mode, name, joinOnly, tableNumber } = body;

  // Verify the caller actually holds a valid anonymous-auth session.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const {
    data: { user },
    error: authErr,
  } = await sessionClient(token).auth.getUser(token);
  // W10a — an auth-plane TRANSPORT failure is 503 "we're down", never 401 "Invalid session": during
  // the paused-project outage every diner with a perfectly good token was told their session was
  // invalid, and the client's recovery (re-mint) churned uselessly against the same dead plane.
  // The client keys its honest we-are-down copy off this status.
  if (authErr && isTransportFailure(authErr))
    return NextResponse.json(
      { error: "We’re having trouble on our end — try again in a moment", kind: "unavailable" },
      { status: 503, headers: { "Retry-After": "20" } },
    );
  if (authErr || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const seat = user.id; // == auth.uid() → becomes session_members.seat_id (the RLS identity)

  // Rate-limit join/mint per device (P3.4): this is a public POST, so a verified-but-hostile client
  // could flood it (find-or-create thrash, session spam). Bound attempts per verified seat. Fail-open
  // (lib/rate) — a limiter glitch never blocks a legit diner. New-seat churn is bounded by GoTrue's
  // anonymous sign-up rate limit a layer down (supabase/config.toml).
  if (!(await withinJoinRate(seat)))
    return NextResponse.json(
      { error: "Too many attempts — wait a moment and try again." },
      { status: 429 },
    );

  const db = serviceClient();
  const cols = "id,mode,host_seat,qr_code,table_number";

  // K2 (Journey II): resolve the effective session key + the registered table number.
  //  • Dine-in PICKER path (a `tableNumber` with no token): look up the table's registered sticker
  //    qr_code server-side — the token never travels to the client. The picker is advisory, so the
  //    mint re-checks the table is registered + active (a stale/forged number 400s here).
  //  • Sticker/invite path (a `qrCode`): resolve the table number FROM the token so the session is
  //    stamped even when a physical sticker is scanned — null for a host-mint code / legacy sticker.
  // `resolvedQr` then drives find-or-create exactly as `qrCode` did; `sessionTable` stamps the insert.
  let resolvedQr = qrCode;
  let sessionTable: number | null = null;
  if (mode === "dinein") {
    if (!resolvedQr && tableNumber != null) {
      const { data: tbl } = await db
        .from("qr_tables")
        .select("qr_code")
        .eq("table_number", tableNumber)
        .eq("active", true)
        .maybeSingle();
      if (!tbl)
        return NextResponse.json(
          { error: "That table isn’t available — scan its sticker or pick another." },
          { status: 400 },
        );
      resolvedQr = tbl.qr_code;
      sessionTable = tableNumber;
    } else if (resolvedQr) {
      const { data: tbl } = await db
        .from("qr_tables")
        .select("table_number")
        .eq("qr_code", resolvedQr)
        .eq("active", true)
        .maybeSingle();
      sessionTable = tbl?.table_number ?? null;
    }
  }
  // Find an active AND non-expired session for the code. The expiry filter MUST match assertCartMember
  // + the is_member RLS fn (both reject `expires_at <= now()`): without it the mint would hand back a
  // still-'active' but expired session that every later cart write then 403s on (the strand bug).
  const findActive = async (code: string): Promise<Sess | null> =>
    (
      await db
        .from("table_sessions")
        .select(cols)
        .eq("qr_code", code)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
    ).data ?? null;

  let sess: Sess | null = resolvedQr ? await findActive(resolvedQr) : null;
  let created = false;

  // Invite-code join (`?j=`) that matched nothing → don't mint a phantom table; tell the guest the
  // code is wrong. (A scanned sticker `?t=` or a host-start leaves joinOnly false → may provision.)
  if (joinOnly && !sess)
    return NextResponse.json({ error: "No table found for that code" }, { status: 404 });

  // K2 — the picker's CLAIM path (`tableNumber`) expects an EMPTY table. If one is already active
  // (someone claimed/sat this table between the picker's occupancy read and now), do NOT silently
  // drop this diner into a stranger's live cart — the seated-table rule requires the party's code or
  // a physical sticker scan (`?t=`, which uses the qrCode path, not this one). Refuse with guidance.
  //
  // W5a — UNLESS the "stranger" is the party itself: a swipe-back diner re-tapping their OWN table
  // in the picker was 409'd here (the re-entry dead end). If this seat is already a member of the
  // active session, converge on it — a rejoin, not a takeover; the stranger refusal below is intact.
  if (tableNumber != null && sess) {
    const { data: mine, error: mineErr } = await db
      .from("session_members")
      .select("id")
      .eq("session_id", sess.id)
      .eq("seat_id", seat)
      .maybeSingle();
    // A transient read failure must NOT masquerade as "that table is a stranger's" (a legit member
    // would get the misleading party-code 409) — fail loudly so the client's retry path runs.
    if (mineErr)
      return NextResponse.json(
        { error: "Could not check the table — try again." },
        { status: 500 },
      );
    if (!mine)
      return NextResponse.json(
        { error: "That table was just seated — join with the party’s code, or pick another." },
        { status: 409 },
      );
  }

  // Turned-over table: the same physical sticker code can be reused, but the prior session may be
  // EXPIRED yet still status='active' (there's no background sweeper) — squatting on the partial unique
  // index (table_sessions_active_qr_uniq WHERE status='active') so a fresh insert below would 23505.
  // Sweep it to 'closed' first (the sweep that index's comment anticipated), freeing the code to mint anew.
  // Trust note: only an ALREADY-expired session is swept (its legit diners are already locked out by
  // the expiry check), and whoever re-mints becomes host — the same "first scanner provisions" model
  // the sticker flow already trusts, not a new takeover vector against a live table.
  if (!sess && resolvedQr && !joinOnly) {
    await db
      .from("table_sessions")
      .update({ status: "closed" })
      .eq("qr_code", resolvedQr)
      .eq("status", "active")
      .lte("expires_at", new Date().toISOString());
  }

  // W6b hardening: a RESERVED-prefix code (`reg-`/`kiosk-`) is a server-issued identity the
  // register queue / floor board / kiosk reset all trust — a client may JOIN an existing one (the
  // code is unguessable; that is how the kiosk device attaches to its own minted session) but must
  // never CREATE one here. Without this, any visitor could mint fake counter-queue entries.
  if (!sess && resolvedQr && isReservedSessionCode(resolvedQr)) {
    return NextResponse.json({ error: "That code isn’t valid." }, { status: 404 });
  }

  // Create when no active session exists for the code (or when the host omitted one → mint a code).
  // Up to a few attempts: a *generated* code that collides regenerates; a *provided* code that
  // collides means a concurrent joiner won the insert, so we re-read and join theirs.
  for (let attempt = 0; attempt < 6 && !sess; attempt++) {
    const code = resolvedQr ?? generateJoinCode();
    const { data, error } = await db
      .from("table_sessions")
      // K2: stamp the registered table number (null for a host-mint code / unregistered sticker /
      // non-dine-in mode) so the greeting, guest list, floor, KDS + settle read it live.
      .insert({ qr_code: code, mode, host_seat: seat, table_number: sessionTable })
      .select(cols)
      .single();
    if (data) {
      sess = data;
      created = true;
      break;
    }
    if (error?.code === "23505") {
      // Unique violation on table_sessions_active_qr_uniq.
      // K2: a picker CLAIM that lost the insert race to a concurrent claimant must NOT converge onto
      // their session (that's a code-free join into a stranger's party) — refuse, same as above.
      // W5a: UNLESS the winner is THIS seat (two of the diner's own tabs racing an empty-table
      // claim — home resume card + picker chip): converge on our own session instead of the
      // misleading stranger 409. host_seat is deterministic (no membership-insert race to lose).
      if (tableNumber != null) {
        const winner = resolvedQr ? await findActive(resolvedQr) : null;
        if (winner && winner.host_seat === seat) {
          sess = winner;
          break;
        }
        return NextResponse.json(
          { error: "That table was just seated — join with the party’s code, or pick another." },
          { status: 409 },
        );
      }
      if (resolvedQr) {
        sess = await findActive(resolvedQr); // concurrent first-joiner won → converge on their session
        break;
      }
      continue; // our generated code collided with a live session → try a fresh one
    }
    return NextResponse.json({ error: "Could not create session" }, { status: 500 });
  }
  if (!sess) return NextResponse.json({ error: "Could not create session" }, { status: 500 });

  // Slide an existing (fresh) session's expiry forward on rejoin — reopening the tab or a second phone
  // joining keeps an in-use table alive well past the base 4h TTL (mirrors the per-touch renewal in
  // assertCartMember). Only on a JOIN: a brand-new session already has a full window.
  if (!created) {
    await db
      .from("table_sessions")
      .update({ expires_at: sessionExpiryFromNow() })
      .eq("id", sess.id)
      .eq("status", "active");
  }

  // W6a: a staff-started table (register "Start a table") mints with host_seat = NULL — no diner has
  // claimed it yet. The FIRST diner to scan the sticker claims host, atomically (first-writer-wins on
  // the null), mirroring the "first scanner provisions" trust the sticker flow already has. Without
  // this, a staff-started table has NO host forever: nobody can start a split or edit others' lines.
  if (sess.host_seat == null && !joinOnly) {
    const { data: claimed } = await db
      .from("table_sessions")
      .update({ host_seat: seat })
      .eq("id", sess.id)
      .is("host_seat", null)
      .select("host_seat")
      .maybeSingle();
    if (claimed) sess = { ...sess, host_seat: claimed.host_seat };
    else {
      // Lost the claim race — re-read so the role below reflects the real host.
      const winner = await findActive(sess.qr_code);
      if (winner) sess = winner;
    }
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
    // Party-size cap (P3.4): a sticker is one table — bound members so a shared code can't pile
    // unbounded diners onto one cart. Friendly pre-check on the common path; the mms_enforce_party_size
    // trigger is the ATOMIC backstop under a concurrent-join race (count-then-insert can't overshoot).
    // The host (member #1 of a just-created session) is always under the cap.
    const { count } = await db
      .from("session_members")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sess.id);
    if ((count ?? 0) >= MAX_PARTY_SIZE)
      return NextResponse.json(
        { error: `This table is full (up to ${MAX_PARTY_SIZE} guests).` },
        { status: 409 },
      );
    const { error: memErr } = await db
      .from("session_members")
      .insert({ session_id: sess.id, seat_id: seat, display_name: name, role });
    // 23505 = unique_violation: a concurrent join already inserted this membership → fine, the row
    // exists. A `party_full` raise = we lost the cap race to a concurrent joiner → the same friendly
    // 409, not a 500. Any other error means the diner is NOT actually a member, so fail loudly instead
    // of returning a cartId that every later assertCartMember would 403 on (silently broken session).
    if (memErr) {
      if (memErr.message?.includes("party_full"))
        return NextResponse.json(
          { error: `This table is full (up to ${MAX_PARTY_SIZE} guests).` },
          { status: 409 },
        );
      if (memErr.code !== "23505")
        return NextResponse.json({ error: "Could not join session" }, { status: 500 });
    }
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
    // K0 (Journey II): `door` = the diner-facing entrance (analytics-only, never authz) — keeps the
    // three-door IA funnel-able even where two doors share an internal mode. Unclaimed = null, NOT
    // a mode fallback: mode values ("scango") would pollute the door vocabulary until K1 wires
    // every entry point.
    properties: { session_id: sess.id, mode: sess.mode, role, door: body.door ?? null },
  });

  // `joinCode` = the session's qr_code → the code other phones scan/enter to join (dine-in group).
  return NextResponse.json({
    sessionId: sess.id,
    seat,
    role,
    cartId: cart.id,
    joinCode: sess.qr_code,
    // K2: the registered table (from the session row — a JOIN reads the existing session's number,
    // a fresh mint reads the just-stamped one). Null for host-mint / unregistered / solo modes.
    tableNumber: sess.table_number,
    // W5a: fresh-session signal for resume-intent honesty (see sessionMintOutput).
    created,
  });
}
