import { describe, expect, it } from "vitest";
import {
  activationFailsafe,
  controllerChange,
  payOwed,
  refreshTap,
  staffOwnsReload,
} from "./sw-activation";

/**
 * Phase 2i (P2bi) — a worker change reloads only the tab that asked for it, and never offline.
 */
describe("controllerChange", () => {
  it("the very first install is adopted, never reloaded — whatever else is true", () => {
    // MUTATION (p2i-shell/first-install-reloads): the first-install guard dropped — a brand-new
    // visitor is reloaded mid-browse the moment the worker claims the page; red.
    for (const requested of [false, true])
      for (const online of [false, true])
        expect(controllerChange({ hadController: false, requested, online, staff: false })).toBe(
          "adopt-first",
        );
  });

  it("another tab's activation is ignored — online or not", () => {
    // MUTATION (p2i-shell/other-tab-reloads): the `requested` guard dropped — a diner's Refresh in
    // one tab reloads the KDS in another, mid-service; red.
    expect(
      controllerChange({ hadController: true, requested: false, online: true, staff: false }),
    ).toBe("ignore");
    expect(
      controllerChange({ hadController: true, requested: false, online: false, staff: false }),
    ).toBe("ignore");
  });

  it("this tab asked: reload online, owe it offline", () => {
    // MUTATION (p2i-shell/offline-reloads): the offline arm dropped — the reload lands on the
    // offline page, which holds nothing; red.
    expect(
      controllerChange({ hadController: true, requested: true, online: true, staff: false }),
    ).toBe("reload");
    expect(
      controllerChange({ hadController: true, requested: true, online: false, staff: false }),
    ).toBe("owe");
  });
});

describe("activationFailsafe", () => {
  it("reloads online, owes it offline", () => {
    // MUTATION (p2i-shell/failsafe-offline): the failsafe reloads offline; red.
    expect(activationFailsafe({ online: true, staff: false })).toBe("reload");
    expect(activationFailsafe({ online: false, staff: false })).toBe("owe");
  });
});

describe("refreshTap", () => {
  it("a worker still waiting is ASKED (SKIP_WAITING); one already taking over is reloaded into", () => {
    // MUTATION (p2i-shell/tap-posts-to-active): the state is not read — another tab's Refresh
    // already activated the worker (this tab ignored that change), the message goes to an active
    // worker, no change follows, and the person waits out the 4s failsafe for nothing; red.
    expect(refreshTap({ workerState: "installed", online: true })).toBe("ask");
    expect(refreshTap({ workerState: null, online: true })).toBe("ask");
    expect(refreshTap({ workerState: "activating", online: true })).toBe("reload");
    expect(refreshTap({ workerState: "activated", online: true })).toBe("reload");
    expect(refreshTap({ workerState: "activated", online: false })).toBe("owe");
  });
});

/**
 * Codex r1 on #311 (P2ix) — the shell is in the ROOT layout, so a tab that asked for a reload on a
 * diner page and then soft-navigated into /staff still carries the ask, the owed reload and the
 * failsafe timer. Under /staff the staff watcher (`AppUpdateWatch` → `applyUpdate`) owns every
 * reload; the shell pays none of its own there.
 */
describe("under /staff the shell never reloads", () => {
  it("staffOwnsReload: /staff and anything under it — not a path that merely starts with the word", () => {
    // MUTATION (p2i-shell/staff-unrecognised): no path is the staff app's — every shell reload
    // below lands on a KDS mid-service; red.
    expect(staffOwnsReload("/staff")).toBe(true);
    expect(staffOwnsReload("/staff/kitchen")).toBe(true);
    expect(staffOwnsReload("/")).toBe(false);
    expect(staffOwnsReload("/t/abc/menu")).toBe(false);
    expect(staffOwnsReload("/staffing")).toBe(false);
  });
  it("a change this tab asked for is ignored there, online or not", () => {
    // MUTATION (p2i-shell/change-reloads-staff): the asked-for activation reloads the staff
    // screen the person navigated to, under every reload hold; red.
    for (const online of [true, false])
      expect(controllerChange({ hadController: true, requested: true, online, staff: true })).toBe(
        "ignore",
      );
    // The first install is still only adopted.
    expect(
      controllerChange({ hadController: false, requested: true, online: true, staff: true }),
    ).toBe("adopt-first");
  });
  it("the failsafe is dropped there, online or not", () => {
    // MUTATION (p2i-shell/failsafe-reloads-staff): 4s after a diner's Refresh, the staff screen it
    // navigated to is reloaded; red.
    expect(activationFailsafe({ online: true, staff: true })).toBe("ignore");
    expect(activationFailsafe({ online: false, staff: true })).toBe("ignore");
  });
  it("an owed reload is paid only off /staff", () => {
    // MUTATION (p2i-shell/owed-paid-on-staff): coming back online pays a diner page's owed reload
    // on the staff screen the tab is now showing; red.
    expect(payOwed({ owed: true, staff: false })).toBe(true);
    expect(payOwed({ owed: true, staff: true })).toBe(false);
    // MUTATION (p2i-shell/nothing-owed-paid): nothing owed, nothing paid; red.
    expect(payOwed({ owed: false, staff: false })).toBe(false);
  });
});
