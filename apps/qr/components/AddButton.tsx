"use client";
import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import posthog from "posthog-js";
import type { CartItem } from "@mms/db";
import { useAnimationPreference, useRipple } from "@mms/ui";
import { useCart } from "./TableCartProvider";
import { MicroBurst } from "./MicroBurst";
import {
  mayClaimLanding,
  threadableView,
  unsentWriteNotice,
  type WriteResult,
} from "@/lib/write-outcome";
import { haptic } from "@/lib/haptics";
import { inertReason } from "@/lib/inert-reason";
import { createRevertCue, pillAddClaim, stepClaim, stepOvertakenNotice } from "@/lib/add-feedback";

const MAX_QTY = 99; // matches the cart Stepper's upper bound (setQty is the authority; this is the UI gate)

// The viewer's OWN draft quick-add lines for this item, from a given cart snapshot: item + no modifiers +
// the session-default fulfillment + draft + not comped + own verified seat. Shared by the render (current
// items) and the write-queue (the freshest threaded snapshot) so both agree on which lines the stepper
// owns. Require a known seat — a staff line has `bySeat` undefined and session recovery blanks `mySeat`, so
// an unguarded `=== mySeat` would false-match a staff line (a real diner line always carries its by_seat).
function matchOwnLines(
  items: CartItem[],
  menuItemId: string,
  fulfillment: string,
  mySeat: string | undefined,
): CartItem[] {
  if (!mySeat) return [];
  return items.filter(
    (i) =>
      i.menuItemId === menuItemId &&
      i.modifiers.length === 0 &&
      i.fulfillment === fulfillment &&
      i.lineState === "draft" &&
      !i.comped &&
      i.bySeat === mySeat,
  );
}

