import { PageMasthead } from "@mms/ui";
import type { Metadata } from "next";
import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import {
  getRewardsState,
  getOrderHistory,
  getWelcomeBack,
  ensureProfile,
  getSessionKind,
} from "@/lib/rewards";
import { getMyLiveOrders } from "@/lib/orders";
import { getFavoriteDishes } from "@/lib/favorites";
import { chooserLeavesNote } from "@/lib/save-stars";
import { RewardsDetails, RewardsSummary } from "@/components/RewardsHub";
import { PaperAmbient } from "@/components/PaperAmbient";
import { OrderHistory } from "@/components/OrderHistory";
import { TodayOrders } from "@/components/TodayOrders";
import { AccountUpgrade } from "@/components/AccountUpgrade";
import { AccountStatus } from "@/components/AccountStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { AccountFavorites } from "@/components/AccountFavorites";
import { RememberIdentity } from "@/components/RememberIdentity";
import { MergeRedeemer } from "@/components/MergeRedeemer";
import { menuHref, menuLinkText } from "@/lib/menu-href";
import { firstNameOf } from "@/lib/deviceIdentity";

export const metadata: Metadata = { title: "Rewards & account · Morning Star" };

// /account — Morning Star Rewards hub + order history + the anon→account upgrade (M4 P4.1/P4.2). Server-
// rendered; the diner reads only their OWN rewards + orders (auth.uid()). ensureProfile() finalizes the
// profile row when an upgrade has just confirmed (e.g. the Google redirect returns here).
//
// Phase 1c · account-star — THE ORDER IS THE DESIGN: what is happening now (the live row), then what
// you own (identity — the save/sign-in door — and the Stars + the rewards you can spend today), then the
// record this app promised (five surfaces send diners here to find a receipt), then reference (the
// tier ladder, "How it works"), then settings. Plain JSX in that order, no section array standing in
// for the page — app/account/page.test.tsx renders THIS component and pins the order it produces.
// No hash/anchor landing: Next's loading boundary consumes a hash on the skeleton's commit, and the
// save card already sits at the top, where a plain /account navigation lands.
export default async function Account() {
  await ensureProfile();
  // W14: the two recognition reads (greeting + favorites) join the fan-out — both decorative,
  // both fail to a quiet default inside their own modules (never a broken account page).
  const [state, history, live, welcome, favorites] = await Promise.all([
    getRewardsState(),
    getOrderHistory(),
    getMyLiveOrders(),
    getWelcomeBack(),
    getFavoriteDishes(),
  ]);
  // The masthead recognition line — only when there is something REAL to recognize (a saved name
  // or a repeat month); absent data renders the masthead exactly as before, never a hollow greeting.
  const firstName = firstNameOf(welcome?.name ?? null);
  const repeatMonth = (welcome?.ordersThisMonth ?? 0) >= 2;
  // Phase 1c — a failed rewards read used to remove the identity card with it, so a guest who arrived
  // to SAVE landed on an alert with no save flow and no sign-in. Ask who this is, but ONLY on the
  // failed branch (a healthy visit pays for no extra staff lookup), and let a failed ask resolve to
  // "no card" — exactly today's degraded page, never a thrown one.
  const kind = state ? null : await getSessionKind().catch(() => null);

  return (
    // W22a — the paper ambient behind the account hub (no isolation: the page ground lives on
    // <html>, so the fixed z:-1 layer is visible without trapping the tier-up/merge overlays).
    <main className="page-col page-col-narrow" style={{ padding: 24 }}>
      <PaperAmbient />
      {/* K3b: redeems a merge token (minted while anon before a sign-into-existing) once signed in, then
          celebrates the carried-over Stars. Renders null until a merge actually lands — mounted for both
          the anon and upgraded views so it catches the sign-in transition either way. */}
      <MergeRedeemer />
      {/* Phase 0 — the shared page heading (`@mms/ui` PageMasthead): kicker → display title at the
          ONE heading weight (this page alone said 900, inline) → the Burmese line → the lede. The
          recognition line and the gold rule ride in the masthead's slot. */}
      <PageMasthead
        kicker="Mandalay Morning Star"
        kickerMark
        title="Rewards & account"
        titleMy="ဆုလက်ဆောင်နှင့် အကောင့်"
        lede="Earn Stars as you order — climb the gem tiers and unlock Kyay-Zu-Par! rewards."
      >
        {/* W14 — recognition, not decoration: this line renders ONLY when we truly know something
            (a saved name / a repeat month) — J-F's "visit N ≠ visit 1" without a hollow greeting. */}
        {(firstName || repeatMonth) && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--fs-sm)",
              fontWeight: "var(--fw-bold)",
              color: "var(--ac-strong)",
            }}
          >
            Mingalaba{firstName ? `, ${firstName}` : ""} <span aria-hidden>✦</span>
            {repeatMonth ? ` · ${welcome?.ordersThisMonth} orders this month` : ""}
          </p>
        )}
        <div className="account-masthead-rule" aria-hidden />
      </PageMasthead>

      {/* 1 · NOW — the diner's live orders (renders nothing when none). The ONLY order status on this
          route (the header pill is off here — two claims about one order is what W22b removed), seeded
          by the server snapshot and refreshed on wake/focus. Its rows link back to /track (resume=1):
          the documented way back after saving. */}
      <TodayOrders orders={live} />

      {/* W9c — the alert is a BANNER, not a replacement. Making `getRewardsState` fail loudly was
          right, but gating the whole page on it meant one failed rewards RPC also hid the order
          history — and /track, the /cart complete-order notice and the snapshot notice all send diners
          here specifically to find a receipt. Degrade the hub, never the history. */}
      {!state && (
        <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
          We couldn’t load your Stars and rewards just now — try again in a moment. Your orders are
          below either way.
        </p>
      )}

      {/* 2 · YOU — identity, directly under the live row: the save + sign-in door for a guest (K3a: a
          signed-in diner gets the quiet identity/sign-out card instead). On the failed branch a GUEST
          still gets the door, with stars={0} (its count-free copy — no number is claimed) and the
          count-free chooser note. `chooserNote` says what a Welcome-back chip tap would leave behind,
          BEFORE the tap (lib/save-stars.ts `chooserLeavesNote`). */}
      {state ? (
        <div style={{ marginBottom: "var(--s4)" }}>
          {state.isUpgraded ? (
            <>
              {/* K7: records this signed-in identity (hints only, no token) so the switcher can offer a
                  one-tap return next time; also clears any lingering lend flag. Renders null. */}
              <RememberIdentity displayName={state.displayName} tierId={state.tierId} />
              <AccountStatus
                email={state.email}
                displayName={state.displayName}
                tierId={state.tierId}
                stars={state.stars}
                memberSince={state.memberSince}
              />
            </>
          ) : (
            <AccountUpgrade
              stars={state.stars}
              chooserNote={chooserLeavesNote({ stars: state.stars, inProgress: live.length })}
            />
          )}
        </div>
      ) : kind === "anon" ? (
        <div style={{ marginBottom: "var(--s4)" }}>
          <AccountUpgrade
            stars={0}
            chooserNote={chooserLeavesNote({ stars: null, inProgress: live.length })}
          />
        </div>
      ) : null}

      {/* 3 · WHAT YOU OWN — the tier-up moment, the Stars ring, and the coupons spendable today. */}
      {state && <RewardsSummary state={state} />}

      {/* 4 · THE RECORD — W9c: the ORDERS sit OUTSIDE the rewards gate, and that placement is the whole
          point. An earlier attempt "fixed" this by rewriting `{!state ? alert : hub}` as `{!state &&
          alert}` + `{state && hub}` — semantically the identical tree, with the orders still inside it,
          while the new copy promised orders that were not rendered. A failed `mms_rewards_summary`
          must cost the diner their Stars panel, never their receipts. Pinned by
          app/account/page.test.tsx, which renders this page with the rewards read failing. */}
      {history === null ? (
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            margin: "0 0 var(--s4)",
            padding: "0 2px",
          }}
        >
          We couldn’t load your past orders just now — check back in a moment.
        </p>
      ) : (
        <OrderHistory entries={history} />
      )}

      {/* W14 — the hearts have a home on the profile (renders nothing without any). Below history:
          the hearts already live on the menu rail, where ordering happens. */}
      <AccountFavorites dishes={favorites} />

      {/* 5 · REFERENCE — the tier ladder + lifetime spend, then "How it works". */}
      {state && <RewardsDetails state={state} />}

      {/* 6 · SETTINGS — W22f: the ONE place sound can be switched on. It lives here, on the diner's own
          surface, rather than "beside reduced motion" as the proposal said: there is no reduced-motion
          control to sit beside (it is honored from the OS media query alone). Last, as in the
          prototype's account screen. */}
      <SoundToggle />

      <div style={{ marginTop: 8 }}>
        {/* W9a — /account is a side-room off every door, so there is no one mode to carry: route to
            the DOOR PICKER instead of a bare `/menu` (which silently defaults to scan-&-go). One tap
            more than a guess, and it can't strand a dine-in diner in a grocery session. */}
        <Link href={menuHref(null)} className="nav-link">
          <span aria-hidden className="nav-arrow nav-arrow-back">
            ←
          </span>{" "}
          {menuLinkText(null)}
        </Link>
      </div>
    </main>
  );
}
