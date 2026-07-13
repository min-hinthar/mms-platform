"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@mms/db";
import { getRewardsBadge, type RewardsBadge } from "@/lib/rewards";

/**
 * K3a — the client's read of the diner's rewards badge (Stars + tier + upgraded) for the persistent
 * wallet chip. Fetches on mount, again when `refetchKey` changes (a caller passes the order/route key
 * so a webhook-stamped Star refreshes after the diner leaves /track), and on an auth change (anon →
 * upgrade flips `isUpgraded` live without a reload). A transient failure leaves the last value (or
 * null) — the caller renders a quiet fallback, never an error. Mirrors the proven AppHeader pattern;
 * the balance is the server-derived `getRewardsBadge` value (the client never computes it).
 */
export function useRewardsBadge(refetchKey?: string): RewardsBadge | null {
  const [badge, setBadge] = useState<RewardsBadge | null>(null);

  useEffect(() => {
    let active = true;
    getRewardsBadge()
      .then((b) => {
        if (active) setBadge(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refetchKey]);

  useEffect(() => {
    let active = true;
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        getRewardsBadge()
          .then((b) => {
            if (active) setBadge(b);
          })
          .catch(() => {});
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return badge;
}
