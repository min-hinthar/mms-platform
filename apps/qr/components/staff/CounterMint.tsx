"use client";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { openRegisterOrder } from "@/lib/register";
import { haptic } from "@/lib/haptics";
import type { StaffKey } from "@/lib/i18n/staff";

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
 *     rejection is CAUGHT and said, never thrown to the error boundary over the counter screen.
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
  /** Start one order. A no-op while another is in flight or has landed. */
  run: (id: MintId, input: MintInput, onRefusal: (n: MintNotice) => void) => void;
};

const Ctx = createContext<CounterMint | null>(null);

/** Where a landed mint goes: a NEW session to its add screen, a converged one to its own page. */
export function mintLanding(sessionId: string, created: boolean): string {
  return created ? `/staff/table/${sessionId}/add` : `/staff/table/${sessionId}`;
}

export function CounterMintProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The ref and the state are ONE fact with a synchronous twin: written together, cleared together.
  const inFlight = useRef<MintId | null>(null);
  const [minting, setMinting] = useState<MintId | null>(null);

  const isBusy = useCallback(() => pending || inFlight.current !== null, [pending]);

  const run = useCallback(
    (id: MintId, input: MintInput, onRefusal: (n: MintNotice) => void) => {
      if (pending || inFlight.current !== null) return;
      inFlight.current = id;
      setMinting(id);
      // A mint is a COMMIT (W22c): the press is its visible half, the order screen the outcome.
      haptic("commit");
      startTransition(async () => {
        let landed = false;
        try {
          const r = await openRegisterOrder(input);
          if (!r.ok) {
            onRefusal(r.error);
            return;
          }
          router.push(mintLanding(r.sessionId, r.created));
          landed = true;
        } catch (e) {
          // A server action that REJECTS — offline, or the transport dropped. Caught, so the counter
          // screen is never replaced by the error boundary; said as unknown (docblock).
          console.error("[CounterMint] start failed in transport", e);
          onRefusal({ k: "floor.mint.unknown" });
        } finally {
          // Re-armed on a refusal or a throw only. A landed mint keeps the screen held until the
          // route swap unmounts it — releasing here re-armed every start for the beat of the swap.
          if (!landed) {
            inFlight.current = null;
            setMinting(null);
          }
        }
      });
    },
    [pending, router],
  );

  const value: CounterMint = { minting, held: pending || minting !== null, isBusy, run };
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
