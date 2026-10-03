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
  it("the OAuth bounce lands on You, where the save card's recovery copy and button are", () => {
    // Supabase returns to the Google button's redirectTo with ?error_code=… (or ?error=…); the
    // recovery renders inside AccountUpgrade, which is on You (blind pass on #312, critical 3).
    expect(accountPanel({ error_code: "identity_already_exists" })).toBe("you");
    expect(accountPanel({ error: "access_denied" })).toBe("you");
    expect(accountPanel({ error_code: "x", tab: "rewards" })).toBe("rewards");
  });
  it("the OAuth RETURN (?code=, the PKCE exchange) lands on You too — the redirectTo stays bare", () => {
    // Codex round 3 on #312 (P1): Supabase glob-matches `redirectTo` against the Redirect URL
    // allow list, so `/account?tab=you` MISSES an exact `/account` entry and falls back to the Site
    // URL. The Google doors therefore send the bare `/account`, and the panel is chosen here from
    // the `?code=` Supabase appends on the way back — the same way its error bounce is.
    expect(accountPanel({ code: "pkce-abc" })).toBe("you");
    expect(accountPanel({ code: "pkce-abc", tab: "orders" })).toBe("orders");
  });
  it("the panel list is the three, in display order", () => {
    expect(ACCOUNT_PANELS.map((p) => p.key)).toEqual(["orders", "rewards", "you"]);
  });
  it("hrefs name the panel and nothing else", () => {
    expect(accountPanelHref("you")).toBe("/account?tab=you");
    expect(accountPanelHref("orders")).toBe("/account?tab=orders");
  });
});
