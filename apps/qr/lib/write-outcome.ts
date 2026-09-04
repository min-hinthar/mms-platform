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
  /**
   * It landed. `view` is the server's cart with it in — or `null` when we saw the landing in a read
   * that was OVERTAKEN, so the observation stands but the snapshot must not be threaded.
   */
  | { state: "applied"; view: V | null }
  /** The request left; we cannot see whether it landed. NEVER retry, NEVER claim it, and there is
   *  no view — this is the ONLY state without one. */
  | { state: "unconfirmed" }
  /**
   * It did not land. The cart was READ and this write is not in it.
   *
   * ⚠️ IT CARRIES THAT READ (Codex round 2 on #251, P1). A refusal is established BY a successful
   * recovery read, so this state holds the freshest view anyone has — and the first draft threw it
   * away, which is not merely wasteful: `AddButton`'s fallback is a LOCAL `itemsRef` synced in a
   * passive `useEffect`, so inside a promise chain it still holds the pre-write list. A host moving
   * a line 3 → 5 while the first request was refused then had the next rapid decrement send the
   * absolute quantity 2 instead of 4, silently overwriting the concurrent change. `setQty` is
   * absolute, so a stale baseline is a wrong number, not a lost tap.
   *
   * `view` is null only where there was no cart to read (an unmounted/session-less caller).
   */
  | { state: "refused"; view: V | null };

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
  // `unconfirmed` is the only state that has no trustworthy view: `applied` carries the mutation's
  // own, `refused` carries the recovery read that PROVED the refusal. Withholding the refusal's view
  // hands the caller back to a stale snapshot for no gain (Codex round 2 on #251, P1).
  return r.state === "unconfirmed" ? null : r.view;
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
 * What to say about a write we could not see — because saying NOTHING is also a claim.
 *
 * ⚠️ Codex round 1 on #251 (P2), and it is this slice's own defect arriving from the other side.
 * `mayClaimLanding` answers false for `unconfirmed`, but the provider flashes "Added to your order"
 * OPTIMISTICALLY on tap and then published nothing on this state — so the optimistic claim stood as
 * the final word in the one live region. `AddButton` and `ItemSheet` never speak after the provider,
 * so for them it was the ONLY word. A predicate that forbids a claim is worth nothing if the claim
 * was already made and the code merely declines to retract it.
 *
 * The sentence names the observation and gives somewhere to go, and it is true on BOTH ways of
 * reaching `unconfirmed`: when the re-read failed we have no current list, and when it succeeded but
 * the delta was unattributable we do — "check your order below" is right either way. That is why it
 * is not `refusedWriteNotice`'s "the order below is up to date", which asserts a currency we do not
 * always have.
 */
export function unconfirmedWriteNotice(): string {
  return "We couldn’t confirm that — check your order below.";
}

/**
 * What to say when a write was NOT sent because we had no trustworthy baseline to compute it from.
 *
 * ⚠️ Distinct from `unconfirmedWriteNotice`, and the difference is the whole point (Codex round 6 on
 * #251, P1). There, the request LEFT and we cannot see what became of it. Here, nothing was sent at
 * all — a queued absolute `setQty` had only a stale snapshot to derive its target quantity from, and
 * inventing a baseline for an ABSOLUTE write does not lose a tap, it writes a WRONG NUMBER over
 * whatever a concurrent host actually set.
 *
 * So this sentence may do what the other must not: invite a retry. Nothing landed, so nothing can
 * double.
 */
export function unsentWriteNotice(): string {
  return "We couldn’t reach your order — nothing changed. Try that again in a moment.";
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
 * @param viewIsCurrent  did that read WIN the screen (`applyView` accepted it)? Defaults true.
 *                Pass false for an OVERTAKEN read: what it says about the write is still true, but
 *                its rows may predate the view that beat it, so they must not be threaded onward.
 */
export function recoveredWrite<V>(input: {
  reread: V | null;
  landed: boolean | null;
  viewIsCurrent?: boolean;
}): WriteResult<V> {
  const { reread, landed, viewIsCurrent = true } = input;
  // No usable read: a response lost after a commit is indistinguishable from a refusal, and the
  // asymmetry above settles which way to be wrong.
  if (reread === null) return { state: "unconfirmed" };
  // Read fine, attribution ambiguous. Before T26 this fell to the refusal arm, so a successful read
  // produced the retry-a-committed-add bug with nothing broken at all.
  if (landed === null) return { state: "unconfirmed" };
  // ⚠️ WHAT HAPPENED and WHETHER THE SNAPSHOT IS CURRENT ARE TWO QUESTIONS (Codex round 3 on #251,
  // P1). A ticketed read can come back — establishing perfectly well whether the write landed — and
  // still be OVERTAKEN, meaning a view applied after it was issued is what the screen holds. The
  // classification is a fact about the moment we looked and stands either way; the LIST is only safe
  // to hand onward when it is the one that won. Threading an overtaken snapshot is the same
  // wrong-absolute-quantity defect as discarding the refusal's view, reached from the other side.
  const view = viewIsCurrent ? reread : null;
  return landed ? { state: "applied", view } : { state: "refused", view };
}
