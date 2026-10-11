"use client";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Button, Icon } from "@mms/ui";
import type { HelpDoorScreen } from "@/lib/help";
import type { KdsSize } from "@/lib/kds-size";
import type { StaffLang } from "@/lib/staff-lang";
import { sx } from "@/lib/staff-labels";
import { haptic } from "@/lib/haptics";
import { STAFF_GUIDE_STEPS, guideActAccepted } from "@/lib/staff-guide";
import { GuideDots } from "../GuideDots";
import { Chrome } from "./Chrome";
import { GuidePicture } from "./HelpPicture";

/**
 * PD12 (m12 "Point and Call") — the staff step guide: ONE card, five steps, two hosts.
 *
 *   inplace — the screen's own quiet space, offered once by the host (`useGuideFirstRun`): the
 *             counter's idle pane (`TablePane`), the kitchen's empty board (`KdsBoard`). NEVER a
 *             modal: the floor beside it stays live and tappable, and work always wins — the host
 *             unmounts this the moment a table is picked or a ticket lands. Close (ပိတ်) top-right.
 *   sheet   — the same guide inside the Help sheet, when a person opens it from Help's first row
 *             (`HelpButton`). The sheet's ✕, Escape and scrim are the close, so no Close is drawn.
 *
 * Each step: the eyebrow ("Step N of 5", the group's description), the PICTURE (the real controls,
 * inert, cropped — `GuidePicture`), the TITLE (the control's own key, the step's focus target), the
 * sentence(s), then the foot: five dot buttons and the pager. The foot is ONE grid on every step —
 * Back's slot is held empty on step 1 and Next is the same element throughout, its last word "Got
 * it" (`help.done`, both stations — the critic's C: "Back to the counter" is the seal's hero) — so
 * nothing ever moves under a finger.
 *
 * THE ARM (Codex round 3 E1): after the guide mounts AND after every step change, a tap counts only
 * once `guideActAccepted` says so — never inside `GUIDE_ARM_MS`, and never for a press that BEGAN
 * before the arm (a click's `detail` tells a pointer from a key). It refuses in the handler and draws
 * nothing: a 400 ms guard is not a state, and a dim on every step change would blink the pager.
 *
 * A11Y: the card is a `role="group"` named by its title and described by its eyebrow — never a second
 * region (Codex round 3 E2: it renders inside the pane's own section; on the board, inside the
 * board's). The guide adds NO live region: the host's one region keeps speaking, and a step change
 * moves focus to the new title (`tabIndex -1`), which announces it. In place, mounting takes no focus
 * (it offered itself; the person may be anywhere); in the sheet, the title takes focus on open (the
 * row that opened it is gone). Dots are 44×44 buttons named by sr-only `help.step`, the current one
 * `aria-current="step"` and told apart by SHAPE (a capsule) as well as ink.
 *
 * MOTION (m12 B2 — "the product's own motion, or none"): each picture plays its control's own motion
 * once, the first time its step shows in this guide's life, and a revisited step draws its final
 * frame (`played`). Every motion is a shipped, reduced-motion-escorted class (`.kds-flash`,
 * `.mms-pop`); the step swap itself is instant, nothing loops, no auto-advance, no swipe, no sound —
 * only the shipped "pick" haptic on Next, Back and each dot.
 */
