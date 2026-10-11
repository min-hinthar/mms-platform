import type { ReactNode } from "react";
import { Card, CounterPass, Icon, buttonClass } from "@mms/ui";
import type { HelpDoorScreen } from "@/lib/help";
import type { KdsSize } from "@/lib/kds-size";
import type { StaffLang } from "@/lib/staff-lang";
import { STAFF, ts } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { floorStatusKey } from "@/lib/staff-labels";
import { FLOOR_TONE_GLYPH, floorTone } from "@/lib/floor-tone";
import { DEFAULT_KDS_THRESHOLDS, kdsBadgeKeys, type KdsLevel } from "@/lib/kds-urgency";
import { qtyStands } from "@/lib/kds-line";
import { relativeAge } from "@/lib/relative-time";
import { quickCashTenders } from "@/lib/register-math";
import { noteLabel } from "@/lib/money-input";
import { CLEAR_UNDO_MS } from "@/lib/clear-window";
import { GUIDE_SAMPLE, type GuidePicture as GuidePictureId } from "@/lib/staff-guide";
import type { FloorStatus } from "@/lib/floor-types";
import { Chrome } from "./Chrome";
import { FloorKitchenLine } from "./FloorKitchenLine";
import { FloorStatusChip } from "./FloorStatusChip";
import { KdsStopCard } from "./KdsStopCard";
import { RelativeAgeText } from "./RelativeTime";
import { TicketLineText } from "./TicketText";
import { tableCardStyle } from "./TableCard";
import { bumpBtn, pickedBtn, readyBtn } from "./expo-stage";
import { START_ARM, START_GRID, START_WALKUP_REST } from "./register-stage";

/**
 * P7·3 — the "picture" on each help card: a STATIC replica of the real control in the real
 * control's OWN DECLARATION — its class where the control has one (`.kds-bump`, `.kds-line-more`
 * and the primitive Button's `buttonClass`, `.staff-circ`, `.expo-status`), its exported style object where it is styled inline
 * (`expo-stage.ts`, `register-stage.ts`, `tableCardStyle`), and for the undo pill the one CSS rule that names both the
 * button and the replica. NEVER a new class that copies the look: the blind pass on the first draft
 * found the takeaway stages drawn green and inverted, the undo pill in the bar's colours, the
 * Screens circle wearing the bar's STATIC mark, and the kitchen's amber strip on the takeaway card —
 * four drawings of controls that do not exist, on the surface built to stop exactly that.
 *
 * Decorative and inert — `aria-hidden`, no pointer events (`.help-pic` in globals.css) — the card's
 * sentence carries the meaning. Under Burmese the replica's label comes through <Chrome> like the
 * original's, so it is marked and in the right face.
 *
 * help-1 — a `help-pic-*` class is PLACEMENT ONLY (where a replica sits), never a size, a colour
 * or a border: `HelpPicture.test.tsx` parses the stylesheet and refuses any paint on one. The
 * board's `--kfs-*` tier is declared on `.help-pic` too, and each dial stop is restated for
 * `.help-pic[data-size]` (the Help sheet is portaled outside `.kds-root`, so the bump's
 * `--kfs-clock` used to resolve to nothing and a copy-class sized it; and a picture that only knew
 * Small sat beside a board dialed to Large). The board's size arrives as `size` and is stamped on
 * the picture, so every kitchen replica is the control at the size the board is drawing.
 */
