"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { removePin, setPin } from "@/lib/staff-pin-actions";
import { isRetryableAuthShape } from "@/lib/staff-outage";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/limits";
import { BRAND_NAME } from "@/lib/brand";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useViewStatus } from "./ViewStatus";

/**
 * A4·4 — the SIGNED-IN state of the sign-in screen: who you are · your PIN · sign out, last. The
 * old `/staff/profile` (`PinManager` + `StaffSignOut`), folded into the same textured card the
 * form and the lock screen wear (§17: one card, top-aligned, the primary an accent pill, the
 * escape a quiet link LAST) — and converted while it moved: K25 named the profile the only console
 * page with no Burmese below the bar, and every word here is now a dictionary key.
 *
 * Authority is server-side (`setPin` / `removePin` re-verify the caller and act on THEIR row); this
 * is the affordance and the honest feedback. Three things are deliberate:
 *
 *   · THE TWO REFUSALS THE CARD CAN SEE ARE EXPLAINED, NOT GREYED. The old form disabled its submit
 *     on a short PIN or a mismatch — so its own "PIN must be 4–8 digits." and "Those PINs don't
 *     match." were unreachable (a disabled default button blocks the Enter key too). A single-field
 *     form can grey (the lock screen's Unlock below four digits says nothing worth saying); a
 *     two-field form that greys leaves a parent tapping a dead button. So Update is refused only
 *     while a save is in flight, and a bad pair is SAID, with focus moved to the field at fault.
 *   · ONE live region for the PIN outcome AND the sign-out failure (QA §A). The old page had two
 *     components with a region each; on one card that is two regions for one person — and since
 *     the roster joined this screen, the region is the VIEW's (`ViewStatusProvider`, mounted by
 *     the page): `#me-msg` is then the visible, `aria-hidden` echo where the eye is, and the card
 *     speaks through the provider. Mounted alone (a suite, a future single-card screen) `#me-msg`
 *     is the region itself, as before.
 *   · The action answers REASON CODES and each is a key — `entry.pin.err.*` — so the region is
 *     never English under the Burmese switch (P2m's defect, on the last surface that had it). An
 *     `auth` answer refreshes instead of explaining: the page re-gates to the form, which is the
 *     honest screen for a session that is gone.
 *
 * ⚠️ NOTHING HERE IS NATIVELY `disabled` (§17): a busy control is `aria-disabled` with the refusal in
 * its handler, so the person keeps their place while the region speaks.
 */
