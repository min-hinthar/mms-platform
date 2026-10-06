import type { serviceClient } from "@mms/db/server";
import { UNAVAILABLE } from "./authz";
import type { BindTableResult } from "./bind-table";
import { isReservedSessionCode } from "./session-code";

/**
 * Phase 3c-ii (D21–D25) — the table NUMBER as an identity beside the sticker TOKEN, named ONCE.
 *
 * Before this module there were three occupancy predicates (the picker, the mint and the register
 * keyed on the sticker token; the kiosk and the floor strip on the number) and no uniqueness on the
 * number — a generated-code session bound to 7 read "Open" in the picker and was invisible to the
 * register (finding 1). Every number-keyed read now goes through `liveDineInAt`, every number-
 * stamping write sweeps the dead row off N first (`sweepExpiredOnTable` — the partial index
 * `table_sessions_active_table_uniq` is on `status`, so an expired-but-active row holds N until the
 * 15-minute cron), and the bind is ONE call — `mms_bind_session_table` (M263), the freeze read under
 * the binder's cart lock, the sticker rule (J41), an untouched staff shell's adopt (J40) and the
 * one-column CAS in one transaction — reached through `bindSessionTable` and read by `bindOutcome`.
 *
 * Server-only by construction (like `tables.ts`): the callers hand in the service client, and a
 * read error THROWS `UNAVAILABLE()` (W10a) — an unknowable table is an outage, never "free".
 */

type Db = ReturnType<typeof serviceClient>;

/** `route.ts`'s `cols` — the one shape a number-keyed read hands back. */
export const SEATED_COLS = "id,mode,host_seat,qr_code,table_number";

export type SeatedSession = {
  id: string;
  mode: string;
  host_seat: string | null;
  qr_code: string;
  table_number: number | null;
};

/** The live dine-in rows: `mode = 'dinein' · status = 'active' · expires_at > now()`. The expiry
 *  conjunct matches `assertCartMember` and the `is_member` RLS fn (both reject `expires_at <=
 *  now()`), so a seat this predicate reports is one a cart write would accept. `status = 'locked'`
 *  (no writer — owner question 5) stays outside it, as it is outside every occupancy read today. */
export function liveDineIn(db: Db, nowIso: string) {
  return db
    .from("table_sessions")
    .select(SEATED_COLS)
    .eq("mode", "dinein")
    .eq("status", "active")
    .gt("expires_at", nowIso);
}

/** The ONE predicate for "a party is seated at table N" — the live dine-in rows, keyed on the NUMBER. */
export function liveDineInAt(db: Db, n: number, nowIso: string) {
  return liveDineIn(db, nowIso).eq("table_number", n);
}

/**
 * The session seated at table N, or null when the table is empty. Read by the mint (the claim and
 * the sticker paths, and every 23505 re-read), the register's Start, the kiosk's pre-read and the
 * bind's pre-read and collision re-read — so a late-bound generated-code session is found by every
 * one of them. `limit(1)` is the kiosk's own idiom: under the index at most one row matches; before
 * it is applied (deploy-before-apply) two anomalous rows must not turn into a `maybeSingle` error.
 *
 * THE TOKEN IS THE SECOND READ, FOR ONE SHAPE ONLY (the blind pass on 3c-ii, money lens): a live
 * dine-in row on N's registered sticker TOKEN whose `table_number` is still null. The mint stamps
 * null when its own registry read fails, and a sticker registered mid-session leaves one behind —
 * and once every find went number-first that party was reachable by nobody: the host's reload
 * 500'd on its own token, an invite 404'd, the register read an outage. So a caller that knows the
 * table's `stickerCode` hands it in, and when the number finds nobody the token is read with
 * `table_number IS NULL` — never a bound row (a sticker row is bound to its own number or to none),
 * never before the number (the number is the identity). A generated code has no sticker: no
 * fallback.
 */
export async function seatedSessionFor(
  db: Db,
  n: number,
  stickerCode?: string | null,
): Promise<SeatedSession | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await liveDineInAt(db, n, nowIso).limit(1).maybeSingle();
  if (error) throw UNAVAILABLE(); // W10a — unknowable ≠ free
  if (data) return data;
  if (!stickerCode) return null;
  const stranded = await liveDineIn(db, nowIso)
    .eq("qr_code", stickerCode)
    .is("table_number", null)
    .limit(1)
    .maybeSingle();
  if (stranded.error) throw UNAVAILABLE();
  return stranded.data ?? null;
}

