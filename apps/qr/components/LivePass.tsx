"use client";
import type { CSSProperties, ReactNode } from "react";
import type { CartItem } from "@mms/db";
import { CounterPass, KitchenTrack, NumberFlow } from "@mms/ui";
import { BILL_GROUPS } from "@/lib/bill-groups";
import { t } from "@/lib/i18n";
import { STAFF } from "@/lib/i18n/staff";
import { DINER_STAGE_WORD } from "@/lib/line-state-copy";
import { passClock, passHead, passRowStage } from "@/lib/live-pass";
import { passIdentity } from "@/lib/pass-identity";

/**
 * PD10 (PATH_DESIGN_2026-10-07 decision 10; m10 screens 1 and 2) — THE GUEST'S LIVE ONE PASS: the
 * Bill's receipt rows as the body of post-pay's `CounterPass`, RENDERED (never redrawn — round 3,
 * ONE PASS), each dish carrying the ONE KITCHEN TRACK. Before C2 it is PD2's counter-only Bill with
 * live tracks (open risk 15, decided YES in round 3); after the flip the same pass heads the
 * served-gated Bill and, boarded, the pay step.
 *
 * ANATOMY (m10 A1–A3 · B2–B6, and the primitive's own decisions):
 *  - the HEAD is the roll-up — the least-advanced stage across the dishes (`lib/kitchen-track.ts`
 *    `rollUp`, never a ladder of our own) — as the track's glyph and its word; nothing breathes,
 *    and no ✓ is drawn (a dine-in pass's only ✓ is the Paid stamp, post-pay's screen 3);
 *  - ONE identity figure under "Table · စားပွဲ" at the 40px holder tier (`passIdentity`: a table
 *    with no number yet prints "Aye’s table" / "Your table", never its join code);
 *  - the STUB holds the person and the time: Host (the name Dad's floor card shows, "You" on the
 *    host's own phone; omitted at a hostless table) and Sent (the earliest fire time past its grace,
 *    on the restaurant's clock — `passSentAt`);
 *  - the BODY: the dishes in CART order (rows never re-sort under a thumb), each `qty × name`, the
 *    Burmese name, the price, the charged options and the diner's note (the receipt line's own
 *    format, on the boarded pay step too), then the track and its word — Sent to kitchen · ပို့ပြီး, Cooking ·
 *    ချက်နေဆဲ, Served · ထုတ်ပြီး, the family's console words (`DINER_STAGE_WORD`) — and the owner on
 *    a group table. A draft is the hollow ring, never a track; a to-go draft keeps its shipped "goes
 *    to the kitchen when you pay"; a comped dish keeps its track (it still cooks); a voided one is
 *    struck and "Removed"; a grocery line is "In your basket". The host's money rows ride in as
 *    `children`; the FOOT is the one total binding the page shares (`orderTotalCents`), "Estimated
 *    total · includes $X tip" once a tip is lit;
 *  - constant paper in both themes: every ink inside is a `--pass-*` token (`.live-pass*`,
 *    `check-pass-inks.mjs`), and the hosted money rows read the theme tokens remapped onto them.
 *
 * MOTION is the host's, one thing at a time (`planPassMotion`): `filling` names the ONE row whose
 * newly reached segment FILLs, `turning` plays the head's TURN when the roll-up reaches Served.
 * Nothing moves on a first read, and nothing is announced: kitchen progress is ambient (the view
 * keeps its one live region). The pass hosts no controls.
 *
 * `boarded` is the pay step's variant (m10 screen 2): the rows the charge was minted from, compact —
 * their options and notes kept, but no track, no word, no owner (the head already says where the kitchen is, and the payer pays the
 * whole order). Amounts are never computed here: prices are the server's line cents, the foot is
 * the caller's binding.
 */
