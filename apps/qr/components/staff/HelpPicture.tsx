import { Card, Icon } from "@mms/ui";
import type { HelpScreen } from "@/lib/help";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { FloorStatusChip } from "./FloorStatusChip";
import { tableCardStyle } from "./TableCard";
import { bumpBtn, pickedBtn, readyBtn } from "./expo-stage";

/**
 * P7·3 — the "picture" on each help card: a STATIC replica of the real control in the real
 * control's OWN DECLARATION — its class where the control has one (`.kds-bump`, `.kds-line-86`,
 * `.staff-circ`, `.staff-counter-primary`), its exported style object where it is styled inline
 * (`expo-stage.ts`, `tableCardStyle`), and for the undo pill the one CSS rule that names both the
 * button and the replica. NEVER a new class that copies the look: the blind pass on the first draft
 * found the takeaway stages drawn green and inverted, the undo pill in the bar's colours, the
 * Screens circle wearing the bar's STATIC mark, and the kitchen's amber strip on the takeaway card —
 * four drawings of controls that do not exist, on the surface built to stop exactly that.
 *
 * Decorative and inert — `aria-hidden`, no pointer events (`.help-pic` in globals.css) — the card's
 * sentence carries the meaning. Under Burmese the replica's label comes through <Chrome> like the
 * original's, so it is marked and in the right face.
 */
export function HelpPicture({
  screen,
  n,
  lang,
}: {
  screen: HelpScreen;
  n: number;
  lang: StaffLang;
}) {
  return (
    <div className="help-pic" aria-hidden>
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
        <span className="kds-line-86 help-pic-86">
          <Chrome lang={lang} k="kds.86" echo="stack" />
        </span>
      )}
      {screen === "kitchen" && n === 4 && (
        <span className="help-pic-held">
          <span className="kds-bump kds-bump-fire help-pic-bump">
            <Chrome lang={lang} k="kds.fire" echo="stack" />
          </span>
        </span>
      )}
      {screen === "counter" && n === 1 && (
        // The Register tile from the counter home, in its own classes (`app/staff/page.tsx`).
        <span className="staff-counter-primary card-textured">
          <span className="staff-door-icon">
            <Icon name="cash" size={36} />
          </span>
          <span className="staff-door-name">
            <Chrome lang={lang} k="floor.nav.register" echo="stack" />
            <span className="staff-door-sub">
              <Chrome lang={lang} k="floor.door.counter.sub" echo="stack" />
            </span>
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
        // The Screens circle is a CONTROL (`StaffBar`'s `.staff-circ` link), never the bar's static
        // `.staff-circ-here` mark.
        <span className="staff-circ">
          <Icon name="grid" size={20} />
        </span>
      )}
      {screen === "counter" && n === 4 && (
        <span className="staff-circ">
          <Icon name="lock" size={20} />
        </span>
      )}
      {screen === "expo" && n === 1 && (
        <span className="staff-btn help-pic-stage" style={{ ...bumpBtn, ...readyBtn }}>
          <Chrome lang={lang} k="expo.verb.bagged" echo="stack" />
        </span>
      )}
      {screen === "expo" && n === 2 && (
        <span className="staff-btn help-pic-stage" style={{ ...bumpBtn, ...pickedBtn }}>
          <Chrome lang={lang} k="expo.verb.pickedUp" echo="stack" />
        </span>
      )}
      {screen === "expo" && n === 3 && (
        <span className="help-pic-pair">
          <span className="staff-btn help-pic-stage" style={{ ...bumpBtn, ...readyBtn }}>
            <Chrome lang={lang} k="expo.verb.verified" echo="stack" />
          </span>
          <span className="help-pic-arrow">→</span>
          <span className="staff-btn help-pic-stage" style={{ ...bumpBtn, ...pickedBtn }}>
            <Chrome lang={lang} k="expo.verb.handedOver" echo="stack" />
          </span>
        </span>
      )}
      {screen === "expo" && n === 4 && (
        // The takeaway board's own status line in its warn state (`.expo-status-warn`) — it has no
        // strip; the amber strip is a KITCHEN ticket header and never appears here.
        <span className="expo-status expo-status-warn">
          <Chrome lang={lang} k="out.head.notUpdating" echo="stack" />
        </span>
      )}
    </div>
  );
}
