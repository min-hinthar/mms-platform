/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { ownWaitSlot } from "@/lib/bounded-write";
import { TILL_MEDIA, type TillSlipLine } from "@/lib/till";
import type { TillDoor } from "./CashSettleButton";

/**
 * PD6 · counter-floor — the crowned till tray (m6 "Shape of the Sale"): the SAME cash sheet, laid
 * out from the width its grid really fits (`TILL_MEDIA`), with its slip frozen with the quote and
 * the pad host's `door` contract. The money rules are `CashSettleButton.test.tsx`'s and the lib's;
 * this suite pins what only the tray adds. Red-first by mutant (`till-ui/*`), named per case.
 */
const settleCash = vi.fn();
vi.mock("@/lib/staff-cart", () => ({ settleCash: (...a: unknown[]) => settleCash(...(a as [])) }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CashSettleButton } = await import("./CashSettleButton");

/** The viewport: wide enough for the till grid, or not. */
let wide = true;
beforeEach(() => {
  wide = true;
  window.matchMedia = ((q: string) => ({
    matches: q === TILL_MEDIA ? wide : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  settleCash.mockReset();
  ownWaitSlot("cash:s1", false).current = false;
});

const MOHINGA: TillSlipLine = {
  id: "l1",
  qty: 1,
  lead: { text: "Mohinga", lang: "en" },
  echo: null,
};
const TEA: TillSlipLine = {
  id: "l2",
  qty: 1,
  lead: { text: "Burmese Milk Tea", lang: "en" },
  echo: null,
};
const take = (m: string) => STAFF["settle.cash.settleAmount"].en.replace("{m}", m);

type Props = Partial<Parameters<typeof CashSettleButton>[0]>;
function mount(props: Props = {}) {
  const view = (p: Props) => (
    <StaffLangProvider lang="en">
      <CashSettleButton
        sessionId="s1"
        totalCents={1989}
        tipBaseCents={1800}
        handoff
        slip={[MOHINGA, TEA]}
        {...p}
      />
    </StaffLangProvider>
  );
  const r = render(view(props));
  const rerender = (p: Props) => r.rerender(view({ ...props, ...p }));
  const trigger = () =>
    screen.getByRole("button", {
      name: (n) =>
        n.startsWith("Take cash") ||
        n === STAFF["settle.cash.settling"].en ||
        n.startsWith("Waiting") ||
        n.startsWith("Saving"),
    });
  const settle = () =>
    screen.getByRole("button", {
      name: (n) => n.startsWith("Take $") || n === STAFF["settle.cash.settling"].en,
    });
  return { trigger, settle, rerender };
}

describe("the till tray — the one cash sheet, from the width its grid fits (Codex correction 8)", () => {
  it("wide: the crowned tray reads OWE → TIP → GAVE; the due is decorative (the question carries it); the readout rides the band", () => {
    const { trigger } = mount();
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog", { name: STAFF["settle.cash.title"].en });
    // MUTATION till-ui/tray-never-keyed (`till` pinned false): the wide tablet gets the phone's
    // single column; red.
    expect(dialog.classList.contains("till-sheet")).toBe(true);
    const body = dialog.querySelector(".till-body")!;
    expect([...body.children].map((c) => c.className)).toEqual([
      "till-owe",
      "till-arrow",
      "till-tip",
      "till-arrow",
      "till-gave",
    ]);
    // The arrows and the hero are decoration; the question names the figure once.
    expect(
      [...body.querySelectorAll(".till-arrow")].every((a) => a.getAttribute("aria-hidden")),
    ).toBe(true);
    const hero = body.querySelector(".till-hero")!;
    expect(hero.getAttribute("aria-hidden")).toBe("true");
    expect(hero.textContent).toBe("$19.89");
    expect(body.querySelector(".till-question")!.textContent).toContain("Take $19.89 in cash?");
    // The slip: qty × dish, no amounts — a list named by its heading.
    const slip = within(body as HTMLElement).getByRole("list", {
      name: STAFF["pad.ticket.title"].en,
    });
    expect([...slip.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "1×Mohinga",
      "1×Burmese Milk Tea",
    ]);
    expect(slip.textContent).not.toMatch(/\$/);
    // The band: the actions under OWE + TIP, the readout (Take's description) in the money corner,
    // and the readout is NOT inside the GAVE column any more.
    const band = dialog.querySelector(".till-band-row")!;
    expect(band.querySelector("#cash-readout")).not.toBeNull();
    expect(body.querySelector("#cash-readout")).toBeNull();
    expect(
      band
        .querySelector(".till-band-actions")!
        .contains(screen.getByRole("button", { name: "Cancel" })),
    ).toBe(true);
  });

  it("a tile tap: the change sits in the money corner with its English (decision 12), the tile lit by value", () => {
    const { trigger } = mount();
    fireEvent.click(trigger());
    const chip = within(
      screen.getByRole("group", { name: STAFF["settle.a11y.cashQuick"].en }),
    ).getByRole("button", { name: "$50" });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    const readout = document.getElementById("cash-readout")!;
    // 5000 − 1989 = 3011 (node -e 'console.log(5000-1989)').
    expect(readout.querySelector("dd")!.textContent).toBe("$30.11");
    expect(readout.closest(".till-band-row")).not.toBeNull();
  });

  it("narrow: the single-column sheet, unchanged — no tray, no band row, the readout under the tender", () => {
    wide = false;
    const { trigger } = mount();
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("till-sheet")).toBe(false);
    expect(dialog.querySelector(".till-body")).toBeNull();
    expect(dialog.querySelector(".till-band-row")).toBeNull();
    expect(document.getElementById("cash-readout")).not.toBeNull();
  });
});

describe("the slip freezes with the quote (Codex round 3 on m6)", () => {
  it("a colleague's add marks the slip, holds Take through the ONE binding, and the mark re-freezes both", async () => {
    const { trigger, settle, rerender } = mount();
    fireEvent.click(trigger());
    // The cart moves under the open tray: a line AND its total.
    const COFFEE: TillSlipLine = {
      id: "l3",
      qty: 1,
      lead: { text: "Coffee", lang: "en" },
      echo: null,
    };
    rerender({ slip: [MOHINGA, TEA, COFFEE], totalCents: 2431 });
    // The FROZEN slip still shows — no third line beside the old due.
    const list = screen.getByRole("list", { name: STAFF["pad.ticket.title"].en });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    const mark = screen.getByRole("button", { name: /The order changed/ });
    // MUTATION till-ui/slip-hold-not-bound (the "slip" arm dropped from the binding): Take stays
    // live over a screen whose items and total disagree; red.
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(settle().getAttribute("aria-describedby")).toContain("till-slip-changed");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION till-ui/slip-hold-handler-open: the handler's own guard dropped — the tap adopts or
    // settles under the stale slip; red.
    expect(settleCash).not.toHaveBeenCalled();
    expect(settle().textContent).toBe(take("$19.89"));
    // The mark is the way on: it re-freezes the slip and adopts the moved total (the moved
    // sentence names both figures), recording nothing.
    fireEvent.click(mark);
    expect(
      screen.getByRole("list", { name: STAFF["pad.ticket.title"].en }).querySelectorAll("li"),
    ).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /The order changed/ })).toBeNull();
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(settle().textContent).toBe(take("$24.31"));
    expect(screen.getByRole("alert").textContent).toBe(
      STAFF["settle.cash.moved"].en.replace("{old}", "$19.89").replace("{m}", "$24.31"),
    );
    expect(settleCash).not.toHaveBeenCalled();
  });

  it("a Send under the open tray (same lines, same quantities) is no change", () => {
    const { trigger, settle, rerender } = mount();
    fireEvent.click(trigger());
    rerender({ slip: [{ ...MOHINGA }, { ...TEA }] });
    expect(screen.queryByRole("button", { name: /The order changed/ })).toBeNull();
    expect(settle().getAttribute("aria-disabled")).toBeNull();
  });
});

