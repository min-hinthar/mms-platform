"use client";
import { Icon } from "@mms/ui";
import { Chrome } from "./Chrome";
import { TicketLineText } from "./TicketText";
import { useStaffLang } from "./StaffLangProvider";
import { ts } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";

/**
 * PD5 / m7 — "Table N left — stop cooking": the kitchen's half of a table clear, its SHAPE reserved
 * here (PATH_DESIGN reconciliation 1; m5 appendix A1/B1; m7 decision 20).
 *
 * A per-Send card whose table was cleared while it still cooked is drawn ONLY as this card: ALARM
 * tier WITHOUT motion — the strip takes the Late tint and never the pulse — struck dish rows, the
 * one warn word, and "Got it" (`help.done`, the shipped word) in the bump's slot, until the cook
 * taps it. It is never dashed (that means held), never cream (that is the undo pill), and it never
 * wears a round stub, so the board's four marks never overlap. Reduced motion changes nothing: it
 * has no motion to begin with.
 *
 * ⚠️ NOT WIRED. The kitchen read selects only `fired` / `in_progress` lines on `open` / `paid`
 * carts, so a cleared cart's lines vanish on the next poll before Mom sees anything; the durable
 * stop record the table-clear migration writes (PATH_DESIGN correction 12, PD7 · M182) is what
 * this card will read, and "Got it" will write its acknowledgement there. Until that migration
 * lands on the owner's go, this component renders from props and nothing mounts it — the slip's
 * "tells the kitchen to stop" stays unclaimed (m7 risk 4).
 */
export type KdsStopLine = {
  id: string;
  name: string;
  nameMy: string | null;
  qty: number;
  modifiers: string[];
  modifiersMy: (string | null)[];
};

export function KdsStopCard({
  table,
  lines,
  onAck,
  busy = false,
}: {
  /** The table number off the physical tent (Latin in both tongues). */
  table: number;
  /** The dishes that were still cooking when the table was cleared, each struck through. */
  lines: readonly KdsStopLine[];
  /** "Got it" — the acknowledgement that retires the card (PD7 writes it durably). */
  onAck: () => void;
  /** §17 — busy is the attribute and the handler's refusal, never native `disabled`. */
  busy?: boolean;
}) {
  const lang = useStaffLang();
  const vars = { id: table };
  const word = tf(lang, "kds.stop", vars);
  return (
    <li className="kds-ticket kds-ticket-stop card-textured" aria-label={word}>
      {/* Row A as every card draws it, on the warn tint with NO pulse class: the colour says alarm,
          the word says why, and nothing on this card moves (Late keeps the board's only motion). */}
      <header className="kds-strip kds-strip-stop">
        <span className="kds-id">
          <Chrome lang={lang} k="kds.table" vars={vars} />
        </span>
        <span className="kds-strip-side">
          <span className="kds-badge" lang={lang}>
            {ts(lang, "kds.channel.dinein")}
          </span>
        </span>
      </header>
      <p className="kds-stop-word">
        <Icon name="alert" size={20} aria-hidden />
        <Chrome lang={lang} k="kds.stop" vars={vars} echo="stack" />
      </p>
      <ul className="kds-lines" role="list" aria-label={tf(lang, "kds.a11y.lines", { x: word })}>
        {lines.map((l) => (
          <li key={l.id} className="kds-item">
            <div className="kds-item-row">
              {/* Struck, not a control: there is nothing left to tap on a dish nobody will eat. */}
              <span className="kds-stop-line">
                <span className="kds-qty" aria-hidden="true">
                  {l.qty}
                </span>
                <span className="kds-line-main">
                  <TicketLineText line={l} />
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="kds-bump kds-stop-ack staff-press"
        onClick={() => {
          if (!busy) onAck();
        }}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
      >
        <Chrome lang={lang} k="help.done" echo="stack" />
      </button>
    </li>
  );
}
