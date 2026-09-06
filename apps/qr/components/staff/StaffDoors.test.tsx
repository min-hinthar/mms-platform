/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setStaffDoor = vi.fn();
const push = vi.fn();
vi.mock("@/lib/staff-door-actions", () => ({ setStaffDoor: (v: unknown) => setStaffDoor(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { StaffDoors } = await import("./StaffDoors");

/**
 * P7 — the doors. What is worth pinning: a tap REMEMBERS then NAVIGATES, in that order (the counter
 * door's target is /staff, which only shows the floor once the cookie exists); a refused or thrown
 * write still opens the door; the remembered door is the ONLY one marked current and says so in
 * words; and every door and tile is a real link with a real href.
 */
afterEach(cleanup);
beforeEach(() => {
  setStaffDoor.mockReset();
  push.mockReset();
  setStaffDoor.mockResolvedValue({ ok: true, door: "kitchen" });
});

const kitchen = () => screen.getByRole("link", { name: /မီးဖိုချောင်/ });
const counter = () => screen.getByRole("link", { name: /ကောင်တာနဲ့ စားပွဲများ/ });

describe("StaffDoors", () => {
  it("remembers the door, THEN navigates to its target", async () => {
    render(<StaffDoors lang="my" current={null} more={[]} />);
    expect(kitchen().getAttribute("href")).toBe("/staff/kitchen");
    expect(counter().getAttribute("href")).toBe("/staff");
    fireEvent.click(counter());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff"));
    expect(setStaffDoor).toHaveBeenCalledWith({ door: "counter" });
    // Order: the write settled before the navigation was asked for.
    expect(setStaffDoor.mock.invocationCallOrder[0]!).toBeLessThan(
      push.mock.invocationCallOrder[0]!,
    );
  });
  it("a refused write still opens the door", async () => {
    setStaffDoor.mockResolvedValue({ ok: false, error: "nope" });
    render(<StaffDoors lang="my" current={null} more={[]} />);
    fireEvent.click(kitchen());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff/kitchen"));
  });
  it("a THROWN write still opens the door", async () => {
    setStaffDoor.mockRejectedValue(new Error("outside a request scope"));
    render(<StaffDoors lang="my" current={null} more={[]} />);
    fireEvent.click(kitchen());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff/kitchen"));
  });
  it("marks ONLY the remembered door current, in words as well as state", () => {
    render(<StaffDoors lang="my" current="kitchen" more={[]} />);
    expect(kitchen().getAttribute("aria-current")).toBe("true");
    expect(counter().getAttribute("aria-current")).toBeNull();
    expect(kitchen().textContent).toContain("ဒီတက်ဘလက် ဖွင့်တိုင်း ဒီစခရင် ရောက်မယ်");
    expect(counter().textContent).not.toContain("ဒီတက်ဘလက် ဖွင့်တိုင်း");
  });
  it("a modified click is left to the browser (new tab), no write, no push", () => {
    render(<StaffDoors lang="my" current={null} more={[]} />);
    fireEvent.click(kitchen(), { metaKey: true });
    expect(setStaffDoor).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
  it("the More grid is a named list of real links, or nothing at all", () => {
    const { rerender } = render(<StaffDoors lang="my" current={null} more={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
    rerender(
      <StaffDoors
        lang="my"
        current={null}
        more={[
          { href: "/board", k: "floor.nav.board", icon: "tv" },
          { href: "/staff/glossary", k: "floor.nav.glossary", icon: "print" },
        ]}
      />,
    );
    const list = screen.getByRole("list");
    expect(list.getAttribute("aria-label")).toBeNull(); // named by the visible "More" heading
    expect(screen.getByRole("link", { name: /တီဗီ ဘုတ်/ }).getAttribute("href")).toBe("/board");
    expect(screen.getByRole("link", { name: /စာလုံး စစ်ဆေးစာရွက်/ }).getAttribute("href")).toBe(
      "/staff/glossary",
    );
  });
});
