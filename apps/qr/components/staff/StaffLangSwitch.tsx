"use client";
import { useEffect, useId, useRef } from "react";
import { Icon } from "@mms/ui";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import {
  STAFF_LANG_MODES,
  modeForScript,
  scriptOf,
  type StaffLang,
  type StaffLangMode,
} from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
import { useViewStatus } from "./ViewStatus";
import { useLangModeWrite, type LangModeWrite } from "./useLangModeWrite";

/**
 * P2 · P2e — the staff device's language controls. ONE module, three exports — the control's
 * identity for `check-staff-lang` rule 4, which counts hosting modules by MODULE + SYMBOL:
 *
 *   · `StaffLangSwitch`  — the front doors' two-script pill (sign-in form, lock, outage, error),
 *                          passed through their bar's `trailing` slot. No in-service bar carries a
 *                          language control any more (owner decision 2, 2026-09-24).
 *   · `StaffLangRows`    — the three modes, Burmese · Both · English, as a pure view over a host's
 *                          `useLangModeWrite` (the Help sheet's Language view).
 *   · `StaffLangSection` — the Profile's language card (`/staff/login` signed in, `?show=lang`).
 *
 * THE LABELS ARE THE AUTONYMS, COMPONENT CONSTANTS, NOT DICTIONARY KEYS. `english.my = "English"`
 * would redden the Myanmar-script guard, and more importantly a native-check pass must never be able
 * to "correct" one autonym into the other language: that single edit makes the control unusable for
 * the person who cannot read the other label. Because the visible autonym IS the accessible name,
 * WCAG 2.5.3 holds by construction; the rows' descriptions ride `aria-describedby`.
 *
 * ⚠️ NOTHING HERE IS EVER `disabled`, and nothing is `aria-disabled` either. Disabling the button
 * that was just tapped drops focus to `<body>` in a real browser (jsdom does NOT reproduce that —
 * the suite once passed its focus check over a disabled control). And the controls never REFUSE a
 * tap: the latest pick wins (`useLangModeWrite`), so there is nothing to say "unavailable" about.
 * The group says `aria-busy` while a write is out.
 *
 * THE FAILURE LINE SPEAKS BOTH TONGUES, WHATEVER THE DEVICE — `<Chrome lang="my" … keepEcho>`, a
 * LITERAL "my" on purpose: Chrome renders from its prop, so this is always Burmese then the English
 * echo, on an English device and on a Burmese-only one alike. The person the write failed for may be
 * exactly the one who cannot read the current mode. (`lang={lang}` there reads as a tidy fix and is
 * the bug; the suite renders it under English and under Burmese-only.)
 */

/** Each mode's plain description — the rows' descriptions and the Help row's sub-line read ONE map. */
export const STAFF_LANG_MODE_KEY = {
  "my-only": "shell.lang.mode.myOnly",
  both: "shell.lang.mode.both",
  en: "shell.lang.mode.en",
} as const satisfies Record<StaffLangMode, StaffKey>;

/**
 * P2e — the front doors' pill: [ မြန်မာ | English ], 44px, the device's SCRIPT pressed.
 *
 * It writes a MODE (`modeForScript`, resolved against the CONFIRMED mode at tap time): tapping the
 * script the device already reads keeps its mode — a Burmese-only device stays Burmese-only, and a
 * mis-tapped "English" corrected while its write is out goes back to Burmese-only, not to Both.
 * From a confirmed English device, မြန်မာ restores the default, Both; the Profile and the Help sheet
 * restore Burmese-only in one tap.
 *
 * Its failure line is a SIBLING of the pill with `.staff-bar-msg` — the Lock refusal's line — so it
 * lands BENEATH the bar tail's row, never inside the `overflow: hidden` pill where it would shove
 * the circles sideways under a thumb (signin-3).
 */
export function StaffLangSwitch() {
  const lang = useStaffLang();
  const write = useLangModeWrite();
  const groupId = useId();
  const pressed = scriptOf(write.shown);
  const tap = (script: StaffLang) => write.choose((confirmed) => modeForScript(script, confirmed));
  return (
    <>
      <div
        className="staff-lang"
        role="group"
        aria-labelledby={groupId}
        aria-busy={write.busy || undefined}
      >
        <span id={groupId} className="sr-only" lang={lang === "my" ? "my" : undefined}>
          {ts(lang, "shell.lang.group")}
        </span>
        <button
          type="button"
          className="staff-lang-btn"
          aria-pressed={pressed === "my"}
          onClick={() => tap("my")}
          lang="my"
        >
          မြန်မာ
        </button>
        <button
          type="button"
          className="staff-lang-btn"
          aria-pressed={pressed === "en"}
          onClick={() => tap("en")}
        >
          English
        </button>
      </div>
      {write.alert && (
        // The literal "my" is deliberate — see the module docblock.
        <span role="alert" className="staff-bar-msg">
          <Chrome lang="my" k="shell.lang.failed" echo="inline" keepEcho />
        </span>
      )}
    </>
  );
}

