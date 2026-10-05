"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Field, Sheet, buttonClass } from "@mms/ui";
import posthog from "posthog-js";
import { TransitionLink as Link, useJourneyRouter } from "@/components/nav/TransitionNav";
import { DoorFace } from "@/components/ModeCard";
import { TableGrid } from "@/components/TableGrid";
import { useForgetCart } from "@/components/ActiveOrderProvider";
import { DOORS, currentDoor, doorFor } from "@/lib/doors";
import { t } from "@/lib/i18n";
import { menuHref } from "@/lib/menu-href";
import { JOIN_COPY, dineInMenuHref, tableGridOffered } from "@/lib/table-pick";
import type { DineInTable } from "@/lib/tables";
import { forgetDineinOnThisDevice } from "@/lib/useTableSession";

/**
 * Phase 3b (D9) — the door is a moment, and the eyebrow has ONE host. The masthead's door eyebrow
 * ("At table 7 ⌄" · "At the table ⌄" · "To go ⌄" · "Scan & go ⌄") opens this sheet on EVERY door,
 * absorbing Phase 1a's `TableOptions` (dine-in only) and the dead `<p class="eyebrow">` the other
 * doors wore. It is titled with v7.2's "Change order type"; its three rows are the home's three
 * doors from the ONE table (`lib/doors.ts`) wearing the home's own face (`DoorFace`), so the sheet
 * can never offer a door the home does not. The CURRENT door is a non-link wearing the lit-gold cap
 * (`aria-current="true"`, `.door-sheet-current` on the `.checkout-pill-on` rule — ONE selection
 * vocabulary, DESIGN-LANGUAGE §2); the other two are the home's exact links.
 *
 * The sub-line is honest. v7.2's sub-line under this title claimed the cart carries across doors, and
 * here that is false — each door mints its own cart — so the line says what the code keeps: each way
 * of ordering has its own order (DoorSheet.test refuses the v7.2 words by name, in the DOM and in
 * this file). Rejected alternative: a dead eyebrow plus brand-link → / → re-pick.
 *
 * Dine-in keeps TableOptions' two exits, verbatim in words and in meaning, under a hairline:
 *  · Back to the start — a NAVIGATION to the door picker; the party's session and cart survive
 *    untouched (4h sliding TTL). `menuHref(null)` = the door picker.
 *  · Leave this table — forgets the table ON THIS PHONE only (the storage clear runs in the click,
 *    before the navigation); never a server "close table". It forgets the table's CART pointer too
 *    (blind pass on #300): otherwise the header kept offering "Your order" for the table just left.
 *
 * Phase 3c-i (D18) — THE TABLE GRID IS A SECTION OF THIS SHEET, never a second one. When the host
 * passes `tables` and `tableGridOffered(mode)` holds — i.e. OFF the dine-in MENU (the rule reads this
 * sheet's door, not the phone's sessions — J33 names what that leaves open) — a "Pick your
 * table" section (v7.2's words, both tongues) follows the doors list: the K2 `TableGrid` with the
 * sheet's own motion (no stagger), and, under a tapped SEATED chip, an INLINE join form (D9: never a
 * nested sheet; the dialog count stays one) that arrives with `mms-rise` and takes focus on its code
 * input, giving it back to the chip when the ask collapses. The Dine-in ROW is untouched — still the
 * home's exact link, not a disclosure. The RULE is `lib/table-pick.ts`'s and has a mutant: a
 * `?table=N` claim mints a NEW session (it never reuses the persisted code — useTableSession), so a
 * grid at a live table, numbered or numberless, would orphan this phone's drafts; "wrong table?" from
 * a table is 3c-ii's `bindTable`. `mode_selected` fires on the CHIP TAP — the door actually
 * entered — never on open or on the section's reveal, and a chip tap never closes the sheet (the
 * shipped concurrency rule: the market's camera hold; the per-door remount unmounts it). An EMPTY
 * Join is refused ON THE FIELD (`JOIN_COPY.missing`, `aria-invalid`, focus back on the input) — an
 * `aria-disabled` button still submits on Enter, and used to say nothing; the seated chip is a
 * DISCLOSURE here (`aria-expanded` / `aria-controls` → the form), which `/dine-in`'s dialog-opening
 * chip is not (blind pass on 3c-i · a11y). The market
 * passes no `tables` yet: it is a client page and the read is service-role, RSC-only — a
 * member-gated `/api/tables` is filed, not built here.
 *
 * `tableNumber` is a PROP, not a `useCart()` read: the market (`/grocery`) mounts no
 * `TableCartProvider`, and `useCart` throws outside one. The menu hands its number over; the market
 * and to-go pass none. Motion is the Sheet primitive's own — no stagger inside, the lit cap static.
 * No live region: nothing here announces; the Sheet names itself by its title.
 */
