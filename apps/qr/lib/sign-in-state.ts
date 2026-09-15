import type { StaffAuth, StaffCaller } from "./staff";

/**
 * A4·4 — the sign-in screen is ONE route (`/staff/login`) with states, and this is the rule that
 * picks the state. Pure, so the page is one `switch` and the order of the arms is pinned by a
 * value test rather than by reading the page.
 *
 * The four auth answers map like this:
 *
 *   · `unavailable` → **outage**. W10b: unknowable ≠ signed out. The old login rendered the FORM
 *     here, which on the folded screen is the worst misread available — a staff member who tapped
 *     "Your PIN" mid-outage would see the sign-in form and conclude they had been logged out.
 *     This answer is only ever reached with a session cookie present (a visitor with no session
 *     resolves to `anon` without a transport call), so the shell's "your sign-in is fine" is true.
 *   · `anon` → **form** (`denied` carried from the URL, so a bounce still explains itself).
 *   · `not_staff` → **form, denied**, whatever the URL said. The lock cookie can be set on a tablet
 *     a wrong account signed into; it must not turn this into a lock screen nobody can unlock.
 *   · `staff` → three arms, IN THIS ORDER:
 *       1. an explicit destination wins — `/staff/login?next=/kiosk` on the lobby iPad stays
 *          idempotent, and the destination gates itself (the lock is a `/staff`-scoped cookie the
 *          kiosk never sees; a `/staff` destination bounces to the lock on its own, as before);
 *       2. a locked tablet goes to the lock, like every other console page;
 *       3. otherwise the **signed-in** state — who you are, your PIN, sign out — the old
 *          `/staff/profile`, which now lives here. The arm carries the verified caller, so the
 *          page renders it without re-narrowing the auth it already resolved.
 *
 * `next` is `null` when the URL carried no `next` at all, and the VALIDATED path otherwise
 * (`safeNext` — so an off-origin or auth-endpoint destination has already fallen back to `/staff`
 * before it reaches this rule, and a fallen-back destination is still a destination).
 */
export type SignInState =
  | { kind: "outage" }
  | { kind: "form"; denied: boolean }
  | { kind: "redirect"; to: string }
  | { kind: "me"; caller: StaffCaller };

/** Where a locked tablet is sent — the one URL every console page redirects to under the lock. */
export const LOCK_ROUTE = "/staff/lock";

export function resolveSignInState(
  auth: StaffAuth,
  input: { locked: boolean; next: string | null; denied: boolean },
): SignInState {
  if (auth.kind === "unavailable") return { kind: "outage" };
  if (auth.kind === "not_staff") return { kind: "form", denied: true };
  if (auth.kind === "anon") return { kind: "form", denied: input.denied };
  if (input.next !== null) return { kind: "redirect", to: input.next };
  if (input.locked) return { kind: "redirect", to: LOCK_ROUTE };
  return { kind: "me", caller: auth.caller };
}
