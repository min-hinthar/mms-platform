import type { Metadata } from "next";
import { getRewardsState, ensureProfile } from "@/lib/rewards";
import { RewardsHub } from "@/components/RewardsHub";
import { AccountUpgrade } from "@/components/AccountUpgrade";

export const metadata: Metadata = { title: "Rewards & account · Morning Star" };

// /account — Morning Star Rewards hub + the anon→account upgrade (M4 P4.1). Server-rendered from the
// server-derived summary; the diner reads only their OWN rewards (auth.uid()). ensureProfile() finalizes
// the profile row when an upgrade has just confirmed (e.g. the Google redirect returns here).
export default async function Account() {
  await ensureProfile();
  const state = await getRewardsState();

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 4px", color: "var(--tx)" }}>
        Morning Star Rewards
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--t2)" }}>
        Earn Stars as you order — climb the gem tiers and unlock Kyay-Zu-Par! rewards.
      </p>

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
          {state.isUpgraded && (
            <p style={{ margin: "4px 2px 0", fontSize: 12.5, color: "var(--t3)" }}>
              Signed in as {state.email}. Your rewards are saved to your account.
            </p>
          )}
        </>
      )}
    </main>
  );
}
