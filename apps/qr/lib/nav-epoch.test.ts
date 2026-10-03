import { describe, expect, it } from "vitest";
import { navEpoch } from "./nav-epoch";

/**
 * Codex round 2 on 3b (#312) — a drain's queued push must be dropped the instant a competing
 * navigation STARTS, not when its route commits: `TransitionLink` starts the transition router on the
 * click, and `usePathname()` moves only on the commit, so a route-based guard left a window in which
 * the push still fired. The epoch is bumped synchronously by every door of the navigation grammar;
 * a continuation compares the value it captured with the current one.
 */
describe("navEpoch", () => {
  it("is monotonic: every bump is a later epoch than the one before", () => {
    const a = navEpoch.current();
    const b = navEpoch.bump();
    expect(b).toBe(a + 1);
    expect(navEpoch.current()).toBe(b);
    navEpoch.bump();
    expect(navEpoch.current()).toBe(b + 1);
  });
  it("a continuation that captured the epoch sees it change when anything navigates", () => {
    const at = navEpoch.current();
    expect(navEpoch.current() === at).toBe(true);
    navEpoch.bump();
    expect(navEpoch.current() === at).toBe(false);
  });
});
