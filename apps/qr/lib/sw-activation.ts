/**
 * Phase 2i (P2bi) — what a tab does when its service worker changes (`controllerchange`), and when
 * the activation it asked for has not arrived in time. Pure; `ResilienceShell` wires it.
 *
 * Before 2i every controlled tab of the origin reloaded on ANY `controllerchange` once it had a
 * controller — a diner tapping Refresh in one tab reloaded a staff screen in another, mid-service,
 * with whatever it held. Now only the tab that ASKED for the activation (its own Refresh posted
 * SKIP_WAITING) reloads. Documents are network-only (`sw/sw.ts`), so a tab that did not ask keeps
 * working on the new worker; it simply is not reloaded under someone's hands.
 *
 * And never offline: a reload with no network lands on the service worker's offline page, which
 * holds nothing. A reload that is due while offline is OWED and paid when the device is back online.
 */
export type ControllerChangeAction =
  /** The very first install (`clientsClaim` takes a brand-new visitor): adopt it, never reload. */
  | "adopt-first"
  /** Another tab's activation: keep working. */
  | "ignore"
  /** This tab asked, and the device is online: reload into the new build. */
  | "reload"
  /** This tab asked, but the device is offline: reload once it is back. */
  | "owe";

export function controllerChange(i: {
  hadController: boolean;
  requested: boolean;
  online: boolean;
}): ControllerChangeAction {
  if (!i.hadController) return "adopt-first";
  if (!i.requested) return "ignore";
  if (!i.online) return "owe";
  return "reload";
}

/** The failsafe after this tab's SKIP_WAITING (activation stalled): reload — or owe it offline. */
export function activationFailsafe(i: { online: boolean }): "reload" | "owe" {
  if (!i.online) return "owe";
  return "reload";
}
