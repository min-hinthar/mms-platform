/** @vitest-environment jsdom */
import { StrictMode, type ReactElement, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { helpCardCount, helpSeenKey, type HelpDoorScreen } from "@/lib/help";
import { STAFF } from "@/lib/i18n/staff";
import { echoesShown, scriptOf, type StaffLangMode } from "@/lib/staff-lang";

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("posthog-js", () => ({
  default: { get_distinct_id: () => "ph-d1", get_session_id: () => "ph-s1" },
}));
const submitStaffReport = vi.fn();
const listMyStaffReports = vi.fn();
vi.mock("@/lib/staff-report-actions", () => ({
  submitStaffReport: (...a: unknown[]) => submitStaffReport(...a),
  listMyStaffReports: () => listMyStaffReports(),
}));

// P2e — the Help sheet owns the language write, so it reaches the action and the router.
const setStaffLang = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: (v: unknown) => setStaffLang(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { HelpButton } = await import("./HelpButton");
const { StaffLangProvider } = await import("./StaffLangProvider");

/**
 * P2e — HelpButton reads the device's MODE (`useStaffLangMode`, which throws outside a provider —
 * every production mount sits under `app/staff/layout.tsx`). Every render here is wrapped in the
 * provider of the language the HelpButton element itself was given, so the suite's existing cases
 * are unchanged; the language cases pass `echoes` explicitly.
 */
function langOf(ui: ReactElement): "en" | "my" {
  const props = ui.props as { lang?: "en" | "my"; children?: ReactElement };
  if (props.lang) return props.lang;
  return props.children ? langOf(props.children) : "en";
}
const render = (ui: ReactElement, echoes = true) => {
  const lang = langOf(ui);
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StaffLangProvider lang={lang} echoes={echoes}>
        {children}
      </StaffLangProvider>
    ),
  });
};

/**
 * P7·3 — the Help door. What is worth pinning: the circle is a named 44px control that opens ONE
 * dialog; the rows lead to the cards and (on the board only) the sizes; the cards page one at a
 * time with focus moved to each; "opens itself the first time" is kept per DEVICE and only once;
 * the size view shows the chosen size pressed and closes on a pick; and the undo card quotes the
 * number the board handed in, never a typed one.
 */
afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});
beforeEach(() => {
  localStorage.clear();
  setStaffLang.mockReset();
  refresh.mockReset();
  setStaffLang.mockImplementation(async (v: { mode: string }) => ({ ok: true, mode: v.mode }));
  submitStaffReport.mockReset();
  listMyStaffReports.mockReset();
  // Settles after a MACROTASK, the way a real round-trip does. A same-tick fixture hid the first
  // draft's stuck list: the effect keyed on the state it set cancelled its own read.
  listMyStaffReports.mockImplementation(() => later({ ok: true, rows: [] }));
});
const later = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 0));

const seen = (screen: HelpDoorScreen) => localStorage.setItem(helpSeenKey(screen), "1");
/** The board's undo window as the kitchen door requires it (typed from the key's slot). */
const kitchenVars = { 2: { n: 6 } };
/** jsdom has no `matchMedia`; stub the ONE query the sheet asks (the board's wide envelope). */
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (media: string) => ({
      matches,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
}
const dialog = () => screen.getByRole("dialog");
/** Radix Presence compares `event.animationName` through `CSS.escape`; jsdom has no `CSS`. */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };
/** A stylesheet's answer for the sheet and its scrim: an exit once `data-state` is closed, so a
 *  closed sheet is HELD until `animationend` (SheetExit.test.tsx has the full fixture). */
function stubComputedStyle() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    const node = el as HTMLElement;
    if (!node.classList?.contains("mms-sheet") && !node.classList?.contains("mms-scrim"))
      return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "animationName")
          return node.getAttribute("data-state") === "closed" ? "exit" : "enter";
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  });
}
function animationEnd(el: Element) {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: "exit" });
  el.dispatchEvent(ev);
}
const circle = () => screen.getByRole("button", { name: "Help" });

