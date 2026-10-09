import { padDishName } from "./order-pad";
import type { TableLineView } from "./floor-types";
import type { Handoff } from "./register-ui";
import type { StaffLang } from "./staff-lang";

/**
 * PD6 · counter-floor — the crowned TILL TRAY's pure rules (m6 "Shape of the Sale",
 * `docs/path-design-2026-10-07/m6-walk-up-cash.md`). The tray is the counter tablet's ONE cash sheet,
 * whichever door opens it (the pad's dock, m2's pane, later m7's loss slip and m8's settle); the
 * component (`CashSettleButton layout="till"`) only renders what these decide.
 *
 * Nothing here touches an amount. The due is `shownTotal + tipCents` in the component (one binding,
 * W17), the change is `tenderState` → `changeDue` in `lib/register-math.ts` (named once there, with
 * its mutants) — this module decides the tray's SHAPE: where it applies, how a figure steps down, when
 * the frozen slip no longer matches the cart, when a cancel is reassured, and where a double-tap lands.
 */

// ── where the till applies ─────────────────────────────────────────────────────────────────────

/** The tray body's columns, in px, from the drawn screen (picked-m6-1 ④b): OWE 460 · gap 32 · TIP 300
 *  · gap 32 · GAVE 438 = 1262 of content. The stylesheet's `.till-body` is pinned to this list by
 *  `till.test.ts`, so the number below is computed from the grid the CSS really draws. */
export const TILL_COLUMNS_PX: readonly number[] = [460, 32, 300, 32, 438];
/** The tray's own side padding (④b "Padding 20 32 0"). */
export const TILL_PAD_X_PX = 32;
/** The tray's gutter to the viewport edge (④ "x20–1346" on a 1366 frame). */
export const TILL_GUTTER_PX = 20;
/** The spec's own height bound (④ "(min-height: 44em)"): the head, the body and the pinned band. */
export const TILL_MIN_HEIGHT_EM = 44;
/** A media query's em resolves against the user's base font size; 16px is the default it is sized for. */
const REM_PX = 16;

/** The viewport width the till grid really needs — the columns plus the tray's padding and gutters,
 *  COMPUTED (Codex correction 8: never a guessed breakpoint). Below it today's single-column sheet
 *  serves, so cash entry and the Change readout are never clipped. */
export function tillMinWidthPx(): number {
  const columns = TILL_COLUMNS_PX.reduce((a, b) => a + b, 0);
  return columns + 2 * TILL_PAD_X_PX + 2 * TILL_GUTTER_PX;
}

export function tillMinWidthEm(): number {
  return tillMinWidthPx() / REM_PX;
}

/** THE ONE viewport predicate (name it once): `CashSettleButton` reads it through `useMediaQuery`,
 *  and `globals.css`'s `.till-sheet` rule is pinned to the same string by `till.test.ts`, so the JSX
 *  branch and the stylesheet can never key the till on two different widths. */
export const TILL_MEDIA = `(min-width: ${tillMinWidthEm()}em) and (min-height: ${TILL_MIN_HEIGHT_EM}em)`;

// ── the figure tiers ───────────────────────────────────────────────────────────────────────────

/** The three sizes a counter figure can take: `hand` is `--till-fs-hand` (128px — the Change handed
 *  back), `pass` is `--fs-pass` (88px — the figure said across the counter: the due, the #CODE), and
 *  `display` is `--fs-display` (the step-down). Never a fourth. */
export type TillHeroTier = "hand" | "pass" | "display";

/** The longest figure a tier holds without wrapping mid-value: "$999.99" is seven characters; the
 *  widest hex #CODE ("#3F9A2C") is seven too. Past it a figure steps DOWN one tier. */
export const TILL_HERO_MAX_CHARS = 7;

const STEP_DOWN: Readonly<Record<TillHeroTier, TillHeroTier>> = {
  hand: "pass",
  pass: "display",
  display: "display",
};

