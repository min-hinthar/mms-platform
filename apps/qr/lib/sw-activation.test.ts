import { describe, expect, it } from "vitest";
import { activationFailsafe, controllerChange, refreshTap } from "./sw-activation";

/**
 * Phase 2i (P2bi) — a worker change reloads only the tab that asked for it, and never offline.
 */
describe("controllerChange", () => {
  it("the very first install is adopted, never reloaded — whatever else is true", () => {
    // MUTATION (p2i-shell/first-install-reloads): the first-install guard dropped — a brand-new
    // visitor is reloaded mid-browse the moment the worker claims the page; red.
    for (const requested of [false, true])
      for (const online of [false, true])
        expect(controllerChange({ hadController: false, requested, online })).toBe("adopt-first");
  });

  it("another tab's activation is ignored — online or not", () => {
    // MUTATION (p2i-shell/other-tab-reloads): the `requested` guard dropped — a diner's Refresh in
    // one tab reloads the KDS in another, mid-service; red.
    expect(controllerChange({ hadController: true, requested: false, online: true })).toBe(
      "ignore",
    );
    expect(controllerChange({ hadController: true, requested: false, online: false })).toBe(
      "ignore",
    );
  });

  it("this tab asked: reload online, owe it offline", () => {
    // MUTATION (p2i-shell/offline-reloads): the offline arm dropped — the reload lands on the
    // offline page, which holds nothing; red.
    expect(controllerChange({ hadController: true, requested: true, online: true })).toBe("reload");
    expect(controllerChange({ hadController: true, requested: true, online: false })).toBe("owe");
  });
});

describe("activationFailsafe", () => {
  it("reloads online, owes it offline", () => {
    // MUTATION (p2i-shell/failsafe-offline): the failsafe reloads offline; red.
    expect(activationFailsafe({ online: true })).toBe("reload");
    expect(activationFailsafe({ online: false })).toBe("owe");
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