describe("HelpButton", () => {
  it("is a named gold circle that opens the Help sheet onto its rows", async () => {
    seen("counter");
    render(<HelpButton lang="en" screen="counter" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(circle().className).toContain("staff-circ-gold");
    expect(circle().getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(circle());
    const d = await screen.findByRole("dialog");
    expect(screen.getByRole("list", { name: "Help topics" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /How this screen works/ })).not.toBeNull();
    // No size row on a screen that has no dial — but the report row is on every screen.
    expect(screen.queryByRole("button", { name: /Text size/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Something’s wrong/ })).not.toBeNull();
    expect(d.textContent).toContain("One door for everything");
  });

  it("the first time a DEVICE mounts a screen's door, the cards open by themselves — once", async () => {
    const { unmount } = render(<HelpButton lang="en" screen="kitchen" cardVars={kitchenVars} />);
    await screen.findByRole("dialog");
    expect(screen.getByText(STAFF["help.how.kitchen.1"].en)).not.toBeNull();
    // On the auto-open the SHEET's initial focus stands — the dialog, announced with its title (W9e):
    // the content mounts a commit after the open, so nothing else could have focus yet. From the
    // first Next on, the sentence takes it.
    await waitFor(() =>
      expect(dialog().closest(".mms-sheet")!.contains(document.activeElement)).toBe(true),
    );
    expect(document.activeElement?.id).not.toBe("help-lede");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(document.activeElement?.id).toBe("help-lede"));
    expect(localStorage.getItem(helpSeenKey("kitchen"))).toBe("1");
    unmount();
    // Second morning: nothing opens.
    render(<HelpButton lang="en" screen="kitchen" cardVars={kitchenVars} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    // …and a DIFFERENT screen on the same device still gets its own first time.
    expect(localStorage.getItem(helpSeenKey("counter"))).toBeNull();
  });

  it("still opens itself under StrictMode — the seen mark rides the open, not the read", async () => {
    // StrictMode mounts, unmounts and re-mounts every effect; a mark written by the DISCARDED first
    // pass is read as "seen" by the live one and the first morning shows nothing. Dev runs
    // StrictMode (`reactStrictMode: true`), so that is where the promise would silently break.
    render(
      <StrictMode>
        <HelpButton lang="en" screen="counter" />
      </StrictMode>,
    );
    await screen.findByRole("dialog");
    expect(localStorage.getItem(helpSeenKey("counter"))).toBe("1");
  });

  it("pages the cards one at a time, moves focus to each, and Got it closes on the last", async () => {
    seen("counter");
    render(<HelpButton lang="en" screen="counter" />);
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /How this screen works/ }));
    const lede = () => document.getElementById("help-lede")!;
    await waitFor(() => expect(lede().textContent).toMatch(/Tap Walk-up/));
    expect(document.activeElement).toBe(lede());
    // Focus lands on the sentence; the step count is its DESCRIPTION, so "Step 1 of 4" is read too.
    expect(lede().getAttribute("aria-describedby")).toBe("help-step");
    expect(document.getElementById("help-step")!.textContent).toBe(
      `Step 1 of ${helpCardCount("counter")}`,
    );
    for (let n = 2; n <= helpCardCount("counter"); n++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() =>
        expect(screen.getByText(`Step ${n} of ${helpCardCount("counter")}`)).not.toBeNull(),
      );
      expect(document.activeElement).toBe(lede());
    }
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Re-opening lands on the rows again, not mid-deck.
    fireEvent.click(circle());
    expect((await screen.findByRole("dialog")).textContent).toContain("How this screen works");
  });

  it("Back on the first card returns to the rows; Back later steps back", async () => {
    seen("counter");
    render(<HelpButton lang="en" screen="counter" />);
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /How this screen works/ }));
    await screen.findByText(/Step 1 of/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText(/Step 2 of/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText(/Step 1 of/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("list", { name: "Help topics" });
    // The Back button that had focus is gone with the view; focus must still be INSIDE the dialog
    // (the trap re-parks it on the sheet), never dropped on <body> behind the scrim.
    const sheet = dialog().closest(".mms-sheet")!;
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it("the undo card quotes the number the board handed in — Burmese numerals under my", async () => {
    seen("kitchen");
    render(<HelpButton lang="my" screen="kitchen" cardVars={kitchenVars} />);
    fireEvent.click(screen.getByRole("button", { name: "အကူအညီ" }));
    fireEvent.click(await screen.findByRole("button", { name: /ဒီစခရင် ဘယ်လို သုံးရမလဲ/ }));
    await screen.findByText(/အဆင့် ၁ \/ ၄/);
    fireEvent.click(screen.getByRole("button", { name: /ရှေ့ဆက်/ }));
    const lede = await waitFor(() => document.getElementById("help-lede")!);
    await waitFor(() =>
      expect(lede.querySelector('[lang="my"]')?.textContent).toContain("၆ စက္ကန့်"),
    );
    expect(lede.querySelector(".chrome-en")?.textContent).toContain("6 seconds");
    // The picture is decorative: hidden, and its labels are real dictionary text (marked), not art.
    const pic = dialog().querySelector(".help-pic")!;
    expect(pic.getAttribute("aria-hidden")).toBe("true");
    expect(pic.querySelector('[lang="my"]')).not.toBeNull();
  });

  it("on the board the size row shows the current size, the view presses it, and a pick closes the sheet", async () => {
    seen("kitchen");
    stubMatchMedia(true); // the pass tablet: the fixed envelope, where "N across" is true
    const onPick = vi.fn();
    render(
      <HelpButton
        lang="en"
        screen="kitchen"
        size={{ value: "m", onPick }}
        cardVars={kitchenVars}
      />,
    );
    fireEvent.click(circle());
    const row = await screen.findByRole("button", { name: /Text size/ });
    expect(row.textContent).toMatch(/Now: Medium · 34 px/);
    fireEvent.click(row);
    const sizes = await screen.findByRole("group", { name: "Text size" });
    // The row that was tapped unmounted with the view; focus stays inside the dialog.
    expect(dialog().closest(".mms-sheet")!.contains(document.activeElement)).toBe(true);
    const pressed = sizes.querySelector('[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/Medium/);
    expect(pressed.textContent).toMatch(/34 px · 3 across/);
    expect(sizes.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    expect(screen.getByRole("button", { name: /Small/ }).textContent).toMatch(/30 px · 4 across/);
    // Back from the sizes returns to the rows with focus still inside the dialog.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("list", { name: "Help topics" });
    expect(dialog().closest(".mms-sheet")!.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Text size/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Large/ }));
    expect(onPick).toHaveBeenCalledWith("l");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("narrower than the board's envelope the sizes say only the size — no column count the grid does not draw", async () => {
    seen("kitchen");
    stubMatchMedia(false);
    render(
      <HelpButton
        lang="en"
        screen="kitchen"
        size={{ value: "m", onPick: vi.fn() }}
        cardVars={kitchenVars}
      />,
    );
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /Text size/ }));
    const sizes = await screen.findByRole("group", { name: "Text size" });
    expect(sizes.textContent).toMatch(/34 px/);
    expect(sizes.textContent).not.toMatch(/across/);
    // …and a device with no matchMedia at all is treated the same way (never a claim by default).
    cleanup();
    delete (window as { matchMedia?: unknown }).matchMedia;
    render(
      <HelpButton
        lang="en"
        screen="kitchen"
        size={{ value: "s", onPick: vi.fn() }}
        cardVars={kitchenVars}
      />,
    );
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /Text size/ }));
    expect((await screen.findByRole("group", { name: "Text size" })).textContent).not.toMatch(
      /across/,
    );
  });

  describe("P7·4 — Something’s wrong", () => {
    const openReport = async (props: Partial<Parameters<typeof HelpButton>[0]> = {}) => {
      seen("counter");
      render(<HelpButton lang="en" screen="counter" {...(props as object)} />);
      fireEvent.click(circle());
      fireEvent.click(await screen.findByRole("button", { name: /Something’s wrong/ }));
      return screen.findByRole("textbox", { name: /What happened/ });
    };

    it("opens onto a labelled field, the facts sent with it, ONE live region, and loads the reporter's list", async () => {
      listMyStaffReports.mockImplementation(() =>
        later({
          ok: true,
          rows: [
            {
              id: "9f1c2a3b-4d5e-4f60-8a7b-0c1d2e3f4a5b",
              shortId: "9F1C2A3B",
              createdAt: "2026-09-07T05:30:00.000Z",
              message: "Bump did nothing",
              status: "triaged",
              issueUrl: "https://github.com/min-hinthar/mms-platform/issues/300",
            },
            {
              id: "abcdef01-2345-4789-abcd-ef0123456789",
              shortId: "ABCDEF01",
              createdAt: "2026-09-06T05:30:00.000Z",
              message: "Old one",
              status: "open",
              issueUrl: null,
            },
          ],
        }),
      );
      const field = await openReport({ connection: "not_updating" });
      expect((field as HTMLTextAreaElement).maxLength).toBe(2000);
      expect(screen.getByText("Sent with it")).not.toBeNull();
      const facts = screen.getByRole("list", { name: "Sent with the report" });
      expect(facts.textContent).toMatch(/Screen: Counter & tables/);
      expect(facts.textContent).toMatch(/Connection: not updating/);
      expect(facts.textContent).toMatch(/Version: dev/);
      // Exactly one live region in this view, and it is empty until something happens.
      const regions = dialog().querySelectorAll('[role="status"], [aria-live]');
      expect(regions.length).toBe(1);
      expect(regions[0]!.textContent).toBe("");
      // The reporter's own list arrives AFTER "Loading…" — the round-trip settles a macrotask later.
      expect(screen.getByText("Loading…")).not.toBeNull();
      const mine = await screen.findByRole("list", { name: "Your reports" });
      expect(mine.querySelectorAll("li").length).toBe(2);
      expect(mine.textContent).toContain("Being looked at");
      expect(mine.textContent).toContain("On the team’s list");
      expect(mine.textContent).toContain("Received");
      expect(listMyStaffReports).toHaveBeenCalledTimes(1);
    });

    it("refuses an empty send in the region and keeps focus on the field — nothing is submitted", async () => {
      const field = await openReport();
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(submitStaffReport).not.toHaveBeenCalled();
      expect(dialog().querySelector('[role="status"]')!.textContent).toBe(
        "Write a few words first.",
      );
      expect(document.activeElement).toBe(field);
      // Typing clears that refusal.
      fireEvent.change(field, { target: { value: "T4" } });
      expect(dialog().querySelector('[role="status"]')!.textContent).toBe("");
    });

    it("sends the person's words with the facts the app can see, moves focus to the sent card, and re-reads the list", async () => {
      submitStaffReport.mockResolvedValue({ ok: true, id: "x", shortId: "9F1C2A3B" });
      const field = await openReport({ connection: "live" });
      await screen.findByText("None yet.");
      fireEvent.change(field, { target: { value: "Bump did nothing on T4" } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() => expect(submitStaffReport).toHaveBeenCalledTimes(1));
      const draft = submitStaffReport.mock.calls[0]![0] as Record<string, unknown>;
      expect(draft).toMatchObject({
        screen: "counter",
        message: "Bump did nothing on T4",
        lang: "en",
        connection: "live",
      });
      expect("appVersion" in draft).toBe(false); // the server stamps its own build
      expect(typeof draft.path).toBe("string");
      expect(draft.device).toMatchObject({ posthogDistinctId: "ph-d1", posthogSessionId: "ph-s1" });
      const card = await screen.findByText("Got it — we’re on it.");
      expect(card.closest(".help-report-sent")).toBe(document.activeElement);
      expect(screen.getByText(/Report 9F1C2A3B is saved/)).not.toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      await waitFor(() => expect(listMyStaffReports).toHaveBeenCalledTimes(2));
    });

    it("before the table exists the door says it is not switched on — no form, no 'try again'", async () => {
      listMyStaffReports.mockImplementation(() => later({ ok: false, reason: "off" }));
      seen("counter");
      render(<HelpButton lang="en" screen="counter" />);
      fireEvent.click(circle());
      fireEvent.click(await screen.findByRole("button", { name: /Something’s wrong/ }));
      await screen.findByText(/Reports aren’t switched on for this app yet/);
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByText("Your reports")).toBeNull();
      expect(screen.queryByText(/try again/)).toBeNull();
    });

    it("a send answered `off` gives the form up for the same sentence", async () => {
      submitStaffReport.mockResolvedValue({ ok: false, reason: "off" });
      const field = await openReport();
      fireEvent.change(field, { target: { value: "T4" } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByText(/Reports aren’t switched on for this app yet/);
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("a keyed refusal renders in the region and the words are kept", async () => {
      submitStaffReport.mockResolvedValue({ ok: false, reason: "outage" });
      const field = await openReport();
      fireEvent.change(field, { target: { value: "T4" } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() =>
        expect(dialog().querySelector('[role="status"]')!.textContent).toBe(
          "Couldn’t send right now — try again in a moment.",
        ),
      );
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("T4");
      expect(screen.queryByText("Got it — we’re on it.")).toBeNull();
    });

    it("speaks Burmese: the row, the field and the refusal, with the facts' values Latin-marked", async () => {
      seen("kitchen");
      render(<HelpButton lang="my" screen="kitchen" cardVars={kitchenVars} connection="live" />);
      fireEvent.click(screen.getByRole("button", { name: "အကူအညီ" }));
      fireEvent.click(await screen.findByRole("button", { name: /တစ်ခုခု မှားနေတယ်/ }));
      await screen.findByRole("textbox", { name: /ဘာဖြစ်သွားလဲ/ });
      const facts = screen.getByRole("list", { name: "အစီရင်ခံစာနဲ့ အတူ ပို့မယ့် အချက်အလက်" });
      // Every Latin value inside the Burmese run is marked (the clock, the version); the screen's
      // name is Burmese and is NOT.
      const marked = Array.from(facts.querySelectorAll('[lang="en"]')).map((n) => n.textContent);
      expect(marked).toContain("dev");
      expect(facts.textContent).toContain("မီးဖိုချောင်");
      expect(marked).not.toContain("မီးဖိုချောင်");
      fireEvent.click(screen.getByRole("button", { name: /ပို့မယ်/ }));
      expect(dialog().querySelector('[role="status"]')!.textContent).toContain(
        "စကားလုံး အနည်းငယ် အရင် ရေးပါ။",
      );
    });
  });

  it("carries a class through the portal for the Night board, and mounts NO live region of its own", async () => {
    seen("kitchen");
    render(<HelpButton lang="en" screen="kitchen" sheetClassName="dark" cardVars={kitchenVars} />);
    fireEvent.click(circle());
    const d = await screen.findByRole("dialog");
    expect(d.closest(".mms-sheet")?.className).toContain("dark");
    expect(document.querySelectorAll('[role="status"], [aria-live]').length).toBe(0);
  });
});

describe("M76 — the help sheet through its exit", () => {
  it("closing keeps the card on screen while the sheet slides; the reset rides the NEXT open", async () => {
    seen("counter");
    stubComputedStyle();
    render(<HelpButton lang="en" screen="counter" />);
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /How this screen works/ }));
    await waitFor(() =>
      expect(document.getElementById("help-lede")!.textContent).toMatch(/Tap Walk-up/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const step2 = `Step 2 of ${helpCardCount("counter")}`;
    await waitFor(() => expect(screen.getByText(step2)).not.toBeNull());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    // Held by the stubbed exit — and still ON the card: a close-time reset flipped the deck back
    // to the rows in the first frame of the slide (the blind pass, slice 4).
    // MUTATION: reset view/step in `show(false)` again — the rows are back mid-slide; red.
    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(screen.getByText(step2)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /How this screen works/ })).toBeNull();
    await act(async () => {
      animationEnd(dialog());
      animationEnd(document.querySelector(".mms-scrim")!);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(circle());
    // MUTATION: drop the reset from `show(true)` — the deck reopens mid-card; red.
    expect((await screen.findByRole("dialog")).textContent).toContain("How this screen works");
    expect(screen.queryByText(step2)).toBeNull();
    vi.restoreAllMocks();
  });
});

// ── Phase 2e · lang ──
/**
 * P2e — Language, the mid-service way back: a row before the report, both scripts on every device,
 * the three mode rows behind it. What is pinned: the row order (report LAST); the row, title and
 * scope are bilingual under English AND under Burmese-only; the sheet is NEVER busy for a language
 * write (✕ and Escape stay live, the write still lands); it closes when the PROVIDER catches up,
 * never on the chain's end; a second tap on the pending row keeps it open; a failure lands in the
 * view while it is open and in the bar tail after the person closed it; the next open clears it.
 */
describe("P2e — the Help sheet's Language row", () => {
  const Host = ({ mode, children }: { mode: StaffLangMode; children: ReactNode }) => (
    <StaffLangProvider lang={scriptOf(mode)} echoes={echoesShown(mode)}>
      {children}
    </StaffLangProvider>
  );
  /** The bar tail as the page renders it: the circle's fragment children are the tail's. The
   *  page hands the circle the provider's script, as `app/staff/page.tsx` does. */
  const Tail = ({ mode }: { mode: StaffLangMode }) => (
    <div className="staff-bar-tail">
      <HelpButton lang={scriptOf(mode)} screen="counter" />
    </div>
  );
  /** An ENGLISH device, so the sheet's chrome is queried by its English names; the rows are named
   *  by their autonyms on every device. */
  const mountLang = (mode: StaffLangMode = "en") =>
    rtlRender(
      <Host mode={mode}>
        <Tail mode={mode} />
      </Host>,
    );
  const openLang = async () => {
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /Language/ }));
    return screen.findByRole("group", { name: "This device’s language" });
  };
  function held<T>() {
    let release!: (v: T) => void;
    const p = new Promise<T>((r) => {
      release = r;
    });
    return { p, release };
  }

  it("the menu reads How · Text size (board) · Language · Something's wrong — the report LAST", async () => {
    seen("kitchen");
    render(
      <HelpButton
        lang="en"
        screen="kitchen"
        size={{ value: "m", onPick: vi.fn() }}
        cardVars={kitchenVars}
      />,
    );
    fireEvent.click(circle());
    const list = await screen.findByRole("list", { name: "Help topics" });
    const names = [...list.querySelectorAll(".staff-row-name")].map((n) => n.textContent);
    expect(names.map((t) => /How|Text size|Language|Something/.exec(t ?? "")?.[0])).toEqual([
      "How",
      "Text size",
      "Language",
      "Something",
    ]);
  });

  it.each([
    ["en", true],
    ["my", false],
  ] as const)(
    "under lang=%s (echoes %s) the row is BOTH scripts; its sub-line is the mode in the device's own",
    async (lang, echoes) => {
      seen("counter");
      render(<HelpButton lang={lang} screen="counter" />, echoes);
      fireEvent.click(screen.getByRole("button", { name: lang === "en" ? "Help" : "အကူအညီ" }));
      const row = await screen.findByRole("button", { name: /ဘာသာစကား/ });
      const name = row.querySelector(".staff-row-name")!;
      expect(name.querySelector(':scope > .chrome-pair > [lang="my"]')?.textContent).toBe(
        STAFF["shell.lang.row"].my,
      );
      expect(name.querySelector(":scope > .chrome-pair > .chrome-en")?.textContent).toBe(
        STAFF["shell.lang.row"].en,
      );
      const sub = row.querySelector(".help-row-sub")!;
      const key = lang === "en" ? "shell.lang.mode.en" : "shell.lang.mode.myOnly";
      expect(sub.textContent).toBe(STAFF[key][lang]);
    },
  );

  /** Mode-aware handles: the circle and the chrome are named in the device's tongue, the Language
   *  row and the rows by words that read the same in every mode. */
  const circleOf = () => document.querySelector<HTMLElement>(".staff-circ-gold")!;
  const openLangIn = async (mode: StaffLangMode) => {
    fireEvent.click(circleOf());
    fireEvent.click(
      await screen.findByRole("button", { name: new RegExp(STAFF["shell.lang.row"].my) }),
    );
    return screen.findByRole("group", { name: STAFF["shell.lang.group"][scriptOf(mode)] });
  };
  /** A both-tongues line, measured as its two parts — the English half EXACTLY, the part a
   *  Burmese-only device drops unless `keepEcho` holds it. */
  const expectBoth = (
    el: Element | null,
    k: "shell.lang.row" | "shell.lang.scope" | "shell.lang.failed",
  ) => {
    expect(el?.querySelector('[lang="my"]')?.textContent).toBe(STAFF[k].my);
    expect(el?.querySelector(".chrome-en")?.textContent).toBe(STAFF[k].en);
  };
  // The keepEcho sites only CHANGE anything on a Burmese-only device — on English and Both the
  // echo draws anyway — so each case below runs there too (review: six sites could lose keepEcho
  // with every suite green).
  const MODES = ["en", "my-only"] as const;

  it.each(MODES)(
    "under %s: opens onto a bilingual TITLE and scope, three rows, the note and Back — focus on the PRESSED row",
    async (mode) => {
      seen("counter");
      mountLang(mode);
      const rows = await openLangIn(mode);
      const d = dialog();
      // The sheet's title is what names the dialog — measured there, never "any element with an id".
      const title = document.getElementById(d.getAttribute("aria-labelledby")!);
      expectBoth(title, "shell.lang.row");
      expectBoth(d.querySelector(".help-lang > .help-sub"), "shell.lang.scope");
      expect(d.querySelector(".staff-lang-note")?.textContent).toBe(
        STAFF["shell.lang.note"][scriptOf(mode)],
      );
      expect(rows.querySelectorAll(".staff-lang-row")).toHaveLength(3);
      expect(screen.getByRole("button", { name: STAFF["help.back"][scriptOf(mode)] })).toBeTruthy();
      const pressed = mode === "en" ? "English" : "မြန်မာ";
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("button", { name: pressed })),
      );
    },
  );

  it("a tap on the CONFIRMED mode closes the sheet — no write", async () => {
    seen("counter");
    mountLang("en");
    await openLang();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(setStaffLang).not.toHaveBeenCalled();
  });

  it("the sheet is NEVER busy for a language write: ✕ stays live, Escape closes it, and the write still lands", async () => {
    seen("counter");
    const w = held<{ ok: true; mode: StaffLangMode }>();
    setStaffLang.mockReturnValue(w.p);
    mountLang("en");
    await openLang();
    fireEvent.click(screen.getByRole("button", { name: "မြန်မာ English" }));
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => w.release({ ok: true, mode: "both" }));
    expect(setStaffLang.mock.calls).toEqual([[{ mode: "both" }]]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stays open after the write until the PROVIDER shows the written mode, then closes", async () => {
    seen("counter");
    const { rerender } = mountLang("en");
    await openLang();
    fireEvent.click(screen.getByRole("button", { name: "မြန်မာ" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // The chain ended and the refresh is in flight: the board behind has not changed yet.
    expect(screen.getByRole("dialog")).toBeTruthy();
    rerender(
      <Host mode="my-only">
        <Tail mode="my-only" />
      </Host>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it.each(MODES)(
    "under %s: a second tap on the PENDING row keeps the sheet open, and the later failure is said in it — both tongues",
    async (mode) => {
      seen("counter");
      const w = held<{ ok: false; error: string }>();
      setStaffLang.mockReturnValue(w.p);
      mountLang(mode);
      await openLangIn(mode);
      fireEvent.click(screen.getByRole("button", { name: "မြန်မာ English" }));
      fireEvent.click(screen.getByRole("button", { name: "မြန်မာ English" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      await act(async () => w.release({ ok: false, error: "nope" }));
      const alert = within(dialog()).getByRole("alert");
      expect(alert.closest(".help-lang")).not.toBeNull(); // the Language view's own line
      expectBoth(alert, "shell.lang.failed");
      expect(setStaffLang).toHaveBeenCalledTimes(1);
      // The cap is back on what the server holds.
      const confirmed = mode === "en" ? "English" : "မြန်မာ";
      expect(screen.getByRole("button", { name: confirmed }).getAttribute("aria-pressed")).toBe(
        "true",
      );
    },
  );

  it.each(MODES)(
    "under %s: closed mid-write, then refused — the BAR TAIL's line beside the circle, both tongues; the next open clears it",
    async (mode) => {
      seen("counter");
      const w = held<{ ok: false; error: string }>();
      setStaffLang.mockReturnValue(w.p);
      const { container } = mountLang(mode);
      await openLangIn(mode);
      fireEvent.click(screen.getByRole("button", { name: "မြန်မာ English" }));
      fireEvent.click(screen.getByRole("button", { name: STAFF["shell.close"][scriptOf(mode)] }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await act(async () => w.release({ ok: false, error: "nope" }));
      const line = screen.getByRole("alert");
      expect(line.className).toBe("staff-bar-msg");
      expect(line.parentElement).toBe(container.querySelector(".staff-bar-tail"));
      expectBoth(line, "shell.lang.failed");
      // The next open answers it: no bar line, and no stale line in the reopened view.
      await openLangIn(mode);
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it.each(MODES)(
    "under %s: Back to the rows mid-write, then Language again — the outcome is still there, both tongues (the host owns the write)",
    async (mode) => {
      seen("counter");
      const w = held<{ ok: false; error: string }>();
      setStaffLang.mockReturnValue(w.p);
      mountLang(mode);
      await openLangIn(mode);
      fireEvent.click(screen.getByRole("button", { name: "မြန်မာ English" }));
      fireEvent.click(screen.getByRole("button", { name: STAFF["help.back"][scriptOf(mode)] }));
      await screen.findByRole("list", { name: STAFF["help.a11y.rows"][scriptOf(mode)] });
      await act(async () => w.release({ ok: false, error: "nope" }));
      // Said under the row that leads back to the rows — the MENU view's own line…
      const menuLine = within(dialog()).getByRole("alert");
      expect(menuLine.closest(".help-menu")).not.toBeNull();
      expectBoth(menuLine, "shell.lang.failed");
      fireEvent.click(screen.getByRole("button", { name: new RegExp(STAFF["shell.lang.row"].my) }));
      // …and still said in the view.
      const viewLine = await within(dialog()).findByRole("alert");
      expect(viewLine.closest(".help-lang")).not.toBeNull();
      expectBoth(viewLine, "shell.lang.failed");
      expect(setStaffLang).toHaveBeenCalledTimes(1);
    },
  );
});

/**
 * P2e review — the Text size preview is a DISH NAME, and a dish name never changes with the
 * device's language (the ticket's `TicketText` path). Rendered through the chrome, the sample lost
 * its English line on a Burmese-only device (and was English alone on an English one), so the
 * preview stopped showing what the ticket shows. It is the ticket's own dish-title render now:
 * byte-identical to `TicketDishTitle` for the same dish, in every mode.
 */
describe("P2e — the Text size sample reads as the ticket does, in every mode", () => {
  it.each(["my-only", "both", "en"] as const)("under %s", async (mode) => {
    seen("kitchen");
    stubMatchMedia(true);
    const { TicketDishTitle } = await import("./TicketText");
    rtlRender(
      <StaffLangProvider lang={scriptOf(mode)} echoes={echoesShown(mode)}>
        <HelpButton
          lang={scriptOf(mode)}
          screen="kitchen"
          size={{ value: "m", onPick: vi.fn() }}
          cardVars={kitchenVars}
        />
      </StaffLangProvider>,
    );
    fireEvent.click(document.querySelector(".staff-circ-gold")!);
    await screen.findByRole("dialog");
    fireEvent.click(document.querySelector(".help-glyph-aa")!.closest("button")!);
    const samples = await waitFor(() => {
      const found = [...document.querySelectorAll(".help-size-sample")];
      expect(found).toHaveLength(3);
      return found;
    });
    const dish = {
      name: STAFF["help.size.sample"].en,
      nameMy: STAFF["help.size.sample"].my,
    };
    const ticket = rtlRender(<TicketDishTitle line={dish} />).container.innerHTML;
    for (const s of samples) {
      // The CSS's shape: `.help-size-sample > .chrome-pair > [lang="my"]` and `> .chrome-en`.
      expect(s.querySelector(':scope > .chrome-pair > [lang="my"]')?.textContent).toBe(dish.nameMy);
      expect(s.querySelector(":scope > .chrome-pair > .chrome-en")?.textContent).toBe(dish.name);
      expect(s.innerHTML).toBe(ticket);
    }
  });
});
