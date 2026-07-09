import type { Metadata } from "next";
import Link from "next/link";
import { getRewardsState, getOrderHistory, ensureProfile } from "@/lib/rewards";
import { RewardsHub } from "@/components/RewardsHub";
import { OrderHistory } from "@/components/OrderHistory";
import { AccountUpgrade } from "@/components/AccountUpgrade";

export const metadata: Metadata = { title: "Rewards & account · Morning Star" };

// /account — Morning Star Rewards hub + order history + the anon→account upgrade (M4 P4.1/P4.2). Server-
// rendered; the diner reads only their OWN rewards + orders (auth.uid()). ensureProfile() finalizes the
// profile row when an upgrade has just confirmed (e.g. the Google redirect returns here).
export default async function Account() {
  await ensureProfile();
  const [state, history] = await Promise.all([getRewardsState(), getOrderHistory()]);

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <header className="account-masthead">
        <p className="eyebrow" style={{ margin: 0 }}>
          <span aria-hidden>✦ </span>Mandalay Morning Star
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: "2px 0 0", color: "var(--tx)" }}>
          Rewards &amp; account
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--t2)", lineHeight: 1.5 }}>
          Earn Stars as you order — climb the gem tiers and unlock Kyay-Zu-Par! rewards.
        </p>
        <div className="account-masthead-rule" aria-hidden />
      </header>

      {!state ? (
        <p role="alert" style={{ fontSize: 14, color: "var(--warn)" }}>
          We couldn’t load your rewards just now. Pull to refresh, or try again in a moment.
        </p>
      ) : (
        <>
          {!state.isUpgraded && (
            <div style={{ marginBottom: "var(--s4)" }}>
              <AccountUpgrade />
            </div>
          )}
          <RewardsHub state={state} />
          {history.length > 0 && <OrderHistory entries={history} />}
          {state.isUpgraded && (
            <p style={{ margin: "4px 2px 0", fontSize: 12.5, color: "var(--t3)" }}>
              Signed in as {state.email}. Your rewards are saved to your account.
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: 8 }}>
        <Link href="/menu" className="nav-link">
          <span aria-hidden className="nav-arrow nav-arrow-back">
            ←
          </span>{" "}
          Back to menu
        </Link>
      </div>
    </main>
  );
}
