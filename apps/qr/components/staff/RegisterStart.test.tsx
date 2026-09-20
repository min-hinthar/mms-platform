/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Start zone's WIRING (counter-3 · counter-4 · counter-5), pinned where it lives — the rules
 * that only a render can show:
 *   - §17: a mint leaves every control `aria-disabled` (never natively disabled), the tapped arm
 *     keeps its label and its FOCUS through the round trip, a second tap in the same frame mints
 *     nothing, and a refusal lands in the ONE region with focus still on the arm;
 *   - counter-4: the arms wear `.staff-arm` + `.staff-press`, and the open one says so with
 *     `aria-expanded` — the attribute the shared lit-cap rule reads (`KdsBoard.test.tsx` pins the
 *     rule itself; `HelpPicture.test.tsx` pins the class as live);
 *   - counter-5: opening an arm focuses its input with a "go" hint and clears the other arm's notice.
 */
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
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
const { RegisterStart } = await import("./RegisterStart");
const { ts } = await import("@/lib/i18n/staff");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(lang: "en" | "my" = "en") {
  const utils = render(
    <StaffLangProvider lang={lang}>
      <RegisterStart />
    </StaffLangProvider>,
  );
  const arms = () =>
    [...utils.container.querySelectorAll("button.staff-arm")] as HTMLButtonElement[];
  const region = () => utils.container.querySelector('[role="status"]')!;
  return { ...utils, arms, region };
}

