/** @vitest-environment jsdom */
import type { ReactElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { GUIDE_ARM_MS, STAFF_GUIDE_STEPS } from "@/lib/staff-guide";

const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));

const { StepGuide } = await import("./StepGuide");
const { StaffLangProvider } = await import("./StaffLangProvider");

/**
 * PD12 — the guide's WIRING (T18): what only a render shows. The rules themselves are pure and
 * pinned elsewhere — the arm (`guideActAccepted`), the steps and their keys, the quiet — in
 * `lib/staff-guide.test.ts`; this suite proves the component reaches them: focus follows the step,
 * the foot never moves under a finger, every control goes through the arm (after mount AND after
 * every step change — Codex round 3 E1), one motion per step plays once, and the guide adds no
 * region of its own.
 */
let clock = 1_000_000;
beforeEach(() => {
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  haptic.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const render = (ui: ReactElement, lang: "en" | "my" = "en") =>
  rtlRender(ui, {
    wrapper: ({ children }) => <StaffLangProvider lang={lang}>{children}</StaffLangProvider>,
  });
/** Let the step's controls arm. */
const armed = () => {
  clock += GUIDE_ARM_MS;
};
const next = () => screen.getByRole("button", { name: /^(Next|Got it)$/ });
const title = (k: keyof typeof STAFF, vars?: Record<string, number>) =>
  vars ? STAFF[k].en.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v])) : STAFF[k].en;

