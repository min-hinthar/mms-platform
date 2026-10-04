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
import { RewardsDetails, RewardsSummary } from "@/components/RewardsHub";
import { PaperAmbient } from "@/components/PaperAmbient";
import { OrderHistory } from "@/components/OrderHistory";
import { TodayOrders } from "@/components/TodayOrders";
import { AccountLiveOrders } from "@/components/AccountLiveOrders";
import { AccountUpgrade } from "@/components/AccountUpgrade";
import { AccountStatus } from "@/components/AccountStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { AccountFavorites } from "@/components/AccountFavorites";
import { AccountHelp } from "@/components/AccountHelp";
import { AccountHub } from "@/components/AccountHub";
import { RememberIdentity } from "@/components/RememberIdentity";
import { MergeRedeemer } from "@/components/MergeRedeemer";
import { accountPanel, accountPanelHref } from "@/lib/account-hub";
import { firstNameOf } from "@/lib/deviceIdentity";

export const metadata: Metadata = { title: "Rewards & account · Morning Star" };

// /account — Morning Star Rewards hub + order history + the anon→account upgrade (M4 P4.1/P4.2). Server-
// rendered; the diner reads only their OWN rewards + orders (auth.uid()). ensureProfile() finalizes the
// profile row when an upgrade has just confirmed (e.g. the Google redirect returns here).
//
// Phase 3a · D4 (`docs/PHASE3_JOURNEYS.md`) — THE HUB HAS THREE PANELS, and the panel is the design:
//   Orders  — what is happening now (the live row), then the record this app promised (five surfaces
//             send diners here to find a receipt), then the hearts.
//   Rewards — the Stars and the coupons spendable today, then the tier ladder and "How it works".
//   You     — who this is (the save / sign-in door for a guest, the quiet identity card for a member),
//             then settings, then help & contact.
// `lib/account-hub.ts` decides which opens (`?tab=`; a lend-mode `?resume=` opens You); the hub's
// tabs flip panels on the client with no refetch. Every panel is rendered here in that order, so
// app/account/page.test.tsx still reads the document order this component produces. No hash/anchor
// landing: Next's loading boundary consumes a hash on the skeleton's commit.
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    resume?: string;
    error_code?: string;
    error?: string;
    code?: string; // the OAuth return (PKCE) — lands on You, like the bounce (lib/account-hub.ts)
  }>;
}) {
  const [params] = await Promise.all([searchParams, ensureProfile()]);
  const panel = accountPanel(params);
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
  const guest = state ? !state.isUpgraded : kind === "anon";

  // 2 · YOU — identity: the save + sign-in door for a guest (K3a: a signed-in diner gets the quiet
  // identity/sign-out card instead). On the failed branch a GUEST still gets the door, with stars={0}
  // (its count-free copy — no number is claimed) and the count-free chooser note. `chooserStars` feeds
  // the note saying what a Welcome-back chip tap would leave behind, BEFORE the tap
  // (lib/save-stars.ts `chooserLeavesNote`), computed in the client from the refreshed live list.
  const identity = state ? (
    state.isUpgraded ? (
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
      <AccountUpgrade stars={state.stars} chooserStars={state.stars} />
    )
  ) : kind === "anon" ? (
    <AccountUpgrade stars={0} chooserStars={null} />
  ) : null;

  const orders = (
    <>
      {/* 1 · NOW — the diner's live orders (renders nothing when none). The ONLY order status on this
          route (the header pill is off here — two claims about one order is what W22b removed), seeded
          by the server snapshot and refreshed on wake/focus. Its rows link back to /track (resume=1). */}
      <TodayOrders />

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

      {/* Phase 3a — a guest's Stars live only on this phone, and the door that keeps them is one
          panel over. One quiet line here, so the pitch is never buried behind a tab; the full card
          (and its honest count) is on You. */}
      {guest && (
        <p className="account-save-line">
          <span aria-hidden>✦ </span>
          Your Stars live only on this phone.{" "}
          <Link href={accountPanelHref("you")} className="nav-link">
            Save them to an account{" "}
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </Link>
        </p>
      )}

      {/* 3 · THE RECORD — W9c: the ORDERS sit OUTSIDE the rewards gate, and that placement is the whole
          point. A failed `mms_rewards_summary` must cost the diner their Stars panel, never their
          receipts. Pinned by app/account/page.test.tsx, which renders this page with the rewards read
          failing. */}
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

      {/* W14 — the hearts have a home on the profile (renders nothing without any). */}
      <AccountFavorites dishes={favorites} />
    </>
  );

  const rewards = (
    <>
      {/* The tier-up moment, the Stars ring, and the coupons spendable today. */}
      {state && <RewardsSummary state={state} />}
      {/* The tier ladder + lifetime spend, then "How it works". */}
      {state && <RewardsDetails state={state} />}
      {!state && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", margin: 0 }}>
          Your Stars and rewards will show here once we can reach them again.
        </p>
      )}
    </>
  );

  const you = (
    <>
      {identity && <div style={{ marginBottom: "var(--s4)" }}>{identity}</div>}
      {/* Deep pass on #312 — a signed-in diner on the failed-read branch has no identity card (and
          no Switch account / lend door with it); the only explanation sat in the Orders panel. Say
          so here, as a plain line — never a second alert (one live region per view).
          Codex round 2 on #313 — `kind` is null when BOTH reads failed (the page swallows the second
          so the diner keeps their receipts), and null is not "signed in": the sentence promised a
          name and a switcher the server never established. Only a positively known diner or staff
          member gets that promise; the unknown case gets the Orders panel's neutral form. */}
      {!state && kind !== null && kind !== "anon" && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", margin: "0 0 var(--s4)" }}>
          We couldn’t load your account details just now — your name, Stars and the account switcher
          will be back here once we can reach them again.
        </p>
      )}
      {!state && kind === null && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", margin: "0 0 var(--s4)" }}>
          We couldn’t load your account details just now — check back in a moment.
        </p>
      )}
      {/* W22f: the ONE place sound can be switched on. */}
      <SoundToggle />
      {/* Phase 3a — help & contact, from lib/brand.ts (no hours: none exist anywhere). */}
      <AccountHelp />
    </>
  );

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
          ONE heading weight → the Burmese line → the lede. The recognition line and the gold rule
          ride in the masthead's slot. */}
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

      {/* Codex round 1 (Phase 1c) — ONE live-orders list for "Today" AND the chooser note on You,
          seeded by the server read and refreshed on wake/focus (components/AccountLiveOrders), so the
          note never names an order "Today" has already dropped. It wraps every panel and draws
          nothing. */}
      <AccountLiveOrders initial={live}>
        <AccountHub initial={panel} panels={{ orders, rewards, you }} />
      </AccountLiveOrders>
      {/* Phase 3a — the door-picker back link is gone: the Menu tab of the diner spine is the way
          back, and it carries the diner's own mode (a dine-in diner is not re-asked which door). */}
    </main>
  );
}
