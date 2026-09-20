/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import type { VoidLineResult } from "@/lib/voids";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";

/**
 * manager-6 / P2t + manager-7 — the void/comp sheet's WIRING: its title and every refusal are the
 * dictionary's (marked under `my`), its segment and reason rows wear the console's one chip class
 * with `aria-pressed` and NO inline fill (the shared lit-cap rule must be able to reach them), and
 * its buttons are §17 (aria-disabled, never native).
 */
const voidLine = vi.fn(
  (): Promise<VoidLineResult> => Promise.resolve({ ok: true, action: "void" }),
);
vi.mock("@/lib/voids", () => ({
  listApprovers: () => Promise.resolve([]),
  voidLine: (...a: unknown[]) => voidLine(...(a as [])),
}));
vi.mock("@/lib/approvals", () => ({
  requestApproval: () => Promise.resolve({ ok: false, reason: "already_pending" }),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { LossActionSheet } = await import("./LossActionSheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "l1",
  name: "Mohinga",
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
} as unknown as TableLineView;

function mount(lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <LossActionSheet open onOpenChange={() => {}} sessionId="s1" line={line} onDone={() => {}} />
    </StaffLangProvider>,
  );
}
const region = () => document.getElementById("loss-msg")!;
// Under `my` the row's name is the pair (Burmese · English echo), so the English is matched as a part.
const reason = () =>
  screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.mistake"].en) });
const confirmVoid = () =>
  screen.getByRole("button", { name: new RegExp(STAFF["table.loss.confirm.void"].en) });

describe("LossActionSheet — the sheet in the console's tongue", () => {
  it("under my the title is the dictionary's, marked, with the dish name a Latin run inside it", () => {
    mount("my");
    const title = document.querySelector('[role="dialog"] h2');
    // The title itself, never a fallback to the first Burmese run in the body (uniqueness ≠ liveness).
    expect(title).not.toBeNull();
    const my = title!.querySelector('[lang="my"]');
    // MUTATION: `title={`Void “${line.name}”`}` — no marked run, this reddens.
    expect(my).not.toBeNull();
    expect(my!.textContent).toBe(tf("my", "table.loss.title.void", { x: "Mohinga" }));
    expect(my!.querySelector('[lang="en"]')?.textContent).toBe("Mohinga");
  });

  it("a refusal lands in the ONE region as the dictionary's sentence — marked under my", async () => {
    voidLine.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    mount("my");
    await act(async () => {
      fireEvent.click(reason());
    });
    await act(async () => {
      fireEvent.submit(confirmVoid().closest("form")!);
    });
    expect(voidLine).toHaveBeenCalledTimes(1);
    const my = region().querySelector('[lang="my"]');
    // MUTATION: `setMsg("That item isn’t on this table anymore.")` — unmarked English, red.
    expect(my?.textContent).toBe(STAFF["table.loss.msg.notFound"].my);
  });

  it("submitting with no reason says so through the dictionary and sends nothing", async () => {
    mount();
    await act(async () => {
      fireEvent.submit(confirmVoid().closest("form")!);
    });
    expect(voidLine).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["table.loss.reasonRequired"].en);
  });

  it("manager-7 — the segment halves and the reason rows wear `.staff-chip` with aria-pressed and no inline fill", async () => {
    mount();
    const voidHalf = screen.getByRole("button", { name: STAFF["table.loss.seg.void"].en });
    const compHalf = screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en });
    expect(voidHalf.classList.contains("staff-chip")).toBe(true);
    expect(voidHalf.getAttribute("aria-pressed")).toBe("true");
    expect(compHalf.getAttribute("aria-pressed")).toBe("false");
    // MUTATION: restore `style={{ ...segBtn, ...(on ? segBtnOn : null) }}` — an inline fill beats
    // the shared rule, and this reddens.
    expect((voidHalf as HTMLElement).style.background).toBe("");
    await act(async () => {
      fireEvent.click(reason());
    });
    const row = reason();
    expect(row.classList.contains("staff-chip")).toBe(true);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect((row as HTMLElement).style.background).toBe("");
  });

  it("§17 — the confirm is aria-disabled + busy while the void runs, never native", async () => {
    let release: ((r: VoidLineResult) => void) | null = null;
    voidLine.mockReturnValueOnce(
      new Promise<VoidLineResult>((r) => {
        release = r;
      }),
    );
    mount();
    await act(async () => {
      fireEvent.click(reason());
    });
    const btn = confirmVoid() as HTMLButtonElement;
    // The form's own submit (what the tap and Enter both dispatch): jsdom's click→implicit-submit
    // path lands the action but commits the transition's pending render outside `act`.
    await act(async () => {
      fireEvent.submit(btn.closest("form")!);
    });
    expect(voidLine).toHaveBeenCalledTimes(1);
    // MUTATION: `disabled={!canSubmit}` — `disabled` reads true and this reddens.
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain(STAFF["table.loss.working"].en);
    // A second submit mid-flight is refused on the same predicate.
    await act(async () => {
      fireEvent.submit(btn.closest("form")!);
    });
    expect(voidLine).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true, action: "void" });
    });
  });
});
