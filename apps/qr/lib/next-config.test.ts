import { describe, expect, it } from "vitest";

/**
 * next.config, EXECUTED — never read as text: a comment naming the option would satisfy a scan.
 *
 * `agentRules: false` (#323, Next 16.3). With it unset, `next dev` writes apps/qr/AGENTS.md and
 * apps/qr/CLAUDE.md whenever the shell carries an agent marker (CLAUDECODE / AI_AGENT) and those
 * files do not already hold Next's current rules block (`hasCurrentAgentRules`) — measured
 * 2026-10-12 on 16.3.8: "✓ Generated AGENTS.md and CLAUDE.md for AI agents." Two untracked files
 * make `pnpm review:bundle` refuse the tree, and a nested CLAUDE.md loads into every agent session.
 */
describe("next.config", () => {
  it("keeps next dev from writing agent rule files into apps/qr (agentRules: false)", async () => {
    // MUTATION: delete the agentRules line — red (undefined means on).
    const { default: config } = await import("../next.config");
    expect(config.agentRules).toBe(false);
  });
});
