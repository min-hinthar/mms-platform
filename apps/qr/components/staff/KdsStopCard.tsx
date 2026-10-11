"use client";
import { useId } from "react";
import { Icon } from "@mms/ui";
import { Chrome } from "./Chrome";
import { TicketLineText } from "./TicketText";
import { useStaffLang } from "./StaffLangProvider";
import { ts } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import type { KitchenStopLine } from "@/lib/kitchen-types";

/**
 * PD5 / m7 — "Table N left — stop cooking": the kitchen's half of a table clear (PATH_DESIGN
 * reconciliation 1; m5 appendix A1/B1; m7 decision 20).
 *
 * A per-Send card whose table was cleared while it still cooked is drawn ONLY as this card: ALARM
 * tier WITHOUT motion — the strip takes the Late tint and never the pulse — struck dish rows, the
 * one warn word, and "Got it" (`help.done`, the shipped word) in the bump's slot, until the cook
 * taps it. It is never dashed (that means held), never cream (that is the undo pill), and it never
 * wears a round stub, so the board's four marks never overlap. Reduced motion changes nothing: it
 * has no motion to begin with.
 *
 * M270 (1) — WIRED. `KdsBoard` draws one per Send of every open stop record (`qr_table_clears`, the
 * durable record `mms_clear_table` writes — PATH_DESIGN correction 12; read by
 * `lib/kitchen-stop-read.ts`), in the slot its ticket stood in, and "Got it" writes the
 * acknowledgement through `mms_ack_table_clear_stop`. The step guide's fifth picture renders it too,
 * inert.
 */
export type KdsStopLine = KitchenStopLine;

export function KdsStopCard({
  table,
  lines,
  onAck,
  busy = false,
  held = false,
}: {
  /** The table number off the physical tent (Latin in both tongues), or the sticker id when the
   *  table has no number — the live ticket's own fallback identity. */
  table: number | string;
  /** The dishes that were still cooking when the table was cleared, each struck through. */
  lines: readonly KdsStopLine[];
  /** "Got it" — the acknowledgement that retires the card (`mms_ack_table_clear_stop`). */
  onAck: () => void;
  /** §17 — busy is the attribute and the handler's refusal, never native `disabled`. */
  busy?: boolean;
  /** Phase 2h (critic B1) — this card's last "Got it" is still out past the bound: the attribute
   *  says so, and the tap still reaches `onAck`, whose refusal says the waiting line again. */
  held?: boolean;
}) {
  const lang = useStaffLang();
  const vars = { id: table };
  const word = tf(lang, "kds.stop", vars);
  // The warn line describes "Got it" (QA §A): two stop cards on one board are two "Got it" buttons,
  // and the description says which table each one acknowledges, while the name stays the visible
  // label (WCAG 2.5.3).
  const wordId = useId();
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
      <p className="kds-stop-word" id={wordId}>
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
        aria-disabled={busy || held || undefined}
        aria-busy={busy || undefined}
        aria-describedby={wordId}
      >
        <Chrome lang={lang} k="help.done" echo="stack" />
      </button>
    </li>
  );
}
