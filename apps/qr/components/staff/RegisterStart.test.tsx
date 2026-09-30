/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
