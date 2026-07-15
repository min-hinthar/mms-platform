# Shared-device account experience — switch, remember, lend

**Status:** shipped (PR #131) · gate green · pre-PR + pre-merge adversarial passes (SHIP; findings folded) · **Phase:** K7 (follow-on to Journey II) · **Branch:** `claude/app-ui-security-branding-ezpqkq`

The scenario the owner raised: _"a friend is ordering for a friend on my device and wants to switch back to
their own account."_ Today the QR app has **no logged-out state and no account switcher** — signing out drops
you to a fresh anonymous guest, and coming back means re-doing the whole email-OTP / Google flow from scratch.
Worse, a sign-in from an anonymous session that has earned Stars **merges those Stars onto the account you sign
into** (K3b) — so on a shared phone, whoever signs in next can sweep the current guest's Stars.

This phase makes switching **convenient and safe** without weakening the security model.

## The one hard constraint (why "convenient" ≠ "one-tap silent restore")

On a **shared** device we must **never** silently persist more than one account's session/refresh tokens.
Doing so would let anyone holding the phone into every "remembered" account — a real account-takeover hole. So
the world-class pattern here is a **fast, pre-filled, one-tap _re-auth_**, not a zero-tap session restore. That
is both the correct security posture and how good shared-device account pickers work.

**What we store on the device (localStorage, `mms.identities`): display _hints only_ — never tokens.**

```ts
type DeviceIdentity = {
  email: string;              // PII, but the user's own device; "Forget this device" wipes it
  firstName: string | null;   // greeting only
  tierId: string;             // tier emoji/label on the chip (display hint)
  method: "email" | "google"; // drives the fast re-auth path
  lastSeen: number;           // LRU ordering (cap 3)
};
```

A forged/edited hint grants **nothing** — the actual sign-in is still a real OTP / OAuth round trip, and every
rewards/orders read stays uid-scoped + RLS-gated server-side. The hint only saves typing.

## Three parts

### 1 — "Switch account" affordance (reframe)

The signed-in `AccountStatus` card gains an explicit **Switch account** action distinct from **Sign out**
(different mental model: hand-off vs. leaving). Switch = sign out → re-mint a fresh anonymous guest → land on
the sign-in chooser, with the honest reassurance that _your Stars stay on your account — sign back in anytime._

### 2 — Remembered identities (the "Welcome back" chooser)

`WelcomeBackChooser` renders remembered-identity chips above the email form on the guest upgrade/switch card.
Tap a chip:

- **email** → pre-fills the address, sends the OTP, jumps straight to the code step (one tap → enter code).
- **google** → one-tap OAuth (near-instant if still signed into Google).

Privacy (owner's choice: _remember hint, easy to clear_): each chip has a **×** remove, and the card carries a
prominent **"Not you? Forget this device"** that wipes the whole list.

**Merge rule — the safety hinge.** A chip is an explicit _switch_ to a known prior identity, so the fast
re-auth **suppresses the K3b merge token** — the current session's guest Stars are _not_ assumed to be yours to
bring. Only a genuine first-time guest who _types_ an email/uses Google to **save their own Stars** mints a
merge token. (Upgrading the same anon uid in place already keeps Stars with no merge.)

| Path | uid change | Merge token? |
| --- | --- | --- |
| Upgrade in place (new email on this anon uid) | no | no (same user) |
| Typed email is taken → sign into it ("save my Stars") | yes | **yes** — bring guest Stars |
| Tap a **Welcome back** chip (switch) | yes | **no** — Stars aren't assumed mine |
| Lend-mode **Done → back to owner** | yes | **no** — the guest Stars are the friend's |

### 3 — "Ordering for a friend?" lend-device mode

From the signed-in card: **Order for a friend**. It signs the owner out, mints a **fresh 0-Star anonymous
guest** (so the friend browses/orders on a clean session that never touches the owner's account), and sets a
lend flag (`mms.lend`, with the owner's greeting hint + a 12h TTL so a days-later session can't show a stale
banner).

A global `LendModeBanner` then rides every surface — _"Guest mode · ordering for a friend"_ + **Done — back to
[owner]**. Resolution:

- **Owner taps Done** → fast re-auth of the owner's remembered identity (no merge) → lend clears.
- **Friend signs into _their own_ account** → lend clears (it's their session now; a later owner return is
  just a normal switch). Whether their lend-session guest Stars follow depends on _how_ they sign in — the
  typed-taken-email / Google path brings them (`bringStars: true`); a remembered-chip tap suppresses (their
  few session Stars stay on the guest uid). Both err safe — a switch never mis-attributes Stars.
- **Friend just orders as a guest and hands back** → owner resumes (no merge); the friend's guest Stars stay on
  the abandoned anon uid (correct — they chose to stay a guest).

This mode is the _structural_ fix for the merge footgun: the friend can never be signed into the owner's
account, and the owner can never inherit the friend's Stars.

## a11y / motion / fidelity bar

- Chips + banner are real controls: ≥44px targets, accessible names, `role="list"` on the chip list, focus
  moved on step change, decorative glyphs `aria-hidden`, one live region per view.
- Motion (chip entrance, banner slide) is pure CSS with a `@media (prefers-reduced-motion: reduce)`
  off-switch; transform/opacity only.
- Tokens only (no hardcoded colors); copy is bilingual-aware and honest (no promise the code doesn't keep).

## Files

| File | Role |
| --- | --- |
| `apps/qr/lib/deviceIdentity.ts` | localStorage store — identities (hints, no tokens) + lend flag, all try/catch |
| `apps/qr/components/WelcomeBackChooser.tsx` | remembered-identity chips + "Forget this device" |
| `apps/qr/components/LendModeBanner.tsx` | global lend ribbon + "Done — back to [owner]" |
| `apps/qr/components/RememberIdentity.tsx` | records the signed-in identity hint + clears lend on any real sign-in |
| `apps/qr/components/AccountStatus.tsx` | + Switch account · Order for a friend actions |
| `apps/qr/components/AccountUpgrade.tsx` | integrates the chooser, fast re-auth, merge-suppression, `?resume=` |
| `apps/qr/app/layout.tsx` | mounts the global `LendModeBanner` |
| `apps/qr/app/globals.css` | chip + banner vocabulary |

## Honest limits

- Fast re-auth is still a real OTP/OAuth step (by design — no silent multi-session on a shared phone).
- Identity hints include the email (PII) on the device; mitigated by the prominent, one-tap "Forget this
  device" and per-chip removal (the owner chose _remember hint, easy to clear_).
- Server stays the sole authority on rewards/orders; hints are display-only and grant no access.
