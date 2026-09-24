import { Card, Icon, buttonClass } from "@mms/ui";
import type { HelpDoorScreen } from "@/lib/help";
import type { KdsSize } from "@/lib/kds-size";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { FloorStatusChip } from "./FloorStatusChip";
import { tableCardStyle } from "./TableCard";
import { bumpBtn, pickedBtn, readyBtn } from "./expo-stage";
import { START_ARM } from "./register-stage";

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
        // A4·2 — the Start zone's three arms, in the zone's own exported CLASS
        // (`register-stage.ts` → `.staff-arm`), the way `RegisterStart` renders them; no press on
        // a picture, and none of the three is open, so none wears the cap.
        <span className="help-pic-pair">
          <span className={`help-pic-stage ${START_ARM}`}>
            <Chrome lang={lang} k="reg.start.walkup" echo="stack" />
          </span>
          <span className={`help-pic-stage ${START_ARM}`}>
            <Chrome lang={lang} k="reg.start.phone" echo="stack" />
          </span>
          <span className={`help-pic-stage ${START_ARM}`}>
            <Chrome lang={lang} k="reg.start.table" echo="stack" />
          </span>
        </span>
      )}
      {screen === "counter" && n === 2 && (
        // A floor table card: the same `<Card textured>` in `TableCard`'s own styles, with the real
        // status chip.
        <Card textured style={tableCardStyle.card}>
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
