"use client";
import { useState } from "react";
import { Sheet, buttonClass } from "@mms/ui";
import { TransitionLink as Link } from "@/components/nav/TransitionNav";
import { menuHref } from "@/lib/menu-href";
import { forgetDineinOnThisDevice } from "@/lib/useTableSession";

/**
 * Phase 1a — the dine-in eyebrow IS the table's control. "At the table ⌄" opens this sheet, which
 * holds the two exits the arrival card used to show as tiles above the food (W19/W20/M131's
 * promises, verbatim in meaning):
 *
 *  · Back to the start — a NAVIGATION to the door picker; the party's session and cart survive
 *    untouched (4h sliding TTL). `menuHref(null)` = the door picker.
 *  · Leave this table — forgets the table ON THIS PHONE only (the storage clear runs in the click,
 *    before the navigation); never a server "close table".
 *
 * The same words the tiles carried, one tap further from the menu — where an exit belongs.
 */
export function TableOptions({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="eyebrow menu-context-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {label}
        <span aria-hidden className="menu-context-caret">
          ⌄
        </span>
        <span className="sr-only"> — table options</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Your table">
        <div className="table-options">
          <Link
            href={menuHref(null)}
            className={buttonClass({ variant: "secondary", size: "lg", block: true })}
            onClick={() => setOpen(false)}
          >
            <span className="table-options-label">
              Back to the start
              <span className="table-options-note">keeps your table — come back any time</span>
            </span>
          </Link>
          <Link
            href={menuHref(null)}
            className={buttonClass({ variant: "danger", size: "lg", block: true })}
            onClick={() => {
              forgetDineinOnThisDevice();
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