/**
 * P2e — the three modes as rows (the Settings idiom the Help sheet's size rows already wear): the
 * autonym sample on top, the mode's plain description beneath in the device's mode, a tick on the
 * pressed row so the state is never colour alone. The pressed row wears the ONE lit cap (the shared
 * selector list in globals.css) and declares no fill of its own.
 *
 * A pure VIEW over the host's write: the host owns `useLangModeWrite`, so a view swap or a closed
 * sheet never kills a write in flight. `onSameConfirmed` fires only for a tap on the mode the server
 * already holds with nothing in flight — never for a second tap on the row whose write is still out
 * (its outcome has not landed, and closing on it would lose the failure line).
 *
 * `focusOnMount` moves focus to the PRESSED row once per mount (a `?show=lang` landing, the Help
 * sheet's view change — QA §A); a refresh keeps the component mounted, so it never re-focuses.
 */
export function StaffLangRows({
  write,
  labelledBy,
  focusOnMount = false,
  onSameConfirmed,
}: {
  write: LangModeWrite;
  /** The visible heading that names the group; without one an sr-only group name renders. */
  labelledBy?: string;
  focusOnMount?: boolean;
  onSameConfirmed?: () => void;
}) {
  const lang = useStaffLang();
  const base = useId();
  const pressedRef = useRef<HTMLButtonElement>(null);
  // Once per mount: the deps are the flag alone, so a re-render (a refresh landing, a pick) never
  // re-runs it. (A `focused` latch ref once sat here too — dead, since the deps already say once.)
  useEffect(() => {
    if (focusOnMount) pressedRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div
      className="staff-lang-rows"
      role="group"
      aria-labelledby={labelledBy ?? `${base}-g`}
      aria-busy={write.busy || undefined}
    >
      {!labelledBy && (
        <span id={`${base}-g`} className="sr-only" lang={lang === "my" ? "my" : undefined}>
          {ts(lang, "shell.lang.group")}
        </span>
      )}
      {STAFF_LANG_MODES.map((m) => (
        <button
          key={m}
          ref={m === write.shown ? pressedRef : undefined}
          type="button"
          className="staff-lang-row staff-press"
          data-mode={m}
          aria-pressed={m === write.shown}
          aria-labelledby={`${base}-${m}-s`}
          aria-describedby={`${base}-${m}-d`}
          onClick={() => {
            if (write.choose(m) === "same-confirmed") onSameConfirmed?.();
          }}
        >
          <span id={`${base}-${m}-s`} className="staff-lang-sample">
            {m === "my-only" && (
              <span className="staff-lang-auto" lang="my">
                မြန်မာ
              </span>
            )}
            {m === "both" && (
              // The literal space makes the name "မြန်မာ English": two display:block spans with
              // nothing between them would be computed as one run-together word.
              <>
                <span className="staff-lang-auto" lang="my">
                  မြန်မာ
                </span>{" "}
                <span className="staff-lang-auto staff-lang-auto-en">English</span>
              </>
            )}
            {m === "en" && <span className="staff-lang-auto">English</span>}
          </span>
          <span id={`${base}-${m}-d`} className="staff-lang-desc">
            <Chrome lang={lang} k={STAFF_LANG_MODE_KEY[m]} echo="stack" />
          </span>
          <Icon name="check" size={22} className="staff-lang-tick" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/**
 * P2e — the Profile's language card: the DEVICE's card, after the person's own (`SignedInCard`) and
 * before the roster, inside the page's one `ViewStatusProvider`.
 *
 * The heading and the scope line are BOTH tongues on every device (`keepEcho`): this card is the
 * place a person comes to when the current mode is the wrong one. The failure speaks through the
 * view's ONE polite region (`announce`) and shows its line `aria-hidden` beneath the rows (the
 * menu-2 idiom); mounted with no provider (a suite, a future single-card screen) the line is the
 * `role="alert"` itself. The next write clears the region.
 */
export function StaffLangSection({ focusOnMount = false }: { focusOnMount?: boolean }) {
  const lang = useStaffLang();
  const announce = useViewStatus();
  const write = useLangModeWrite({
    onSettled: (s) => {
      if (s.alert) announce?.({ k: "shell.lang.failed" });
    },
  });
  const rows: LangModeWrite = {
    ...write,
    choose: (next) => {
      const tap = write.choose(next);
      if (tap !== "same-pending") announce?.(null); // an answered line is not re-read later
      return tap;
    },
  };
  return (
    <section className="card card-textured entry-card staff-lang-card" aria-labelledby="lang-h">
      <h2 id="lang-h" className="entry-h">
        <Chrome lang="my" k="shell.lang.row" echo="stack" keepEcho />
      </h2>
      <p className="entry-note">
        <Chrome lang="my" k="shell.lang.scope" echo="stack" keepEcho />
      </p>
      <StaffLangRows write={rows} labelledBy="lang-h" focusOnMount={focusOnMount} />
      {write.alert && (
        <p
          className="staff-lang-msg"
          role={announce ? undefined : "alert"}
          aria-hidden={announce ? true : undefined}
        >
          <Chrome lang="my" k="shell.lang.failed" echo="inline" keepEcho />
        </p>
      )}
      <p className="staff-lang-note">
        <Chrome lang={lang} k="shell.lang.note" echo="stack" />
      </p>
    </section>
  );
}
