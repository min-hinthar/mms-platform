"use client";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import { StarsRing } from "./StarsRing";
import type { RewardsProgress } from "@/lib/rewards";
import type { GoodbyeDoor } from "@/lib/save-stars";

/**
 * J4 — the goodbye beat (docs/JOURNEY_PLAN.md): the designed exit arc AFTER R7a's success spike. The
 * peak-end rule says the diner carries the END home — so the flow's last word is a warm, bilingual
 * thank-you, not a dead stop under a spent celebration.
 *
 * Every element is real data or honest copy:
 *  - The Stars ring is the SAME `StarsRing` the account hub renders — its CSS draw-on fills to the
 *    post-order cycle, and `getRewardsProgress` orders the summary read AFTER attribution, so the arc
 *    the diner watches fill already includes this order's Star. The Star visibly arrives into the
 *    ring; nothing is animated that isn't true. It mounts when the progress poll resolves — a designed
 *    arrival moment (`.mms-rise`), not a loading pop.
 *  - The ring + "saved to your account" claim render ONLY for the order's earner (split-tender stamps
 *    the HOST; a share-payer earned nothing and gets no claim — same rule as PaySuccess's pill).
 *  - The farewell is the brand's real one (ကျေးဇူးတင်ပါတယ် — "thank you"), `lang="my"` in the Padauk
 *    face for correct SR pronunciation: the J2 bilingual rule — journey copy carries its Burmese line
 *    as content, not decoration.
 *
 * Ambient (no live region): the tracker's single role="status" already announced the payment; the
 * goodbye is glanceable content — J3's timeline discipline.
 *
 * Phase 1c · account-star — ONE rewards door at a time. For a GUEST earner the save-your-Stars card
 * (SaveStarsPrompt, above this beat) is the door, so `door` — decided once by `successRewardsDoor`
 * in lib/save-stars.ts, never re-derived here — tells this beat what to render:
 *  - `link`    — today's sub-line and /account link, unchanged.
 *  - `pending` — attribution is not decided yet: no link (so none can appear and then vanish when
 *                the card takes over); the sub-line keeps its own rules.
 *  - `none`    — the card is the door: no link, and no guest "with your rewards" line, which would
 *                read as reassurance directly under the card's warning that guest Stars live only
 *                on this phone. (The signed-in line cannot co-occur: the card requires a guest.)
 */
export function GoodbyeBeat({
  progress,
  door,
}: {
  progress: RewardsProgress | null;
  door: GoodbyeDoor;
}) {
  const earned = !!progress?.earnedThisOrder;
  // Degenerate-summary guard (mirrors PaySuccess): if the summary RPC transiently failed inside
  // getRewardsProgress, the snapshot can read stars:0 / ordersToNext:0 with earnedThisOrder still
  // true — a "✦ 0" ring under "+1 Star earned" would be a lie. No ring beats a wrong ring.
  const ringSafe = earned && !!progress && progress.stars > 0 && progress.ordersToNext > 0;
  return (
    <section
      className="goodbye-beat mms-rise"
      aria-label="Thank you"
      style={{ animationDelay: "420ms" }}
    >
      {ringSafe && progress && (
        <div className="goodbye-beat-ring mms-rise">
          <StarsRing
            stars={progress.stars}
            milestoneStep={progress.milestoneStep}
            ordersToNext={progress.ordersToNext}
            tierId={progress.tierId}
            caption={
              progress.ordersToNext === 1
                ? "1 order to your next reward"
                : `${progress.ordersToNext} orders to your next reward`
            }
          />
        </div>
      )}
      <p className="goodbye-beat-line">
        <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
          ကျေးဇူးတင်ပါတယ်
        </span>
        Kyay-zu tin ba de — see you next time
      </p>
      {/* The Star claim is the EARNER's (the receipt card above carries the shared-element name on the
          same gate). "With your rewards", not "to your account": an anonymous diner's Stars are
          device-bound until they upgrade — /account itself says "add an email to save them to an
          account", and this beat must not promise the durability that card exists to offer. */}
      {/* K3a: warmer + still honest — a signed-in diner's Star really IS on their account; an anon
          diner's is device-bound, so keep the softer "with your rewards" (never over-claim durability). */}
      {earned && door !== "none" && (
        <p className="goodbye-beat-sub">
          {progress?.isUpgraded
            ? "Your Star and this receipt are saved to your account."
            : "Your Star and this receipt are with your rewards."}
        </p>
      )}
      {/* One rewards door for everyone on the fresh-payment mount (the tracker's bottom link yields
          to this one) — the earner follows their Star + receipt; a split share-payer still has their
          own rewards to visit, just no claim about THIS order. Only once `door` says so (above). */}
      {door === "link" && (
        <Link href="/account" className="nav-link">
          {earned ? "See them in your rewards" : "View your rewards"}{" "}
          <span aria-hidden className="nav-arrow nav-arrow-fwd">
            →
          </span>
        </Link>
      )}
    </section>
  );
}
