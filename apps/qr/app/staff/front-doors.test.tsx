/** @vitest-environment jsdom */
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The two front-door PAGES are async server components; their reads are mocked to a state each.
const auth = vi.fn();
vi.mock("@/lib/staff", () => ({
  getStaffAuth: () => auth(),
  roleAtLeast: () => false,
  listStaff: vi.fn(),
}));
vi.mock("@/lib/staff-lock", () => ({ isConsoleLocked: async () => lockedNow }));
vi.mock("@/lib/staff-pin", () => ({ staffHasPin: async () => true }));
vi.mock("@/lib/staff-lang-server", () => ({ readStaffLang: async () => "en" }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({
  lockConsole: vi.fn(),
  unlockConsole: vi.fn(),
  setPin: vi.fn(),
  removePin: vi.fn(),
  releaseLockAfterSignOut: vi.fn(),
}));
vi.mock("@/lib/staff-actions", () => ({
  provisionStaff: vi.fn(),
  setStaffActive: vi.fn(),
  setStaffRole: vi.fn(),
}));
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

let lockedNow = false;
const { default: LockPage } = await import("./lock/page");
const { default: LoginPage } = await import("./login/page");
const { StaffLangProvider } = await import("@/components/staff/StaffLangProvider");

const caller = {
  uid: "u1",
  staffId: "s1",
  role: "server",
  displayName: "Daw Hla",
  email: "hla@example.com",
};
const mount = (ui: ReactElement) =>
  render(<StaffLangProvider lang="en">{ui}</StaffLangProvider>).container;
const pills = (c: HTMLElement) => c.querySelectorAll(".staff-lang");

/**
 * P2e — the two front-door PAGES (the shell and the error screen have their own suites): each bar
 * carries exactly ONE two-script pill, in its tail, through the `trailing` slot; the signed-in
 * sign-in screen carries NONE in its bar and the Profile's language card beneath instead, focused
 * on the pressed mode when the doors' More tile brought the person (`?show=lang`). Statically,
 * `check-staff-lang` rule 4b holds all four doors to the pill; this renders two of them.
 */
afterEach(cleanup);
beforeEach(() => {
  auth.mockReset();
  lockedNow = false;
});

describe("P2e — the front doors keep the pill; the Profile carries the card", () => {
  it("/staff/lock: one pill, in the bar's tail", async () => {
    auth.mockResolvedValue({ kind: "staff", caller });
    lockedNow = true;
    const c = mount(await LockPage());
    expect(pills(c)).toHaveLength(1);
    expect(pills(c)[0]!.closest(".staff-bar-tail")).not.toBeNull();
  });

  it("/staff/login signed OUT: one pill, in the bar's tail", async () => {
    auth.mockResolvedValue({ kind: "anon" });
    const c = mount(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(pills(c)).toHaveLength(1);
    expect(pills(c)[0]!.closest(".staff-bar-tail")).not.toBeNull();
    expect(c.querySelector(".staff-lang-card")).toBeNull();
  });

  it("/staff/login signed IN: no pill in the bar, the language card after the person's own", async () => {
    auth.mockResolvedValue({ kind: "staff", caller });
    const c = mount(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(pills(c)).toHaveLength(0);
    const card = c.querySelector(".staff-lang-card")!;
    expect(card).not.toBeNull();
    const me = c.querySelector('[aria-labelledby="entry-h"]')!;
    expect(me.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(c.querySelector(".staff-lang-rows")?.getAttribute("aria-labelledby")).toBe("lang-h");
    // No focus claim without the param.
    expect(card.contains(document.activeElement)).toBe(false);
  });

  it("?show=lang lands focus on the PRESSED mode (a query param — never a #hash, §26)", async () => {
    auth.mockResolvedValue({ kind: "staff", caller });
    mount(await LoginPage({ searchParams: Promise.resolve({ show: "lang" }) }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "English" })),
    );
  });
});