/** The tier a formatted figure is set at: the slot's own tier, or one step down when the text is
 *  longer than the tier holds — so money never wraps mid-value ("$9,999.99" at 88px is ≈462px in the
 *  460px OWE column). `display` is the floor. */
export function tillHeroTier(text: string, top: TillHeroTier): TillHeroTier {
  return text.length > TILL_HERO_MAX_CHARS ? STEP_DOWN[top] : top;
}

// ── the slip (Codex round 3 on m6 — it freezes with the quote) ─────────────────────────────────

/** One line of the slip the tray carries: the qty and the dish, Burmese-first where the console is
 *  (`padDishName`), no amount — the one figure is the frozen due above it. */
export type TillSlipLine = {
  id: string;
  qty: number;
  lead: { text: string; lang: StaffLang };
  echo: { text: string; lang: StaffLang } | null;
};

/** The slip from the order's lines: every line that is charged (a voided one is off the order; a
 *  comped one stays — the kitchen still makes it, and the cart's figure already excludes it). */
export function tillSlipFrom(
  lines: readonly Pick<TableLineView, "id" | "qty" | "name" | "nameMy" | "state">[],
  lang: StaffLang,
): TillSlipLine[] {
  return lines
    .filter((l) => l.state !== "voided")
    .map((l) => {
      const name = padDishName(lang, l.name, l.nameMy);
      return { id: l.id, qty: l.qty, lead: name.lead, echo: name.echo };
    });
}

/**
 * Whether the LIVE cart has diverged from the slip FROZEN at open: a line added, a line gone, or a
 * quantity changed. Cash is never collected against a screen whose items and total disagree, so the
 * tray marks a diverged slip ("The order changed — tap to update") and holds Take until the tap
 * re-freezes both; the server's moved refusal stays the backstop, not the first notice. Names and
 * states are not compared: a Send under an open tray changes no money, and a renamed dish is the
 * same dish.
 */
export function tillSlipDiverged(
  frozen: readonly Pick<TillSlipLine, "id" | "qty">[],
  live: readonly Pick<TillSlipLine, "id" | "qty">[],
): boolean {
  if (frozen.length !== live.length) return true;
  const qtyById = new Map(frozen.map((l) => [l.id, l.qty]));
  return live.some((l) => qtyById.get(l.id) !== l.qty);
}

// ── the clean cancel (graft 5, narrowed by appendix C) ─────────────────────────────────────────

/** What this opening's last attempt came to, as the tray closes. */
export type TillAttempt = "none" | "refused" | "stalled" | "waiting" | "unknown" | "landed";

/**
 * Whether the pad's Toast says "Nothing was taken — the order is still here." after the tray is
 * gone. Only where doubt could exist AND was resolved as nothing recorded: an attempt from this
 * opening was definitely refused (the server said so and recorded nothing), or the tap was refused
 * before anything was sent (stalled). Never after `waiting` or `unknown` — the payment may still be
 * recorded, and reassurance would be a lie; never on a plain open-and-cancel (nothing was tried, the
 * order is visibly there: the critic's "a routine cancel stays silent"); never after `landed` (the
 * sheet unmounted into the seal).
 */
export function tillCancelSays(attempt: TillAttempt): boolean {
  return attempt === "refused" || attempt === "stalled";
}

// ── the double-tap guard, by geometry (decision 6) ─────────────────────────────────────────────

/** A horizontal band of the tray, measured from the viewport's left edge in px. */
export type TillBand = { x0: number; x1: number };

/** The tray's x-bands at a viewport width at or above `tillMinWidthPx()`: the three columns (the
 *  spec's px at the minimum width; wider viewports scale the fr columns in proportion, the gaps
 *  stay fixed), and the right padding. The gaps between columns are inert too, but a finger that
 *  lands on a 32px gap is not a geometry this guard admits. */
