/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";

vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { EntrySkeleton } = await import("./EntrySkeleton");
const { StaffBar } = await import("./StaffBar");
const { StaffLangProvider } = await import("./StaffLangProvider");
const { default: LoginLoading } = await import("@/app/staff/login/loading");
const { default: LockLoading } = await import("@/app/staff/lock/loading");

/**
 * signin-1 — the front door's skeleton stands where the page will: a `.staff-bar`-shaped band with
 * a tail, exactly as `<StaffBar>` nests them, then the pages' own column class holding one card.
 * The column class is read off the two pages' SOURCE (parsed, not grepped), so a page that moved
 * to a different column would redden this rather than drift under a thumb. The announced line is
 * the dictionary's, for the screen the skeleton stands in for.
 */
afterEach(cleanup);
const mount = (ui: React.ReactElement) =>
  render(<StaffLangProvider lang="en">{ui}</StaffLangProvider>).container;

/** Every string-literal `className` a page's JSX declares. */
function classNames(file: string): Set<string> {
  const src = readFileSync(join(__dirname, "../../app/staff", file), "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText() === "className" &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    )
      out.add(node.initializer.text);
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  };
  visit(sf);
  return out;
}

describe("EntrySkeleton", () => {
  it("is bar-shaped where the bar is — the band and its tail nested as <StaffBar> nests them", () => {
    const sk = mount(<EntrySkeleton what="what.console" />);
    const main = sk.querySelector("main.staff-main")!;
    expect(main).not.toBeNull();
    const band = main.querySelector("[aria-hidden] > .staff-bar")!;
    expect(band).not.toBeNull();
    expect(band.querySelector(":scope > .staff-bar-tail")).not.toBeNull();
    const live = mount(
      <StaffBar lang="en" title="entry.login.title" leading={{ kind: "here", icon: "people" }} />,
    );
    const bar = live.querySelector("header.staff-bar")!;
    expect(bar.querySelector(":scope > .staff-bar-tail")).not.toBeNull();
    // the same shape: a leading circle, a title block, a tail of circles
    expect(band.children.length).toBe(bar.children.length);
  });
  it("is column-shaped where the card is — the pages' OWN column class, holding one entry card", () => {
    const sk = mount(<EntrySkeleton what="what.console" />);
    const col = sk.querySelector("[aria-hidden] > .staff-bar + .staff-col")!;
    expect(col).not.toBeNull();
    expect(col.className).toBe("staff-col entry-col");
    for (const page of ["login/page.tsx", "lock/page.tsx"])
      expect(classNames(page).has(col.className), page).toBe(true);
    expect(col.querySelectorAll(":scope > .card.card-textured.entry-card").length).toBe(1);
    expect(sk.querySelector(".staff-zone")).toBeNull(); // never the floor's three zones
  });
  it("announces the dictionary's line for the screen it stands in for, and both front-door routes wear it", () => {
    const login = mount(<LoginLoading />);
    expect(login.querySelector(".sr-only")?.textContent).toBe("Loading the console…");
    expect(login.querySelector(".staff-col.entry-col")).not.toBeNull();
    cleanup();
    const lock = mount(<LockLoading />);
    expect(lock.querySelector(".sr-only")?.textContent).toBe("Loading the lock screen…");
    expect(lock.querySelector(".staff-col.entry-col")).not.toBeNull();
  });
});
