"use client";
import { Button } from "@mms/ui";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * Phase 2h (decision 9d) — THE one rendering of "this tablet is stuck — reload".
 *
 * WHY A RELOAD, AND ONLY A RELOAD. Next runs Server Actions one at a time per tab, and an action
 * that never answers holds every later one (LEARNINGS #157 · #200). While any async transition's
 * action is unanswered, React's entangled lane also holds every router push / replace / refresh /
 * back commit on the tab — so a soft navigation neither escapes that state nor even commits in it.
 * A document unload (`location.reload()`) is the ONLY universal escape: it aborts the queue, and the
 * reloaded page reads the server's truth. A stalled money write (`stalledSince() !== null`) is
 * therefore refused at the tap and offered exactly this — never a `router.refresh()`, which would
 * queue behind the stuck action like everything else.
 *
 * TWO SHAPES, ONE BUTTON (QA-CHECKLIST §A: one live region per view; the Phase 2h contract critic,
 * F1). Every site that says "reload" needs the same button, but not every site may draw the line:
 *  - `<ReloadOffer reason="stalled">` — the line as its OWN `role="alert"` plus the button, for a site
 *    that owns no live region (a trigger under a section, a bar). It speaks the line ONCE: no English
 *    echo inside the alert (a bilingual announcement says everything twice).
 *  - `<ReloadButton>` — the button ALONE, for a site that already keeps its view's one region mounted
 *    (a guarded sheet's `role="status"`, the pad's Toast, a door's alert). That region says the
 *    sentence through `<MsgText>` — `{ k: "out.stalled" }` for the refusal, or the site's own
 *    `*.waiting` key ("No answer yet — … reload the page to see") — and this button is the reload it
 *    promises. Drawing the line here as well would show the sentence twice; wrapping an offer in the
 *    site's `<p role=…>` would nest a <div> in a <p> and make the announcement bilingual.
 * The console is installed `display: "standalone"` (app/manifest.ts), so there is NO browser reload
 * button: every "reload the page" a sentence says must have this button beside it.
 *
 * Tokens only (`.staff-reload-offer` in globals.css); `<Chrome>` for every word; the entrance is the
 * kit's `.mms-rise`, whose reduced-motion off-switch covers it. The button is `@mms/ui`'s (44px floor
 * at every size, aria-disabled never native `disabled`).
 */

/** Why the tablet is being offered a reload. One reason today; the stale-build offer (Phase 2i)
 *  joins as a second member, with its own line, through this same component. */
export type ReloadReason = "stalled";

/** The line each reason says, named once. */
const LINE: Readonly<Record<ReloadReason, StaffKey>> = { stalled: "out.stalled" };

/** The reload itself — no line, no live role: the site's own region says why (see the docblock). */
export function ReloadButton({
  lang,
  block = false,
}: {
  lang: StaffLang;
  /** The button spans its container (a sheet's footer, a narrow pane). */
  block?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      size="lg"
      block={block}
      // A document unload — the one escape a stuck action queue cannot hold (docblock).
      onClick={() => window.location.reload()}
    >
      <Chrome lang={lang} k="out.reload" echo="stack" />
    </Button>
  );
}

/** The line as its own alert, and the button — for a site with no live region of its own. */
export function ReloadOffer({
  lang,
  reason,
  block = false,
}: {
  lang: StaffLang;
  reason: ReloadReason;
  /** The button spans its container. */
  block?: boolean;
}) {
  return (
    <div className="staff-reload-offer mms-rise">
      <p className="staff-reload-line" role="alert">
        <Chrome lang={lang} k={LINE[reason]} echo={false} />
      </p>
      <ReloadButton lang={lang} block={block} />
    </div>
  );
}
