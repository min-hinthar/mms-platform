"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { unlockConsole, type UnlockResult } from "@/lib/staff-pin-actions";
import { boundWrite } from "@/lib/bounded-write";
import { isRetryableAuthShape, raceTimeout } from "@/lib/staff-outage";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/limits";
import { plural } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { secondsUntil, useLockout } from "./ManagerPinStepUp";
import { MsgText, type StaffMsg } from "./StaffMsg";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

/**
 * Shared-tablet unlock (S1.1b) — the SAME staff member who locked re-enters their PIN to resume. The
 * verify + lockout are entirely server-side (unlockConsole → mms_staff_verify_pin); this surface only
 * shows honest state: remaining attempts on a miss, a live countdown while locked out, and a sign-out
 * escape for a forgotten PIN (the deliberate way back, which ends the session the lock sits on).
 *
 * P7·2 — in Burmese, through the `pin.*` vocabulary the manager step-up already reads (one word for
 * "wrong PIN" on every screen that says it) and `useLockout` from the same module, so the countdown
 * is formatted once. The page owns the bar and the column; this is the card beneath them.
 *
 * ⚠️ NOTHING HERE IS NATIVELY `disabled`. The input is `readOnly` during a lockout — it keeps focus
 * (which `submit` just moved there) and refuses keys — and the button is `aria-disabled` with the
 * refusal inside the handler, so a locked-out person keeps their place while the countdown speaks.
 *
 * Phase 2h (decision 9g) — a locked shared tablet is never stranded. The unlock is awaited with a
 * BOUND (`boundWrite`) and its busy cleared in a `finally`: a rejected `unlockConsole` used to latch
 * "Checking…" forever and kill the form, and a hung one did the same for as long as the action queue
 * was stuck. A lost answer says "couldn't confirm — reload: if it opens, you're in", a slow one "no
 * answer yet — don't enter it again", each with the reload beside it; the late answer still lands.
 * "Forgot PIN? Sign out" hard-navigates after the Supabase sign-out and awaits NO Server Action
 * first — the lock's release is the sign-in page's (`StaffLogin`), sent on a fresh document whose
 * action queue nothing can be stuck in.
 *
 * S2 critic D3 · D11 — an unlock still unanswered past the bound HOLDS Unlock (the line says "don't
 * enter it again"): a second try would queue behind the stuck one and spend another PIN attempt,
 * bringing the lockout nearer. The late answer frees it. And the sign-out's own network call is
 * bounded too: a dead network answers "couldn't sign out — try again", never a link latched on
 * "signing out" with no way off the lock screen but a force-quit.
 */
