/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

const provisionStaff = vi.fn();
const setStaffActive = vi.fn();
const setStaffRole = vi.fn();
vi.mock("@/lib/staff-actions", () => ({
  provisionStaff: (v: unknown) => provisionStaff(v),
  setStaffActive: (v: unknown) => setStaffActive(v),
  setStaffRole: (v: unknown) => setStaffRole(v),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ViewStatusProvider } = await import("./ViewStatus");
const { TeamManager } = await import("./TeamManager");

/**
 * A4·4 — the roster is a ZONE of the sign-in screen, and two things changed with the move: a
 * failed read prints one honest line under the zone's heading (never an empty roster, never the
 * error boundary — the person's own card is above it), and the heading takes focus on arrival at
 * `#team-h` and on a same-page jump (WCAG 2.4.3 — a fragment scrolls but does not move focus).
 *
 * signin-2 · signin-4 (§17) — nothing is natively `disabled`: the submit, the role select and the
 * toggle keep their name and their focus through a write (busy is the attribute + the dim), a
 * second tap while one is held posts nothing, the two refusals the form can explain are SAID with
 * focus on the field at fault, the toggle's LABEL survives the round trip (never "…"), an inactive
 * member is marked by ink and never by dimming the row, the fields sit on the `--fs-field` floor,
 * and under a view announcer the zone speaks through the view's ONE region.
 */
afterEach(() => {
  cleanup();
  window.location.hash = "";
});
beforeEach(() => {
  provisionStaff.mockReset();
  setStaffActive.mockReset();
  setStaffRole.mockReset();
  refresh.mockReset();
  provisionStaff.mockResolvedValue({ ok: true });
  setStaffActive.mockResolvedValue({ ok: true });
  setStaffRole.mockResolvedValue({ ok: true });
});

const ROW = {
  userId: "u2",
  role: "server" as const,
  displayName: "Ko Ko",
  email: "koko@example.com",
  active: true,
  createdAt: "2026-09-01T00:00:00Z",
};
const INACTIVE = {
  ...ROW,
  userId: "u3",
  displayName: "Ma Ma",
  email: "mama@example.com",
  active: false,
};
/** A row this manager cannot reach (A6): the controls give way to the dash. */
const OWNER = {
  ...ROW,
  userId: "u4",
  displayName: "U Ba",
  email: "uba@example.com",
  role: "owner" as const,
};
const mount = (initial: (typeof ROW)[] | null) =>
  render(
    <StaffLangProvider lang="en">
      <TeamManager initial={initial} selfUid="u1" selfEmail="me@example.com" callerRole="manager" />
    </StaffLangProvider>,
  );
const form = () => document.getElementById("ts-name")!.closest("form")!;
const submitBtn = () => screen.getByRole("button", { name: /Add staff|Adding…/ });
const fill = (name: string, email: string) => {
  fireEvent.change(document.getElementById("ts-name")!, { target: { value: name } });
  fireEvent.change(document.getElementById("ts-email")!, { target: { value: email } });
};
const region = () => document.querySelector('[role="status"]')!;
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("TeamManager as the sign-in screen's roster zone", () => {
  it("is a zone named by its own heading, with the roster and the add form when the read succeeded", () => {
    mount([ROW]);
    const zone = screen.getByRole("region", { name: "Team" });
    expect(zone.querySelector("#team-h")?.textContent).toBe("Team");
    expect(screen.getByRole("list", { name: "Staff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();
    expect(screen.getByText("Ko Ko")).toBeTruthy();
  });

  it("a FAILED read (null) prints the outage line — no form, no list — and promises nothing about the card above", () => {
    mount(null);
    expect(screen.getByRole("region", { name: "Team" })).toBeTruthy();
    expect(
      screen.getByText(
        "We can’t reach the ordering system — the roster can’t load right now. Try again in a moment.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
    expect(document.querySelectorAll('[role="status"]').length).toBe(0);
  });

  it("takes focus on the heading when it arrives at #team-h, and again on a same-page jump", async () => {
    window.location.hash = "#team-h";
    mount([ROW]);
    const h2 = document.getElementById("team-h")!;
    expect(document.activeElement).toBe(h2);
    (document.querySelector("#ts-name") as HTMLElement).focus();
    expect(document.activeElement).not.toBe(h2);
    await act(async () => {
      window.location.hash = "#other";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement).not.toBe(h2); // another fragment is not ours
    await act(async () => {
      window.location.hash = "#team-h";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement).toBe(h2);
  });

  it("does NOT steal focus when the page was opened without the fragment", () => {
    mount([ROW]);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("§17 on the roster's three controls", () => {
  it("a missing name, then a missing address, is SAID with focus on the field — the submit is never greyed for it", () => {
    mount([ROW]);
    expect(submitBtn().hasAttribute("disabled")).toBe(false);
    expect(submitBtn().getAttribute("aria-disabled")).toBeNull();
    expect(form().hasAttribute("novalidate")).toBe(true);
    fireEvent.submit(form());
    expect(region().textContent).toBe(STAFF["floor.team.err.name"].en);
    expect(document.activeElement).toBe(document.getElementById("ts-name"));
    fill("Daw Hla", "hl");
    fireEvent.submit(form());
    expect(region().textContent).toBe(STAFF["floor.team.err.email"].en);
    expect(document.activeElement).toBe(document.getElementById("ts-email"));
    expect(provisionStaff).not.toHaveBeenCalled();
    expect(submitBtn().getAttribute("aria-disabled")).toBeNull();
  });

  it("the submit is aria-disabled (never native) while the write is held, keeps focus, refuses a second submit, and releases on a THROW with the pair kept", async () => {
    let reject!: (e: unknown) => void;
    provisionStaff.mockReturnValue(new Promise((_, r) => (reject = r)));
    mount([ROW]);
    fill("Daw Hla", "hla@example.com");
    const b = submitBtn();
    b.focus();
    fireEvent.submit(form());
    expect(provisionStaff).toHaveBeenCalledTimes(1);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    expect(b.textContent).toBe("Adding…");
    expect(b.className).toBe("entry-primary staff-press");
    expect(document.activeElement).toBe(b);
    fireEvent.submit(form()); // held — refused by the handler
    expect(provisionStaff).toHaveBeenCalledTimes(1);
    reject(new Error("fetch failed"));
    await waitFor(() => expect(region().textContent).toBe(STAFF_WRITE_OUTAGE));
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect((document.getElementById("ts-name") as HTMLInputElement).value).toBe("Daw Hla");
    fireEvent.submit(form()); // live again
    expect(provisionStaff).toHaveBeenCalledTimes(2);
  });

  it("a refused add prints the server's sentence; a landed one says so and refreshes", async () => {
    provisionStaff.mockResolvedValueOnce({ ok: false, error: "That address already has a login." });
    mount([ROW]);
    fill("Daw Hla", "hla@example.com");
    fireEvent.submit(form());
    await waitFor(() => expect(region().textContent).toBe("That address already has a login."));
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.submit(form());
    await waitFor(() => expect(region().textContent).toBe(STAFF["floor.team.added"].en));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((document.getElementById("ts-name") as HTMLInputElement).value).toBe("");
  });

  it("the role select stays focusable and named while its write is held, refuses a second change, and never goes native", async () => {
    let settle!: (v: unknown) => void;
    setStaffRole.mockReturnValue(new Promise((r) => (settle = r)));
    mount([ROW]);
    const select = screen.getByRole("combobox", { name: "Ko Ko" }) as HTMLSelectElement;
    select.focus();
    fireEvent.change(select, { target: { value: "manager" } });
    expect(setStaffRole).toHaveBeenCalledWith({ userId: "u2", role: "manager" });
    expect(select.getAttribute("aria-busy")).toBe("true");
    expect(select.getAttribute("aria-disabled")).toBe("true");
    expect(select.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(select);
    fireEvent.change(select, { target: { value: "manager" } }); // held — refused
    expect(setStaffRole).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(region().textContent).toBe(STAFF["floor.team.roleChanged"].en));
    expect(select.getAttribute("aria-busy")).toBeNull();
    expect(select.getAttribute("aria-disabled")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the toggle keeps its LABEL through the round trip — busy is the attribute and the dim, never '…'", async () => {
    let settle!: (v: unknown) => void;
    setStaffActive.mockReturnValue(new Promise((r) => (settle = r)));
    mount([ROW]);
    const b = screen.getByRole("button", { name: "Deactivate — Ko Ko" });
    b.focus();
    fireEvent.click(b);
    expect(setStaffActive).toHaveBeenCalledWith({ userId: "u2", active: false });
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    expect(b.textContent).toBe("Deactivate");
    expect(b.className).toContain("staff-press");
    expect(document.activeElement).toBe(b);
    fireEvent.click(b); // held
    expect(setStaffActive).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(b.getAttribute("aria-busy")).toBeNull();
  });

  it("an inactive member is marked by INK and a tag, never by dimming the row — the Reactivate control is at full contrast", () => {
    const { container } = mount([INACTIVE]);
    const row = container.querySelector("li.team-row")!;
    expect(row.getAttribute("data-inactive")).toBe("true");
    expect((row as HTMLElement).style.opacity).toBe("");
    expect(screen.getByText("Inactive").className).toContain("team-tag-warn");
    const b = screen.getByRole("button", { name: "Reactivate — Ma Ma" });
    expect(b.getAttribute("aria-disabled")).toBeNull();
    // The rule that marks the row touches INK on the two identity lines and declares no opacity —
    // and no rule on the row itself does either.
    const ink = css.match(
      /\.team-row\[data-inactive="true"\] \.team-name,\s*\.team-row\[data-inactive="true"\] \.team-email\s*\{([^}]*)\}/,
    );
    expect(ink).not.toBeNull();
    expect(ink![1]).toMatch(/color:\s*var\(--t3\)/);
    expect(ink![1]).not.toMatch(/opacity/);
    for (const m of css.matchAll(/\.team-row[^{,]*\{([^}]*)\}/g))
      expect(m[1], m[0]).not.toMatch(/opacity/);
  });

  it("under a view announcer the zone shows its line as an echo and speaks through the view's ONE region", () => {
    render(
      <StaffLangProvider lang="en">
        <ViewStatusProvider>
          <TeamManager initial={[ROW]} selfUid="u1" selfEmail={null} callerRole="manager" />
        </ViewStatusProvider>
      </StaffLangProvider>,
    );
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
    const echo = document.querySelector(".team-msg")!;
    expect(echo.getAttribute("role")).toBeNull();
    expect(echo.getAttribute("aria-hidden")).toBe("true");
    fireEvent.submit(form());
    expect(region().textContent).toBe(STAFF["floor.team.err.name"].en);
    expect(echo.textContent).toBe(STAFF["floor.team.err.name"].en);
    expect(echo.className).toContain("entry-msg-warn");
  });
});

/**
 * signin-4 · M78 — the fields sit on `--fs-field`, the token pinned at the 16px floor iOS Safari
 * zooms beneath, so the floor is a RULE rather than four coincidences; and every selector this
 * sheet writes for the roster matches the DOM the roster renders (LEARNINGS #101 — dead CSS is a
 * control at the wrong size), through jsdom's own selector engine.
 */
describe("the roster's CSS", () => {
  it("every staff field reads --fs-field, and the token is pinned at the 16px floor", () => {
    const tokens = readFileSync(
      join(__dirname, "../../../../packages/ui/src/tokens.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const root = tokens.match(/:root\s*\{([^}]*)\}/);
    expect(root?.[1]).toMatch(/--fs-field:\s*max\(1rem,\s*var\(--fs-body\)\)/);
    for (const sel of [".team-field", ".team-role", ".entry-input", ".help-report-field"]) {
      const rule = css.match(
        new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\$&")}\\s*\\{([^}]*)\\}`),
      );
      expect(rule, sel).not.toBeNull();
      expect(rule![1], sel).toMatch(/font-size:\s*var\(--fs-field\)/);
    }
  });
  const selectors = [...css.matchAll(/([^{}]*\.team-[a-z-]+[^{}]*)\{/g)]
    .flatMap((m) => m[1]!.split(","))
    .map((s) => s.trim())
    .filter((s) => s.includes(".team-"));
  it("names at least the form, the fields, the row, the identity lines and the two controls", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(12);
  });
  it.each(selectors)("%s matches the rendered roster", (selector) => {
    // Every write held at once, so the busy-state selectors have a DOM to match: a role change on
    // one row, a toggle on the other; one active member, one inactive, one the caller cannot reach.
    setStaffRole.mockReturnValue(new Promise(() => {}));
    setStaffActive.mockReturnValue(new Promise(() => {}));
    const { container } = mount([ROW, INACTIVE, OWNER]);
    fireEvent.change(screen.getByRole("combobox", { name: "Ko Ko" }), {
      target: { value: "manager" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reactivate — Ma Ma" }));
    expect(container.querySelector(selector), selector).not.toBeNull();
  });
});