/** Is keyboard focus orphaned — nowhere, or dropped to <body> because the focused node left the DOM? */
function focusOrphaned(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

/**
 * Per-item "Add" — the only way an item enters the cart, via the server-authoritative `addItem`
 * (the client sends an item id, never a price). Disabled until the session/cart exists and when the
 * item is sold out (a disabled control, not a missing one — RED-TEAM trap). 44px hit area.
 *
 * Richness R3/R4: the press answers with a spring scale-down (`whileTap`) + a tap ripple (`useRipple`).
 *
 * Richness R5c — **Add → quantity morph** (the prototype's `.add → .stp`): once the viewer has this item
 * in their OWN cart line, the pill morphs into an inline accent stepper (− qty +). The "+" reuses `add` (the
 * server creates/increments the viewer's own line); the "−" calls `setItemQty` (`qty<=0` removes, morphing
 * back to the Add pill).
 *
 * **Works in every mode, incl. dine-in groups, because the cart merge is per-seat** (`insertOrIncLine`
 * scopes its merge by `by_seat`): two diners ordering the same item get SEPARATE lines, so each diner's
 * Add/stepper targets their OWN line — never a tablemate's — and `canMutateLine` (own-draft) always passes
 * for the "−". The match below mirrors `insertOrIncLine`'s exact merge keys, scoped to the viewer's seat.
 */
export function AddButton({
  menuItemId,
  name,
  soldOut = false,
}: {
  menuItemId: string;
  name: string;
  soldOut?: boolean;
}) {
  const {
    add,
    setItemQty,
    refresh,
    announce: announceCart,
    items,
    cartId,
    loading,
    locked,
    lockedByYou,
    settling,
    isGroup,
    me,
  } = useCart();
  const [busy, setBusy] = useState(false);
  // Optimistic add delta (R7 perf): the button morphs to the stepper the INSTANT it's tapped, before the
  // server round-trip returns, so a tap never sits at "…" waiting on the network. Reconciled to server
  // truth in `increment`'s finally — on success the returned view already includes the add (delta nets to
  // 0, no flicker); on failure the delta reverts, dropping back to the Add pill.
  const [optimistic, setOptimistic] = useState(0);
  const { shouldAnimate } = useAnimationPreference();
  const { ripples, onPointerDown } = useRipple();

  // `add(menuItemId)` inserts/increments at the SESSION-DEFAULT fulfillment (dine-in at a table, else to-go),
  // and `insertOrIncLine` keeps different fulfillments as SEPARATE lines. So the menu stepper must match
  // EXACTLY that default-fulfillment line — otherwise a line re-routed to "to go" in the cart would show its
  // qty here while "+" silently grew a different (default) line (stuck qty + wrong routing/tax).
  const defaultFulfillment = isGroup ? "dinein" : "togo";
  // The viewer's OWN draft quick-add lines for this item. Usually exactly one — `insertOrIncLine` merges a
  // diner's repeat adds per seat — but the cart can legitimately hold MORE than one matching own line (a host
  // reassign onto an item the diner already has, a price-snapshot difference between two adds, or a concurrent
  // first-add race), and there's deliberately no unique constraint. So AGGREGATE rather than assume one line —
  // the cart, split, and totals already sum per line — and the menu stays correct for any count.
  const mySeat = me?.seat;
  const myLines = matchOwnLines(items, menuItemId, defaultFulfillment, mySeat);
  const serverQty = myLines.reduce((sum, l) => sum + l.qty, 0);
  // Displayed qty = server truth + the optimistic in-flight delta (the instant-morph). All UI (the digit,
  // aria labels, the MAX gate, the morph) keys off this; the WRITE still targets real server lines only.
  const qty = serverQty + optimistic;
  // Fresher 86'd signal: any matching own line flagged sold-out (server-derived live in getCartView) OR the
  // page-render menu prop. Gates the in-cart "+" so a line 86'd after load can't keep incrementing.
  const liveSoldOut = soldOut || myLines.some((l) => l.soldOut);
  // Morph once the viewer has the item in their own line(s) — all modes (per-seat merge shows each diner their
  // own contribution). Qty-driven: the stepper stays the control even if 86'd ("+" disables, "−" still removes).
  const inCart = qty > 0;

  // Two freeze levels. `frozen` = the cart can't be written AT ALL: no session yet, a pay-window lock
  // (P3.2), or a split-settlement freeze (P3.3b) — the server rejects add/setQty, so the STEPPER's +/−
  // are disabled (a disabled control, not a missing one). `blocked` adds the in-flight `busy` window and
  // gates only the Add PILL (double-create guard) + the focus effects. Crucially the stepper does NOT gate
  // on `busy`, so rapid +/− taps stay live and never freeze mid-write — the "cart actions feel delayed" fix.
  const frozen = !cartId || locked || settling;
  const blocked = frozen || busy;
  // W9b — the mint window. `loading` has been on the cart context since M3 with ZERO consumers, so
  // for the second or two before the session resolves every pill on the menu is simply dead: no
  // label, no busy state, nothing to hear. This does NOT relax `blocked`/`inactive` — a tap that
  // reached `add()` with a null cartId would raise the session-recovery banner for a non-error (M10).
  const minting = loading && !cartId;
  // Why this control is inert — from the SHARED ladder (lib/inert-reason), so the Add pill, the
  // stepper and the item sheet can't drift into telling a screen-reader user different stories about
  // the same frozen cart. Precedence + copy are pinned by `inert-reason.test.ts`.
  // T20 — the FACT, not the label. `lockedByName` is peer-supplied presence text, so a tablemate
  // named "You" used to make their lock read as this viewer's own.
  const reason = inertReason({ minting, locked, lockedByYou, settling });

  // Serialize THIS button's stepper writes so rapid taps can't race on a stale server read: a "+" merges via
  // `add` (relative — order-independent), a "−" trims a specific line by id, and each op reads the FRESHEST
  // lines (threaded from the prior op's returned view) before it writes. The digit stays instant via the
  // optimistic delta; the writes drain in the background, in tap order.
  // ⚠️ THE CHAIN THREADS THE OUTCOME, NOT A NULLABLE LIST (T26). It used to carry `CartItem[] | null`,
  // and `null` meant three different things by the time it reached the next op: no prior op, a
  // refused one, and a COMMITTED one whose view could not be read. Only the third is dangerous —
  // `itemsRef.current` is then the pre-write list — and a bare null could not distinguish it.
  // `null` here now means exactly "no prior op ran".
  const writeChain = useRef<Promise<WriteResult<CartItem[]> | null>>(Promise.resolve(null));
  // Latest committed items in a ref (effect-synced, not a render closure) so a decrement op that has no
  // threaded predecessor — the first op, or one following a concurrent create — still seeds from the freshest
  // snapshot rather than the tap-time closure.
  const itemsRef = useRef<CartItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Focus management (WCAG 2.4.3): a "−" that removes the line unmounts the stepper, so focus would drop to
  // <body>. When the removal lands (qty → 0), move focus to the Add pill that replaces it. Gate on `!blocked`
  // so we focus only a focusable pill (`frozen` natively-disables it). The decrement no longer holds `busy`,
  // so at qty 0 the pill is focusable at once and focus lands immediately. Set only on a remove-via-"−".
  // ⚠️ ORPHAN-GUARDED (Phase 1c). The flag can wait behind a freeze for as long as the freeze lasts, and
  // when the freeze lifts the diner may be anywhere — so it CONSUMES itself, and moves focus only if focus
  // is still orphaned (<body>/null). A landing place, never a steal.
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const refocusAfterRemove = useRef(false);
  useEffect(() => {
    if (qty === 0 && refocusAfterRemove.current && !blocked) {
      refocusAfterRemove.current = false;
      if (!focusOrphaned()) return;
      addBtnRef.current?.focus();
    }
  }, [qty, blocked]);

  // `refocusStepper` — a "−" optimistically emptied the line (focus moved to the Add pill), but the write
  // was REVERTED (transient error left the draft line), so the stepper REMOUNTS and the pill's focus would
  // drop to <body>. Land focus back on the "−" the user was operating. Gated on `!blocked`, and — Phase 1c
  // — orphan-guarded like the remove path above: a freeze lifting later can never pull focus back here.
  // (Phase 1c deleted its old sibling `refocusAfterAdd`: a PERSISTENT flag armed on every pill tap, which a
  // create that did not land left armed until the line appeared some other way — then it fired from
  // wherever the diner had gone. The pill's create now lands focus ONCE, below.)
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const minusBtnRef = useRef<HTMLButtonElement>(null);
  const refocusStepper = useRef(false);
  useEffect(() => {
    if (!inCart || blocked) return;
    if (refocusStepper.current) {
      refocusStepper.current = false;
      if (!focusOrphaned()) return;
      minusBtnRef.current?.focus();
    }
  }, [inCart, blocked]);

  // Phase 1c — the pill's create lands focus ONCE, when it settles (never a persistent flag). The chain
  // bumps `createSettled` only if, at the settle, focus was orphaned or inside THIS row's stepper; this
  // effect then re-checks after the reconcile commit and moves focus only if it is STILL orphaned —
  // landed → the "+" (or "−" when "+" is disabled), reverted → the pill. Anywhere else, nothing moves.
  // `holdFocus` keeps a freeze-disabled pill focusable (`aria-disabled`) for exactly this landing.
  const stepperRef = useRef<HTMLSpanElement>(null);
  const [createSettled, setCreateSettled] = useState(0);
  const handledSettle = useRef(0);
  const [holdFocus, setHoldFocus] = useState(false);
  // Phase 1c — the "+" glyph's "set back down" cue after a DEFINITE non-landing (`createRevertCue`).
  const [revertCue, setRevertCue] = useState(false);
  useEffect(() => {
    if (createSettled === 0 || handledSettle.current === createSettled) return;
    handledSettle.current = createSettled;
    if (!focusOrphaned()) return;
    // `preventScroll` (blind review): on iOS a tap does not focus, so `activeElement` is <body> after
    // every pill tap and this landing runs ~1.7s later — a plain focus() would scroll the menu back to
    // the row if the diner had scrolled on. The row is where their finger just was; it needs no jump.
    if (inCart) {
      refocusStepper.current = false; // a landed create supersedes a pending revert-refocus
      (plusBtnRef.current?.disabled ? minusBtnRef : plusBtnRef).current?.focus({
        preventScroll: true,
      });
    } else {
      addBtnRef.current?.focus({ preventScroll: true });
    }
  }, [createSettled, inCart]);

  // Record a CONFIRMED add only: the provider's `add` never throws, and it reports a refused or an
  // unreadable add rather than a landing, so an unconditional capture would log phantom adds.
  // ⚠️ `mayClaimLanding`, not truthiness (T26). An `unconfirmed` write is a live object and was
  // therefore truthy under the old nullable-list shape's successor — the exact class of bug the three
  // states exist to remove. Analytics may only count a landing we can actually see.
  function captureAdd(result: WriteResult<CartItem[]>): WriteResult<CartItem[]> {
    if (mayClaimLanding(result))
      posthog.capture("menu_item_add_clicked", { menu_item_id: menuItemId });
    return result;
  }

  // W13 — the micro-gem burst rides the INTENT (the tap), like the morph — Phase 1c: the pill's 0→1 tap
  // ONLY (v7.2 quickAdd's `microGems`); a stepper step is a reversible adjustment and v7.2's `bump()`
  // has no gems. The gems end ≤560ms after the tap, well before a non-landing can arrive (~1.7s
  // measured, CartBar), which is then retracted in place (the glyph's settle cue) and in words (the
  // provider's named correction). The burst mounts on the STEPPER shell (the surviving branch after
  // the pill→stepper morph).
  const [burstKey, setBurstKey] = useState(0);

  // Every increment (the 0→1 create tap from the pill AND a stepper "+") runs through `writeChain` so it
  // orders with any in-flight "−" and threads THIS add's server truth to the next op. `fromPill` additionally
  // holds `busy` (the pill's double-create guard). The morph/digit is instant via the optimistic delta and
  // the CLAIM is spoken at the tap (Phase 1c) — a queued tap is heard when it is made, not a round trip
  // later when its write starts. The write drains in the background, in tap order.
  function increment(fromPill: boolean) {
    haptic(fromPill ? "add" : "pick"); // W13/W22c — the v7.2 hierarchy, named: add (8) · pick (6)
    if (fromPill) setBurstKey((k) => k + 1);
    setRevertCue(false);
    setHoldFocus(false);
    // Quiet: the pill morph / the digit already SHOW the change where the diner tapped; the one live
    // region SAYS it, naming the dish. `qty + 1` is the optimistic aggregate the digit will read.
    const claim = fromPill ? pillAddClaim(name) : stepClaim(name, qty + 1);
    announceCart(claim.text, claim.ms, claim.my, { quiet: claim.quiet, kind: "claim" });
    setOptimistic((n) => n + 1); // instant morph / digit bump — before the round-trip resolves
    if (fromPill) setBusy(true);
    writeChain.current = writeChain.current
      .then(async () => {
        let res: WriteResult<CartItem[]> | null = null;
        try {
          // `claim: null` — spoken above, at the tap; `name` — so a correction names the dish.
          res = captureAdd(await add(menuItemId, [], undefined, 1, { claim: null, name }));
        } finally {
          if (fromPill) {
            // The REVERSAL cue — only for a DEFINITE non-landing. `lineVisible` is null when the seat is
            // unknown (session recovery) or no current view came back, so a success is never drawn
            // as reverted.
            const view = res ? threadableView(res) : null;
            const lineVisible =
              view === null || !mySeat
                ? null
                : matchOwnLines(view, menuItemId, defaultFulfillment, mySeat).some(
                    (l) => l.qty > 0,
                  );
            setRevertCue(res ? createRevertCue({ state: res.state, lineVisible }) : false);
            // One-shot focus: only when focus was orphaned by the morph, or is inside this row's own
            // stepper. Batches with the reconcile below, so the effect sees the settled row.
            const active = document.activeElement;
            if (!active || active === document.body || stepperRef.current?.contains(active)) {
              setHoldFocus(true);
              setCreateSettled((t) => t + 1);
            }
          }
          // Reconcile: on success the returned view already includes the add (delta nets to 0, no flicker);
          // on failure serverQty is unchanged, so the delta reverting drops back to the Add pill.
          setOptimistic((n) => n - 1);
          if (fromPill) setBusy(false);
        }
        return res; // thread THIS add's outcome so a following "−" knows what it may trust
      })
      .catch(() => null);
  }

  function decrement() {
    const nextAgg = qty - 1; // qty is optimistic-inclusive → the aggregate the user intends after this tap
    if (nextAgg < 0) return; // the "−" unmounts at 0, but never underflow
    haptic("pick"); // W13/W22c — a stepper step is reversible (no burst on remove — celebration is add-only)
    setOptimistic((n) => n - 1); // instant digit drop
    const emptying = nextAgg <= 0;
    if (emptying) refocusAfterRemove.current = true; // aggregate empties → focus the Add pill that replaces us
    // Announce through the provider's ONE polite live region (WCAG 4.1.3), symmetric with the "+": Phase 1c
    // speaks it QUIETLY at the TAP (`stepClaim`, shared with the "+"), not when the queued write starts,
    // so five fast taps are not heard trickling out behind a digit that already reads the last one.
    const claim = stepClaim(name, nextAgg);
    announceCart(claim.text, claim.ms, claim.my, { quiet: claim.quiet, kind: "claim" });
    // If an emptying "−" is REVERTED (the write fails and the draft line survives), the optimistic +1 below
    // remounts the stepper — arm a refocus so the pill's focus doesn't drop to <body> (WCAG 2.4.3).
    // ⚠️ ARM ON EVERY OUTCOME WHERE THE LINE MAY SURVIVE (T26 + Codex round 2 on #251, P2). The flag
    // exists so focus does not drop to <body> when an emptying removal is REVERTED and the stepper
    // remounts. Three cases, and only the first is the happy one:
    //
    //   • a view we can read (applied, or a REFUSED write whose recovery read we now carry) — ask it
    //     directly whether a line survived;
    //   • `unconfirmed` — no view exists, so we cannot tell. Arm it: arming wrongly costs nothing
    //     (the effect only fires if the stepper actually mounts), NOT arming strands focus.
    //
    // A refusal used to fall through the `fresh === null` branch and arm nothing — yet a refusal is
    // precisely the case where the line certainly SURVIVED, so the stepper certainly remounts and
    // the focused Add pill certainly unmounts. It was the one outcome guaranteed to strand focus.
    const armRevertRefocus = (res: WriteResult<CartItem[]>) => {
      if (!emptying) return;
      const fresh = threadableView(res);
      if (fresh === null) {
        refocusStepper.current = true;
        return;
      }
      if (matchOwnLines(fresh, menuItemId, defaultFulfillment, mySeat).some((l) => l.qty > 0)) {
        refocusStepper.current = true;
      }
    };
    writeChain.current = writeChain.current
      .then(async (prior) => {
        try {
          // ⚠️ `itemsRef` HERE IS A LOCAL REF SYNCED IN A PASSIVE EFFECT (line 141), so inside this
          // promise chain it holds the list from the last RENDER — not whatever the provider applied
          // a moment ago. That is why the prior op's own view is the primary source and this is only
          // the fallback, and why `await refresh()` cannot substitute for threading: refreshing
          // updates the PROVIDER, and this ref catches up a render later (Codex round 2 on #251, P1).
          //
          // Every outcome except `unconfirmed` now carries a view — `applied` the mutation's own,
          // `refused` the recovery read that proved the refusal — so the fallback is reached only
          // when there genuinely is no current cart to be had.
          //
          // `unconfirmed` still re-reads first: that state means the write COMMITTED and we could
          // not see it, so the last render's list holds the pre-write quantity. If the re-read also
          // fails the fallback degrades honestly rather than corrupting — `setQty` is ABSOLUTE, so
          // re-sending `qty - 1` against a quantity the server already has is an idempotent no-op:
          // the tap is lost, the cart is not wrong.
          // ⚠️ USE WHAT THE REFRESH RETURNS (Codex round 3 on #251, P2). `await refresh()` updates the
          // PROVIDER; this ref catches up a render later, so reading it here discards a perfectly
          // good recovery read: two rapid decrements from 3 lost the second tap even when the
          // refresh had cleanly observed 2. Provider state is not a channel this continuation can
          // read — the value has to come back out of the call, and now it does.
          //
          // ⚠️ GATE ON THE VIEW, NOT THE STATE (Codex round 4 on #251, P1). Round 3 gave `applied`
          // and `refused` a null view for an OVERTAKEN read, so a state check no longer identifies
          // the cases that have nothing to thread: both now fall through to the stale ref. The
          // question this line asks is "do I have a current list?", and `threadableView` is the one
          // that answers it — checking `state` was only ever a proxy, and my own change invalidated
          // the proxy without updating the check.
          const threaded = prior ? threadableView(prior) : null;
          const refreshed = prior && threaded === null ? await refresh() : null;
          // Freshest lines, in order of how well we can trust them: the prior op's own view, then a
          // refresh we just applied, and only then the last render's snapshot — which is the correct
          // source for a FIRST op and the stale one for a following op, hence the ordering.
          //
          // ⚠️ AND THE LAST-RENDER SNAPSHOT IS ONLY VALID FOR A FIRST OP (Codex round 6 on #251, P1).
          // It is correct there — nothing has changed since the render. After a prior write whose
          // view we never got AND a refresh that came back empty, it is a genuinely stale baseline,
          // and `setQty` is ABSOLUTE: deriving `target.qty - 1` from it does not lose a tap, it
          // writes a WRONG NUMBER over whatever a concurrent host actually set. The honest move is
          // to send nothing. Losing a tap is recoverable by the diner; silently reverting someone
          // else's quantity is not.
          const source = threaded ?? refreshed ?? (prior === null ? itemsRef.current : null);
          if (source === null) {
            // ⚠️ ARM THE REFOCUS BEFORE THE REVERT (Codex round 7 on #251, P2 — WCAG 2.4.3). On an
            // emptying decrement focus has already moved to the temporary Add pill; restoring the
            // optimistic quantity remounts the stepper and unmounts that pill, so without this the
            // keyboard and screen-reader caret drops to <body>. Every other exit from this chain
            // arms it — the skip branch was new in round 6 and did not.
            if (emptying) refocusStepper.current = true;
            setOptimistic((n) => n + 1); // revert the optimistic step — nothing was sent
            announceCart(unsentWriteNotice(), undefined, undefined, { kind: "correction" });
            // Still no view, so the NEXT op must refresh too: hand the prior result back rather
            // than `null`, which would claim there was no preceding write.
            return prior;
          }
          const lines = matchOwnLines(source, menuItemId, defaultFulfillment, mySeat);
          const target = lines.find((l) => l.qty <= 1) ?? lines[lines.length - 1];
          if (!target) {
            setOptimistic((n) => n + 1); // nothing to remove (already gone) → drop the optimistic step
            // The claim was spoken at the TAP (Phase 1c) and nothing was sent — retract it (blind
            // review). The sibling `source === null` arm does; this one used to revert silently.
            announceCart(stepOvertakenNotice(name), undefined, undefined, { kind: "correction" });
            // Nothing was written, so the next op may trust the snapshot exactly as a first op does.
            return null;
          }
          // No `announce` arg: the claim was spoken at the tap (Phase 1c).
          const res = await setItemQty(target.id, target.qty - 1);
          armRevertRefocus(res); // set BEFORE the reconcile so the flag is armed when the stepper remounts
          setOptimistic((n) => n + 1); // reconcile: the returned view's serverQty now reflects the removal
          return res;
        } catch {
          if (emptying) refocusStepper.current = true; // defensive: assume the line survived the throw
          setOptimistic((n) => n + 1); // defensive: setItemQty swallows its own errors, so this rarely runs
          return null;
        }
      })
      .catch(() => null);
  }

  // Phase 1c — render-time adjusts (the sanctioned "adjust state when inputs change" pattern, as in
  // AppHeader): each is guarded by its own condition, so it converges in one pass.
  //  • Back on the pill, the burst is spent. A stepper that REMOUNTS later (a reverted emptying "−", a line
  //    re-appearing after a refresh) must not replay the last add's gems — MicroBurst's own `doneKey`
  //    dies with it, so a stale `burstKey` here would celebrate a failed removal.
  //  • On the stepper, the pill's revert cue and focus-hold are moot — clear them so neither survives to
  //    the next time the pill appears.
  if (!inCart && burstKey !== 0) setBurstKey(0);
  if (inCart && (revertCue || holdFocus)) {
    setRevertCue(false);
    setHoldFocus(false);
  }

  // Morphed state: the viewer has this item in their own line → the accent quick-qty stepper.
  if (inCart) {
    return (
      <span
        ref={stepperRef}
        // Pop on mount (the prototype's `.stp{animation:pop}`); reuses `.mms-pop` + its reduced-motion gate.
        // W13: position:relative hosts the micro-gem burst (the pill clips overflow; this shell doesn't).
        className={`mms-qty-stepper${shouldAnimate ? " mms-pop" : ""}`}
        style={{ position: "relative" }}
      >
        {shouldAnimate && <MicroBurst burstKey={burstKey} />}
        <button
          ref={minusBtnRef}
          type="button"
          className="mms-stepper-btn"
          disabled={frozen}
          aria-label={
            reason
              ? `${qty === 1 ? `Remove ${name}` : `Remove one ${name}`} — ${reason}`
              : qty === 1
                ? `Remove ${name}`
                : `Remove one ${name}`
          }
          onClick={decrement}
        >
          <span aria-hidden>−</span>
        </button>
        {/* Accessible quantity = a REAL `.sr-only` text node (an aria-label on a roleless span isn't
            reliably exposed); NOT a live region, so it never announces per tap. The visible digit is
            aria-hidden + keyed on qty so it remounts → replays `.mms-pop` (RM-gated) — purely visual. */}
        <span className="mms-qty-val">
          <span className="sr-only">
            {name}, quantity {qty}
          </span>
          <span
            key={qty}
            aria-hidden
            className={shouldAnimate ? "mms-pop" : undefined}
            style={{ display: "inline-block" }}
          >
            {qty}
          </span>
        </span>
        <button
          ref={plusBtnRef}
          type="button"
          className="mms-stepper-btn"
          // Sold-out disables "+" (a now-86'd line can't grow — only shrink via "−"), as does max/lock/settle.
          // NOT the in-flight `busy` — the stepper stays live across writes. Uses the LIVE cart `line.soldOut`
          // (fresher than the page-render menu prop) so a freshly-86'd line can't keep incrementing this session.
          disabled={frozen || liveSoldOut || qty >= MAX_QTY}
          aria-label={
            liveSoldOut
              ? `${name} is sold out`
              : qty >= MAX_QTY
                ? `Maximum ${MAX_QTY} ${name}`
                : reason
                  ? `Add another ${name} — ${reason}`
                  : `Add another ${name}`
          }
          onClick={() => increment(false)}
        >
          <span aria-hidden>+</span>
        </button>
      </span>
    );
  }

  // Default / sold-out state: the Add pill.
  // Sold-out is rendered as a FOCUSABLE `aria-disabled` control (NOT the native `disabled` attribute) for two
  // reasons: (a) the focus-restoration after a sold-out removal can actually land on it — a native-disabled
  // button can't receive focus, which would drop focus to <body> (WCAG 2.4.3); (b) it stays perceivable to AT
  // as "sold out". The truly-transient inert states (no cart / busy / locked) stay NATIVELY disabled (out of
  // the tab order). `inactive` = no add can fire either way; both the gesture + the click are gated on it.
  // Phase 1c — ONE exception: `holdFocus`. When this pill's own create was refused under a freeze (a lock or
  // split refusal applies the frozen view before `add` returns), the pill that comes back is blocked — and a
  // natively-disabled pill cannot take the focus the morph orphaned. So THIS pill, only after its own create
  // settled with focus orphaned or in its row, stays focusable as `aria-disabled` with its reason in its name
  // (the sold-out pattern), until it blurs. The click is still gated on `inactive`.
  const nativeDisabled = blocked && !holdFocus;
  const inactive = blocked || soldOut;
  return (
    <m.button
      ref={addBtnRef}
      type="button"
      disabled={nativeDisabled}
      aria-disabled={soldOut || (blocked && holdFocus) || undefined}
      aria-busy={busy || minting}
      onBlur={() => {
        if (holdFocus) setHoldFocus(false);
      }}
      aria-label={
        soldOut ? `${name}, sold out` : reason ? `${name} — ${reason}` : `Add ${name} to your order`
      }
      // Spring press feedback — reduced-motion-gated; never on an inactive (disabled/sold-out) button.
      whileTap={shouldAnimate && !inactive ? { scale: 0.94 } : undefined}
      // Ripple origin — only while interactive + motion is allowed.
      onPointerDown={shouldAnimate && !inactive ? onPointerDown : undefined}
      // Guard the click: a focusable aria-disabled sold-out pill (and keyboard Enter) must not add.
      onClick={() => {
        if (inactive) return;
        increment(true);
      }}
      // Phase 1a — the v7.2 `.add` round "+": ONE shape for every row's trailing control (the
      // "Choose" twin wears the same class), so the column's right edge no longer zig-zags between
      // "Add" and "Choose" pills. The accessible name still says the verb in full.
      className={soldOut ? undefined : "menu-add-plus"}
      style={{
        position: "relative", // ripple container
        overflow: "hidden", // clip the ripple to the pill
        alignSelf: "center",
        minWidth: 44,
        minHeight: 44,
        padding: soldOut ? "0 16px" : 0,
        borderRadius: 999,
        border: "none",
        fontWeight: "var(--fw-heavy)",
        cursor: inactive ? "default" : "pointer",
        background: soldOut ? "var(--sf)" : "var(--ac)",
        color: soldOut ? "var(--t3)" : "var(--oa)",
        // Keyed on `blocked`, not `nativeDisabled`: a focus-held frozen pill still LOOKS inert.
        opacity: !soldOut && blocked ? 0.6 : 1,
      }}
    >
      {shouldAnimate &&
        ripples.map((r) => (
          <span key={r.id} className="mms-ripple" style={{ left: r.x, top: r.y }} aria-hidden />
        ))}
      {/* Phase 1c — the REVERSAL cue: after a definite non-landing the "+" glyph plays `.mms-settle` (320ms,
          opacity .4→1, 5px drop, no overshoot) — "set back down", not "arrived", so it never invites a
          re-tap the way `.mms-pop`'s 1.18 would. On the GLYPH (a grid item of `.menu-add-plus`), never the
          button, so framer's whileTap transform and the frozen dim are untouched. RM-gated here and in CSS. */}
      <span
        className={revertCue && shouldAnimate ? "mms-settle" : undefined}
        style={{ position: "relative" }}
        aria-hidden={!soldOut || undefined}
      >
        {busy ? "…" : soldOut ? "Sold out" : "+"}
      </span>
    </m.button>
  );
}
