"use client";
import { CounterPass } from "@mms/ui";
import { TRACK } from "@/lib/i18n/track";
import { trackFill, type TicketFace } from "@/lib/pickup-promise";

/**
 * PD3 — the claim ticket: the ONE PASS (`CounterPass`, `@mms/ui`) at its 40px holder tier, two faces
 * on the same footprint (docs/path-design-2026-10-07/m3-pickup-promise.md; round-3 ONE PASS; the
 * primitive's own build notes in m10 §H). It shows the booked time while the guest waits and the
 * six-character code at Ready — the time and the code trade places, once, the shared TURN on the
 * figure (the primitive's split-flap, keyed here on the face so it plays once; instant under reduced
 * motion); Picked up settles it to REST. Nothing here draws a perforation, a notch or a pass ink:
 * the primitive owns the paper, the seam, the stamp and the tiers.
 *
 * The faces, in the primitive's slots: the two-tongue label over the figure is Dad's `expo.pickup`
 * ("Pickup · လာယူချိန်") on every face; the figure is the slot label, then the code; the status slot
 * (`head`) carries the countdown while waiting and, at Ready, the ✓ (`terminal="ready"`, the ONLY
 * ✓ a pickup ticket draws) before the kicker word "Ready for pickup · ယူလို့ရပြီ"; the stub is the
 * `<dl>` (For · Code, then For · Pickup); the body carries the sub ("Show this code at the counter.").
 *
 * Privacy: `ph-no-capture` on the stub (the name and, while waiting, the code) and on the whole
 * ticket once the code is the figure (PostHog autocapture is on). The code is spelt for assistive
 * tech (`figureSpoken`), never read as a word; the stub's small code keeps the sr twin.
 */
export function ClaimTicket({
  face,
  turning,
  onTurnEnd,
  slotLabel,
  code,
  name,
  countdownMin,
  pickedUpLabel,
  labelId,
}: {
  face: TicketFace;
  /** The host observed the Ready edge this mount: play the TURN on the figure, once. */
  turning: boolean;
  onTurnEnd: () => void;
  slotLabel: string;
  /** The six-character uuid tail, uppercased — the same code that heads Dad's bag card. */
  code: string;
  name: string | null;
  countdownMin: number | null;
  /** The REST face's stamp: the real `togo_picked_up_at` as a clock. */
  pickedUpLabel: string | null;
  /** The ticket's heading id (the pass names itself by it). */
  labelId: string;
}) {
  const spaced = code.split("").join(" ");
  const forRow = name ? (
    <div className="claim-stub-row">
      <dt>For</dt>
      <dd className="claim-stub-name">{name}</dd>
    </div>
  ) : null;

  if (face === "time") {
    return (
      // `.vt-order-status`: the header pill's morph partner lands on the ticket for pickup (B9 — the
      // chip row is dropped on this page; the ticket is where the status lives).
      <div className="claim-ticket vt-order-status" data-face="time">
        <CounterPass
          tier="holder"
          figure={slotLabel}
          figureKind="code"
          label={TRACK.kickerPickup}
          lang="en"
          id={labelId}
          head={
            // The countdown is plain text: re-derived by the host's tick, never announced. From the
            // slot onwards the slot is EMPTY (decision 14: "any minute now" retired).
            countdownMin !== null ? (
              <span className="claim-countdown">
                <span className="claim-countdown-en">
                  {trackFill("countdown", String(countdownMin)).en}
                </span>
                <span lang="my" className="claim-countdown-my">
                  {trackFill("countdown", String(countdownMin)).my}
                </span>
              </span>
            ) : undefined
          }
          stub={
            <dl className="claim-stub ph-no-capture">
              {forRow}
              <div className="claim-stub-row">
                <dt>Code</dt>
                <dd className="claim-stub-code" aria-hidden>
                  #{code}
                </dd>
                <dd className="sr-only">{`Order reference ${spaced}`}</dd>
              </div>
            </dl>
          }
        />
      </div>
    );
  }

  const rest = face === "rest";
  return (
    <div
      className={`claim-ticket vt-order-status ph-no-capture${rest ? " claim-ticket-rest" : ""}`}
      data-face={face}
      onAnimationEnd={(e) => {
        // The primitive's TURN runs on its figure; the host clears the hook when it lands so a later
        // re-render never replays it (the key below already starts it exactly once per face).
        if (turning && (e.target as HTMLElement).classList?.contains("ui-pass-figure")) onTurnEnd();
      }}
    >
      <CounterPass
        key={face}
        tier="holder"
        figure={`#${code}`}
        figureKind="code"
        figureSpoken={spaced}
        label={TRACK.kickerPickup}
        lang="en"
        id={labelId}
        terminal={rest ? undefined : "ready"}
        turning={turning ? "figure" : undefined}
        head={
          <span className="claim-kicker">
            <span className="claim-kicker-en">
              {rest
                ? pickedUpLabel
                  ? trackFill("kickerPickedUp", pickedUpLabel).en
                  : "Picked up"
                : TRACK.kickerReady.en}
            </span>
            <span aria-hidden className="claim-kicker-dot">
              {" · "}
            </span>
            <span lang="my" className="claim-kicker-my">
              {rest ? TRACK.kickerPickedUp.my : TRACK.kickerReady.my}
            </span>
          </span>
        }
        stub={
          <dl className="claim-stub">
            {forRow}
            <div className="claim-stub-row">
              <dt>Pickup</dt>
              <dd className="claim-stub-time">{slotLabel}</dd>
            </div>
          </dl>
        }
      >
        <p className="claim-sub">
          {rest ? TRACK.pickedUpSub.en : TRACK.passSub.en}
          <span lang="my" className="claim-sub-my">
            {rest ? TRACK.pickedUpSub.my : TRACK.passSub.my}
          </span>
        </p>
      </CounterPass>
    </div>
  );
}