/** The picker's occupancy read: the NUMBERS with a live dine-in party, and the CODES of the live
 *  numberless rows — a numberless row on a registered sticker (the stranded shape) is the party
 *  `seatedSessionFor`'s token read finds, so the picker maps it to its table (Codex r2 on #314). */
export type SeatedSet = { numbers: ReadonlySet<number>; strandedCodes: ReadonlySet<string> };

/**
 * The live dine-in parties, for the picker's occupancy — or null when the read failed, which the
 * caller renders as NO list (`occupancyFor`), never as every table Open (finding 6).
 */
export async function seatedTableNumbers(db: Db): Promise<SeatedSet | null> {
  const { data, error } = await liveDineIn(db, new Date().toISOString());
  if (error) return null;
  const numbers = new Set<number>();
  const strandedCodes = new Set<string>();
  for (const s of data ?? []) {
    if (s.table_number != null) numbers.add(s.table_number);
    else strandedCodes.add(s.qr_code);
  }
  return { numbers, strandedCodes };
}

/** PURE: the registry (number + sticker code) against the seated set — a table is occupied when a
 *  party holds its NUMBER, or a numberless party holds its STICKER. A null set is a failed read →
 *  `[]`. The code never leaves this function's input: the output carries numbers and occupancy. */
export function occupancyFor(
  tables: readonly { tableNumber: number; qrCode: string }[],
  seated: SeatedSet | null,
): { tableNumber: number; occupied: boolean }[] {
  if (seated === null) return [];
  return tables.map((t) => ({
    tableNumber: t.tableNumber,
    occupied: seated.numbers.has(t.tableNumber) || seated.strandedCodes.has(t.qrCode),
  }));
}

/**
 * Close the EXPIRED-but-still-active dine-in row on N before a number-stamping write (the cron
 * sweeper's own act, `mms_sweep_expired_sessions`, done early for one number). Only a dead row —
 * its diners are already locked out by the expiry check — never a live one. Best-effort like the
 * token sweeps beside it: a failed sweep leaves the write to 23505 against the dead row, which the
 * caller re-reads by number and reports honestly, and the cron clears within 15 minutes.
 */
export async function sweepExpiredOnTable(db: Db, n: number): Promise<void> {
  const { error } = await db
    .from("table_sessions")
    .update({ status: "closed" })
    .eq("table_number", n)
    .eq("mode", "dinein")
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString());
  if (error)
    console.error("[seated] expired-row sweep failed", { tableNumber: n, message: error.message });
}

/** The RPC's answers (M263 · J41 · J40). `sticker` carries the sticker's OWN table. */
export type BindOutcome =
  | { kind: "bound" | "adopted" | "unmoved" | "locked" | "settling" | "gone" | "held" }
  | { kind: "sticker"; stickerTable: number };

const PLAIN_OUTCOMES = [
  "bound",
  "adopted",
  "unmoved",
  "locked",
  "settling",
  "gone",
  "held",
] as const;

/**
 * PURE (M263) — the RPC's one row, guarded. `database.types` reads a RETURNS TABLE's columns as
 * non-null, but `at_table` is null on every answer except bound / adopted / sticker, and a deploy
 * skew can hand back a word this build does not know. Anything unrecognised is null, which every
 * caller reads as `error` — never as a landing.
 */
export function bindOutcome(rows: unknown): BindOutcome | null {
  const row: unknown = Array.isArray(rows) ? rows[0] : null;
  if (!row || typeof row !== "object") return null;
  const { outcome, at_table } = row as { outcome?: unknown; at_table?: unknown };
  const plain = PLAIN_OUTCOMES.find((k) => k === outcome);
  if (plain) return { kind: plain };
  if (outcome === "sticker" && typeof at_table === "number")
    return { kind: "sticker", stickerTable: at_table };
  return null;
}

/**
 * The bind (D21 · M263): ONE call, `mms_bind_session_table` — `table_number` only (`qr_code` is
 * never rewritten: every phone's persisted key, the stripped URL and the invite link name that code,
 * finding 4), under `table_number IS NULL · active · dine-in · live`, decided in the SAME transaction
 * as the freeze read under the binder's open cart lock (a read in one statement and a write in
 * another let a pay lock land between them — Codex r3 on #314). `shellId` asks the RPC to adopt an
 * untouched staff-started row at N (J40); null never closes anything. The error rides back untouched
 * so the caller reads 23505 (the number is seated) and 23503 (the registry FK) by CODE, never by
 * constraint name; an unreadable answer is a null outcome.
 */
