"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { openRegisterOrder, type OpenRegisterResult } from "@/lib/register";
import { boundWrite } from "@/lib/bounded-write";
import { haptic } from "@/lib/haptics";
import { useTablePane } from "./TablePaneContext";
import {
  CounterMintCtx,
  type CounterMint,
  type MintCallbacks,
  type MintId,
  type MintInput,
  type MintReservation,
} from "./CounterMintContext";

export type {
  CounterMint,
  MintCallbacks,
  MintId,
  MintInput,
  MintNotice,
  MintReservation,
} from "./CounterMintContext";
export { useCounterMint, useOptionalCounterMint } from "./CounterMintContext";

/**
 * Phase 2d · floor — THE ONE MINT LOCK PER SCREEN.
 *
 * The counter screen starts orders from two zones now: the Start zone (Walk-up · Phone order) and
 * the table strip (one tap on a free table). Until this slice the lock lived INSIDE `RegisterStart`,
 * per component instance — so a second control that could start something elsewhere on the screen
 * would not have shared it, and a Walk-up tap and a table tap in the same frame could mint two
 * sessions. §17's machinery is held here ONCE, for every mint control under the provider:
 *
 *   · the in-flight guard is a REF read at TAP time (two taps in one frame both read a stale
 *     `pending === false`; the ref is written synchronously — the doors' shape, `StaffDoors.tsx`);
 *   · `minting` names WHICH control went (walkup · phone · table-N), so `aria-busy` lands on that
 *     one alone while every mint control on the screen is `aria-disabled` (never natively disabled —
 *     a native disable drops focus to <body> mid-tap);
 *   · a LANDED mint holds until the route swap unmounts the screen: a second tap in the beat between
 *     the push and the swap must not start a second order;
 *   · a refusal, or a server action that REJECTS (offline, dropped transport), re-arms — and the
 *     rejection is CAUGHT and said, never thrown to the error boundary over the counter screen;
 *   · the lock is `inFlight`/`minting` ALONE, never `useTransition`'s `pending`: React entangles
 *     every pending async transition, so the expo lane's or the approvals queue's action still in
 *     flight on this page kept a `pending`-read lock held — every start control dimmed and taps
 *     went nowhere for a reason that was not a start;
 *   · Phase 2h (P2fc) — and the start is no TRANSITION at all any more (LEARNINGS #158 · #200): a
 *     transition whose action hangs holds every other transition's `pending` and every router
 *     commit on the tab, so the landing's own `router.push` could not commit. The action is awaited
 *     with a BOUND (`boundWrite`); still out at the bound, the busy start lets go (its spinner, its
 *     "Starting…") and the caller says "no answer yet — it may still start. Don't start it again"
 *     with the reload beside the zone that started it (`waiting`). Its LATE answer still lands: a
 *     late start opens its order exactly as an on-time one would — unless the screen is gone or the
 *     pane moved (then the next poll shows it) — and a late refusal is said;
 *   · Phase 2h (S2 critic D3 · D5) — and until that late answer comes, NO start goes: the copy says
 *     "don't start it again", and a second start would only queue behind the stuck one (Next runs
 *     Server Actions one at a time per tab) and land as a DUPLICATE order the moment the first
 *     answered. So the unanswered start is a latch (`waiting`): every start control stays held, a
 *     tap is refused at the tap (never sent) with the same waiting line, and the reload is the way
 *     out. One start at a time also means a late answer can never land over, or be said under, a
 *     newer start — there is none;
 *   · a start that lands after the screen is GONE (the person opened a table from a card while it
 *     was in flight) does not navigate: the router is global, and a push from an unmounted screen
 *     yanks them off the table they chose. The start still landed; the next poll shows it.
 *   · Phase 2d · review — the same promise at SPLIT width, where nothing unmounts: a card, the
 *     pane's own pick, Back / Forward or ✕ moves the counter pane while the start is out, and the
 *     screen is still here. So the landing compares the pane's selection at TAP time with its
 *     selection NOW — read through a ref kept current by every render (the `pane` in the action's
 *     closure is the render that tapped, so it can never see the move). Moved: no push, no pane
 *     switch, and the lock RE-ARMS — no route swap is coming to release it. The start still
 *     landed; the next poll shows it, exactly as above.
 *   · Phase 2d · Codex round 1 — "moved" is the pane's selection GENERATION as well as its id: a
 *     move that comes back ends on the id it left (A → B → A; the floor → a table → ✕), so an id
 *     compared alone waved the landing through over the pane the person had just worked in. The
 *     generation is new on every pick of another table and every close, and kept by a re-tap of
 *     the table shown — re-tapping it is still not a move.
 *   · Phase 2g · reader — a start no longer looks at the card reader at all. Phase 2d's Codex round
 *     2 held every start (and stood down a landing) while the pane's reader collected, because the
 *     landing's route swap unmounted the collect panel — the poll that holds the payment and records
 *     a counter order's #CODE. That poll lives above navigation now (`ReaderCollectProvider`, the
 *     staff layout), so the landing takes nothing with it, and the hold that stranded a lone cashier
 *     while a guest fumbled a card (P2er · P2es) is retired with the failure it guarded.
 *
 * A rejection is an UNKNOWN outcome, not a failure: the response may have been lost after the
 * server started the order. It is said that way (`floor.mint.unknown`), never "wasn't saved" — if it
 * landed, the next poll shows the table taken or the counter order in the list.
 *
 * ROUTING, once: a new session lands on its add screen; `created:false` means the server CONVERGED
 * on a table someone was already seated at (a diner scanned the sticker between the poll and the
 * tap), so it opens that table's page, never the add screen as if it were new.
 *
 * `useCounterMint` THROWS outside the provider on purpose: a forgotten provider would otherwise
 * split the lock silently, which is the defect this module exists to remove.
 */

