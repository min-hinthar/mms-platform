/**
 * The lifecycle audit (2026-10-13, OPEN-ITEMS K18) — a STAFF member moves a dish between For here and
 * To go: "box this one to take home" from a guest without a phone, before the Send. Until now the
 * only re-route was the diner's own ⋯ (`setLineFulfillment`, member-gated), so a server could not
 * honour the ask at all, and the dish fired with the dine-in batch and was taxed on the dine-in basis.
 *
 * The write is the diner's own RPC, `mms_set_line_fulfillment`, through the service role
 * (`staffSetLineFulfillment`, lib/staff-cart.ts): it re-derives every guard in SQL (open cart, a DRAFT
 * line, never grocery, For here only on a dine-in session) and re-taxes the line. These two rules
 * decide what the staff surface OFFERS and what each answer SAYS. Pure — no I/O.
 */

/** Does a staff editor offer For here / To go on this line? A DRAFT food line at a DINE-IN table
 *  (a counter or pickup order is all to-go; grocery routing is fixed; a sent dish is the kitchen's). */
export function staffCanReroute(
  mode: string,
  line: { state: string; fulfillment: string },
): boolean {
  return (
    mode === "dinein" &&
    line.state === "draft" &&
    (line.fulfillment === "dinein" || line.fulfillment === "togo")
  );
}

/** A re-route the kitchen already has. */
export const REROUTE_SENT =
  "That dish already went to the kitchen — it stays as it was sent. Remove it or make it free instead.";

/**
 * `mms_set_line_fulfillment`'s answer → the action's result. Only `ok` is a success: an unknown word —
 * a null included — is a refusal, never a guessed landing.
 */
export function staffRerouteOutcome(answer: unknown): { ok: true } | { ok: false; error: string } {
  switch (answer) {
    case "ok":
      return { ok: true };
    case "not_draft":
      return { ok: false, error: REROUTE_SENT };
    case "not_open":
      return { ok: false, error: "This table’s order is no longer open." };
    case "not_found":
      return { ok: false, error: "That item isn’t on this table." };
    case "is_grocery":
      return { ok: false, error: "A scanned item can’t change where it goes." };
    case "not_dinein_session":
      return { ok: false, error: "Only a dine-in table’s dishes can be eaten here." };
    default:
      return { ok: false, error: "Couldn’t change that dish — try again." };
  }
}
