"use client";
import { memo } from "react";
import { Badge, Icon } from "@mms/ui";
import { al } from "@/lib/staff-labels";
import type { TileAction, PadTileBlock } from "@/lib/order-pad";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * Phase 2c · pad — ONE dish tile (DESIGN-LANGUAGE §28). `React.memo` over PRIMITIVE props only, so
 * the 5s poll re-renders the tiles whose own numbers moved, never all ninety-seven.
 *
 * Two SIBLING buttons, never nested: the main tap (the whole tile) and, on an `add` tile only, the
 * options corner. The main tap ADDS one with no modifiers (`add`), opens the options sheet
 * (`choose` — a required choice), or refuses and says so (`soldOut`). Every visible run is in the
 * accessible name (WCAG 2.5.3): the verb the tile shows or implies, then the dish as drawn, its
 * price and the confirmed count.
 *
 * The confirmed `×N` badge is the SERVER's (§21: a count is a claim only from a view that saw the
 * cart); the dim `+N` is what is still on its way. The `+` disc pops on the tap (`popKey`), and a
 * definite refusal sets the glyph back down (`settleKey`, `.mms-settle` — on the glyph, never the
 * button, and never for an unknown outcome, §23). Both are keyed remounts; both RM-escorted.
 */
export type PadTileProps = {
  id: string;
  lang: StaffLang;
  lead: string;
  leadLang: StaffLang;
  echo: string | null;
  echoLang: StaffLang | null;
  /** Preformatted catalog price — display only; the server prices every add. */
  price: string;
  action: TileAction;
  /** Confirmed units on the order (the committed read). */
  confirmed: number;
  /** Units still on their way. */
  pending: number;
  /** Why a tap is refused right now (a guest paying, an unconfirmed add, a closed order). */
  block: PadTileBlock | null;
  popKey: number;
  settleKey: number;
  onMain: (id: string) => void;
  onOpts: (id: string) => void;
};

function PadTileImpl(p: PadTileProps) {
  const subject = [p.lead, p.echo, p.price, p.confirmed > 0 ? `×${p.confirmed}` : null]
    .filter((x): x is string => x !== null)
    .join(", ");
  // Three whole al() calls (the verb key a literal on each branch), matching the three marks.
  const soldOut = p.action === "soldOut";
  const choose = p.action === "choose";
  const name = soldOut
    ? al(p.lang, { kind: "subject", verb: "browse.add.verb.soldOut", subject }).aria
    : choose
      ? al(p.lang, { kind: "subject", verb: "browse.verb.choose", subject }).aria
      : al(p.lang, { kind: "subject", verb: "browse.add.verb.add", subject }).aria;
  const refused = soldOut || p.block !== null;
  return (
    <li className="pad-tile" data-soldout={p.action === "soldOut" || undefined}>
      <button
        type="button"
        className="pad-tile-main staff-press"
        data-action={p.action}
        aria-label={name}
        aria-disabled={refused || undefined}
        onClick={() => p.onMain(p.id)}
      >
        <span className="pad-tile-name" lang={p.leadLang}>
          {p.lead}
        </span>
        {p.echo !== null && (
          <span className="pad-tile-echo" lang={p.echoLang ?? undefined}>
            {p.echo}
          </span>
        )}
        <span className="pad-tile-foot">
          <span className="pad-tile-price">{p.price}</span>
          {p.confirmed > 0 && <Badge tone="accent">×{p.confirmed}</Badge>}
          {p.pending > 0 && <span className="pad-tile-pending">+{p.pending}</span>}
          {p.action === "add" ? (
            <span
              key={`pop-${p.popKey}`}
              className={p.popKey > 0 ? "pad-tile-plus mms-pop" : "pad-tile-plus"}
              aria-hidden="true"
            >
              <span
                key={`settle-${p.settleKey}`}
                className={p.settleKey > 0 ? "pad-tile-glyph mms-settle" : "pad-tile-glyph"}
              >
                +
              </span>
            </span>
          ) : p.action === "choose" ? (
            <span className="pad-tile-choose">
              <Chrome lang={p.lang} k="browse.verb.choose" />
            </span>
          ) : (
            <span className="pad-tile-soldout">
              <Chrome lang={p.lang} k="browse.add.verb.soldOut" />
            </span>
          )}
        </span>
      </button>
      {p.action === "add" && (
        <button
          type="button"
          className="pad-tile-opts"
          aria-disabled={p.block !== null || undefined}
          onClick={() => p.onOpts(p.id)}
        >
          <Icon name="sliders" size={20} />
          <span className="sr-only">
            <Chrome lang={p.lang} k="pad.a11y.options" vars={{ x: p.lead }} />
          </span>
        </button>
      )}
    </li>
  );
}

export const PadTile = memo(PadTileImpl);