describe("StepGuide — one card, five steps", () => {
  it("is a labelled group (named by its title, described by its step), never a region, with no live region", () => {
    const { container } = render(
      <StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />,
    );
    const g = screen.getByRole("group", { name: title("floor.strip.label") });
    expect(g.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(g.getAttribute("aria-describedby")!)!.textContent).toBe(
      "Step 1 of 5",
    );
    expect(
      container.querySelector(
        'section, [role="region"], [role="status"], [role="alert"], [aria-live]',
      ),
    ).toBeNull();
    // In place the title is the pane's h2; in the sheet (under the sheet's own title) an h3.
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(title("floor.strip.label"));
  });

  it("in place it takes no focus on mount; each step change moves focus to the new title", () => {
    render(<StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />);
    expect(document.activeElement).toBe(document.body);
    armed();
    fireEvent.click(next());
    const h = screen.getByRole("heading", { level: 2 });
    expect(h.textContent).toBe(title("pad.group.unsent"));
    expect(document.activeElement).toBe(h);
    expect(haptic).toHaveBeenCalledWith("pick");
  });

  it("in the sheet the title takes focus on open, it is an h3, and there is no Close of its own", () => {
    render(<StepGuide screen="counter" host="sheet" lang="en" onDone={vi.fn()} />);
    const h = screen.getByRole("heading", { level: 3 });
    expect(document.activeElement).toBe(h);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("the foot never moves: Back's slot is held on step 1, and Next is ONE element through the guide", () => {
    const { container } = render(
      <StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(container.querySelector(".staff-guide-pager > .staff-guide-slot")).not.toBeNull();
    const n1 = next();
    armed();
    fireEvent.click(n1);
    expect(next()).toBe(n1); // the same node: never remounted under the finger
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("in the Help sheet, step 1's Back returns to the rows — armed like every control; in place, step 1 has none", () => {
    const onExit = vi.fn();
    const onDone = vi.fn();
    const { container } = render(
      <StepGuide screen="counter" host="sheet" lang="en" onDone={onDone} onExit={onExit} />,
    );
    const back = screen.getByRole("button", { name: "Back" });
    expect(container.querySelector(".staff-guide-slot")).toBeNull(); // Back holds its own slot
    fireEvent.click(back);
    expect(onExit).not.toHaveBeenCalled(); // the arm
    armed();
    fireEvent.click(back);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith("pick");
    expect(onDone).not.toHaveBeenCalled();
    cleanup();
    render(<StepGuide screen="counter" host="inplace" lang="en" onDone={onDone} onExit={onExit} />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("five dots, each a named 44px button; the current one is aria-current='step'", () => {
    render(<StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />);
    const dots = within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    expect(dots.map((d) => d.textContent)).toEqual([1, 2, 3, 4, 5].map((n) => `Step ${n} of 5`));
    expect(dots.map((d) => d.getAttribute("aria-current"))).toEqual([
      "step",
      null,
      null,
      null,
      null,
    ]);
    armed();
    fireEvent.click(dots[3]!);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(title("settle.cash.title"));
    expect(dots[3]!.getAttribute("aria-current")).toBe("step");
  });

  it("the arm holds every control after MOUNT — the tap that loaded the screen never acts", () => {
    const onDone = vi.fn();
    render(<StepGuide screen="counter" host="inplace" lang="en" onDone={onDone} />);
    clock += GUIDE_ARM_MS - 1;
    fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(title("floor.strip.label"));
    expect(onDone).not.toHaveBeenCalled();
    clock += 1;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDone).toHaveBeenCalledWith("close");
  });

  it("the arm RESETS on every step change — a double-tap on step 4's Next never fires step 5's Got it", () => {
    const onDone = vi.fn();
    render(<StepGuide screen="counter" host="inplace" lang="en" onDone={onDone} />);
    for (let i = 0; i < 4; i++) {
      armed();
      fireEvent.click(next());
    }
    // Step 5 shows; the second half of the double-tap lands on the same slot, now "Got it".
    expect(next().textContent).toBe("Got it");
    clock += 150;
    fireEvent.click(next());
    expect(onDone).not.toHaveBeenCalled();
    // A slower second press that went DOWN before the arm and lifts after it is still refused.
    clock += 100;
    fireEvent.pointerDown(next());
    clock += GUIDE_ARM_MS;
    fireEvent.click(next(), { detail: 1 });
    expect(onDone).not.toHaveBeenCalled();
    // A fresh press after the arm finishes the guide.
    fireEvent.pointerDown(next());
    fireEvent.click(next(), { detail: 1 });
    expect(onDone).toHaveBeenCalledWith("finish");
  });

  it("each step plays its control's own motion ONCE: a revisit draws the final frame", () => {
    const { container } = render(
      <StepGuide screen="kitchen" host="inplace" lang="en" onDone={vi.fn()} />,
    );
    // Kitchen 1 — the board's own arrival flash, a direct child of the ticket (its RM rule reaches it).
    expect(container.querySelectorAll(".kds-ticket > .kds-flash")).toHaveLength(1);
    armed();
    fireEvent.click(next());
    // Kitchen 2 — only round 2's card flashes.
    expect(container.querySelectorAll(".kds-ticket > .kds-flash")).toHaveLength(1);
    armed();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(container.querySelector(".kds-flash")).toBeNull();
  });

  it("counter 4's one motion is the till's own pop on the change figure, once", () => {
    const { container } = render(
      <StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />,
    );
    const dots = () => within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    armed();
    fireEvent.click(dots()[3]!);
    expect(container.querySelector(".reg-change-row dd")!.className).toBe("mms-pop");
    armed();
    fireEvent.click(dots()[0]!);
    armed();
    fireEvent.click(dots()[3]!);
    expect(container.querySelector(".reg-change-row dd")!.className).toBe("");
  });

  it("the picture is hidden and inert; the title and sentence carry the meaning", () => {
    const { container } = render(
      <StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />,
    );
    const pic = container.querySelector(".guide-well")!;
    expect(pic.getAttribute("aria-hidden")).toBe("true");
    expect(pic.hasAttribute("inert")).toBe(true);
    expect(screen.getByText(STAFF["help.how.counter.2"].en)).not.toBeNull();
  });

  it("kitchen 3 teaches D3's two words in their own places: ပြန်ဖျက် on the pill, ပြန်ယူ on the rail", () => {
    const { container } = render(
      <StepGuide screen="kitchen" host="inplace" lang="my" onDone={vi.fn()} />,
      "my",
    );
    const dots = within(container.querySelector(".staff-guide-dots")!).getAllByRole("button");
    armed();
    fireEvent.click(dots[2]!);
    expect(container.querySelector(".kds-undo .help-pic-undo-btn")!.textContent).toBe(
      STAFF["kds.undo"].my,
    );
    expect(container.querySelector(".kds-recall .kds-recall-label")!.textContent).toBe(
      STAFF["kds.recall"].my,
    );
    // …and never the help line that names the Undo bar with the rail's word (D3(c)).
    expect(container.textContent).not.toContain(STAFF["help.how.kitchen.2.more"].my);
  });

  it("every step's title and sentences render through their keys, with the windows' own seconds", () => {
    render(<StepGuide screen="counter" host="inplace" lang="en" onDone={vi.fn()} />);
    const dots = () => within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    STAFF_GUIDE_STEPS.counter.forEach((step, i) => {
      armed();
      if (i > 0) fireEvent.click(dots()[i]!);
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
        title(step.title, step.titleVars),
      );
      for (const l of step.lines) expect(screen.getByText(title(l.k, l.vars))).not.toBeNull();
    });
    expect(screen.getByText(/For 6 seconds, Undo waits/)).not.toBeNull();
  });

  it("speaks Burmese first: the title over its English echo, the counts in Burmese numerals", () => {
    render(<StepGuide screen="counter" host="inplace" lang="my" onDone={vi.fn()} />, "my");
    const h = screen.getByRole("heading", { level: 2 });
    expect(h.querySelector('[lang="my"]')!.textContent).toBe(STAFF["floor.strip.label"].my);
    expect(h.querySelector(".chrome-en")!.textContent).toBe(STAFF["floor.strip.label"].en);
    expect(document.querySelector(".staff-guide-step")!.textContent).toBe(
      "အဆင့် ၁ / ၅ · Step 1 of 5",
    );
  });
});

describe("StepGuide — the counter pictures are the real controls", () => {
  it("never pulses, and a ticket outside the stop card never shows its bump (no complete ticket)", () => {
    const { container } = render(
      <StepGuide screen="kitchen" host="inplace" lang="en" onDone={vi.fn()} />,
    );
    const dots = () => within(container.querySelector(".staff-guide-dots")!).getAllByRole("button");
    for (let i = 0; i < 5; i++) {
      armed();
      if (i > 0) act(() => fireEvent.click(dots()[i]!));
      expect(container.querySelector(".kds-strip-pulse")).toBeNull();
      expect(container.querySelector(".kds-ticket:not(.kds-ticket-stop) .kds-bump")).toBeNull();
    }
  });
});
