"use client";
import { useState } from "react";
import { Sheet, buttonClass } from "@mms/ui";
import { TransitionLink as Link } from "@/components/nav/TransitionNav";
import { menuHref } from "@/lib/menu-href";
import { forgetDineinOnThisDevice } from "@/lib/useTableSession";
import { useForgetCart } from "@/components/ActiveOrderProvider";
import { useCart } from "@/components/TableCartProvider";

/**
 * Phase 1a — the dine-in eyebrow IS the table's control. "At the table ⌄" opens this sheet, which
 * holds the two exits the arrival card used to show as tiles above the food (W19/W20/M131's
 * promises, verbatim in meaning):
 *
 *  · Back to the start — a NAVIGATION to the door picker; the party's session and cart survive
 *    untouched (4h sliding TTL). `menuHref(null)` = the door picker.
 *  · Leave this table — forgets the table ON THIS PHONE only (the storage clear runs in the click,
 *    before the navigation); never a server "close table". It forgets the table's CART pointer too
 *    (blind pass on #300): otherwise the header kept offering "Your order" for the table just left.
 *
 * The same words the tiles carried, one tap further from the menu — where an exit belongs.
 */
export function TableOptions({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const forgetCart = useForgetCart();
  // Codex round 3: the table's NUMBER lives here now that the arrival card is gone — GuestList's
  // lock/settle banners return before its own "Table N", so without this the menu stopped saying
  // which table the phone is at while a tablemate checks out.
  const { tableNumber } = useCart();
  const shown = tableNumber != null ? `At table ${tableNumber}` : label;
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
        <span aria-hidden className="menu-context-caret">
          ⌄
        </span>
        <span className="sr-only"> — table options</span>
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={tableNumber != null ? `Table ${tableNumber}` : "Your table"}
      >
        <div className="table-options">
          <Link
            href={menuHref(null)}
            className={buttonClass({ variant: "secondary", size: "lg", block: true })}
            onClick={() => setOpen(false)}
          >
            <span className="table-options-label">
              Back to the start
              <span className="table-options-note">keeps your table</span>
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
            <span className="table-options-label">
              Leave this table
              <span className="table-options-note">
                this phone only — the table stays open for everyone else
              </span>
            </span>
          </Link>
        </div>
      </Sheet>
    </>
  );
}