export function PinUnlock({ lang, displayName }: { lang: StaffLang; displayName: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  // Seconds left on a lockout; 0 = not locked. Drives the refused state + the countdown copy.
  const { setLockLeft, locked, lockCopy } = useLockout(lang);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH);
  const lengthOk = pin.length >= PIN_MIN_LENGTH;
  // Phase 2h (D3) — an unlock still out past the bound: Unlock is held until its late answer lands.
  const [waiting, setWaiting] = useState(false);
  const refused = busy || waiting || locked || !lengthOk;

  // Phase 2h — whether the region's line offers the reload (both unanswered lines say "reload").
  const [reload, setReload] = useState(false);

  /** The unlock's answer, whenever it lands — at once, or after the bound (9e: never dropped). */
  function land(res: UnlockResult) {
    setReload(false);
    if (res.ok) {
      router.replace("/staff");
      router.refresh();
      return;
    }
    setPin("");
    inputRef.current?.focus();
    if (res.reason === "wrong") {
      const n = res.attemptsRemaining;
      setMsg(
        n > 0
          ? { k: plural(n, "pin.wrong.one", "pin.wrong.many"), vars: { n } }
          : { k: "pin.wrong" },
      );
      return;
    }
    if (res.reason === "locked") {
      // The countdown IS the message ("Too many tries — try again in {x}."); nothing else is set,
      // so when it reaches zero the region empties over the re-opened field (blind pass, CRITICAL).
      setLockLeft(secondsUntil(res.lockedUntil));
      return;
    }
    if (res.reason === "no_pin") {
      // The PIN was removed elsewhere while locked — sign out is the honest way back.
      setMsg({ k: "pin.noPin.self" });
      return;
    }
    if (res.reason === "outage") {
      // W10b — the gate refused BEFORE the PIN was checked: no attempt was burned, and the PIN is
      // not the problem. Never let an outage read as a wrong PIN.
      setMsg({ k: "pin.outage" });
      return;
    }
    setMsg({ k: "pin.checkFailed" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (refused) return;
    setBusy(true);
    setMsg(null);
    setReload(false);
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(unlockConsole({ pin }));
      if (out.kind === "answer") {
        land(out.value);
        return;
      }
      setReload(true);
      if (out.kind === "threw") {
        // The answer was lost — the PIN may have been checked, and the tablet unlocked: a reload
        // shows which. Never "wrong PIN", never "try again" alone (a retry spends another try).
        setMsg({ k: "pin.unlock.unknown" });
        return;
      }
      setMsg({ k: "pin.unlock.waiting" });
      setWaiting(true);
      // The late answer lands whenever it comes: a late unlock opens the console (the lock cookie
      // is cleared), a late refusal is said; the lock screen's only other exit is a document load.
      void out.late.then((late) => {
        setWaiting(false);
        if (late.kind === "answer") land(late.value);
        else setMsg({ k: "pin.unlock.unknown" });
      });
    } finally {
      setBusy(false); // frees AT THE BOUND (fact 3) — the form never dies on "Checking…"
    }
  }

  async function signOut() {
    if (signingOut) return; // re-entry refused here, never by `disabled` (a double-tap is two sign-outs)
    setSigningOut(true);
    setMsg(null);
    setReload(false);
    let error: unknown;
    try {
      // D11 — bounded: a dead network never latches the link on "signing out".
      ({ error } = await raceTimeout(browserClient().auth.signOut()));
    } catch {
      // No answer at the bound: the sign-in service is unreachable from here (the timeout is the
      // evidence) — said as the outage line, and the link is live again for a retry.
      setSigningOut(false);
      setMsg({ k: "entry.err.signOutOutage" });
      return;
    }
    if (error) {
      setSigningOut(false);
      // W10b — blame the connection only on a transport shape (the audit found six surfaces
      // asserting "check your connection" with zero evidence).
      setMsg(
        isRetryableAuthShape(error) ? { k: "entry.err.signOutOutage" } : { k: "entry.err.signOut" },
      );
      return;
    }
    // Phase 2h (9g) — a HARD navigation, and no Server Action awaited before it. The lock is a
    // DEVICE cookie, httpOnly, that the browser sign-out cannot touch; left in place it met the next
    // sign-in with this same screen and no PIN to enter, so "Forgot PIN? Sign out" was a loop (blind
    // pass, CRITICAL). Its release used to be awaited HERE — but Next runs Server Actions one at a
    // time per tab, so on a tablet whose queue is stuck (the very tablet a person is escaping) that
    // await never answered, and the soft `router.replace` after it could not commit either. The
    // sign-in page releases it instead (`StaffLogin`, on mount: a fresh document, an empty queue —
    // and the server still releases only once it sees no session). A document load is the one
    // escape a stuck queue cannot hold.
    window.location.assign("/staff/login");
  }

  // One live region (QA §A): the lockout countdown takes precedence over a transient message.
  const shown = lockCopy ?? msg;

  return (
    <section className="card card-textured entry-card" aria-labelledby="entry-h">
      <h2 id="entry-h" className="entry-h">
        <Chrome lang={lang} k="entry.lock.hi" vars={{ x: displayName }} echo="stack" />
      </h2>
      <p className="entry-sub">
        <Chrome lang={lang} k="entry.lock.sub" echo="stack" />
      </p>

      <form onSubmit={submit} noValidate>
        <label htmlFor="unlock-pin" className="entry-label">
          <Chrome lang={lang} k="pin.label" echo="stack" />
        </label>
        <input
          ref={inputRef}
          id="unlock-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX_LENGTH}
          value={pin}
          onChange={(e) => setPin(onlyDigits(e.target.value))}
          placeholder="••••"
          readOnly={locked}
          aria-disabled={locked || undefined}
          // NOT described-by the live region (the step-up's S10 rule): a node cannot be both a
          // field description and a transactional live region without announcing twice.
          className="entry-input entry-input-pin"
        />
        <button
          type="submit"
          aria-disabled={refused || undefined}
          className="entry-primary staff-press"
        >
          <Chrome lang={lang} k={busy ? "entry.checking" : "entry.lock.unlock"} echo="inline" />
        </button>
      </form>

      <button
        type="button"
        onClick={signOut}
        aria-disabled={signingOut || undefined}
        className="entry-link"
      >
        <Chrome lang={lang} k="entry.lock.forgot" echo="inline" />
      </button>

      <p id="unlock-msg" role="status" className="entry-msg entry-msg-warn">
        {shown && <MsgText lang={lang} msg={shown} />}
      </p>
      {/* Phase 2h — both unanswered lines say "reload the page", and the console is installed
          standalone (no browser reload): the one way out sits BESIDE the region, never inside it.
          Not while a lockout's countdown holds the region (it is the newer sentence there). */}
      {reload && lockCopy === null && <ReloadButton lang={lang} block />}
    </section>
  );
}
