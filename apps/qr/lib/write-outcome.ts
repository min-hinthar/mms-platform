/**
 * T26 — what a cart mutation actually ESTABLISHED, as three states rather than one sentinel.
 *
 * ## The defect this replaces
 *
 * #250 gave `addItem`/`setQty` a `null` meaning "written, unreadable" so a committed write would
 * stop being reported as a refusal. That fixed the server half and left the CLIENT half carrying
 * two meanings on one value, and Codex found four P1s riding it (rounds 3 and 4 on #250):
 *
 *   • `add` returned `null` for BOTH "refused" and "committed, view unknown". `YourUsual` reads
 *     every null as a refusal — it calls `setDoneCount(i)` "so a retry never re-adds what already
 *     landed" and then retries that exact item, adding the committed dish a second time.
 *   • `setItemQty`'s signature was `Promise<CartItem[]>`, so it *could not* say "unknown": when both
 *     the trailing read and the recovery re-read failed it returned `itemsRef.current`, the
 *     PRE-write quantity, and `AddButton` threaded that into the next queued op — two rapid
 *     decrements from 3 set 2 twice instead of 2 then 1.
 *   • An `unknown` landing from a SUCCESSFUL re-read (a concurrent same-dish edit makes the delta
 *     unattributable) also fell through to the refusal arm — so the sentinel was wrong even when
 *     nothing was broken.
 *
 * The shape is the fix: a value that must answer "was this written?" and "what does the cart look
 * like?" cannot do it with one nullable list, because "no list" is true of both a refusal and a
 * committed write we could not read.
 *
 * ## Why `unconfirmed` must never be retried
 *
 * The tempting reading is that an unconfirmed write is a failed write, so a retry is free. It is
 * not, and the two errors are not symmetric — the same asymmetry `view-seq.ts` reasons from:
 *
 *   • Treating a COMMITTED write as refused and retrying charges the diner twice for one tap. The
 *     duplicate is a real line on a real bill, and nothing on the client heals it.
 *   • Treating a REFUSED write as committed loses a dish. The diner is looking at the cart, sees it
 *     is not there, and taps again. It costs a tap.
 *
 * So `unconfirmed` behaves like a landing for RETRY purposes (do not re-send) and like a refusal for
 * CLAIM purposes (announce nothing we cannot see). It is the only honest position: we know the
 * request left, and we do not know what became of it.
 */

/**
 * The outcome of one cart mutation, from the client's point of view.
 *
 * `V` is the view type the caller threads onward (`CartItem[]` at every current call site) — the
 * module stays generic so the rule is testable without a cart fixture.
 */
export type WriteResult<V> =
  /** It landed, and this is the server's view of the cart with it in. */
  | { state: "applied"; view: V }
  /** The request left; we cannot see whether it landed. NEVER retry, NEVER claim it. */
  | { state: "unconfirmed" }
  /** It did not land. The cart was read and this write is not in it. */
  | { state: "refused" };

/**
 * May the caller send this write again?
 *
 * ⚠️ ONLY a refusal. This is the rule `YourUsual`'s loop was breaking: it advanced `doneCount` past
 * the item and returned, which reads as "resume here", and the resume re-adds. A refusal is the one
 * state where the cart was actually READ and found not to contain the write.
 */
export function mayRetry<V>(r: WriteResult<V>): boolean {
  return r.state === "refused";
}

/**
 * The view a caller may thread into its next queued operation, or `null` when there is none.
 *
 * ⚠️ `unconfirmed` yields `null`, and a caller must NOT substitute its own pre-write snapshot for
 * that null. `AddButton`'s queue does `threaded ?? itemsRef.current`, and on this state
 * `itemsRef.current` is precisely the stale list the write was supposed to change — the fallback
 * that is correct for a FIRST op is wrong for a following one.
 */
export function threadableView<V>(r: WriteResult<V>): V | null {
  return r.state === "applied" ? r.view : null;
}

/**
 * May the caller announce that this write landed?
 *
 * Separate from `mayRetry` on purpose: `unconfirmed` answers "don't retry" AND "don't claim it", and
 * a single boolean cannot carry both. Collapsing them is how a not-retried write became a spoken
 * success.
 */
export function mayClaimLanding<V>(r: WriteResult<V>): boolean {
  return r.state === "applied";
}

/**
 * Classify a write whose response was LOST or REJECTED, from the one recovery re-read that follows.
 *
 * The caller supplies what it observed, never a conclusion:
 *
 * @param reread  the cart as the re-read saw it, or `null` when the re-read could not see the cart
 *                at all — which includes a read that came back but was OVERTAKEN, because a view
 *                that beat ours to the screen may predate our write (`view-seq.ts`: a mutation's
 *                view wins on policy and may have read its rows before our commit).
 * @param landed  did THIS write's effect appear in that re-read? `null` = the re-read succeeded but
 *                could not attribute the change — a concurrent edit to the same dish or row makes
 *                the delta ambiguous, and an ambiguous delta is not evidence either way.
 */
export function recoveredWrite<V>(input: {
  reread: V | null;
  landed: boolean | null;
}): WriteResult<V> {
  const { reread, landed } = input;
  // No usable read: a response lost after a commit is indistinguishable from a refusal, and the
  // asymmetry above settles which way to be wrong.
  if (reread === null) return { state: "unconfirmed" };
  // Read fine, attribution ambiguous. Before T26 this fell to the refusal arm, so a successful read
  // produced the retry-a-committed-add bug with nothing broken at all.
  if (landed === null) return { state: "unconfirmed" };
  return landed ? { state: "applied", view: reread } : { state: "refused" };
}
