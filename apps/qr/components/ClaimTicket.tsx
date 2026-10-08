"use client";
import { Icon } from "@mms/ui";
import { TRACK, trackFill } from "@/lib/i18n/track";
import type { TicketFace } from "@/lib/pickup-promise";

/**
 * PD3 — the claim ticket: ONE pass, two faces, the same footprint on every screen
 * (docs/path-design-2026-10-07/m3-pickup-promise.md; round-3 ONE PASS). It shows the booked time
 * while the guest waits and the six-character code at Ready — the time and the code trade places,
 * once, the shared TURN on the Y axis (two `--dur-base` halves, ease-in then `--ease-out`; instant
 * under reduced motion; latched once per order per tab by the host). Picked up settles it to REST.
 *
 * ⚠️ WAITS ON THE PRIMITIVES BRANCH (`claude/feat/pd-pass-primitives`): the ticket is the CounterPass
 * at its 40px holder tier — paper, dotted seam, 12px notches, `--pass-*` inks — and this file draws
 * NONE of that (never a parallel pass). Until that branch is merged here, `.claim-ticket` is a plain
 * card that hosts the two faces' CONTENT, so the faces, the turn, the sr twins and `ph-no-capture`
 * are built and tested now and the wrapper becomes `<CounterPass tier="holder">` in one edit.
 *
 * Every element that renders the code or the name carries `ph-no-capture` (PostHog autocapture is
 * on, and no element in the app opted out before this). The visible code is `aria-hidden` with an
 * sr-only spaced twin — the exit-pass pattern — so a hex tail is never read as one word.
 */
export type TurnPhase = "none" | "out" | "in";

export function ClaimTicket({
  face,
  turn,
  onTurnEnd,
  slotLabel,
  code,
  name,
  countdownMin,
  pickedUpLabel,
  labelId,
}: {
  face: TicketFace;
  /** The host's TURN state: `out` folds the time face away, `in` lands the pass face. */
  turn: TurnPhase;
  onTurnEnd: () => void;
  slotLabel: string;
  /** The six-character uuid tail, uppercased — the same code that heads Dad's bag card. */
  code: string;
  name: string | null;
  countdownMin: number | null;
  /** The REST face's stamp: the real `togo_picked_up_at` as a clock. */
  pickedUpLabel: string | null;
  /** The id the host's `<section aria-labelledby>` points at — the current face's kicker h2. */
  labelId: string;
}) {
  // While the time face folds away it is the one shown; the pass face appears at the swap.
  const shown: TicketFace = turn === "out" ? "time" : face;
  const spaced = code.split("").join(" ");
  const srCode = `Order reference ${spaced}`;
  return (
    <section
      className="claim-ticket card"
      aria-labelledby={labelId}
      data-face={shown}
      data-turn={turn === "none" ? undefined : turn}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        onTurnEnd();
      }}
    >
      {shown === "time" ? (
        <div className="claim-face claim-face-time">
          <div className="claim-main">
            {/* The kicker and the figure are ONE heading, read as Dad's string "Pickup 6:20 PM"
                (`expo.pickup`, lib/i18n/staff.ts). `.vt-order-status`: the header pill's morph partner
                lands on the ticket for pickup (B9 — the chip row is dropped on this page). */}
            <h2 id={labelId} className="claim-kicker vt-order-status">
              <span className="claim-kicker-en">{TRACK.kickerPickup.en}</span>
              <span aria-hidden className="claim-kicker-dot">
                {" · "}
              </span>
              <span lang="my" className="claim-kicker-my">
                {TRACK.kickerPickup.my}
              </span>
              <span className="exit-pass-code claim-figure">{slotLabel}</span>
            </h2>
            {/* The countdown is plain text: re-derived by the host's tick, never announced. From the
                slot onwards the slot is EMPTY (decision 14: "any minute now" retired). */}
            {countdownMin !== null && (
              <p className="claim-countdown">
                {trackFill("countdown", String(countdownMin)).en}
                <span lang="my" className="claim-countdown-my">
                  {trackFill("countdown", String(countdownMin)).my}
                </span>
              </p>
            )}
          </div>
          <dl className="claim-stub ph-no-capture">
            {name && (
              <div className="claim-stub-row">
                <dt>For</dt>
                <dd className="claim-stub-name">{name}</dd>
              </div>
            )}
            <div className="claim-stub-row">
              <dt>Code</dt>
              <dd className="claim-stub-code" aria-hidden>
                #{code}
              </dd>
              <dd className="sr-only">{srCode}</dd>
            </div>
          </dl>
        </div>
      ) : shown === "code" ? (
        <div className="claim-face claim-face-code">
          <div className="claim-main">
            {/* ✓ only at the terminal state — Ready on a pickup ticket (round 3, ONE PASS). */}
            <h2 id={labelId} className="claim-kicker claim-kicker-ready vt-order-status">
              <Icon name="check" size={16} aria-hidden />
              <span className="claim-kicker-en">{TRACK.kickerReady.en}</span>
              <span lang="my" className="claim-kicker-my">
                {TRACK.kickerReady.my}
              </span>
            </h2>
            <p className="exit-pass-code claim-figure ph-no-capture" aria-hidden>
              #{code}
            </p>
            <span className="sr-only">{srCode}</span>
            <p className="claim-sub">
              {TRACK.passSub.en}
              <span lang="my" className="claim-sub-my">
                {TRACK.passSub.my}
              </span>
            </p>
          </div>
          <dl className="claim-stub ph-no-capture">
            {name && (
              <div className="claim-stub-row">
                <dt>For</dt>
                <dd className="claim-stub-name">{name}</dd>
              </div>
            )}
            <div className="claim-stub-row">
              <dt>Pickup</dt>
              <dd className="claim-stub-time">{slotLabel}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="claim-face claim-face-rest">
          <div className="claim-main">
            <h2 id={labelId} className="claim-kicker claim-kicker-rest vt-order-status">
              <Icon name="check" size={16} aria-hidden />
              <span className="claim-kicker-en">
                {pickedUpLabel ? trackFill("kickerPickedUp", pickedUpLabel).en : "Picked up"}
              </span>
              <span lang="my" className="claim-kicker-my">
                {TRACK.kickerPickedUp.my}
              </span>
            </h2>
            <p className="exit-pass-code claim-figure claim-figure-rest ph-no-capture" aria-hidden>
              #{code}
            </p>
            <span className="sr-only">{srCode}</span>
            <p className="claim-sub">
              {TRACK.pickedUpSub.en}
              <span lang="my" className="claim-sub-my">
                {TRACK.pickedUpSub.my}
              </span>
            </p>
          </div>
          <dl className="claim-stub ph-no-capture">
            {name && (
              <div className="claim-stub-row">
                <dt>For</dt>
                <dd className="claim-stub-name">{name}</dd>
              </div>
            )}
            <div className="claim-stub-row">
              <dt>Pickup</dt>
              <dd className="claim-stub-time">{slotLabel}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
