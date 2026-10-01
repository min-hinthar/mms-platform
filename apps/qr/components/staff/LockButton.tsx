"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@mms/ui";
import { lockConsole } from "@/lib/staff-pin-actions";
import { boundWrite } from "@/lib/bounded-write";
import { haptic } from "@/lib/haptics";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import type { StaffLang } from "@/lib/staff-lang";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

/**
 * Lock the shared tablet (S1.1b). Sets the device-local lock (server action, httpOnly cookie) and sends
 * the staff member to the PIN screen. Only rendered when a PIN is set (lockConsole also refuses without
 * one) — locking with no PIN would strand the device behind an unenterable screen.
 *
 * P7·1b — a 44px CIRCLE in the staff bar's trailing slot, last, on every page: the thing you do on
 * the way out sits where iOS puts it. Icon-only to the eye; the NAME is sr-only dictionary text
 * rendered through <Chrome> (marked Burmese, never an aria-label on a control with children — rule
 * 3), and the busy state is spoken through the same name, so a circle that changed nothing visible
 * still tells assistive tech what it is doing.
 *
 * signin-3 · chrome-1 — the refusal is a KEY, not the server's sentence (the action answers reason
 * codes now, like `setPin`), rendered through `<MsgText>` so it is Burmese under the Burmese switch;
 * and it sits BENEATH the tail's row (`.staff-bar-msg`: full width, ordered last), never between two
 * circles a person is mid-tap on — the old fragment sibling reflowed the utilities under the thumb.
 * The circle wears the press idiom like every other bar circle and buzzes a COMMIT: a lock is the
 * tablet being handed off, and the visible half is the press plus the lock screen that follows.
 *
 * Phase 2h (decision 9g) — the lock is awaited with a BOUND (`boundWrite`). A hung `lockConsole` kept
 * the circle busy forever while the tablet stayed OPEN — the one fact that matters on a shared device.
 * At the bound the circle frees and says so ("no answer yet — this tablet may not be locked; reload
 * before you leave it"); a lost answer says "couldn't confirm", never the sign-in service's outage
 * (a throw can lose the response after the lock cookie landed). Both offer the reload beside the
 * line. The late answer still lands: a late lock goes to the lock screen.
 */
export function LockButton({ lang }: { lang: StaffLang }) {
  const router = useRouter();
  // The in-flight guard is a REF (§17, LEARNINGS #126): two taps in one frame both read the same
  // stale render, so a state flag alone lets the second one post. The state beside it only says
  // `aria-busy` and swaps the spoken name.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StaffMsg | null>(null);
  // Phase 2h — whether the line offers the reload (both unanswered lines say "reload the page").
  const [reload, setReload] = useState(false);

  /** The lock's answer, whenever it lands. Returns whether the tablet is leaving for the lock. */
  function land(res: Awaited<ReturnType<typeof lockConsole>>): boolean {
    setReload(false);
    if (!res.ok) {
      // `auth`: the session behind this tablet is gone. The page re-gates to the sign-in form, which
      // is the honest screen for it (SignedInCard's rule) — nothing to explain from a bar circle.
      if (res.reason === "auth") {
        router.refresh();
        return false;
      }
      setErr({ k: res.reason === "no_pin" ? "shell.lock.err.noPin" : "shell.lock.err.outage" });
      return false;
    }
    setErr(null);
    // Stays busy through the navigation: the lock screen replaces this bar.
    router.replace("/staff/lock");
    router.refresh();
    return true;
  }

  async function lock() {
    if (inFlight.current) return; // re-entry is refused HERE, never by `disabled` (see below)
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    setReload(false);
    haptic("commit");
    let leaving = false;
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(lockConsole());
      if (out.kind === "answer") {
        leaving = land(out.value);
        return;
      }
      setReload(true);
      if (out.kind === "threw") {
        // The answer was lost — and the lock cookie rides the response's headers, which can land
        // before the body is cut: "couldn't confirm", never the sign-in service's outage (critic F10).
        console.error("[lock] lockConsole rejected", out.error);
        setErr({ k: "shell.lock.unknown" });
        return;
      }
      setErr({ k: "shell.lock.waiting" });
      // A late lock LANDS wherever the person is now: the cookie is set, so the tablet IS locked
      // and the lock screen is the true one (this bar may be another page's by then).
      void out.late.then((late) => {
        if (late.kind === "answer") land(late.value);
        else setErr({ k: "shell.lock.unknown" });
      });
    } finally {
      // Frees AT THE BOUND (fact 3) — the latch must release, or the circle is dead until a reload.
      if (!leaving) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <>
      {/* NEVER native `disabled` while busy: disabling the button that was just tapped drops focus
          to <body> in a real browser (the language switch's measured rule), so the busy name below would
          be spoken from a node nobody is on and a failure's alert would fire with the place lost.
          `aria-disabled` states it; the handler refuses re-entry. */}
      <button
        type="button"
        className="staff-circ staff-press"
        onClick={lock}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
      >
        {/* Decorative lock glyph — the sr-only text carries the meaning. */}
        <Icon name="lock" size={20} />
        <span className="sr-only">
          <Chrome lang={lang} k={busy ? "shell.locking" : "shell.lock"} />
        </span>
      </button>
      {/* `role="alert"`: the tail's assertive channel, the same one the front doors' language pill
          uses for its failure — a lock that did not happen is news the person is waiting on. P2e:
          the Lock REFUSES re-entry (a lock is not a choice you correct mid-flight); the language
          controls never refuse — the latest pick wins. */}
      {err && (
        <span role="alert" className="staff-bar-msg">
          <MsgText lang={lang} msg={err} />
        </span>
      )}
      {/* Phase 2h — both unanswered lines say "reload the page", and the console is installed
          standalone (no browser reload): the reload sits on its own row BENEATH the alert — the
          tail's message slot (`.staff-bar-msg`: full width, ordered last) — never inside it. */}
      {err && reload && (
        <span className="staff-bar-msg">
          <ReloadButton lang={lang} />
        </span>
      )}
    </>
  );
}