export function HelpPicture({
  screen,
  n,
  lang,
  size,
}: {
  screen: HelpDoorScreen;
  n: number;
  lang: StaffLang;
  /** The board's text size, when the screen has a dial — the kitchen replicas follow it. */
  size?: KdsSize;
}) {
  return (
    <div className="help-pic" aria-hidden data-size={size}>
      {screen === "kitchen" && n === 1 && (
        <span className="kds-bump help-pic-bump">
          <Chrome lang={lang} k="kds.bump" echo="stack" />{" "}
          <Icon name="check" size={22} strokeWidth={2.25} style={{ verticalAlign: "-3px" }} />
        </span>
      )}
      {screen === "kitchen" && n === 2 && (
        // The bar is `.kds-undo` itself (a fixed bar on the board, static here); the pill shares the
        // `.kds-undo button` rule by selector — see globals.css.
        <span className="kds-undo help-pic-undo">
          <span>
            <Chrome lang={lang} k="kds.undo.bumped" vars={{ x: "T4" }} />
          </span>
          <span className="help-pic-undo-btn">
            <Chrome lang={lang} k="kds.undo" />
          </span>
        </span>
      )}
      {screen === "kitchen" && n === 3 && (
        // Phase 2b — the 86 lives behind the line's ⋯ (`.kds-line-more`), then the sheet's danger
        // xl Button (the primitive's own `buttonClass`): the two taps the card's sentence names.
        <span className="help-pic-pair">
          <span className="kds-line-more">
            <Icon name="more" strokeWidth={2.25} />
          </span>
          <span className="help-pic-arrow">→</span>
          <span className={buttonClass({ variant: "danger", size: "xl" })}>
            <Chrome lang={lang} k="kds.86" echo="stack" />
          </span>
        </span>
      )}
      {screen === "kitchen" && n === 4 && (
        // help-1 — the fire button inside the REAL held ticket's shell (`.kds-ticket.kds-ticket-held`:
        // the ticket's own hairline, dashed and dimmed by the board's own rule), never a dashed box
        // drawn for the card. The bump keeps the ticket's own margin, so `help-pic-bump` is not here.
        <span className="kds-ticket kds-ticket-held help-pic-ticket">
          <span className="kds-bump kds-bump-fire">
            <Chrome lang={lang} k="kds.fire" echo="stack" />
          </span>
        </span>
      )}
      {screen === "counter" && n === 1 && (
        // Phase 2d · floor — the Start zone as it renders now: its own grid (`START_GRID`), Walk-up
        // in the primitive Button's own class (`START_WALKUP_REST`), Phone order in the arm class
        // (none open, so no cap) — and beside them one FREE table tile in the strip's own class,
        // because the card's second sentence sends a table there — inside the strip's OWN track
        // (`.floor-strip`), which is what sizes a tile (60–96px); `.floor-tile` is `width: 100%`,
        // so without the track it stretched to the picture's whole line. `.help-pic` sets
        // pointer-events: none, so neither press can fire on a picture.
        <span className="help-pic-start">
          <span className={START_GRID}>
            <span className={START_WALKUP_REST}>
              <Chrome lang={lang} k="reg.start.walkup" echo="stack" />
            </span>
            <span className={START_ARM}>
              <Chrome lang={lang} k="reg.start.phone" echo="stack" />
            </span>
          </span>
          <span className="floor-strip">
            <span className="floor-tile" data-free="">
              <span className="floor-tile-n">7</span>
              <span className="floor-tile-verb">
                <Chrome lang={lang} k="floor.verb.start" />
              </span>
            </span>
          </span>
        </span>
      )}
      {screen === "counter" && n === 2 && (
        // A floor table card: the same `<Card textured>` in `TableCard`'s own styles, with the real
        // status chip — and (Phase 2d) the card's own status edge in the ordering tone.
        <Card textured style={tableCardStyle.card}>
          <span className="floor-edge" data-tone="live" />
          <div style={tableCardStyle.topRow}>
            <span style={tableCardStyle.label}>
              <Chrome lang={lang} k="floor.table" vars={{ id: "7" }} />
            </span>
          </div>
          <div style={tableCardStyle.metaRow}>
            <FloorStatusChip status="ordering" lang={lang} />
          </div>
        </Card>
      )}
      {screen === "counter" && n === 3 && (
        // A4·2 — the takeaway lane's two stages, the board's own style objects (`expo-stage.ts`):
        // the first stage the accent, the second a plain card, the arrow between them.
        <span className="help-pic-pair">
          <span className="staff-btn help-pic-stage" style={{ ...bumpBtn, ...readyBtn }}>
            <Chrome lang={lang} k="expo.verb.bagged" echo="stack" />
          </span>
          <span className="help-pic-arrow">→</span>
          <span className="staff-btn help-pic-stage" style={{ ...bumpBtn, ...pickedBtn }}>
            <Chrome lang={lang} k="expo.verb.pickedUp" echo="stack" />
          </span>
        </span>
      )}
      {screen === "counter" && n === 4 && (
        // The lane's own status line in its warn state (`.expo-status-warn`) — it has no strip; the
        // amber strip is a KITCHEN ticket header and never appears on this screen.
        <span className="expo-status expo-status-warn">
          <Chrome lang={lang} k="out.head.notUpdating" echo="stack" />
        </span>
      )}
      {screen === "counter" && n === 5 && (
        // The Screens circle is a CONTROL (`StaffBar`'s `.staff-circ` link), never the bar's static
        // `.staff-circ-here` mark.
        <span className="staff-circ">
          <Icon name="grid" size={20} />
        </span>
      )}
      {screen === "counter" && n === 6 && (
        <span className="staff-circ">
          <Icon name="lock" size={20} />
        </span>
      )}
    </div>
  );
}

