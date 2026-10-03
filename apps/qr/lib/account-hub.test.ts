import { describe, expect, it } from "vitest";
import { ACCOUNT_PANELS, accountPanel, accountPanelHref } from "./account-hub";

/**
 * Phase 3a (D4) — /account is a hub with three panels, addressed by `?tab=` (never a hash: the page's
 * loading boundary consumes one). The decision of WHICH panel opens is pure.
 */
describe("accountPanel", () => {
  it("opens on Orders by default — the record is what a returning diner comes for", () => {
    expect(accountPanel({})).toBe("orders");
    expect(accountPanel({ tab: undefined })).toBe("orders");
  });
  it("honours a named panel", () => {
    expect(accountPanel({ tab: "rewards" })).toBe("rewards");
    expect(accountPanel({ tab: "you" })).toBe("you");
    expect(accountPanel({ tab: "orders" })).toBe("orders");
  });
  it("a garbled tab is the default, never a thrown page", () => {
    expect(accountPanel({ tab: "settings" })).toBe("orders");
    expect(accountPanel({ tab: "" })).toBe("orders");
  });
  it("a lend-mode resume (?resume=) lands on You, where the sign-in door is", () => {
    expect(accountPanel({ resume: "min@example.com" })).toBe("you");
    // An explicit tab still wins — the diner said where they want to be.
    expect(accountPanel({ resume: "min@example.com", tab: "orders" })).toBe("orders");
  });
  it("the panel list is the three, in display order", () => {
    expect(ACCOUNT_PANELS.map((p) => p.key)).toEqual(["orders", "rewards", "you"]);
  });
  it("hrefs name the panel and nothing else", () => {
    expect(accountPanelHref("you")).toBe("/account?tab=you");
    expect(accountPanelHref("orders")).toBe("/account?tab=orders");
  });
});
