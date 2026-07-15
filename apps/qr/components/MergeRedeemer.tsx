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
  const dismissRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const attempt = useCallback(async () => {
    if (done.current || running.current) return;
    const token = readMergeToken();
    if (!token) {
      done.current = true; // no proof to redeem — nothing to do this session
      return;
    }
    running.current = true;
    try {
      const res = await redeemMergeToken(token);
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
      running.current = false; // let a later event retry
    }
  }, [router, startTransition]);

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
