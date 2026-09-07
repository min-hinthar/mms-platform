"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { releaseLockAfterSignOut, unlockConsole } from "@/lib/staff-pin-actions";
import { isRetryableAuthShape } from "@/lib/staff-outage";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/limits";
import { plural } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { secondsUntil, useLockout } from "./ManagerPinStepUp";
import { MsgText, type StaffMsg } from "./StaffMsg";

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
  const refused = busy || locked || !lengthOk;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (refused) return;
    setBusy(true);
    setMsg(null);
    const res = await unlockConsole({ pin });
    setBusy(false);
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

  async function signOut() {
    if (signingOut) return; // re-entry refused here, never by `disabled` (a double-tap is two sign-outs)
    setSigningOut(true);
    setMsg(null);
    const { error } = await browserClient().auth.signOut();
    if (error) {
      setSigningOut(false);
      // W10b — blame the connection only on a transport shape (the audit found six surfaces
      // asserting "check your connection" with zero evidence).
      setMsg(
        isRetryableAuthShape(error) ? { k: "entry.err.signOutOutage" } : { k: "entry.err.signOut" },
      );
      return;
    }
    // The lock is a DEVICE cookie, httpOnly, that the browser sign-out cannot touch — left in place
    // it met the next sign-in with this same screen and no PIN to enter, so "Forgot PIN? Sign out"
    // was a loop (blind pass, CRITICAL). The server releases it only once it can see no session.
    await releaseLockAfterSignOut();
    router.replace("/staff/login");
    router.refresh();
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
    </section>
  );
}
