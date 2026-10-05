/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { dineInMenuHref } from "@/lib/table-pick";
import type { DineInTable } from "@/lib/tables";

/**
 * Phase 3c-ii (D27) — the "Pick your table" section as ONE host for two sheets. `DoorSheet.test`
 * stays the law for the section as the DoorSheet renders it (its heading, sub-line, chips, the
 * inline join form's reveal, focus, refusal and submit). What THIS suite pins is the seam the
 * DoorSheet cannot see: the ask is the HOST's (`joinNum` controlled, revealed by a chip or by the
 * host alone — the bind's `seated` answer), a re-target is a FRESH form, the Send sheet's wiring
 * (`onClaim` / `onPlain` / `markMine` / the note under the form) reaches the grid, and no host's
 * `onEnter` is called when no door is entered.
 */
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/components/nav/TransitionNav", () => ({ useJourneyRouter: () => ({ push: nav.push }) }));
vi.mock("posthog-js", () => ({ default: { capture: () => {} } }));
vi.mock("@/lib/useSessionPeek", () => ({
  useSessionPeek: () => [{ mode: "dinein", tableNumber: 5, itemCount: 0, cartId: null }],
}));

const { TableSection } = await import("./TableSection");

const TABLES: DineInTable[] = [
  { tableNumber: 2, occupied: false },
  { tableNumber: 5, occupied: true }, // the peek says it is MINE
  { tableNumber: 9, occupied: true },
];
const text = (el: Element | null) => el?.textContent ?? "";

/** A host that owns the ask the way both sheets do, exposing a way to reveal it from outside. */
function Host(props: {
  source?: "sheet" | "send";
  onEnter?: () => void;
  onClaim?: (n: number) => void;
  onPlain?: () => void;
  markMine?: boolean;
  joinNote?: string;
  initialJoin?: number | null;
  onJoinChange?: (n: number | null) => void;
}) {
  const [joinNum, setJoinNum] = useState<number | null>(props.initialJoin ?? null);
  return (
    <>
      <button type="button" onClick={() => setJoinNum(9)}>
        host-reveal-9
      </button>
      <TableSection
        tables={TABLES}
        source={props.source ?? "sheet"}
        sub="the host's own line"
        joinNum={joinNum}
        onJoinChange={(n) => {
          props.onJoinChange?.(n);
          setJoinNum(n);
        }}
        onEnter={props.onEnter}
        onClaim={props.onClaim}
        onPlain={props.onPlain}
        markMine={props.markMine}
        joinNote={props.joinNote}
      />
    </>
  );
}

beforeEach(() => nav.push.mockReset());
afterEach(cleanup);

describe("TableSection — one section, both tongues, the host's sub-line, no region", () => {
  it("is a section named by its h3 in both tongues, carries the host's sub-line, and announces nothing", () => {
    render(<Host />);
    const h3 = screen.getByRole("heading", { level: 3 });
    const sec = document.querySelector(`section[aria-labelledby="${h3.id}"]`)!;
    expect(sec).not.toBeNull();
    expect(text(h3)).toContain(t("en", "pickYourTable"));
    expect(h3.querySelector('[lang="my"]')?.textContent).toBe(t("my", "pickYourTable"));
    expect(text(sec)).toContain("the host's own line");
    expect(
      within(sec as HTMLElement).getByRole("list", { name: "Choose your table" }),
    ).toBeTruthy();
    expect(sec.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
    expect(sec.querySelector(".mms-stagger")).toBeNull();
  });
});

describe("TableSection — the ask is the HOST's", () => {
  it("the host can reveal the join for a table on its own (the bind's `seated` answer): the form opens, focus lands in its input, the chip is its disclosure", () => {
    render(<Host />);
    expect(document.querySelector("form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "host-reveal-9" }));
    const form = document.querySelector("form")!;
    expect(form).not.toBeNull();
    expect(within(form).getByRole("heading", { name: "Join Table 9" })).toBeTruthy();
    const input = within(form).getByLabelText("Table code");
    expect(document.activeElement).toBe(input);
    const chip = screen.getByRole("button", { name: /^Table 9,/ });
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(chip.getAttribute("aria-controls")).toBe(form.id);
  });

  it("a re-target is a FRESH form: the typed code and an on-field refusal never carry across; the same chip again collapses it and takes focus back", () => {
    const onJoinChange = vi.fn();
    render(<Host onJoinChange={onJoinChange} />);
    const nine = screen.getByRole("button", { name: /^Table 9,/ });
    fireEvent.click(nine);
    expect(onJoinChange).toHaveBeenLastCalledWith(9);
    let form = document.querySelector("form")!;
    fireEvent.submit(form); // empty → refused on the field
    expect(text(form)).toContain("Enter the table code to join.");
    fireEvent.change(within(form).getByLabelText("Table code"), { target: { value: "abcd" } });
    // Re-target to the other seated table (mine by the peek — still a join when the host marks
    // nothing, see below; here the default marking makes 5 "mine", so use the host's own reveal).
    fireEvent.click(screen.getByRole("button", { name: "host-reveal-9" }));
    fireEvent.click(nine); // collapses 9
    expect(onJoinChange).toHaveBeenLastCalledWith(null);
    expect(document.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(nine);
    fireEvent.click(nine); // re-reveal: fresh
    form = document.querySelector("form")!;
    expect(text(form)).not.toContain("Enter the table code to join.");
    expect((within(form).getByLabelText("Table code") as HTMLInputElement).value).toBe("");
  });

  it("a Join submit says the door is entered FIRST, then pushes the one builder's join href, upper-cased", () => {
    const onEnter = vi.fn();
    render(<Host onEnter={onEnter} />);
    fireEvent.click(screen.getByRole("button", { name: /^Table 9,/ }));
    const form = document.querySelector("form")!;
    fireEvent.change(within(form).getByLabelText("Table code"), {
      target: { value: " wxyz1234 " },
    });
    fireEvent.submit(form);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith(dineInMenuHref({ join: "WXYZ1234" }));
    expect(onEnter.mock.invocationCallOrder[0]!).toBeLessThan(
      nav.push.mock.invocationCallOrder[0]!,
    );
  });
});

describe("TableSection — the Send sheet's wiring reaches the grid (3c-ii)", () => {
  it("`onClaim` takes an open chip (no push), `onPlain` the escape in the send's words, `markMine={false}` keeps the peeked table Seated, and the note sits under the form only", () => {
    const onClaim = vi.fn();
    const onPlain = vi.fn();
    const onEnter = vi.fn();
    render(
      <Host
        source="send"
        onClaim={onClaim}
        onPlain={onPlain}
        onEnter={onEnter}
        markMine={false}
        joinNote="the drafts note"
      />,
    );
    expect(screen.queryByText("Your table")).toBeNull();
    expect(screen.getByRole("button", { name: /^Table 5,/ }).className).toMatch(/is-seated/);
    expect(document.body.textContent).not.toContain("the drafts note");
    fireEvent.click(screen.getByRole("button", { name: /^Table 2,/ }));
    expect(onClaim).toHaveBeenCalledWith(2);
    expect(nav.push).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not at a numbered table? Send anyway" }));
    expect(onPlain).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Table 9,/ }));
    const form = document.querySelector("form")!;
    expect(within(form).getByText("the drafts note")).toBeTruthy();
  });
});
