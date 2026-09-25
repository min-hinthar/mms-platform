/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModGroup } from "@/lib/menu/modifiers";

/**
 * Phase 2c · pad — the options sheet speaks Burmese on a Burmese console: the title, each group's
 * legend and each option chip LEAD with the catalog's Burmese (chips lead only — no second script in
 * a 44px chip), and every Burmese run carries `.chrome-my`, because the sheet portals outside
 * `.stx-root` and nothing else would give it the Burmese face. The KIOSK composes the same sheet with
 * no `lang`: its path must render exactly what it rendered before (the text below was captured from
 * the unchanged component, not written by hand).
 */
const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (m: string) => haptic(m) }));

const { StaffModSheet } = await import("./StaffModSheet");

const GROUPS: ModGroup[] = [
  {
    id: "g1",
    slug: "style",
    name: "Curry style",
    nameMy: "ဟင်းပုံစံ",
    selectionType: "single",
    minSelect: 1,
    maxSelect: 1,
    options: [
      {
        id: "o1",
        slug: "braised",
        name: "Braised",
        nameMy: "နှပ်",
        priceDeltaCents: 0,
        allergens: [],
      },
      { id: "o2", slug: "dry", name: "Dry fry", nameMy: null, priceDeltaCents: 150, allergens: [] },
    ],
  },
  {
    id: "g2",
    slug: "extras",
    name: "Add-ons",
    nameMy: "အပို",
    selectionType: "multiple",
    minSelect: 0,
    maxSelect: 2,
    options: [
      { id: "o3", slug: "egg", name: "Egg", nameMy: "ကြက်ဥ", priceDeltaCents: 100, allergens: [] },
    ],
  },
];

afterEach(() => {
  cleanup();
  haptic.mockClear();
});

function mount(props: Record<string, unknown> = {}) {
  const onAdd = vi.fn();
  render(
    <StaffModSheet
      open
      onOpenChange={() => {}}
      itemName="Beef Curry"
      basePriceCents={1450}
      groups={GROUPS}
      pending={false}
      error={null}
      onAdd={onAdd}
      {...props}
    />,
  );
  return onAdd;
}

describe("StaffModSheet — the kiosk path is unchanged", () => {
  it("renders exactly the text it rendered before (captured from the unchanged sheet)", () => {
    mount();
    expect(document.body.textContent).toBe(
      "Beef CurryCloseCurry style · requiredBraisedDry fry+$1.50Add-ons · optionalEgg+$1.00Quantity−1+Kitchen note (allergy, request)Add · $14.50",
    );
    // No Burmese run anywhere on the English path, even with Burmese names loaded.
    expect(document.querySelector('[lang="my"]')).toBeNull();
  });
});

describe("StaffModSheet — Burmese first on a Burmese console", () => {
  it("the title leads with the dish's Burmese, the English beneath", () => {
    mount({ lang: "my", itemNameMy: "အမဲသားဟင်း" });
    const dialog = screen.getByRole("dialog");
    const lead = dialog.querySelector('[lang="my"].chrome-my');
    expect(lead?.textContent).toBe("အမဲသားဟင်း");
    expect(dialog.textContent).toContain("Beef Curry");
  });

  it("legends and option chips lead with Burmese; a chip with no Burmese stays English, marked", () => {
    mount({ lang: "my", itemNameMy: "အမဲသားဟင်း" });
    const legends = [...document.querySelectorAll("legend")];
    // MUTATION: leading with nameMy regardless of lang — the kiosk test above goes red; leading
    // with the English here — this one does.
    expect(legends[0]?.querySelector('[lang="my"]')?.textContent).toBe("ဟင်းပုံစံ");
    const chips = [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
    expect(chips.map((c) => c.querySelector("[lang]")?.getAttribute("lang"))).toEqual([
      "my",
      "en",
      "my",
    ]);
    expect(chips[0]?.querySelector('[lang="my"]')?.className).toContain("chrome-my");
    // Lead ONLY in a chip: no English echo beside the Burmese.
    expect(chips[0]?.textContent).toBe("နှပ်");
    expect(chips[1]?.textContent).toContain("Dry fry");
  });

  it("every Burmese run in the portaled sheet carries .chrome-my (the face cannot cross the portal)", () => {
    mount({ lang: "my", itemNameMy: "အမဲသားဟင်း" });
    const runs = [...screen.getByRole("dialog").querySelectorAll('[lang="my"]')];
    expect(runs.length).toBeGreaterThan(3);
    // MUTATION: a bare `lang="my"` span — Padauk never reaches it; red.
    for (const r of runs) expect(r.className).toContain("chrome-my");
  });

  it("an option pick buzzes `pick`, the Add buzzes `commit` at the tap", () => {
    const onAdd = mount({ lang: "my", itemNameMy: "အမဲသားဟင်း" });
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")[2]!);
    expect(haptic).toHaveBeenLastCalledWith("pick");
    const add = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("$15.50"),
    )!;
    fireEvent.click(add);
    expect(haptic).toHaveBeenLastCalledWith("commit");
    expect(onAdd).toHaveBeenCalledWith({ modifierIds: ["o1", "o3"], qty: 1, notes: undefined });
  });
});
