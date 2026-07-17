"use client";
import { useEffect, useState } from "react";
import { tierMeta, tierTint } from "@/lib/rewards-tiers";
import {
  readIdentities,
  forgetIdentity,
  forgetAllIdentities,
  readLend,
  maskEmail,
  type DeviceIdentity,
} from "@/lib/deviceIdentity";

/**
 * K7 shared-device — the "Welcome back" chooser. Renders the device's remembered prior sign-ins (display
 * HINTS only — no tokens; see deviceIdentity.ts) as one-tap re-auth chips above the email form on the
 * upgrade/switch card. Tapping a chip hands the identity back to AccountUpgrade, which owns the actual sign-in
 * (email → pre-filled OTP; google → one-tap OAuth) and SUPPRESSES the K3b merge — a switch never assumes the
 * current session's guest Stars are yours to bring (docs/SHARED_DEVICE.md).
 *
 * Privacy (owner chose "remember hint, easy to clear"): a per-chip "×" forgets one, and "Forget this device"
 * wipes the roster — important on a shared phone where the chips show a prior person's name/email.
 *
 * Hydration-safe: localStorage is client-only, so we render nothing on first paint and populate the list in an
 * effect (deferred state write, matching ActiveOrderProvider) — no SSR/client mismatch.
 */
export function WelcomeBackChooser({
  onSelect,
  busy,
  selectedEmail,
}: {
  /** Hand the chosen identity up to AccountUpgrade to drive the (merge-suppressed) sign-in. */
  onSelect: (identity: DeviceIdentity) => void;
  /** Disable taps while an auth request is in flight. */
  busy: boolean;
  /** The email currently mid-sign-in (from a `?resume=` return) — shows a spinner on that chip. */
  selectedEmail?: string | null;
}) {
  const [identities, setIdentities] = useState<DeviceIdentity[]>([]);
  const [ready, setReady] = useState(false); // gates the entrance animation to the post-hydration populate

  useEffect(() => {
    // Deferred read — first render is empty (SSR-parity), then the chips animate in. While the phone is LENT,
    // hide the OWNER's own chip: the friend is ordering as a guest and shouldn't be nudged to sign into the
    // owner's account (the owner returns via the banner's one-tap resume, not this chooser).
    const raf = requestAnimationFrame(() => {
      const lend = readLend();
      const owner = lend?.ownerEmail.toLowerCase();
      setIdentities(readIdentities().filter((i) => i.email.toLowerCase() !== owner));
      setReady(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!ready || identities.length === 0) return null;

  function forgetOne(email: string) {
    forgetIdentity(email);
    setIdentities((prev) => prev.filter((i) => i.email.toLowerCase() !== email.toLowerCase()));
  }
  function forgetAll() {
    forgetAllIdentities();
    setIdentities([]);
  }

  return (
    <section className="wb-chooser" aria-labelledby="wb-heading">
      <p id="wb-heading" className="wb-heading">
        Welcome back — pick up where you left off
      </p>
      <ul className="wb-list" role="list">
        {identities.map((id, i) => {
          const tier = tierMeta(id.tierId);
          const tint = tierTint(id.tierId);
          const who = id.firstName || maskEmail(id.email);
          const masked = maskEmail(id.email);
          const loading = !!selectedEmail && selectedEmail.toLowerCase() === id.email.toLowerCase();
          return (
            <li
              key={id.email}
              className="wb-row"
              role="listitem"
              style={{ ["--wb-i" as string]: i }}
            >
              <button
                type="button"
                className="wb-chip"
                disabled={busy}
                aria-busy={loading}
                onClick={() => onSelect(id)}
                aria-label={`Sign back in as ${who}, ${masked}, ${tier.english} tier, via ${
                  id.method === "google" ? "Google" : "email"
                }`}
              >
                <span
                  className="wb-avatar"
                  aria-hidden
                  style={{
                    background: `color-mix(in srgb, ${tint.fill} 16%, transparent)`,
                    borderColor: `color-mix(in srgb, ${tint.fill} 34%, transparent)`,
                    color: tint.text,
                  }}
                >
                  {tier.emoji}
                </span>
                <span className="wb-who">
                  <span className="wb-name">{who}</span>
                  <span className="wb-mail">{masked}</span>
                </span>
                <span className="wb-method" aria-hidden>
                  {loading ? "…" : id.method === "google" ? "Google" : "Email"}
                </span>
              </button>
              <button
                type="button"
                className="wb-forget"
                disabled={busy}
                onClick={() => forgetOne(id.email)}
                aria-label={`Forget ${who} on this device`}
              >
                <span aria-hidden>×</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="wb-forget-all nav-link" disabled={busy} onClick={forgetAll}>
        Not you? Forget this device
      </button>
      <p className="wb-divider" aria-hidden>
        or use another account
      </p>
    </section>
  );
}
