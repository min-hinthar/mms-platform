import { NextRequest, NextResponse } from "next/server";
import { serviceClient, sessionClient } from "@mms/db/server";
import { sessionMintInput } from "@mms/db/schemas";
import {
  generateJoinCode,
  isReservedSessionCode,
  reservedCodeRefusal,
  sweepsExpiredSquatter,
} from "@/lib/session-code";
import { sessionExpiryFromNow } from "@/lib/session-ttl";
import { withinJoinRate } from "@/lib/rate";
import { AuthzError, isTransportFailure, UNAVAILABLE } from "@/lib/authz";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "@/lib/lock-ttl";
import { MAX_PARTY_SIZE } from "@/lib/limits";
import { getPostHogClient } from "@/lib/posthog-server";
import { BIND_COPY } from "@/lib/bind-copy";
import {
  bindSessionTable,
  claimDisposition,
  seatedSessionFor,
  sweepExpiredOnTable,
} from "@/lib/seated";

type Sess = {
  id: string;
  mode: string;
  host_seat: string | null;
  qr_code: string;
  table_number: number | null;
};

/** W10a — the auth/DB plane is unreachable: 503 "we're down", never a verdict about the diner. */
const unavailable = () =>
  NextResponse.json(
    { error: "We’re having trouble on our end — try again in a moment", kind: "unavailable" },
    { status: 503, headers: { "Retry-After": "20" } },
  );

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
 *
 * TWO IDENTITIES (Phase 3c-ii, D21–D25). The sticker TOKEN (`qr_code`) is the join identity for a
 * session's whole life; the table NUMBER is the seat, and it is now UNIQUE among live dine-in
 * sessions (`table_sessions_active_table_uniq`). A session can be seated late — a generated join
 * code bound to 7 at the first Send (`bindTable`) — and the sticker token never names that row, so
 * every number-keyed read here goes through the ONE predicate (`seatedSessionFor`, lib/seated.ts):
 * a sticker scan or a `?table=N` claim finds the party at N whatever code it holds, every 23505 is
 * re-read by NUMBER (never by constraint name), and a claim from a phone whose persisted code names
 * a live UNBOUND session it hosts BINDS that session instead of orphaning its drafts (J33).
 */