// ═══ PD12 · the staff step guides' pictures (m12 "Point and Call") ═══════════════════════════════
//
// The same discipline as the cards above, one step further: each picture is the REAL control — the
// shipped component where one renders from props alone (`FloorKitchenLine`, `FloorStatusChip`,
// `CounterPass`, `KdsStopCard`, `TicketLineText`), else the control's own classes and style objects —
// at its real size, cropped by the well (`.guide-well`, a fixed-height `.help-pic`). A `guide-pic-*`
// class is PLACEMENT ONLY, held by the same parsed paint refusal as `help-pic-*`
// (`HelpPicture.test.tsx`). The well is `aria-hidden` AND `inert`, so a real control inside it can
// never be focused or tapped; the step's title and sentence carry the meaning.
//
// Motion (m12 B2): the picture plays its control's OWN shipped motion — the board's arrival flash
// (`.kds-flash`) on kitchen 1 and 2, the till's `mms-pop` on the change figure on counter 4 — only
// when `motion` (the step's first showing), and both classes carry their shipped reduced-motion
// escort. Every other step draws its final frame, still: a tile changing tone is INSTANT
// (globals.css), a MARK never moves, the stop card is ALARM without motion, and a Late strip is
// drawn without its pulse (B1: no guide picture pulses — the board's ONE motion stays the board's).

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The catalog's own names for the kitchen pictures' dishes (`docs/data/MENU_REFERENCE.md`). */
const DISH = {
  curry: { name: "Chicken Curry", nameMy: "ကြက်သားဟင်း" },
  mohinga: { name: "Mohinga", nameMy: "မုန့်ဟင်းခါး" },
  shan: { name: "Shan Noodles", nameMy: "ရှမ်းခေါက်ဆွဲ" },
  tea: { name: "Burmese Milk Tea", nameMy: "လက်ဖက်ရည်" },
  sago: { name: "Coconut Sago", nameMy: "အုန်းနို့သာကူ" },
} as const;
type Dish = (typeof DISH)[keyof typeof DISH];

/** A fixed instant for the pictures' ages (never the device clock: a picture does not tick). */
const PIC_NOW = Date.parse("2026-10-07T19:00:00.000Z");
const minsBefore = (m: number) => new Date(PIC_NOW - m * 60_000).toISOString();
/** The pane's two-tongue table label (FloorDetailLive's `TABLE_LABEL`). */
const TABLE_LABEL = { en: STAFF["floor.table.label"].en, my: STAFF["floor.table.label"].my };

export function GuidePicture({
  picture,
  lang,
  size,
  motion,
}: {
  picture: GuidePictureId;
  lang: StaffLang;
  /** The board's text size — the kitchen pictures follow the dial (`.help-pic[data-size]`). */
  size?: KdsSize;
  /** The step's first showing: play the control's own motion once. A revisit draws the end frame. */
  motion: boolean;
}) {
  return (
    <div
      className="help-pic guide-well"
      aria-hidden
      inert
      data-picture={picture}
      data-size={picture.startsWith("kitchen.") ? size : undefined}
    >
      {picture === "counter.floor" && <CounterFloorPic lang={lang} />}
      {picture === "counter.ring" && <CounterRingPic lang={lang} />}
      {picture === "counter.ask" && <CounterAskPic lang={lang} />}
      {picture === "counter.cash" && <CounterCashPic lang={lang} motion={motion} />}
      {picture === "counter.clear" && <CounterClearPic lang={lang} />}
      {picture === "kitchen.card" && <KitchenCardPic lang={lang} motion={motion} />}
      {picture === "kitchen.round" && <KitchenRoundPic lang={lang} motion={motion} />}
      {picture === "kitchen.bump" && <KitchenBumpPic lang={lang} />}
      {picture === "kitchen.late" && <KitchenLatePic lang={lang} />}
      {picture === "kitchen.stop" && <KitchenStopPic />}
    </div>
  );
}

