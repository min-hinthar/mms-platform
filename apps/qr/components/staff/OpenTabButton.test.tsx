/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";

/**
 * Phase 2h — the running-bill opener. It was three English literals ("Open a tab", "Opening…",
 * "…settles once at close, with any tender") on a console that speaks Burmese, a native `disabled`
 * that dropped focus under the tap, and an unbounded await with no catch: a hung action latched
 * "Opening…" for good and a thrown one reached the error boundary. What only a render can show: the
 * words are the dictionary's in the device's tongue, the control frees at the bound and says "no
 * answer yet" with the reload, a late open still lands, and a lost answer says "couldn't confirm".
 */
const openTab = vi.fn();
vi.mock("@/lib/tabs", () => ({ openTab: (...a: unknown[]) => openTab(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { OpenTabButton } = await import("./OpenTabButton");
const { ts } = await import("@/lib/i18n/staff");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  openTab.mockReset();
  refresh.mockReset();
});

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const onChanged = vi.fn();
function mount(lang: "en" | "my" = "en") {
  onChanged.mockReset();
  return render(
    <StaffLangProvider lang={lang}>
      <OpenTabButton cartId="c1" onChanged={onChanged} />
    </StaffLangProvider>,
  );
}
function hungOpen() {
  let answer!: (v: unknown) => void;
  let fail!: (e: Error) => void;
  openTab.mockReturnValueOnce(
    new Promise((res, rej) => {
      answer = res;
      fail = rej;
    }),
  );
  return { answer: (v: unknown) => answer(v), fail: (e: Error) => fail(e) };
}
const MYANMAR = /[က-႟]/;
const reload = () => screen.queryByRole("button", { name: ts("en", "out.reload") });

describe("OpenTabButton — the dictionary's words, in the device's tongue", () => {
  it("on a Burmese tablet the label and the hint lead in Burmese, and no old English literal remains", () => {
    // MUTATION (p2h-doors/open-bill-english-literal): the label is the old "Open a tab" — English on
    // a Burmese console, and the jargon word the staff vocabulary retired; red.
    const { container } = mount("my");
    const btn = screen.getByRole("button");
    expect(btn.querySelector('[lang="my"]')?.textContent).toBe(
      ts("my", "table.detail.openBill.btn"),
    );
    expect(container.textContent).toMatch(MYANMAR);
    expect(container.textContent).not.toContain("Open a tab");
    expect(container.textContent).not.toContain("settles once at close");
    // The hint is the button's description, by a minted id.
    const hint = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
    expect(hint?.querySelector('[lang="my"]')?.textContent).toBe(
      ts("my", "table.detail.openBill.hint"),
    );
  });
});

describe("OpenTabButton — the open is bounded, never natively disabled", () => {
  it("while it opens it is aria-busy + aria-disabled (never native); at the bound it frees and says 'no answer yet' with the reload", async () => {
    hungOpen();
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.opening"));
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-doors/open-bill-native-disabled): natively disabled while it opens — focus
    // drops to <body> under the tap; red.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn); // refused in the handler
    expect(openTab).toHaveBeenCalledTimes(1);
    await flush(STAFF_HANG_MS - 1);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-doors/open-bill-unbounded): the bound never fires — "Opening…" holds for as
    // long as the queue is stuck; red.
    await flush(1);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-doors/open-bill-waiting-unsaid): the bound passes in silence; red.
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    expect(reload()).not.toBeNull();
    expect(screen.getByRole("alert").contains(reload())).toBe(false);
  });

  it("a LATE open lands: the detail re-reads, and 'no answer yet' goes", async () => {
    const h = hungOpen();
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open a running bill/ }));
    });
    await flush(STAFF_HANG_MS);
    expect(onChanged).not.toHaveBeenCalled();
    // MUTATION (p2h-doors/open-bill-late-ok-dropped): the late answer is dropped — the bill IS open
    // and the detail never re-reads it; red.
    await act(async () => h.answer({ ok: true }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    // MUTATION (p2h-doors/open-bill-late-open-rearms): a LATE open frees the control — a tap before
    // the re-read swaps it away asks for a second open; red.
    const btn = screen.getByRole("button", { name: /Opening/ });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("an OPENED bill keeps 'Opening…' until the re-read swaps the button away — a second tap opens nothing (S2 critic D8)", async () => {
    openTab.mockResolvedValueOnce({ ok: true });
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-doors/open-bill-opened-rearms): the busy frees on success — the button reads
    // "Open a running bill" again over a bill that is open, and a second tap sends a second open;
    // red.
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.opening"));
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("a LATE throw says 'couldn't confirm' over the waiting line", async () => {
    const h = hungOpen();
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open a running bill/ }));
    });
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    // MUTATION (p2h-doors/open-bill-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.unknown"));
  });

  it("a THROWN open says 'couldn't confirm' and frees the control; a refusal says the server's sentence", async () => {
    const h = hungOpen();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.unknown"));
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(reload()).toBeNull();
    openTab.mockResolvedValueOnce({ ok: false, error: "Tabs aren’t available right now." });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("alert").textContent).toBe("Tabs aren’t available right now.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
