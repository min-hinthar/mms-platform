"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@mms/db";
import { useAnimationPreference, useDeviceTier } from "@mms/ui";
import { Confetti } from "./Confetti";
import { redeemMergeToken, type MergeSummary } from "@/lib/merge";
import { readMergeToken, clearMergeToken } from "@/lib/mergeTokenStore";

const DISMISS_MS = 6000;

/**
 * K3b — the merge-confirmation beat on /account. When a diner signs into a PRE-EXISTING account (the
 * email-taken / already-linked recovery paths), AccountUpgrade minted a token WHILE anonymous and stashed
 * it in localStorage; this redeems it once signed in, moving this device's orders/Stars/coupons onto the
 * account, and celebrates the carry-over with a one-shot beat.
 *
 * Redeems on mount AND on the auth-confirm event — the two sign-in shapes land differently: email OTP fires
 * SIGNED_IN while /account stays mounted; the Google return re-mounts /account and the PKCE exchange
 * resolves the session a beat AFTER first paint (so the mount attempt is still anon → null → retried on the
 * SIGNED_IN the exchange fires). Both are ref-guarded so it never double-merges or re-celebrates.
 *
 * ⚠️ ONLY A REDEEM OUTCOME IS TERMINAL (A7). The mount attempt on a fresh /account finds no token at
 * all — the diner has not signed in yet, so `AccountUpgrade` has minted nothing — and that is the
 * ordinary first frame of every session, not a verdict. Treating it as one latched `done` before the
 * sign-in it was waiting for, which is why orders stopped following diners onto their accounts.
 *
 * Honest by construction: it shows the beat ONLY when Stars/coupons actually moved (`redeemMergeToken`
 * returns real counts from the DB merge — never a fabricated number), and stays silent on a nothing-to-
 * merge outcome. The overlay mirrors TierUpCelebration's a11y discipline: role="status" announces it, the
 * glyph is aria-hidden, focus moves to the dismiss button and restores on close, Escape/tap dismiss, and
 * the confetti + card entrance are gated on `shouldAnimate` (+ device tier) with a CSS reduced-motion
 * off-switch. `clearMergeToken()` + the `done` ref make the whole thing exactly-once per sign-in.
 */
