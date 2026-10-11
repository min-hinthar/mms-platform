/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import {
  DINER_GUIDE_ARM_MS,
  DINER_GUIDE_KEY,
  GUIDE_COPY,
  GUIDE_FILLING_ID,
  GUIDE_WORDS,
} from "@/lib/diner-guide";

const capture = vi.fn();
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => capture(...a) } }));
const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));

const { DinerGuide, DinerGuideDoor } = await import("./DinerGuide");

/**
 * PD11 — the guide's WIRING (T18): what only a render shows. The rules are pure and pinned in
 * `lib/diner-guide.test.ts`; this suite proves the dialog reaches them: one dialog, ONE live region
 * (silent on open, each page said once), focus staying on the pressed control (and handed to Next
 * when Back goes inert), every guide control through the arm after the open AND after every page
 * change, one foot that never moves, each motion once, page 4 exactly the parked strings, and every
 * exit reported.
 */
let clock = 1_000_000;
beforeEach(() => {
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  capture.mockReset();
  haptic.mockReset();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
/** Let the page's controls arm. */
const armed = () => {
  clock += DINER_GUIDE_ARM_MS;
};
const dialog = () => screen.getByRole("dialog");
/** The dock's primary — Next, or the last page's "Browse the menu" / "Close" (the same element). */
const next = () => dialog().querySelector<HTMLButtonElement>(".diner-guide-dock .ui-btn-primary")!;
const back = () => dialog().querySelector<HTMLButtonElement>(".diner-guide-back")!;
const region = () => dialog().querySelector('[role="status"]')!;
const heading = () => within(dialog()).getByRole("heading", { level: 3 });
const stage = () => within(dialog()).getByRole("img");
const step = (n: number) =>
  within(dialog()).getByRole("button", { name: `Step ${n} of 5` }) as HTMLButtonElement;
const goNext = () => {
  armed();
  fireEvent.click(next());
};

function Guide(props: Partial<Parameters<typeof DinerGuide>[0]>) {
  return (
    <DinerGuide
      open
      onOpenChange={() => {}}
      source="auto"
      tableNumber={7}
      role="guest"
      atCap={false}
      {...props}
    />
  );
}

describe("DinerGuide — one dialog, five pages", () => {
  it("is a full-screen dialog named 'How it works', with ONE live region, silent on open", () => {
    render(<Guide />);
    const d = dialog();
    expect(d.textContent).toContain(GUIDE_COPY.frame);
    expect(
      d.querySelector(".mms-sheet-full.diner-guide, .diner-guide.mms-sheet-full") ??
        d.closest(".mms-sheet-full"),
    ).not.toBeNull();
    const live = d.querySelectorAll('[role="status"], [role="alert"], [aria-live]');
    expect(live).toHaveLength(1);
    expect(region().textContent).toBe("");
    expect(capture).toHaveBeenCalledWith("guide_opened", { source: "auto" });
  });

  it("page 1: the greeting in both tongues, the REAL table's pass (inert, hidden), the Invite line", () => {
    render(<Guide />);
    expect(heading().textContent).toBe("Mingalaba✦မင်္ဂလာပါ");
    expect(heading().querySelector('[lang="my"]')!.textContent).toBe("မင်္ဂလာပါ");
    expect(stage().getAttribute("aria-label")).toBe("Your table’s pass: Table 7");
    const pass = stage().querySelector(".ui-pass")!;
    expect(pass.hasAttribute("inert")).toBe(true);
    expect(pass.getAttribute("aria-hidden")).toBe("true");
    expect(pass.textContent).toContain("7");
    expect(dialog().textContent).toContain(GUIDE_COPY.invite.en);
  });

  it("at the party cap page 1 says nothing about Invite (the row says 'Table’s full')", () => {
    render(<Guide atCap />);
    expect(dialog().textContent).toContain(GUIDE_COPY.shared.en);
    expect(dialog().textContent).not.toMatch(/Invite/);
  });

  it("the ✕ is named 'Close the guide' with the one dismiss word", () => {
    render(<Guide />);
    const x = within(dialog()).getByRole("button", { name: /^Close the guide/ });
    expect(x.querySelector('[lang="my"]')!.textContent).toBe("ပိတ်");
  });
});

describe("the arm and the foot (Codex round 3 E1; the critic's B9)", () => {
  it("every guide control waits for the arm after the open AND after every page change", () => {
    render(<Guide />);
    fireEvent.click(next()); // the opening tap's echo
    expect(heading().textContent).toContain("Mingalaba");
    armed();
    fireEvent.click(next());
    expect(heading().textContent).toContain(DINER_GUIDE_WORDS_NOT_SENT);
    fireEvent.click(next()); // a double-tap's second half, inside the new page's arm
    expect(heading().textContent).toContain(DINER_GUIDE_WORDS_NOT_SENT);
    fireEvent.click(step(3)); // a dot too
    expect(heading().textContent).toContain(DINER_GUIDE_WORDS_NOT_SENT);
  });

  it("a press that BEGAN before the arm never counts, even released after it", () => {
    render(<Guide />);
    fireEvent.pointerDown(next());
    armed();
    fireEvent.click(next(), { detail: 1 });
    expect(heading().textContent).toContain("Mingalaba");
    // A keyboard press (detail 0) after the arm counts.
    fireEvent.click(next(), { detail: 0 });
    expect(heading().textContent).toContain(DINER_GUIDE_WORDS_NOT_SENT);
  });

  it("Next is ONE element on every page — its last word changes in place — and Back holds its slot", () => {
    render(<Guide />);
    const n = next();
    expect(back().hasAttribute("inert")).toBe(true);
    expect(back().getAttribute("aria-hidden")).toBe("true");
    expect(back().hasAttribute("data-held")).toBe(true);
    for (let i = 0; i < 4; i++) goNext();
    expect(next()).toBe(n);
    expect(n.textContent).toBe(`${t("en", "browseMenu")}${t("my", "browseMenu")}`);
    expect(back().hasAttribute("inert")).toBe(false);
  });

  it("focus STAYS on the pressed control and the region says the new page once", () => {
    render(<Guide />);
    next().focus();
    goNext();
    expect(document.activeElement).toBe(next());
    expect(region().textContent).toBe(
      `${GUIDE_WORDS.notSent.en}, ${GUIDE_WORDS.notSent.my}. ${GUIDE_COPY.sendTable.en}`,
    );
    expect(region().querySelector('[lang="my"]')!.textContent).toBe(GUIDE_WORDS.notSent.my);
    armed();
    step(3).focus();
    fireEvent.click(step(3));
    expect(document.activeElement).toBe(step(3));
    expect(step(3).getAttribute("aria-current")).toBe("step");
    expect(haptic).toHaveBeenCalledWith("pick");
  });

  it("Back pressed on page 2 hands focus to Next as page 1 shows (Back goes inert) — never <body>", () => {
    render(<Guide />);
    goNext();
    back().focus();
    armed();
    // MUTATION (pd11/guide/back-focus-dropped): no hand-off — focus is left on an inert, hidden
    // Back, i.e. nowhere a keyboard user can see; red.
    fireEvent.click(back());
    expect(heading().textContent).toContain("Mingalaba");
    expect(document.activeElement).toBe(next());
  });

  it("the sender is told it is them (page 2)", () => {
    render(<Guide role="host" />);
    goNext();
    expect(dialog().textContent).toContain(GUIDE_COPY.sendYou.en);
    expect(dialog().textContent).not.toContain(GUIDE_COPY.sendTable.en);
  });
});

const DINER_GUIDE_WORDS_NOT_SENT = GUIDE_WORDS.notSent.en;

describe("page 4 while phone pay is parked — EXACTLY the counter, everywhere (the critic's B1)", () => {
  it("its heading, sentence, stage name and spoken line equal the pre-flip strings; no card word, wallet or price anywhere", () => {
    render(<Guide />);
    for (let i = 0; i < 3; i++) goNext();
    expect(heading().textContent).toBe(`Your bill${t("my", "yourBill")}`);
    expect(stage().getAttribute("aria-label")).toBe(
      "Example — the pass your phone shows at the counter",
    );
    expect(stage().querySelector('.ui-pass[data-tier="counter"]')).not.toBeNull();
    // MUTATION (pd11/guide/region-variant-swapped): the region reads the after-flip page — it would
    // tell a screen reader Pay opens on the phone over a counter-only page; red.
    expect(region().textContent).toBe(
      `Your bill, ${t("my", "yourBill")}. You can keep ordering — you’ll pay for everything on the table at the counter.`,
    );
    const everything = [
      dialog().textContent ?? "",
      ...[...dialog().querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")),
    ].join(" ");
    expect(everything).not.toMatch(/card|Apple Pay|Google Pay|\$|Pay opens/i);
  });
});

describe("the pictures — the real components, inert, no money, each motion once", () => {
  it("page 2 renders the Bill's own LivePass in picture mode: two not-sent rows, no price, no total, no stub", () => {
    render(<Guide />);
    goNext();
    const s = stage();
    expect(s.getAttribute("aria-label")).toBe(
      "Example — dishes from everyone at the table, on one order, not sent yet",
    );
    expect(s.querySelectorAll(".live-pass-dish")).toHaveLength(2);
    expect(s.querySelector(".live-pass-dish-price, .live-pass-foot, .live-pass-stub")).toBeNull();
    expect(s.querySelector(".ui-pass")!.hasAttribute("inert")).toBe(true);
    expect(s.textContent).not.toMatch(/\$/);
    // The figureless sample pass ("Your table"), never the guest's number on a sample.
    expect(s.textContent).not.toContain("7");
    // The one movement: the last row rises (CSS keyed by data-motion).
    expect(s.querySelector('[data-motion="row"]')).not.toBeNull();
  });

  it("page 3 fills Coconut Rice's Cooking segment once; a revisit draws the final frame", () => {
    render(<Guide />);
    goNext();
    goNext();
    const filling = () => stage().querySelectorAll(".ui-track[data-filling]");
    expect(filling()).toHaveLength(1);
    expect(stage().textContent).toContain("Cooking");
    // The key under the sentence: the three stamps as a named list, in the guest's own words.
    const key = within(dialog()).getByRole("list", { name: GUIDE_COPY.keyName });
    expect(
      within(key)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Sent to kitchen · ပို့ပြီး", "Cooking · ချက်နေဆဲ", "Served · ထုတ်ပြီး"]);
    goNext();
    armed();
    fireEvent.click(back());
    // MUTATION (pd11/guide/motion-replays): a revisit replays the fill; red.
    expect(filling()).toHaveLength(0);
    expect(GUIDE_FILLING_ID).toBe("guide-rice");
  });

  it("page 1's pass RISEs after the sheet's entrance on open, and never on a revisit", () => {
    render(<Guide />);
    const rise = () => stage().querySelector(".mms-rise") as HTMLElement | null;
    expect(rise()).not.toBeNull();
    expect(rise()!.style.animationDelay).toBe("var(--dur-sheet)");
    goNext();
    armed();
    fireEvent.click(back());
    expect(rise()).toBeNull();
  });

  it("page 5 draws the tab bar's own cells with Order lit, the pass rising behind it", () => {
    render(<Guide />);
    for (let i = 0; i < 4; i++) goNext();
    const s = stage();
    expect([...s.querySelectorAll(".diner-tab")].map((c) => c.textContent)).toEqual([
      "Menu",
      "Order",
      "Account",
    ]);
    expect(s.querySelector('.diner-tab[aria-current="page"]')!.textContent).toBe("Order");
    expect(s.querySelector(".diner-guide-where")!.hasAttribute("inert")).toBe(true);
    expect(s.querySelector(".diner-guide-where-pass.mms-rise")).not.toBeNull();
  });
});

describe("every way out is reported and closes", () => {
  it("the last primary finishes it ('Browse the menu') and reports the page", () => {
    const onOpenChange = vi.fn();
    render(<Guide onOpenChange={onOpenChange} />);
    for (let i = 0; i < 4; i++) goNext();
    armed();
    fireEvent.click(next());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(capture).toHaveBeenCalledWith("guide_closed", { page: 5, via: "finish" });
  });

  it("Esc closes it from any page and reports 'close' with that page", () => {
    const onOpenChange = vi.fn();
    render(<Guide onOpenChange={onOpenChange} />);
    goNext();
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(capture).toHaveBeenCalledWith("guide_closed", { page: 2, via: "close" });
  });

  it("the analytics carry no table number and no person", () => {
    render(<Guide />);
    for (const [, props] of capture.mock.calls)
      expect(Object.keys(props as object).sort()).toEqual(["source"]);
  });
});

describe("DinerGuideDoor — Account's way back in", () => {
  it("a 44px row button opens the guide at page 1, marks this phone seen, and its last primary is Close", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetch);
    render(<DinerGuideDoor />);
    const row = screen.getByRole("button", { name: GUIDE_COPY.accountRow });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(row);
    expect(heading().textContent).toContain("Mingalaba");
    // No table: the pass reads "Your table" and the Invite line drops the sticker clause.
    expect(stage().getAttribute("aria-label")).toBe("Your table’s pass");
    expect(dialog().textContent).toContain(GUIDE_COPY.inviteNoSticker.en);
    // MUTATION (pd11/door/unmarked): a guide read from Account would be offered again on the next
    // dine-in arrival; red.
    expect(localStorage.getItem(DINER_GUIDE_KEY)).toBe("1");
    expect(fetch).toHaveBeenCalledWith("/api/guide-seen", { method: "POST", keepalive: true });
    expect(capture).toHaveBeenCalledWith("guide_opened", { source: "account" });
    for (let i = 0; i < 4; i++) goNext();
    expect(next().textContent).toBe("Closeပိတ်");
    armed();
    await act(async () => {
      fireEvent.click(next());
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.unstubAllGlobals();
  });
});