/** Where a landed mint goes: a NEW session to its add screen, a converged one to its own page. */
export function mintLanding(sessionId: string, created: boolean): string {
  return created ? `/staff/table/${sessionId}/add` : `/staff/table/${sessionId}`;
}

export function CounterMintProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // ── Phase 2d · split ── the counter's pane (the provider sits OUTSIDE this one).
  const pane = useTablePane();
  // The ref and the state are ONE fact with a synchronous twin: written together, cleared together.
  const inFlight = useRef<MintId | null>(null);
  const [minting, setMinting] = useState<MintId | null>(null);
  // Phase 2h — the start unanswered past the bound: the same ref + state twin (read at the tap,
  // rendered by the zones), set at the bound and cleared when its late answer lands.
  const waitingRef = useRef<MintId | null>(null);
  const [waiting, setWaiting] = useState<MintId | null>(null);
  // Whether the screen that asked is still here when the answer lands. Re-armed at setup, because
  // Strict Mode runs the cleanup once on mount (a cleanup-only latch would read "gone" forever).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isBusy = useCallback(() => inFlight.current !== null, []);
  // Phase 2d · review — the pane as of the LAST commit (docblock): a card tap commits before any
  // server answer lands, so the landing reads the person's current pick, never the tapping render's.
  const paneNow = useRef(pane);
  useLayoutEffect(() => {
    paneNow.current = pane;
  });

  /** A start ADMITTED under `id` (the lock already held — by `run` at the tap, or by a
   *  reservation): ask the server, land, re-arm. `inPane` (a reservation's start) opens a NEW
   *  session in the pane at split width too, never a route off the counter home (correction 6). */
  const startAdmitted = useCallback(
    (
      id: MintId,
      input: MintInput,
      { onStart, onRefusal, onResolved }: MintCallbacks,
      inPane = false,
    ) => {
      // What the pane showed when the person tapped — the landing's "did they move it" baseline.
      const pickedAtTap = paneNow.current?.selectedId ?? null;
      const genAtTap = paneNow.current?.selectionGen ?? 0;
      onStart();
      // A mint is a COMMIT (W22c): the press is its visible half, the order screen the outcome.
      haptic("commit");

      /** Where an ANSWERED start goes. Returns whether the screen is now held for a route swap. */
      const land = (r: OpenRegisterResult): boolean => {
        if (!r.ok) {
          onRefusal(r.error);
          return false;
        }
        // The screen that asked is gone: never navigate from it (docblock).
        // Phase 2d · split — a start that CONVERGED on a seated table opens it where a card tap
        // would: the pane beside the floor at split width (`openSession` says whether it did).
        if (!mounted.current) return true;
        // The screen stayed but the person moved the pane (docblock): never pull them off the
        // table they chose, and hand the lock back — no route swap will unmount this screen.
        const now = paneNow.current;
        if ((now?.selectedId ?? null) !== pickedAtTap || (now?.selectionGen ?? 0) !== genAtTap) {
          return false; // re-armed: they moved the pane while this start was out
        }
        const hint =
          input.kind === "table" ? { counter: false, display: String(input.tableNumber) } : null;
        if ((inPane || !r.created) && hint && pane?.openSession(r.sessionId, hint)) {
          // Re-armed: the screen stays (no route swap will unmount it).
          return false;
        }
        router.push(mintLanding(r.sessionId, r.created));
        return true;
      };

      // Phase 2h (9b) — called OUTSIDE any transition, the RAW action awaited with a bound.
      void (async () => {
        let landed = false;
        try {
          const out = await boundWrite(openRegisterOrder(input));
          if (out.kind === "answer") {
            landed = land(out.value);
            return;
          }
          if (out.kind === "threw") {
            // A server action that REJECTS — offline, or the transport dropped. Caught, so the
            // counter screen is never replaced by the error boundary; said as unknown (docblock).
            console.error("[CounterMint] start failed in transport", out.error);
            onRefusal({ k: "floor.mint.unknown" });
            return;
          }
          // Still out at the bound: it may yet start. Its busy lets go below (the `finally`), and
          // the latch holds every start until the late answer lands (docblock, D3).
          waitingRef.current = id;
          setWaiting(id);
          onRefusal({ k: "floor.mint.waiting" });
          void out.late.then((late) => {
            // 9e — the late answer is APPLIED, never dropped. A screen that is gone navigates
            // nowhere (`land` reads `mounted` itself); its caller's own state is a no-op by then.
            waitingRef.current = null;
            setWaiting(null);
            if (late.kind === "threw") {
              onRefusal({ k: "floor.mint.unknown" });
              return;
            }
            if (!late.value.ok) {
              onRefusal(late.value.error);
              return;
            }
            onResolved?.();
            // Held exactly like an on-time landing; handed back if it did not leave the screen.
            inFlight.current = id;
            setMinting(id);
            if (!land(late.value)) {
              inFlight.current = null;
              setMinting(null);
            }
          });
        } finally {
          // Re-armed on a refusal, a throw or the bound. A landed mint keeps the screen held until
          // the route swap unmounts it — releasing here re-armed every start for the beat of the swap.
          if (!landed) {
            inFlight.current = null;
            setMinting(null);
          }
        }
      })();
    },
    [router, pane],
  );

  const run = useCallback(
    (id: MintId, input: MintInput, to: MintCallbacks) => {
      if (inFlight.current !== null) return;
      // Phase 2h (D3) — a start still unanswered past the bound holds every other (docblock):
      // refused AT THE TAP, never sent, and said with the same waiting line.
      if (waitingRef.current !== null) {
        to.onRefusal({ k: "floor.mint.waiting" });
        return;
      }
      inFlight.current = id;
      setMinting(id);
      startAdmitted(id, input, to);
    },
    [startAdmitted],
  );

  const reserve = useCallback(
    (id: MintId): MintReservation | null => {
      // Correction 5 — the hold checked FIRST: any start in flight, landed or unanswered refuses.
      if (inFlight.current !== null || waitingRef.current !== null) return null;
      // Correction 9 — taken NOW, so no Walk-up or table start can slip in before the clear answers.
      inFlight.current = id;
      setMinting(id);
      let spent = false;
      return {
        go: (input, to) => {
          if (spent) return;
          spent = true;
          startAdmitted(id, input, to, true);
        },
        release: () => {
          if (spent) return;
          spent = true;
          if (inFlight.current === id) {
            inFlight.current = null;
            setMinting(null);
          }
        },
      };
    },
    [startAdmitted],
  );

  const value: CounterMint = {
    minting,
    held: minting !== null,
    startHeld: minting !== null || waiting !== null,
    waiting,
    isBusy,
    run,
    reserve,
  };
  return <CounterMintCtx.Provider value={value}>{children}</CounterMintCtx.Provider>;
}
