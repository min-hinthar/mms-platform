import { Icon } from "@mms/ui";
import type { HelpScreen } from "@/lib/help";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * P7·3 — the "picture" on each help card: a STATIC replica of the real control, in the real control's
 * own classes, so what the card shows is what the screen shows (a drawing of the bump button would
 * drift the first time the button changed). Decorative and inert — `aria-hidden`, no pointer events
 * (`.help-pic` in globals.css) — the card's sentence carries the meaning. Under Burmese the replica's
 * label comes through <Chrome> like the original's, so it is marked and in the right face.
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
        <span className="help-pic-tile">
          <span className="staff-door-icon">
            <Icon name="cash" size={28} />
          </span>
          <span className="help-pic-tile-name">
            <Chrome lang={lang} k="floor.nav.register" echo="stack" />
          </span>
        </span>
      )}
      {screen === "counter" && n === 2 && (
        <span className="help-pic-table">
          <b>T7</b>
          <span className="help-pic-table-status">
            <Chrome lang={lang} k="floor.status.ordering" />
          </span>
        </span>
      )}
      {screen === "counter" && n === 3 && (
        <span className="staff-circ staff-circ-here">
          <Icon name="grid" size={20} />
        </span>
      )}
      {screen === "counter" && n === 4 && (
        <span className="staff-circ">
          <Icon name="lock" size={20} />
        </span>
      )}
      {screen === "expo" && n === 1 && (
        <span className="help-pic-expo help-pic-expo-ready">
          <Chrome lang={lang} k="expo.verb.bagged" echo="stack" />
        </span>
      )}
      {screen === "expo" && n === 2 && (
        <span className="help-pic-expo help-pic-expo-picked">
          <Chrome lang={lang} k="expo.verb.pickedUp" echo="stack" />
        </span>
      )}
      {screen === "expo" && n === 3 && (
        <span className="help-pic-pair">
          <span className="help-pic-expo help-pic-expo-ready">
            <Chrome lang={lang} k="expo.verb.verified" echo="stack" />
          </span>
          <span className="help-pic-arrow">→</span>
          <span className="help-pic-expo help-pic-expo-picked">
            <Chrome lang={lang} k="expo.verb.handedOver" echo="stack" />
          </span>
        </span>
      )}
      {screen === "expo" && n === 4 && (
        <span className="kds-strip kds-strip-amber help-pic-strip">
          <Chrome lang={lang} k="out.head.notUpdating" echo="stack" />
        </span>
      )}
    </div>
  );
}