describe("RegisterStart — the Start zone's wiring", () => {
  it("§17 — a mint is aria-disabled, never native; the arm keeps its label and focus; a refusal lands in the region", async () => {
    const d = deferred<{ ok: false; error: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { arms, region } = mount();
    const walkup = arms()[0]!;
    walkup.focus();
    await act(async () => {
      fireEvent.click(walkup);
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    expect(haptic).toHaveBeenCalledWith("commit");
    // MUTATION: `disabled={pending}` on any arm — `disabled` reads true and this reddens.
    for (const b of arms()) {
      expect(b.disabled).toBe(false);
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    expect(walkup.getAttribute("aria-busy")).toBe("true");
    expect(walkup.textContent).toContain(ts("en", "reg.start.walkup"));
    expect(document.activeElement).toBe(walkup);
    // A second tap while the first is in flight mints nothing.
    await act(async () => {
      fireEvent.click(walkup);
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: false, error: "Pick a table number." });
      await d.promise;
    });
    expect(region().textContent).toBe("Pick a table number.");
    expect(walkup.getAttribute("aria-disabled")).toBeNull();
    expect(walkup.getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(walkup);
    // …and the zone is live again: the next tap mints — and a LANDED mint holds the zone until the
    // route swap unmounts it: a third tap in that beat mints nothing.
    openRegisterOrder.mockResolvedValueOnce({ ok: true, sessionId: "s2" });
    await act(async () => {
      fireEvent.click(walkup);
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/staff/table/s2/add");
    // MUTATION: release `inFlight`/`minting` in `finally` unconditionally — the third tap mints.
    for (const b of arms()) expect(b.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(walkup);
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });

  it("two taps in ONE frame mint one order — the ref guard, before `pending` has committed", async () => {
    const d = deferred<{ ok: true; sessionId: string }>();
    openRegisterOrder.mockReturnValue(d.promise);
    const { arms } = mount();
    const walkup = arms()[0]!;
    await act(async () => {
      fireEvent.click(walkup);
      fireEvent.click(walkup);
    });
    // MUTATION: drop `inFlight` and gate on `pending` alone — both taps read false, two mints.
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s1" });
      await d.promise;
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/staff/table/s1/add");
  });

  it("counter-4 — the three arms wear the zone's class and the press; the open one carries aria-expanded", async () => {
    const { arms } = mount();
    expect(arms()).toHaveLength(3);
    for (const b of arms()) expect(b.classList.contains("staff-press")).toBe(true);
    const [walkup, phone, table] = arms();
    expect(walkup!.hasAttribute("aria-expanded")).toBe(false); // Walk-up opens nothing
    expect(phone!.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(phone!);
    });
    expect(phone!.getAttribute("aria-expanded")).toBe("true");
    expect(table!.getAttribute("aria-expanded")).toBe("false");
    expect(haptic).toHaveBeenCalledWith("pick");
    // Tapping the open arm closes it.
    await act(async () => {
      fireEvent.click(phone!);
    });
    expect(phone!.getAttribute("aria-expanded")).toBe("false");
  });

  it("counter-5 — an opened arm focuses its input with a Go hint, and the other arm's notice leaves with it", async () => {
    const { arms, region, container } = mount();
    const [, phone, table] = arms();
    await act(async () => {
      fireEvent.click(table!);
    });
    const tableInput = container.querySelector<HTMLInputElement>("#reg-table-number")!;
    // MUTATION: drop `autoFocus` — focus stays on the arm and this reddens.
    expect(document.activeElement).toBe(tableInput);
    expect(tableInput.getAttribute("enterkeyhint")).toBe("go");
    // An empty submit is the arm's own refusal — no server call.
    await act(async () => {
      fireEvent.submit(tableInput.closest("form")!);
    });
    expect(region().textContent).toBe(ts("en", "reg.err.table"));
    expect(openRegisterOrder).not.toHaveBeenCalled();
    // Switching arms takes the refusal with it and lands focus in the phone field.
    await act(async () => {
      fireEvent.click(phone!);
    });
    // MUTATION: drop `setNotice(null)` from `toggle` — the table refusal reads under the phone form.
    expect(region().textContent).toBe("");
    const phoneInput = container.querySelector<HTMLInputElement>("#reg-phone-name")!;
    expect(document.activeElement).toBe(phoneInput);
    expect(phoneInput.getAttribute("enterkeyhint")).toBe("go");
    expect(container.querySelector("#reg-table-number")).toBeNull();
  });

  it("the Go button is §17 too — and `aria-busy` lands on the MINTING control only, never on Walk-up", async () => {
    const d = deferred<{ ok: false; error: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { arms, region, container } = mount();
    await act(async () => {
      fireEvent.click(arms()[1]!);
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
    // The zone is held, but only the form that went is BUSY — the blind pass caught a draft that
    // stamped Walk-up `aria-busy` (and "Going…" on a form nobody submitted) for any mint.
    // MUTATION: `aria-busy={pending || undefined}` on Walk-up — this reddens.
    const walkup = arms()[0]!;
    expect(walkup.getAttribute("aria-disabled")).toBe("true");
    expect(walkup.getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(go);
    await act(async () => {
      d.resolve({ ok: false, error: "Pick a table number." });
      await d.promise;
    });
    // A refusal re-arms the Go button with its focus and its label intact.
    expect(region().textContent).toBe("Pick a table number.");
    expect(go.getAttribute("aria-disabled")).toBeNull();
    expect(go.getAttribute("aria-busy")).toBeNull();
    expect(go.textContent).toContain(ts("en", "reg.go"));
    expect(go.textContent).not.toContain(ts("en", "reg.going"));
    expect(document.activeElement).toBe(go);
  });

  it("a Walk-up mint beside an open form leaves that form's Go alone — no busy, no 'Going…'", async () => {
    const d = deferred<{ ok: true; sessionId: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { arms, container } = mount();
    await act(async () => {
      fireEvent.click(arms()[1]!);
    });
    const go = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => {
      fireEvent.click(arms()[0]!);
    });
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    expect(arms()[0]!.getAttribute("aria-busy")).toBe("true");
    // MUTATION: `k={pending ? "reg.going" : "reg.go"}` — the phone form says "Going…" and reddens.
    expect(go.getAttribute("aria-disabled")).toBe("true");
    expect(go.getAttribute("aria-busy")).toBeNull();
    expect(go.textContent).toContain(ts("en", "reg.go"));
    expect(go.textContent).not.toContain(ts("en", "reg.going"));
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s4" });
      await d.promise;
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s4/add");
  });

  it("closing an open arm hands focus back to the arm — WebKit does not focus a tapped button, and the form that held focus unmounts", async () => {
    const { arms, container } = mount();
    const table = arms()[2]!;
    await act(async () => {
      fireEvent.click(table);
    });
    expect(document.activeElement).toBe(container.querySelector("#reg-table-number"));
    await act(async () => {
      fireEvent.click(table);
    });
    expect(container.querySelector("#reg-table-number")).toBeNull();
    // MUTATION: drop `e.currentTarget.focus()` from the closing branch — focus is <body>.
    expect(document.activeElement).toBe(table);
    expect(table.getAttribute("aria-expanded")).toBe("false");
  });
});