export function LivePass({
  items,
  nowIso,
  tableNumber,
  hostName,
  hostLabel,
  ownerOf,
  totalCents,
  tipCents,
  filling,
  turning,
  boarded = false,
  children,
}: {
  items: CartItem[];
  /** The applied view's DB clock (`viewClockIso`) — every stage is read against it, never this
   *  phone's clock. */
  nowIso: string;
  tableNumber: number | null;
  /** The host's chosen name (`chosenName`) — the identity of a table with no number yet. */
  hostName: string | null;
  /** The stub's Host field: "You", the host's chosen name, or null (a hostless or unnamed host —
   *  the field is omitted rather than printing "Guest" as a person). */
  hostLabel: string | null;
  /** A group table's per-dish owner ("You" / a name), or null on a solo table. */
  ownerOf: ((i: CartItem) => string | null) | null;
  /** The ONE total binding (`orderTotalCents` on the Bill, `payTotals.totalCents` boarded). */
  totalCents: number;
  /** The previewed tip inside `totalCents` (0 while held, parked or boarded). */
  tipCents: number;
  /** The line whose newly reached segment FILLs now, or null. */
  filling: string | null;
  /** The head's TURN plays now (the roll-up just reached Served). */
  turning: boolean;
  boarded?: boolean;
  /** The money rows (a `<dl>`), between the dishes and the foot. */
  children?: ReactNode;
}) {
  const head = passHead(items, nowIso);
  const sent = head.sentAt ? passClock(head.sentAt) : "";
  const present = BILL_GROUPS.filter(([, k]) => items.some((i) => i.fulfillment === k));
  const showHeadings = present.length > 1;
  const estimated = tipCents > 0;
  return (
    <div className="live-pass" style={{ "--pass-hole": "var(--pg)" } as CSSProperties}>
      <CounterPass
        tier="holder"
        {...passIdentity(tableNumber, hostName)}
        label={{ en: "Table", my: STAFF["floor.table"].my.replace(" {id}", "") }}
        lang="en"
        head={
          head.stage ? (
            <KitchenTrack stage={head.stage} size="glyph" word={DINER_STAGE_WORD[head.stage]} />
          ) : undefined
        }
        stub={
          hostLabel || sent ? (
            <dl className="live-pass-stub ph-no-capture">
              {hostLabel && (
                <div>
                  <dt>Host</dt>
                  <dd>{hostLabel}</dd>
                </div>
              )}
              {sent && (
                <div>
                  <dt>Sent</dt>
                  <dd>{sent}</dd>
                </div>
              )}
            </dl>
          ) : undefined
        }
        turning={turning ? "head" : undefined}
        tear
      >
        <div className="live-pass-body">
          {present.map(([label, key]) => (
            <div key={key} className="live-pass-group">
              {showHeadings && <p className="live-pass-group-h">{label}</p>}
              <ul
                role="list"
                aria-label={showHeadings ? label : t("en", "yourBill")}
                className="live-pass-dishes"
                data-boarded={boarded || undefined}
              >
                {items
                  .filter((i) => i.fulfillment === key)
                  .map((i) => (
                    <DishRow
                      key={i.id}
                      item={i}
                      nowIso={nowIso}
                      owner={boarded ? null : (ownerOf?.(i) ?? null)}
                      filling={filling === i.id}
                      boarded={boarded}
                    />
                  ))}
              </ul>
            </div>
          ))}
          {children}
          <div className="live-pass-foot">
            <span className="live-pass-foot-label">
              {t("en", estimated ? "estimatedTotal" : "rowTotal")}
              <span lang="my" className="live-pass-foot-my">
                {t("my", estimated ? "estimatedTotal" : "rowTotal")}
              </span>
              {estimated && (
                <span className="live-pass-foot-tip">
                  includes ${(tipCents / 100).toFixed(2)} tip
                </span>
              )}
            </span>
            <span className="live-pass-foot-amount vt-cart-total">
              <NumberFlow
                value={totalCents / 100}
                format={{ style: "currency", currency: "USD" }}
              />
            </span>
          </div>
        </div>
      </CounterPass>
    </div>
  );
}

/** One dish: line 1 the name and the price; line 2 the track and its word (never on a boarded pass). */
function DishRow({
  item,
  nowIso,
  owner,
  filling,
  boarded,
}: {
  item: CartItem;
  nowIso: string;
  owner: string | null;
  filling: boolean;
  boarded: boolean;
}) {
  const struck = item.comped || item.lineState === "voided";
  const stage = passRowStage(item, nowIso);
  return (
    <li className="live-pass-dish" data-voided={item.lineState === "voided" || undefined}>
      <span className="live-pass-dish-line">
        <span className="live-pass-dish-name">
          {item.qty > 1 && <span className="tn">{item.qty} × </span>}
          {item.name}
          {item.nameMy && (
            <span lang="my" className="live-pass-dish-my">
              {item.nameMy}
            </span>
          )}
        </span>
        <span className="live-pass-dish-price" data-struck={struck || undefined}>
          ${((item.unitPriceCents * item.qty) / 100).toFixed(2)}
        </span>
      </span>
      {/* Codex round 1 on #346 (N1) — the options the line was CHARGED for and the diner's note (an
          allergy, "no peanuts"), exactly as the receipt line had them: on the full pass AND boarded,
          so the payer can still check what they pay for, and the kitchen's note stays in sight. */}
      {(item.modifiers.length > 0 || item.notes) && (
        <span className="live-pass-dish-mods">
          {item.modifiers.join(", ")}
          {item.modifiers.length > 0 && item.notes ? " · " : ""}
          {item.notes ? `“${item.notes}”` : ""}
        </span>
      )}
      {!boarded && (
        <span className="live-pass-dish-state">
          {item.lineState === "voided" ? (
            <span className="live-pass-dish-note">Removed</span>
          ) : item.fulfillment === "grocery" ? (
            <span className="live-pass-dish-note">In your basket</span>
          ) : item.lineState === "draft" && item.fulfillment === "togo" ? (
            <>
              {/* The hollow ring (the shared "not sent" mark), decorative: the shipped sentence
                  carries the state, and stays true at the counter (D5, Codex round 3). */}
              <KitchenTrack stage="unsent" size="row" />
              <span className="live-pass-dish-note">
                Not sent yet — goes to the kitchen when you pay
              </span>
            </>
          ) : stage ? (
            <KitchenTrack
              stage={stage}
              size="row"
              word={DINER_STAGE_WORD[stage]}
              filling={filling}
            />
          ) : null}
          {item.comped && item.lineState !== "voided" && (
            <>
              <span aria-hidden className="live-pass-dot">
                ·
              </span>
              <span className="live-pass-dish-note">On the house</span>
            </>
          )}
          {owner && (
            <>
              <span aria-hidden className="live-pass-dot">
                ·
              </span>
              <span className="live-pass-owner ph-no-capture">{owner}</span>
            </>
          )}
        </span>
      )}
    </li>
  );
}