export async function bindSessionTable(
  db: Db,
  sessionId: string,
  n: number,
  shellId: string | null = null,
): Promise<{ outcome: BindOutcome | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await db.rpc("mms_bind_session_table", {
    p_session: sessionId,
    p_table: n,
    p_shell: shellId ?? undefined,
  });
  if (error) return { outcome: null, error };
  return { outcome: bindOutcome(data), error: null };
}

/** What the bind does about the session the pre-read found at N (J40). */
export type HolderVerdict =
  | { kind: "free" }
  | { kind: "own" }
  | { kind: "refuse"; result: Extract<BindTableResult, { ok: false }> }
  | { kind: "shell"; shellId: string };

/**
 * PURE (J40) — the holder at N decides. Nobody, or this session's own NUMBERLESS row on N's sticker
 * (the stranded shape `seatedSessionFor`'s token read finds) → the CAS (`free`); this session already
 * AT n (two tabs) → ok/already (`own`); a `kiosk-` order → `kiosk` (no phone joins one —
 * `/api/session` refuses the join); a row with a host → `seated` (the join form); a HOSTLESS row —
 * a table a server started (register.ts: `host_seat` null) — has no code a diner holds, and a `?j=`
 * joiner of it becomes a guest who cannot send, so it is handed to the RPC (`shell`), which adopts
 * it only if nothing and nobody is on it.
 */
export function holderVerdict(
  holder: SeatedSession | null,
  sessionId: string,
  n: number,
): HolderVerdict {
  if (!holder) return { kind: "free" };
  if (holder.id === sessionId)
    return holder.table_number === n ? { kind: "own" } : { kind: "free" };
  if (isReservedSessionCode(holder.qr_code))
    return { kind: "refuse", result: { ok: false, reason: "kiosk", tableNumber: n } };
  if (holder.host_seat != null) return { kind: "refuse", result: { ok: false, reason: "seated" } };
  return { kind: "shell", shellId: holder.id };
}

/**
 * PURE (J40 · red-team #5) — the answer after a FRESH read of who is at N, when the write could not
 * say it: a 23505 (the number was taken between the pre-read and the write), or the RPC's `gone` /
 * `held`. This session's own row at n → ok/already (another tab landed it, or adopted the shell); a
 * kiosk order or a party → that refusal, by name; a hostless shell → `held` only when the RPC said
 * so under its locks (`held`), else `error`; nobody → `error`. `error` is the retryable sentence: the
 * next tap re-decides, and nothing on another session was written.
 */
export function rereadVerdict(
  taken: SeatedSession | null,
  sessionId: string,
  n: number,
  held = false,
): BindTableResult {
  const v = holderVerdict(taken, sessionId, n);
  if (v.kind === "own") return { ok: true, tableNumber: n, already: true };
  if (v.kind === "refuse") return v.result;
  if (v.kind === "shell" && held) return { ok: false, reason: "held", tableNumber: n };
  return { ok: false, reason: "error" };
}

/**
 * PURE (D25, J33's unbound half): a `?table=N` claim from a phone whose persisted code names a live
 * UNBOUND dine-in session THIS seat hosts BINDS that session instead of minting a second one over
 * its drafts. Anything else — the table already seated, a guest's session, a bound one, a pickup
 * one, no prior session — mints as today.
 */
export function claimDisposition(i: {
  seated: boolean;
  mine: SeatedSession | null;
  seat: string;
}): "bind" | "mint" {
  if (i.seated) return "mint";
  const m = i.mine;
  if (m && m.mode === "dinein" && m.table_number == null && m.host_seat === i.seat) return "bind";
  return "mint";
}

/** The own row, re-read after a zero-row CAS. */
export type OwnSessionRow = { status: string; expires_at: string; table_number: number | null };

/**
 * PURE (D24): the verdict after the CAS. A landed row is ok. Zero rows is answered by RE-READING the
 * own row: closed, expired or gone → `session_expired`; already at n → ok/`already` (two tabs of one
 * phone); at another number → `already_bound(m)` (this order goes THERE); a live unbound row the CAS
 * still refused is unexplained → `error`, never a claimed landing.
 */
export function bindVerdict(i: {
  count: number;
  reread: OwnSessionRow | null;
  n: number;
  nowMs: number;
}): BindTableResult {
  if (i.count > 0) return { ok: true, tableNumber: i.n, already: false };
  const r = i.reread;
  if (!r || r.status !== "active" || Date.parse(r.expires_at) <= i.nowMs)
    return { ok: false, reason: "session_expired" };
  if (r.table_number === i.n) return { ok: true, tableNumber: i.n, already: true };
  if (r.table_number != null)
    return { ok: false, reason: "already_bound", tableNumber: r.table_number };
  return { ok: false, reason: "error" };
}