export function SignedInCard({
  lang,
  hasPin,
  displayName,
  email,
}: {
  lang: StaffLang;
  hasPin: boolean;
  displayName: string;
  email: string | null;
}) {
  const router = useRouter();
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // §17 — each latch is a REF read at tap time (LEARNINGS #126: two taps in one frame both read the
  // same stale render, so a state flag lets both post); the state beside it only says
  // `aria-disabled` and swaps the label. Set together, released together.
  const busyRef = useRef(false);
  const removingRef = useRef(false);
  const signingOutRef = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; m: StaffMsg } | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  // The view's announcer when a provider sits above this card (the signed-in sign-in screen), or
  // null when the card is the whole view. `say` is the ONE writer: the visible line always, and the
  // spoken one through the provider whenever there is one.
  const announce = useViewStatus();
  const say = (next: { ok: boolean; m: StaffMsg } | null) => {
    setMsg(next);
    announce?.(next ? <MsgText lang={lang} msg={next.m} /> : null);
  };

  // Strip to digits as the user types — the field is numeric-only; mirrors the 4–8 digit server rule.
  const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH);
  const lengthOk = pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH;
  const bounds = { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return; // re-entry refused here, never by `disabled`
    say(null);
    if (!lengthOk) {
      say({ ok: false, m: { k: "entry.pin.err.length", vars: bounds } });
      pinRef.current?.focus();
      return;
    }
    if (pin !== confirm) {
      say({ ok: false, m: { k: "entry.pin.err.mismatch" } });
      confirmRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    // ⚠️ THE BUSY LATCH CLEARS IN `finally`. A Server Action's promise REJECTS on a lost connection,
    // a transport failure or an uncaught server exception — none of which produce an `{ ok: false }`
    // to fall through to — so a clear placed after the `await` never ran, the submit stayed
    // "Saving…" and refused every later tap until a reload (blind pass, CRITICAL 1; the same shape
    // `TeamManager` fixed on #278). A rejection IS the outage sentence: nothing was checked, nothing
    // saved, and the pair is kept for the retry.
    let res: Awaited<ReturnType<typeof setPin>>;
    try {
      res = await setPin({ pin });
    } catch (e) {
      console.error("[sign-in] setPin rejected", e);
      say({ ok: false, m: { k: "entry.pin.err.outage" } });
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (!res.ok) {
      if (res.reason === "auth") {
        router.refresh();
        return;
      }
      // `invalid` cannot happen past the two checks above unless the server's rule moved; say the
      // rule rather than nothing. The pair is KEPT on every refusal — an outage checked nothing.
      say({
        ok: false,
        m:
          res.reason === "invalid"
            ? { k: "entry.pin.err.length", vars: bounds }
            : { k: `entry.pin.err.${res.reason}` },
      });
      return;
    }
    setPinValue("");
    setConfirm("");
    say({ ok: true, m: { k: hasPin ? "entry.pin.saved.updated" : "entry.pin.saved.set" } });
    router.refresh();
  }

  async function remove() {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    say(null);
    let res: Awaited<ReturnType<typeof removePin>>;
    try {
      res = await removePin();
    } catch (e) {
      console.error("[sign-in] removePin rejected", e);
      say({ ok: false, m: { k: "entry.pin.err.outage" } });
      return;
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
    if (!res.ok) {
      if (res.reason === "auth") {
        router.refresh();
        return;
      }
      say({
        ok: false,
        m: { k: res.reason === "outage" ? "entry.pin.err.outage" : "entry.pin.err.remove" },
      });
      return;
    }
    say({ ok: true, m: { k: "entry.pin.removed" } });
    // The Remove button UNMOUNTS on the re-render that follows (`hasPin` flips), taking focus to
    // <body> with it (blind pass, CRITICAL 3). Move it to the PIN field first — the field persists
    // across the refresh, and it is where the next thing to do lives.
    pinRef.current?.focus();
    router.refresh();
  }

  // Clears the @supabase/ssr cookie session, then re-gates this same route — which is the form.
  // W10b: a FAILED sign-out (auth plane unreachable) must not route away wearing a still-live
  // session — say what happened and stay put. No lock to release here: this state renders only on
  // an UNLOCKED tablet (a locked one is sent to `/staff/lock` before the card exists).
  async function signOut() {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    say(null);
    // The same latch shape as the two writes above, one control down (Codex round 2 on #284):
    // supabase-js resolves an AUTH failure into `{ error }`, but the client itself can THROW (a
    // navigator-lock timeout, a storage operation), and a throw skipped both the error branch and
    // the navigation with `signingOut` still true. A throw is not evidence of transport, so it
    // renders the generic sentence; the latch is released either way and only a clean sign-out
    // leaves this page.
    let error: unknown;
    try {
      ({ error } = await browserClient().auth.signOut());
    } catch (e) {
      console.error("[sign-in] signOut rejected", e);
      signingOutRef.current = false;
      setSigningOut(false);
      say({ ok: false, m: { k: "entry.err.signOut" } });
      return;
    }
    if (error) {
      signingOutRef.current = false;
      setSigningOut(false);
      say({
        ok: false,
        m: { k: isRetryableAuthShape(error) ? "entry.err.signOutOutage" : "entry.err.signOut" },
      });
      return;
    }
    router.replace("/staff/login");
    router.refresh();
  }

  return (
    <section className="card card-textured entry-card" aria-labelledby="entry-h">
      <p className="entry-brand">{BRAND_NAME}</p>
      <h2 id="entry-h" className="entry-h">
        <Chrome lang={lang} k="entry.me.head" vars={{ x: displayName }} echo="stack" />
      </h2>
      {/* The verified email, verbatim — an address is not copy. Omitted rather than invented when
          the session carries none. */}
      {email && (
        <p className="entry-sub" lang="en">
          {email}
        </p>
      )}

      <h3 id="pin-h" className="entry-h3">
        <Chrome
          lang={lang}
          k={hasPin ? "entry.pin.head.change" : "entry.pin.head.set"}
          echo="stack"
        />
      </h3>
      <p className="entry-note">
        <Chrome lang={lang} k="entry.pin.why" vars={bounds} echo="stack" />
      </p>

      <form onSubmit={save} noValidate aria-labelledby="pin-h">
        <label htmlFor="pin-new" className="entry-label">
          <Chrome lang={lang} k={hasPin ? "entry.pin.new" : "pin.label"} echo="stack" />
        </label>
        <input
          ref={pinRef}
          id="pin-new"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX_LENGTH}
          value={pin}
          onChange={(e) => setPinValue(onlyDigits(e.target.value))}
          placeholder="••••"
          // NOT described-by the live region (the step-up's S10 rule): focus lands here on a
          // refusal and the region announces the change itself — described-by would say it twice.
          className="entry-input entry-input-pin"
        />
        <label htmlFor="pin-confirm" className="entry-label">
          <Chrome lang={lang} k="entry.pin.confirm" echo="stack" />
        </label>
        <input
          ref={confirmRef}
          id="pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(onlyDigits(e.target.value))}
          placeholder="••••"
          className="entry-input entry-input-pin"
        />
        <button
          type="submit"
          aria-disabled={busy || undefined}
          className="entry-primary staff-press"
        >
          <Chrome
            lang={lang}
            k={busy ? "entry.pin.saving" : hasPin ? "entry.pin.update" : "entry.pin.set"}
            echo="inline"
          />
        </button>
      </form>

      {hasPin && (
        <button
          type="button"
          onClick={remove}
          aria-disabled={removing || undefined}
          className="entry-secondary entry-secondary-warn staff-press"
        >
          <Chrome
            lang={lang}
            k={removing ? "entry.pin.removing" : "entry.pin.remove"}
            echo="inline"
          />
        </button>
      )}

      {/* P7·1b — Sign out lives HERE, never in the bar: a mis-tap on it costs a login, where a
          mis-tap on Lock costs a PIN. Last on the card, the way iOS ends Settings. */}
      <button
        type="button"
        onClick={signOut}
        aria-disabled={signingOut || undefined}
        className="entry-link"
      >
        <Chrome lang={lang} k="entry.signOut" echo="inline" />
      </button>

      {/* One live region for the PIN outcome and the sign-out failure (QA §A) — the view's when a
          provider is mounted (this is then the aria-hidden echo), this card's own otherwise. */}
      <p
        id="me-msg"
        role={announce ? undefined : "status"}
        aria-hidden={announce ? true : undefined}
        className={msg && !msg.ok ? "entry-msg entry-msg-warn" : "entry-msg"}
      >
        {msg && <MsgText lang={lang} msg={msg.m} />}
      </p>
    </section>
  );
}