export function StepGuide({
  screen,
  host,
  lang,
  size,
  onDone,
  onExit,
}: {
  screen: HelpDoorScreen;
  host: "inplace" | "sheet";
  lang: StaffLang;
  /** The board's text size — the kitchen pictures follow the dial. */
  size?: KdsSize;
  /** Close (in place) or the last step's Got it. The host decides where focus lands next. */
  onDone: (via: "close" | "finish") => void;
  /** The sheet host's way back to the Help rows: step 1's Back, in Back's own slot (every Help view
   *  has one — the cards' first Back returns to the rows too). In place, step 1 has no Back. */
  onExit?: () => void;
}) {
  const steps = STAFF_GUIDE_STEPS[screen];
  const total = steps.length;
  const [step, setStep] = useState(1);
  // Steps already LEFT in this guide's life: a revisit draws the final frame (motion plays once).
  const [played, setPlayed] = useState<ReadonlySet<number>>(() => new Set());
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The arm's clock: when the current step was shown, and when the pointer last went down.
  // null until the first commit stamps it: a tap before then is refused (arming, never "long armed").
  const shownAt = useRef<number | null>(null);
  const downAt = useRef<number | null>(null);
  const titleId = useId();
  const stepId = useId();

  // The arm's start: the mount, then every step change — the new step's controls re-arm from the
  // commit that shows them (a click's effects flush before the next event is handled).
  useEffect(() => {
    shownAt.current = Date.now();
  }, [step]);

  // Focus follows the step (QA §A): the new title announces it. In place, the step the guide was
  // OFFERED on takes none — compared by step, never by a "first run" flag, which StrictMode's second
  // effect pass would read as a step change and steal focus on mount.
  const focusedStep = useRef(step);
  useEffect(() => {
    if (host === "inplace" && focusedStep.current === step) return;
    focusedStep.current = step;
    titleRef.current?.focus();
  }, [step, host]);

  /** Every control's tap goes through the arm. `detail === 0` is a keyboard click (no pointer).
   *  Called from the controls' own click handlers only — never during render. */
  const tap = (e: MouseEvent<HTMLButtonElement>, act: () => void): void => {
    const pressed = e.detail === 0 ? null : downAt.current;
    downAt.current = null;
    if (!guideActAccepted({ now: Date.now(), shownAt: shownAt.current, downAt: pressed })) return;
    act();
  };

  const go = (to: number) => {
    if (to === step || to < 1 || to > total) return;
    haptic("pick");
    setPlayed((p) => (p.has(step) ? p : new Set(p).add(step)));
    setStep(to);
  };

  const cur = steps[step - 1]!;
  const last = step === total;
  const Title = host === "sheet" ? "h3" : "h2";

  return (
    <div
      className="staff-guide card card-textured"
      data-host={host}
      data-screen={screen}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={stepId}
      onPointerDownCapture={() => {
        downAt.current = Date.now();
      }}
    >
      <div className="staff-guide-head">
        <p id={stepId} className="staff-guide-step">
          <Chrome lang={lang} k="help.step" vars={{ n: step, total }} echo="inline" />
        </p>
        {host === "inplace" && (
          <button
            type="button"
            className="staff-guide-close staff-press"
            onClick={(e) => tap(e, () => onDone("close"))}
          >
            <Icon name="close" size={18} strokeWidth={2} aria-hidden />
            <Chrome lang={lang} k="shell.close" echo="stack" />
          </button>
        )}
      </div>

      {/* Keyed per step: a step's picture mounts fresh, so its one motion plays as it opens. */}
      <GuidePicture
        key={step}
        picture={cur.picture}
        lang={lang}
        size={size}
        motion={!played.has(step)}
      />

      <Title id={titleId} ref={titleRef} tabIndex={-1} className="staff-guide-title">
        <Chrome lang={lang} k={cur.title} vars={cur.titleVars} echo="stack" />
      </Title>
      <div className="staff-guide-lines">
        {cur.lines.map((l) => (
          <p key={l.k} className="staff-guide-line">
            <Chrome lang={lang} k={l.k} vars={l.vars} echo="stack" />
          </p>
        ))}
      </div>

      <div className="staff-guide-foot">
        {/* The ONE pager of dots both guides draw (PD11 shares it). */}
        <GuideDots
          total={total}
          current={step}
          label={sx(lang, "help.a11y.pager")}
          name={(n) => <Chrome lang={lang} k="help.step" vars={{ n, total }} />}
          onPick={(n, e) => tap(e, () => go(n))}
        />
        <div className="staff-guide-pager">
          {step > 1 ? (
            <Button variant="secondary" size="xl" onClick={(e) => tap(e, () => go(step - 1))}>
              <Chrome lang={lang} k="help.back" echo="stack" />
            </Button>
          ) : host === "sheet" && onExit ? (
            // In the Help sheet, step 1's Back returns to the rows (the cards' first Back does too).
            <Button
              variant="secondary"
              size="xl"
              onClick={(e) =>
                tap(e, () => {
                  haptic("pick");
                  onExit();
                })
              }
            >
              <Chrome lang={lang} k="help.back" echo="stack" />
            </Button>
          ) : (
            // Step 1 keeps Back's slot, so Next never moves under a finger.
            <span className="staff-guide-slot" aria-hidden />
          )}
          <Button
            variant="primary"
            size="xl"
            onClick={(e) =>
              tap(e, () => {
                if (last) {
                  haptic("pick");
                  onDone("finish");
                } else go(step + 1);
              })
            }
          >
            <Chrome lang={lang} k={last ? "help.done" : "help.next"} echo="stack" />
          </Button>
        </div>
        <p className="staff-guide-footer">
          <Chrome lang={lang} k="help.footer" echo="stack" />
        </p>
      </div>
    </div>
  );
}
