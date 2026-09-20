"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * signin (verifier) — ONE polite live region for a VIEW composed of more than one card.
 *
 * The signed-in state of `/staff/login` renders `SignedInCard` and, for a manager, `TeamManager`
 * in one column, and each carried "the one region for this view" — true before A4·4 folded the
 * profile into the sign-in screen, false since. Two polite regions flip together: a refusal on the
 * roster and a PIN outcome above it are two announcements racing for one channel (QA §A, §7: one
 * per view).
 *
 * The provider owns the region — sr-only, `role="status"`, at the END of the column — and hands
 * each card `announce(node)`. A card with a provider above it renders its message VISIBLY as an
 * `aria-hidden` echo where the eye is (the menu-2 idiom: the region speaks, the card shows) and says
 * it through the provider; a card with NO provider keeps its own `role="status"`, so the lock screen
 * and every suite that mounts one card alone are unchanged. The region's child is keyed by a counter
 * so the SAME text announced twice is a new node both times — a screen reader speaks a live region
 * on DOM change, and a refusal repeated verbatim is still news.
 *
 * `announce(null)` clears the region. Every write clears before it answers, so a stale line from
 * the other card never reads as the outcome of this one.
 */
export type Announce = (node: ReactNode) => void;
const ViewStatusContext = createContext<Announce | null>(null);

export function ViewStatusProvider({ children }: { children: ReactNode }) {
  const [said, setSaid] = useState<{ node: ReactNode; seq: number } | null>(null);
  const seq = useRef(0);
  const announce = useCallback<Announce>((node) => {
    seq.current += 1;
    setSaid(node === null || node === undefined ? null : { node, seq: seq.current });
  }, []);
  return (
    <ViewStatusContext.Provider value={announce}>
      {children}
      <p role="status" className="sr-only">
        {said && <span key={said.seq}>{said.node}</span>}
      </p>
    </ViewStatusContext.Provider>
  );
}

/** The view's announcer — or `null` when this card IS the view, which then keeps its own region. */
export function useViewStatus(): Announce | null {
  return useContext(ViewStatusContext);
}
