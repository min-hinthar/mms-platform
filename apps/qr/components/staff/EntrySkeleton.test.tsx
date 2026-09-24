/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";

vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({
  lockConsole: vi.fn(),
  unlockConsole: vi.fn(),
  releaseLockAfterSignOut: vi.fn(),
}));
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { EntrySkeleton } = await import("./EntrySkeleton");
const { StaffBar } = await import("./StaffBar");
const { StaffLangProvider } = await import("./StaffLangProvider");
const { StaffLogin } = await import("./StaffLogin");
const { PinUnlock } = await import("./PinUnlock");
const { default: LoginLoading } = await import("@/app/staff/login/loading");
const { default: LockLoading } = await import("@/app/staff/lock/loading");

/**
 * signin-1 — the front door's skeleton stands where the page will: a `.staff-bar`-shaped band with
 * a tail, exactly as `<StaffBar>` nests them, then the pages' own column class holding one card
 * drawn in EACH route's first shape. The column class is read off the two pages' SOURCE (parsed,
 * not grepped); the card's shape is held to the LIVE forms — the email step of `StaffLogin`, the
 * PIN form of `PinUnlock` — by field count, pill count, escape-link count and the brand line, so a
 * form that grows a field reddens this rather than shifting under a thumb (a first cut drew two
 * fields for both routes and shifted the card on resolve — Codex round 2 on #298).
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

/** The skeleton card's shape, read off the blocks' own inline sizes (jsdom keeps `var()`). */
function skeletonShape(card: Element) {
  const blocks = [...card.querySelectorAll<HTMLElement>(":scope > .mms-skeleton")];
  const at = (h: string, r: string) =>
    blocks.filter((b) => b.style.height === h && b.style.borderRadius === r).length;
  return {
    fields: at("52px", "var(--r-sm)"),
    pills: at("52px", "var(--r-full)"),
    links: blocks.filter((b) => b.style.height === "44px").length,
    brand: blocks[0]?.style.height === "12px",
  };
}
/** The live form's shape, read off its own classes. */
function liveShape(root: Element) {
  return {
    fields: root.querySelectorAll("input").length,
    pills: root.querySelectorAll(".entry-primary, .entry-secondary").length,
    links: root.querySelectorAll(".entry-link").length,
    brand: root.querySelector(".entry-brand") !== null,
  };
}

describe("EntrySkeleton", () => {
  it("is bar-shaped where the bar is — the band and its tail nested as <StaffBar> nests them, the root busy", () => {
    const sk = mount(<EntrySkeleton what="what.console" form="login" />);
    const main = sk.querySelector("main.staff-main")!;
    expect(main).not.toBeNull();
    expect(main.getAttribute("aria-busy")).toBe("true"); // a fallback says it is loading
    const band = main.querySelector("[aria-hidden] > .staff-bar")!;
    expect(band).not.toBeNull();
    expect(band.querySelector(":scope > .staff-bar-tail")).not.toBeNull();
    const live = mount(
      <StaffBar lang="en" title="entry.login.title" leading={{ kind: "here", icon: "people" }} />,
    );
    const bar = live.querySelector("header.staff-bar")!;
    expect(bar.querySelector(":scope > .staff-bar-tail")).not.toBeNull();
    // the same shape: a leading circle, a title block, a tail of circles. Phase 2b · feedback — the
    // bar's `hidden` height probe (StaffBarNet) is `display: none`: no flex item, no gap, no shape;
    // and its always-mounted offline region is `.sr-only` while online (absolutely positioned — out
    // of the flex flow, no gap) until the row it becomes is needed.
    const laidOut = (el: Element) =>
      [...el.children].filter(
        (c) => !(c as HTMLElement).hidden && !c.classList.contains("sr-only"),
      );
    expect(laidOut(bar)).toHaveLength(bar.children.length - 2);
    expect(band.children.length).toBe(laidOut(bar).length);
  });
  it("is column-shaped where the card is — the pages' OWN column class, holding one entry card", () => {
    const sk = mount(<EntrySkeleton what="what.console" form="login" />);
    const col = sk.querySelector("[aria-hidden] > .staff-bar + .staff-col")!;
    expect(col).not.toBeNull();
    expect(col.className).toBe("staff-col entry-col");
    for (const page of ["login/page.tsx", "lock/page.tsx"])
      expect(classNames(page).has(col.className), page).toBe(true);
    expect(col.querySelectorAll(":scope > .card.card-textured.entry-card").length).toBe(1);
    expect(sk.querySelector(".staff-zone")).toBeNull(); // never the floor's three zones
  });
  it("the login variant is the email step's shape: brand line, one field, the Google pill + the primary, no escape link", () => {
    const live = liveShape(mount(<StaffLogin lang="en" />));
    expect(live).toEqual({ fields: 1, pills: 2, links: 0, brand: true });
    cleanup();
    const card = mount(<EntrySkeleton what="what.console" form="login" />).querySelector(
      ".entry-card",
    )!;
    expect(skeletonShape(card)).toEqual(live);
  });
  it("the lock variant is the PIN form's shape: no brand line, one field, the primary, the escape link", () => {
    const live = liveShape(mount(<PinUnlock lang="en" displayName="Daw Hla" />));
    expect(live).toEqual({ fields: 1, pills: 1, links: 1, brand: false });
    cleanup();
    const card = mount(<EntrySkeleton what="what.lock" form="lock" />).querySelector(
      ".entry-card",
    )!;
    expect(skeletonShape(card)).toEqual(live);
  });
  it("offers the dictionary's line for the screen it stands in for, and each front-door route wears its own variant", () => {
    const login = mount(<LoginLoading />);
    expect(login.querySelector(".sr-only")?.textContent).toBe("Loading the console…");
    expect(login.querySelector('.entry-card[data-form="login"]')).not.toBeNull();
    cleanup();
    const lock = mount(<LockLoading />);
    expect(lock.querySelector(".sr-only")?.textContent).toBe("Loading the lock screen…");
    expect(lock.querySelector('.entry-card[data-form="lock"]')).not.toBeNull();
  });
});
