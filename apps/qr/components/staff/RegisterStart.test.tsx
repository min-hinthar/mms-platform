/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";

/**
 * The Start zone's WIRING (counter-3 · counter-4 · counter-5, rebuilt on the screen's ONE mint lock
 * in Phase 2d), pinned where it lives — the rules that only a render can show:
 *   - §17: a mint leaves every control `aria-disabled` (never natively disabled), the tapped control
 *     keeps its label and its FOCUS through the round trip, a second tap in the same frame mints
 *     nothing, and a refusal lands in the ONE region with focus still on the control;
 *   - Phase 2d: two controls — Walk-up, the zone's ONE primary (the primitive Button at `xl`), and
 *     the Phone order arm; a server action that REJECTS is said as unknown and re-arms the zone;
 *   - counter-4: the arm wears `.staff-arm` + `.staff-press`, and the open one says so with
 *     `aria-expanded` — the attribute the shared lit-cap rule reads;
 *   - counter-5: opening the arm focuses its input with a "go" hint; closing hands focus back.
 */
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

const openRegisterOrder = vi.fn();
const push = vi.fn();
const haptic = vi.fn();
vi.mock("@/lib/register", () => ({
  openRegisterOrder: (...a: unknown[]) => openRegisterOrder(...a),
}));
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CounterMintProvider } = await import("./CounterMint");
const { RegisterStart } = await import("./RegisterStart");
const { ts } = await import("@/lib/i18n/staff");
const { reloadHolds } = await import("@/lib/reload-guard");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
/** One more turn: an async transition's `isPending` clears a tick after its action returns. */
const settle = () => act(async () => {});

function mount(lang: "en" | "my" = "en") {
  const utils = render(
    <StaffLangProvider lang={lang}>
      <CounterMintProvider>
        <RegisterStart />
      </CounterMintProvider>
    </StaffLangProvider>,
  );
  const walkup = () => utils.container.querySelector<HTMLButtonElement>("button.ui-btn")!;
  const phone = () => utils.container.querySelector<HTMLButtonElement>("button.staff-arm")!;
  const controls = () => [walkup(), phone()];
  const region = () => utils.container.querySelector('[role="status"]')!;
  return { ...utils, walkup, phone, controls, region };
}

