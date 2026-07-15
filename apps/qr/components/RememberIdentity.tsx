"use client";
import { useEffect } from "react";
import { browserClient } from "@mms/db";
import { rememberIdentity, clearLend, firstNameOf } from "@/lib/deviceIdentity";

/**
 * K7 shared-device — records THIS signed-in diner as a remembered identity (display hints only, no token) so
 * the switcher can offer them a one-tap return next time. Mounted on /account's signed-in view; renders null.
 *
 * The method (email vs google) drives the fast re-auth path, so we read it from the confirmed session's
 * provider (never guessed). Also clears any lingering lend flag: a real signed-in account means the phone is
 * no longer "lent" — either the owner resumed or the friend signed into their own account.
 */
export function RememberIdentity({
  displayName,
  tierId,
}: {
  displayName: string | null;
  tierId: string;
}) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supa = browserClient();
        const {
          data: { user },
        } = await supa.auth.getUser();
        if (cancelled || !user || user.is_anonymous === true || !user.email) return;
        // Provider: 'google' if the Google identity is linked, else the email/OTP path.
        const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
        const method: "email" | "google" = providers.includes("google") ? "google" : "email";
        rememberIdentity({
          email: user.email,
          firstName: firstNameOf(displayName),
          tierId,
          method,
        });
        clearLend(); // signed in for real → not a lent phone anymore
      } catch {
        /* best-effort — a storage/auth hiccup just means no remembered chip; the account is unaffected */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [displayName, tierId]);
  return null;
}
