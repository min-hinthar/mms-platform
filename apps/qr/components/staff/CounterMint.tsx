"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { openRegisterOrder, type OpenRegisterResult } from "@/lib/register";
import { boundWrite } from "@/lib/bounded-write";
import { haptic } from "@/lib/haptics";
import type { StaffKey } from "@/lib/i18n/staff";
import { useTablePane } from "./TablePaneContext";

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
 *     with a BOUND (`boundWrite`); still out at the bound, the lock RE-ARMS and the caller says "no
 *     answer yet — it may still start" with the reload. Its LATE answer still lands: a late start
 *     opens its order exactly as an on-time one would — unless the screen is gone, the pane moved,
 *     or a newer start holds the lock (then the next poll shows it) — and a late refusal is said;
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
export type MintId = "walkup" | "phone" | `table-${number}`;

export type MintInput =
  | { kind: "walkup" }
  | { kind: "phone"; customerName?: string }
  | { kind: "table"; tableNumber: number };

/** What a refused or unanswered mint says, and who authored it: a dictionary key (<Chrome>), or a
 *  server sentence (<OutageText>, which swaps the one twin that exists). Structurally `StaffMsg`. */
export type MintNotice = { k: StaffKey } | string;

type CounterMint = {
  /** Which control is minting (or has landed and is waiting on the route swap), or null. */
  minting: MintId | null;
  /** Every mint control on the screen says `aria-disabled` while this is true. */
  held: boolean;
  /** The tap-time guard. Read it in a handler, never in render. */
  isBusy: () => boolean;
  /** Start one order — the ONE place a start is admitted: a no-op while another start is in flight
   *  or has landed. `onStart` runs only for a start that goes, BEFORE the server is asked, so a
   *  caller's "a new tap" work (clearing its notice) can never erase that start's own answer. */
  run: (id: MintId, input: MintInput, to: MintCallbacks) => void;
};

export type MintCallbacks = {
  /** The start was admitted (and nothing has been said about it yet). */
  onStart: () => void;
  /** The start was refused, or its answer never came — say this in the caller's region. */
  onRefusal: (n: MintNotice) => void;
};

const Ctx = createContext<CounterMint | null>(null);

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

  const run = useCallback(
    (id: MintId, input: MintInput, { onStart, onRefusal }: MintCallbacks) => {
      if (inFlight.current !== null) return;
      inFlight.current = id;
      setMinting(id);
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
        if (!r.created && hint && pane?.openSession(r.sessionId, hint)) {
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
          // Still out at the bound: it may yet start. The lock re-arms below (the `finally`).
          onRefusal({ k: "floor.mint.waiting" });
          void out.late.then((late) => {
            // 9e — the late answer is APPLIED, never dropped. A screen that is gone navigates
            // nowhere (`land` reads `mounted` itself); its caller's own state is a no-op by then.
            if (late.kind === "threw") {
              onRefusal({ k: "floor.mint.unknown" });
              return;
            }
            if (!late.value.ok) {
              onRefusal(late.value.error);
              return;
            }
            // A newer start holds the screen: this one is not pushed over it (the poll shows it).
            if (isBusy()) return;
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
    [router, pane, isBusy],
  );

  const value: CounterMint = { minting, held: minting !== null, isBusy, run };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCounterMint(): CounterMint {
  const v = useContext(Ctx);
  if (v === null)
    throw new Error(
      "useCounterMint outside <CounterMintProvider> — every mint control on a screen must share one lock",
    );
  return v;
}