describe("the pad host's door (K39) — the walk-up sale never leaves the pad", () => {
  const door = (over: Partial<TillDoor> = {}): TillDoor => ({
    held: null,
    busy: null,
    showAmount: true,
    beforeOpen: () => Promise.resolve(true),
    onHeldTap: vi.fn(),
    onCancelClean: vi.fn(),
    ...over,
  });

  it("a held door is aria-disabled, described by the pad's hint, and a tap hands up — no tray", () => {
    const onTap = vi.fn();
    const { trigger } = mount({ door: door({ held: { noteId: "pad-settle-why", onTap } }) });
    expect(trigger().getAttribute("aria-disabled")).toBe("true");
    expect(trigger().getAttribute("aria-describedby")).toBe("pad-settle-why");
    fireEvent.click(trigger());
    // MUTATION till-ui/door-hold-opens: the tray opens over the pad's hold; red.
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the pad's busy phase is the door's busy, in that phase's words", () => {
    const { trigger } = mount({ door: door({ busy: <>Waiting for the last dish…</> }) });
    expect(trigger().getAttribute("aria-busy")).toBe("true");
    expect(trigger().textContent).toBe("Waiting for the last dish…");
  });

  it("the gate runs at the tap: refused, nothing opens; passed, the tray freezes the figures of the read it waited for", async () => {
    let pass!: (ok: boolean) => void;
    const beforeOpen = vi.fn(() => new Promise<boolean>((r) => (pass = r)));
    const { trigger, settle, rerender } = mount({ door: door({ beforeOpen }) });
    await act(async () => {
      fireEvent.click(trigger());
    });
    expect(beforeOpen).toHaveBeenCalledTimes(1);
    // A second tap while the gate runs opens nothing twice.
    await act(async () => {
      fireEvent.click(trigger());
    });
    expect(beforeOpen).toHaveBeenCalledTimes(1);
    // The read the gate waited for lands: a new total and a new line.
    const COFFEE: TillSlipLine = {
      id: "l3",
      qty: 1,
      lead: { text: "Coffee", lang: "en" },
      echo: null,
    };
    rerender({ totalCents: 2431, slip: [MOHINGA, TEA, COFFEE] });
    await act(async () => {
      pass(true);
    });
    // MUTATION till-ui/freeze-from-the-tapping-render (the quote frozen in the tap's closure): the
    // tray quotes $19.89 over a cart the gate just read at $24.31 — and its slip is a dish short;
    // red.
    expect(settle().textContent).toBe(take("$24.31"));
    expect(
      screen.getByRole("list", { name: STAFF["pad.ticket.title"].en }).querySelectorAll("li"),
    ).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /The order changed/ })).toBeNull();
  });

  it("a gate that refuses (or throws) opens nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { trigger } = mount({ door: door({ beforeOpen: () => Promise.resolve(false) }) });
    await act(async () => {
      fireEvent.click(trigger());
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    const t2 = mount({ door: door({ beforeOpen: () => Promise.reject(new Error("x")) }) });
    await act(async () => {
      fireEvent.click(t2.trigger());
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it("no idle hint under the door on the pad host (decision 26); the table page keeps its hint", () => {
    mount({ door: door() });
    expect(document.getElementById("settle-hint")).toBeNull();
    cleanup();
    mount();
    expect(document.getElementById("settle-hint")!.textContent).toContain(
      STAFF["settle.cash.hint"].en,
    );
  });

  it("held on this cart's own unanswered settle: the tap is said by the PAD's one region, and the control mounts no alert (B7)", () => {
    ownWaitSlot("cash:s1", false).current = true;
    const onHeldTap = vi.fn();
    const { trigger } = mount({ door: door({ onHeldTap }) });
    fireEvent.click(trigger());
    // MUTATION till-ui/held-tap-mounts-a-second-region: the control's own sr-only alert beside the
    // pad's Toast — two live regions on one view; red.
    expect(onHeldTap).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the clean-cancel line is handed up only after a REFUSED attempt — never after a plain cancel", async () => {
    const onCancelClean = vi.fn();
    const { trigger, settle } = mount({ door: door({ onCancelClean }) });
    await act(async () => {
      fireEvent.click(trigger());
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // A routine cancel stays silent (appendix C).
    expect(onCancelClean).not.toHaveBeenCalled();
    settleCash.mockResolvedValueOnce({ ok: false, error: "Couldn’t take it.", code: "sentence" });
    await act(async () => {
      fireEvent.click(trigger());
    });
    await act(async () => {
      fireEvent.click(settle());
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // MUTATION till-ui/cancel-clean-never-said (the hand-up dropped from the close): red.
    expect(onCancelClean).toHaveBeenCalledTimes(1);
  });
});
