"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, Sheet } from "@mms/ui";
import { ts } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { haptic } from "@/lib/haptics";
import {
  HELP_CARD_COUNT,
  helpCardKeys,
  helpSeenKey,
  helpTitleKey,
  type HelpScreen,
} from "@/lib/help";
import { KDS_SIZES, KDS_SIZE_PX, kdsPageSize, type KdsSize } from "@/lib/kds-size";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { HelpPicture } from "./HelpPicture";

type View = "menu" | "how" | "size";

/**
 * P7·3 — the Help door: the ONE gold circle in the staff bar (its `help` slot, before the language
 * switch) on the kitchen board, the counter and the takeaway board, and the sheet behind it.
 *
 * ONE sheet, three views, so the person is never two dialogs deep: `menu` is the rows (the Settings
 * idiom, like More); `how` is the four cards, one at a time with a Next that becomes "Got it" —
 * one thing to read per screen is the whole point for a first morning; `size` (the board only) is
 * the three sizes shown on a real dish word at each size, the chosen one wearing the gold cap.
 *
 * "OPENS ITSELF THE FIRST TIME" is a promise the copy makes, so it is kept here: the first time a
 * DEVICE mounts a screen's door (localStorage, like the station and the size — a session fact would
 * re-interrupt every morning) the sheet opens straight onto the cards, once, and the device is
 * marked seen at that moment, not on close — a reload mid-first-visit must not re-open it. The read
 * runs in a microtask after mount (the board's own hydration pattern) so the server render and the
 * first client render agree and no state is set in an effect body. Storage refused → never auto-open:
 * an interruption on every load is worse than none.
 *
 * Nothing here is an irreversible write (a size is a localStorage preference the board already
 * owns), so the sheet carries no `busy` (§16). The circle is icon-only to the eye and NAMED by
 * sr-only dictionary text through <Chrome> (rule 3), like every circle in the bar.
 */