/** A strip tile as `TableStrip` draws it: a FREE tile (dashed, its number, "Start") or a table in its
 *  tone (its number, the tone's glyph). */
function StripTile({
  n,
  status,
  lang,
}: {
  n: number;
  status: FloorStatus | null;
  lang: StaffLang;
}) {
  if (status === null)
    return (
      <span className="floor-tile" data-free="">
        <span className="floor-tile-n">{n}</span>
        <span className="floor-tile-verb">
          <Chrome lang={lang} k="floor.verb.start" />
        </span>
      </span>
    );
  const tone = floorTone(status, null);
  return (
    <span className="floor-tile" data-tone={tone}>
      <span className="floor-tile-n">{n}</span>
      <Icon
        name={FLOOR_TONE_GLYPH[tone]}
        size={18}
        strokeWidth={2.25}
        className="floor-tile-glyph"
      />
    </span>
  );
}

/** The strip's key, as `TableStrip` draws it (aria-hidden there too). */
function StripKey({ statuses, lang }: { statuses: readonly FloorStatus[]; lang: StaffLang }) {
  return (
    <span className="floor-key">
      {statuses.map((st) => {
        const tone = floorTone(st, null);
        return (
          <span key={st} className="floor-key-item" data-tone={tone}>
            <Icon
              name={FLOOR_TONE_GLYPH[tone]}
              size={16}
              strokeWidth={2.25}
              className="floor-key-glyph"
            />
            <Chrome lang={lang} k={floorStatusKey(st, null)} />
          </span>
        );
      })}
    </span>
  );
}

/** Counter 1 — CALM: the floor at a glance. Five tiles of the strip and its key: free tiles to start,
 *  Table 3 ordering, Table 5 just seated (a started table with nothing on it is `seated` — m12
 *  change 7). No motion: a tile's tone change is instant. */
function CounterFloorPic({ lang }: { lang: StaffLang }) {
  const S = GUIDE_SAMPLE.counter;
  const status = (n: number): FloorStatus | null =>
    n === S.ordering ? "ordering" : n === S.seated ? "seated" : null;
  return (
    <span className="guide-pic-column">
      <span className="floor-strip">
        {[1, 2, 3, 4, 5].map((n) => (
          <StripTile key={n} n={n} status={status(n)} lang={lang} />
        ))}
      </span>
      <StripKey statuses={["ordering", "seated"]} lang={lang} />
    </span>
  );
}

/** Counter 2 — MARK: the hollow ring. Table 3's floor card in the card's own styles, its status
 *  edge and chip, and the REAL kitchen row (`FloorKitchenLine`) leading with the ring and its word.
 *  The table's Send is cropped away, so the guide's own primary is the only filled one in view. */
function CounterRingPic({ lang }: { lang: StaffLang }) {
  const S = GUIDE_SAMPLE.counter;
  return (
    <Card textured style={tableCardStyle.card}>
      <span className="floor-edge" data-tone="live" />
      <div style={tableCardStyle.topRow}>
        <span style={tableCardStyle.label}>
          <Chrome lang={lang} k="floor.table" vars={{ id: String(S.ordering) }} />
        </span>
        <FloorStatusChip status="ordering" lang={lang} />
      </div>
      <FloorKitchenLine
        kitchen={{ notSent: 2, inKitchen: 0, up: 0, upKeys: [], done: 0, oldestFireAt: null }}
        serverNow={new Date(PIC_NOW).toISOString()}
        thresholds={DEFAULT_KDS_THRESHOLDS}
        lang={lang}
        frozen={false}
        wait={false}
      />
      <div style={tableCardStyle.bottomRow}>
        <span>
          {fmt(2700)}{" "}
          <span lang={lang === "my" ? "my" : undefined}>
            <Chrome lang={lang} k="floor.card.soFarLabel" />
          </span>
        </span>
      </div>
    </Card>
  );
}

