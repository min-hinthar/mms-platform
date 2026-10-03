/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PresenceMember } from "@/lib/realtime";
import type { WelcomeBack } from "@/lib/rewards";
import { formatSlotLong } from "@/lib/pickupTime";

/**
 * Phase 3b · D10 — one owner per fact. The menu's pickup greeting used to say "Pick a time — we'll
 * have it ready." beside a chip that opened a slot picker whose pick went NOWHERE: the provider
 * mounted the sheet and wrote the chosen slot into React state only, and the next server view
 * overwrote it. The When write has ONE owner — `PickupWhenChoice` on /cart, token-gated and drained
 * before create-intent — so the menu's line is a STATEMENT of what that owner recorded, and carries
 * no control. These tests pin the statement's two shapes and that it never grew a button back.
 *
 * ## The mock is ONE module, on purpose
 *
 * `vi.mock("@/components/TableCartProvider")` replaces the context hook with a mutable fixture, so
 * the real provider — and its `server-only` import chains — is never loaded. The component's other
 * imports are React, a type, and nothing else.
 */

type Ctx = {
  isGroup: boolean;
  members: PresenceMember[];
  pickupSlot: string | null;
};
const ctx = vi.hoisted(() => ({ current: {} as Ctx }));

vi.mock("@/components/TableCartProvider", () => ({ useCart: () => ctx.current }));

const { ArrivalBeat } = await import("./ArrivalBeat");

const solo: Ctx = { isGroup: false, members: [], pickupSlot: null };
const member = (seat: string): PresenceMember => ({ seat, name: `Guest ${seat}` });

/** A far-future instant so `dayLabel` never reads "Today"/"Tomorrow" by accident of the clock; the
 *  expected text is DERIVED from the one formatter, never transcribed (CLAUDE.md: never transcribe a
 *  number into an assertion). */
const SLOT = "2031-03-15T18:30:00.000Z";

const line = () => document.querySelector(".menu-greet-line")?.textContent ?? "";

beforeEach(() => {
  ctx.current = { ...solo };
});
afterEach(() => cleanup());

describe("D10 — the pickup greeting is a statement, not a control", () => {
  it("with no slot it invites the order and names the bag — never a pick", () => {
    ctx.current = { ...solo, pickupSlot: null };
    render(<ArrivalBeat mode="pickup" />);
    expect(line()).toBe("Order when you’re ready — we’ll pack it to go.");
    expect(screen.queryByText(/Pick/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with a slot (a diner back from checkout) it reads the ONE formatter and points at checkout", () => {
    ctx.current = { ...solo, pickupSlot: SLOT };
    render(<ArrivalBeat mode="pickup" />);
    expect(line()).toBe(`Scheduled for ${formatSlotLong(SLOT)} — change it at checkout.`);
    expect(screen.queryByText(/Pick/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("the scheduled statement wins the one sub-line over the welcome-back warmth, as the party line does", () => {
    // The file's own doctrine: warmth never displaces information. A slot the diner set at checkout
    // is information (and its "change it at checkout" pointer is the only way back to it from here).
    ctx.current = { ...solo, pickupSlot: SLOT };
    const welcome: WelcomeBack = { name: "Min", ordersThisMonth: 3 };
    render(<ArrivalBeat mode="pickup" welcome={welcome} />);
    expect(line()).toBe(`Scheduled for ${formatSlotLong(SLOT)} — change it at checkout.`);
    expect(screen.getByText(/Mingalaba, Min/)).toBeTruthy();
  });

  it("with no slot, the welcome-back line still takes the sub-line (unchanged J5 behaviour)", () => {
    ctx.current = { ...solo, pickupSlot: null };
    const welcome: WelcomeBack = { name: "Min", ordersThisMonth: 3 };
    render(<ArrivalBeat mode="pickup" welcome={welcome} />);
    expect(line()).toBe("Welcome back — 3 orders with us this month.");
  });
});

describe("the other doors are untouched", () => {
  it("dine-in alone", () => {
    ctx.current = { isGroup: true, members: [member("A")], pickupSlot: null };
    render(<ArrivalBeat mode="dinein" />);
    expect(line()).toBe("You’re at the table — order when you’re ready.");
  });

  it("dine-in party of three", () => {
    ctx.current = {
      isGroup: true,
      members: [member("A"), member("B"), member("C")],
      pickupSlot: null,
    };
    render(<ArrivalBeat mode="dinein" />);
    expect(line()).toBe("3 of you at the table — order together, pay together.");
  });

  it("scan & go, and a pickup slot left in context does not leak into another door", () => {
    ctx.current = { ...solo, pickupSlot: SLOT };
    render(<ArrivalBeat mode="scango" />);
    expect(line()).toBe("Welcome in — pay right from your phone.");
    expect(screen.queryByText(/Scheduled/)).toBeNull();
  });
});
