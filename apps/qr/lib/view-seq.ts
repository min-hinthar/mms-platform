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
 * Two rules, and the asymmetry between them is the point:
 *
 *   • A READ takes a ticket before it awaits (`issueRead`) and is applied only if no view has been
 *     issued since (`acceptView`). Order-of-issue, not order-of-arrival.
 *   • A MUTATION'S RETURNED VIEW IS NOT A READ AND MUST ALWAYS WIN. `addItem`/`setQty` render their
 *     view server-side inside the same statement that committed the write, so its freshness is the
 *     SERVER's commit instant — never stale relative to a client read that merely started later.
 *     `acceptView` with no ticket is that case: it accepts unconditionally AND bumps the counter,
 *     which invalidates every read still in flight.
 *
 * Lives here rather than inline in the provider for the reason `lock-ttl.ts` does: a rule that sits
 * in a component sits outside every guard this repo has, so it can be reverted with the gate green.
 */

/** The issue counter. A mutable holder so the provider can keep it in a ref and read it inside
 *  callbacks without taking it as a dependency. */
export type ViewSeq = { issued: number };

/** Take a ticket for a read that is about to await. Call BEFORE the await — the ticket records the
 *  order reads were ISSUED in, which is the order their answers describe. */
export function issueRead(s: ViewSeq): number {
  s.issued += 1;
  return s.issued;
}

/**
 * May this view be applied?
 *
 * `seq === undefined` is a mutation's own returned view: always yes, and it invalidates anything in
 * flight. A ticketed read is applied only while its ticket is still the newest one issued.
 */
export function acceptView(s: ViewSeq, seq?: number): boolean {
  if (seq === undefined) {
    s.issued += 1;
    return true;
  }
  return seq === s.issued;
}
