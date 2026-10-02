import { describe, expect, it } from "vitest";
import { activationFailsafe, controllerChange } from "./sw-activation";

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
