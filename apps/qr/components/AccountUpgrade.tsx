"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@mms/db";
import { ensureProfile } from "@/lib/rewards";
import { mintMergeToken } from "@/lib/merge";
import { stashMergeToken, clearMergeToken, readMergeToken } from "@/lib/mergeTokenStore";
import { decideCarry, CARRY_OVERRIDE_LABEL, MINT_TRANSPORT_FAILURE } from "@/lib/merge-carry";
import {
  readCallbackOutcome,
  callbackMessage,
  googleAction,
  googleButtonLabel,
  shouldAutoRecover,
  type CallbackOutcome,
} from "@/lib/oauth-callback";
import {
  stashCallbackOutcome,
  readStashedCallbackOutcome,
  markRecoveryAttempted,
  readRecoveryAttempted,
  clearCallbackOutcome,
} from "@/lib/oauthCallbackStore";
import { readIdentities, type DeviceIdentity } from "@/lib/deviceIdentity";
import { WelcomeBackChooser } from "./WelcomeBackChooser";
import { Card } from "@mms/ui";

/**
 * Anon → durable account (M4 P4.1). Upgrades the SAME anonymous uid in place (email OTP / Google), so the
 * diner's past paid orders + earned Stars carry over with no migration (docs/M4_DESIGN R3). Honest: we only
 * report the account once the gateway CONFIRMS it (verifyOtp / the Google redirect) — never eagerly.
 *
 * The upgraded session is kept by AnonAuthGate via a SERVER-SIDE staff check (getSessionKind) — it swaps
 * only confirmed staff, never an upgraded diner — so there's no client marker to set (and no marker-write
 * that could fail before the Google redirect and orphan the account).
 */
