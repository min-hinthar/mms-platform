"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setStaffLang } from "@/lib/staff-lang-actions";
import { langChainOutcome, nextLangWrite, type StaffLangMode } from "@/lib/staff-lang";
import { raceTimeout } from "@/lib/staff-outage";
import { haptic } from "@/lib/haptics";
import { useStaffLangMode } from "./StaffLangProvider";

/**
 * What a tap on a language control did:
 *   · `"same-confirmed"` — the mode the server already holds, nothing in flight: no write, no buzz
 *     (an earlier failure line is cleared — the person accepted what is set). The Help sheet closes
 *     on it (like its size rows); the Profile does nothing more.
 *   · `"same-pending"`   — the mode a write is ALREADY carrying: no write, no buzz, and never a
 *     reason to close anything — its outcome has not landed yet.
 *   · `"wrote"`          — anything else: the buzz, the cap moves, and the chain writes it.
 */
export type LangTap = "same-confirmed" | "same-pending" | "wrote";

export type LangSettled = { wrote: boolean; alert: boolean; confirmed: StaffLangMode };

export type LangModeWrite = {
  /** The mode the cap shows: the latest pick while a write is out, else the provider's. */
  shown: StaffLangMode;
  /** A write is in flight — the group says `aria-busy`, the pending row dims. Never a Sheet's busy. */
  busy: boolean;
  /** The last chain ended short of the person's wish — the host renders the failure line. */
  alert: boolean;
  /** Take a pick. A function is resolved against the CONFIRMED mode at tap time (the pill's rule). */
  choose: (next: StaffLangMode | ((confirmed: StaffLangMode) => StaffLangMode)) => LangTap;
  clearAlert: () => void;
};

/**
 * P2e — ONE write chain for every language control (the front doors' pill, the Help sheet's rows,
 * the Profile's card), owned by the HOST so a view swap or a sheet close cannot kill a write in
 * flight (the `useStaffSend` rule). It is 2a's specified hardening, built here because it never
 * reached disk before this phase:
 *
 *   · THE IN-FLIGHT GUARD IS A REF read at tap time (LEARNINGS #126) — two taps inside one frame
 *     both read the same stale render, so a state flag lets both post.
 *   · LATEST PICK WINS, SERIALIZED (§4.2). A tap while a write is out only replaces the INTENT; after
 *     each write `nextLangWrite(intent, confirmed)` decides whether another is needed. A brushed
 *     "English" corrected at once writes en then the correction and refreshes ONCE, at the end.
 *   · THE CAP MOVES AT THE TAP (§4.1 — a preference, not an amount) and snaps back to CONFIRMED on
 *     every failure path (§4.4): `langChainOutcome` decides the cap, the line and the refresh.
 *   · EVERY WRITE IS `raceTimeout(…, 15 000)` INSIDE try/catch. A refusal, a rejection (a network
 *     drop, a Server Action id a deploy retired) and a hang all end the chain the same way — nothing
 *     reaches the error boundary, which an `await` inside an async transition would (React 19
 *     rethrows a transition's throw). No `useTransition` here, LockButton's shape.
 *   · ONE `router.refresh()`, and only when the cookie changed: an offline refresh is a request the
 *     tablet cannot make. `refresh()` keeps the DOM, so focus stays on the tapped control.
 *
 * ⚠️ NEVER A REASON TO MARK A SHEET `busy` (sheet.tsx M82): a display preference that reverts to
 * confirmed is not an irreversible write, and a hung write must never trap the kitchen behind a
 * modal for fifteen seconds. The host owns the hook, so closing the sheet never cancels the write.
 *
 * STATED LIMIT (timeout honesty): `raceTimeout` cannot cancel a Server Action, so a write that
 * lands after 15 s changes the cookie while the line said "Couldn't save that" — the next
 * navigation shows the mode the person picked, which is the direction they asked for.
 */
