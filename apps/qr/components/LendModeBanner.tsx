"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readLend, LEND_CHANGE_EVENT, type LendState } from "@/lib/deviceIdentity";

/**
 * K7 shared-device — the global "ordering for a friend" ribbon. Shows whenever the phone is in LEND mode (the
 * owner tapped "Order for a friend": signed out to a clean guest session, stashing their greeting hint). It
 * rides every diner surface as a sticky strip below the header so the friend always knows they're a guest and
 * the owner can get back in one tap. Resolves to null off lend mode / on /staff.
 *
 * "Done — back to [owner]" routes to /account?resume=<email>, where AccountUpgrade fires the owner's fast
 * re-auth (merge-suppressed — the friend's guest Stars are NOT swept onto the owner). The flag also clears
 * automatically when anyone signs in for real (RememberIdentity) — so a friend signing into their OWN account
 * ends lend mode too.
 *
 * Hydration-safe: localStorage is client-only, so it renders null on first paint and reads the flag in an
 * effect. Re-reads on the same-tab LEND_CHANGE_EVENT, a cross-tab `storage` event, and every navigation.
 */
export function LendModeBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [lend, setLend] = useState<LendState | null>(null);

  const refresh = useCallback(() => setLend(readLend()), []);

  useEffect(() => {
    const raf = requestAnimationFrame(refresh); // deferred first read (SSR parity)
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "mms.lend") refresh();
    };
    window.addEventListener(LEND_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(LEND_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  // Re-read on navigation (entering lend mode does a router.refresh, not a remount). Deferred to the next
  // frame so the read's setState isn't a synchronous setState-in-effect (lint-safe, matching the mount read).
  useEffect(() => {
    const raf = requestAnimationFrame(refresh);
    return () => cancelAnimationFrame(raf);
  }, [pathname, refresh]);

  if (!lend || pathname?.startsWith("/staff")) return null;
  const owner = lend.ownerFirstName?.trim() || "your account";

  return (
    <div className="lend-banner" aria-label="Ordering for a friend">
      <span className="lend-banner-glyph" aria-hidden>
        ✦
      </span>
      <p className="lend-banner-copy">
        <strong>Ordering for a friend</strong>
        <span className="lend-banner-sub"> — browsing as a guest, {owner}’s Stars are safe.</span>
      </p>
      <button
        type="button"
        className="lend-banner-back"
        onClick={() => router.push(`/account?resume=${encodeURIComponent(lend.ownerEmail)}`)}
      >
        Done — back to {owner}
      </button>
    </div>
  );
}
