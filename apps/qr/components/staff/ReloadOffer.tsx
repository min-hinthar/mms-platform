"use client";
import { useEffect, useId, useState } from "react";
import { Button } from "@mms/ui";
import type { StaffKey } from "@/lib/i18n/staff";
import { blockKey, reloadHolds, stallCureBlock, subscribeReloadHolds } from "@/lib/reload-guard";
import type { StaffLang } from "@/lib/staff-lang";
import { useDeviceOffline } from "@/lib/useConnectionTruth";
import { Chrome } from "./Chrome";
import { useReloadHold } from "./useReloadHold";

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
 *
 * Phase 2i (P2bi) — two additions, both on the BUTTON (so every site that offers a reload gets them):
 *  - A STANDING HOLD while it is on screen (`reloadOffer`): an offer a person is reading must not be
 *    reloaded out from under them by the automatic reload for a new build. Harmless: tapping it IS a
 *    reload, into the new build.
 *  - NEVER OFFLINE. A reload with no network lands on the worker's offline page and empties the
 *    screen. A sustained outage (`useDeviceOffline`) says so on the button and refuses it
 *    (`aria-disabled`); the tap itself re-reads `navigator.onLine`, so the seconds before the outage
 *    is "sustained" are refused too — and a tap refused that way says so on the button at once (it
 *    would otherwise read as a dead control during a stall), until the browser is back online.
 *    Online, the reload is the bare `window.location.reload()` — unless (Codex r2 on #311, P2iv) a
 *    reload would SILENTLY erase what only this document holds (`stallCureBlock`: the KDS Undo bar,
 *    a pick still inside its window the tab could not stash, a cash hand-back only memory holds).
 *    Then the tap is refused with that hold's own sentence (`blockKey`), in the button's OWN
 *    `role="alert"` beside it — never inside the site's region — and the line goes the moment the
 *    hold does. Never for a young write, a stall or a pick already sending: the reload is their cure.
 * 2i chose a separate guarded row for a new build (`StaffBarUpdate`), so the stall cure here is
 * unconditional except offline (a reload then cures nothing — it empties the screen): `ReloadReason`
 * keeps its one member.
 */

/** Why the tablet is being offered a reload. One reason: a new build is the staff bar's row
 *  (`StaffBarUpdate`), never this offer — the stall's cure must stay unconditional. */
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
  // Phase 2i — the offer on screen holds the automatic reload for a new build (its own token).
  useReloadHold("standing", "reloadOffer", useId(), true);
  const deviceOffline = useDeviceOffline();
  // A tap refused offline before the outage counts as sustained: said on the button until `online`.
  const [refusedOffline, setRefusedOffline] = useState(false);
  useEffect(() => {
    if (!refusedOffline) return;
    const back = () => setRefusedOffline(false);
    window.addEventListener("online", back);
    // Back before this effect ran: no event will come.
    if (navigator.onLine !== false) back();
    return () => window.removeEventListener("online", back);
  }, [refusedOffline]);
  const offline = deviceOffline || refusedOffline;
  // Codex r2 on #311 — a tap refused by a hold says why until the hold is gone (re-read on every
  // register change; a different refusing hold re-names the sentence).
  const [refusal, setRefusal] = useState<StaffKey | null>(null);
  useEffect(() => {
    if (refusal === null) return;
    const recheck = () => {
      const held = stallCureBlock(reloadHolds());
      setRefusal(held === null ? null : blockKey(held));
    };
    recheck();
    return subscribeReloadHolds(recheck);
  }, [refusal]);
  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        block={block}
        disabled={offline}
        // A document unload — the one escape a stuck action queue cannot hold (docblock) — and never
        // offline, read at the tap (the render's verdict waits out a sustain).
        onClick={() => {
          if (navigator.onLine === false) {
            setRefusedOffline(true);
            return;
          }
          // …and never over what only this document holds (`stallCureBlock`), read at the tap.
          const held = stallCureBlock(reloadHolds());
          const key = held === null ? null : blockKey(held);
          if (key !== null) {
            setRefusal(key);
            return;
          }
          window.location.reload();
        }}
      >
        <Chrome lang={lang} k={offline ? "out.reload.offline" : "out.reload"} echo="stack" />
      </Button>
      {refusal !== null && (
        <p className="staff-reload-line" role="alert">
          <Chrome lang={lang} k={refusal} echo={false} />
        </p>
      )}
    </>
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
