"use client";
import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from "react";
import { Button, Icon, matchesFocusVisible } from "@mms/ui";
import type { ScanSlot } from "@/lib/scan-notice";
import type { ChipAction } from "@/lib/scan-chip";
import { t } from "@/lib/i18n";
import { t as kioskT, type KioskStringKey } from "@/lib/kiosk/strings";

/**
 * Phase 1c → PD4 — what the last scan came to, drawn INSIDE the viewfinder where the shopper is
 * looking. Deliberately NOT a live region — the toast is the view's announcement; this is what
 * persists. Re-keyed per outcome by the caller so each new one arrives.
 *
 * ONE shape language, readable at arm's length (m4 decisions 6–7):
 *   · THE TAG (a miss) — §27's "paper for recovery" cut as a shop tag: chamfered left, rounded
 *     right, a punched hole the live camera shows through (the moment's one delight), constant
 *     cream with ink in both themes. "This code isn’t in the app yet." + ONE primary ("Search by
 *     name", an ink pill) + the quiet, NON-interactive "Or ask at the counter". Weighed and
 *     unavailable read the kiosk's SHIPPED bilingual copy, named once; neither offers search (the
 *     search excludes both, decision 24); unavailable keeps the quiet line (B8). No ✕: the tag is
 *     not modal, and the next outcome replaces it (decision 10). Enters with RISE.
 *   · THE DISC (in your basket) — a round cream disc with a green ring and a check, the name (and
 *     its Burmese, G20), what the basket holds, and the action slot: the add-Undo while its 6 s
 *     window is open (the one Undo form: dashed `--sf` pill, aria-hidden seconds leaf), then
 *     "Add another" (M186's ONE deliberate way to buy a second). A queued offline code wears a
 *     DASHED ring (provisional) and "Waiting for a connection". Enters with POP.
 *
 * THE ARM (Codex correction 15): after the Name sheet closes on a server ok, the chip mounts under
 * the finger, so whatever sits in its action slot refuses taps for the same-gesture window —
 * `armed` is the page's `chipArmed(sheetClosedAt, now)`, read from `@mms/ui`'s one constant. A
 * refused control is `aria-disabled` with full ink, never natively disabled.
 *
 * The re-key is a REMOUNT, and a remount removes the focused node — so a keyboard or screen-reader
 * shopper who activates "Add another" would land on <body> after every add. `focusHandoffRef`
 * carries focus across the bar's own remount, and only then: the leaving bar marks the hand-off in
 * its layout-effect CLEANUP (it runs before React removes the DOM, while `activeElement` is still
 * inside); the arriving bar, mounted in the SAME commit, takes it. Like for like: focus that was ON
 * a control goes to the new bar's first action (or the bar itself, when it has none — a weighed
 * tag); focus that was on the bar itself — where the Name sheet's close-restore lands after an add —
 * stays on the bar, never moved onto the Undo, where a programmatic focus carrying the sheet input's
 * `:focus-visible` would hold the window for a touch shopper (blind pass 2 on #329). A hand-off
 * nobody takes expires in a microtask, so a bar that arrives LATER never pulls focus from wherever
 * the shopper went.
 */
/** What the leaving bar hands the arriving one: nothing, the bar itself, or a control in it. */
export type ScanHandoff = false | "bar" | "control";
const KIOSK_COPY: Record<"weighed" | "unavailable", KioskStringKey> = {
  weighed: "scanWeighed",
  unavailable: "scanUnavailable",
};

export type ScanChip = {
  /** Named from the BASKET by the page (or the cache / "A saved scan" for a queued code). */
  name: string;
  nameMy: string | null;
  /** `In your basket ×{qty}` or `Waiting for a connection`. */
  meta: string;
  /** The code waits in the offline queue — a dashed ring, nothing confirmed. */
  queued: boolean;
  /** What the action slot holds — the page's `chipAction`, the ONE predicate its repeat toast reads
   *  too, so the toast never names a control this slot does not draw (lib/scan-chip.ts). */
  action: ChipAction;
  busy: boolean;
  /** False inside the same-gesture window after the sheet closed (correction 15). */
  armed: boolean;
  onAddAnother: () => void;
  /** The add-Undo's controls — drawn only when `action` is "undo". */
  undo: {
    secondsLeft: number;
    /** The write is in flight — "Removing…", refuse re-entry. */
    removing: boolean;
    onUndo: () => void;
    /** Keyboard focus holds the window (lib/undo-hold.ts); a tap's focus never does. */
    onHold: (held: boolean) => void;
  } | null;
};

