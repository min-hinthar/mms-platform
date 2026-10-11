"use client";
import { useEffect, useRef, useState } from "react";
import type { CartItem } from "@mms/db";
import { KitchenTrack, type KitchenStage } from "@mms/ui";
import { DINER_STAGE_WORD } from "@/lib/line-state-copy";
import { passRowStage, trackLineOf } from "@/lib/live-pass";
import { rollUp } from "@/lib/kitchen-track";
import { useCart } from "./TableCartProvider";
import { menuHref, menuLinkText } from "@/lib/menu-href";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar

/**
 * J3 — the wait, designed (docs/JOURNEY_PLAN.md). A slim strip that narrates the meal's REAL kitchen
 * state — every word is a kitchen tap, never a guess: `fired` is the send, `in_progress` is the KDS
 * "Start" tap, `served` is its "Ready" tap (KdsBoard.tsx). No fabricated ETAs, no invented "on the
 * stove" — if the kitchen hasn't tapped, we don't narrate it.
 *
 * Right-moment prompts, both honest:
 *  - all-served → one quiet dessert/tea line (a sentence, not a modal — hospitality, not a nag);
 *  - ~20 minutes after we OBSERVE all-served (client-measured from the transition we watched, not a
 *    fabricated server time) → a gentle settle-up pointer.
 *
 * a11y: deliberately NOT a live region — kitchen transitions are AMBIENT state (the same discipline as
 * the never-announced rolling CartBar total): the strip is ordinary perceivable content that updates in
 * place, and the view keeps its ONE polite live region for transactional feedback. Entrance rides
 * `.mms-rise` (a mid-meal dynamic mount — J1's stagger memory must never zero it).
 *
 * Freshness: carts update live where a realtime subscription exists (group dine-in on the menu,
 * dine-in on /cart); EVERY mount also re-fetches on tab re-focus (the provider's and Checkout's
 * visibility refetch), so a backgrounded phone in a thick-walled teahouse never narrates a stale
 * state as current.
 *
 * PD10 (m10 appendix A6; PATH_DESIGN round 3, ONE KITCHEN TRACK) — the strip speaks the track's own
 * vocabulary: each dish's stage is `lib/kitchen-track.ts`'s (`passRowStage`, against the view's DB
 * clock — a bump counts as Served only once Mom's undo window has passed, as on the Bill's pass and
 * the TV), its words the family's console words (`DINER_STAGE_WORD`: "Served · ထုတ်ပြီး" — the
 * retired "ရောက်ပါပြီ" claimed a plate arrived, which nothing records — "Cooking", "Sent to
 * kitchen", never "Being made" / "With the kitchen"), and its mark the track's static glyph: the
 * breathing dot is gone (the motion language keeps PULSE for KDS Late alone). It is never drawn in
 * the same view as the One Pass (the Order stage and the menu only).
 */
