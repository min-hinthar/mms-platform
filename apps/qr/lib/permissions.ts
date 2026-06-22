/**
 * The generalized line-mutation gate (M3·P3.3a → S2.1a). The state×role rule (ORDER-MODEL:
 * `canMutate(line_state, actor)`). ISOMORPHIC (no secrets, no I/O): the server enforces it in the cart
 * actions, and the client imports the SAME rule to disable controls it would reject — so the UI never
 * offers an action the server forbids.
 *
 * S2.1a makes STAFF a first-class actor and adds the post-'draft' states. The rule:
 *   • a DINER may mutate only an OWN, still-'draft' line (host may mutate any draft line; a guest only
 *     their own — the cross-owner guard). Once a line is fired/in-progress/served, a diner CANNOT edit it
 *     ("Ask server" — S2.2); this fixes the M3 placeholder that wrongly let a diner "host" edit fired food.
 *   • STAFF own every non-terminal line (draft through served) — they edit FOR a guest post-fire. A
 *     'voided' line is terminal: nobody mutates it.
 *
 * The pay-window lock / settle freeze are checked SEPARATELY (they freeze the whole cart); this is the
 * ownership/role × line-state layer on top of them.
 */
import type { LineState } from "@mms/db";

export type { LineState };

export type LineActor =
  | { kind: "staff" }
  | { kind: "diner"; role: "host" | "guest"; isOwner: boolean };

export function canMutateLine(lineState: LineState, actor: LineActor): boolean {
  if (actor.kind === "staff") return lineState !== "voided"; // staff edit any non-terminal line
  if (lineState !== "draft") return false; // post-fire = staff-only ("Ask server", S2.2)
  return actor.role === "host" || actor.isOwner; // diner: host-any / guest-own, draft only
}
