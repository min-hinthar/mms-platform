"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TOAST_LEAVE_MS } from "@mms/ui";
import { admitNotice, purgesDeferred } from "@/lib/notice-slot";
import type { PadMsg, PadNotice } from "@/lib/pad-errors";

/**
 * Phase 2c · pad — the order pad's ONE live region: the `@mms/ui` Toast, arbitrated by the diner's
 * notice slot (`lib/notice-slot.ts`, Phase 1c) — the same machine `TableCartProvider` runs, reused
 * unchanged. A claim never erases a correction; two dishes refused for one cause become the family
 * sentence; five identical refusals are one sentence, extended; the deferred slot is one deep.
 *
 * Windows: a correction is DRAWN for 8s (it names a dish that did not go on — read it), news for
 * 3s, a claim for 3s (a quiet claim is spoken, drawn nowhere). Each shown notice gets a monotonic
 * key, so a repeated sentence re-announces (keyed on text it would not).
 */
const WINDOW_MS: Record<PadNotice["kind"], number> = { correction: 8000, news: 3000, claim: 3000 };

export type ShownNotice = { seq: number; msg: PadMsg; quiet: boolean };

export function usePadNotices() {
  const [shown, setShown] = useState<ShownNotice | null>(null);
  const [leaving, setLeaving] = useState(false);
  const showingRef = useRef<(PadNotice & { seq: number }) | null>(null);
  const deferredRef = useRef<PadNotice | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((incoming: PadNotice) => {
    // Put a notice in the slot and run its window; the next deferred one follows when it ends.
    function display(n: PadNotice, keepSeq: boolean, generalize: boolean) {
      if (timer.current) clearTimeout(timer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      const current = showingRef.current;
      const s = keepSeq && current ? current.seq : (seq.current += 1);
      const msg = generalize && n.familyMsg ? n.familyMsg : n.msg;
      const slot = generalize && n.family ? { ...n, text: n.family.text, my: n.family.my } : n;
      showingRef.current = { ...slot, seq: s };
      setLeaving(false);
      setShown({ seq: s, msg, quiet: n.quiet });
      timer.current = setTimeout(() => {
        const next = deferredRef.current;
        if (next) {
          deferredRef.current = null;
          display(next, false, false);
          return;
        }
        showingRef.current = null;
        setLeaving(true);
        exitTimer.current = setTimeout(() => {
          setShown(null);
          setLeaving(false);
        }, TOAST_LEAVE_MS + 80);
      }, WINDOW_MS[n.kind]);
    }

    const waiting = deferredRef.current;
    if (waiting && purgesDeferred(incoming, waiting)) deferredRef.current = null;
    const verdict = admitNotice(showingRef.current, incoming);
    if (verdict === "defer") {
      deferredRef.current = incoming;
      return;
    }
    display(incoming, verdict === "extend", verdict === "generalize");
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  return { shown, leaving, notify };
}
