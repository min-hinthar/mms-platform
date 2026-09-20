/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setPin = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({
  setPin: (v: unknown) => setPin(v),
  removePin: vi.fn(),
}));
vi.mock("@mms/db", () => ({ browserClient: () => ({ auth: { signOut: vi.fn() } }) }));
const provisionStaff = vi.fn();
vi.mock("@/lib/staff-actions", () => ({
  provisionStaff: (v: unknown) => provisionStaff(v),
  setStaffActive: vi.fn(),
  setStaffRole: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const { ViewStatusProvider, useViewStatus } = await import("./ViewStatus");
const { SignedInCard } = await import("./SignedInCard");
const { TeamManager } = await import("./TeamManager");
const { StaffLangProvider } = await import("./StaffLangProvider");

/**
 * The view's ONE polite live region. What is worth pinning: one `role="status"` for any number of
 * cards, each card speaking through it; the newest line REPLACES the last (never appends); the
 * same words twice are a NEW node both times (a screen reader speaks a live region on DOM change,
 * and a refusal repeated verbatim is still news); `announce(null)` clears; a card with no provider
 * has no announcer and keeps its own region; and the two cards of the signed-in sign-in screen —
 * the case that made this exist — share one region between them.
 */
afterEach(cleanup);
beforeEach(() => {
  setPin.mockReset();
  provisionStaff.mockReset();
});

function Speaker({ id, text }: { id: string; text: string | null }) {
  const announce = useViewStatus();
  return (
    <button
      type="button"
      data-testid={id}
      data-has={announce ? "yes" : "no"}
      onClick={() => announce?.(text)}
    />
  );
}
const region = () => document.querySelector('[role="status"]')!;

describe("ViewStatusProvider", () => {
  it("one region, sr-only, at the END; the newest line replaces the last", () => {
    const { container } = render(
      <ViewStatusProvider>
        <Speaker id="a" text="A said" />
        <Speaker id="b" text="B said" />
      </ViewStatusProvider>,
    );
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
    expect(region().className).toBe("sr-only");
    expect(container.lastElementChild).toBe(region());
    expect(region().textContent).toBe("");
    fireEvent.click(screen.getByTestId("a"));
    expect(region().textContent).toBe("A said");
    fireEvent.click(screen.getByTestId("b"));
    expect(region().textContent).toBe("B said");
  });
  it("the same words twice are a NEW node both times, and null clears", () => {
    render(
      <ViewStatusProvider>
        <Speaker id="a" text="again" />
        <Speaker id="z" text={null} />
      </ViewStatusProvider>,
    );
    fireEvent.click(screen.getByTestId("a"));
    const first = region().firstElementChild;
    expect(first?.textContent).toBe("again");
    fireEvent.click(screen.getByTestId("a"));
    const second = region().firstElementChild;
    expect(second?.textContent).toBe("again");
    expect(second).not.toBe(first);
    fireEvent.click(screen.getByTestId("z"));
    expect(region().textContent).toBe("");
    expect(region().firstElementChild).toBeNull();
  });
  it("without a provider a card has no announcer — it keeps its own region", () => {
    render(<Speaker id="lone" text="x" />);
    expect(screen.getByTestId("lone").getAttribute("data-has")).toBe("no");
    expect(document.querySelector('[role="status"]')).toBeNull();
  });
  it("the signed-in sign-in screen: the card and the roster share ONE region, each showing its own echo", async () => {
    render(
      <StaffLangProvider lang="en">
        <ViewStatusProvider>
          <SignedInCard lang="en" hasPin={false} displayName="Daw Hla" email={null} />
          <TeamManager initial={[]} selfUid="u1" selfEmail={null} callerRole="manager" />
        </ViewStatusProvider>
      </StaffLangProvider>,
    );
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
    expect(document.querySelectorAll("[aria-live]").length).toBe(0);
    const echo = document.getElementById("me-msg")!;
    expect(echo.getAttribute("role")).toBeNull();
    expect(echo.getAttribute("aria-hidden")).toBe("true");
    // A PIN mismatch: the region speaks it, the card shows it.
    fireEvent.change(document.getElementById("pin-new")!, { target: { value: "1234" } });
    fireEvent.change(document.getElementById("pin-confirm")!, { target: { value: "9999" } });
    fireEvent.submit(document.getElementById("pin-new")!.closest("form")!);
    expect(region().textContent).toBe("Those PINs don’t match.");
    expect(echo.textContent).toBe("Those PINs don’t match.");
    expect(setPin).not.toHaveBeenCalled();
    // The roster's empty form: the SAME region speaks its refusal; the card's echo is untouched.
    fireEvent.submit(document.getElementById("ts-name")!.closest("form")!);
    expect(region().textContent).toBe("Enter their name.");
    expect(echo.textContent).toBe("Those PINs don’t match.");
    expect(provisionStaff).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
  });
});
