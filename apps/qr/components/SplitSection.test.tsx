/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CartItem } from "@mms/db";
import type { SplitContext } from "@/lib/split";

/**
 * T9 — the live split door ("Split & pay separately") is a cart mutation the freeze already refuses
 * server-side (`openSettlement` refuses on the settlement acquire), so under the freeze the door must
 * not present itself as live and must not send the tap: `aria-disabled` (never native `disabled`,
 * which drops focus to <body>, WCAG 2.4.3), and `beginSettle` refuses BEFORE the call and SAYS the
 * section's freeze sentence through the parent's one live region. Before this, a frozen tap reached
 * the server and came back as a redacted Server Action error.
 *
 * The door renders only while `SURFACES.selfServeSplit` is open, so the surface is opened here; the
 * parked branch (the default) never draws it.
 */
const h = vi.hoisted(() => ({ openSettlement: vi.fn(), assignLine: vi.fn() }));
vi.mock("@/lib/surfaces", () => ({ surfaceOpen: () => true }));
vi.mock("@/lib/split", () => ({ openSettlement: h.openSettlement }));
vi.mock("@/lib/cart", () => ({ assignLine: h.assignLine }));

const { SplitSection } = await import("./SplitSection");

const CTX: SplitContext = {
  mode: "dinein",
  mySeat: "seat-a",
  myRole: "host",
  members: [
    { seat: "seat-a", name: "Aye", role: "host" },
    { seat: "seat-b", name: "Min", role: "guest" },
  ],
  tableNumber: 4,
  qrCode: "t-4",
};
const ITEMS: CartItem[] = [
  {
    id: "line-1",
    menuItemId: "item-1",
    name: "Mohinga",
    qty: 1,
    modifiers: [],
    unitPriceCents: 1450,
    taxCents: 133,
    bySeat: "seat-a",
    lineState: "draft",
    fulfillment: "dinein",
  },
];

function mount(frozen: boolean) {
  const onStatus = vi.fn();
  const onChanged = vi.fn();
  render(
    <SplitSection
      cartId="cart-1"
      items={ITEMS}
      totalCents={1583}
      ctx={CTX}
      onChanged={onChanged}
      onStatus={onStatus}
      payHere={false}
      frozen={frozen}
    />,
  );
  return {
    onStatus,
    onChanged,
    door: screen.getByRole("button", { name: "Split & pay separately" }),
  };
}

afterEach(() => {
  cleanup();
  h.openSettlement.mockReset();
  h.assignLine.mockReset();
});

describe("SplitSection — the split door under the freeze (T9)", () => {
  it("frozen: the door is aria-disabled, never natively disabled — it keeps focus", () => {
    const { door } = mount(true);
    expect(door.getAttribute("aria-disabled")).toBe("true");
    expect((door as HTMLButtonElement).disabled).toBe(false);
  });

  it("frozen: a tap never reaches the server and says the freeze sentence, once", async () => {
    const { door, onStatus, onChanged } = mount(true);
    await act(async () => {
      fireEvent.click(door);
    });
    expect(h.openSettlement).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(
      "You can’t change who pays for what while someone is paying.",
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("not frozen: the door is live and the tap opens the settlement", async () => {
    h.openSettlement.mockResolvedValue(undefined);
    const { door, onStatus } = mount(false);
    expect(door.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(door);
    });
    expect(h.openSettlement).toHaveBeenCalledWith("cart-1", "even");
    expect(onStatus).toHaveBeenCalledWith("Splitting evenly — everyone pays their share");
  });
});
