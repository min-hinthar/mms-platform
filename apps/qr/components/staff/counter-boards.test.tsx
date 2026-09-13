/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A4·2 (blind pass, CRITICAL 1) — the counter screen mounts TWO live boards, and the browser client
 * is a SINGLETON: `RealtimeClient.channel(topic)` returns the existing channel for a repeated topic,
 * and its `.on("postgres_changes")` THROWS once that channel has been subscribed. So the two boards
 * must open two channels. The fake below is the real client's contract on exactly those two points
 * (verified in `@supabase/realtime-js` `RealtimeClient.channel` / `RealtimeChannel.on`), so the
 * shape that shipped first — both boards on "floor" — reproduces here as an unhandled rejection
 * from the second board's effect, and the fix reads as two topics, both subscribed.
 */
const NOW = "2026-09-13T18:00:00.000Z";
const topics: string[] = [];
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
  removeChannel(c: FakeChannel) {
    channels.delete(c.topic);
  },
};
vi.mock("@mms/db", () => ({ browserClient: () => supa }));
vi.mock("@/lib/floor", () => ({
  getFloorView: () =>
    Promise.resolve({
      ok: true,
      snapshot: { tables: [], counter: [], counterTruncated: false, serverNow: NOW },
    }),
}));
vi.mock("@/lib/expo", () => ({
  getExpoQueue: () => Promise.resolve({ ok: true, queue: { tickets: [], serverNow: NOW } }),
  setTogoStatus: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { FloorBoard } = await import("./FloorBoard");
const { ExpoBoard } = await import("./ExpoBoard");

afterEach(cleanup);

describe("the counter screen's two live boards on one singleton client", () => {
  it("open TWO channels, both subscribed — never the floor's channel twice", async () => {
    render(
      <StaffLangProvider lang="en">
        <FloorBoard
          initial={{ tables: [], counter: [], counterTruncated: false, serverNow: NOW }}
        />
        <ExpoBoard initial={{ tickets: [], serverNow: NOW }} />
      </StaffLangProvider>,
    );
    await waitFor(() => expect(topics.length).toBe(2));
    expect(new Set(topics).size).toBe(2);
    expect(topics).toContain("floor");
    for (const t of topics) expect(channels.get(t)?.joined, t).toBe(true);
  });
});