export function MergeRedeemer() {
  const router = useRouter();
  const { shouldAnimate } = useAnimationPreference();
  const tier = useDeviceTier();
  const celebrate = shouldAnimate && tier !== "low"; // mobile GPU budget for the particle field (mirrors PaySuccess)
  const [summary, setSummary] = useState<MergeSummary | null>(null); // set only when Stars actually moved
  const [, startTransition] = useTransition();
  const running = useRef(false); // an attempt is in flight (no concurrent redeem)
  const done = useRef(false); // a TERMINAL outcome reached (merged or definitively nothing) — stop attempting
  // A7 — an attempt asked for WHILE one is in flight. Without it, `running` silently DROPS the retry
  // instead of deferring it, and the drop lands on the exact sequence that matters: the mount
  // attempt is still awaiting the server when the PKCE exchange fires SIGNED_IN a beat later, so the
  // one event that proves a real account has arrived is the one thrown away.
  const pending = useRef(false);
  /**
   * ⚠️ WHICH IDENTITY AN IN-FLIGHT ATTEMPT BELONGS TO. Resetting the refs on sign-out does not
   * cancel a request already awaiting the server: it resolves AFTER the handover, latches `done`
   * and calls `clearMergeToken()` — which can delete the token the NEXT guest has just stashed, and
   * re-block the very person the reset was for. A promise cannot be un-awaited, so it is stamped
   * instead: an attempt captures this counter when it starts, the sign-out bumps it, and a result
   * whose stamp no longer matches is discarded rather than acted on.
   */
  const generation = useRef(0);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const attempt = useCallback(async () => {
    if (done.current) return;
    if (running.current) {
      pending.current = true; // defer, never drop — see `pending` above
      return;
    }
    // ⚠️ A7 — AN ABSENT TOKEN IS "NOTHING YET", NOT "NOTHING EVER", and reading it as terminal was
    // the defect behind "my orders weren't linked". This component mounts with /account, which the
    // diner reaches BEFORE they sign in; at that moment `AccountUpgrade` has not minted anything, so
    // `readMergeToken()` is null on every first mount. Latching `done` there disarmed the redeemer
    // permanently, and the SIGNED_IN that arrives seconds later — after the token IS minted — hit
    // the guard above and returned. The merge never ran on the email-OTP path at all.
    //
    // Returning without latching costs a localStorage read per auth event and nothing else: there is
    // no network call until a token actually exists.
    const token = readMergeToken();
    if (!token) return;
    running.current = true;
    const mine = generation.current; // the identity this attempt is for — see `generation` above
    try {
      const res = await redeemMergeToken(token);
      // The handover happened while this was in flight: the account it asked about is signed out,
      // so its answer is about somebody else. Latching or clearing on it would spend the NEXT
      // guest's token. Dropped without touching a single ref — the reset already re-armed them.
      if (mine !== generation.current) return;
      if (res == null) {
        // Transient / not-signed-in-yet — keep the token; a later SIGNED_IN or /account load retries.
        running.current = false;
        return;
      }
      // Terminal: the token is spent (merged, or nothing-to-merge). Clear it; celebrate only if value moved.
      done.current = true;
      clearMergeToken();
      if (res.stars > 0 || res.coupons > 0) {
        setSummary(res);
        // Refresh the hub so the merged Stars/coupons/orders appear in RewardsHub + history behind the beat.
        startTransition(() => router.refresh());
      }
    } catch {
      if (mine === generation.current) running.current = false; // let a later event retry
    } finally {
      // Drain a deferred request, whatever the outcome above was. `done` short-circuits the re-entry
      // on a terminal result, so this only re-runs when there is genuinely something left to try —
      // and it runs in `finally` so a throw cannot strand a retry someone asked for.
      if (mine === generation.current && pending.current && !running.current) {
        pending.current = false;
        void attemptRef.current?.();
      }
    }
  }, [router, startTransition]);

  // The callback recurses through a ref, not through itself: naming `attempt` inside its own
  // `useCallback` body would make it its own dependency. The ref always holds the latest identity.
  const attemptRef = useRef<typeof attempt | null>(null);
  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  useEffect(() => {
    // Defer the mount attempt to the next frame so the setState it can reach isn't a synchronous
    // setState-in-effect (lint-safe, matching TierUpCelebration). The auth-listener attempt() below runs
    // from an event callback, where setState is allowed.
    const raf = requestAnimationFrame(() => void attempt());
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event, session) => {
      // Redeem the moment a REAL account confirms — `is_anonymous !== true` (a real account may surface the
      // flag as false OR omit it; only an anon session is explicitly `true`), so anon AnonAuthGate mints
      // never trip it. This only fires the ATTEMPT; the server redeem stays the authority (SSR-verifies a
      // non-anon caller before touching anything).
      // ⚠️ A HANDOVER RE-ARMS THE LATCHES, and without this they outlive the person they were set
      // for. `AccountStatus.toGuest()` signs out, mints a fresh anonymous session and calls
      // `router.refresh()` — which does NOT re-run client effects, and this component keeps its
      // tree position, so `done` stays true from the PREVIOUS guest's redemption. The next person
      // to sign in on that device hits the guard and their orders never follow them. A sign-out is
      // exactly the event that means "this device is someone else's now", so all three refs reset
      // there: `running` included, because a terminal redeem leaves it true and clearing `done`
      // alone would wedge the redeemer shut in the other direction.
      if (event === "SIGNED_OUT") {
        // Bumping FIRST: any attempt already awaiting the server is now stamped for the previous
        // identity and will discard its own result, so clearing `running` here cannot let a stale
        // completion through behind the fresh state.
        generation.current += 1;
        done.current = false;
        running.current = false;
        pending.current = false;
        return;
      }
      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        !!session?.user &&
        session.user.is_anonymous !== true
      ) {
        void attempt();
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      subscription.unsubscribe();
    };
  }, [attempt]);

  const dismiss = useCallback(() => {
    setSummary(null);
    const prev = restoreFocusRef.current;
    if (prev) requestAnimationFrame(() => prev.focus?.());
  }, []);

  // While shown: capture prior focus + move it into the dismiss button, wire Escape, and auto-dismiss.
  useEffect(() => {
    if (!summary) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    dismissRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(dismiss, DISMISS_MS);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [summary, dismiss]);

  if (!summary) return null;
  const { stars, coupons } = summary;

  return (
    <div className="merge-beat" role="status" onClick={dismiss}>
      {celebrate && <Confetti count={40} />}
      <div className="merge-beat-card">
        <span className="merge-beat-emoji" aria-hidden>
          ✦
        </span>
        <div className="merge-beat-kicker">Your Stars followed you</div>
        <div className="merge-beat-count">
          {stars} <span className="merge-beat-count-unit">{stars === 1 ? "Star" : "Stars"}</span>
        </div>
        <p className="merge-beat-sub">
          {coupons > 0
            ? `moved to this account, along with ${coupons} reward${coupons === 1 ? "" : "s"}.`
            : "moved to this account."}{" "}
          <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
            ကျေးဇူးတင်ပါတယ်
          </span>{" "}
          Kyay-zu tin ba deh.
        </p>
        <button
          ref={dismissRef}
          type="button"
          className="merge-beat-dismiss"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
        >
          Lovely!
        </button>
      </div>
    </div>
  );
}
