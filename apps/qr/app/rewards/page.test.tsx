/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";

/**
 * Codex round 3 on #312 (P2) — `/rewards` is the legacy address of the Stars hub (M4 P4.1 folded it
 * into /account). Phase 3a made /account open on ORDERS by default, so a bare `/account` redirect
 * sent every old bookmark and external link to the order history. The redirect names its panel.
 */
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

const { default: Rewards } = await import("./page");

describe("/rewards", () => {
  it("lands on the Rewards panel of the hub, never the hub's default", () => {
    Rewards();
    expect(redirect).toHaveBeenCalledWith("/account?tab=rewards");
  });
});