export function tillBandsAt(viewportW: number): {
  tray: TillBand;
  owe: TillBand;
  tip: TillBand;
  gave: TillBand;
  padRight: TillBand;
} {
  const [oweSpec = 0, gap1 = 0, tipSpec = 0, gap2 = 0, gaveSpec = 0] = TILL_COLUMNS_PX;
  const trayX0 = TILL_GUTTER_PX;
  const trayX1 = viewportW - TILL_GUTTER_PX;
  const contentX0 = trayX0 + TILL_PAD_X_PX;
  const contentX1 = trayX1 - TILL_PAD_X_PX;
  const flexible = contentX1 - contentX0 - gap1 - gap2;
  const specFlexible = oweSpec + tipSpec + gaveSpec;
  const owe = (oweSpec / specFlexible) * flexible;
  const tip = (tipSpec / specFlexible) * flexible;
  const gave = flexible - owe - tip;
  const oweX1 = contentX0 + owe;
  const tipX0 = oweX1 + gap1;
  const tipX1 = tipX0 + tip;
  const gaveX0 = tipX1 + gap2;
  return {
    tray: { x0: trayX0, x1: trayX1 },
    owe: { x0: contentX0, x1: oweX1 },
    tip: { x0: tipX0, x1: tipX1 },
    gave: { x0: gaveX0, x1: gaveX0 + gave },
    padRight: { x0: contentX1, x1: trayX1 },
  };
}

/**
 * Whether a door's spot — the dock button that opened the tray, as a horizontal span — lands on
 * INERT tray content under an open till: the GAVE column (whose foot is empty on purpose and whose
 * band cell is the readout, a description) or the tray's right padding. Cancel and Take sit in the
 * OWE and TIP columns' band cells, so a second tap of the door that opened the tray can reach neither.
 * The y-axis holds by the band's own rule — the band pins to the tray's bottom edge, the door sits at
 * the dock's foot — and is measured on the device (ruling #12's sitting), not here.
 */
export function tillDoorLandsInert(door: TillBand, viewportW: number): boolean {
  if (viewportW < tillMinWidthPx()) return false;
  const b = tillBandsAt(viewportW);
  return door.x0 >= b.gave.x0 && door.x1 <= b.padRight.x1 && door.x0 < door.x1;
}

// ── the seal (m6 screen 2) ─────────────────────────────────────────────────────────────────────

/** At pane or phone width the seal's hero tops out at `--fs-pass`; six tabular 88px glyphs (≈320px)
 *  fit the pane's 431px content, a seventh reaches the edge of a 390px phone's column. */
export const SEAL_NARROW_MAX_CHARS = 6;

/** The seal's hero tier: wide, the Change handed back at `--till-fs-hand` (stepping down past seven
 *  characters, `tillHeroTier`); narrow, `--fs-pass` while it fits, else `--fs-display`. */
export function sealHeroTier(text: string, wide: boolean): TillHeroTier {
  if (wide) return tillHeroTier(text, "hand");
  return text.length > SEAL_NARROW_MAX_CHARS ? "display" : "pass";
}

/**
 * The pad's walk-up landing offers Walk-up as the seal's quiet secondary (PATH_DESIGN decision 8,
 * the owner default for moment 6). ONE constant, so the device sitting (ruling #12) can drop it if
 * Dad chaining walk-ups leaves bags waiting on the counter page (m6's open risk).
 */
export const SEAL_OFFERS_WALKUP = true;

/**
 * A closed counter order's server card ADOPTS this tab's stash only for the SAME order (m6
 * decision 24, appendix C): the money stays the order row's — its persisted total and tip — and only
 * what the cashier entered (the tender, never recorded) and the tap's "went out unpaid" come from the
 * stash. Another order, a table's stash, or none: null, and the server card stands with no Change.
 */
export function sealAdopt(server: Handoff, stash: Handoff | null): Handoff | null {
  if (stash === null || !stash.isCounter || stash.orderId !== server.orderId) return null;
  return { ...server, tenderedCents: stash.tenderedCents, sentEarly: stash.sentEarly === true };
}
