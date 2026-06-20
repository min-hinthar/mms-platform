/**
 * The generalized line-mutation gate (M3·P3.3a) — the state×role signature the S-track will extend
 * (ORDER-MODEL: `canMutate(line_state, actor_role)`). ISOMORPHIC (no secrets, no I/O): the server
 * enforces it in the cart actions, and the client imports the SAME rule to disable controls it would
 * reject — so the UI never offers an action the server forbids.
 *
 * M3: every line is 'draft' (nothing fires to a kitchen yet). The HOST may mutate any line; a guest
 * only their OWN line (the cross-owner-delete guard — QA §D). The pay-window lock is checked
 * SEPARATELY (it freezes the cart for everyone); this is the ownership/role layer on top of it.
 *
 * S2 will add post-'draft' states (fired / in-progress / served) where editing a committed line
 * becomes staff-only — hence the `lineState` parameter now, so that change extends this, not refactors it.
 */
export type LineState = "draft";
export type ActorRole = "host" | "guest";

export function canMutateLine(
  lineState: LineState,
  actorRole: ActorRole,
  isOwner: boolean,
): boolean {
  if (lineState !== "draft") return actorRole === "host"; // post-fire = staff-only (S2 placeholder)
  return actorRole === "host" || isOwner;
}