export function useLangModeWrite({
  onSettled,
}: { onSettled?: (settled: LangSettled) => void } = {}): LangModeWrite {
  const router = useRouter();
  const mode = useStaffLangMode();
  // Tap-time state lives in REFS: the latch, the latest pick, and what the server is KNOWN to hold.
  const inFlight = useRef(false);
  const intent = useRef<StaffLangMode | null>(null);
  const confirmed = useRef(mode);
  // The provider's latest word, whatever is in flight (read when a chain ends having written nothing).
  const provider = useRef(mode);
  const [pick, setPick] = useState<StaffLangMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(false);

  // The pick YIELDS to the server: when the provider's mode changes (the refresh landed, or another
  // tab wrote the cookie), the local cap is dropped during render — the store-previous-prop pattern,
  // never a setState in an effect. But only BETWEEN chains: a refresh from an EARLIER write can land
  // while a newer one is out (write English, then pick Burmese only before English's refresh
  // arrives), and dropping the cap then moved the tick back to a mode the person had already left.
  // Mid-chain the pick is the person's latest wish; the chain's end sets the cap itself.
  const [seen, setSeen] = useState(mode);
  if (seen !== mode) {
    setSeen(mode);
    if (!busy) setPick(null);
  }
  // The same rule for what the server is KNOWN to hold: mid-chain, `confirmed` is what THIS chain's
  // writes returned — newer than any refresh that lands during it — so the provider is adopted only
  // between chains. STATED LIMIT: a stale refresh that lands AFTER a chain ended and before that
  // chain's own refresh is adopted for that moment (the tick shows the older mode until the last
  // refresh lands, and a tap in between is judged against it — at worst one redundant write).
  useEffect(() => {
    provider.current = mode;
    if (!inFlight.current) confirmed.current = mode;
  }, [mode]);

  async function drain() {
    inFlight.current = true;
    setBusy(true);
    let wrote = false;
    let failed = false;
    let target: StaffLangMode | null;
    while ((target = nextLangWrite(intent.current, confirmed.current)) !== null) {
      let res: Awaited<ReturnType<typeof setStaffLang>>;
      try {
        res = await raceTimeout(setStaffLang({ mode: target }));
      } catch (e) {
        // A rejection (offline, a retired action id) or the 15 s hang: nothing was confirmed. Said
        // by the host's failure line — never thrown, which would take the whole board down.
        console.error("[lang] setStaffLang rejected or hung", e);
        failed = true;
        break;
      }
      if (!res.ok) {
        failed = true;
        break;
      }
      confirmed.current = res.mode;
      wrote = true;
    }
    // A chain that wrote nothing learned nothing new: what the server holds is the provider's latest
    // word, including a change that landed mid-chain (another tab) and was held off above.
    if (!wrote) confirmed.current = provider.current;
    const out = langChainOutcome({
      wanted: intent.current ?? confirmed.current,
      confirmed: confirmed.current,
      wrote,
      failed,
    });
    intent.current = null;
    inFlight.current = false;
    setBusy(false);
    setPick(out.cap);
    setAlert(out.alert);
    // The cookie is httpOnly: the new mode arrives only by re-rendering on the server.
    if (out.refresh) router.refresh();
    onSettled?.({ wrote, alert: out.alert, confirmed: confirmed.current });
  }

  function choose(next: StaffLangMode | ((confirmed: StaffLangMode) => StaffLangMode)): LangTap {
    const target = typeof next === "function" ? next(confirmed.current) : next;
    if (inFlight.current && target === intent.current) return "same-pending";
    if (!inFlight.current && target === confirmed.current) {
      // The person has accepted the mode the server holds: an earlier failure line is answered.
      setAlert(false);
      return "same-confirmed";
    }
    haptic("pick"); // a reversible choice — the cap moving below is the visible half (§12)
    setAlert(false);
    intent.current = target;
    setPick(target);
    if (!inFlight.current) void drain();
    return "wrote";
  }

  return {
    shown: pick ?? mode,
    busy,
    alert,
    choose,
    clearAlert: () => setAlert(false),
  };
}
