/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_HANG_MS } from "@/lib/bounded-write";

const lockConsole = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: () => lockConsole() }));
const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (m: string) => haptic(m) }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { LockButton } = await import("./LockButton");
const { StaffBar } = await import("./StaffBar");

/**
 * signin-3 · chrome-1 — the Lock circle. What is worth pinning: busy is SPOKEN through the name and
 * never native `disabled` (focus stays on the circle a person just tapped); a second tap while the
 * first is held posts nothing; a refusal is a dictionary KEY — Burmese under the Burmese switch —
 * rendered in the bar's own line beneath the tail, never a sibling between two circles; an outage
 * (refused or thrown) says so and releases the circle; a gone session re-gates instead of
 * explaining; and the circle wears the console's press idiom and buzzes a commit.
 */
afterEach(cleanup);
beforeEach(() => {
  lockConsole.mockReset();
  haptic.mockReset();
  replace.mockReset();
  refresh.mockReset();
  lockConsole.mockResolvedValue({ ok: true });
});

const circle = () => screen.getByRole("button", { name: /Lock this tablet|Locking…/ });
/** Every `@media <query> { … }` block's body, brace-walked (a block holds nested rules). */
function mediaBlocks(css: string, query: string): string[] {
  const out: string[] = [];
  let i = css.indexOf(query);
  while (i !== -1) {
    const open = css.indexOf("{", i);
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    out.push(css.slice(open + 1, j));
    i = css.indexOf(query, j);
  }
  return out;
}

describe("LockButton", () => {
  it("speaks busy through its name, is never natively disabled, refuses a second tap while held, then locks", async () => {
    let settle!: (v: unknown) => void;
    lockConsole.mockReturnValue(new Promise((r) => (settle = r)));
    render(<LockButton lang="en" />);
    const b = circle();
    b.focus();
    fireEvent.click(b);
    expect(lockConsole).toHaveBeenCalledTimes(1);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Locking…" })).toBe(b);
    expect(document.activeElement).toBe(b);
    fireEvent.click(b); // held — refused by the handler, not by the DOM
    expect(lockConsole).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/lock"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1); // one commit per ACCEPTED tap, none for the refused one
    expect(haptic).toHaveBeenCalledWith("commit");
  });

  it("a `no_pin` answer is the dictionary's — Burmese under the Burmese switch — in the bar's line beneath the tail, and the circle is live again", async () => {
    lockConsole.mockResolvedValue({ ok: false, reason: "no_pin" });
    const { container } = render(<StaffBar lang="my" title="kds.title" lock />);
    const b = screen.getByRole("button", { name: STAFF["shell.lock"].my });
    fireEvent.click(b);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(STAFF["shell.lock.err.noPin"].my);
    expect(alert.textContent).not.toContain("Set a PIN"); // no English echo inside a live region
    expect(alert.querySelector('[lang="my"]')).not.toBeNull();
    expect(alert.className).toBe("staff-bar-msg");
    // A CHILD of the tail (the rule below keys on that), never a sibling of the circles' row.
    expect(alert.parentElement).toBe(container.querySelector(".staff-bar-tail"));
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect(b.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(b);
    expect(lockConsole).toHaveBeenCalledTimes(2);
  });

  it("an outage — refused — says the outage key and releases the circle", async () => {
    lockConsole.mockResolvedValue({ ok: false, reason: "outage" });
    render(<LockButton lang="en" />);
    fireEvent.click(circle());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(STAFF["shell.lock.err.outage"].en);
    expect(circle().getAttribute("aria-busy")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: STAFF["out.reload"].en })).toBeNull();
    fireEvent.click(circle());
    expect(lockConsole).toHaveBeenCalledTimes(2);
  });

  it("a THROWN lock says it couldn't CONFIRM the lock — never blames the sign-in service — offers the reload and releases the circle", async () => {
    lockConsole.mockRejectedValue(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LockButton lang="en" />);
    fireEvent.click(circle());
    const alert = await screen.findByRole("alert");
    // MUTATION (p2h-doors/lock-threw-blames-the-sign-in): the action's own `outage` sentence ("we
    // can't reach the sign-in service — the tablet wasn't locked"), false for a lost answer — the
    // lock cookie may already be set (critic F10); red.
    expect(alert.textContent).toContain(STAFF["shell.lock.unknown"].en);
    expect(alert.textContent).not.toContain(STAFF["shell.lock.err.outage"].en);
    // MUTATION (p2h-doors/lock-reload-missing): "reload the page before you leave it" with no
    // reload on a standalone console; red.
    const reload = screen.getByRole("button", { name: STAFF["out.reload"].en });
    expect(alert.contains(reload)).toBe(false);
    expect(circle().getAttribute("aria-busy")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(circle());
    expect(lockConsole).toHaveBeenCalledTimes(2);
  });

  it("a gone session (`auth`) re-gates the page instead of explaining from a bar circle", async () => {
    lockConsole.mockResolvedValue({ ok: false, reason: "auth" });
    render(<LockButton lang="en" />);
    fireEvent.click(circle());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(circle().getAttribute("aria-busy")).toBeNull();
  });

  it("wears the press idiom like every other bar circle", () => {
    render(<LockButton lang="en" />);
    expect(circle().className).toBe("staff-circ staff-press");
  });

  it("two taps in ONE frame post once — the latch is a ref, not a render-lagged flag", () => {
    lockConsole.mockReturnValue(new Promise(() => {}));
    render(<LockButton lang="en" />);
    const b = circle();
    // One act: React batches the state the first tap sets, so the second tap reads the SAME render.
    act(() => {
      b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(lockConsole).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1);
  });
});

describe("the refusal line's CSS", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  it("takes the tail's full width beneath the utilities row, ordered last — a child rule, matching the DOM above", () => {
    const rule = css.match(/\.staff-bar-tail > \.staff-bar-msg\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/flex-basis:\s*100%/);
    expect(rule![1]).toMatch(/order:\s*[1-9]/);
  });
  it("on a phone, where the tail is nowrap, a tail that HOLDS the line wraps it beneath the circles — in that same block", () => {
    // The blind pass: R1's `flex-wrap: nowrap` on the tail at ≤720px kept a 100%-basis child on the
    // circles' row, pushing them left under the thumb. The wrap is granted only to a tail holding
    // the line, and it must live INSIDE the block that sets nowrap, or the cascade decides by order.
    const phone = mediaBlocks(css, "@media (max-width: 720px)").find((b) =>
      /(^|\s)\.staff-bar-tail\s*\{[^}]*flex-wrap:\s*nowrap/.test(b),
    );
    expect(phone).toBeDefined();
    const has = phone!.match(/\.staff-bar-tail:has\(> \.staff-bar-msg\)\s*\{([^}]*)\}/);
    expect(has).not.toBeNull();
    expect(has![1]).toMatch(/flex-wrap:\s*wrap/);
    expect(phone!).toMatch(/\.staff-bar-tail > \.staff-bar-msg\s*\{[^}]*max-width:/);
  });
});