describe("RegisterStart — the Start zone's wiring", () => {
  it("§17 — a mint is aria-disabled, never native; Walk-up keeps its label and focus; a refusal lands in the region", async () => {
    const d = deferred<{ ok: false; error: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { walkup, phone, controls, region } = mount();
    walkup().focus();
    await act(async () => {
      fireEvent.click(walkup());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    expect(haptic).toHaveBeenCalledWith("commit");
    // MUTATION: native `disabled` on any control — `disabled` reads true and this reddens.
    for (const b of controls()) {
      expect(b.disabled).toBe(false);
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    expect(walkup().getAttribute("aria-busy")).toBe("true");
    expect(phone().getAttribute("aria-busy")).toBeNull();
    expect(walkup().textContent).toContain(ts("en", "reg.start.walkup"));
    expect(document.activeElement).toBe(walkup());
    // A second tap while the first is in flight mints nothing.
    await act(async () => {
      fireEvent.click(walkup());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: false, error: "Pick a table number." });
      await d.promise;
    });
    await settle();
    expect(region().textContent).toBe("Pick a table number.");
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
    expect(walkup().getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(walkup());
    // …and the zone is live again: the next tap mints — and a LANDED mint holds the zone until the
    // route swap unmounts it: a third tap in that beat mints nothing.
    openRegisterOrder.mockResolvedValueOnce({ ok: true, sessionId: "s2", created: true });
    await act(async () => {
      fireEvent.click(walkup());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/staff/table/s2/add");
    // MUTATION: release the lock in `finally` unconditionally — the third tap mints.
    for (const b of controls()) expect(b.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(walkup());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });

  it("two taps in ONE frame mint one order — the ref guard, before `pending` has committed", async () => {
    const d = deferred<{ ok: true; sessionId: string; created: boolean }>();
    openRegisterOrder.mockReturnValue(d.promise);
    const { walkup } = mount();
    await act(async () => {
      fireEvent.click(walkup());
      fireEvent.click(walkup());
    });
    // MUTATION: drop the in-flight ref and gate on `pending` alone — both taps read false.
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s1", created: true });
      await d.promise;
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/staff/table/s1/add");
  });

  it("a start whose answer never comes back is said as UNKNOWN in the region, and the zone re-arms — never the error boundary", async () => {
    const d = deferred<never>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { walkup, region } = mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await act(async () => {
      d.reject(new TypeError("Failed to fetch"));
      await d.promise.catch(() => {});
    });
    await settle();
    // MUTATION: drop the catch → the rejection escapes the transition to the error boundary.
    expect(region().textContent).toBe(ts("en", "floor.mint.unknown"));
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("Walk-up is the zone's ONE primary — it steps down to secondary while the Phone form (whose Go is primary) is open", async () => {
    const { walkup, phone, container } = mount();
    expect(walkup().className).toContain("ui-btn-primary");
    expect(walkup().className).toContain("ui-btn-xl");
    await act(async () => {
      fireEvent.click(phone());
    });
    expect(walkup().className).toContain("ui-btn-secondary");
    const primaries = container.querySelectorAll(".ui-btn-primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.getAttribute("type")).toBe("submit");
  });

  it("counter-4 — the Phone arm wears the zone's class and the press, and says when it is open", async () => {
    const { walkup, phone } = mount();
    expect(phone().classList.contains("staff-press")).toBe(true);
    // A `.staff-press` is never stacked on a `.ui-btn` (shared rule "BUTTONS AND BUSY").
    expect(walkup().classList.contains("staff-press")).toBe(false);
    expect(walkup().hasAttribute("aria-expanded")).toBe(false); // Walk-up opens nothing
    expect(phone().getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(phone());
    });
    expect(phone().getAttribute("aria-expanded")).toBe("true");
    expect(haptic).toHaveBeenCalledWith("pick");
    await act(async () => {
      fireEvent.click(phone());
    });
    expect(phone().getAttribute("aria-expanded")).toBe("false");
  });

  it("counter-5 — the opened arm focuses its input with a Go hint; closing hands focus back to the arm", async () => {
    const { phone, container } = mount();
    await act(async () => {
      fireEvent.click(phone());
    });
    const input = container.querySelector<HTMLInputElement>("#reg-phone-name")!;
    // MUTATION: drop `autoFocus` — focus stays on the arm and this reddens.
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("enterkeyhint")).toBe("go");
    await act(async () => {
      fireEvent.click(phone());
    });
    expect(container.querySelector("#reg-phone-name")).toBeNull();
    // MUTATION: drop `e.currentTarget.focus()` from the closing branch — focus is <body>.
    expect(document.activeElement).toBe(phone());
  });

  it("Codex r2 on #311 — a phone order's name typed and not started holds the reload for a new version, while its form is open", async () => {
    // MUTATION (p2i-draft/phone-name-unheld): no hold — the caller's name, typed while the cashier
    // writes the order on paper, is erased by the automatic reload; red.
    const { phone, container } = mount();
    const drafts = () => reloadHolds().filter((h) => h.reason === "draft");
    await act(async () => {
      fireEvent.click(phone());
    });
    expect(drafts()).toEqual([]);
    const input = container.querySelector<HTMLInputElement>("#reg-phone-name")!;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Aye" } });
      input.blur();
    });
    expect(drafts()).toEqual([
      expect.objectContaining({ kind: "unsent", subject: "phoneName", survives: false }),
    ]);
    // Closing the form puts the name away (nothing on screen says it is kept): the hold goes.
    await act(async () => {
      fireEvent.click(phone());
    });
    expect(drafts()).toEqual([]);
  });

  it("the Go button is §17 too — and `aria-busy` lands on the MINTING control only, never on Walk-up", async () => {
    const d = deferred<{ ok: false; error: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { walkup, phone, region, container } = mount();
    await act(async () => {
      fireEvent.click(phone());
    });
    const go = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    go.focus();
    await act(async () => {
      fireEvent.submit(go.closest("form")!);
    });
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "phone", customerName: undefined });
    expect(go.disabled).toBe(false);
    expect(go.getAttribute("aria-disabled")).toBe("true");
    expect(go.getAttribute("aria-busy")).toBe("true");
    expect(go.textContent).toContain(ts("en", "reg.going"));
    expect(walkup().getAttribute("aria-disabled")).toBe("true");
    expect(walkup().getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(go);
    await act(async () => {
      d.resolve({ ok: false, error: "Pick a table number." });
      await d.promise;
    });
    await settle();
    expect(region().textContent).toBe("Pick a table number.");
    expect(go.getAttribute("aria-disabled")).toBeNull();
    expect(go.getAttribute("aria-busy")).toBeNull();
    expect(go.textContent).toContain(ts("en", "reg.go"));
    expect(go.textContent).not.toContain(ts("en", "reg.going"));
    expect(document.activeElement).toBe(go);
    expect(phone().getAttribute("aria-expanded")).toBe("true");
  });

  it("a Walk-up mint beside an open form leaves that form's Go alone — no busy, no 'Starting…'", async () => {
    const d = deferred<{ ok: true; sessionId: string; created: boolean }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { walkup, phone, container } = mount();
    await act(async () => {
      fireEvent.click(phone());
    });
    const go = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => {
      fireEvent.click(walkup());
    });
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    expect(walkup().getAttribute("aria-busy")).toBe("true");
    expect(go.getAttribute("aria-disabled")).toBe("true");
    expect(go.getAttribute("aria-busy")).toBeNull();
    expect(go.textContent).toContain(ts("en", "reg.go"));
    expect(go.textContent).not.toContain(ts("en", "reg.going"));
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s4", created: true });
      await d.promise;
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s4/add");
  });

  it("Phase 2h (S2 critic D1) — a start still unanswered at the bound says so in the region, with the reload BESIDE it until the late answer lands", async () => {
    vi.useFakeTimers();
    try {
      const d = deferred<{ ok: false; error: string }>();
      openRegisterOrder.mockReturnValueOnce(d.promise);
      const { walkup, region, container } = mount();
      await act(async () => {
        fireEvent.click(walkup());
      });
      const reload = () =>
        [...container.querySelectorAll("button")].find((b) =>
          b.textContent?.includes(ts("en", "out.reload")),
        ) ?? null;
      expect(reload()).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
      });
      expect(region().textContent).toBe(ts("en", "floor.mint.waiting"));
      // MUTATION (p2h-doors/register-reload-missing): the line says "reload the page" on a console
      // installed standalone — no browser reload — and nothing on screen does it; red.
      expect(reload()).not.toBeNull();
      expect(region().contains(reload())).toBe(false); // beside the region, never inside it
      // Every start stays held while it waits (the copy says "don't start it again").
      expect(walkup().getAttribute("aria-disabled")).toBe("true");
      await act(async () => {
        d.resolve({ ok: false, error: "The counter is closed." });
        await d.promise;
      });
      expect(region().textContent).toBe("The counter is closed.");
      expect(reload()).toBeNull();
      expect(walkup().getAttribute("aria-disabled")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Phase 2h — a LATE start that lands clears the waiting line (it is no longer true)", async () => {
    vi.useFakeTimers();
    try {
      const d = deferred<{ ok: true; sessionId: string; created: boolean }>();
      openRegisterOrder.mockReturnValueOnce(d.promise);
      const { walkup, region } = mount();
      await act(async () => {
        fireEvent.click(walkup());
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
      });
      expect(region().textContent).toBe(ts("en", "floor.mint.waiting"));
      await act(async () => {
        d.resolve({ ok: true, sessionId: "s9", created: true });
        await d.promise;
      });
      expect(push).toHaveBeenCalledWith("/staff/table/s9/add");
      // MUTATION (p2h-doors/register-late-ok-keeps-waiting): "no answer yet — don't start it
      // again" stands over a start that went; red.
      expect(region().textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Phase 2h review c (C3) — opening or closing the Phone arm while a start waits keeps 'no answer yet' standing", async () => {
    vi.useFakeTimers();
    try {
      const d = deferred<{ ok: false; error: string }>();
      openRegisterOrder.mockReturnValueOnce(d.promise);
      const { walkup, phone, region } = mount();
      await act(async () => {
        fireEvent.click(walkup());
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
      });
      expect(region().textContent).toBe(ts("en", "floor.mint.waiting"));
      // MUTATION (p2h-rev-c/register-toggle-clears-waiting): the arm's pick wipes the line while
      // the start still waits — the reload stands alone and Go is dimmed with no reason given; red.
      await act(async () => {
        fireEvent.click(phone());
      });
      expect(phone().getAttribute("aria-expanded")).toBe("true");
      expect(region().textContent).toBe(ts("en", "floor.mint.waiting"));
      await act(async () => {
        fireEvent.click(phone());
      });
      expect(region().textContent).toBe(ts("en", "floor.mint.waiting"));
      await act(async () => {
        d.resolve({ ok: false, error: "The counter is closed." });
        await d.promise;
      });
      expect(region().textContent).toBe("The counter is closed.");
      // No start waiting: the pick clears the zone's last notice, as before.
      await act(async () => {
        fireEvent.click(phone());
      });
      expect(region().textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the zone throws without the screen's provider — a forgotten provider must not split the lock", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <StaffLangProvider lang="en">
          <RegisterStart />
        </StaffLangProvider>,
      ),
    ).toThrow(/CounterMintProvider/);
    err.mockRestore();
  });
});
