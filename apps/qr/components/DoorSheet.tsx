"use client";
import { useState, type ReactNode } from "react";
import { Sheet, buttonClass } from "@mms/ui";
import posthog from "posthog-js";
import { TransitionLink as Link } from "@/components/nav/TransitionNav";
import { DoorFace } from "@/components/ModeCard";
import { useForgetCart } from "@/components/ActiveOrderProvider";
import { DOORS, currentDoor, doorFor } from "@/lib/doors";
import { t } from "@/lib/i18n";
import { menuHref } from "@/lib/menu-href";
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
 * `tableNumber` is a PROP, not a `useCart()` read: the market (`/grocery`) mounts no
 * `TableCartProvider`, and `useCart` throws outside one. The menu hands its number over; the market
 * and to-go pass none. Motion is the Sheet primitive's own — no stagger inside, the lit cap static.
 * No live region: nothing here announces; the Sheet names itself by its title.
 */
export function DoorSheet({
  mode,
  tableNumber = null,
  flourish,
  onOpenChange,
}: {
  /** The menu's internal mode (dinein | pickup | scango) — what `doorFor` and `currentDoor` read. */
  mode: string;
  /** The table's number when the session knows it (dine-in only); names the trigger and the lit row. */
  tableNumber?: number | null;
  /** A decorative tail inside the trigger (the market's "· စျေး"), rendered aria-hidden. */
  flourish?: ReactNode;
  /** Codex round 4 on Phase 1a: the host suspends pull-to-refresh (and the market its camera —
   *  `decodeHold` treats any sheet over the stage as a hold) while this sheet is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
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
