"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import posthog from "posthog-js";
import { Button, CounterPass, Icon, KitchenTrack, Sheet } from "@mms/ui";
import { GuideDots } from "./GuideDots";
import { LivePass } from "./LivePass";
import { haptic } from "@/lib/haptics";
import { markGuideSeen } from "@/lib/guide-seen";
import { guideActAccepted } from "@/lib/staff-guide";
import { surfaceOpen } from "@/lib/surfaces";
import { DINER_TAB_ICON, dinerTabs } from "@/lib/diner-tabs";
import { DINER_STAGE_WORD } from "@/lib/line-state-copy";
import { passIdentity } from "@/lib/pass-identity";
import {
  DINER_GUIDE_ARM_MS,
  DINER_GUIDE_KEY,
  GUIDE_COPY,
  GUIDE_FILLING_ID,
  GUIDE_PAGE_COUNT,
  GUIDE_SAMPLE,
  GUIDE_WORDS,
  dinerGuideStore,
  guidePages,
  guidePayVariant,
  guideSampleItems,
  guideSpoken,
  type GuidePage,
  type GuidePicture,
  type GuideText,
} from "@/lib/diner-guide";

/**
 * PD11 (PATH_DESIGN 2026-10-07 decision 12 · moment 11, "Your Pass, Explained") — the diner's
 * first-visit guide: ONE full-screen dialog, five pages, each one picture of the real thing the
 * guest is about to meet, named with the app's own shipped word, and one sentence. Decided in
 * `lib/diner-guide.ts`; this draws it.
 *
 * TWO DOORS, one dialog: the first run on a dine-in /menu (`DinerGuideFirstRun`, mounted by
 * ArrivalBeat) and the Account row (`DinerGuideDoor`, on You's Help & contact). The last page's
 * primary is the real first action — "Browse the menu" — from the first run, and the one dismiss word
 * "Close · ပိတ်" from Account (round 3).
 *
 * THE DIALOG is the Sheet primitive at full screen (`.mms-sheet-full`, the "Show a server" variant —
 * Radix Dialog: focus trapped, Esc closes, the page behind inert). Its ✕ is the guide's Close, named
 * "Close the guide" (the sheet's ✕ in a sheet — DESIGN-LANGUAGE §36's grammar); Esc and the ✕ are
 * equal exits and mark nothing new (the guide was marked when it opened).
 *
 * FOCUS (m11 decision 10): the sheet's container takes the opening stop (J21 — the dialog and its
 * name are announced, never a control first). On Next, Back or a dot, focus STAYS on the pressed
 * control and the ONE live region speaks the new page (silent on open). The foot is ONE grid on every
 * page: Back holds its slot (hidden and inert) on page 1 and Next is ONE element throughout — its
 * last word changes in place — so nothing moves under a finger (the critic's B9). The one
 * hand-off: Back pressed on page 2 goes inert as page 1 shows, so focus moves to Next.
 *
 * THE ARM (Codex round 3 E1 · m11 A4): every guide control counts a tap only `DINER_GUIDE_ARM_MS`
 * after the guide shows and after every page change, and never a press that began before — through
 * the staff guides' own `guideActAccepted`. The sheet's ✕ and Esc are not armed: an exit is never
 * held.
 *
 * MOTION (round 3's ONE MOTION LANGUAGE — the product's own, one thing at a time): page 1's pass
 * RISEs after the sheet's own entrance; page 2's second dish RISEs onto the order; page 3's Cooking
 * segment FILLs; page 4's counter pass RISEs (before C2 — PayAtCounterPass's own entrance) or the
 * served pass TURNs (after); page 5's pass RISEs above Order. Each plays the first time its page shows
 * in this open, and a revisited page draws its final frame (`played`). Every base style is the final
 * frame and reduced motion gets it (the kit's `.mms-rise` gate, pass.css's FILL/TURN gate, and the
 * `.diner-guide-*` block's own). No loop, no auto-advance, no swipe (it would fight iOS's edge Back),
 * no sound — only the shipped "pick" haptic on a page change.
 *
 * PICTURES are the REAL components, inert and hidden from assistive tech, inside a `role="img"`
 * stage named by one sentence: `CounterPass` (pages 1, 4, 5) and the Bill's own `LivePass` in its
 * `picture` mode (pages 2–4: no price, no total, no stub) over SAMPLE rows; the track's key under
 * page 3 is the real `KitchenTrack` with the guest's own stage words, as a list.
 */
