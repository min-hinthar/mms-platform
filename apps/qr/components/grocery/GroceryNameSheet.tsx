"use client";
import { useRef } from "react";
import { Button, Icon, Sheet } from "@mms/ui";
import type { GroceryHit } from "@/lib/grocery";
import { looksLikeBarcode } from "@/lib/scan-notice";
import type { SheetRefusal } from "@/lib/sheet-refusal";
import { t, type DictKey } from "@/lib/i18n";
import { GroceryResultRow } from "./GroceryResultRow";

/**
 * PD4 (m4 screen 2) — the Name sheet over the still-streaming lens: the Scan door's ONLY search.
 *
 * The Scan door lost the field that sat above the stage and pushed it down (the camera never
 * scrolls away, decision 4); every "Search by name" on that door — the miss tag's, the paper
 * panels' — opens this sheet instead. The stage keeps streaming under the scrim and SWALLOWS
 * sightings (`decodeHold`), so nothing is added behind the sheet or when it closes.
 *
 * GUIDED: every state says its one next step in plain words, in both tongues, in the diner
 * register (B9) — the NOW line, then ONE actor-first next sentence directly above the one hero, the
 * human fallback last:
 *   · just opened — "It’s not you — most shelf codes aren’t in the app yet." + "One word from the
 *     name is enough…" (the coverage truth, said where the miss happens: the primer is seen only
 *     before the first camera grant). No tag, no hero; the ✕ is the way back.
 *   · typing — "Searching…", then the ONE shared result row (busy keeps full ink, B10).
 *   · no match — the NOW line again, the coaching line, then "Keep scanning — this one can wait for
 *     the counter." above the hero "Back to the camera", and the TAG FOR THE COUNTER last.
 *   · offline — "Search needs a connection — or ask at the counter." + the tag + "Back to the camera".
 *   · failed — "Search unavailable — please try again." + the tag; the hero becomes "Try again"
 *     (one hero verb per state) and "Back to the camera" is withheld — the ✕ is the way back.
 *   · 8–14 digits typed — "That looks like a barcode…" (package 2's line; never a miss event).
 *   · an add refused (locked / settling) — the shipped sentence replaces the state line, because a
 *     bottom toast would sit behind the keyboard; the sheet stays open.
 *
 * THE TAG FOR THE COUNTER shows ONLY in a sheet a MISS opened (`miss` non-null; B6): a sheet opened
 * from a camera-failure panel scanned no code, and a tag there would be a claim about a code that
 * does not exist. It carries the lens tag's own words (one vocabulary), the Burmese at the counter's
 * reading size, the query the shopper tried (so the handoff carries its own context, appendix C) —
 * never a code, a price, or a promise of a sale (ruling #11 default; M189). Constant cream with ink
 * in both themes: the house rule for every Dad-facing paper (amendment A2), led by the receipt
 * glyph every "for the counter" object wears (A1). By the same logic (blind pass on #329) a sheet
 * NO code opened also withholds "It’s not you — most shelf codes aren’t in the app yet." and the
 * "Keep scanning" / "Back to the camera" pair: a camera-denied shopper searching "durian" scanned
 * nothing, so it coaches the field ("One word from the name…", "Try one word…") and the ✕ is the
 * way back; "Try again" after a failure stays.
 *
 * The sheet closes on the server's ok ONLY (decision 20) — the page closes it from `add()`; a tap
 * here never closes it. It opens with the FIELD focused (`initialFocus`, D1(d)): the keyboard rises
 * in the opening tap — whether iPhone Safari honours that is the device sitting's check (#12).
 *
 * THE STATE LINE IS THIS MODAL'S OWN LIVE REGION (`role="status"`; blind pass on #329): the page
 * Toast cannot be the sheet's announcer — its pill sits behind the raised keyboard, and a refusal
 * drawn here instead was a non-live `<p>` nobody heard. Every dead end, "Searching…", and every
 * refusal the page routes here (`setSheetRefusal`) is announced once, inside the modal; the page
 * Toast stays the PAGE's one region. A refusal's node is KEYED on its sequence (lib/sheet-refusal.ts):
 * a second identical refusal changes no text, so only a new node re-announces it; its Burmese half
 * rides with it (blind pass 2 on #329).
 */
