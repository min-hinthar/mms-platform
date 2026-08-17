import type { Metadata } from "next";
import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { getRewardsState, getOrderHistory, getWelcomeBack, ensureProfile } from "@/lib/rewards";
import { getMyLiveOrders } from "@/lib/orders";
import { getFavoriteDishes } from "@/lib/favorites";
import { RewardsHub } from "@/components/RewardsHub";
import { PaperAmbient } from "@/components/PaperAmbient";
import { OrderHistory } from "@/components/OrderHistory";
import { TodayOrders } from "@/components/TodayOrders";
import { AccountUpgrade } from "@/components/AccountUpgrade";
import { AccountStatus } from "@/components/AccountStatus";
import { AccountFavorites } from "@/components/AccountFavorites";
import { RememberIdentity } from "@/components/RememberIdentity";
import { MergeRedeemer } from "@/components/MergeRedeemer";
import { menuHref, menuLinkText } from "@/lib/menu-href";
import { firstNameOf } from "@/lib/deviceIdentity";

export const metadata: Metadata = { title: "Rewards & account · Morning Star" };

// /account — Morning Star Rewards hub + order history + the anon→account upgrade (M4 P4.1/P4.2). Server-
// rendered; the diner reads only their OWN rewards + orders (auth.uid()). ensureProfile() finalizes the
// profile row when an upgrade has just confirmed (e.g. the Google redirect returns here).
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

  return (
    // W22a — the paper ambient behind the account hub (no isolation: the page ground lives on
    // <html>, so the fixed z:-1 layer is visible without trapping the tier-up/merge overlays).
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <PaperAmbient />
      {/* K3b: redeems a merge token (minted while anon before a sign-into-existing) once signed in, then
          celebrates the carried-over Stars. Renders null until a merge actually lands — mounted for both
          the anon and upgraded views so it catches the sign-in transition either way. */}
      <MergeRedeemer />
      <header className="account-masthead">
        <p className="eyebrow" style={{ margin: 0 }}>
          <span aria-hidden>✦ </span>Mandalay Morning Star
        </p>
        <h1
          style={{
            fontSize: "var(--fs-h1)",
            fontWeight: 900,
            margin: "2px 0 0",
            color: "var(--tx)",
          }}
        >
          Rewards &amp; account
          {/* W14 — the bilingual heading accent (the W12/W13 idiom: lang="my" + Padauk; K15
              flags every new Burmese string for Min's native check). */}
          <span
            lang="my"
            style={{
              display: "block",
              fontFamily: "var(--font-my)",
              fontSize: "var(--fs-sm)",
              fontWeight: 400,
              color: "var(--t2)",
              marginTop: 2,
            }}
          >
            ဆုလက်ဆောင်နှင့် အကောင့်
          </span>
        </h1>
        {/* W14 — recognition, not decoration: this line renders ONLY when we truly know something
            (a saved name / a repeat month) — J-F's "visit N ≠ visit 1" without a hollow greeting. */}
        {(firstName || repeatMonth) && (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "var(--fs-sm)",
              fontWeight: 700,
              color: "var(--ac-strong)",
            }}
          >
            Mingalaba{firstName ? `, ${firstName}` : ""} <span aria-hidden>✦</span>
            {repeatMonth ? ` · ${welcome?.ordersThisMonth} orders this month` : ""}
          </p>
        )}
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            lineHeight: 1.5,
          }}
        >
          Earn Stars as you order — climb the gem tiers and unlock Kyay-Zu-Par! rewards.
        </p>
        <div className="account-masthead-rule" aria-hidden />
      </header>

      {/* W9c — the alert is now a BANNER, not a replacement. Making `getRewardsState` fail loudly was
          right, but gating the whole page on it meant one failed rewards RPC also hid the order
          history — and /track, the /cart complete-order notice and the snapshot notice all send diners
          here specifically to find a receipt. Degrade the hub, never the history. */}
      {!state && (
        <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
          We couldn’t load your Stars and rewards just now — try again in a moment. Your orders are
          below either way.
        </p>
      )}
      {state && (
        <>
          {/* K3a: quiet when signed in — an upgraded diner gets an identity/sign-out status card
              instead of the "Save your Stars" upgrade pitch. */}
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
              <AccountUpgrade stars={state.stars} />
            )}
          </div>
          <RewardsHub state={state} />
          {/* K3a: the old "Signed in as …" footer note is now the AccountStatus card above. */}
        </>
      )}

      {/* W9c — the ORDERS sit OUTSIDE the rewards gate, and that placement is the whole point. An
          earlier attempt "fixed" this by rewriting `{!state ? alert : hub}` as `{!state && alert}` +
          `{state && hub}` — semantically the identical tree, with the orders still inside it, while
          the new copy promised orders that were not rendered. A failed `mms_rewards_summary` must
          cost the diner their Stars panel, never their receipts: /track's "Find it in your account",
          /cart's "See it in your account" and the tracker's snapshot notice all send them here for
          exactly this list. */}
      {/* W14 — the hearts finally have a home on the profile (renders nothing without any). */}
      <AccountFavorites dishes={favorites} />
      <TodayOrders orders={live} />
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
