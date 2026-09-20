"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@mms/ui";
import { lockConsole } from "@/lib/staff-pin-actions";
import { haptic } from "@/lib/haptics";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import type { StaffLang } from "@/lib/staff-lang";

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
 */
export function LockButton({ lang }: { lang: StaffLang }) {
  const router = useRouter();
  // The in-flight guard is a REF (§17, LEARNINGS #126): two taps in one frame both read the same
  // stale render, so a state flag alone lets the second one post. The state beside it only says
  // `aria-busy` and swaps the spoken name.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StaffMsg | null>(null);
  async function lock() {
    if (inFlight.current) return; // re-entry is refused HERE, never by `disabled` (see below)
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    haptic("commit");
    let res: Awaited<ReturnType<typeof lockConsole>>;
    try {
      res = await lockConsole();
    } catch (e) {
      // A rejected Server Action never reached the cookie write, so the lost-connection shape IS
      // the outage sentence — and the latch must release, or the circle is dead until a reload.
      console.error("[lock] lockConsole rejected", e);
      inFlight.current = false;
      setBusy(false);
      setErr({ k: "shell.lock.err.outage" });
      return;
    }
    if (!res.ok) {
      inFlight.current = false;
      setBusy(false);
      // `auth`: the session behind this tablet is gone. The page re-gates to the sign-in form, which
      // is the honest screen for it (SignedInCard's rule) — nothing to explain from a bar circle.
      if (res.reason === "auth") {
        router.refresh();
        return;
      }
      setErr({ k: res.reason === "no_pin" ? "shell.lock.err.noPin" : "shell.lock.err.outage" });
      return;
    }
    // Stays busy through the navigation: the lock screen replaces this bar.
    router.replace("/staff/lock");
    router.refresh();
  }
  return (
    <>
      {/* NEVER native `disabled` while busy: disabling the button that was just tapped drops focus
          to <body> in a real browser (StaffLangSwitch's measured rule), so the busy name below would
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
      {/* `role="alert"`: the tail's assertive channel, the same one the language switch's failure
          uses — a lock that did not happen is news the person is waiting on. */}
      {err && (
        <span role="alert" className="staff-bar-msg">
          <MsgText lang={lang} msg={err} />
        </span>
      )}
    </>
  );
}
