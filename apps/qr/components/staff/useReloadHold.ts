"use client";
import { useLayoutEffect } from "react";
import { holdReload, type HoldInput, type HoldKind, type HoldReasonOf } from "@/lib/reload-guard";

/**
 * Phase 2i (P2bi) — register a reload hold while `active`. `useLayoutEffect`, not `useEffect`: the
 * hold must be in the register BEFORE the browser can deliver the next event, so a tap on "Reload
 * the page" right after an Undo bar appears already meets it (the TerminalSettle `onLive`
 * precedent). Each setup registers its own token and its cleanup releases exactly that token, so
 * Strict Mode's setup → cleanup → setup and any dependency change leave one hold, never zero and
 * never two.
 */
export function useReloadHold<K extends HoldKind>(
  kind: K,
  reason: HoldReasonOf[K],
  subject: string,
  active: boolean,
  survives = false,
): void {
  useLayoutEffect(() => {
    if (!active) return;
    // The pairing is proved at the call (`K` ties `reason` to `kind`); TS cannot follow a generic
    // into the union, so it is restated once here.
    return holdReload({ kind, reason, subject, survives } as HoldInput);
  }, [kind, reason, subject, active, survives]);
}