describe("LockButton — Phase 2h: the lock is bounded (9g)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("no answer at the bound: the circle frees and says the tablet may NOT be locked, with the reload — and a LATE lock still goes to the lock screen", async () => {
    let settle!: (v: unknown) => void;
    lockConsole.mockReturnValue(new Promise((r) => (settle = r)));
    render(<LockButton lang="en" />);
    const b = circle();
    await act(async () => {
      fireEvent.click(b);
    });
    await flush(STAFF_HANG_MS - 1);
    expect(b.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-doors/lock-unbounded): the bound never fires — "Locking…" forever while the
    // tablet stays OPEN, the one fact that matters on a shared device; red.
    await flush(1);
    expect(b.getAttribute("aria-busy")).toBeNull();
    // MUTATION (p2h-doors/lock-waiting-unsaid): said as "couldn't confirm"; red.
    expect(screen.getByRole("alert").textContent).toContain(STAFF["shell.lock.waiting"].en);
    expect(screen.getByRole("button", { name: STAFF["out.reload"].en })).toBeTruthy();
    // MUTATION (p2h-doors/lock-late-ok-dropped): the late answer is dropped — the tablet IS locked
    // (the cookie is set) and the bar stays up as if it were not; red.
    await act(async () => settle({ ok: true }));
    expect(replace).toHaveBeenCalledWith("/staff/lock");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: STAFF["out.reload"].en })).toBeNull();
  });

  it("a LATE throw says the lock couldn't be confirmed — the reload stays", async () => {
    let fail!: (e: Error) => void;
    lockConsole.mockReturnValue(new Promise((_r, j) => (fail = j)));
    render(<LockButton lang="en" />);
    await act(async () => {
      fireEvent.click(circle());
    });
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toContain(STAFF["shell.lock.waiting"].en);
    // MUTATION (p2h-doors/lock-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toContain(STAFF["shell.lock.unknown"].en);
    expect(screen.getByRole("button", { name: STAFF["out.reload"].en })).toBeTruthy();
    // The answer is in (lost): the circle is live again — a tap sends.
    expect(circle().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(circle());
    });
    expect(lockConsole).toHaveBeenCalledTimes(2);
  });

  // ── Codex round 3 on #310 — the bound frees the circle, never the action: Next keeps the raw lock
  // in the tab's queue, so until its answer no second lock goes.
  it("past the bound NO second lock goes: a re-tap re-says the waiting line and sends nothing; the late answer frees the circle", async () => {
    let settle!: (v: unknown) => void;
    lockConsole.mockReturnValueOnce(new Promise((r) => (settle = r)));
    render(<LockButton lang="en" />);
    await act(async () => {
      fireEvent.click(circle());
    });
    await flush(STAFF_HANG_MS);
    const b = circle();
    expect(b.getAttribute("aria-busy")).toBeNull();
    // MUTATION (p2h-cx3/lock-guard-freed-at-bound): the bound frees the guard with busy — a re-tap
    // queues a second lock behind the hung one; red.
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    const before = screen.getByRole("alert").firstChild;
    await act(async () => {
      fireEvent.click(b);
    });
    expect(lockConsole).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1); // no commit buzz for a tap that sent nothing
    // MUTATION (p2h-cx3/lock-held-tap-silent): the refused re-tap says nothing new — equal text into
    // the same node is no change at all, so the tap reads as dead; red.
    expect(screen.getByRole("alert").firstChild).not.toBe(before);
    expect(screen.getByRole("alert").textContent).toContain(STAFF["shell.lock.waiting"].en);
    // A late refusal: the answer is in, the circle is live again and a tap sends.
    await act(async () => settle({ ok: false, reason: "no_pin" }));
    expect(b.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(STAFF["shell.lock.err.noPin"].en);
    lockConsole.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(b);
    });
    // MUTATION (p2h-cx3/lock-guard-never-freed): the late answer never frees the guard — the circle
    // is dead until a reload; red.
    expect(lockConsole).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith("/staff/lock");
  });
});
