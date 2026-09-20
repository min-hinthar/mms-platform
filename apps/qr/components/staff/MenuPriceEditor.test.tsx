/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";

/**
 * Slice 6 (menu-1 · 2 · 3 · 4 · 5) — the price editor's feedback loop, pinned where it lives.
 *
 * ⚠️ Like `StaffPromoControl.test.tsx`, this file does NOT assert focus behaviour under `disabled`:
 * jsdom keeps focus on a natively disabled button where a real browser drops it to `<body>`, so a
 * green "keeps focus" assertion proves nothing. It asserts the STRUCTURE that decides it — no
 * control ever carries the native attribute — plus the re-entry guards that have to exist because
 * `aria-disabled` does not block a click.
 */
const setItemSoldOut = vi.fn();
const setMenuPrice = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/menu-availability", () => ({ setItemSoldOut: (v: unknown) => setItemSoldOut(v) }));
vi.mock("@/lib/menu-price", () => ({ setMenuPrice: (v: unknown) => setMenuPrice(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { MenuPriceEditor } = await import("./MenuPriceEditor");
type PricedItem = import("./MenuPriceEditor").PricedItem;

// 9:00 PM PDT on Sep 15 (04:00Z Sep 16) — the request's clock the page hands the editor.
const NOW = "2026-09-16T04:00:00.000Z";
const item = (over: Partial<PricedItem> = {}): PricedItem => ({
  id: "a1",
  nameEn: "Mohinga",
  nameMy: "မုန့်ဟင်းခါး",
  priceCents: 1200,
  category: "Soups",
  soldOut: false,
  soldOutAt: null,
  ...over,
});

function mount(items: PricedItem[], lang: "en" | "my" = "en", canEditPrice = true) {
  return render(
    <StaffLangProvider lang={lang}>
      <MenuPriceEditor items={items} canEditPrice={canEditPrice} nowIso={NOW} />
    </StaffLangProvider>,
  );
}
const status = () => screen.getByRole("status");
const pill = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

afterEach(cleanup);
beforeEach(() => {
  setItemSoldOut.mockReset();
  setMenuPrice.mockReset();
  refresh.mockReset();
  setItemSoldOut.mockResolvedValue({ ok: true, soldOut: true });
  setMenuPrice.mockResolvedValue({ ok: true, priceCents: 1450 });
});

describe("menu-1 — §17: no control here goes native `disabled`, and the guards are refs", () => {
  it("never renders the native attribute, at rest, mid-flight, or with a dead draft", async () => {
    let release!: (v: { ok: true; soldOut: boolean }) => void;
    setItemSoldOut.mockReturnValue(
      new Promise<{ ok: true; soldOut: boolean }>((r) => {
        release = r;
      }),
    );
    const { container } = mount([item()]);
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    const eightySix = pill("86 — Mohinga");
    fireEvent.click(eightySix);
    // Mid-flight: the pill is aria-disabled + busy, and STILL not native.
    expect(eightySix.getAttribute("aria-disabled")).toBe("true");
    expect(eightySix.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    await act(async () => {
      release({ ok: true, soldOut: true });
    });
    // The edit form with a no-op draft: Save is aria-disabled, never native.
    fireEvent.click(pill("Edit — Mohinga"));
    expect(pill("Save").getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("refuses a second 86 tap while the first is in flight — the ref, not the render", async () => {
    let release!: (v: { ok: true; soldOut: boolean }) => void;
    setItemSoldOut.mockReturnValue(
      new Promise<{ ok: true; soldOut: boolean }>((r) => {
        release = r;
      }),
    );
    mount([item()]);
    const eightySix = pill("86 — Mohinga");
    fireEvent.click(eightySix);
    fireEvent.click(eightySix);
    fireEvent.click(eightySix);
    // MUTATION: drop `if (flippingRef.current.has(i.id)) return;` — three taps, three writes; red.
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ ok: true, soldOut: true });
    });
  });

  it("refuses a second Set tap while a save is in flight", async () => {
    let release!: (v: { ok: true; priceCents: number }) => void;
    setMenuPrice.mockReturnValue(
      new Promise<{ ok: true; priceCents: number }>((r) => {
        release = r;
      }),
    );
    const { container } = mount([item()]);
    fireEvent.click(pill("Edit — Mohinga"));
    fireEvent.change(screen.getByLabelText("New price for Mohinga, in dollars"), {
      target: { value: "14.50" },
    });
    fireEvent.click(pill("Save"));
    const set = screen.getByRole("button", { name: /Set \$14\.50|Saving…/ });
    fireEvent.click(set);
    fireEvent.click(set);
    // MUTATION: drop `if (busyRef.current) return;` from `save()` — two writes; red.
    expect(setMenuPrice).toHaveBeenCalledTimes(1);
    expect(set.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    await act(async () => {
      release({ ok: true, priceCents: 1450 });
    });
  });
});

describe("menu-3 — the row shows what the server CONFIRMED before the refresh lands", () => {
  it("the 86 pill reads `Put back` the moment the server answers, and a second flip posts that state", async () => {
    mount([item()]);
    await act(async () => {
      fireEvent.click(pill("86 — Mohinga"));
    });
    expect(setItemSoldOut).toHaveBeenCalledWith({
      menuItemId: "a1",
      soldOut: true,
      expectedSoldOut: false,
    });
    // MUTATION: drop `record(i.id, { soldOut: r.soldOut })` — the pill still says 86 and the next
    // tap posts `expectedSoldOut: false` against a server that just said true; red on both.
    expect(refresh).toHaveBeenCalledTimes(1);
    const putBack = pill("Put back — Mohinga");
    expect(putBack.textContent).toContain("Put back");
    setItemSoldOut.mockResolvedValue({ ok: true, soldOut: false });
    await act(async () => {
      fireEvent.click(putBack);
    });
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "a1",
      soldOut: false,
      expectedSoldOut: true,
    });
    expect(pill("86 — Mohinga")).toBeTruthy();
  });

  it("a refusal changes nothing on the row — the prop is the truth, and the refresh is asked for", async () => {
    setItemSoldOut.mockResolvedValue({
      ok: false,
      error: "Someone else already marked Mohinga sold out — nothing changed.",
      code: "stale",
    });
    mount([item()]);
    await act(async () => {
      fireEvent.click(pill("86 — Mohinga"));
    });
    expect(pill("86 — Mohinga")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the confirmed override lets go once the list prop agrees", async () => {
    const { rerender } = mount([item()]);
    await act(async () => {
      fireEvent.click(pill("86 — Mohinga"));
    });
    expect(pill("Put back — Mohinga")).toBeTruthy();
    // The refresh landed: the prop says sold out with its stamp. The row must show the STAMP now
    // (it showed the bare "sold out" while only the override knew).
    rerender(
      <StaffLangProvider lang="en">
        <MenuPriceEditor
          items={[item({ soldOut: true, soldOutAt: "2026-09-16T03:40:00.000Z" })]}
          canEditPrice
          nowIso={NOW}
        />
      </StaffLangProvider>,
    );
    expect(pill("Put back — Mohinga")).toBeTruthy();
    expect(screen.getByText(/sold out since/).textContent?.replace(/\u202f/g, " ")).toContain(
      "8:40 PM",
    );
    // …and it is SPENT: another tablet puts the dish back, the next refresh says so, and the row
    // must follow the prop — a stale override that was never let go would still say `Put back`.
    // MUTATION: skip the reconcile on a new `items` array — red here.
    rerender(
      <StaffLangProvider lang="en">
        <MenuPriceEditor items={[item()]} canEditPrice nowIso={NOW} />
      </StaffLangProvider>,
    );
    expect(pill("86 — Mohinga")).toBeTruthy();
  });

  it("a list that DISAGREES on arrival wins — a second writer inside the window is the truth, and the next tap posts its state", async () => {
    // The KDS puts Mohinga back before this tablet's refresh lands: the list says available. An
    // override kept "while the prop disagrees" would pin the row to `Put back` and refuse every
    // retry forever (the blind pass, slice 6).
    const { rerender } = mount([item()]);
    await act(async () => {
      fireEvent.click(pill("86 — Mohinga"));
    });
    expect(pill("Put back — Mohinga")).toBeTruthy();
    // MUTATION: keep an override whose value the prop disagrees with — `Put back` survives the
    // list below and the tap posts `expectedSoldOut: true` against an available dish; red.
    rerender(
      <StaffLangProvider lang="en">
        <MenuPriceEditor items={[item({ soldOut: false })]} canEditPrice nowIso={NOW} />
      </StaffLangProvider>,
    );
    const eightySix = pill("86 — Mohinga");
    await act(async () => {
      fireEvent.click(eightySix);
    });
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "a1",
      soldOut: true,
      expectedSoldOut: false,
    });
  });

  it("a saved price yields the same way: the list that arrives after it is newer than it", async () => {
    setMenuPrice.mockResolvedValue({ ok: true, priceCents: 1450 });
    const { rerender } = mount([item()]);
    fireEvent.click(pill("Edit — Mohinga"));
    fireEvent.change(screen.getByLabelText("New price for Mohinga, in dollars"), {
      target: { value: "14.50" },
    });
    fireEvent.click(pill("Save"));
    await act(async () => {
      fireEvent.click(pill("Set $14.50"));
    });
    expect(screen.getByText("$14.50")).toBeTruthy();
    // Another manager set $16.00 in the meantime and the list says so: the row must ring $16.00,
    // not the $14.50 this tablet confirmed a moment earlier.
    rerender(
      <StaffLangProvider lang="en">
        <MenuPriceEditor items={[item({ priceCents: 1600 })]} canEditPrice nowIso={NOW} />
      </StaffLangProvider>,
    );
    expect(screen.queryByText("$14.50")).toBeNull();
    expect(screen.getByText("$16.00")).toBeTruthy();
  });

  it("a saved price rings on the row at once, quoting the SERVER's amount", async () => {
    setMenuPrice.mockResolvedValue({ ok: true, priceCents: 1475 }); // the server rounded differently
    mount([item()]);
    fireEvent.click(pill("Edit — Mohinga"));
    fireEvent.change(screen.getByLabelText("New price for Mohinga, in dollars"), {
      target: { value: "14.50" },
    });
    fireEvent.click(pill("Save"));
    await act(async () => {
      fireEvent.click(pill("Set $14.50"));
    });
    // MUTATION: drop `record(current.id, { priceCents: res.priceCents })` — the row still reads
    // $12.00 until the refresh; red.
    expect(screen.getByText("$14.75")).toBeTruthy();
    expect(status().textContent).toContain("$14.75");
  });
});

describe("menu-2 — ONE sr-only live region, and the verdict echoed in the acted row", () => {
  it("the region never changes geometry; the row carries the same words, aria-hidden", async () => {
    const { container } = mount([item(), item({ id: "b2", nameEn: "Shan Noodles" })]);
    const region = status();
    const before = region.getAttribute("style");
    await act(async () => {
      fireEvent.click(pill("86 — Shan Noodles"));
    });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    // MUTATION: `style={msg ? okLine : srOnly}` again — the region grows a line above the list; red.
    expect(region.getAttribute("style")).toBe(before);
    expect(region.textContent).toBe(
      STAFF["browse.price.live.off"].en.replace("{x}", "Shan Noodles"),
    );
    // The echo sits in Shan Noodles' row and nowhere else.
    const rows = [...container.querySelectorAll("li")];
    const echoes = rows.map((li) => li.querySelector('p[aria-hidden="true"]'));
    expect(echoes[0]).toBeNull();
    expect(echoes[1]?.textContent).toBe(region.textContent);
  });

  it("a server sentence is echoed too, in the row that was refused", async () => {
    setItemSoldOut.mockResolvedValue({ ok: false, error: "Custom refusal.", code: "stale" });
    const { container } = mount([item()]);
    await act(async () => {
      fireEvent.click(pill("86 — Mohinga"));
    });
    expect(container.querySelector('li p[aria-hidden="true"]')?.textContent).toBe(
      "Custom refusal.",
    );
    expect(status().textContent).toBe("Custom refusal.");
  });
});

describe("menu-5 — the draft says WHY it cannot be saved, and Return does what Save does", () => {
  function openEdit() {
    mount([item()]);
    fireEvent.click(pill("Edit — Mohinga"));
    return screen.getByLabelText("New price for Mohinga, in dollars") as HTMLInputElement;
  }

  it("opens with the current price, Save refused and the reason beside the field", () => {
    const field = openEdit();
    expect(field.value).toBe("12.00");
    const save = pill("Save");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    // MUTATION: drop the `unchanged` hint arm — the field describes nothing; red.
    const hint = document.getElementById(field.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toContain(STAFF["browse.price.draft.unchanged"].en);
    // An untouched value equal to the current price is not INVALID — it conforms to the format
    // and the range; there is simply nothing to save. `aria-invalid` is reserved for the three
    // verdicts that mean "does not conform".
    expect(field.hasAttribute("aria-invalid")).toBe(false);
  });

  it("an EMPTY field is a refused draft with a stated reason too, and is not marked invalid", () => {
    const field = openEdit();
    fireEvent.change(field, { target: { value: "" } });
    expect(pill("Save").getAttribute("aria-disabled")).toBe("true");
    // MUTATION: drop the `empty` hint arm — the dead grey Save with no sentence is back; red.
    const hint = document.getElementById(field.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toContain("Enter a price, like 14.50");
    expect(field.hasAttribute("aria-invalid")).toBe(false);
  });

  it("names the floor, the ceiling and the shape; a good draft clears the hint and lights Save", () => {
    const field = openEdit();
    const hint = () =>
      document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent;
    fireEvent.change(field, { target: { value: "0.10" } });
    expect(hint()).toContain("Lowest price is $0.25");
    // MUTATION: `aria-invalid={hintKey !== null || undefined}` again — `unchanged` and `empty`
    // read as invalid; the case above reddens. Here a range violation IS invalid.
    expect(field.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(field, { target: { value: "6000" } });
    expect(hint()).toContain("Highest price is $5000.00");
    fireEvent.change(field, { target: { value: "12,50" } });
    expect(hint()).toContain("Numbers only, like 14.50");
    fireEvent.change(field, { target: { value: "14.50" } });
    expect(field.hasAttribute("aria-describedby")).toBe(false);
    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(pill("Save").getAttribute("aria-disabled")).toBeNull();
  });

  it("a refused Save tap does nothing and keeps its name; Return opens the confirm when the draft is good", () => {
    const field = openEdit();
    fireEvent.click(pill("Save"));
    expect(screen.queryByRole("group")).toBeNull();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.queryByRole("group")).toBeNull();
    fireEvent.change(field, { target: { value: "14.50" } });
    // MUTATION: drop `onKeyDown={onDraftKey}` — Return does nothing after typing 14.50; red.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("group", { name: /Confirm the new price/ })).toBeTruthy();
    expect(field.getAttribute("enterkeyhint")).toBe("done");
  });
});

describe("menu-4 — a stamp from another service day carries its day and the warn ink", () => {
  it("same evening: the clock alone; yesterday: the day too", () => {
    mount([
      item({ id: "t", nameEn: "Tonight", soldOut: true, soldOutAt: "2026-09-16T01:40:00.000Z" }),
      item({ id: "y", nameEn: "Yesterday", soldOut: true, soldOutAt: "2026-09-15T01:40:00.000Z" }),
    ]);
    const tags = [...document.querySelectorAll("li p span")].filter((s) =>
      /sold out since/.test(s.textContent ?? ""),
    ) as HTMLElement[];
    expect(tags).toHaveLength(2);
    const plain = (s: string | null) => (s ?? "").replace(/\u202f/g, " ");
    expect(plain(tags[0]!.textContent)).toContain("sold out since 6:40 PM");
    expect(tags[0]!.style.color).toBe("var(--t3)");
    // MUTATION: render `staffClock` for every stamp — yesterday's reads `6:40 PM` too; red.
    expect(plain(tags[1]!.textContent)).toContain("sold out since Sep 14, 6:40 PM");
    expect(tags[1]!.style.color).toBe("var(--warn)");
  });
});

describe("the sold-out chip", () => {
  it("counts what is off the menu, narrows the list when pressed, and lets go when the count is zero", async () => {
    mount([item(), item({ id: "b2", nameEn: "Shan Noodles", soldOut: true })]);
    const chip = screen.getByRole("button", { name: "Sold out (1)" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByText("Shan Noodles")).toBeTruthy();
    // Put the last one back: the chip has nothing to show and unmounts, the list is whole again.
    setItemSoldOut.mockResolvedValue({ ok: true, soldOut: false });
    await act(async () => {
      fireEvent.click(pill("Put back — Shan Noodles"));
    });
    expect(screen.queryByRole("button", { name: /Sold out \(/ })).toBeNull();
    expect(document.querySelectorAll("li")).toHaveLength(2);
  });

  it("keeps the acted row under the chip — focus stays on its pill and the echo stays in view", async () => {
    mount([
      item({ id: "s1", nameEn: "Shan Noodles", soldOut: true }),
      item({ id: "s2", nameEn: "Tea Leaf Salad", soldOut: true }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Sold out (2)" }));
    expect(document.querySelectorAll("li")).toHaveLength(2);
    const putBack = pill("Put back — Shan Noodles");
    putBack.focus();
    setItemSoldOut.mockResolvedValue({ ok: true, soldOut: false });
    await act(async () => {
      fireEvent.click(putBack);
    });
    // MUTATION: drop `msg?.id ?? null` from the filter — the row unmounts under the focused pill,
    // focus falls to <body> and the echo is rendered nowhere; red on all three.
    expect(document.querySelectorAll("li")).toHaveLength(2);
    expect(document.activeElement).toBe(putBack);
    expect(putBack.textContent).toContain("86");
    expect(document.querySelector('li p[aria-hidden="true"]')?.textContent).toBe(
      STAFF["browse.price.live.on"].en.replace("{x}", "Shan Noodles"),
    );
    expect(screen.getByRole("button", { name: "Sold out (1)" })).toBeTruthy();
    // The next action moves `msg` on, and the row leaves with it.
    setItemSoldOut.mockResolvedValue({ ok: true, soldOut: false });
    await act(async () => {
      fireEvent.click(pill("Put back — Tea Leaf Salad"));
    });
    expect(screen.queryByRole("button", { name: /Sold out \(/ })).toBeNull();
    expect(document.querySelectorAll("li")).toHaveLength(2); // the chip let go: everything shows
  });

  it("lets go of its STATE at zero — the next 86 remounts the chip unpressed and hides nothing", async () => {
    mount([item(), item({ id: "b2", nameEn: "Shan Noodles", soldOut: true })]);
    fireEvent.click(screen.getByRole("button", { name: "Sold out (1)" }));
    setItemSoldOut.mockResolvedValue({ ok: true, soldOut: false });
    await act(async () => {
      fireEvent.click(pill("Put back — Shan Noodles"));
    });
    expect(screen.queryByRole("button", { name: /Sold out \(/ })).toBeNull();
    // MUTATION: drop `if (soldOutOnly && soldOutCount === 0) setSoldOutOnly(false);` — the chip
    // comes back PRESSED and the list collapses to one row without a tap; red.
    setItemSoldOut.mockResolvedValue({ ok: true, soldOut: true });
    await act(async () => {
      fireEvent.click(pill("86 — Mohinga"));
    });
    const chip = screen.getByRole("button", { name: "Sold out (1)" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelectorAll("li")).toHaveLength(2);
  });

  it("under the chip the empty state names the filter, never a false `No dish matches`", () => {
    mount([item(), item({ id: "b2", nameEn: "Shan Noodles", soldOut: true })]);
    fireEvent.click(screen.getByRole("button", { name: "Sold out (1)" }));
    fireEvent.change(screen.getByLabelText("Find a dish"), { target: { value: "Mohinga" } });
    expect(document.querySelectorAll("li")).toHaveLength(0);
    // MUTATION: render `browse.price.noMatch` unconditionally — "No dish matches “Mohinga”." while
    // Mohinga is on the list behind the chip; red.
    expect(screen.getByText(/No sold-out dish matches/)).toBeTruthy();
    expect(screen.queryByText(/^No dish matches/)).toBeNull();
  });

  it("speaks Burmese numerals under the Burmese console", () => {
    mount([item({ soldOut: true })], "my");
    expect(screen.getByRole("button", { name: /ဖြုတ်ထားတာ \(၁\)/ })).toBeTruthy();
  });
});
