"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { StaffLang } from "@/lib/staff-lang";
import { MsgText, type StaffMsg } from "./StaffMsg";

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
 * each card `announce(msg)`. A card with a provider above it renders its message VISIBLY as an
 * `aria-hidden` echo where the eye is (the menu-2 idiom: the region speaks, the card shows) and says
 * it through the provider; a card with NO provider keeps its own `role="status"`, so the lock screen
 * and every suite that mounts one card alone are unchanged. The region's child is keyed by a counter
 * so the SAME message announced twice is a new node both times — a screen reader speaks a live
 * region on DOM change, and a refusal repeated verbatim is still news.
 *
 * ⚠️ WHAT IS STORED IS THE MESSAGE — a key with its slots, or the server's sentence (`StaffMsg`) —
 * NEVER a rendered node. The first cut stored `<MsgText lang={lang} …/>` built by the card, with
 * the language frozen at announcement time; a language switch is a `router.refresh()`, which keeps
 * this provider's client state, so after a refusal followed by a switch the visible echo beside it
 * re-rendered in the new tongue while the view's ONE accessible region kept the old one (Codex
 * round 2, P2). The page hands the provider the CURRENT language, and the region renders every
 * message against it — the same message descriptor `MsgText` renders in the card.
 *
 * `announce(null)` clears the region. Every write clears before it answers, so a stale line from
 * the other card never reads as the outcome of this one.
 */
export type Announce = (msg: StaffMsg | null) => void;
const ViewStatusContext = createContext<Announce | null>(null);

export function ViewStatusProvider({ lang, children }: { lang: StaffLang; children: ReactNode }) {
  const [said, setSaid] = useState<{ msg: StaffMsg; seq: number } | null>(null);
  const seq = useRef(0);
  const announce = useCallback<Announce>((msg) => {
    seq.current += 1;
    setSaid(msg === null ? null : { msg, seq: seq.current });
  }, []);
  return (
    <ViewStatusContext.Provider value={announce}>
      {children}
      <p role="status" className="sr-only">
        {said && (
          <span key={said.seq}>
            <MsgText lang={lang} msg={said.msg} />
          </span>
        )}
      </p>
    </ViewStatusContext.Provider>
  );
}

/** The view's announcer — or `null` when this card IS the view, which then keeps its own region. */
export function useViewStatus(): Announce | null {
  return useContext(ViewStatusContext);
}
