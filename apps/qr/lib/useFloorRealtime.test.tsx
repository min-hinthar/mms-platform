/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

/**
 * Phase 2a · tablet — the session channel's NAME must be unique per MOUNT, not per session.
 *
 * The browser client is a singleton and `RealtimeClient.channel(topic)` hands back the EXISTING
 * channel for a repeated topic; once that channel has subscribed, its `.on("postgres_changes")`
 * THROWS. The real `removeChannel` is ASYNC (it awaits the channel's unsubscribe before dropping it
 * from the client's list), so two ways reach a joined channel under the same name:
 *
 *   1. the same table page UNMOUNTS and REMOUNTS before the removal settles (a route bounce, Strict
 *      Mode's double effect) — the new mount's `.on` throws inside the effect's async IIFE: an
 *      unhandled rejection and a detail view with no realtime at all;
 *   2. two consumers of ONE session on one screen (the table page's `floor` and the order pad's
 *      `pad`) — the second collides with the first.
 *
 * The fake below is the real client's contract on exactly those points (verified in
 * `@supabase/realtime-js` `RealtimeClient.channel` / `removeChannel` / `RealtimeChannel.on`): a
 * repeated topic returns the live channel, `.on` after `subscribe` throws, and removal is DEFERRED
 * until the test flushes it.
 */
const topics: string[] = [];
const pendingRemovals: (() => void)[] = [];
class FakeChannel {
  joined = false;
  constructor(public topic: string) {}
  on() {
    if (this.joined)
      throw new Error(
        `cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`,
      );
    return this;
  }
  subscribe(cb?: (status: string) => void) {
    this.joined = true;
    cb?.("SUBSCRIBED");
    return this;
  }
}
const channels = new Map<string, FakeChannel>();
const supa = {
  auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "t" } } }) },
  realtime: { setAuth() {} },
  channel(topic: string) {
    topics.push(topic);
    let c = channels.get(topic);
    if (!c) {
      c = new FakeChannel(topic);
      channels.set(topic, c);
    }
    return c;
  },
  // Deferred, like the real one: the channel stays in the client's list until the test flushes.
  removeChannel(c: FakeChannel) {
    pendingRemovals.push(() => {
      if (channels.get(c.topic) === c) channels.delete(c.topic);
    });
  },
};
vi.mock("@mms/db", () => ({ browserClient: () => supa }));

const { useFloorRealtime } = await import("./useFloorRealtime");

function Consumer({ sessionId, topic }: { sessionId?: string; topic?: string }) {
  useFloorRealtime(true, () => {}, sessionId, null, topic);
  return null;
}

const rejections: unknown[] = [];
const onRejection = (e: unknown) => void rejections.push(e);
process.on("unhandledRejection", onRejection);

afterEach(() => {
  cleanup();
  topics.length = 0;
  channels.clear();
  pendingRemovals.length = 0;
  rejections.length = 0;
});

/** Let the effect's async IIFE (getSession → channel → subscribe) run to completion. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("useFloorRealtime — a session channel is unique per mount", () => {
  it("unmount then remount BEFORE the removal settles opens a fresh channel, no rejection", async () => {
    const first = render(<Consumer sessionId="s1" />);
    await waitFor(() => expect(topics).toHaveLength(1));
    first.unmount();
    // The removal is still pending — the old channel is joined and still listed.
    expect(pendingRemovals).toHaveLength(1);
    render(<Consumer sessionId="s1" />);
    await waitFor(() => expect(topics).toHaveLength(2));
    await settle();
    expect(rejections).toEqual([]);
    expect(new Set(topics).size).toBe(2);
    for (const t of topics) expect(t.startsWith("floor:s1:"), t).toBe(true);
    // The live mount's channel is the second name, and it subscribed.
    expect(channels.get(topics[1]!)?.joined).toBe(true);
  });

  it("two consumers of ONE session ('floor' and 'pad') open two distinct channels", async () => {
    render(
      <>
        <Consumer sessionId="s1" />
        <Consumer sessionId="s1" topic="pad" />
      </>,
    );
    await waitFor(() => expect(topics).toHaveLength(2));
    await settle();
    expect(rejections).toEqual([]);
    expect(new Set(topics).size).toBe(2);
    // The default topic keeps the table page's `floor:{id}` stem; the pad names its own.
    expect(topics.filter((t) => t.startsWith("floor:s1:"))).toHaveLength(1);
    expect(topics.filter((t) => t.startsWith("pad:s1:"))).toHaveLength(1);
    for (const t of topics) expect(channels.get(t)?.joined, t).toBe(true);
  });

  it("the whole-board topics are unchanged — no session, no suffix", async () => {
    render(
      <>
        <Consumer />
        <Consumer topic="expo" />
      </>,
    );
    await waitFor(() => expect(topics).toHaveLength(2));
    expect(topics.sort()).toEqual(["expo", "floor"]);
  });
});
