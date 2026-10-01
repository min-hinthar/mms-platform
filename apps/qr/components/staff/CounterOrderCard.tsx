"use client";
import type { MouseEvent } from "react";
import Link from "next/link";
import { Badge, Card, Icon } from "@mms/ui";
import type { CounterFloorRow } from "@/lib/floor-types";
import type { KdsThresholds } from "@/lib/kitchen-types";
import { kitchenSegments } from "@/lib/floor-kitchen";
import type { StaffLang } from "@/lib/staff-lang";
import { al, chromeVisible } from "@/lib/staff-labels";
import { plural, tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import { COUNTER_UNCOLLECTED_HOURS } from "@/lib/counter-order";
import type { RelativeAge } from "@/lib/relative-time";
import { Chrome } from "./Chrome";
import { RelativeAgeText, useRelativeAge } from "./RelativeTime";
import { useEchoesShown } from "./StaffLangProvider";
import { tableCardStyle } from "./TableCard";
import { FloorKitchenLine, kitchenSegKey } from "./FloorKitchenLine";

/** Preformatted money — the repo's counter idiom. Latin in both tongues: it rides the `{m}` slot,
 *  which `fill()` never localizes. */
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The row's own text, assembled for the NAME — every piece composed the way the card RENDERS it,
 * echo included, through `chromeVisible` (the one derivation), so an edit to `reg.row.*` moves both
 * the visible text and the accessible name and WCAG 2.5.3 containment cannot drift.
 *
 * ⚠️ Moved verbatim from the register page (A4·2), where it was a LIVE 2.5.3 failure once: built
 * from `ts()`/`tf()`, the name under `my` said only the Burmese halves of two echoed Chromes. The
 * echo passed here must match the `echo` prop on the matching `<Chrome>` below; the channel chip
 * deliberately has none — two scripts cannot legibly stack in a chip.
 *
 * ⚠️ AND `shown` MUST BE THE DEVICE'S (P2e review, A5). On a Burmese-only device the two echoed
 * `<Chrome>`s below drop their English; derived with the echo always on, this name spliced
 * "Walk-up" and "2 items · …" between Burmese runs the card no longer showed, so the card's text
 * was in its name only piecewise — never the one contiguous run WCAG 2.5.3 asks for.
 * `CounterOrderCard.test.tsx` reads the rendered card in all three modes.
 */
/** Phase 2g · P2fk — the uncollected badge's key: the pair is on the HOURS (`{n}`). */
const UNCOLLECTED_BADGE = plural(
  COUNTER_UNCOLLECTED_HOURS,
  "floor.counter.uncollected.badge.one",
  "floor.counter.uncollected.badge.many",
);

/** Phase 2g · P2fk — the uncollected badge's words exactly as it draws them (a badge: no echo), for
 *  a card's name. The lane's bag card reads the same words (`ExpoBoard`'s `UnpaidBagCard`). */
export function uncollectedBadgeWords(lang: StaffLang, shown: boolean): string {
  return chromeVisible(lang, UNCOLLECTED_BADGE, false, shown, { n: COUNTER_UNCOLLECTED_HOURS });
}

/** Phase 2g — the visible age as `RelativeAgeText` draws it (no echo), for the card's name. */
function ageWords(lang: StaffLang, shown: boolean, age: RelativeAge): string {
  return age.n === undefined
    ? chromeVisible(lang, age.k, false, shown)
    : chromeVisible(lang, age.k, false, shown, { n: age.n });
}

function subjectOf(lang: StaffLang, shown: boolean, r: CounterFloorRow, age: RelativeAge): string {
  const name = r.customerName ?? chromeVisible(lang, "reg.row.walkup", "inline", shown);
  const chipKey = r.source === "kiosk" ? "reg.row.kiosk" : "floor.counter.chip";
  const chip = chromeVisible(lang, chipKey, false, shown);
  const meta = chromeVisible(
    lang,
    plural(r.itemCount, "reg.row.one", "reg.row.many"),
    "inline",
    shown,
    { n: r.itemCount, m: fmt(r.subtotalCents) },
  );
  // Phase 2f — the unpaid row, in the order the card draws it: the flag (a badge: no echo), then the
  // kitchen's segments exactly as `FloorKitchenLine` renders them (no echo — a card row is a glance).
  const unpaid = r.unpaidSent ? `, ${chromeVisible(lang, "settle.unpaid", false, shown)}` : "";
  // Phase 2g · P2fk — the uncollected badge sits after Unpaid, so its words follow Unpaid's here.
  const uncollected = r.uncollected === true ? `, ${uncollectedBadgeWords(lang, shown)}` : "";
  const kitchen = kitchenSegments(r.kitchen)
    .map((seg) =>
      seg.k === "expo.kitchenDone"
        ? ts(lang, seg.k)
        : tf(lang, kitchenSegKey(seg.k, true), { n: seg.n }),
    )
    .join(" · ");
  // Phase 2g — the visible age closes the card, so it closes the name: it is visible text inside
  // the link, and the name must contain it (WCAG 2.5.3 — the blind pass's own rule for this card).
  return `${name} · ${chip}, ${meta}${unpaid}${uncollected}${kitchen ? `, ${kitchen}` : ""}, ${ageWords(lang, shown, age)}`;
}

/**
 * A4·2 — one open COUNTER order on the counter's one list, beside the tables. The same card surface
 * as `TableCard` (its exported styles, so the two cannot drift apart on one grid) and the same
 * whole-card link into the order screen the register queue's rows opened (`/staff/table/[id]/add`).
 * The channel chip is what tells it from a table at a glance: Counter, or Kiosk when the guest
 * built it themselves.
 */
export function CounterOrderCard({
  order,
  serverNow,
  lang,
  thresholds,
  frozen,
  opens = "pad",
  onOpen,
}: {
  /** Phase 2f — a register row with the floor's facts about it: sent unpaid, and its kitchen fold. */
  order: CounterFloorRow;
  serverNow: string;
  lang: StaffLang;
  thresholds: KdsThresholds;
  /** The floor is not updating (FloorKitchenLine's own prop; the counter card draws no wait pill). */
  frozen: boolean;
  /**
   * Phase 2g · P2fz — where the card goes. `"pad"` (the floor's card): Resume, into the order pad.
   * `"page"` (the oldest-first sheet): View, onto the order's own page — where it is paid for, or,
   * if nobody is coming, removed (the no-show lives there, never on the pad).
   */
  opens?: "pad" | "page";
  /** Phase 2g · P2fz — the sheet's click handler (it opens the counter's pane at split width). */
  onOpen?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  // The device's echo state — the value every `<Chrome>` on this card reads (P2e review, A5).
  const shown = useEchoesShown();
  // Phase 2g — the age the card draws, read ONCE, so the `<time>` and the name say the same thing.
  const age = useRelativeAge(order.startedAt, serverNow);
  // `kind: "subject"` — the verb LEADS the announcement ("Resume, Aye · Counter, 2 items · …") and
  // the card's own text is what the name must contain.
  const { aria } = al(lang, {
    kind: "subject",
    verb: opens === "page" ? "floor.verb.view" : "reg.verb.resume",
    subject: subjectOf(lang, shown, order, age),
  });
  return (
    <Card
      as={Link}
      href={
        opens === "page" ? `/staff/table/${order.sessionId}` : `/staff/table/${order.sessionId}/add`
      }
      onClick={onOpen}
      interactive
      textured
      style={tableCardStyle.card}
      aria-label={aria}
    >
      {/* Phase 2d · floor — the status edge the table cards wear, in the ordering tone: a counter
          order is being built. Decorative; the chip says what it is. */}
      <span className="floor-edge" data-tone="live" aria-hidden />
      <div style={tableCardStyle.topRow}>
        <span style={tableCardStyle.label}>
          {order.customerName ?? <Chrome lang={lang} k="reg.row.walkup" echo="inline" />}
        </span>
        {/* Decorative: the card's name already says the channel. `bordered` matches the sibling
            table cards' outlined status chip. */}
        <Badge tone="accent" bordered decorative>
          <Chrome
            lang={lang}
            k={order.source === "kiosk" ? "reg.row.kiosk" : "floor.counter.chip"}
          />
        </Badge>
      </div>
      <div style={tableCardStyle.metaRow}>
        <Chrome
          lang={lang}
          k={plural(order.itemCount, "reg.row.one", "reg.row.many")}
          vars={{ n: order.itemCount, m: fmt(order.subtotalCents) }}
          echo="inline"
        />
      </div>
      {/* Phase 2f — food on this order reached the kitchen before it was paid: the flag, then what
          the kitchen has of it. Both are in the card's name (`subjectOf`), in this order. */}
      {(order.unpaidSent || order.uncollected === true || order.kitchen) && (
        <div className="counter-card-kitchen">
          {order.unpaidSent && (
            <Badge tone="warn" bordered>
              <Icon name="receipt" size={14} aria-hidden />
              <Chrome lang={lang} k="settle.unpaid" />
            </Badge>
          )}
          {/* Phase 2g · P2fk — its food has waited past the horizon: a fact, after Unpaid, in the
              card's name in this order. A badge: no echo. */}
          {order.uncollected === true && (
            <Badge tone="warn" bordered>
              <Chrome lang={lang} k={UNCOLLECTED_BADGE} vars={{ n: COUNTER_UNCOLLECTED_HOURS }} />
            </Badge>
          )}
          {order.kitchen && (
            <FloorKitchenLine
              kitchen={order.kitchen}
              serverNow={serverNow}
              thresholds={thresholds}
              lang={lang}
              frozen={frozen}
              wait={false}
              pickup
            />
          )}
        </div>
      )}
      {/* No status line: a counter order's status IS that it is open, which the chip already says,
          and every visible word inside this link must be in its name (WCAG 2.5.3 — the blind pass
          caught a draft that drew "Order in progress" here and left it out of the name). */}
      <div style={tableCardStyle.bottomRow}>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          <RelativeAgeText iso={order.startedAt} age={age} lang={lang} />
        </span>
      </div>
    </Card>
  );
}