/** Counter 3 — CALL: the one filled tile, and the pane's ask pass — the ONE PASS rendered (the same
 *  `CounterPass`, tier, class and figureless "asking" identity `FloorDetailLive` draws; the table's
 *  number is the pane's heading, so the pass prints none), with the same total the guest's phone
 *  shows. Still: CALL is "one STILL filled tile". */
function CounterAskPic({ lang }: { lang: StaffLang }) {
  const S = GUIDE_SAMPLE.counter;
  const asked = minsBefore(4);
  return (
    <span className="guide-pic-column">
      <span className="floor-strip">
        <StripTile n={S.ordering} status="ordering" lang={lang} />
        <StripTile n={S.asking} status="counter" lang={lang} />
        <StripTile n={S.seated} status={null} lang={lang} />
      </span>
      <CounterPass
        tier="counter"
        lang={lang}
        label={TABLE_LABEL}
        fallback={{
          en: STAFF["table.detail.counterAsk"].en,
          my: STAFF["table.detail.counterAsk"].my,
        }}
        head={
          <span className="floor-ask-age">
            <Icon name="receipt" size={16} aria-hidden />
            <Chrome lang={lang} k="table.detail.counterAsked" echo={false} />{" "}
            <RelativeAgeText iso={asked} age={relativeAge(asked, PIC_NOW)} lang={lang} />
          </span>
        }
        className="floor-ask-pass"
        tear
        inert
      >
        <dl className="floor-ask-total">
          <div>
            <dt>
              <Chrome lang={lang} k="floor.settled.row.total" echo="inline" />
            </dt>
            <dd>{fmt(S.askTotalCents)}</dd>
          </div>
        </dl>
      </CounterPass>
    </span>
  );
}

/** Counter 4 — the gold till: a crop of the tray's GAVE tiles from the row the guest's $50 sits in
 *  (the real ladder for this bill, `quickCashTenders`; the rows above — Exact and the smaller note —
 *  are cropped away), the $50 lit by the console's one cap, and the Change readout. A COMPOSED crop:
 *  in the tray the readout sits in the band's money corner, far below the notes; here the two are
 *  drawn together. The one motion is the tray's own: `mms-pop` on the change figure, as a note tap
 *  plays it. Inside `.till-sheet` / `.till-band-row`, so from the till's breakpoint the tiles and the
 *  figure are the tray's own size and, below it, the single-column sheet's — whatever this device's
 *  tray really draws. */
function CounterCashPic({ lang, motion }: { lang: StaffLang; motion: boolean }) {
  const S = GUIDE_SAMPLE.counter;
  const notes = quickCashTenders(S.askTotalCents).filter((c) => c >= S.noteCents);
  return (
    <span className="till-sheet guide-pic-column">
      <span className="reg-tender-grid">
        {notes.map((cents) => (
          <button
            key={cents}
            type="button"
            tabIndex={-1}
            className="staff-btn staff-chip staff-chip-cash"
            aria-pressed={cents === S.noteCents}
          >
            {noteLabel(cents)}
          </button>
        ))}
      </span>
      <span className="till-band-row guide-pic-band">
        <span className="reg-change">
          <dl className="checkout-leader-row reg-change-row">
            <dt>
              <Chrome lang={lang} k="settle.cash.changeLabel" echo="inline" />
            </dt>
            <dd className={motion ? "mms-pop" : undefined}>{fmt(S.noteCents - S.askTotalCents)}</dd>
          </dl>
        </span>
      </span>
    </span>
  );
}

/** Counter 5 — dashed pending: the clear window as the pane draws it (`ClearTableButton`): the
 *  "Clearing Table 7" chip on the provisional dash, the in-slot Undo (`.clear-undo`) with its ONE
 *  aria-hidden seconds leaf, and Seat next party. Still — the window's tap swaps the slot with no
 *  motion (m7). */