export function GroceryNameSheet({
  open,
  onClose,
  query,
  onQueryChange,
  hits,
  searching,
  searchFailed,
  online,
  miss,
  addingBarcode,
  busyLineId,
  refusal,
  onAddHit,
  onRetry,
  onCloseAutoFocus,
}: {
  open: boolean;
  /** The ✕, Esc, the scrim, the handle, and "Back to the camera". */
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  /** The page's debounced search: null = nothing asked yet (under 2 characters). */
  hits: GroceryHit[] | null;
  searching: boolean;
  /** A lookup FAILURE, told apart from zero rows. */
  searchFailed: boolean;
  online: boolean;
  /** The shelf code whose miss opened this sheet — null when a camera panel opened it. */
  miss: string | null;
  addingBarcode: string | null;
  busyLineId: string | null;
  /** A refusal the page routes here, shown in place of the state line — keyed, so an identical
   *  sentence still arrives as a new node in the live region. */
  refusal: SheetRefusal | null;
  onAddHit: (hit: GroceryHit) => void;
  /** Re-issue the search after a failure. */
  onRetry: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const typedCode = looksLikeBarcode(query);
  const asked = q.length >= 2 && !typedCode;
  const noMatch = asked && hits !== null && hits.length === 0 && !searching && !searchFailed;
  const failed = asked && searchFailed && online;
  const offline = asked && !online && hits !== null && hits.length === 0;
  const deadEnd = noMatch || failed || offline;
  const rows = asked && hits !== null && hits.length > 0 && !searchFailed;
  /** A MISS opened this sheet: the coverage truth, the camera hero and the counter tag are its. */
  const fromMiss = miss !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={
        <>
          {t("en", "searchByName")}
          <span lang="my" className="name-sheet-title-my">
            {t("my", "searchByName")}
          </span>
        </>
      }
      className="name-sheet"
      initialFocus={fieldRef}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="grocery-search name-sheet-field" role="search">
        <Icon name="search" size={18} />
        <input
          ref={fieldRef}
          id="name-sheet-query"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search grocery items by name"
          aria-describedby="name-state"
          placeholder="Search in English or မြန်မာ…"
          maxLength={40}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {/* The state block: the MODAL's own live region (see the docblock) — the page Toast is the
          page's, and sits behind the keyboard while this sheet is up. */}
      <div id="name-state" className="name-state" role="status">
        {refusal ? (
          <p key={refusal.key} className="name-state-lead">
            {refusal.text}
            {refusal.my && (
              <span lang="my" className="name-state-my">
                {refusal.my}
              </span>
            )}
          </p>
        ) : typedCode ? (
          <p className="name-state-lead">
            That looks like a barcode — search by the item’s name (English or Burmese).
          </p>
        ) : !asked ? (
          <>
            {fromMiss && <Line k="notYou" lead />}
            <Line k="oneWord" lead={!fromMiss} />
          </>
        ) : searching && (hits === null || hits.length === 0) ? (
          <Line k="searching" />
        ) : offline ? (
          <Line k="searchNeedsConnection" lead />
        ) : failed ? (
          <Line k="searchUnavailable" lead />
        ) : noMatch ? (
          <>
            {fromMiss && <Line k="notYou" lead />}
            <Line k="tryOneWord" lead={!fromMiss} />
          </>
        ) : null}
      </div>

      {rows && hits && (
        <ul role="list" aria-label="Search results" className="grocery-results">
          {hits.map((h) => (
            <GroceryResultRow
              key={h.barcode}
              hit={h}
              busy={addingBarcode === h.barcode}
              disabled={addingBarcode !== null || busyLineId !== null}
              onAdd={() => onAddHit(h)}
            />
          ))}
        </ul>
      )}

      {deadEnd && (failed || fromMiss) && (
        <div className="name-sheet-next">
          {failed ? (
            <Button variant="primary" block className="scan-btn-bi" onClick={onRetry}>
              {t("en", "tryAgain")}
              <span lang="my" className="scan-btn-my">
                {t("my", "tryAgain")}
              </span>
            </Button>
          ) : (
            <>
              <Line k="keepScanning" />
              <Button variant="primary" block className="scan-btn-bi" onClick={onClose}>
                {t("en", "backToCamera")}
                <span lang="my" className="scan-btn-my">
                  {t("my", "backToCamera")}
                </span>
              </Button>
            </>
          )}
        </div>
      )}

      {deadEnd && fromMiss && (
        // The human fallback, last. Read, not operated: no tab stop.
        <div className="paper-tag counter-tag" role="note" aria-labelledby="counter-tag-kicker">
          <div className="paper-tag-paper">
            <p id="counter-tag-kicker" className="counter-tag-kicker">
              <Icon name="receipt" size={14} />
              {t("en", "forTheCounter")}
              <span aria-hidden>·</span>
              <span lang="my" className="counter-tag-kicker-my">
                {t("my", "forTheCounter")}
              </span>
            </p>
            <p className="counter-tag-head">{t("en", "noticeUnknown")}</p>
            <p className="counter-tag-my" lang="my">
              {t("my", "noticeUnknown")}
            </p>
            {q && !typedCode && (
              <p className="counter-tag-query">
                {t("en", "lookedFor")} “{q}”
                <span lang="my" className="counter-tag-query-my">
                  {t("my", "lookedFor")} “{q}”
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** One bilingual state line: EN, then the Burmese as its own block (a margin, never whitespace). */
function Line({ k, lead = false }: { k: DictKey; lead?: boolean }) {
  return (
    <p className={lead ? "name-state-lead" : "name-state-next"}>
      {t("en", k)}
      <span lang="my" className="name-state-my">
        {t("my", k)}
      </span>
    </p>
  );
}