export function HelpButton({
  lang,
  screen,
  size,
  cardVars,
  sheetClassName,
}: {
  lang: StaffLang;
  screen: HelpScreen;
  /** The board's text size — the row and the view render only when a screen has one to offer. */
  size?: { value: KdsSize; onPick: (size: KdsSize) => void };
  /** Slot values a card interpolates, keyed by card number — the board hands its undo window in. */
  cardVars?: Partial<Record<number, Record<string, string | number>>>;
  /** Carried onto the sheet's root — the Night board passes `dark` (the sheet portals past `.kds-root`). */
  sheetClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [step, setStep] = useState(1);
  const ledeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        const key = helpSeenKey(screen);
        if (localStorage.getItem(key) === "1") return false;
        localStorage.setItem(key, "1");
        return true;
      })
      .then((first) => {
        if (!active || !first) return;
        setView("how");
        setStep(1);
        setOpen(true);
      })
      .catch(() => {
        /* storage refused (private mode) — deliberately no auto-open; the circle still works */
      });
    return () => {
      active = false;
    };
  }, [screen]);

  // The view changed under the reader — move focus to what changed (QA §A), never leave it on a
  // button that just re-labelled itself.
  useEffect(() => {
    if (open && view === "how") ledeRef.current?.focus();
  }, [open, view, step]);

  function show(next: boolean) {
    setOpen(next);
    if (!next) {
      setView("menu");
      setStep(1);
    }
  }

  const card = helpCardKeys(screen, step);
  const last = step === HELP_CARD_COUNT;
  const title =
    view === "how" ? helpTitleKey(screen) : view === "size" ? "kds.size.title" : "help.title";

  return (
    <>
      <button
        type="button"
        className="staff-circ staff-circ-gold staff-press"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          haptic("pick");
          setView("menu");
          setOpen(true);
        }}
      >
        <span aria-hidden className="help-glyph">
          ?
        </span>
        <span className="sr-only">
          <Chrome lang={lang} k="help.title" />
        </span>
      </button>
      <Sheet
        open={open}
        onOpenChange={show}
        title={<Chrome lang={lang} k={title} echo="stack" />}
        className={sheetClassName ? `help-sheet ${sheetClassName}` : "help-sheet"}
      >
        {view === "menu" && (
          <div className="help-menu">
            <p className="help-sub">
              <Chrome lang={lang} k="help.sub" echo="stack" />
            </p>
            <ul className="staff-inset" role="list" aria-label={sx(lang, "help.a11y.rows")}>
              <li>
                <button
                  type="button"
                  className="staff-row help-row staff-press"
                  onClick={() => {
                    haptic("pick");
                    setStep(1);
                    setView("how");
                  }}
                >
                  <span className="staff-row-glyph" aria-hidden>
                    <Icon name="info" size={20} />
                  </span>
                  <span className="staff-row-name">
                    <Chrome lang={lang} k="help.row.how" echo="stack" />
                    <span className="help-row-sub">
                      <Chrome
                        lang={lang}
                        k="help.row.how.sub"
                        vars={{ n: HELP_CARD_COUNT }}
                        echo="stack"
                      />
                    </span>
                  </span>
                  <Icon name="chevron" size={20} className="staff-row-chev" aria-hidden />
                </button>
              </li>
              {size && (
                <li>
                  <button
                    type="button"
                    className="staff-row help-row staff-press"
                    onClick={() => {
                      haptic("pick");
                      setView("size");
                    }}
                  >
                    <span className="staff-row-glyph help-glyph-aa" aria-hidden>
                      Aa
                    </span>
                    <span className="staff-row-name">
                      <Chrome lang={lang} k="kds.size.title" echo="stack" />
                      <span className="help-row-sub">
                        <Chrome
                          lang={lang}
                          k="help.row.size.sub"
                          vars={{
                            x: ts(lang, `kds.size.${size.value}`),
                            px: `${KDS_SIZE_PX[size.value]} px`,
                          }}
                          echo="stack"
                        />
                      </span>
                    </span>
                    <Icon name="chevron" size={20} className="staff-row-chev" aria-hidden />
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}

        {view === "how" && (
          <div className="help-how">
            <div className="help-card card card-textured" role="group" aria-labelledby="help-lede">
              <HelpPicture screen={screen} n={step} lang={lang} />
              <p id="help-lede" ref={ledeRef} tabIndex={-1} className="help-lede">
                <Chrome lang={lang} k={card.k} vars={cardVars?.[step]} echo="stack" />
              </p>
              <p className="help-more">
                <Chrome lang={lang} k={card.more} echo="stack" />
              </p>
            </div>
            <div className="help-pager" role="group" aria-label={sx(lang, "help.a11y.pager")}>
              <button
                type="button"
                className="staff-back staff-press"
                onClick={() => (step === 1 ? setView("menu") : setStep(step - 1))}
              >
                <Chrome lang={lang} k="help.back" echo="inline" />
              </button>
              <p className="help-step">
                <Chrome lang={lang} k="help.step" vars={{ n: step, total: HELP_CARD_COUNT }} />
              </p>
              <button
                type="button"
                className="help-next staff-press"
                onClick={() => {
                  haptic("pick");
                  if (last) show(false);
                  else setStep(step + 1);
                }}
              >
                <Chrome lang={lang} k={last ? "help.done" : "help.next"} echo="inline" />
              </button>
            </div>
            <p className="help-footer">
              <Chrome lang={lang} k="help.footer" echo="stack" />
            </p>
          </div>
        )}

        {view === "size" && size && (
          <div className="help-size">
            <p className="help-sub">
              <Chrome lang={lang} k="help.size.lede" echo="stack" />
            </p>
            <div className="help-size-list" role="group" aria-label={sx(lang, "kds.a11y.size")}>
              {KDS_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className="help-size-row staff-press"
                  aria-pressed={size.value === sz}
                  onClick={() => {
                    size.onPick(sz);
                    show(false);
                  }}
                >
                  <span className="help-size-sample" data-size={sz}>
                    <Chrome lang={lang} k="help.size.sample" echo="stack" />
                  </span>
                  <span className="help-size-meta">
                    <Chrome lang={lang} k={`kds.size.${sz}`} echo="inline" />
                    <span className="help-size-across">
                      <Chrome
                        lang={lang}
                        k="help.size.across"
                        vars={{ px: `${KDS_SIZE_PX[sz]} px`, n: kdsPageSize(sz) / 2 }}
                      />
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="staff-back staff-press help-size-back"
              onClick={() => setView("menu")}
            >
              <Chrome lang={lang} k="help.back" echo="inline" />
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
