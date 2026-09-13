/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
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
// Each board's poll answers from a mutable slot so a test can freeze one lane, or both.
const OUTAGE = { ok: false as const, reason: "outage" as const };
let floorAnswer: unknown = {
  ok: true,
  snapshot: { tables: [], counter: [], counterTruncated: false, serverNow: NOW },
};
let expoAnswer: unknown = { ok: true, queue: { tickets: [], serverNow: NOW } };
vi.mock("@/lib/floor", () => ({ getFloorView: () => Promise.resolve(floorAnswer) }));
vi.mock("@/lib/expo", () => ({
  getExpoQueue: () => Promise.resolve(expoAnswer),
  setTogoStatus: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { LiveConnectionProvider } = await import("./LiveConnection");
const { FloorBoard } = await import("./FloorBoard");
const { ExpoBoard } = await import("./ExpoBoard");
const { ts } = await import("@/lib/i18n/staff");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  floorAnswer = {
    ok: true,
    snapshot: { tables: [], counter: [], counterTruncated: false, serverNow: NOW },
  };
  expoAnswer = { ok: true, queue: { tickets: [], serverNow: NOW } };
});

const bag = (id: string) => ({
  orderId: id,
  label: "Order",
  tableNumber: null,
  mode: "pickup" as const,
  customerName: "Nilar",
  customerPhone: null,
  shortCode: id.slice(-6).toUpperCase(),
  status: "preparing" as const,
  kitchen: "cooking" as const,
  pickupSlot: null,
  arrivedAt: null,
  lines: [
    {
      id: `l-${id}`,
      name: "Mohinga",
      nameMy: null,
      qty: 1,
      modifiers: [],
      modifiersMy: [],
      fulfillment: "togo" as const,
      notes: null,
    },
  ],
  createdAt: NOW,
});
const laneStatus = () =>
  document.getElementById("expo-h")?.closest("section")?.querySelector('[role="status"]');
const floorStatus = () =>
  document.getElementById("floor-h")?.closest("section")?.querySelector('[role="status"]');

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

describe("the lane's announcements — heard, never twice (Codex round 1 on A4·2)", () => {
  /**
   * The blind pass measured three regions flipping to the same frozen sentence in one second, and
   * the first cut answered by making the lane's counts and freeze plain text — which left a
   * screen-reader user with no word for a bag arriving, a bag leaving, or a lane that froze while
   * the floor stayed live. The lane's ONE region now carries its state, visually hidden, DEDUPED:
   * the counts as they change, and the freeze only while the floor is live — when the floor is
   * frozen too, its region is the screen's one voice for that and the lane's falls silent.
   */
  const mount = (tickets: ReturnType<typeof bag>[]) =>
    render(
      <StaffLangProvider lang="en">
        <LiveConnectionProvider>
          <FloorBoard
            initial={{ tables: [], counter: [], counterTruncated: false, serverNow: NOW }}
          />
          <ExpoBoard initial={{ tickets, serverNow: NOW }} />
        </LiveConnectionProvider>
      </StaffLangProvider>,
    );
  const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("says how many bags are waiting, and says so again when the count changes", async () => {
    vi.useFakeTimers();
    mount([bag("11111111-1111-4111-8111-111111111111")]);
    await tick(1);
    expect(laneStatus()?.textContent).toContain(ts("en", "expo.count.one").replace("{n}", "1"));
    expoAnswer = {
      ok: true,
      queue: {
        tickets: [
          bag("11111111-1111-4111-8111-111111111111"),
          bag("22222222-2222-4222-8222-222222222222"),
        ],
        serverNow: NOW,
      },
    };
    await tick(5_000);
    expect(laneStatus()?.textContent).toContain(ts("en", "expo.count.many").replace("{n}", "2"));
  });

  it("announces an expo-only freeze while the floor is live, and falls silent once the floor freezes too", async () => {
    vi.useFakeTimers();
    mount([]);
    await tick(1);
    expoAnswer = OUTAGE;
    await tick(5_000);
    // The lane froze, the floor did not: the lane's region carries the freeze.
    expect(laneStatus()?.textContent).toContain(ts("en", "out.head.cant"));
    expect(floorStatus()?.textContent ?? "").not.toContain(ts("en", "out.head.cant"));
    floorAnswer = OUTAGE;
    await tick(5_000);
    // Both frozen: the floor's region is the screen's one voice; the lane's says nothing.
    expect(floorStatus()?.textContent).toContain(ts("en", "out.head.cant"));
    expect(laneStatus()?.textContent ?? "").toBe("");
  });
});
