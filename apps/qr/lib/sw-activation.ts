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
 *
 * ⚠️ And never under /staff (Codex r1 on #311, P2ix). The shell lives in the ROOT layout, so a tab
 * that asked on a diner page and then soft-navigated into /staff still carries the ask, any owed
 * reload and the failsafe timer — and a reload paid there skipped every reload hold the staff app
 * keeps (a pick, the Undo bar, a cash hand-back only memory holds). Under /staff the staff watcher
 * (`AppUpdateWatch` → `applyUpdate`) owns every reload; the shell pays none of its own. Each rule
 * below takes `staff` = `staffOwnsReload(location.pathname)`, read at the moment it decides.
 */

/** The staff app's pages: /staff and anything under it. */
export function staffOwnsReload(pathname: string): boolean {
  return pathname === "/staff" || pathname.startsWith("/staff/");
}
export type ControllerChangeAction =
  /** The very first install (`clientsClaim` takes a brand-new visitor): adopt it, never reload. */
  | "adopt-first"
  /** Another tab's activation — or this tab's, now under /staff: keep working. */
  | "ignore"
  /** This tab asked, and the device is online: reload into the new build. */
  | "reload"
  /** This tab asked, but the device is offline: reload once it is back. */
  | "owe";

export function controllerChange(i: {
  hadController: boolean;
  requested: boolean;
  online: boolean;
  staff: boolean;
}): ControllerChangeAction {
  if (!i.hadController) return "adopt-first";
  if (!i.requested) return "ignore";
  if (i.staff) return "ignore";
  if (!i.online) return "owe";
  return "reload";
}

/** The failsafe after this tab's SKIP_WAITING (activation stalled): reload — or owe it offline;
 *  dropped under /staff (the staff watcher's). */
export function activationFailsafe(i: {
  online: boolean;
  staff: boolean;
}): "reload" | "owe" | "ignore" {
  if (i.staff) return "ignore";
  if (!i.online) return "owe";
  return "reload";
}

/** Back online: pay the owed reload — never under /staff, where it stays owed (unpaid) and the
 *  staff watcher decides. */
export function payOwed(i: { owed: boolean; staff: boolean }): boolean {
  if (!i.owed) return false;
  if (i.staff) return false;
  return true;
}

/**
 * The strip's Refresh. The worker it offers may already be TAKING OVER: another tab's Refresh
 * activated it, and this tab — which did not ask — ignored that `controllerchange`. A SKIP_WAITING
 * to an active worker does nothing and no further `controllerchange` comes, so the person would
 * wait out the failsafe for nothing: reload now (owe it offline). A worker still waiting is asked.
 */
export function refreshTap(i: {
  workerState: ServiceWorkerState | null;
  online: boolean;
}): "ask" | "reload" | "owe" {
  if (i.workerState !== "activating" && i.workerState !== "activated") return "ask";
  if (!i.online) return "owe";
  return "reload";
}
