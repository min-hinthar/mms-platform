import { STAFF, ts, type StaffKey } from "./i18n/staff";
import { tf } from "./i18n/fill";
import type { StaffLang } from "./staff-lang";
import { STAFF_HANG_MS, track } from "./bounded-write";

/**
 * W10b — the staff outage vocabulary. Plain module (no "server-only"): the boards are clients, and
 * lib/authz.ts (the server twin of `isRetryableAuthShape`) can't be imported here.
 *
 * The stance: a staff board is a LEDGER, not a website. Mid-service its most valuable asset is the
 * last-known state — so an outage must never blank it, redirect it, or fake liveness over it. These
 * helpers give every board ONE voice for the frozen state: name the freeze moment (the snapshot's
 * own server clock — the ledger's "as of"), keep retrying quietly, and past the escalation window
 * stop pretending it's momentary — tell the floor to run on paper and promise the state is safe.
 */

/** How long a board stays in the soft "reconnecting" voice before escalating to the paper-flow
 *  instruction. Two minutes ≈ two orders at the counter: past that, waiting is the wrong advice. */
export const STAFF_OUTAGE_ESCALATE_MS = 120_000;

/**
 * The ONE line of write-failure copy for staff mutations during an outage — defined here (plain
 * module) so the server gate (lib/staff.ts staffGate, which re-exports it) and the client reason-
 * switches (LossActionSheet, RefundActionSheet, PinUnlock) render the SAME sentence. Operational
 * truth for a floor mid-service: name what happened (not saved), name the fallback (paper). Never
 * "sign in again" — the person IS signed in; the platform is unreachable.
 */
export const STAFF_WRITE_OUTAGE =
  "We can’t reach the ordering system — that change wasn’t saved. Keep it on paper for now.";

/**
 * P2 — the same sentence in Burmese. A CONSTANT twin rather than a `ts(lang, …)` call, because
 * `STAFF_WRITE_OUTAGE` is re-exported by `lib/staff.ts` and returned as a plain string from 27
 * `error: STAFF_WRITE_OUTAGE` arms; threading a language through that contract is an auth-path edit
 * P2 does not take (the server population is OPEN-ITEMS P2i).
 *
 * ⚠️ MEASURE IT LIKE THIS, and the reason is this docblock:
 *
 *     grep -rnE 'error: STAFF_WRITE_OUTAGE[ ]*[},]' apps/qr/lib | wc -l    → 27
 *
 * The obvious command — `grep -rn 'error: STAFF_WRITE_OUTAGE\b' apps/qr/lib | wc -l` — OVER-COUNTS,
 * because writing it here put the pattern inside the corpus it measures. Anchoring to a value
 * position (the arm ends in `}` or `,`) is more robust than excluding this file, since it survives
 * the docblock moving.
 *
 * ⚠️ AND THE OVER-COUNT IS NOT A FIXED NUMBER — do not quote one. This paragraph said "returns 28",
 * which was true when written and was **30** by the time a pre-merge blind pass re-measured it: the
 * correction itself added two more mentions of the pattern. A foil that drifts every time somebody
 * explains it is worse than no foil, because it reads as a measurement and decays like prose. Run
 * both forms if you want the gap; only the anchored one is a fact about the code.
 *
 * The twin is picked at the RENDER site, by `<OutageText>` (components/staff/Chrome.tsx). P2 PR B
 * finished that: every place a staff write failure reaches the DOM as prose now renders through it,
 * across sixteen files. And because it matches by string IDENTITY rather than by call site, it
 * covers more arms than the 27 — a `staffGate()` given no custom `outageCopy` returns THIS sentence
 * as `gate.error`, so those arms are translated too, without any of them knowing.
 */
export const STAFF_WRITE_OUTAGE_MY = STAFF["out.write.failed"].my;

/**
 * M209 — the refusal for "we could not CHECK your authority", which is NOT the refusal for "you may
 * not". It lives here, beside its twin and in a PLAIN module, for the same reason
 * `STAFF_WRITE_OUTAGE` does: `lib/staff-actions.ts` is `"use server"`, so a client renderer cannot
 * import from it, and `<OutageText>` matches by string IDENTITY at the render site.
 *
 * Deliberately not reusing `STAFF_WRITE_OUTAGE`: that sentence says a change was not saved and to
 * keep it on paper. Neither is true here — no write was attempted, and "keep it on paper" is not an
 * answer to a role edit. Sharing the string would have localized it for free and lied in two tongues.
 */
export const AUTHORITY_UNCONFIRMED = STAFF["out.authority.unconfirmed"].en;
/** The Burmese twin, picked at the render site by `<OutageText>`. */
export const AUTHORITY_UNCONFIRMED_MY = STAFF["out.authority.unconfirmed"].my;