function CounterClearPic({ lang }: { lang: StaffLang }) {
  const id = String(GUIDE_SAMPLE.counter.clearing);
  return (
    <span className="clear-window">
      <span className="clear-chip">
        <Chrome lang={lang} k="settle.clear.window" vars={{ id }} echo="inline" />
      </span>
      <span className="clear-window-cells">
        <span className={buttonClass({ variant: "secondary", className: "clear-undo" })}>
          <Chrome lang={lang} k="kds.undo" echo="stack" />
          <span className="clear-undo-left" lang={lang}>
            {" "}
            {tf(lang, "table.send.undoLeft", { n: CLEAR_UNDO_MS / 1000 })}
          </span>
        </span>
        <span className={buttonClass({ variant: "secondary" })}>
          <Chrome lang={lang} k="settle.clear.seatNext" echo="stack" />
        </span>
      </span>
    </span>
  );
}

/** One dish row as `KdsLineRow` draws it — the line's own classes, the real `TicketLineText`. */
function TicketRow({
  dish,
  qty,
  cooking,
  lang,
}: {
  dish: Dish;
  qty: number;
  cooking?: boolean;
  lang: StaffLang;
}) {
  return (
    <li className="kds-item" data-state={cooking ? "in_progress" : "fired"}>
      <div className="kds-item-row">
        <span className="kds-line">
          <span className="kds-qty" data-many={qtyStands(qty) || undefined}>
            {qty}
          </span>
          <span className="kds-line-main">
            <TicketLineText line={{ ...dish, modifiers: [], modifiersMy: [] }} />
            {cooking && (
              <p className="kds-line-tag" lang={lang}>
                {ts(lang, "kds.line.cooking")}
              </p>
            )}
          </span>
        </span>
        <span className="kds-line-more">
          <Icon name="more" strokeWidth={2.25} />
        </span>
      </div>
    </li>
  );
}

/** A dine-in ticket's strip as `TicketCard` draws it: the table, the clock, the badge (its lead word
 *  from `kdsBadgeKeys` — "Late · " on a red one), and the round stub's row B when it has one. Never
 *  `kds-strip-pulse`: no guide picture pulses (m12 B1). */
function TicketStrip({
  table,
  clock,
  level,
  round,
  lang,
}: {
  table: number;
  clock: string;
  level: KdsLevel;
  round?: number;
  lang: StaffLang;
}) {
  const lead = kdsBadgeKeys(false, level).map((k) => `${ts(lang, k).trim().replace(/ ·$/, "")} · `);
  const tint = level === "red" ? " kds-strip-red" : level === "amber" ? " kds-strip-amber" : "";
  return (
    <header className={`kds-strip${tint}${round === undefined ? "" : " kds-strip-rows"}`}>
      <span className="kds-id">
        <Chrome lang={lang} k="kds.table" vars={{ id: table }} />
      </span>
      <span className="kds-strip-side">
        <span className="kds-clock">{clock}</span>
        <span className="kds-badge" lang={lang}>
          {lead.join("")}
          {ts(lang, "kds.channel.dinein")}
        </span>
      </span>
      {round !== undefined && (
        <p className="kds-round">
          <Chrome lang={lang} k="kds.round" vars={{ id: round }} />
        </p>
      )}
    </header>
  );
}

/** A ticket shell, cropped: the card's own frame, its strip and rows — never its bump (m12 B4: no
 *  complete ticket is ever drawn on a live board). `flash` is the board's own arrival flash, keyed
 *  as the board keys it (a direct child of `.kds-ticket`, so its reduced-motion rule reaches it). */
function TicketShell({ flash, children }: { flash: boolean; children: ReactNode }) {
  return (
    <div className="kds-ticket card-textured guide-pic-ticket">
      {flash && <span className="kds-flash" />}
      {children}
    </div>
  );
}

/** Kitchen 1 — one Send, one card: Table 11's Chicken Curry, just landed, with the arrival flash. */
function KitchenCardPic({ lang, motion }: { lang: StaffLang; motion: boolean }) {
  return (
    <TicketShell flash={motion}>
      <TicketStrip table={GUIDE_SAMPLE.kitchen.landed} clock="0:04" level="ok" lang={lang} />
      <ul className="kds-lines">
        <TicketRow dish={DISH.curry} qty={1} lang={lang} />
      </ul>
    </TicketShell>
  );
}

/** Kitchen 2 — MARK: the round stub. Table 4's round 1 (amber, Mohinga started) beside its round 2
 *  (the stub, tea and sago); only round 2 flashes — the flash means new work landed on THAT card. */