export async function POST(req: NextRequest) {
  let body;
  try {
    body = sessionMintInput.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const { qrCode, mode, name, joinOnly, tableNumber, persisted } = body;

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
  if (authErr && isTransportFailure(authErr)) return unavailable();
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
  //  • Dine-in CLAIM path (a `tableNumber` — Phase 3c-ii D25: with or without a code): look up the
  //    table's registered sticker qr_code server-side — the token never travels to the client. The
  //    picker is advisory, so the mint re-checks the table is registered + active (a stale/forged
  //    number 400s here). A code sent BESIDE the number is only ever `priorCode` — this phone's
  //    persisted session, verified below by `host_seat === seat` — never the key the number resolves.
  //  • Sticker/invite path (a `qrCode`): resolve the table number FROM the token so the session is
  //    stamped even when a physical sticker is scanned — null for a host-mint code / legacy sticker.
  // `resolvedQr` then drives the create exactly as `qrCode` did; `sessionTable` stamps the insert
  // and, when known, is what the session is FOUND by.
  const claim = mode === "dinein" && tableNumber != null;
  const priorCode = claim ? qrCode : undefined;
  let resolvedQr = claim ? undefined : qrCode;
  let sessionTable: number | null = null;
  // A FAILED registry read is an outage (W10a — unknowable ≠ "no row"), on BOTH arms (Codex round 4
  // on #314, P1): discarded, the sticker arm read a registered sticker as a legacy code, went
  // token-only — which cannot see a late-bound generated-code party at that table — and minted a
  // SECOND, numberless session on the sticker: the stranded shape `seatedSessionFor`'s token read
  // exists for, at its origin (LEARNINGS #234); and the claim arm answered "pick another", a verdict,
  // for a read that did not happen. The register and the kiosk already fail closed on this read.
  if (mode === "dinein") {
    if (claim) {
      const { data: tbl, error: regErr } = await db
        .from("qr_tables")
        .select("qr_code")
        .eq("table_number", tableNumber)
        .eq("active", true)
        .maybeSingle();
      if (regErr) return unavailable();
      if (!tbl) return NextResponse.json({ error: BIND_COPY.unavailable }, { status: 400 });
      resolvedQr = tbl.qr_code;
      sessionTable = tableNumber;
    } else if (resolvedQr) {
      const { data: tbl, error: regErr } = await db
        .from("qr_tables")
        .select("table_number")
        .eq("qr_code", resolvedQr)
        .eq("active", true)
        .maybeSingle();
      if (regErr) return unavailable();
      sessionTable = tbl?.table_number ?? null;
    }
  }
  // Find an active AND non-expired session for the code. The expiry filter MUST match assertCartMember
  // + the is_member RLS fn (both reject `expires_at <= now()`): without it the mint would hand back a
  // still-'active' but expired session that every later cart write then 403s on (the strand bug).
  // A failed read THROWS `UNAVAILABLE()` (W10a — unknowable ≠ "no session"): discarded, it read as
  // "this phone has no prior session" and the claim arm minted a SECOND session over the drafts the
  // bind exists to keep (Codex r1 on #314, P1). Every caller answers it as the 503 or stands down.
  const findActive = async (code: string): Promise<Sess | null> => {
    const { data, error } = await db
      .from("table_sessions")
      .select(cols)
      .eq("qr_code", code)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw UNAVAILABLE();
    return data ?? null;
  };

  // D25 — a registered table is found BY NUMBER (the one predicate, handed the sticker token so a
  // NUMBERLESS live row on that sticker is a party too — the blind pass on 3c-ii: the mint itself
  // stamps null when its registry read fails, and that party was then reachable by nobody), a
  // numberless code by token. A failed read is an outage, never "no session here" followed by a
  // second mint over a table we could not see.
  let sess: Sess | null;
  try {
    sess =
      sessionTable != null
        ? await seatedSessionFor(db, sessionTable, resolvedQr)
        : resolvedQr
          ? await findActive(resolvedQr)
          : null;
  } catch (e) {
    if (e instanceof AuthzError && e.code === "unavailable") return unavailable();
    throw e;
  }
  let created = false;

  // J15 (the blind pass on 3c-ii) — a code this PHONE persisted, never one from a URL, re-joins only
  // a session this seat is already a member of. A registered sticker token outlives its party (the
  // next party at that table holds it within hours), and the code-free Dine-in door resolves the
  // persisted key with neither `joinOnly` nor `tableNumber` — so without this a returning diner
  // joined the next party's cart from the couch, or minted a session AT that table for the real
  // party to converge onto as guests. Not a member (or nobody there) → a bare host-start: a fresh
  // generated code, no number. Decided before the reserved check, the sweep, the bind and the mint,
  // so a dropped code touches nothing. A claim (`tableNumber`) carries its prior code as
  // `priorCode` and never reaches here; a `?j=` is a URL code.
  if (persisted && !claim && !joinOnly) {
    let member = false;
    if (sess) {
      const { data: row, error: memberErr } = await db
        .from("session_members")
        .select("id")
        .eq("session_id", sess.id)
        .eq("seat_id", seat)
        .maybeSingle();
      if (memberErr)
        return NextResponse.json(
          { error: "Could not check the table — try again." },
          { status: 500 },
        );
      member = row !== null;
    }
    if (!member) {
      sess = null;
      resolvedQr = undefined;
      sessionTable = null;
    }
  }

  // Invite-code join (`?j=`) that matched nothing → don't mint a phantom table; tell the guest the
  // code is wrong. (A scanned sticker `?t=` or a host-start leaves joinOnly false → may provision.)
  if (joinOnly && !sess)
    return NextResponse.json({ error: "No table found for that code" }, { status: 404 });

  // W6b hardening: a RESERVED-prefix code (`reg-`/`kiosk-`) is a server-issued identity the
  // register queue / floor board / kiosk reset all trust — a client must never CREATE one here
  // (without this, any visitor could mint fake counter-queue entries). Phase 2f (Codex r3 on #308):
  // nor JOIN an active reserved session — a member of a `reg-` counter order could add a to-go draft
  // after staff reviewed it (the counter Send fires every draft unpaid), a member of a `kiosk-`
  // dine-in could add drafts its host fires unpaid, and no real client joins either. Decided BEFORE
  // the member check, the expiry slide, the host claim and the membership insert below, so a refused
  // join touches nothing. One predicate: `reservedCodeRefusal` (lib/session-code.ts) — keyed on the
  // code the CLIENT sent, so a session FOUND BY NUMBER (D25: a kiosk dine-in claim carries a number,
  // lib/kiosk.ts) is checked on its own `qr_code` too. The copy names neither kind: it must be true
  // for a counter order AND a kiosk order.
  const reserved = reservedCodeRefusal({ found: sess !== null, code: resolvedQr });
  if (reserved === "create")
    return NextResponse.json({ error: "That code isn’t valid." }, { status: 404 });
  if (reserved === "join" || (sess !== null && isReservedSessionCode(sess.qr_code)))
    return NextResponse.json(
      { error: "That order can’t be joined from a phone — please ask staff." },
      { status: 403 },
    );

  // K2 — the picker's CLAIM path (`tableNumber`) expects an EMPTY table. If one is already active
  // (someone claimed/sat this table between the picker's occupancy read and now), do NOT silently
  // drop this diner into a stranger's live cart — the seated-table rule requires the party's code or
  // a physical sticker scan (`?t=`, which uses the qrCode path, not this one). Refuse with guidance.
  //
  // W5a — UNLESS the "stranger" is the party itself: a swipe-back diner re-tapping their OWN table
  // in the picker was 409'd here (the re-entry dead end). If this seat is already a member of the
  // active session, converge on it — a rejoin, not a takeover; the stranger refusal below is intact.
  // D25: the session is found by NUMBER now, so the home card's `?resume=1&table=N` converges on a
  // late-bound table instead of 409ing its own host.
  if (claim && sess) {
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
    if (!mine) return NextResponse.json({ error: BIND_COPY.seated }, { status: 409 });
  }

  // Turned-over table: the same physical sticker code can be reused, but the prior session may be
  // EXPIRED yet still status='active' — the pg_cron sweeper (`mms_sweep_expired_sessions`, every
  // 15 minutes) has not reached it yet, and it squats on the partial unique index
  // (table_sessions_active_qr_uniq WHERE status='active') so a fresh insert below would 23505.
  // Sweep it to 'closed' first (the sweep that index's comment anticipated), freeing the code to mint anew.
  // Trust note: only an ALREADY-expired session is swept (its legit diners are already locked out by
  // the expiry check), and whoever re-mints becomes host — the same "first scanner provisions" model
  // the sticker flow already trusts, not a new takeover vector against a live table.
  // Phase 2f (D10) — never on a reserved code: a forged `?t=reg-…` must not close a counter order.
  // (`resolvedQr &&` only narrows the type for the update below — the predicate already requires it.)
  if (resolvedQr && sweepsExpiredSquatter({ found: sess !== null, code: resolvedQr, joinOnly })) {
    await db
      .from("table_sessions")
      .update({ status: "closed" })
      .eq("qr_code", resolvedQr)
      .eq("status", "active")
      .lte("expires_at", new Date().toISOString());
  }
  // D22 — and the same sweep BY NUMBER before any write that stamps one: the number index is
  // partial on status too, so a dead row holds N until the cron. Dead rows only; this stays for
  // numberless token rows above, that one for every number-stamping write below.
  if (!sess && sessionTable != null) await sweepExpiredOnTable(db, sessionTable);

  // D25 — J33's unbound half. A claim from a phone whose persisted code names a live UNBOUND dine-in
  // session THIS seat hosts binds that session to the table (one column, `bindSessionTable`) and
  // rejoins it — its drafts come along, where a second mint would have orphaned them. Decided by the
  // pure `claimDisposition`: a guest's session, a bound one, a pickup one, a reserved code or no
  // prior session at all mints as today. The CAS can refuse: 23505 → the number was taken between
  // the read and the write (the shipped 409); 0 rows → the session died under us → mint.
  // D30 — true once the bind below landed: the session's open cart is touched after it is resolved,
  // so every tablemate's `qr_carts` watch re-reads the view (the blind pass on 3c-ii: without the
  // touch a peer's Checkout kept asking for a table already bound).
  let boundNow = false;
  if (!sess && claim && sessionTable != null) {
    let mine: Sess | null;
    try {
      mine = priorCode && !isReservedSessionCode(priorCode) ? await findActive(priorCode) : null;
    } catch (e) {
      if (e instanceof AuthzError && e.code === "unavailable") return unavailable();
      throw e;
    }
    if (claimDisposition({ seated: false, mine, seat }) === "bind" && mine) {
      // THE LOCK MODEL, here too (Codex r1 on #314, P1 — the same invariant `bindTable` keeps): no
      // cart-adjacent write while a peer's charge or a settlement is live, because the fulfill RPCs
      // snapshot the number and the payer's receipt must not change under them. Read the session's
      // open cart with authz's own freshness (`CART_LOCK_TTL_MS` · `SETTLE_TTL_MS`; a null stamp is
      // not fresh, W17's rule): FRESH → the phone REJOINS its session unbound, no bind, no mint — the
      // next Send asks the table where `bindTable` answers `locked`/`settling` by name. An
      // unknowable freeze is an outage, never "free".
      const { data: cart, error: cartErr } = await db
        .from("qr_carts")
        .select("locked,locked_at,settle_at")
        .eq("session_id", mine.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cartErr) return unavailable();
      const now = Date.now();
      const lockedFresh =
        !!cart?.locked &&
        cart.locked_at != null &&
        new Date(cart.locked_at).getTime() > now - CART_LOCK_TTL_MS;
      const settlingFresh =
        cart?.settle_at != null && new Date(cart.settle_at).getTime() > now - SETTLE_TTL_MS;
      if (lockedFresh || settlingFresh) {
        sess = mine; // a JOIN, unbound: the expiry slides below, the number is asked at Send
      } else {
        const { count, error } = await bindSessionTable(db, mine.id, sessionTable);
        if (error?.code === "23505")
          return NextResponse.json({ error: BIND_COPY.seated }, { status: 409 });
        if (error)
          return NextResponse.json(
            { error: "Could not check the table — try again." },
            { status: 500 },
          );
        if ((count ?? 0) > 0) {
          sess = { ...mine, table_number: sessionTable }; // a JOIN: the expiry slides below
          boundNow = true;
        } else {
          // Zero rows (the blind pass, concurrency lens): the row moved under the write — BOUND by
          // another tab meanwhile (J33's bound half: this phone is at the number IT landed), or
          // died. Re-read it: a live row is this phone's own party, rejoined at whatever number it
          // holds — never a second session minted over its drafts. Dead → the mint below.
          let live: Sess | null;
          try {
            live = await findActive(mine.qr_code);
          } catch (e) {
            if (e instanceof AuthzError && e.code === "unavailable") return unavailable();
            throw e;
          }
          if (live) sess = live;
        }
      }
    }
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
      // Unique violation — on table_sessions_active_qr_uniq (the code) or, for a numbered insert,
      // table_sessions_active_table_uniq (the NUMBER, D22). Either way the live row at N is the one
      // to converge on, and it is read BY NUMBER, never by the constraint name.
      // K2: a picker CLAIM that lost the insert race to a concurrent claimant must NOT converge onto
      // their session (that's a code-free join into a stranger's party) — refuse, same as above.
      // W5a: UNLESS the winner is THIS seat (two of the diner's own tabs racing an empty-table
      // claim — home resume card + picker chip): converge on our own session instead of the
      // misleading stranger 409. host_seat is deterministic (no membership-insert race to lose).
      try {
        if (claim && sessionTable != null) {
          const winner = await seatedSessionFor(db, sessionTable, resolvedQr);
          if (winner && winner.host_seat === seat) {
            sess = winner;
            break;
          }
          // No winner to read (a dead row the sweep failed to close still holds an index) is
          // "try again", as `bindTable` answers it — never a seated verdict by constraint name.
          if (!winner)
            return NextResponse.json(
              { error: "Could not check the table — try again." },
              { status: 500 },
            );
          return NextResponse.json({ error: BIND_COPY.seated }, { status: 409 });
        }
        if (sessionTable != null) {
          sess = await seatedSessionFor(db, sessionTable, resolvedQr); // the party at N won → join them
          break;
        }
      } catch (e) {
        if (e instanceof AuthzError && e.code === "unavailable") return unavailable();
        throw e;
      }
      if (resolvedQr) {
        try {
          sess = await findActive(resolvedQr); // concurrent first-joiner won → converge on their session
        } catch (e) {
          if (e instanceof AuthzError && e.code === "unavailable") return unavailable();
          throw e;
        }
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
      // Lost the claim race — re-read so the role below reflects the real host. A failed re-read
      // keeps the row we hold (the role may read guest for one response; the next join corrects it).
      const winner = await findActive(sess.qr_code).catch(() => null);
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
  if (boundNow) {
    // D30 — the peers' resync after the claim-arm bind (`bindTable` does the same through
    // `touchCart`). Best-effort: a failed touch leaves the peers to their next re-read.
    const { error: touchErr } = await db
      .from("qr_carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cart.id);
    if (touchErr) console.error("[session] bind resync touch failed", touchErr.message);
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: seat, // opaque uid — no PII in event props (QA §C P2)
    event: created ? "session_created" : "session_joined",
    // K0 (Journey II): `door` = the diner-facing entrance (analytics-only, never authz) — keeps the
    // three-door IA funnel-able even where two doors share an internal mode. Unclaimed = null, NOT
    // a mode fallback: mode values ("scango") would pollute the door vocabulary until K1 wires
    // every entry point.
    // P5 — `cart_id` is the JOIN KEY, and it is the only way `door` can reach the money path.
    // The door is a client-declared entrance (analytics-only, K0) and is persisted NOWHERE: no
    // column on `table_sessions` or `qr_carts` holds it, so no server-side event downstream of this
    // one can carry it, and inventing a door on an order event would be a fabricated dimension.
    // What IS stable from here to the charge is the cart: `payment_intent_created`,
    // `payment_succeeded` and `payment_failed` are all keyed on `cart_id` (as their distinctId AND
    // as a property), so emitting it here lets "which door did the pilot's paying tables come in
    // by?" be answered by joining on it — rather than by guessing.
    properties: {
      session_id: sess.id,
      mode: sess.mode,
      role,
      door: body.door ?? null,
      cart_id: cart.id,
    },
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
