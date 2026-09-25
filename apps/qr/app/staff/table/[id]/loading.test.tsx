/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2c · pad — `[id]/loading.tsx` is the boundary Next shows for a NEW `[id]`, which is exactly
 * what a register mint pushes to (`/staff/table/{new}/add`). As a client boundary it reads the path
 * and draws the ORDER PAD's skeleton for `/add`, the drill-down's otherwise — before this, every
 * walk-up and phone order opened on the table page's skeleton.
 */
const h = vi.hoisted(() => ({ path: "/staff/table/abc" }));
vi.mock("next/navigation", () => ({ usePathname: () => h.path }));

const { StaffLangProvider } = await import("@/components/staff/StaffLangProvider");
const { default: TableDetailLoading } = await import("./loading");

function mount(path: string) {
  h.path = path;
  return render(
    <StaffLangProvider lang="en">
      <TableDetailLoading />
    </StaffLangProvider>,
  );
}

afterEach(cleanup);

describe("[id]/loading — the pad's skeleton on a register mint", () => {
  it("a path ending in /add draws the pad's geometry", () => {
    mount("/staff/table/11111111-1111-4111-8111-111111111111/add");
    // MUTATION: the path check dropped — the drill-down skeleton on every counter order; red.
    expect(document.querySelector("main.pad-main .pad-skeleton")).not.toBeNull();
    expect(document.body.textContent).toContain("Loading this order…");
  });

  it("the table itself keeps the drill-down skeleton", () => {
    mount("/staff/table/11111111-1111-4111-8111-111111111111");
    expect(document.querySelector(".pad-skeleton")).toBeNull();
    expect(document.body.textContent).toContain("Loading this table…");
  });
});
