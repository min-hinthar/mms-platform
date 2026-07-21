import { NextRequest, NextResponse } from "next/server";
import { serviceClient, sessionClient } from "@mms/db/server";
import { withinPeekRate } from "@/lib/rate";

/**
 * W5a — passive "do I have a live session?" peek. Powers the home resume card and the dine-in
 * picker's "your table" state, closing the swipe-back dead end: before this, an active table/basket
 * was invisible outside the menu (the home surfaces were order-based only), so a returning diner
 * had no affordance back in.
 *
 * READ-ONLY by design — unlike POST /api/session this never mints, never writes membership, and
 * never slides the TTL: peeking at the home screen must not keep an abandoned table alive. Authz
 * mirrors the mint: verify the Bearer anon token (network round-trip), then look up ACTIVE,
 * non-expired sessions this seat is a member of (the same predicate as the mint/is_member —
 * status='active' AND expires_at>now(), so a session the peek shows is one the mint will rejoin).
 *
 * Minimal disclosure: mode + table number + open-cart id/line-count only. No join codes (a member
 * already holds theirs; resume rejoins via localStorage or the member-aware claim), no member
 * lists, no expiry timestamps.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const {
    data: { user },
    error: authErr,
  } = await sessionClient(token).auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const seat = user.id;

  // P3.4 — bound the read amplification a scripted token can drive (auth verify + 3 queries per
  // call). Exhaustion degrades to an empty peek, not an error: the resume card simply doesn't
  // render, which the advisory contract already tolerates. Fail-open on limiter glitches (lib/rate).
  if (!(await withinPeekRate(seat))) return NextResponse.json({ sessions: [] });

  const db = serviceClient();

  // Sessions this seat belongs to that are still live. Old visits leave session_members rows
  // behind, but their sessions are closed/expired — the !inner join + predicates filter to the
  // handful (usually 0–2) that are actually resumable. Bounded for safety regardless.
  const { data: memberships, error } = await db
    .from("session_members")
    .select("session_id, table_sessions!inner(id, mode, table_number, expires_at, status)")
    .eq("seat_id", seat)
    .eq("table_sessions.status", "active")
    .gt("table_sessions.expires_at", new Date().toISOString())
    .limit(8);
  // A failed peek is an empty peek — this is an advisory read behind a decorative card; the home
  // page must never error because of it. (Deliberate swallow; the mint path still surfaces errors.)
  if (error || !memberships) return NextResponse.json({ sessions: [] });

  type SessRow = { id: string; mode: string; table_number: number | null; expires_at: string };
  const sessions = memberships
    // PostgREST types a many-to-one embed as an object, but hedge the array shape too (relationship
    // detection has shifted across supabase-js majors) — either way, exactly one session per row.
    .map((m) => {
      const raw = m.table_sessions as unknown;
      return (Array.isArray(raw) ? raw[0] : raw) as SessRow | null | undefined;
    })
    .filter((s): s is SessRow => !!s && typeof s.id === "string")
    // Dine-in first (a claimed table is the headline resume), then most-recently-alive.
    .sort((a, b) =>
      a.mode === b.mode
        ? b.expires_at.localeCompare(a.expires_at)
        : a.mode === "dinein"
          ? -1
          : b.mode === "dinein"
            ? 1
            : b.expires_at.localeCompare(a.expires_at),
    )
    .slice(0, 4);

  if (sessions.length === 0) return NextResponse.json({ sessions: [] });

  // Open carts + line counts for those sessions, in two bounded reads (display-only — the counts
  // never touch money; /cart re-reads the server-priced truth on arrival).
  const { data: carts } = await db
    .from("qr_carts")
    .select("id, session_id")
    .in(
      "session_id",
      sessions.map((s) => s.id),
    )
    .eq("status", "open");
  const cartBySession = new Map((carts ?? []).map((c) => [c.session_id, c.id]));
  const cartIds = (carts ?? []).map((c) => c.id);
  const countByCart = new Map<string, number>();
  if (cartIds.length > 0) {
    // Qty-weighted (plates, not lines) — the repo-wide count convention (TableTimeline/OrderHistory):
    // one qty-3 line reads "3 items" here exactly as it does on every other surface.
    const { data: items } = await db
      .from("qr_cart_items")
      .select("cart_id, qty")
      .in("cart_id", cartIds);
    for (const it of items ?? [])
      countByCart.set(it.cart_id, (countByCart.get(it.cart_id) ?? 0) + (it.qty ?? 0));
  }

  return NextResponse.json({
    sessions: sessions.map((s) => {
      const cartId = cartBySession.get(s.id) ?? null;
      return {
        mode: s.mode,
        tableNumber: s.table_number,
        cartId,
        itemCount: cartId ? (countByCart.get(cartId) ?? 0) : 0,
      };
    }),
  });
}
