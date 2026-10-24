/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";

/**
 * Menu studio's screens (owner, 2026-10-24): who gets the editor, what each sheet SENDS, and that
 * every refusal is said in one region. Each rule carries a `studio-ui/*` mutant.
 */
const editDish = vi.fn(
  (): Promise<unknown> =>
    Promise.resolve({ ok: true, audited: true, updatedAt: "2026-10-24T10:00:00.000Z", changed: 1 }),
);
const createDish = vi.fn(
  (): Promise<unknown> => Promise.resolve({ ok: true, audited: true, itemId: "n" }),
);
const setDishPhoto = vi.fn(
  (): Promise<unknown> => Promise.resolve({ ok: false, reason: "storage" }),
);
const saveCategory = vi.fn(
  (): Promise<unknown> => Promise.resolve({ ok: true, audited: true, categoryId: "c" }),
);
const moveCategoryAction = vi.fn(
  (): Promise<unknown> => Promise.resolve({ ok: true, audited: true }),
);
vi.mock("@/lib/menu-studio", () => ({
  editDish: (...a: unknown[]) => editDish(...(a as [])),
  createDish: (...a: unknown[]) => createDish(...(a as [])),
  setDishPhoto: (...a: unknown[]) => setDishPhoto(...(a as [])),
  clearDishPhoto: vi.fn(() => Promise.resolve({ ok: true, audited: true, updatedAt: "x" })),
  saveCategory: (...a: unknown[]) => saveCategory(...(a as [])),
  moveCategoryAction: (...a: unknown[]) => moveCategoryAction(...(a as [])),
}));
const setMenuPrice = vi.fn((): Promise<unknown> => Promise.resolve({ ok: true, priceCents: 1600 }));
vi.mock("@/lib/menu-price", () => ({
  setMenuPrice: (...a: unknown[]) => setMenuPrice(...(a as [])),
}));
vi.mock("@/lib/menu-availability", () => ({ setItemSoldOut: vi.fn() }));
const resize = vi.fn((): Promise<Blob | null> => Promise.resolve(null));
vi.mock("@/lib/photo-resize", () => ({ resizePhoto: () => resize() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { MenuStudio } = await import("./MenuStudio");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CAT = "22222222-2222-4222-8222-222222222222";
const CAT2 = "33333333-3333-4333-8333-333333333333";
const priced = [
  {
    id: "d1",
    nameEn: "Mohinga",
    nameMy: null,
    priceCents: 1400,
    category: "Noodles",
    soldOut: false,
    soldOutAt: null,
  },
];
const dishes = [
  {
    id: "d1",
    nameEn: "Mohinga",
    nameMy: null,
    descriptionEn: null,
    descriptionMy: null,
    categoryId: CAT,
    taxCategory: "hot_prepared" as const,
    isActive: true,
    priceCents: 1400,
    imageUrl: null,
    updatedAt: "2026-10-24T09:00:00.000Z",
  },
  {
    id: "d2",
    nameEn: "Old soup",
    nameMy: null,
    descriptionEn: null,
    descriptionMy: null,
    categoryId: CAT,
    taxCategory: "hot_prepared" as const,
    isActive: false,
    priceCents: 900,
    imageUrl: null,
    updatedAt: "2026-10-24T09:00:00.000Z",
  },
];
const categories = [
  { id: CAT, name: "Noodles", sortOrder: 10, isActive: true, dishCount: 2 },
  { id: CAT2, name: "Curry", sortOrder: 20, isActive: true, dishCount: 0 },
];

function mount(manager = true) {
  return render(
    <StaffLangProvider lang="en">
      <MenuStudio
        items={priced}
        canEditPrice={manager}
        nowIso="2026-10-24T12:00:00.000Z"
        studio={manager ? { dishes, categories } : undefined}
      />
    </StaffLangProvider>,
  );
}
const dialog = () => screen.getByRole("dialog");
const region = () => dialog().querySelector('[role="status"]')!;
const submit = () =>
  act(async () => {
    fireEvent.submit(dialog().querySelector("form")!);
  });

describe("MenuStudio", () => {
  it("a server gets the list alone — no studio bar, no dish doors (`studio-ui/server-gets-studio`)", () => {
    mount(false);
    expect(screen.queryByRole("button", { name: /Add a dish/ })).toBeNull();
    expect(document.querySelector(".menu-thumb")).toBeNull();
  });

  it("a manager's row leads with its photo door; hidden dishes are listed apart", () => {
    mount();
    expect(
      screen.getByRole("button", { name: tf("en", "studio.dish.open", { x: "Mohinga" }) }),
    ).toBeTruthy();
    const hidden = screen.getByRole("region", { name: tf("en", "studio.hidden", { n: 1 }) });
    expect(within(hidden).getByText("Old soup")).toBeTruthy();
    // ONE live region in the view: the price list's.
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("an edit sends the sheet's fields with the stamp it read, and a moved price goes through setMenuPrice (`studio-ui/price-bypass`)", async () => {
    mount();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: tf("en", "studio.dish.open", { x: "Mohinga" }) }),
      );
    });
    fireEvent.change(document.getElementById("dish-name-my")!, {
      target: { value: "မုန့်ဟင်းခါး" },
    });
    fireEvent.change(document.getElementById("dish-price")!, { target: { value: "16" } });
    await submit();
    expect(editDish).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "d1",
        expectedUpdatedAt: "2026-10-24T09:00:00.000Z",
        nameMy: "မုန့်ဟင်းခါး",
        categoryId: CAT,
        isActive: true,
      }),
    );
    expect(setMenuPrice).toHaveBeenCalledWith({
      menuItemId: "d1",
      priceCents: 1600,
      expectedPriceCents: 1400,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("a stale save says so in the sheet and changes no price", async () => {
    editDish.mockResolvedValueOnce({ ok: false, reason: "stale" });
    mount();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: tf("en", "studio.dish.open", { x: "Mohinga" }) }),
      );
    });
    fireEvent.change(document.getElementById("dish-price")!, { target: { value: "16" } });
    await submit();
    expect(region().textContent).toBe(STAFF["studio.err.stale"].en);
    expect(setMenuPrice).not.toHaveBeenCalled();
  });

  it("Add a dish sends a new dish with its price; a blank name is refused out loud", async () => {
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add a dish/ }));
    });
    await submit();
    expect(createDish).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["studio.err.name"].en);
    fireEvent.change(document.getElementById("dish-name-en")!, {
      target: { value: "Shan noodles" },
    });
    fireEvent.change(document.getElementById("dish-price")!, { target: { value: "13.50" } });
    await submit();
    expect(createDish).toHaveBeenCalledWith(
      expect.objectContaining({ nameEn: "Shan noodles", priceCents: 1350, categoryId: CAT }),
    );
  });

  it("the photo control is a file input for the phone's camera or library, and an unreadable photo is said", async () => {
    mount();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: tf("en", "studio.dish.open", { x: "Mohinga" }) }),
      );
    });
    const input = document.getElementById("dish-photo") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    expect(screen.getByLabelText(STAFF["studio.dish.photo.take"].en)).toBe(input);
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] },
      });
    });
    expect(region().textContent).toBe(STAFF["studio.err.read"].en);
    expect(setDishPhoto).not.toHaveBeenCalled();
  });

  it("a re-read of the same dish (its own photo write) keeps the sheet's unsaved draft (`studio-ui/sheet-remounts-on-stamp`)", async () => {
    const view = mount();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: tf("en", "studio.dish.open", { x: "Mohinga" }) }),
      );
    });
    fireEvent.change(document.getElementById("dish-name-my")!, { target: { value: "ဒေါ်" } });
    view.rerender(
      <StaffLangProvider lang="en">
        <MenuStudio
          items={priced}
          canEditPrice
          nowIso="2026-10-24T12:00:00.000Z"
          studio={{
            dishes: dishes.map((d) =>
              d.id === "d1" ? { ...d, updatedAt: "2026-10-24T09:05:00.000Z", imageUrl: "x" } : d,
            ),
            categories,
          }}
        />
      </StaffLangProvider>,
    );
    expect((document.getElementById("dish-name-my") as HTMLInputElement).value).toBe("ဒေါ်");
  });

  it("categories: the top one cannot move up; Hide sends the category hidden (`studio-ui/hide-sends-shown`)", async () => {
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Categories/ }));
    });
    const up = screen.getByRole("button", { name: tf("en", "studio.cat.up", { x: "Noodles" }) });
    expect(up.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(up);
    });
    expect(moveCategoryAction).not.toHaveBeenCalled();
    const items = within(dialog()).getAllByRole("listitem");
    await act(async () => {
      fireEvent.click(within(items[1]!).getByRole("button", { name: /Hide/ }));
    });
    expect(saveCategory).toHaveBeenCalledWith({
      categoryId: CAT2,
      name: "Curry",
      isActive: false,
      expected: { name: "Curry", isActive: true },
    });
  });
});
