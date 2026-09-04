/**
 * T21(b) partial — the read-ordering ticket behind `TableCartProvider`'s cart view.
 *
 * Several paths apply a cart view and none of them cancels or supersedes another, so without a
 * ticket the LAST TO RESOLVE won rather than the last to be ISSUED. Realtime does no debouncing and
 * fires one refresh per row event, so a single multi-row change (a send-to-kitchen batch, a split
 * opening N shares) already fans out N concurrent reads whose landing order is arbitrary; T20's
 * scheduled freeze re-read adds one more, and its whole job is to observe a freeze — so a slow one
 * resolving after a newer read could put `locked: true` back over a cart the server had already
 * released, and the surface would stay frozen until the next scheduled read a full TTL later.
 *
 * ## The watermark is what was APPLIED, never what was merely ISSUED
 *
 * ⚠️ Codex round 2 on #249 found the first draft's flaw, and it mattered: it refused a read whose
 * ticket was not the newest ISSUED, so a newer read that FAILED — a transient 503, an offline
 * blip — still invalidated an older read that had SUCCEEDED. The concrete cost was the exact bug
 * T20 exists to fix: a scheduled freeze re-read observes the lock expired, a visibility refresh
 * issued a moment later gets a 503 and applies nothing, and the successful observation is discarded
 * anyway — leaving the menu frozen for another full window.
 *
 * So a request in flight reserves nothing. `applied` moves only when a view actually lands, and a
 * ticket is refused only by a view that BEAT it to the screen.
 *
 * ## Why a mutation's view still wins, and what that claim rests on
 *
 * ⚠️ NOT "it is rendered inside the statement that committed the write" — that was this docblock's
 * first justification and it is FALSE. `addItem` and `setQty` commit, then call `getCartView`
 * separately (`cart.ts`, both functions end `return getCartView(...)`), and that view is assembled
 * from several queries. A peer CAN change the cart in between, so a read still in flight may
 * genuinely hold newer rows. Codex was right about the mechanism, and the mechanism is what the next
 * reader trusts.
 *
 * The view still wins, on a policy rather than a proof, because the two errors are not symmetric:
 *
 *   • Refusing a read that was in fact newer costs a peer's change arriving late — and that peer's
 *     write emits its own `qr_cart_items` row event, which fires another read on this client, so
 *     the miss is self-healing on the next tick.
 *   • Applying a read that was in fact older erases a line the diner just watched land. They re-add
 *     it, and the cart carries two. That one touches money and does not heal itself.
 *
 * A read in flight when a mutation resolves may have read its rows BEFORE the write committed, and
 * nothing on the wire tells us which. Given the asymmetry, the tie goes to the write. Reads issued
 * AFTER the mutation's view landed are not affected — they carry a higher ticket and apply normally.
 *
 * ## What this does NOT do — read before trusting it (OPEN-ITEMS T24)
 *
 * It orders views by CLIENT ISSUANCE. That is not the order the SERVER read them in, and around an
 * expiry boundary the difference is observable: `assertCartMember` evaluates `locked_at > Date.now()
 * - CART_LOCK_TTL_MS` on the server clock, once per request, so two concurrent reads evaluate it at
 * two independent instants that need not follow the order this client issued them in. The
 * later-ticketed request can reach that read FIRST and capture `locked: true` while the
 * earlier-ticketed one reaches it after expiry and captures `locked: false` — and the watermark then
 * applies the stale higher ticket, or refuses the fresh lower one.
 *
 * That is a limitation this ticket does not remove, not a regression it introduces: before it,
 * ordering was by ARRIVAL, which is equally unrelated to server read order. What bounds the cost is
 * T20's scheduled re-read, which arms on exactly this state and re-arms on every successful read —
 * so the residual is one TTL of staleness, not a permanent freeze. Ordering on server truth needs
 * the view to CARRY it (an observation stamp, or the `locked_at`/`settle_at` of T23); that is a
 * shape change, and it is filed rather than approximated here.
 *
 * Lives here rather than inline in the provider for the reason `lock-ttl.ts` does: a rule that sits
 * in a component sits outside every guard this repo has, so it can be reverted with the gate green.
 */

/**
 * `issued` hands out tickets; `applied` is the ticket of the view currently on screen. The gap
 * between them is the set of reads still in flight, and it reserves nothing.
 */
export type ViewSeq = { issued: number; applied: number };

/** A fresh counter — nothing issued, nothing applied. */
export const newViewSeq = (): ViewSeq => ({ issued: 0, applied: 0 });

/** Take a ticket for a read that is about to await. Call BEFORE the await — the ticket records the
 *  order reads were ISSUED in, which is the order their answers describe. */
export function issueRead(s: ViewSeq): number {
  s.issued += 1;
  return s.issued;
}

/**
 * May this view be applied — and if so, record it as the newest thing on screen.
 *
 * `seq === undefined` is a mutation's own returned view: it lands, and it outranks every read
 * ISSUED up to this moment (see the docblock for why that is a policy, not a proof). A ticketed read
 * lands only if no view has been applied since it was issued; a read that merely STARTED later
 * blocks nothing, so a later read that fails cannot suppress an earlier one that worked.
 */
export function acceptView(s: ViewSeq, seq?: number): boolean {
  if (seq === undefined) {
    s.applied = s.issued;
    return true;
  }
  if (seq <= s.applied) return false;
  s.applied = seq;
  return true;
}
