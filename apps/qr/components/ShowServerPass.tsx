"use client";
import type { CartItem } from "@mms/db";
import { CounterPass, KitchenTrack, Sheet, type KitchenStage } from "@mms/ui";
import { t } from "@/lib/i18n";
import { STAFF } from "@/lib/i18n/staff";
import { t as kioskT } from "@/lib/kiosk/strings";
import { qtyStands } from "@/lib/kds-line";
import { DINER_STATE_COPY } from "@/lib/line-state-copy";
import { passIdentity } from "@/lib/pass-identity";
import type { ShowServerStatus } from "@/lib/show-server";

/** The pass's one status word per stage — every string shipped (the console's own pairs). */
const STATUS: Record<
  Exclude<ShowServerStatus, "none">,
  { stage: KitchenStage; word: { en: string; my: string } }
> = {
  // The hollow ring and the console's two words (`pad.group.unsent`).
  waiting: { stage: "unsent", word: STAFF["pad.group.unsent"] },
  // Inside the Send's grace: one dashed segment with "Sending…" (PATH_DESIGN round 3, the track).
  sending: { stage: "sending", word: { en: t("en", "sending"), my: t("my", "sending") } },
  // Past the grace — the instant Mom's KDS draws the ticket: the track's FIRST stamp.
  sent: {
    stage: "sent",
    word: { en: DINER_STATE_COPY.fired, my: STAFF["table.line.state.fired"].my },
  },
};

/**
 * PD1 (m1 screen 2) — "Show a server": the table's ticket, held up for Dad.
 *
 * A full-screen dialog on the Sheet primitive (Radix Dialog: focus trapped, Esc closes, the page
 * behind inert; `.mms-sheet-full` stretches it edge to edge). The guest holds the phone up, or carries
 * it to the counter; Dad reads it from arm's length and presses the console Send he already has.
 *
 * THE PASS IS POST-PAY'S `CounterPass`, RENDERED (round 3, ONE PASS): the identity figure printed
 * ONCE under "Table · စားပွဲ" at the `counter` tier (`--fs-pass`), the dotted seam and its notches
 * showing the page ground, constant paper in both themes. A table with no number yet (bound at Send,
 * §33) prints a NON-SECRET identity in the figure's place — the host's first name ("Aye’s table") or
 * "Your table" — and never the session's join code, which is its bearer secret (`lib/pass-identity`;
 * the change from reconciliation 6, 2026-10-09): Dad finds the table on the console by its open
 * cart, not by a code read off a phone held up in the room.
 * The status is the kitchen track in the pass's head: the hollow ring and "Not sent yet · မပို့ရသေး",
 * the dashed segment and "Sending…" inside the grace, and — THE ONE DELIGHT, honest (m1 B3 · D3) —
 * segment 1 FILLs with "Sent to kitchen · ပို့ပြီး" only once an applied server view shows the dishes
 * past their grace, so Dad sees his own Send land in the guest's hand and never a past tense the
 * host can still undo. The status is this dialog's ONE live region (`role="status"`: silent on open,
 * says each change once); Checkout's own region sits under the dialog's `aria-hidden`.
 *
 * The body is the ticket: the dishes in the catalog's own words, EN over MY at full ink (its reader
 * is Dad), each behind the kitchen's qty token (a ringed numeral for one, filled for a multiple —
 * `qtyStands`, the KDS grammar, in the pass's own inks). No prices, no total, no owner names, no
 * minutes, no headcount: there are no counts on a shared cart, and the token IS the dish ("2
 * Mohinga"). "Done" is the holder's way out, pinned in the thumb zone; the primitive's ✕ stays.
 */
export function ShowServerPass({
  open,
  onOpenChange,
  onCloseAutoFocus,
  tableNumber,
  hostName,
  dishes,
  status,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Where focus lands when the pass closes (the opener, or the page's <h1> once it is gone). */
  onCloseAutoFocus: (e: Event) => void;
  tableNumber: number | null;
  /** The host's display name, for a table with no number yet — never the join code. */
  hostName: string | null;
  /** `passDishes(view, listed)` — the rows the pass prints. */
  dishes: CartItem[];
  /** `showServerStatus(dishes, serverNow)`; "none" never reaches here (the pass closes itself). */
  status: Exclude<ShowServerStatus, "none">;
}) {
  const identity = passIdentity(tableNumber, hostName);
  const now = STATUS[status];
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      className="mms-sheet-full show-server"
      title={
        <span className="show-server-kicker">
          {t("en", "showServer")}
          <span lang="my" className="show-server-kicker-my">
            {t("my", "showServer")}
          </span>
        </span>
      }
    >
      <div className="show-server-body">
        <CounterPass
          tier="counter"
          {...identity}
          label={{ en: "Table", my: STAFF["floor.table"].my.replace(" {id}", "") }}
          lang="en"
          head={
            <span id="card-status" role="status" aria-atomic="true" className="show-server-status">
              <KitchenTrack
                stage={now.stage}
                size="glyph"
                word={now.word}
                // FILL plays once, when the stamp is SEEN landing: the pass opens on dishes that wait,
                // so a "sent" here was observed arriving (never a first read).
                filling={status === "sent"}
              />
            </span>
          }
          tear
        >
          <ul role="list" aria-labelledby="card-status" className="pass-dishes">
            {dishes.map((d) => (
              <li key={d.id} className="pass-dish">
                <span
                  className="pass-dish-qty"
                  data-many={qtyStands(d.qty) || undefined}
                  aria-hidden="true"
                >
                  {d.qty}
                </span>
                <span className="pass-dish-names">
                  <span className="pass-dish-name">
                    <span className="sr-only">{`${d.qty} `}</span>
                    {d.name}
                  </span>
                  {d.nameMy && (
                    <span lang="my" className="pass-dish-name-my">
                      {d.nameMy}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CounterPass>
      </div>
      <button type="button" className="show-server-done" onClick={() => onOpenChange(false)}>
        {kioskT("en", "done")}
        <span aria-hidden className="show-server-dot">
          ·
        </span>
        <span lang="my">{kioskT("my", "done")}</span>
      </button>
    </Sheet>
  );
}
