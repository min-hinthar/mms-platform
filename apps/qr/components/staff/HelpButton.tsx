"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import posthog from "posthog-js";
import { Icon, Sheet } from "@mms/ui";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { haptic } from "@/lib/haptics";
import {
  HELP_CARD_COUNT,
  helpCardKeys,
  helpScreenNameKey,
  helpSeenKey,
  helpTitleKey,
  type HelpScreen,
} from "@/lib/help";
import { KDS_SIZES, KDS_SIZE_PX, KDS_WIDE_MIN_PX, kdsPageSize, type KdsSize } from "@/lib/kds-size";
import type { SlotsOf } from "@/lib/i18n/fill";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { APP_VERSION } from "@/lib/app-version";
import {
  REPORT_MESSAGE_MAX,
  connectionKey,
  reportStatusKey,
  type ReportConnection,
  type StaffReportDraft,
} from "@/lib/staff-report";
import {
  listMyStaffReports,
  submitStaffReport,
  type StaffReportRow,
} from "@/lib/staff-report-actions";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { HelpPicture } from "./HelpPicture";

type View = "menu" | "how" | "size" | "report";

/** Slot values a card interpolates, keyed by card number. */
type HelpCardVars = Partial<Record<number, Record<string, string | number>>>;

type HelpProps = {
  lang: StaffLang;
  /** The board's text size — the row and the view render only when a screen has one to offer. */
  size?: { value: KdsSize; onPick: (size: KdsSize) => void };
  /** Carried onto the sheet's root — the Night board passes `dark` (the sheet portals past `.kds-root`). */
  sheetClassName?: string;
  /** What the screen believes about its feed, for the report's diagnostics. A server-rendered page
   *  has no feed to speak of (`page`); a board says whether it is updating. */
  connection?: ReportConnection;
} & (
  | {
      screen: "kitchen";
      /** The kitchen's undo card quotes the board's own window — REQUIRED, typed from the key's slot,
       *  so a board that forgets it is a compile error rather than a literal `{n}` on the card. */
      cardVars: { 2: Record<SlotsOf<"help.how.kitchen.2">, number> };
    }
  | { screen: Exclude<HelpScreen, "kitchen">; cardVars?: undefined }
);

/** The size as the sheet quotes it — ONE formatting for the row and the three size rows. */
const pxLabel = (size: KdsSize) => `${KDS_SIZE_PX[size]} px`;

type MineState = { state: "idle" | "loading" | "failed" | "off" | "ready"; rows: StaffReportRow[] };