export function DinerGuide({
  open,
  onOpenChange,
  source,
  tableNumber,
  role,
  atCap,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which door opened it (analytics, and the last primary's words). */
  source: "auto" | "account";
  tableNumber: number | null;
  role: "host" | "guest" | null;
  /** `guestListAtCap` — page 1 teaches Invite only while the guest row draws it. */
  atCap: boolean;
  /** Where focus lands when it closes (the first run: the menu's heading). Default: the opener. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const pages = guidePages({
    tableNumber,
    role,
    atCap,
    payVariant: guidePayVariant(surfaceOpen("dineInPhonePay")),
  });
  // What the close reports: the page it closed on, and whether the last primary finished it.
  const pageRef = useRef(1);
  const viaRef = useRef<"close" | "finish">("close");
  const wasOpen = useRef(false);
  useEffect(() => {
    // Two cookieless events tell the owner whether guests read it or skip it (m11 decision 16):
    // no table number, no name, no person — the door and the page only.
    if (open && !wasOpen.current) {
      // Every open starts on page 1 (the body remounts with the sheet's content).
      pageRef.current = 1;
      viaRef.current = "close";
      posthog.capture("guide_opened", { source });
    }
    wasOpen.current = open;
  }, [open, source]);
  const change = (next: boolean) => {
    if (!next && wasOpen.current) {
      posthog.capture("guide_closed", { page: pageRef.current, via: viaRef.current });
      viaRef.current = "close";
    }
    onOpenChange(next);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={change}
      onCloseAutoFocus={onCloseAutoFocus}
      className="mms-sheet-full diner-guide"
      closeLabel={{ idle: <CloseName />, busy: <CloseName /> }}
      title={
        <span className="diner-guide-eyebrow">
          <span aria-hidden>✦</span>
          {GUIDE_COPY.frame}
        </span>
      }
    >
      <GuideBody
        pages={pages}
        source={source}
        tableNumber={tableNumber}
        onPage={(n) => {
          pageRef.current = n;
        }}
        onFinish={() => {
          viaRef.current = "finish";
          change(false);
        }}
      />
    </Sheet>
  );
}

/** The ✕'s name: "Close the guide", then the one dismiss word's Burmese (round 3). */
function CloseName() {
  return (
    <>
      {GUIDE_COPY.closeName} <span lang="my">{GUIDE_WORDS.close.my}</span>
    </>
  );
}

/** Two tongues, English leading, the Burmese stacked beneath (a margin, never a whitespace node). */
function Pair({ text }: { text: GuideText }) {
  return (
    <span className="diner-guide-pair">
      <span>{text.en}</span>
      {text.my && <span lang="my">{text.my}</span>}
    </span>
  );
}

/** One open of the guide: mounted with the sheet's content, so every open starts on page 1. */
function GuideBody({
  pages,
  source,
  tableNumber,
  onPage,
  onFinish,
}: {
  pages: readonly GuidePage[];
  source: "auto" | "account";
  tableNumber: number | null;
  onPage: (n: number) => void;
  onFinish: () => void;
}) {
  const total = pages.length;
  const [step, setStep] = useState(1);
  // Pages already LEFT in this open: a revisit draws its final frame (each motion plays once).
  const [played, setPlayed] = useState<ReadonlySet<number>>(() => new Set());
  // The one live region's line: null on open (a status region speaks only changes).
  const [spoken, setSpoken] = useState<ReturnType<typeof guideSpoken> | null>(null);
  const titleId = useId();
  const backRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef(false);
  // The arm's clock: when the current page was shown, and when the pointer last went down. null
  // until the first commit stamps it — a tap before then is refused (arming, never "long armed").
  const shownAt = useRef<number | null>(null);
  const downAt = useRef<number | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [step]);
  // Back on page 2 goes inert as page 1 shows: hand focus to Next before the browser drops it.
  useLayoutEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    nextRef.current?.focus();
  }, [step]);

  /** Every guide control's tap goes through the arm. `detail === 0` is a keyboard click. */
  const tap = (e: MouseEvent<HTMLButtonElement>, act: () => void): void => {
    const pressed = e.detail === 0 ? null : downAt.current;
    downAt.current = null;
    if (
      !guideActAccepted({
        now: Date.now(),
        shownAt: shownAt.current,
        downAt: pressed,
        armMs: DINER_GUIDE_ARM_MS,
      })
    )
      return;
    act();
  };

  const go = (to: number, from: HTMLButtonElement | null) => {
    if (to === step || to < 1 || to > total) return;
    haptic("pick");
    setPlayed((p) => (p.has(step) ? p : new Set(p).add(step)));
    if (to === 1 && from !== null && from === backRef.current) focusNext.current = true;
    setStep(to);
    setSpoken(guideSpoken(pages[to - 1]!));
    onPage(to);
  };

  const page = pages[step - 1]!;
  const last = step === total;
  const motion = !played.has(step);
  return (
    <div
      className="diner-guide-body"
      onPointerDownCapture={() => {
        downAt.current = Date.now();
      }}
    >
      <div className="diner-guide-page" role="group" aria-labelledby={titleId}>
        <Stage page={page} tableNumber={tableNumber} motion={motion} first={step === 1} />
        <div className="diner-guide-words">
          <h3 id={titleId} className="diner-guide-title">
            <span className="diner-guide-title-en">
              {page.mark === "ring" && <KitchenTrack stage="unsent" size="glyph" surface="theme" />}
              {page.title.en}
              {page.mark === "spark" && (
                <span aria-hidden className="diner-guide-spark">
                  ✦
                </span>
              )}
            </span>
            {page.title.my && (
              <span lang="my" className="diner-guide-title-my">
                {page.title.my}
              </span>
            )}
          </h3>
          {page.lines.map((l) => (
            <p key={l.en} className="diner-guide-line">
              <Pair text={l} />
            </p>
          ))}
          {page.key && (
            <ul role="list" aria-label={GUIDE_COPY.keyName} className="diner-guide-key">
              {(["sent", "cooking", "served"] as const).map((s) => (
                <li key={s}>
                  <KitchenTrack stage={s} size="glyph" surface="theme" word={DINER_STAGE_WORD[s]} />
                </li>
              ))}
            </ul>
          )}
          {page.quiet && (
            <p className="diner-guide-quiet">
              <Pair text={page.quiet} />
            </p>
          )}
        </div>
      </div>

      <div className="diner-guide-foot">
        <GuideDots
          total={GUIDE_PAGE_COUNT}
          current={step}
          label={GUIDE_WORDS.steps}
          name={(n) => GUIDE_WORDS.step(n, GUIDE_PAGE_COUNT)}
          onPick={(n, e) => tap(e, () => go(n, e.currentTarget))}
        />
        <div className="diner-guide-dock">
          {/* ONE element on every page: on page 1 it holds its slot, hidden and inert, so Next never
              moves under a finger and never remounts. */}
          <Button
            ref={backRef}
            variant="secondary"
            size="xl"
            className="diner-guide-back"
            data-held={step === 1 || undefined}
            inert={step === 1 || undefined}
            aria-hidden={step === 1 || undefined}
            onClick={(e) => tap(e, () => go(step - 1, e.currentTarget))}
          >
            <Pair text={GUIDE_WORDS.back} />
          </Button>
          <Button
            ref={nextRef}
            variant="primary"
            size="xl"
            onClick={(e) =>
              tap(e, () => {
                if (!last) return go(step + 1, e.currentTarget);
                haptic("pick");
                onFinish();
              })
            }
          >
            <Pair
              text={
                !last
                  ? GUIDE_WORDS.next
                  : source === "account"
                    ? GUIDE_WORDS.close
                    : GUIDE_WORDS.browseMenu
              }
            />
          </Button>
        </div>
      </div>

      {/* The dialog's ONE live region (the page behind is aria-hidden under the modal): silent on
          open, it speaks each page change once — the heading in both tongues, then the first
          sentence, derived from the page itself. */}
      <p role="status" aria-atomic="true" className="sr-only">
        {spoken && (
          <>
            {spoken.title.en}
            {spoken.title.my && (
              <>
                , <span lang="my">{spoken.title.my}</span>
              </>
            )}
            . {spoken.line}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The picture: a sunken tray (`role="img"`, one sentence for its name) holding the real component,
 * inert, at one uniform scale. Its pass notches show the tray (`--pass-hole`).
 */
function Stage({
  page,
  tableNumber,
  motion,
  first,
}: {
  page: GuidePage;
  tableNumber: number | null;
  motion: boolean;
  first: boolean;
}) {
  return (
    <div
      className="diner-guide-stage card-textured"
      role="img"
      aria-label={page.stageLabel}
      data-picture={page.picture}
    >
      <Picture picture={page.picture} tableNumber={tableNumber} motion={motion} first={first} />
    </div>
  );
}

const PASS_LABEL = GUIDE_WORDS.passLabel;

function Picture({
  picture,
  tableNumber,
  motion,
  first,
}: {
  picture: GuidePicture;
  tableNumber: number | null;
  motion: boolean;
  first: boolean;
}) {
  // A RISE is the kit's own `.mms-rise` (reduced-motion gated in globals.css), on its own box so it
  // never fights the picture's scale. Page 1's waits out the sheet's entrance: one thing at a time.
  const rise = motion ? "diner-guide-rise mms-rise" : "diner-guide-rise";
  const afterEntrance: CSSProperties | undefined =
    motion && first ? { animationDelay: "var(--dur-sheet)" } : undefined;
  switch (picture) {
    case "pass":
      // The guest's REAL table — the one personal value — at the holder tier, issued.
      return (
        <div className={rise} style={afterEntrance}>
          <div className="diner-guide-pic" data-scale="pass">
            <CounterPass
              tier="holder"
              {...passIdentity(tableNumber, null)}
              label={PASS_LABEL}
              lang="en"
              inert
              tear
            />
          </div>
        </div>
      );
    case "unsent":
    case "kitchen":
    case "bill-phone":
      return (
        <div
          className="diner-guide-pic"
          data-scale="live"
          // Page 2's one movement is its LAST row rising onto the order (`.diner-guide-*` block).
          data-motion={picture === "unsent" && motion ? "row" : undefined}
        >
          <LivePass
            picture
            items={guideSampleItems(picture)}
            nowIso={GUIDE_SAMPLE.nowIso}
            tableNumber={null}
            hostName={null}
            hostLabel={null}
            ownerOf={null}
            totalCents={0}
            tipCents={0}
            filling={picture === "kitchen" && motion ? GUIDE_FILLING_ID : null}
            turning={picture === "bill-phone" && motion}
          />
        </div>
      );
    case "bill-counter":
      // The pass the phone shows at the counter (PD2's ask) — its own tier and its own RISE.
      return (
        <div className={rise}>
          <div className="diner-guide-pic" data-scale="counter">
            <CounterPass
              tier="counter"
              {...passIdentity(null, null)}
              label={PASS_LABEL}
              lang="en"
              inert
              tear
            />
          </div>
        </div>
      );
    case "where":
      return <WherePicture motion={motion} />;
  }
}

/** Page 5: the tab bar's own cells (the bar's classes and glyphs), Order lit, the pass rising above it. */
function WherePicture({ motion }: { motion: boolean }) {
  const tabs = dinerTabs({
    pathname: "/cart",
    here: null,
    mode: "dinein",
    cartId: null,
    cartCount: null,
    order: null,
    stars: null,
  });
  return (
    <div className="diner-guide-where" inert aria-hidden>
      <div className={motion ? "diner-guide-where-pass mms-rise" : "diner-guide-where-pass"}>
        <CounterPass
          tier="holder"
          {...passIdentity(null, null)}
          label={PASS_LABEL}
          lang="en"
          inert
        />
      </div>
      <div className="diner-guide-where-bar">
        {tabs.map((t) => (
          <span key={t.key} className="diner-tab" aria-current={t.current ? "page" : undefined}>
            <span className="diner-tab-icon">
              <Icon name={DINER_TAB_ICON[t.key]} size={22} />
            </span>
            <span className="diner-tab-label">{t.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The device's guide store: local storage, then the server-set cookie (`dinerGuideStore`). */
export const dinerGuideDeviceStore = dinerGuideStore(
  () => window.localStorage,
  () => document.cookie,
);

/**
 * Ask the server to set the mark too (the critic's B11 — it outlives Safari's seven-day script
 * storage). Fire and forget: a deliberate swallow — the device mark already holds, and a lost
 * cookie only means a phone whose storage Safari cleared may be shown the guide once more.
 */
export function markGuideSeenOnServer(): void {
  try {
    void fetch("/api/guide-seen", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    // deliberate: no fetch (an old browser) — the device mark is the mark
  }
}

/**
 * The Account door (post-pay's You panel, Help & contact's first row): "How it works at a table"
 * reopens the same guide at page 1. Without a table session the pass reads "Your table"; page 4
 * follows the flag as everywhere; the last primary is "Close · ပိတ်", and focus returns to this row
 * (the sheet's default restore). A guide opened here is SEEN: the first run never offers it again on
 * this phone (PD12's Codex round 1 rule, the shared `markGuideSeen`).
 */
export function DinerGuideDoor() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="nav-link diner-guide-door"
        aria-haspopup="dialog"
        onClick={() => {
          markGuideSeen(dinerGuideDeviceStore, DINER_GUIDE_KEY);
          // The server mark is asked for even when this phone refused the local one (Codex on
          // #348): the guest has read the guide, and the cookie is the mark that survives.
          markGuideSeenOnServer();
          setOpen(true);
        }}
      >
        {GUIDE_COPY.accountRow}
      </button>
      <DinerGuide
        open={open}
        onOpenChange={setOpen}
        source="account"
        tableNumber={null}
        role={null}
        atCap={false}
      />
    </>
  );
}
