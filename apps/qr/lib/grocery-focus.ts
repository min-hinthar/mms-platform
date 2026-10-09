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

/** The Name sheet's close-restore, run at its exit end: after an add, the chip's action (the tag
 *  that opened the sheet left with it); else the opener while it is still mounted; else the chip's
 *  action; else the fresh-basket button; else the stage; else a camera panel's title. */
export function nameSheetCloseTarget(c: {
  closedByAdd: boolean;
  chipAction: Candidate;
  opener: Candidate;
  fresh: Candidate;
  stage: Candidate;
  panelTitle: Candidate;
}): FocusTarget | null {
  return (
    (c.closedByAdd ? live(c.chipAction) : null) ??
    live(c.opener) ??
    live(c.chipAction) ??
    live(c.fresh) ??
    live(c.stage) ??
    live(c.panelTitle)
  );
}