/** A getter that may throw before PostHog is up (tests, a blocked script) → simply absent. */
function safe(read: () => string | undefined): string | undefined {
  try {
    const v = read();
    return typeof v === "string" && v ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * P7·3 — the Help door: the ONE gold circle in the staff bar (its `help` slot, before the language
 * switch) on the kitchen board, the counter and the takeaway board, and the sheet behind it.
 *
 * ONE sheet, four views, so the person is never two dialogs deep: `menu` is the rows (the Settings
 * idiom, like More); `how` is the four cards, one at a time with a Next that becomes "Got it" —
 * one thing to read per screen is the whole point for a first morning; `size` (the board only) is
 * the three sizes shown on a real dish word at each size, the chosen one wearing the gold cap;
 * `report` (P7·4) is "Something's wrong" — a few words from the person, the facts the app can see
 * sent with them, and the person's own reports listed back with their status.
 *
 * "OPENS ITSELF THE FIRST TIME" is a promise the copy makes, so it is kept here: the first time a
 * DEVICE mounts a screen's door (localStorage, like the station and the size — a session fact would
 * re-interrupt every morning) the sheet opens straight onto the cards, once, and the device is
 * marked seen at that moment, not on close — a reload mid-first-visit must not re-open it. The read
 * runs in a microtask after mount (the board's own hydration pattern) so the server render and the
 * first client render agree and no state is set in an effect body; the mark is written by the pass
 * that OPENS, after the liveness check, so StrictMode's discarded first pass cannot mark the device
 * seen for the live one. Storage refused → never auto-open: an interruption on every load is worse
 * than none.
 *
 * The report is the one IRREVERSIBLE write behind this sheet (a row, an email, an issue), so the
 * sheet is `busy` while it is in flight (§16 — a transition's `pending`, never a hand-rolled
 * boolean); the size is a localStorage preference and the cards are reading. The circle is
 * icon-only to the eye and NAMED by sr-only dictionary text through <Chrome> (rule 3), like every
 * circle in the bar.
 */
export function HelpButton(props: HelpProps) {
  const { lang, screen, size, sheetClassName, connection = "page" } = props;
  const cardVars: HelpCardVars | undefined = props.cardVars;
  const [open, setOpen] = useState(false);
  // "{n} across" is true only in the board's fixed envelope (`KDS_WIDE_MIN_PX`); narrower, the grid
  // is auto-fill at every size and the sheet says only the size.
  const wide = useMediaQuery(`(min-width: ${KDS_WIDE_MIN_PX}px)`);
  const [view, setView] = useState<View>("menu");
  const [step, setStep] = useState(1);
  const ledeRef = useRef<HTMLParagraphElement>(null);

  // ── the report ──
  const [text, setText] = useState("");
  const [err, setErr] = useState<StaffKey | null>(null);
  const [sent, setSent] = useState<{ shortId: string } | null>(null);
  const [mine, setMine] = useState<MineState>({ state: "idle", rows: [] });
  // Bumped to re-read the list (after a send). NOT `mine.state`: an effect keyed on the state it
  // sets cancels its own read — the blind pass found the list stuck on "Loading…" that way.
  const [mineGen, setMineGen] = useState(0);
  const [pending, startTransition] = useTransition();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => localStorage.getItem(helpSeenKey(screen)) !== "1")
      .then((first) => {
        if (!active || !first) return;
        // The mark rides the OPEN, never the read: StrictMode runs this effect twice on mount and
        // discards the first — a mark written by the discarded pass would be read as "seen" by the
        // live one, and the sheet would never open itself in dev. Written BEFORE the state so a
        // refused write (a full or private store) means no open at all, not an open every load.
        localStorage.setItem(helpSeenKey(screen), "1");
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
  // button that just re-labelled itself. On the AUTO-open this finds no lede yet (the sheet mounts
  // its content a commit later) and the sheet's own initial focus stands — the dialog announced
  // with its title, the W9e policy for every sheet; from the first Next on, the sentence takes it.
  // When a view change unmounts the button that had focus, the sheet's trap re-parks focus on the
  // sheet itself (measured in jsdom, pinned in the suite) — never on <body> behind the scrim.
  useEffect(() => {
    if (open && view === "how") ledeRef.current?.focus();
  }, [open, view, step]);

  // The reporter's own list loads when the report view opens, and again when `mineGen` bumps
  // (after a send). The loading flip and the read live in callbacks, not the effect body; the
  // effect's deps are the VIEW and the generation only — never the state this effect writes, or
  // its own `loading` commit would run the cleanup and drop the read (pinned by a fixture that
  // settles after a macrotask, the way a real round-trip does).
  useEffect(() => {
    if (!open || view !== "report") return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setMine((m) => ({ state: "loading", rows: m.rows }));
      void listMyStaffReports().then((res) => {
        if (!active) return;
        setMine(
          res.ok
            ? { state: "ready", rows: res.rows }
            : { state: res.reason === "off" ? "off" : "failed", rows: [] },
        );
      });
    });
    return () => {
      active = false;
    };
  }, [open, view, mineGen]);

  // The sent card takes focus: the send button that had it is gone with the form.
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  function show(next: boolean) {
    if (!next && pending) return; // the sheet is busy — the choke point refuses too; belt and brace
    setOpen(next);
    if (!next) {
      setView("menu");
      setStep(1);
      setErr(null);
      setSent(null);
      setMine({ state: "idle", rows: [] });
      setMineGen(0);
    }
  }

  function draft(): StaffReportDraft {
    return {
      screen,
      message: text,
      lang,
      path: window.location.pathname.slice(0, 200),
      connection,
      // Every bound here is the rail's (`staffReportInput`) — a value over it would turn the whole
      // report into `invalid`, so the client cuts, never the server refuses. The version is NOT
      // sent: the server stamps its own build.
      device: {
        ua: navigator.userAgent.slice(0, 400),
        viewport: `${window.innerWidth}×${window.innerHeight}`.slice(0, 40),
        online: navigator.onLine,
        tz: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone)?.slice(0, 80),
        clientTime: new Date().toISOString(),
        posthogDistinctId: safe(() => posthog.get_distinct_id())?.slice(0, 120),
        posthogSessionId: safe(() => posthog.get_session_id())?.slice(0, 120),
      },
    };
  }

  function send() {
    if (pending) return; // one report per tap; the button says so through aria-disabled
    if (!text.trim()) {
      setErr("report.empty");
      fieldRef.current?.focus();
      return;
    }
    haptic("commit");
    setErr(null);
    startTransition(async () => {
      const res = await submitStaffReport(draft());
      if (!res.ok) {
        if (res.reason === "off") {
          // The door is not switched on (no table yet): the form gives way to the one sentence.
          setMine({ state: "off", rows: [] });
          return;
        }
        setErr(
          res.reason === "outage"
            ? "report.err.outage"
            : res.reason === "auth"
              ? "report.err.auth"
              : res.reason === "rate"
                ? "report.err.rate"
                : "report.err.save",
        );
        return;
      }
      setText("");
      setSent({ shortId: res.shortId });
      setMineGen((g) => g + 1); // re-read: the new row must appear in the list
    });
  }

  const card = helpCardKeys(screen, step);
  const last = step === HELP_CARD_COUNT;
  const title =
    view === "how"
      ? helpTitleKey(screen)
      : view === "size"
        ? "kds.size.title"
        : view === "report"
          ? "report.row"
          : "help.title";
  const clock = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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
        busy={pending}
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
                            px: pxLabel(size.value),
                          }}
                          echo="stack"
                        />
                      </span>
                    </span>
                    <Icon name="chevron" size={20} className="staff-row-chev" aria-hidden />
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  className="staff-row help-row staff-press"
                  onClick={() => {
                    haptic("pick");
                    setErr(null);
                    setView("report");
                  }}
                >
                  <span className="staff-row-glyph help-glyph-warn" aria-hidden>
                    <Icon name="alert" size={20} />
                  </span>
                  <span className="staff-row-name">
                    <Chrome lang={lang} k="report.row" echo="stack" />
                    <span className="help-row-sub">
                      <Chrome lang={lang} k="report.row.sub" echo="stack" />
                    </span>
                  </span>
                  <Icon name="chevron" size={20} className="staff-row-chev" aria-hidden />
                </button>
              </li>
            </ul>
          </div>
        )}

        {view === "how" && (
          <div className="help-how">
            <div className="help-card card card-textured" role="group" aria-labelledby="help-lede">
              <HelpPicture screen={screen} n={step} lang={lang} />
              <p
                id="help-lede"
                ref={ledeRef}
                tabIndex={-1}
                className="help-lede"
                aria-describedby="help-step"
              >
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
              <p id="help-step" className="help-step">
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
                      {wide ? (
                        <Chrome
                          lang={lang}
                          k="help.size.across"
                          vars={{ px: pxLabel(sz), n: kdsPageSize(sz) / 2 }}
                        />
                      ) : (
                        <span lang="en">{pxLabel(sz)}</span>
                      )}
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

        {view === "report" && (
          <div className="help-report">
            {mine.state === "off" ? (
              <p className="help-report-mine-note">
                <Chrome lang={lang} k="report.off" echo="stack" />
              </p>
            ) : sent ? (
              <div ref={sentRef} tabIndex={-1} className="help-report-sent">
                <p className="help-report-sent-title">
                  <Chrome lang={lang} k="report.sent" echo="stack" />
                </p>
                <p className="help-report-sent-sub">
                  <Chrome lang={lang} k="report.sent.sub" vars={{ x: sent.shortId }} echo="stack" />
                </p>
              </div>
            ) : (
              <>
                <p className="help-sub">
                  <Chrome lang={lang} k="report.lede" echo="stack" />
                </p>
                <label htmlFor="help-report-field" className="help-report-label">
                  <Chrome lang={lang} k="report.field" echo="stack" />
                </label>
                <textarea
                  id="help-report-field"
                  ref={fieldRef}
                  className="help-report-field"
                  value={text}
                  maxLength={REPORT_MESSAGE_MAX}
                  rows={4}
                  readOnly={pending}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (err === "report.empty") setErr(null);
                  }}
                />
                <p className="help-report-mine-title">
                  <Chrome lang={lang} k="report.attached" echo="inline" />
                </p>
                <ul
                  className="help-report-attached"
                  role="list"
                  aria-label={sx(lang, "report.a11y.attached")}
                >
                  <li>
                    <Chrome
                      lang={lang}
                      k="report.attached.screen"
                      vars={{ x: ts(lang, helpScreenNameKey(screen)) }}
                    />
                  </li>
                  <li>
                    <Chrome lang={lang} k="report.attached.time" vars={{ t: clock }} />
                  </li>
                  <li>
                    <Chrome
                      lang={lang}
                      k="report.attached.connection"
                      vars={{ x: ts(lang, connectionKey(connection)) }}
                    />
                  </li>
                  <li>
                    <Chrome lang={lang} k="report.attached.version" vars={{ x: APP_VERSION }} />
                  </li>
                  <li>
                    <Chrome lang={lang} k="report.attached.more" />
                  </li>
                </ul>
                {/* The ONE live region of this sheet: the send's failure, or that it is sending. A
                    success moves focus to the sent card instead, which announces itself. */}
                <p role="status" className="help-report-status">
                  {err ? (
                    <Chrome lang={lang} k={err} />
                  ) : pending ? (
                    <Chrome lang={lang} k="report.sending" />
                  ) : null}
                </p>
                <div className="help-report-actions">
                  <button
                    type="button"
                    className="staff-back staff-press"
                    aria-disabled={pending || undefined}
                    onClick={() => {
                      if (pending) return;
                      setErr(null);
                      setView("menu");
                    }}
                  >
                    <Chrome lang={lang} k="help.back" echo="inline" />
                  </button>
                  <button
                    type="button"
                    className="help-next staff-press"
                    aria-disabled={pending || !text.trim() || undefined}
                    onClick={send}
                  >
                    <Chrome
                      lang={lang}
                      k={pending ? "report.sending" : "report.send"}
                      echo="inline"
                    />
                  </button>
                </div>
              </>
            )}

            {mine.state !== "off" && (
              <p className="help-report-mine-title">
                <Chrome lang={lang} k="report.mine" echo="inline" />
              </p>
            )}
            {mine.state === "off" ? null : mine.state === "failed" ? (
              <p className="help-report-mine-note">
                <Chrome lang={lang} k="report.mine.failed" echo="stack" />
              </p>
            ) : mine.state === "ready" && mine.rows.length === 0 ? (
              <p className="help-report-mine-note">
                <Chrome lang={lang} k="report.mine.none" echo="stack" />
              </p>
            ) : mine.state !== "ready" ? (
              <p className="help-report-mine-note">
                <Chrome lang={lang} k="report.mine.loading" />
              </p>
            ) : (
              <ul
                className="help-report-mine"
                role="list"
                aria-label={sx(lang, "report.a11y.mine")}
              >
                {mine.rows.map((r) => (
                  <li key={r.id} className="help-report-item">
                    <div className="help-report-item-head">
                      <span lang="en">{r.shortId}</span>
                      <span lang="en">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="help-report-item-msg">{r.message}</p>
                    <div className="help-report-chips">
                      <span className="help-report-chip" data-status={r.status}>
                        <Chrome lang={lang} k={reportStatusKey(r.status)} />
                      </span>
                      {r.issueUrl && (
                        <span className="help-report-chip help-report-chip-issue">
                          <Chrome lang={lang} k="report.issue" />
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {sent && (
              <button
                type="button"
                className="staff-back staff-press help-size-back"
                onClick={() => {
                  setSent(null);
                  setView("menu");
                }}
              >
                <Chrome lang={lang} k="help.back" echo="inline" />
              </button>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