export function DoorSheet({
  mode,
  tableNumber = null,
  tables,
  flourish,
  onOpenChange,
}: {
  /** The menu's internal mode (dinein | pickup | scango) — what `doorFor` and `currentDoor` read. */
  mode: string;
  /** The table's number when the session knows it (dine-in only); names the trigger and the lit row. */
  tableNumber?: number | null;
  /** 3c-i (D18): the registered dine-in tables (number + occupancy; tokens stripped server-side) for
   *  the "Pick your table" section. Rendered only when `tableGridOffered(mode)` — never at a table. */
  tables?: DineInTable[];
  /** A decorative tail inside the trigger (the market's "· စျေး"), rendered aria-hidden. */
  flourish?: ReactNode;
  /** Codex round 4 on Phase 1a: the host suspends pull-to-refresh (and the market its camera —
   *  `decodeHold` treats any sheet over the stage as a hold) while this sheet is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  // 3c-i — the seated table whose code is being asked for, inline under the grid (null = no ask).
  const [joinNum, setJoinNum] = useState<number | null>(null);
  const [code, setCode] = useState("");
  // The empty submit's refusal, on the field; cleared by typing, by a re-target and on the next open.
  const [joinError, setJoinError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tablesTitleId = useId();
  const joinTitleId = useId();
  const joinFormId = useId();
  const router = useJourneyRouter();
  const setOpen = (next: boolean) => {
    // A reset "on close" would be visible for the whole exit slide (§16) — reset on the next open.
    if (next) {
      setJoinNum(null);
      setCode("");
      setJoinError(null);
    }
    setOpenState(next);
    onOpenChange?.(next);
  };
  const forgetCart = useForgetCart();
  const here = currentDoor(mode);
  const atTable = mode === "dinein" && tableNumber != null;
  // Codex round 3 (Phase 1a): the table's NUMBER lives on the eyebrow — GuestList's lock/settle
  // banners return before its own "Table N", so without this the menu stopped saying which table the
  // phone is at while a tablemate checks out.
  const shown = atTable ? `At table ${tableNumber}` : doorFor(mode).label;

  // The step change moves focus INTO the ask (QA §A) — on every reveal and every re-target.
  useEffect(() => {
    if (joinNum != null) inputRef.current?.focus();
  }, [joinNum]);

  /** The door actually entered — recorded on the tap that navigates, never on open or reveal. */
  const dinein = DOORS.find((d) => d.mode === "dinein")!;
  const enterDinein = () =>
    posthog.capture("mode_selected", { mode: dinein.mode, door: dinein.door, source: "sheet" });
  const onJoin = (n: number, chip: HTMLButtonElement) => {
    if (joinNum === n) {
      // The same chip again collapses the ask; focus goes back where the diner was.
      setJoinNum(null);
      chip.focus();
      return;
    }
    setCode("");
    setJoinError(null);
    setJoinNum(n);
  };
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase(); // tokens are 8-char uppercase — normalize like JoinTable
    if (!c) {
      // Said on the field and focus goes back to it — a refusal a reader can find (QA §A).
      setJoinError(JOIN_COPY.missing);
      inputRef.current?.focus();
      return;
    }
    enterDinein();
    // The sheet stays open through the navigation (the per-door remount unmounts it).
    router.push(dineInMenuHref({ join: c }));
  };

  return (
    <>
      <button
        type="button"
        className="eyebrow menu-context-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {shown}
        {flourish ? <span aria-hidden>{flourish}</span> : null}
        <span aria-hidden className="menu-context-caret">
          ⌄
        </span>
        <span className="sr-only"> — change how you’re ordering</span>
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={
          <>
            {t("en", "changeOrderType")}{" "}
            <span lang="my" className="door-sheet-my">
              {t("my", "changeOrderType")}
            </span>
          </>
        }
      >
        <p className="door-sheet-sub">
          {t("en", "eachDoorOwnOrder")}{" "}
          <span lang="my" className="door-sheet-my">
            {t("my", "eachDoorOwnOrder")}
          </span>
        </p>
        <ul role="list" className="door-sheet-doors">
          {DOORS.map((d) =>
            d.mode === here.mode ? (
              <li key={d.mode}>
                {/* Where you ARE, not a candidate you pick: a non-link, not focusable, label + fill
                    on this ONE element (v7.2's modeChip form — "Dine-in · Table 7"). */}
                <div aria-current="true" className="door-sheet-row door-sheet-current">
                  <DoorFace
                    emoji={d.emoji}
                    name={atTable ? `${d.name} · Table ${tableNumber}` : d.name}
                    my={d.my}
                    description={d.description}
                    current
                  />
                  {/* Said, not only shown: `aria-current` on a role-less div is not reliably spoken
                      (blind pass on 3b), and the trigger's word ("Scan & go") is the place's, the
                      row's the door's ("Grocery") — this is the sentence that joins them. */}
                  <span className="sr-only"> — you’re here</span>
                </div>
              </li>
            ) : (
              <li key={d.mode}>
                <Link
                  href={d.href}
                  className="door-sheet-row"
                  // The sheet stays OPEN through the navigation (blind pass on 3b, concurrency): on
                  // the market it IS the camera hold, and the route change — async, and a view
                  // transition — unmounts it. Closing it here released the hold while the stream still
                  // ran, so a sighting in that window wrote a line into the basket just left.
                  onClick={() => {
                    posthog.capture("mode_selected", {
                      mode: d.mode,
                      door: d.door,
                      source: "sheet",
                    });
                  }}
                >
                  <DoorFace emoji={d.emoji} name={d.name} my={d.my} description={d.description} />
                </Link>
              </li>
            ),
          )}
        </ul>
        {tableGridOffered(mode) && tables && (
          // 3c-i (D18) — the grid as a SECTION, under the doors, under a hairline. Spacing is the
          // exits' idiom in tokens; `.table-chip.is-mine` is availability (the clay wash), never the
          // lit cap — the current door above stays the one selected thing on this surface.
          <section
            aria-labelledby={tablesTitleId}
            className="door-sheet-tables"
            style={tablesSection}
          >
            <h3 id={tablesTitleId} style={sectionTitle}>
              {t("en", "pickYourTable")}{" "}
              <span lang="my" className="door-sheet-my">
                {t("my", "pickYourTable")}
              </span>
            </h3>
            <p className="door-sheet-sub" style={flush}>
              Scan your table’s sticker, or pick your number.
            </p>
            <TableGrid
              tables={tables}
              stagger={false}
              source="sheet"
              onJoin={onJoin}
              onEnter={enterDinein}
              expandedTable={joinNum}
              controls={joinFormId}
            />
            {joinNum != null && (
              // The seated-table ask, INLINE (never a nested sheet). Arrives with `mms-rise` — RM-none
              // in globals.css — and the Field is the app's one field.
              <form
                id={joinFormId}
                aria-labelledby={joinTitleId}
                className="mms-rise"
                style={joinForm}
                onSubmit={submitJoin}
              >
                <h4 id={joinTitleId} style={sectionTitle}>
                  {JOIN_COPY.title(joinNum)}
                </h4>
                <p className="door-sheet-sub" style={flush}>
                  {JOIN_COPY.body(joinNum)}
                </p>
                <Field label={JOIN_COPY.label} error={joinError}>
                  {(control) => (
                    <input
                      {...control}
                      ref={inputRef}
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        setJoinError(null);
                      }}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={40}
                      // A synthetic example, NOT any seeded token (lib/table-pick.ts says why).
                      placeholder={JOIN_COPY.placeholder}
                    />
                  )}
                </Field>
                {/* A refusal that stays reachable: `aria-disabled`, never native `disabled` — the
                    submit guard above is the enforcement; an empty code goes nowhere, and SAYS so on
                    the field (Enter in the input submits past any disabled look). */}
                <button
                  type="submit"
                  className={buttonClass({ variant: "primary", size: "lg", block: true })}
                  aria-disabled={!code.trim() || undefined}
                >
                  {JOIN_COPY.button}
                </button>
              </form>
            )}
          </section>
        )}
        {mode === "dinein" && (
          <div className="door-sheet-exits">
            <Link
              href={menuHref(null)}
              className={buttonClass({ variant: "secondary", size: "lg", block: true })}
              onClick={() => setOpen(false)}
            >
              <span className="door-sheet-exits-label">
                Back to the start
                <span className="door-sheet-exits-note">keeps your table</span>
              </span>
            </Link>
            <Link
              href={menuHref(null)}
              className={buttonClass({ variant: "danger", size: "lg", block: true })}
              onClick={() => {
                forgetDineinOnThisDevice();
                forgetCart();
                setOpen(false);
              }}
            >
              <span className="door-sheet-exits-label">
                Leave this table
                <span className="door-sheet-exits-note">
                  this phone only — the table stays open for everyone else
                </span>
              </span>
            </Link>
          </div>
        )}
      </Sheet>
    </>
  );
}

// 3c-i — the section's spacing in tokens (the `.door-sheet-exits` idiom: a hairline, then the
// stack). Inline until Slice A's stylesheet carries a `.door-sheet-tables` rule; no literal sizes.
const tablesSection = {
  display: "grid",
  gap: "var(--s3)",
  marginTop: "var(--s4)",
  paddingTop: "var(--s4)",
  paddingBottom: "var(--s2)",
  borderTop: "1px solid var(--bd)",
} as const;
const sectionTitle = { margin: 0, fontSize: "var(--fs-h3)" } as const;
const flush = { margin: 0 } as const;
const joinForm = { display: "grid", gap: "var(--s3)", marginTop: "var(--s2)" } as const;
