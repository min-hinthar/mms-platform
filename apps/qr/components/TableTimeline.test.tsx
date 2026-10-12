/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CartItem } from "@mms/db";

/**
 * PD10 (Codex round 1 on #346, N2) — the kitchen strip's counts and headline speak the ONE KITCHEN
 * TRACK's stages, and SENDING is not SENT: a line inside its Send's undo grace (Undo can still pull
 * it back) is never counted "sent to kitchen", and a strip whose food is all still sending never
 * says the kitchen has it.
 *
 * `TimelineStrip` is pure props; the module's other export reads the provider, which reaches the
 * cart's Server Actions — mocked out, as is the journey link.
 */
vi.mock("./TableCartProvider", () => ({ useCart: () => ({}) }));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

const { TimelineStrip } = await import("./TableTimeline");

const NOW = "2026-10-08T10:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const line = (over: Partial<CartItem>): CartItem => ({
  id: "l-1",
  menuItemId: "m-1",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "fired",
  fireAt: at(-60_000),
  bumpedAt: null,
  fulfillment: "dinein",
  ...over,
});
/** Inside the Send's undo grace on the view's clock: the track reads "Sending…". */
const SENDING = line({ id: "l-send", name: "Ohn No Khao Swè", fireAt: at(4_000) });
/** Past its grace: "Sent to kitchen". */
const SENT = line({ id: "l-sent", name: "Mohinga", fireAt: at(-60_000) });
/** Served past Mom's undo window. */
const SERVED = line({
  id: "l-served",
  name: "Burmese Milk Tea",
  lineState: "served",
  fireAt: at(-600_000),
  bumpedAt: at(-300_000),
});

const headline = () => screen.getByRole("button", { expanded: false }).textContent ?? "";
const counts = () => document.querySelector(".table-timeline-counts")?.textContent ?? "";

afterEach(() => cleanup());

describe("TimelineStrip — sending is not sent (Codex round 1 on #346, N2)", () => {
  it("food still in its undo grace is counted 'sending', and the headline never says the kitchen has it", () => {
    // MUTATION (table-timeline/sending-counted-as-sent): `sent` folds the sending lines back in —
    // "1 sent to kitchen" and "Your order’s with the kitchen" over a dish Undo can still take back;
    // red.
    render(<TimelineStrip items={[SENDING]} nowIso={NOW} />);
    expect(counts()).toBe("1 sending");
    expect(counts()).not.toContain("sent to kitchen");
    expect(headline()).toContain("Sending…");
    expect(headline()).not.toContain("with the kitchen");
  });

  it("a sent dish and a sending one: each counted in its own word; the kitchen has the sent one", () => {
    render(<TimelineStrip items={[SENT, SENDING]} nowIso={NOW} />);
    expect(counts()).toBe("1 sending · 1 sent to kitchen");
    expect(headline()).toContain("Your order’s with the kitchen");
  });

  it("served plus a dish still sending is NOT all served — no dessert invitation yet", () => {
    render(<TimelineStrip items={[SERVED, SENDING]} nowIso={NOW} />);
    expect(counts()).toBe("1 sending · 1 served");
    expect(headline()).not.toContain("All served");
    expect(document.body.textContent).not.toContain("Room for dessert or tea?");
  });

  it("everything served (past Mom's window) is all served — the invitation follows", () => {
    render(<TimelineStrip items={[SERVED]} nowIso={NOW} />);
    expect(counts()).toBe("1 served");
    expect(headline()).toContain("All served");
    expect(document.body.textContent).toContain("Room for dessert or tea?");
  });
});
