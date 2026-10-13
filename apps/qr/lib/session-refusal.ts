/**
 * J16 — why `/api/session` refused, as a WORD the client switches on, never a sentence it searches.
 *
 * GuestList used to read the failure by English substring (`"table is full"`, `"No table found"`),
 * so the arms it could not name — the 409 seated race on a `?table=N` claim, the 400 for a
 * de-registered table — fell to a futile "Try again" with no way out, and the server's own sentence
 * (which says what to do) was swallowed. Every refusal the route answers now carries one of these
 * in `reason`, beside the `error` sentence people read; the client recovers by the word
 * (`joinFailureArm`, lib/guest-list.ts) and shows the sentence.
 *
 * A word is never FINER than the sentence beside it where the sentence is coarse on purpose: a `?j=`
 * code that joins nothing and a solo session refusing a second member share `code_not_found` (the
 * route's NO_TABLE: no existence oracle), and a row that closed under the join shares `try_again`
 * with a transient miss (CLOSED_UNDER_JOIN).
 *
 * Pure and dependency-free: the route (server), `useTableSession` (client) and `guest-list` all read
 * this ONE list, so a word the route learns is a word the client can parse.
 */
export const SESSION_REFUSALS = [
  /** 400 — the body failed `sessionMintInput`. */
  "bad_request",
  /** 401 — no bearer token, or one the auth server did not accept. */
  "unauthenticated",
  /** 429 — this seat's join attempts are rate-limited. */
  "rate_limited",
  /** 503 — the auth or DB plane is unreachable (W10a): unknowable, never a verdict. */
  "unavailable",
  /** 404 — a `?j=` code that joins nothing, or a solo session refusing a second member (NO_TABLE). */
  "code_not_found",
  /** 404 — a client tried to CREATE a reserved (`reg-`/`kiosk-`) code. */
  "code_invalid",
  /** 403 — a phone tried to JOIN a reserved (counter or kiosk) order. */
  "staff_only",
  /** 400 — a `?table=N` claim for a table that is not registered, or is retired (BIND_COPY.unavailable). */
  "table_not_registered",
  /** 409 — a `?table=N` claim met a live party at N (BIND_COPY.seated): its code joins it. */
  "seated",
  /** 409 — a kiosk order holds N (BIND_COPY.kioskOrder): no phone joins one. */
  "kiosk_order",
  /** 409 — a server's table at N is no longer untouched (BIND_COPY.held): ask them to seat you. */
  "table_held",
  /** 409 — the party is at the cap (`MAX_PARTY_SIZE`; the `party_full` trigger backstop). */
  "full",
  /** 500, or the closed-under-join 409 — re-resolving from the top may land: "try again". */
  "try_again",
] as const;

export type SessionRefusal = (typeof SESSION_REFUSALS)[number];

/** A response body's `reason`, parsed: one of the words above, or null for anything else (an older
 *  server, a body that was not JSON, a word this build does not know) — which every reader treats
 *  as the generic, retryable failure, never as a verdict. */
export function sessionRefusal(x: unknown): SessionRefusal | null {
  return SESSION_REFUSALS.find((r) => r === x) ?? null;
}