/**
 * Phase 2h (9e · the contract critic, F6) — a line edit (qty, note) whose answer has not come back
 * (`WRITE_WAITING`), or whose action threw (`WRITE_UNCONFIRMED`). `StaffLineEditor`'s `onError` is a
 * PLAIN-STRING channel read by four renderers it does not own (FloorDetailLive's write line, the
 * pad's Toast via `padSentenceNotice`, StaffTicket's parents) — every one of them already renders a
 * string through `<OutageText>` — so these two travel as their ENGLISH sentence and are given a twin
 * there, exactly as `STAFF_WRITE_OUTAGE` is, instead of widening a channel four files deep. Each is
 * its dictionary entry's `.en`/`.my` by construction, so the pair cannot drift apart.
 */
export const WRITE_WAITING = STAFF["out.write.waiting"].en;
export const WRITE_WAITING_MY = STAFF["out.write.waiting"].my;
export const WRITE_UNCONFIRMED = STAFF["out.write.unknown"].en;
export const WRITE_UNCONFIRMED_MY = STAFF["out.write.unknown"].my;

/**
 * Phase 2h · integration (S2 critic D2) — the page's write line once a line edit's LATE answer has
 * landed, with `stillWaiting` line edits still unanswered past the bound. WRITE_WAITING ("no answer
 * yet — that change may still be saved") goes only when the LAST waiting line has answered: one
 * row's answer says nothing about another row's write that is still out. Every OTHER line stands —
 * the refusal or WRITE_UNCONFIRMED a late answer said first, a discount's sentence — a late answer
 * landing is not what resolves any of them.
 */
export function writeLineAfterLateAnswer<T>(current: T, stillWaiting: number): T | null {
  return stillWaiting === 0 && current === WRITE_WAITING ? null : current;
}

/**
 * The nouns a frozen board can be showing. Narrowed to the dictionary's `what.*` keys so a board
 * cannot pass a free string: the previous signature took `what: string`, which meant every call site
 * carried its own English literal and no translation could reach them.
 */
export type WhatKey = Extract<StaffKey, `what.${string}`>;

/**
 * Why a board is degraded — and therefore how much blame the copy is entitled to assign.
 *  - `outage`  — the SERVER answered "unavailable": it couldn't reach the platform. We know it's us.
 *  - `unknown` — repeated transport failures from THIS device. Could equally be the tablet's wifi,
 *                so the copy must not assert "we can't reach the ordering system" (the W10a rule:
 *                never blame a side you have no evidence about — pre-merge review).
 */
export type StaffDegradedCause = "outage" | "unknown";

/** What a board holds while it can't refresh: when the degrade began, and the newest evidence about
 *  whose fault it is. `since` is in the BOARD'S OWN clock domain (see `frozenBoardCopy`). */
export type StaffDegraded = { since: number; cause: StaffDegradedCause };

/**
 * Fold new evidence into a board's degraded state: **keep the original `since`** (the escalation
 * must measure the whole degrade, not restart on every failed poll) but **always adopt the newest
 * `cause`**.
 *
 * The first cut wrote `setDegraded((d) => d ?? next)`, which latched the cause forever and broke
 * BOTH directions (pre-merge review, confirmed by three independent lenses):
 *  - `unknown` → `outage` never happened, so a board that first stumbled on its own wifi kept
 *    saying "not updating" even once the server itself reported the platform unreachable — and a
 *    code comment claimed the upgrade worked, documenting behavior the code did not have.
 *  - `outage` → `unknown` never happened either, which is the worse half: after the platform came
 *    back, a tablet that then lost its own AP kept asserting "we can't reach the ordering system" —
 *    precisely the unevidenced blame this whole layer exists to remove.
 *
 * Returns the SAME object when the cause is unchanged, so a steady degrade doesn't re-render.
 */
export function nextDegraded(
  prev: StaffDegraded | null,
  cause: StaffDegradedCause,
  nowInBoardClock: number,
): StaffDegraded {
  if (!prev) return { since: nowInBoardClock, cause };
  return prev.cause === cause ? prev : { since: prev.since, cause };
}

/**
 * The frozen-board banner, in the shared voice.
 *
 * `asOfIso` is the LAST GOOD snapshot's serverNow — the ledger's own stamp — and is used ONLY for
 * display (`toLocaleTimeString` renders that absolute instant in the device's timezone, so a wrong
 * device *clock* can't corrupt it).
 *
 * `degradedForMs` is elapsed time since the board entered this state, and the caller MUST measure
 * both endpoints in ONE clock domain. The first cut compared a SERVER instant against the tablet's
 * `Date.now()`: on a device whose clock was minutes off, skew — not elapsed outage time — decided
 * whether staff were told to fall back to paper (pre-merge review, confirmed independently four
 * times). Mixing clocks to measure a duration is the bug; keeping the display instant and the
 * elapsed measurement separate is the fix.
 */
