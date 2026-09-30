"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setStaffLang, type SetStaffLangResult } from "@/lib/staff-lang-actions";
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

/**
 * The newest language write this TAB has issued, across every host — module scope, because the
 * Profile's card and the Help sheet are separate hook instances feeding ONE router queue, which
 * sends them in order (see `useLangModeWrite`). A write that is not the newest never reconciles.
 */
let lastWrite = 0;

export type LangModeWrite = {
  /** The mode the cap shows: the latest pick while a write is out, else the provider's. */
  shown: StaffLangMode;
  /** A write is in flight — the group says `aria-busy`, the pending row dims. Never a Sheet's busy. */
  busy: boolean;
  /** The last chain ended short of the person's wish — the host renders the failure line. */
  alert: boolean;
  /** Take a pick. A function is resolved against the chain's BASE — the mode confirmed when the
   *  chain began (between chains, the confirmed mode now): the pill's rule, which a confirmed value
   *  moving mid-chain must not bend. */
  choose: (next: StaffLangMode | ((base: StaffLangMode) => StaffLangMode)) => LangTap;
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
 * A WRITE THE TIMEOUT GAVE UP ON CAN STILL LAND (review C1), and the chain answers it when it does.
 * Measured in the installed Next (16.2.9), not inferred:
 *   · a Server Action cannot be cancelled, and Next sends them ONE AT A TIME, in order — every call
 *     goes through the router's single action queue (`next/dist/client/app-call-server.js` →
 *     `dispatchAction` in `next/dist/client/components/app-router-instance.js`, which appends any
 *     non-navigation action behind the pending one and starts it only when that one settles);
 *   · a cookie write marks the action's path revalidated (`MutableRequestCookiesAdapter` in
 *     `next/dist/server/web/spec-extension/adapters/request-cookies.js`), so the action's OWN response
 *     carries the page re-rendered with the new cookie, and the client commits it on arrival
 *     (`next/dist/client/components/router-reducer/reducers/server-action-reducer.js`) — whether or
 *     not anyone still awaits it. A late English write turns the console English the moment it lands.
 * So the abandoned call is KEPT, and when it settles (`settleLate`): a newer write (from any host on
 * this tab — `lastWrite` is module scope) lands after it and decides; a refusal changed nothing;
 * otherwise the server now holds what it carried — if that is the person's latest pick the failure
 * line is no longer true and goes, and if they have moved on since, the chain writes their pick
 * again. The last pick is what the cookie ends on, or the line says it is not.
 *
 * STATED LIMITS. A NAVIGATION discards the pending action and lets the queue run on while its fetch
 * is still out, so a write issued after one can land BEFORE it — that reorder is not reconciled. And
 * a fetch that never settles holds EVERY later Server Action on the tab behind it (a Next property,
 * not this hook's) until a navigation discards it: "tap again" is queued, not refused, and goes out
 * the moment the hung one settles.
 */
export function useLangModeWrite({
  onSettled,
}: { onSettled?: (settled: LangSettled) => void } = {}): LangModeWrite {
  const router = useRouter();
  const mode = useStaffLangMode();
  // Tap-time state lives in REFS: the latch, the latest pick, and what the server is KNOWN to hold.
  const inFlight = useRef(false);
  // The person's latest pick — KEPT after the chain ends: a write the timeout abandoned is judged
  // against it when it lands.
  const intent = useRef<StaffLangMode | null>(null);
  const confirmed = useRef(mode);
  // The mode confirmed when the chain began: a function pick (the pill) resolves against it, so a
  // write landing mid-chain cannot turn a repeated tap into a different mode (review C2).
  const base = useRef(mode);
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

  // `learned`: the chain starts from a mode a late write just LANDED (`settleLate`) — known, so
  // never overwritten by the provider's word, which has not caught up with it yet.
  async function drain(learned = false) {
    inFlight.current = true;
    setBusy(true);
    let wrote = false;
    let failed = false;
    let target: StaffLangMode | null;
    while ((target = nextLangWrite(intent.current, confirmed.current)) !== null) {
      const id = ++lastWrite;
      const call = setStaffLang({ mode: target });
      let res: SetStaffLangResult;
      try {
        res = await raceTimeout(call);
      } catch (e) {
        // A rejection (offline, a retired action id) or the 15 s hang: nothing was confirmed. Said
        // by the host's failure line — never thrown, which would take the whole board down.
        console.error("[lang] setStaffLang rejected or hung", e);
        failed = true;
        // The hang is still out and can land (see the docblock): answered when it settles. A real
        // rejection settles the same way, into the no-op.
        call.then(
          (late) => settleLate(late, id),
          () => {},
        );
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
    if (!wrote && !learned) confirmed.current = provider.current;
    const out = langChainOutcome({
      wanted: intent.current ?? confirmed.current,
      confirmed: confirmed.current,
      wrote,
      failed,
    });
    inFlight.current = false;
    setBusy(false);
    setPick(out.cap);
    setAlert(out.alert);
    // The cookie is httpOnly: the new mode arrives only by re-rendering on the server. On Next 16.2.9
    // the action's own response already carries that render (see the docblock), so this refresh is
    // a second one — kept as the chain's single, testable "the page re-reads now" signal.
    if (out.refresh) router.refresh();
    onSettled?.({ wrote, alert: out.alert, confirmed: confirmed.current });
  }

  /**
   * A write the timeout abandoned has settled. It decides only if it is still the NEWEST write on
   * this tab (Next sends a later one after it) and it landed; then the server holds what it carried.
   */
  function settleLate(late: SetStaffLangResult, id: number) {
    if (!late.ok || id !== lastWrite) return;
    confirmed.current = late.mode;
    if (late.mode !== intent.current) {
      // It landed a mode the person has since left: their latest pick goes out again, the cap on it.
      setPick(intent.current);
      void drain(true);
      return;
    }
    // It carried the latest pick after all: "Couldn't save that" is no longer true.
    setAlert(false);
    setPick(late.mode);
    router.refresh();
    onSettled?.({ wrote: true, alert: false, confirmed: late.mode });
  }

  function choose(next: StaffLangMode | ((base: StaffLangMode) => StaffLangMode)): LangTap {
    const target =
      typeof next === "function" ? next(inFlight.current ? base.current : confirmed.current) : next;
    if (inFlight.current && target === intent.current) return "same-pending";
    if (!inFlight.current && target === confirmed.current) {
      // The person has accepted the mode the server holds: an earlier failure line is answered, and
      // this is now the pick a late landing is judged against.
      intent.current = target;
      setAlert(false);
      return "same-confirmed";
    }
    haptic("pick"); // a reversible choice — the cap moving below is the visible half (§12)
    setAlert(false);
    intent.current = target;
    setPick(target);
    if (!inFlight.current) {
      base.current = confirmed.current;
      void drain();
    }
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
