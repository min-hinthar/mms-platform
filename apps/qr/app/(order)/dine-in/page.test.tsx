/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { dineInMenuHref } from "@/lib/table-pick";

/**
 * Phase 3c-ii (D27) — `/dine-in` no longer asks "Which table are you at?" before the menu: the
 * route STAYS (the manifest's jump list names it, `ActiveOrderProvider` and `diner-tabs` read the
 * path as the dine-in door) and REDIRECTS to the dine-in menu on today's bare host-start — the ONE
 * builder's href, the same string the home's Dine-in door carries. The table is asked inside the
 * first Send (`TableBindSheet`), once, on an unbound session.
 */
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

const { default: DineIn } = await import("./page");

describe("/dine-in", () => {
  it("enters the dine-in MENU on a bare host-start — the one builder's href, never the picker", () => {
    DineIn();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(dineInMenuHref({}));
    expect(redirect).toHaveBeenCalledWith("/menu?mode=dinein&door=dinein");
  });
});
