/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setStaffDoor = vi.fn();
const push = vi.fn();
vi.mock("@/lib/staff-door-actions", () => ({ setStaffDoor: (v: unknown) => setStaffDoor(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { StaffDoors } = await import("./StaffDoors");

/**
 * P7 — the doors. What is worth pinning: a tap REMEMBERS then NAVIGATES, and "then" means the write
 * SETTLED — not that it was merely asked first (the blind pass caught the first draft asserting
 * invocation order, which a `void setStaffDoor()` satisfies); a refused or thrown write still opens
 * EITHER door, and the doors are usable afterwards (the first draft latched `busy` forever, so one
 * refused write left two dead links until a reload); the remembered door is the ONLY one marked
 * current and says so in words; every door and tile is a real link with a real href; and the CSS
 * written for the door title actually matches the DOM the door renders.
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
  it("navigates only once the write has SETTLED — never on the same tick it was asked", async () => {
    let settle!: (v: unknown) => void;
    setStaffDoor.mockReturnValue(new Promise((r) => (settle = r)));
    render(<StaffDoors lang="my" current={null} more={[]} />);
    expect(kitchen().getAttribute("href")).toBe("/staff/kitchen");
    // The counter door's href asks for the floor by name, so it opens the floor with JavaScript
    // off and on a device whose cookie could not be written — never the doors again.
    expect(counter().getAttribute("href")).toBe("/staff?floor=1");
    fireEvent.click(counter());
    expect(setStaffDoor).toHaveBeenCalledWith({ door: "counter" });
    expect(counter().getAttribute("aria-busy")).toBe("true");
    // Let any microtask that WOULD have pushed run: the write is still pending, so nothing may.
    await Promise.resolve();
    await Promise.resolve();
    expect(push).not.toHaveBeenCalled();
    settle({ ok: true, door: "counter" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff?floor=1"));
    expect(push).toHaveBeenCalledTimes(1);
  });
  it("a second tap while the first is in flight is one write and one navigation, not two", async () => {
    let settle!: (v: unknown) => void;
    setStaffDoor.mockReturnValue(new Promise((r) => (settle = r)));
    render(<StaffDoors lang="my" current={null} more={[]} />);
    fireEvent.click(kitchen());
    fireEvent.click(counter()); // the other door, on the same tick — state has not re-rendered yet
    fireEvent.click(kitchen());
    expect(setStaffDoor).toHaveBeenCalledTimes(1);
    settle({ ok: true, door: "kitchen" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff/kitchen"));
    expect(push).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["refused", () => setStaffDoor.mockResolvedValue({ ok: false, error: "nope" })],
    ["THROWN", () => setStaffDoor.mockRejectedValue(new Error("outside a request scope"))],
  ])("a %s write still opens the KITCHEN door", async (_, arm) => {
    arm();
    render(<StaffDoors lang="my" current={null} more={[]} />);
    fireEvent.click(kitchen());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff/kitchen"));
  });
  it.each([
    ["refused", () => setStaffDoor.mockResolvedValue({ ok: false, error: "nope" })],
    ["THROWN", () => setStaffDoor.mockRejectedValue(new Error("outside a request scope"))],
  ])(
    "a %s write still opens the COUNTER door — the floor by name, not the doors again",
    async (_, arm) => {
      arm();
      render(<StaffDoors lang="my" current={null} more={[]} />);
      fireEvent.click(counter());
      await waitFor(() => expect(push).toHaveBeenCalledWith("/staff?floor=1"));
    },
  );
  it("after a refused write the doors are LIVE again — busy is released, the next tap works", async () => {
    setStaffDoor.mockResolvedValueOnce({ ok: false, error: "nope" });
    render(<StaffDoors lang="my" current={null} more={[]} />);
    fireEvent.click(counter());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff?floor=1"));
    await waitFor(() => expect(counter().getAttribute("aria-busy")).toBeNull());
    // The mocked router did not navigate, so the doors are still mounted — as they are for real
    // when a navigation lands on the same route. The other door must still open.
    fireEvent.click(kitchen());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/staff/kitchen"));
    expect(setStaffDoor).toHaveBeenCalledTimes(2);
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

/**
 * The door title's CSS is written against `<Chrome echo="stack">`'s DOM — a `.chrome-pair` wrapper
 * holding the `lang="my"` span and the `.chrome-en` echo, or a bare text node in English. The blind
 * pass found the first draft's `.staff-door-name > [lang="my"]` matching NOTHING (the span is a
 * grandchild) and a `.staff-door-en` class no component emits: the 38px doors did not ship, and no
 * guard could see it. This one can: every selector in globals.css that names `.staff-door-name`
 * must match the rendered doors, in the language it is written for, through jsdom's own selector
 * engine — the same matcher the browser runs. A selector nothing matches is dead CSS, and dead CSS
 * for a title is a title at body size.
 */
describe("the door-title CSS matches the DOM the doors render", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  // Rule selectors that name the title, wherever they sit (the register row reuses the title
  // structure under `.staff-counter-primary`, whose prefix is dropped so the tail is held to the
  // same DOM). `@media` blocks contain no `.staff-door-name` rule, so a flat scan is exact here.
  // P7·1b widened this to the More rows' name (`.staff-row-name`), which render the same
  // `<Chrome echo="stack">` pair — so the guard renders ONE tile beneath the doors.
  const selectors = [...css.matchAll(/([^{}]*\.staff-(?:door|row)-name[^{}]*)\{/g)]
    .map((m) => m[1]!.trim())
    .filter((s) => !s.startsWith("@"))
    .map((s) => s.replace(/^\.staff-counter-primary\s+/, ""));
  const oneTile = [{ href: "/board", k: "floor.nav.board", icon: "tv" } as const];
  it("names at least the title, its Burmese, its echo, its sub-line and the row name", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(5);
  });
  it.each(selectors)("%s matches a rendered door", (selector) => {
    // A selector about the Burmese span or its echo is held to the Burmese render; the rest to both.
    const langs: ("my" | "en")[] = /\[lang="my"\]|\.chrome-/.test(selector) ? ["my"] : ["my", "en"];
    for (const lang of langs) {
      const { container, unmount } = render(
        <StaffDoors lang={lang} current={null} more={oneTile} />,
      );
      expect(container.querySelector(selector), `${selector} under lang=${lang}`).not.toBeNull();
      unmount();
    }
  });
  it("(red-first) a child combinator against the pair wrapper is exactly what does NOT match", () => {
    const { container } = render(<StaffDoors lang="my" current={null} more={[]} />);
    expect(container.querySelector('.staff-door-name > [lang="my"]')).toBeNull();
    expect(container.querySelector('.staff-door-name > .chrome-pair > [lang="my"]')).not.toBeNull();
  });
});
