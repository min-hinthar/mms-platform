/**
 * PD4 — where focus lands on the market page when the element holding it is about to vanish
 * (WCAG 2.4.3: never on <body>). Two chains, each the FIRST LIVE candidate in its order. Pure: the
 * candidates are passed in, so a value falsifies each rule (`grocery-focus.test.ts`).
 *
 * The Scan door has no search field (the Name sheet is its only search), and a FINISHED basket
 * (`cartGone`) unmounts the stage, its tag and its chip — and with them every Scan-door candidate
 * the chains used to reach. The banner's "Start a fresh basket" is then the one recovery on the
 * page, so it sits in both chains ahead of the stage (Codex round 2 on #329, 4226434706: a terminal
 * answer while focus was inside the portalled Name sheet closed it onto <body>).
 */
export type FocusTarget = {
  isConnected: boolean;
  focus(options?: { preventScroll?: boolean }): void;
};
type Candidate = FocusTarget | null | undefined;

const live = (t: Candidate): FocusTarget | null => (t && t.isConnected ? t : null);

/** The page's ONE parking fallback: a removed row, a fresh basket, an emptied basket sheet. The
 *  Browse field when it exists, else the fresh-basket button, else the stage, else a panel title. */
export function parkTarget(c: {
  field: Candidate;
  fresh: Candidate;
  stage: Candidate;
  panelTitle: Candidate;
}): FocusTarget | null {
  return live(c.field) ?? live(c.fresh) ?? live(c.stage) ?? live(c.panelTitle);
}

/** The Name sheet's close-restore, run at its exit end: after an add, the CHIP itself (the tag that
 *  opened the sheet left with it) — never its action: the Undo sits there, and a programmatic focus
 *  carries the sheet input's `:focus-visible` onto it, holding its window for a touch shopper who
 *  never chose it (blind pass 2 on #329); else the opener while it is still mounted; else the chip's
 *  action; else the fresh-basket button; else the stage; else a camera panel's title. */
export function nameSheetCloseTarget(c: {
  closedByAdd: boolean;
  /** The chip's root (`tabIndex={-1}`): its name and what the basket holds. */
  chip: Candidate;
  chipAction: Candidate;
  opener: Candidate;
  fresh: Candidate;
  stage: Candidate;
  panelTitle: Candidate;
}): FocusTarget | null {
  return (
    (c.closedByAdd ? live(c.chip) : null) ??
    live(c.opener) ??
    live(c.chipAction) ??
    live(c.fresh) ??
    live(c.stage) ??
    live(c.panelTitle)
  );
}

/** "Start a fresh basket": the pressed button leaves with the banner, so it is NEVER a candidate
 *  (parking on it dropped focus on <body> — Codex on #329's head ff29547). The Browse field when it
 *  exists; else the stage, which mounts on the next render (`usePendingFocus` waits for it); else a
 *  camera panel's title; else — the new basket failed to start, so no stage ever mounts — the
 *  session banner's Retry (the blind pass on #329 @ f0d013f). */
export function freshBasketLanding(c: {
  field: Candidate;
  stage: Candidate;
  panelTitle: Candidate;
  retry: Candidate;
}): FocusTarget | null {
  return live(c.field) ?? live(c.stage) ?? live(c.panelTitle) ?? live(c.retry);
}