export function TimelineStrip({
  items,
  onMenu = false,
  /** Menu mount: where the settle nudge's "order" link lands (the cart NEEDS its `?cart=` id — a bare
   *  /cart renders the not-available placeholder). Null → the nudge renders linkless, never a dead end. */
  cartHref = null,
  /** Checkout mount: the session MODE the dessert link should carry — not a pre-baked href. W9a takes
   *  the mode so the destination AND the label are derived together (`menuHref`/`menuLinkText`) and
   *  cannot drift: a bare /menu defaults to scan-&-go and would strand a dine-in diner's dessert in a
   *  phantom cart, while an unknown mode routes to the door picker, where "Back to the menu" would be
   *  a lie. `null` (the default, and the state `cart/page.tsx` produces on ANY split-context read
   *  failure) → door picker + honest label. */
  menuMode = null,
  /** PD10 — the applied view's DB clock (ISO) every stage is read against; "" (unknown) reads
   *  conservatively — a bump stays Cooking until a view brings a clock. */
  nowIso = "",
  /** Suppress the invitation notes (dessert / settle) while the cart can't accept them — a peer's
   *  pay-window lock. The kitchen counts stay: they're true regardless. */
  quiet = false,
  /** W9b — the table is settling its shares. This used to be folded into `quiet`, which deleted the
   *  ONE link that still worked: with the cart frozen, "settle up from your order" is the wrong
   *  invitation but the diner's own share is genuinely waiting for them. So it isn't quiet — it's a
   *  DIFFERENT note, and unlike the settle nudge it isn't gated on the 20-minute timer, because the
   *  bill is in motion now. Dessert stays suppressed: a frozen cart can't take an add. */
  settling = false,
}: {
  items: CartItem[];
  onMenu?: boolean;
  cartHref?: string | null;
  menuMode?: string | null;
  nowIso?: string;
  quiet?: boolean;
  settling?: boolean;
}) {
  // Real, countable kitchen states only (comped lines still cook — keep them; voided lines are gone),
  // each at its STAGE on the ONE KITCHEN TRACK (PD10): a draft has no stage here (the Send has not
  // happened), and a grocery line is off the track.
  const tracked = items
    .filter((l) => l.lineState !== "draft" && l.lineState !== "voided")
    .map((l) => ({ l, stage: passRowStage(l, nowIso) }))
    .filter((x): x is { l: CartItem; stage: KitchenStage } => x.stage !== null);
  const active = tracked.map((x) => x.l);
  const at = (...stages: KitchenStage[]) =>
    tracked.filter((x) => stages.includes(x.stage)).map((x) => x.l);
  const cooking = at("cooking");
  // Codex round 1 on #346 (N2) — SENT and SENDING are two stages, never one count: a line inside its
  // Send's undo grace is "Sending…" (the detail below says so, and Undo can still pull it back), so
  // counting it as "sent to kitchen" — or heading the strip "with the kitchen" on it — claims a
  // handover that has not happened.
  const sent = at("sent");
  const sending = at("sending");
  const served = at("served");
  const allServed =
    active.length > 0 && sending.length === 0 && sent.length === 0 && cooking.length === 0;
  // The head's mark: the roll-up — the least-advanced stage on the strip (the pass's own rule).
  const roll = rollUp(active.map(trackLineOf), nowIso).stage;
  // Counts are PLATES (qty-weighted), not lines — "3 cooking" for one qty-3 line is what the diner
  // ordered and what the kitchen is actually making.
  const plates = (ls: CartItem[]) => ls.reduce((n, l) => n + l.qty, 0);

  // The settle nudge: 20 minutes after the all-served transition WE observed. A ref timestamp (set on
  // the edge, cleared when new food fires) + a minute tick while relevant — client-measured, honestly
  // phrased as a pointer ("whenever you're ready"), never a claim about the kitchen or the bill.
  const servedAtRef = useRef<number | null>(null);
  const [settleNudge, setSettleNudge] = useState(false);
  // W18 (owner: "the kitchen card should be more interactive and informative when interacted") —
  // the strip opens into a per-dish view on tap. Same honesty rule as the strip itself: every row
  // is a real kitchen tap (fired / Start / Ready), never a guess. Declared with the other hooks —
  // NEVER after the `active.length === 0` early return below, which items can cross live.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!allServed) {
      servedAtRef.current = null;
      // Defer the reset out of the effect body (React Compiler discipline): only clear when shown.
      if (settleNudge) {
        const t = window.setTimeout(() => setSettleNudge(false), 0);
        return () => window.clearTimeout(t);
      }
      return;
    }
    servedAtRef.current ??= Date.now();
    // Interval-only (no synchronous first check — setState in an effect body is forbidden): the nudge
    // lands on a minute tick between 20 and 21 minutes, which is exactly as honest.
    const t = window.setInterval(() => {
      if (servedAtRef.current && Date.now() - servedAtRef.current >= 20 * 60 * 1000) {
        setSettleNudge(true);
      }
    }, 60 * 1000);
    return () => window.clearInterval(t);
  }, [allServed, settleNudge]);

  if (active.length === 0) return null;

  // Headline priority: the kitchen's LIVE tap (cooking) > queued (sent) > still in the Send's undo
  // grace (sending — the family's own word, never "with the kitchen") > done (all served).
  // J6 round framing: a REAL wave, not a coincidence of speed — "next round" only when every queued
  // line was FIRED after every served line's own send (mms_fire_cart stamps a batch with one
  // fire_at, so batch membership is recoverable from the stamps). A first send whose tea lands
  // while the mains still wait stays "Your order's with the kitchen" — same round, not a next one.
  // The plan's "if tables order in waves" condition is answered per-table, live, by the stamps.
  const fireMs = (l: CartItem) => (l.fireAt ? new Date(l.fireAt).getTime() : 0);
  const isNextRound =
    sent.length > 0 &&
    served.length > 0 &&
    Math.min(...sent.map(fireMs)) > Math.max(...served.map(fireMs));
  const headline =
    cooking.length === 1
      ? `${cooking[0]?.name ?? "Your dish"} is being made`
      : cooking.length > 1
        ? `${plates(cooking)} dishes are being made`
        : sent.length > 0
          ? isNextRound
            ? "Next round’s with the kitchen"
            : "Your order’s with the kitchen"
          : sending.length > 0
            ? DINER_STAGE_WORD.sending.en
            : "All served — enjoy!";

  const counts = [
    sending.length > 0 ? `${plates(sending)} sending` : null,
    sent.length > 0 ? `${plates(sent)} sent to kitchen` : null,
    cooking.length > 0 ? `${plates(cooking)} cooking` : null,
    served.length > 0 ? `${plates(served)} served` : null,
  ].filter(Boolean);

  // W18 — the friendly MY accent for each headline state (Register: conversational-polite, the
  // words a server would say at the table; pending K15 like all Claude-authored MY).
  const headlineMy =
    cooking.length > 0
      ? "ချက်နေပါပြီနော်"
      : sent.length > 0
        ? isNextRound
          ? "နောက်တစ်လှည့် မီးဖိုချောင်ထဲ ရောက်နေပါပြီ"
          : "မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်"
        : sending.length > 0
          ? DINER_STAGE_WORD.sending.my
          : "အားလုံး ရောက်ပါပြီ — သုံးဆောင်ပါနော်";

  // W18 → PD10 — the per-dish rows behind the tap. The STAGE per group, in kitchen order (cooking
  // first — it's the live tap — then sent, then still sending, then done), each drawn as the track's
  // glyph with its word (both tongues, `DINER_STAGE_WORD`), qty on the name the way the kitchen
  // reads it.
  const STAGE_ROWS: [stage: KitchenStage, lines: CartItem[]][] = [
    ["cooking", cooking],
    ["sent", sent],
    ["sending", sending],
    ["served", served],
  ];

  return (
    <section className="table-timeline mms-rise" aria-label="Kitchen status">
      {/* The whole header is the disclosure — a 44px tap that opens the dish-by-dish view. It was a
          static <p>; making it interactive is what the owner asked for, and the detail it reveals
          is the same kitchen-tap truth the strip already narrates, just per dish. */}
      <button
        type="button"
        className="table-timeline-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="table-timeline-head">
          {/* PD10 (A6) — the roll-up's STATIC track glyph (decorative: the headline says it). */}
          {roll && <KitchenTrack stage={roll} size="glyph" surface="theme" />}
          <span>
            {headline}
            <span lang="my" className="table-timeline-my">
              {headlineMy}
            </span>
          </span>
        </span>
        <span aria-hidden className={`table-timeline-chevron${expanded ? " is-open" : ""}`}>
          ›
        </span>
      </button>
      <p className="table-timeline-counts">{counts.join(" · ")}</p>
      {expanded && (
        <ul
          role="list"
          aria-label="Each dish’s kitchen status"
          className="table-timeline-detail mms-rise"
        >
          {STAGE_ROWS.filter(([, lines]) => lines.length > 0).map(([stage, lines]) => (
            <li key={stage}>
              <p className="table-timeline-detail-state">
                <KitchenTrack
                  stage={stage}
                  size="glyph"
                  surface="theme"
                  word={DINER_STAGE_WORD[stage]}
                />
              </p>
              <ul role="list" className="table-timeline-detail-lines">
                {lines.map((l) => (
                  <li key={l.id}>
                    {l.qty > 1 ? `${l.qty} × ` : ""}
                    {l.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {settling && (
        <p className="table-timeline-note">
          {onMenu && cartHref ? (
            <>
              Your table’s splitting the bill —{" "}
              <Link href={cartHref} className="nav-link">
                pay your share
              </Link>
              .
            </>
          ) : (
            <>Your table’s splitting the bill — pay your share below.</>
          )}
        </p>
      )}
      {allServed && !quiet && !settling && (
        <p className="table-timeline-note">
          {onMenu ? (
            <>Room for dessert or tea? The menu’s right here.</>
          ) : (
            <>
              Room for dessert or tea?{" "}
              <Link href={menuHref(menuMode)} className="nav-link">
                {menuLinkText(menuMode)}
              </Link>
            </>
          )}
        </p>
      )}
      {settleNudge && !quiet && !settling && (
        <p className="table-timeline-note">
          {onMenu ? (
            cartHref ? (
              <>
                Whenever you’re ready — pay from your{" "}
                <Link href={cartHref} className="nav-link">
                  order
                </Link>
                .
              </>
            ) : (
              <>Pay whenever you’re ready.</>
            )
          ) : (
            <>Whenever you’re ready — pay below.</>
          )}
        </p>
      )}
    </section>
  );
}

/** Menu mount: the provider's live items (group realtime + visibility refetch). The settle link
 *  carries the server-issued cart id (a bare /cart is a dead end). A peer's pay-window LOCK quiets the
 *  invitations — the menu can't accept an add and the moment passes on its own. Settling is passed
 *  through separately (W9b): it isn't a quiet moment, it's a call to go pay. */
export function MenuTimeline() {
  const { items, cartId, locked, settling, dbNow } = useCart();
  return (
    <TimelineStrip
      items={items}
      // PD10 — the provider's applied view's DB clock (the stages are read against it).
      nowIso={dbNow ?? ""}
      onMenu
      cartHref={cartId ? `/cart?cart=${encodeURIComponent(cartId)}` : null}
      // ⚠️ `quiet` MUST keep including `settling`. Narrowing it to `locked` alone (an earlier attempt
      // at de-duplicating this note against GuestList's banner) un-suppressed both invitation notes on
      // a FROZEN cart — "Room for dessert or tea?" and "settle up from your order" — which is the exact
      // wrong-invitation-on-a-frozen-cart defect W9b exists to remove. And the dedupe itself was dead
      // code: the provider defines `isGroup = mode === "dinein"` and only a dine-in cart can settle, so
      // `settling && !isGroup` is ALWAYS false. Overlapping slightly with GuestList's banner is a far
      // cheaper cost than either bug.
      quiet={locked || settling}
      settling={settling}
    />
  );
}