export function frozenBoardCopy(
  lang: StaffLang,
  asOfIso: string,
  degradedForMs: number,
  what: WhatKey,
  cause: StaffDegradedCause = "outage",
): string {
  // The clock stays LATIN in both tongues: it is matched against a wall clock and a printed ticket,
  // and `toLocaleTimeString` is the device's own rendering of an absolute instant.
  const t = new Date(asOfIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const escalated = degradedForMs >= STAFF_OUTAGE_ESCALATE_MS;
  // Phrased to avoid a verb agreeing with `what` — "the bags is frozen" was the first cut's tell.
  // Burmese has no such agreement, but the same three parts assemble in both tongues so the
  // escalation logic stays one branch rather than two translations of a branch.
  const head =
    cause === "outage"
      ? escalated
        ? ts(lang, "out.head.still")
        : ts(lang, "out.head.cant")
      : escalated
        ? ts(lang, "out.head.stillNotUpdating")
        : ts(lang, "out.head.notUpdating");
  const tail = escalated ? ts(lang, "out.tail.paper") : ts(lang, "out.tail.reconnecting");
  return tf(lang, "out.frozen", { head, what: ts(lang, what), t, tail });
}

/**
 * Poll watchdog: the boards guard concurrent polls with an `inFlight` ref, so ONE hung Server
 * Action fetch (a socket that neither resolves nor rejects — proxies mid-outage do this) would
 * otherwise freeze the lock and silently stop all polling with the board still wearing its live
 * face. Racing a timeout turns the hang into a rejection → the ordinary catch/fails path → the
 * honest frozen banner, and the lock releases so the next poll keeps probing for recovery.
 *
 * 15s, not 8s: this is a HANG detector, not a latency budget. Restaurant wifi under load can take
 * many seconds for an honest round-trip, and at 8s a slow-but-healthy poll was being called a
 * failure (pre-merge review). Two consecutive misses are still required before the board says
 * anything, and a timeout now reports cause `unknown` — so a congested tablet never asserts that
 * WE are down. The raced promise is not cancellable (Server Actions take no signal); a late
 * settlement is simply discarded, which is why the caller must be idempotent — it is: the next
 * poll overwrites the snapshot wholesale.
 *
 * Phase 2h (decision 9c) — the bound is `STAFF_HANG_MS`, named ONCE in `lib/bounded-write.ts` (the
 * pad's unconfirmed-add bound and the stall ledger read the same constant), and the raw promise is
 * TRACKED in the stall ledger until it settles. The rejection at the bound frees this caller only:
 * the raw read is still in Next's one-at-a-time queue, holding every later action behind it
 * (LEARNINGS #157 · #200). Untracked, a read hung for minutes would leave `stalledSince` reading the
 * tab as healthy, and the next money tap would be dispatched into the queue behind it (9d).
 *
 * ⚠️ SERVER ACTIONS ONLY. It tracks whatever it races, and a plain fetch (a Supabase auth call,
 * ReadyBoard's `/api/board`) is NOT in Next's action queue: tracked, a hung sign-out on the lock
 * screen stayed in the ledger after the PIN unlock's SOFT navigation into the console, refusing
 * every money tap over a queue it never held (Phase 2h review c, C1). Race those with `raceFetch`.
 */
export function raceTimeout<T>(p: Promise<T>, ms: number = STAFF_HANG_MS): Promise<T> {
  track(p);
  return raceFetch(p, ms);
}

/**
 * The same bound for a promise that is NOT a Server Action — a Supabase auth call, a route-handler
 * fetch — and so is never TRACKED in the stall ledger: Next's one-at-a-time queue does not hold it,
 * so its hang says nothing about whether the next money write would be sent (9d). The rejection at
 * the bound frees the caller exactly as `raceTimeout`'s does.
 */
export function raceFetch<T>(p: Promise<T>, ms: number = STAFF_HANG_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("staff-poll-timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Was this client-side Supabase auth failure a TRANSPORT failure (platform unreachable) rather than
 * a verdict about the person? The client twin of lib/authz.ts `isTransportFailure` (server-only —
 * keep the two in lockstep). Login/PIN surfaces use it to say "we're having trouble" instead of
 * implying the person's email or code was wrong.
 */
export function isRetryableAuthShape(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name ?? "";
  const msg = (e as { message?: string }).message ?? "";
  const status = (e as { status?: number }).status;
  if (name === "AuthRetryableFetchError") return true;
  if (typeof status === "number" && (status === 0 || status >= 500)) return true;
  return /fetch failed|Failed to fetch|network|socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed? ?out|aborted/i.test(
    msg,
  );
}
