/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";

/**
 * M190 (lifecycle residuals) — the market's sold-out list on /staff/menu?shelf=market, in the menu's
 * own vocabulary: the posted flip carries the state the row SHOWED, a bounce is refused on a ref
 * (never native `disabled`), the confirmed value is laid over the list before the refresh lands, and
 * the outcome rides ONE live region. The authority is `setGroceryAvailable` (lib, mutated); this pins
 * the wiring that has nowhere else to live.
 */
const setGroceryAvailable = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/market-availability", () => ({
  setGroceryAvailable: (v: unknown) => setGroceryAvailable(v),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { MarketShelfEditor } = await import("./MarketShelfEditor");
type ShelfItem = import("./MarketShelfEditor").ShelfItem;

const jar = (over: Partial<ShelfItem> = {}): ShelfItem => ({
  barcode: "88800011",
  nameEn: "Pickled tea leaf",
  nameMy: "လက်ဖက်",
  aisleEn: "Tea Leaf & Laphet",
  aisleMy: "လက်ဖက်",
  detail: "",
  available: true,
  ...over,
});
const MARK = STAFF["browse.price.verb.eightySix"].en;
const BACK = STAFF["browse.price.verb.putBack"].en;

function mount(items: ShelfItem[], lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <MarketShelfEditor items={items} />
    </StaffLangProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  setGroceryAvailable.mockReset();
  refresh.mockReset();
  setGroceryAvailable.mockResolvedValue({ ok: true, available: false });
});

describe("MarketShelfEditor — the market's sold-out toggle", () => {
  it("posts the flip against the state the row SHOWED, and says it in the ONE region", async () => {
    const { container } = mount([jar()]);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const pill = screen.getByRole("button", { name: `${MARK} — Pickled tea leaf` });
    await act(async () => {
      fireEvent.click(pill);
    });
    expect(setGroceryAvailable).toHaveBeenCalledWith({
      barcode: "88800011",
      available: false,
      expectedAvailable: true,
    });
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["browse.market.live.out"].en.replace("{x}", "Pickled tea leaf"),
    );
    // The confirmed value is on the row before the refresh lands: the verb is Put back now.
    expect(screen.getByRole("button", { name: `${BACK} — Pickled tea leaf` })).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("a bounce is refused on the ref while the first flip is in the air", async () => {
    let release!: (v: { ok: true; available: boolean }) => void;
    setGroceryAvailable.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    mount([jar()]);
    const pill = screen.getByRole("button", { name: `${MARK} — Pickled tea leaf` });
    fireEvent.click(pill);
    fireEvent.click(pill);
    expect(setGroceryAvailable).toHaveBeenCalledTimes(1);
    expect(pill.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      release({ ok: true, available: false });
    });
  });

  it("a refusal says the server's sentence and refreshes the stale screen", async () => {
    setGroceryAvailable.mockResolvedValue({
      ok: false,
      code: "stale",
      error: "Someone else already marked Pickled tea leaf out of stock — nothing changed.",
    });
    mount([jar()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `${MARK} — Pickled tea leaf` }));
    });
    expect(screen.getByRole("status").textContent).toMatch(/Someone else already marked/);
    expect(refresh).toHaveBeenCalled();
    // A refusal changes nothing on the row: the verb is still Mark sold out.
    expect(screen.getByRole("button", { name: `${MARK} — Pickled tea leaf` })).toBeTruthy();
  });

  it("the server's outage sentence reads in Burmese on a Burmese console (Codex r2 on #363)", async () => {
    // `setGroceryAvailable` returns its outage as a plain English string; `<OutageText>` twins it by
    // identity. Unregistered, a Burmese tablet shows the English sentence.
    setGroceryAvailable.mockResolvedValue({
      ok: false,
      code: "sentence",
      error: STAFF["browse.market.err.outage"].en,
    });
    mount([jar()], "my");
    await act(async () => {
      fireEvent.click(
        screen
          .getAllByRole("button")
          .find((b) =>
            /Pickled tea leaf/.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
          )!,
      );
    });
    const region = screen.getByRole("status");
    expect(region.textContent).toBe(STAFF["browse.market.err.outage"].my);
    expect(region.querySelector('[lang="my"]')).toBeTruthy();
  });

  it("a LOST answer says the write may or may not have landed, keeps the shown state, and refreshes", async () => {
    setGroceryAvailable.mockRejectedValue(new Error("network"));
    mount([jar()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `${MARK} — Pickled tea leaf` }));
    });
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["browse.market.err.flipUnknown"].en.replace("{x}", "Pickled tea leaf"),
    );
    // Nothing confirmed: the row keeps the verb it showed until the refresh brings the truth.
    expect(screen.getByRole("button", { name: `${MARK} — Pickled tea leaf` })).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("a sold-out item offers Put back, and the chip narrows the list to what is sold out", () => {
    mount([jar(), jar({ barcode: "88800022", nameEn: "Mohinga paste", available: false })]);
    expect(screen.getByRole("button", { name: `${BACK} — Mohinga paste` })).toBeTruthy();
    const chip = screen.getByRole("button", { name: "Sold out (1)" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: `${MARK} — Pickled tea leaf` })).toBeNull();
  });

  it("the list is named, and finds an aisle by its Burmese name", () => {
    mount([
      jar(),
      jar({
        barcode: "88800022",
        nameEn: "Fish sauce",
        aisleEn: "Cooking",
        aisleMy: "ချက်ပြုတ်ရန်",
      }),
    ]);
    expect(screen.getByRole("list", { name: STAFF["browse.market.a11y.list"].en })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Find an item/), { target: { value: "ချက်ပြုတ်" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Fish sauce")).toBeTruthy();
  });

  it("two rows with one name are told apart — on screen and in each control's name (Codex on #363)", async () => {
    // The catalog carries same-name, same-aisle rows (three ThaNatKhar in home-personal): a list that
    // printed the name alone let staff 86 the wrong SKU.
    const name = "ThaNatKhar";
    mount([
      jar({
        barcode: "2990160305030",
        nameEn: name,
        detail: "Shwe Pyi Nan · $3.36 · 2990160305030",
      }),
      jar({
        barcode: "2990160305078",
        nameEn: name,
        detail: "Shwe Pyi Nan · $4.93 · 2990160305078",
      }),
    ]);
    const a = screen.getByRole("button", {
      name: `${MARK} — ${name} · Shwe Pyi Nan · $3.36 · 2990160305030`,
    });
    const b = screen.getByRole("button", {
      name: `${MARK} — ${name} · Shwe Pyi Nan · $4.93 · 2990160305078`,
    });
    expect(a).not.toBe(b);
    expect(screen.getByText("Shwe Pyi Nan · $3.36 · 2990160305030")).toBeTruthy();
    expect(screen.getByText("Shwe Pyi Nan · $4.93 · 2990160305078")).toBeTruthy();
    // The live line names the SKU that changed, not only the name both rows share.
    await act(async () => {
      fireEvent.click(b);
    });
    expect(setGroceryAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: "2990160305078" }),
    );
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["browse.market.live.out"].en.replace(
        "{x}",
        `${name} · Shwe Pyi Nan · $4.93 · 2990160305078`,
      ),
    );
  });
});