export function AccountUpgrade({ stars }: { stars: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "code">("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The email the diner typed already belongs to a DIFFERENT account → `updateUser` can't attach it (it
  // 422s `email_exists`). Instead of a dead-end raw error, pivot to a SIGN-IN recovery (mirrors the Google
  // identity_already_exists path). `codeMode` then drives the verifyOtp type: an `email_change` upgrade
  // keeps this anon uid (Stars carry over); an `email` sign-in switches to the existing account.
  const [emailTaken, setEmailTaken] = useState(false);
  const [codeMode, setCodeMode] = useState<"email_change" | "email">("email_change");
  // K7: the email currently mid re-auth from a "Welcome back" chip / a `?resume=` return — shows a spinner on
  // that chip and drives the code-step label.
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  /**
   * A7b — the carry could not be secured, so the sign-in was NOT started. Holds the honest message plus
   * the explicit way through; null whenever there is nothing to warn about.
   */
  const [carryBlocked, setCarryBlocked] = useState<string | null>(null);

  // K7 shared-device — sign INTO a pre-existing account. `bringStars` is the merge-safety hinge: a genuine
  // guest saving their own Stars (typed a taken email / used Google) mints the K3b merge token to carry them
  // over; an explicit SWITCH (a remembered-identity chip, or a lend-mode resume) passes false so the current
  // session's guest Stars are NEVER swept onto the account being switched to — and clears any stale token.
  const sendSignInCode = useCallback(
    async (addr: string, bringStars: boolean): Promise<boolean> => {
      const supa = browserClient();
      if (bringStars) {
        // A7b — same rule as the Google path, same reason: `verifyOtp({ type: "email" })` signs into a
        // PRE-EXISTING account and switches uid, so an unsecured carry is a permanent loss. Stopping
        // before the code is sent is the cheapest place to stop — the diner has not yet been asked to
        // go and read their email.
        // Same transport catch as the Google path — see its comment. Without it a dropped connection
        // throws out of `sendSignInCode`, so the caller's `setBusy(false)` never runs.
        const outcome = await mintMergeToken().catch(() => MINT_TRANSPORT_FAILURE);
        if (outcome.kind === "minted") stashMergeToken(outcome.token);
        const decision = decideCarry(outcome, outcome.kind === "minted" ? readMergeToken() : null);
        if (decision.kind === "blocked") {
          setCarryBlocked(decision.message);
          return false;
        }
      } else {
        clearMergeToken();
      }
      const { error: e0 } = await supa.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: false }, // sign in to the EXISTING account — never silently mint a new one
      });
      if (e0) {
        setError(e0.message || "Couldn’t send the sign-in code — try again.");
        return false;
      }
      setEmail(addr);
      setCodeMode("email");
      setPhase("code");
      return true;
    },
    [],
  );

  const startGoogleSignIn = useCallback(async (bringStars: boolean): Promise<boolean> => {
    const supa = browserClient();
    if (bringStars) {
      // ⚠️ A7b — THE MINT IS LOAD-BEARING ON THIS PATH, NOT BEST-EFFORT. `signInWithOAuth` switches uid,
      // and the anonymous uid holding this device's orders/Stars/coupons/favourites is unreachable the
      // moment it does: a replacement token can never be minted (that needs the anon session, which is
      // gone) and only `service_role` can move the value afterwards. So a failed mint STOPS here rather
      // than redirecting past it — the old code redirected unconditionally and destroyed the value
      // silently, after the copy had promised to move it. `lib/merge-carry.ts` owns the decision.
      // ⚠️ CATCH THE TRANSPORT, not just the body. A Server Action promise REJECTS on a lost
      // connection, before `mintMergeToken`'s own try/catch can run — so an uncaught call here throws
      // past every line below, leaving the card at `busy = true` with no message and an unhandled
      // rejection. A mint we never heard back from is a carry we did not secure.
      const outcome = await mintMergeToken().catch(() => MINT_TRANSPORT_FAILURE);
      if (outcome.kind === "minted") stashMergeToken(outcome.token);
      // Read the stash BACK: `stashMergeToken` swallows a storage failure by design, and a token that
      // only exists server-side is one MergeRedeemer will never find.
      const decision = decideCarry(outcome, outcome.kind === "minted" ? readMergeToken() : null);
      if (decision.kind === "blocked") {
        setCarryBlocked(decision.message);
        setBusy(false);
        setSelectedEmail(null);
        return false;
      }
    } else {
      clearMergeToken();
    }
    const { error: e4 } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (e4) {
      // The redirect never happened, so a token stashed a moment ago is now UNBOUND — nothing will
      // consume it, it lives 24h, and `MergeRedeemer` redeems on ANY later non-anon sign-in on this
      // device, including a staff member signing in through /staff/auth/callback and then opening
      // /account. That would move this diner's orders onto somebody else's account.
      clearMergeToken();
      setError(e4.message || "Couldn’t sign in with Google — try again.");
      setBusy(false);
      setSelectedEmail(null);
      return false;
    }
    // success → full-page redirect to Google, returns to /account
    return true;
  }, []);

  // Tap a "Welcome back" chip — a merge-suppressed switch to a known prior identity.
  const selectIdentity = useCallback(
    async (id: DeviceIdentity) => {
      setBusy(true);
      setError(null);
      setEmailTaken(false);
      setSelectedEmail(id.email);
      if (id.method === "google") {
        await startGoogleSignIn(false); // redirects away (or clears busy on error)
        return;
      }
      const ok = await sendSignInCode(id.email, false);
      setBusy(false);
      if (!ok) setSelectedEmail(null);
    },
    [sendSignInCode, startGoogleSignIn],
  );

  // OAuth callback bounce (M4 P4.1, reworked in A7b): `linkIdentity` redirects back to /account, and if the
  // Google account the diner picked already belongs to a DIFFERENT Morning Star account, Supabase bounces
  // back with ?error_code=identity_already_exists + a 422 on /auth/v1/user. Only the QUERY copy is readable
  // — `useSearchParams()` is built from the router's canonical URL and can never see a fragment — and it
  // exists because @supabase/ssr hardcodes the PKCE flow. The reading, the copy, the button label and the
  // handler choice all live in `lib/oauth-callback.ts`, so each is a value a test can falsify.
  //
  // A7b also stopped asking the diner to press again: an already-linked bounce completes itself (see the
  // auto-recovery effect below). The relabelled button remains for the case where that one attempt is
  // already spent.
  //
  // a11y note, unchanged and still a tradeoff: when the message is present from SSR/first paint it is
  // INITIAL content of the role="status" region, so a screen reader will not auto-announce it. It is
  // visible and discoverable on navigation. The auto-recovery makes this moot in the common case, because
  // the diner is redirected rather than left reading it.
  const searchParams = useSearchParams();
  /**
   * ⚠️ A7b — CAPTURED ONCE, NEVER RE-DERIVED, AND THE COMMENT THIS REPLACES WAS WRONG ABOUT NEXT.
   * The previous code read `searchParams` live on every render and then stripped the query in an
   * effect, justified by "Next's searchParams don't react to it". They do: Next 16.2.9 patches
   * `window.history.replaceState` and only bails when the state object carries `__NA`/`_N`, so a
   * `null` state with a truthy url runs `applyUrlFromHistoryPushReplace` → `canonicalUrl` → the very
   * value `useSearchParams()` is built from. The message and the recovery were therefore erased one
   * frame after they appeared, and the button reverted to the `linkIdentity` call that had just been
   * refused. Seeding state ONCE from the URL means the cleanup can do its job without taking the
   * recovery with it. The initializer is hydration-safe: `app/layout.tsx` is `force-dynamic`, so SSR
   * and the first client render read the same query.
   */
  const [callback, setCallback] = useState<CallbackOutcome | null>(() =>
    readCallbackOutcome(searchParams.get("error_code"), searchParams.get("error")),
  );
  const callbackError = callbackMessage(callback);

  // Focus follows the step (WCAG 2.4.3): email→code swaps the form (the pressed submit unmounts), and
  // "Use a different email" swaps back — land focus in the new step's input. Skip the initial mount so
  // the card never steals focus from the page.
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (phase === "code" ? codeRef.current : emailRef.current)?.focus({ preventScroll: true });
  }, [phase]);
  const [, startTransition] = useTransition();

  /**
   * Clean the raw Supabase error out of the address bar once it has been captured above.
   *
   * ⚠️ DELETE ONLY THE OAUTH KEYS — NEVER REPLACE WITH `pathname`. The old call was
   * `replaceState(null, "", window.location.pathname)`, which discarded EVERY other param, and this
   * effect is declared before the `?resume=` one so it ran first. A lend-mode return that arrived
   * alongside a bounce therefore lost its `resume` param before the resume effect could act on it —
   * and because the strip does propagate to `useSearchParams` (see the capture note above),
   * `resumeParam` then flipped to null, tearing that effect down mid-flight. The resume effect's own
   * comment says it preserves co-present params for exactly this reason; this one now does too.
   *
   * The fragment goes as well: Supabase mirrors the error there, the SDK does not clean an
   * error-carrying callback (it throws before either of its two URL rewrites), and nothing in the app
   * reads the hash.
   */
  useEffect(() => {
    if (!callback || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [callback]);

  /**
   * A7b — remember the bounce, and COMPLETE the recovery rather than asking for a second press.
   *
   * The diner already asked to sign in with Google. The first press called `linkIdentity`, which for a
   * returning customer cannot succeed, and Supabase said so. The call that answers the request they
   * actually made is `signInWithOAuth`, and the app knows it — so it makes it, instead of relabelling
   * a button and hoping they notice two changed words below an `aria-hidden` divider.
   *
   * Ordering inside the frame is load-bearing: the attempt is marked spent BEFORE the redirect starts,
   * because a flag written on the way back would be written by a page that may never load. Only an
   * `already-linked` bounce auto-recovers — a `generic` one is a failure we cannot name, and
   * redirecting into an unnamed failure is how a loop gets built.
   *
   * Deferred to a frame for the same reason the `?resume=` effect is: this reaches setState, and the
   * guard is set inside the callback so Strict Mode's double-invoke cannot leave it bailing forever.
   */
  const autoRecoverFired = useRef(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (autoRecoverFired.current) return;
      // No bounce in this URL — but one may be remembered from before a reload or a client navigation
      // stripped it. Adopt it and let this effect run again on the next render.
      if (!callback) {
        const remembered = readStashedCallbackOutcome();
        if (remembered) setCallback(remembered);
        return;
      }
      stashCallbackOutcome(callback);
      if (!shouldAutoRecover(callback, readRecoveryAttempted())) return;
      autoRecoverFired.current = true;
      markRecoveryAttempted();
      setBusy(true);
      void startGoogleSignIn(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [callback, startGoogleSignIn]);

  // Refresh the Server Components once the account CONFIRMS. The Google OAuth return exchanges the PKCE code
  // client-side AFTER the initial SSR (which saw anonymous cookies), so `/account`'s RewardsHub + this card
  // stay stale until a manual reload — verify() refreshes the email path explicitly, but the Google path had
  // no refresh. Subscribe to the auth confirm (SIGNED_IN on Google, USER_UPDATED on email) and refresh once
  // (ref-guarded), gated on the session being a REAL account (is_anonymous !== true — a real account may
  // surface the flag as false OR omit it, and only an anon session is explicitly `true`) so the anonymous
  // sign-in AnonAuthGate mints never trip it. ensureProfile() first so the Google upgrade's profile row exists.
  const refreshedRef = useRef(false);
  useEffect(() => {
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event, session) => {
      const upgraded = !!session?.user && session.user.is_anonymous !== true;
      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        upgraded &&
        !refreshedRef.current
      ) {
        refreshedRef.current = true;
        // A7b — the bounce is over: a real account has confirmed on this device. Forget the remembered
        // outcome and the spent auto-recovery so a later sign-in in the same browsing session starts
        // clean rather than inheriting this one's recovery state.
        clearCallbackOutcome();
        // Refresh even if ensureProfile rejects — the account is confirmed; the profile row is secondary
        // (idempotently re-created on the next confirmed load) and must not block the hub from updating.
        void (async () => {
          try {
            await ensureProfile();
          } catch {
            /* best-effort */
          }
          startTransition(() => router.refresh());
        })();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, startTransition]);

  // K7 lend resume — a "Done — back to [owner]" tap lands here as `?resume=<email>`. Fire the owner's
  // merge-SUPPRESSED fast re-auth once (a remembered chip → its OTP/OAuth path; otherwise pre-fill the field
  // for a manual sign-in), then strip the param so a refresh can't re-fire it. `readIdentities` is client-only
  // so this runs post-hydration, matching the chooser.
  const resumeParam = searchParams.get("resume");
  const resumeFired = useRef(false);
  useEffect(() => {
    if (!resumeParam || resumeFired.current) return;
    // Defer everything to the next frame AND set the fire-once guard INSIDE the callback (not in setup): React
    // Strict Mode double-invokes mount effects (setup → cleanup → setup), and a guard set in setup would
    // survive the simulated remount (refs persist) while the raf got cancelled — leaving the second setup to
    // bail without ever running. Guarding at run-time means the second setup reschedules and the work fires
    // exactly once. Deferring also keeps the fast-re-auth's setState off the synchronous effect body (lint).
    const raf = requestAnimationFrame(() => {
      if (resumeFired.current) return;
      resumeFired.current = true;
      if (typeof window !== "undefined") {
        // Strip ONLY `resume` (keep any co-present params, e.g. an OAuth error_code) so a refresh can't re-fire.
        const url = new URL(window.location.href);
        url.searchParams.delete("resume");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      const match = readIdentities().find(
        (i) => i.email.toLowerCase() === resumeParam.toLowerCase(),
      );
      if (match) {
        void selectIdentity(match);
        return;
      }
      // A `?resume=` return is ALWAYS the owner coming back to their OWN account (it originates only from the
      // lend banner), so the current session's guest Stars are the FRIEND's — never bring them. Even when the
      // owner is no longer remembered (roster wiped / LRU-evicted), force the merge-SUPPRESSED sign-in rather
      // than falling back to a bare pre-fill (which would route through emailTaken → bringStars:true and sweep
      // the friend's Stars onto the owner). An OTP works whether the owner is an email or Google account.
      setBusy(true);
      setSelectedEmail(resumeParam);
      void sendSignInCode(resumeParam, false).then((ok) => {
        setBusy(false);
        if (!ok) setSelectedEmail(null);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [resumeParam, selectIdentity, sendSignInCode]);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setError(null);
    const supa = browserClient();

    if (emailTaken) {
      // RECOVERY: the diner TYPED an address that belongs to another account, so SIGN IN to it (updateUser
      // would just re-fail email_exists). This is a genuine guest saving their OWN Stars into a pre-existing
      // account → `bringStars: true` mints the K3b merge token so /account's MergeRedeemer carries this
      // device's Stars over. (A remembered-CHIP switch takes the `false` path instead — see selectIdentity.)
      await sendSignInCode(addr, true);
      setBusy(false);
      return;
    }

    // UPGRADE: attach the email to the SAME anonymous user — keeps the uid, so past orders + Stars carry
    // over. Supabase sends a confirmation (6-digit code + link); is_anonymous flips on verify. (AnonAuthGate
    // keeps the upgraded session via a server-side staff check — no client marker needed.)
    const { error: e1 } = await supa.auth.updateUser({ email: addr });
    if (e1) {
      // The email already belongs to a DIFFERENT Morning Star account. Don't dead-end on the raw 422 —
      // flip to the sign-in recovery (the diner re-submits to send a sign-in code). Match the typed code
      // first, with a message fallback for SDK-version drift.
      if (e1.code === "email_exists" || /already.*registered/i.test(e1.message)) {
        setEmailTaken(true);
        setBusy(false);
        return;
      }
      setError(e1.message || "Couldn’t send the code — try again.");
      setBusy(false);
      return;
    }
    setCodeMode("email_change");
    setPhase("code");
    setBusy(false);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const supa = browserClient();
    // `email_change` finalizes the anon→account UPGRADE (keeps the uid + Stars); `email` completes the
    // SIGN-IN to the pre-existing account (recovery). The verify token/flow is otherwise identical.
    const { error: e2 } = await supa.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: codeMode,
    });
    if (e2) {
      setError(e2.message || "That code didn’t match. Check your email and try again.");
      setBusy(false);
      return;
    }
    // Create the profile row now the account is confirmed — but never let a throw here strand the button at
    // "Confirming…": the account IS confirmed, the profile is secondary (idempotently re-created on the next
    // confirmed load), so swallow + still refresh (mirrors the auth-listener path).
    try {
      await ensureProfile();
    } catch {
      /* best-effort — the confirmed session is what matters */
    }
    startTransition(() => router.refresh()); // re-render the hub as upgraded / signed-in — keeps the rewards
  }

  async function google() {
    setBusy(true);
    setError(null);
    const supa = browserClient();
    // Link Google to the SAME anonymous user (keeps the uid). AnonAuthGate keeps the post-redirect upgraded
    // session via a server-side staff check, so there's no pre-redirect marker write to fail (no orphan path).
    const { error: e3 } = await supa.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (e3) {
      setError(e3.message || "Couldn’t continue with Google — try again.");
      setBusy(false);
    }
    // success → redirects to Google, returns to /account (server-side ensureProfile finalizes the profile).
  }

  async function signInGoogle() {
    setBusy(true);
    setError(null);
    // Recovery for identity_already_exists: SIGN IN to the existing account (not linkIdentity, which would
    // fail the same way) so the diner lands on their real account and its saved rewards. A genuine guest
    // saving their OWN Stars → `bringStars: true` mints the merge token before the redirect.
    await startGoogleSignIn(true);
  }

  return (
    <Card as="section" textured style={card} aria-labelledby="upgrade-h">
      <p className="eyebrow" style={{ margin: "0 0 6px" }}>
        <span aria-hidden>✦ </span>Save your Stars
      </p>
      <h2 id="upgrade-h" style={h2}>
        Keep your rewards
      </h2>
      {/* Name the stakes honestly (the confusion this fixes: seeing your Stars + a "save them" pitch reads
          as a contradiction unless it's clear they're DEVICE-BOUND and could be lost). Lead with the real
          count when there is one. */}
      <p style={sub}>
        {stars > 0 ? (
          <>
            You’ve earned{" "}
            <strong>
              {stars} {stars === 1 ? "Star" : "Stars"}
            </strong>{" "}
            on this device — they live only here. Add an email or continue with Google to{" "}
            <strong>keep them for good</strong>; your past orders come with you too.
          </>
        ) : (
          <>
            You’re earning Stars on this device — they live only here. Add an email or continue with
            Google to <strong>save them to an account</strong>.
          </>
        )}
      </p>

      {/* K7: remembered-identity chips for a one-tap (merge-suppressed) return — renders null for a
          first-time guest with no history. Only on the idle step (the code step is mid-sign-in). */}
      {phase === "idle" && (
        <WelcomeBackChooser onSelect={selectIdentity} busy={busy} selectedEmail={selectedEmail} />
      )}

      {phase === "idle" ? (
        <form onSubmit={submitEmail}>
          <label htmlFor="up-email" style={label}>
            Email
          </label>
          <input
            ref={emailRef}
            id="up-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              // Editing the address clears the "already registered" recovery + any error, so a corrected
              // or different email starts fresh on the normal upgrade path.
              if (emailTaken) setEmailTaken(false);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            className="account-field"
            style={input}
          />
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="checkout-cta"
            style={primaryBtn}
          >
            <span style={ctaLabel}>
              {busy ? "Sending…" : emailTaken ? "Send sign-in code" : "Email me a code"}
            </span>
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="up-code" style={label}>
            6-digit code sent to {email}
          </label>
          <input
            ref={codeRef}
            id="up-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            placeholder="123456"
            className="account-field"
            style={input}
          />
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="checkout-cta"
            style={primaryBtn}
          >
            <span style={ctaLabel}>
              {busy
                ? "Confirming…"
                : codeMode === "email"
                  ? "Confirm & sign in"
                  : "Confirm & save my rewards"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setCode("");
              setError(null);
              setEmailTaken(false); // back to a clean upgrade attempt
              setCodeMode("email_change");
              setSelectedEmail(null); // clear any chip-selection spinner state
            }}
            className="nav-link"
            style={textBtn}
          >
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            Use a different email
          </button>
        </form>
      )}

      {/* Labeled fading-hairline divider (matches the checkout tray language) between the email path and
          the Google affordance. */}
      <p className="checkout-tray-label" style={divider} aria-hidden>
        or
      </p>

      <button
        type="button"
        onClick={googleAction(callback) === "sign-in" ? signInGoogle : google}
        disabled={busy}
        className="account-oauth"
        style={googleBtn}
      >
        {/* The Google "G" uses Google's official brand colors by mandate — a sanctioned literal-color
            exception (like email HTML), not a token miss. Decorative → aria-hidden. */}
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        {googleButtonLabel(callback)}
      </button>

      {/* A7b — the carry could not be secured, so nothing was started. This is the ONLY way past it, and
          it says what it costs rather than shrugging: the anonymous session holding this device's Stars is
          abandoned by the sign-in itself, and nothing can reach it afterwards. Rendered only while
          blocked, so a diner who never hit it never sees a way to throw their Stars away. */}
      {carryBlocked && (
        <button
          type="button"
          onClick={() => {
            setCarryBlocked(null);
            setBusy(true);
            void startGoogleSignIn(false);
          }}
          disabled={busy}
          style={carryOverrideBtn}
        >
          {CARRY_OVERRIDE_LABEL}
        </button>
      )}

      {/* SINGLE live region for the card — an error, the email-already-registered recovery, or the Google
          callback recovery (mutually exclusive at any moment). Routing the recovery here (vs a second
          region) keeps one live region per view; it announces on the emailTaken change (a real change to
          this persistent node, unlike the SSR-initial callbackError). */}
      <p role="status" aria-atomic="true" style={errorLine}>
        {error ??
          // A7b — a blocked carry outranks both recoveries below: it is the only one describing value
          // that is about to be destroyed, and it is a real change to this persistent node, so it DOES
          // announce (unlike the SSR-initial callbackError).
          carryBlocked ??
          // Only on the idle (email-entry) step — once we advance to the code step the "Send sign-in code"
          // button is gone, so the directive would contradict the screen (the diner already tapped it).
          (emailTaken && phase === "idle"
            ? "That email already has a Morning Star account — tap “Send sign-in code” to use it. We’ll move this device’s Stars onto it when you sign in."
            : null) ??
          callbackError}
      </p>
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = {
  padding: "var(--s5)",
};
const h2: CSSProperties = {
  margin: "0 0 6px",
  fontSize: "var(--fs-h3)",
  fontWeight: 800,
  color: "var(--tx)",
};
const sub: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  lineHeight: 1.5,
};
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--t2)",
  margin: "0 0 6px",
};
const input: CSSProperties = {
  // border lives in `.account-field` (so :focus-visible can recolor it — an inline border would outrank it)
  // — and since M126 (Codex #238 P2) the BACKGROUND does too, for exactly the same reason: an inline
  // fill outranks the class, which is what kept the --sunken well from ever reaching these fields.
  width: "100%",
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 12,
  color: "var(--tx)",
  fontSize: "var(--fs-body)", // ≥16px → no iOS zoom-on-focus
  marginBottom: 12,
};
// bg/color/gradient/sheen/shine live in `.checkout-cta`; this is layout only (label rides above the
// ::after sweep on its own relative span, ctaLabel).
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 12,
  border: "none",
  fontWeight: 800,
  fontSize: "var(--fs-body)",
  cursor: "pointer",
};
const ctaLabel: CSSProperties = { position: "relative", zIndex: 1 };
const googleBtn: CSSProperties = {
  // border lives in `.account-oauth` (so hover can recolor it to accent)
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  minHeight: 48,
  borderRadius: 12,
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  cursor: "pointer",
};
// A7b — the "leave my Stars behind" escape hatch. Deliberately quieter than the Google button and NOT a
// CTA: it is the destructive way through, offered only when the safe one is unavailable, so it must never
// read as the recommended tap. `--warn` names the cost without shouting; min-height keeps the 44px target.
const carryOverrideBtn: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 44,
  marginTop: 8,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--warn)",
  background: "transparent",
  color: "var(--warn)",
  fontWeight: 600,
  fontSize: "var(--fs-sm)",
  lineHeight: 1.35,
  cursor: "pointer",
};
// color/weight/size/underline/arrow come from `.nav-link`; content-width so the underline hugs the text
// (a full-width centered variant would stretch the wipe across the whole row) — left-aligns under the CTA.
const textBtn: CSSProperties = {
  marginTop: 4,
  border: "none",
  background: "transparent",
  cursor: "pointer",
};
const divider: CSSProperties = { margin: "16px 0" };
const errorLine: CSSProperties = {
  minHeight: 16,
  margin: "10px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
  textAlign: "center",
};