export function ScanResult({
  slot,
  chip,
  onSearch,
  focusHandoffRef,
}: {
  slot: NonNullable<ScanSlot>;
  chip: ScanChip | null;
  /** Opens the Name sheet for this miss. */
  onSearch: () => void;
  /** One flag per page, shared by every bar the page mounts (see the docblock). */
  focusHandoffRef: RefObject<ScanHandoff>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const handoff = focusHandoffRef.current;
    if (handoff) {
      focusHandoffRef.current = false;
      const target =
        handoff === "control" ? (root?.querySelector<HTMLElement>("button") ?? root) : root;
      target?.focus({ preventScroll: true });
    }
    return () => {
      if (!root || !root.contains(document.activeElement)) return;
      focusHandoffRef.current = document.activeElement === root ? "bar" : "control";
      queueMicrotask(() => {
        focusHandoffRef.current = false;
      });
    };
  }, [focusHandoffRef]);

  if (slot.kind === "chip") {
    if (!chip) return null;
    const undo = chip.action === "undo" ? chip.undo : null;
    const undoInert = !chip.armed || undo?.removing === true || chip.busy;
    return (
      <div ref={rootRef} className="scan-result scan-chip mms-pop" tabIndex={-1}>
        <span className={chip.queued ? "scan-disc scan-disc-queued" : "scan-disc"} aria-hidden>
          {!chip.queued && <Icon name="check" size={16} />}
        </span>
        <span className="scan-result-text" id="scan-chip-subject">
          <span className="scan-result-name">{chip.name}</span>
          {chip.nameMy && (
            <span className="scan-result-my" lang="my">
              {chip.nameMy}
            </span>
          )}
          <span className="scan-result-meta">{chip.meta}</span>
        </span>
        {undo ? (
          <button
            type="button"
            className="scan-undo"
            aria-disabled={undoInert || undefined}
            aria-busy={undo.removing || undefined}
            aria-describedby="scan-chip-subject"
            onClick={() => {
              if (!undoInert) undo.onUndo();
            }}
            onFocus={(e: FocusEvent<HTMLButtonElement>) => {
              if (matchesFocusVisible(e.currentTarget)) undo.onHold(true);
            }}
            onBlur={() => undo.onHold(false)}
          >
            {undo.removing ? (
              <>
                {t("en", "removing")}
                <span lang="my" className="scan-undo-my">
                  {t("my", "removing")}
                </span>
              </>
            ) : (
              <>
                {t("en", "undo")}
                <span lang="my" className="scan-undo-my">
                  {t("my", "undo")}
                </span>
                <span aria-hidden className="scan-undo-leaf">
                  {undo.secondsLeft}s
                </span>
              </>
            )}
          </button>
        ) : chip.action === "add-another" ? (
          <Button
            variant="primary"
            size="sm"
            className="scan-on-ink"
            disabled={chip.busy || !chip.armed}
            aria-label={`Add another ${chip.name}`}
            onClick={chip.onAddAnother}
          >
            Add another
          </Button>
        ) : null}
      </div>
    );
  }

  const { kind } = slot.notice;
  const en = kind === "unknown" ? t("en", "noticeUnknown") : kioskT("en", KIOSK_COPY[kind]);
  const my = kind === "unknown" ? t("my", "noticeUnknown") : kioskT("my", KIOSK_COPY[kind]);
  // Weighed says its own way out ("bring it to the counter"); unknown and unavailable get the
  // quiet human fallback last (the diner register; B8).
  const quietLine = kind !== "weighed";
  return (
    <div ref={rootRef} className="paper-tag scan-tag mms-rise" tabIndex={-1}>
      <div className="paper-tag-paper">
        <p className="scan-tag-head">
          {en}
          <span className="scan-tag-head-my" lang="my">
            {my}
          </span>
        </p>
        {(kind === "unknown" || quietLine) && (
          <div className="scan-tag-row">
            {kind === "unknown" && (
              <button
                type="button"
                className="scan-tag-btn"
                aria-haspopup="dialog"
                onClick={onSearch}
              >
                {t("en", "searchByName")}
                <span lang="my" className="scan-tag-btn-my">
                  {t("my", "searchByName")}
                </span>
              </button>
            )}
            {quietLine && (
              <p className="scan-tag-quiet">
                {t("en", "askCounter")}
                <span lang="my" className="scan-tag-quiet-my">
                  {t("my", "askCounter")}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