function KitchenRoundPic({ lang, motion }: { lang: StaffLang; motion: boolean }) {
  const K = GUIDE_SAMPLE.kitchen;
  return (
    <span className="guide-pic-pair">
      <TicketShell flash={false}>
        <TicketStrip table={K.rounds} clock="9:12" level="amber" lang={lang} />
        <ul className="kds-lines">
          <TicketRow dish={DISH.mohinga} qty={2} cooking lang={lang} />
          <TicketRow dish={DISH.shan} qty={1} lang={lang} />
        </ul>
      </TicketShell>
      <TicketShell flash={motion}>
        <TicketStrip table={K.rounds} clock="0:04" level="ok" round={K.round} lang={lang} />
        <ul className="kds-lines">
          <TicketRow dish={DISH.tea} qty={2} lang={lang} />
          <TicketRow dish={DISH.sago} qty={1} lang={lang} />
        </ul>
      </TicketShell>
    </span>
  );
}

/** Kitchen 3 — All done, and the two ways back, each word in its own place (D3): the bump; the
 *  cream pill's ပြန်ဖျက် (the 6-second Undo — the shipped `.kds-undo` rule both name); and the rail's
 *  ပြန်ယူ beside a dashed Bring-back chip. Still: the pill declares no entrance of its own. */
function KitchenBumpPic({ lang }: { lang: StaffLang }) {
  const table = tf(lang, "kds.table", { id: GUIDE_SAMPLE.kitchen.bumped });
  return (
    <span className="guide-pic-column guide-pic-center">
      <span className="kds-bump help-pic-bump guide-pic-bump">
        <Chrome lang={lang} k="kds.bump" echo="stack" />{" "}
        <Icon name="check" size={22} strokeWidth={2.25} style={{ verticalAlign: "-3px" }} />
      </span>
      <span className="kds-undo help-pic-undo">
        <span className="kds-undo-text">
          <Chrome lang={lang} k="kds.undo.bumped" vars={{ x: table }} />
        </span>
        <span className="help-pic-undo-btn">
          <Chrome lang={lang} k="kds.undo" />
        </span>
      </span>
      <span className="kds-recall">
        <span className="kds-recall-label">
          <Chrome lang={lang} k="kds.recall" />
        </span>
        <button type="button" tabIndex={-1} className="kds-recall-btn">
          <Icon name="undo" size={16} style={{ verticalAlign: "-2px", marginRight: 3 }} />
          {table}
        </button>
      </span>
    </span>
  );
}

/** Kitchen 4 — ALARM: Late. Three strips cropped from their cards — calm, amber, red — and only the
 *  red one says "Late"; drawn STILL (B1), so it is the word that tells red from amber, as it is
 *  under reduced motion on the board. No head-stat replica (B4: the real head is right above). */
function KitchenLatePic({ lang }: { lang: StaffLang }) {
  const K = GUIDE_SAMPLE.kitchen;
  return (
    <span className="guide-pic-column">
      <TicketShell flash={false}>
        <TicketStrip table={GUIDE_SAMPLE.kitchen.landed} clock="3:15" level="ok" lang={lang} />
      </TicketShell>
      <TicketShell flash={false}>
        <TicketStrip table={K.rounds} clock="9:12" level="amber" lang={lang} />
      </TicketShell>
      <TicketShell flash={false}>
        <TicketStrip table={K.late} clock="13:05" level="red" lang={lang} />
      </TicketShell>
    </span>
  );
}

/** Kitchen 5 — ALARM without motion: the stop card, the REAL `KdsStopCard` (struck rows, the warn
 *  word, "Got it"), cropped by the well above its button so the guide's own Got it is the only one
 *  in reach. Still. */
function KitchenStopPic() {
  return (
    <ul className="guide-pic-list">
      <KdsStopCard
        table={GUIDE_SAMPLE.kitchen.stopped}
        lines={[
          { id: "pic-mohinga", ...DISH.mohinga, qty: 1, modifiers: [], modifiersMy: [] },
          { id: "pic-shan", ...DISH.shan, qty: 1, modifiers: [], modifiersMy: [] },
        ]}
        onAck={() => {}}
      />
    </ul>
  );
}
