/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WelcomeBack } from "@/lib/rewards";
import { DINER_GUIDE_COOKIE, DINER_GUIDE_KEY } from "@/lib/diner-guide";

/**
 * PD11 — the FIRST RUN's wiring: the guide opens by itself exactly when the provider's facts AT THE
 * MOMENT OF DECISION say so (the session answered: joined with its first view, or refused), it is
 * marked before it shows, the server is asked for its cookie, and every exit lands on the menu's
 * heading. The provider is ONE mocked module (a mutable fixture); the dialog is the real one.
 */
type Cart = {
  cartId: string | null;
  dbNow: string | null;
  error: string | null;
  locked: boolean;
  settling: boolean;
  role: "host" | "guest" | null;
  tableNumber: number | null;
  me: { seat: string; name: string } | null;
  members: { seat: string; name: string }[];
};
const cart = vi.hoisted(() => ({ current: {} as Cart }));
vi.mock("@/components/TableCartProvider", () => ({ useCart: () => cart.current }));
vi.mock("posthog-js", () => ({ default: { capture: () => {} } }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));

const { DinerGuideFirstRun, MENU_HEADING_SELECTOR } = await import("./DinerGuideFirstRun");

const WAITING: Cart = {
  cartId: null,
  dbNow: null,
  error: null,
  locked: false,
  settling: false,
  role: "guest",
  tableNumber: 7,
  me: null,
  members: [],
};
const JOINED: Cart = {
  ...WAITING,
  cartId: "cart-1",
  dbNow: "2026-10-11T18:00:00.000Z",
  me: { seat: "s1", name: "Thiri" },
};
const NEW: WelcomeBack = { name: null, ordersThisMonth: 0 };
const settle = () => act(async () => {});
const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

function Menu({ mode = "dinein", welcome = NEW }: { mode?: string; welcome?: WelcomeBack | null }) {
  return (
    <main>
      <h1 className="menu-title" tabIndex={-1}>
        Menu
      </h1>
      <DinerGuideFirstRun mode={mode} welcome={welcome} />
    </main>
  );
}
/** Mount while the session is still minting, then let it answer with `answer`. */
async function arrive(answer: Partial<Cart>, props: Parameters<typeof Menu>[0] = {}) {
  cart.current = { ...WAITING };
  const r = render(<Menu {...props} />);
  await settle();
  cart.current = { ...JOINED, ...answer };
  r.rerender(<Menu {...props} />);
  await settle();
  return r;
}
/** The guide's own dialog (another test plants a bare `role="dialog"` of its own). */
const guide = () => document.querySelector<HTMLElement>('.diner-guide[role="dialog"]');

beforeEach(() => {
  localStorage.clear();
  document.cookie = `${DINER_GUIDE_COOKIE}=; Max-Age=0; path=/`;
  window.history.replaceState(null, "", "/menu?mode=dinein");
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the first run — once, at the moment the session answers", () => {
  it("nothing while the session mints; opens once it has joined and read its first view, marked first", async () => {
    cart.current = { ...WAITING };
    const r = render(<Menu />);
    await settle();
    expect(guide()).toBeNull();
    expect(localStorage.getItem(DINER_GUIDE_KEY)).toBeNull();
    // Joined, but the first view has not landed (its lock and freeze are still the defaults): wait.
    cart.current = { ...JOINED, dbNow: null };
    r.rerender(<Menu />);
    await settle();
    expect(guide()).toBeNull();
    cart.current = { ...JOINED };
    r.rerender(<Menu />);
    await settle();
    expect(guide()).not.toBeNull();
    expect(localStorage.getItem(DINER_GUIDE_KEY)).toBe("1");
    // MUTATION (pd11/first-run/server-mark-dropped): the cookie never asked for — Safari's seven-day
    // clear brings the guide back to a monthly regular; red.
    expect(fetchMock).toHaveBeenCalledWith("/api/guide-seen", { method: "POST", keepalive: true });
  });

  it("never twice on this phone", async () => {
    const r = await arrive({});
    expect(guide()).not.toBeNull();
    r.unmount();
    await arrive({});
    expect(guide()).toBeNull();
  });

  it("a phone whose local storage was cleared still reads the server-set cookie", async () => {
    document.cookie = `${DINER_GUIDE_COOKIE}=1; path=/`;
    await arrive({});
    expect(guide()).toBeNull();
  });

  it.each([
    ["while a tablemate is paying", { locked: true }],
    ["while the table settles", { settling: true }],
  ] as const)("never %s — and marks nothing, so a later quiet arrival may", async (_, busy) => {
    // MUTATION (pd11/first-run/locked-not-read): the claim reads a constant false for the lock; red.
    await arrive(busy);
    expect(guide()).toBeNull();
    expect(localStorage.getItem(DINER_GUIDE_KEY)).toBeNull();
  });

  it("never over a join that failed", async () => {
    await arrive({ cartId: null, dbNow: null, error: "Couldn’t join this table." });
    expect(guide()).toBeNull();
    expect(localStorage.getItem(DINER_GUIDE_KEY)).toBeNull();
  });

  it("never on pickup, never for a known diner", async () => {
    await arrive({}, { mode: "pickup" });
    expect(guide()).toBeNull();
    cleanup();
    await arrive({}, { welcome: { name: "Aye", ordersThisMonth: 0 } });
    expect(guide()).toBeNull();
    expect(localStorage.getItem(DINER_GUIDE_KEY)).toBeNull();
  });

  it("never while a reorder lands (the arrival URL's ?reorder=, read at mount)", async () => {
    window.history.replaceState(null, "", "/menu?mode=dinein&reorder=o-1");
    cart.current = { ...WAITING };
    const r = render(<Menu />);
    await settle();
    // MenuBrowser strips the param once the cart exists — the guide read it at mount.
    window.history.replaceState(null, "", "/menu?mode=dinein");
    cart.current = { ...JOINED };
    r.rerender(<Menu />);
    await settle();
    expect(guide()).toBeNull();
  });

  it("never over another open dialog (two focus traps never stack)", async () => {
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    try {
      // MUTATION (pd11/first-run/dialog-not-read): the claim never looks at the page; red.
      await arrive({});
      expect(guide()).toBeNull();
      expect(localStorage.getItem(DINER_GUIDE_KEY)).toBeNull();
    } finally {
      other.remove();
    }
  });

  it("at the party cap, page 1 teaches no Invite", async () => {
    const members = Array.from({ length: 12 }, (_, i) => ({ seat: `p${i}`, name: `P${i}` }));
    await arrive({ members });
    expect(guide()!.textContent).not.toMatch(/Invite/);
  });

  it("every exit lands on the menu's heading — the first run took focus from nowhere a guest chose", async () => {
    await arrive({});
    fireEvent.keyDown(guide()!, { key: "Escape" });
    await settle();
    expect(guide()).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(MENU_HEADING_SELECTOR));
  });
});

describe("the mount and the landing are where they claim to be (parsed, never scanned)", () => {
  const REPO = join(__dirname, "..", "..", "..", "..");
  const parse = (rel: string) =>
    ts.createSourceFile(
      rel,
      readFileSync(join(REPO, rel), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  const attrs = (el: ts.JsxOpeningLikeElement) =>
    new Map(
      el.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((a) => [a.name.getText(), a.initializer?.getText() ?? ""]),
    );
  /** Every LIVE JSX element named `tag` — never one parked in a literal-dead `{false && …}`. */
  const elements = (sf: ts.SourceFile, tag: string) => {
    const out: ts.JsxOpeningLikeElement[] = [];
    const visit = (n: ts.Node): void => {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        n.left.kind === ts.SyntaxKind.FalseKeyword
      )
        return;
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        n.tagName.getText() === tag
      )
        out.push(n);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    return out;
  };

  it("ArrivalBeat mounts the first run with its mode and the menu's welcome read", () => {
    // MUTATION (pd11/arrival/mount-dropped): no mount — the guide never opens by itself; red.
    const mounts = elements(parse("apps/qr/components/menu/ArrivalBeat.tsx"), "DinerGuideFirstRun");
    expect(mounts).toHaveLength(1);
    const a = attrs(mounts[0]!);
    expect(a.get("mode")).toBe("{mode}");
    expect(a.get("welcome")).toBe("{welcome}");
  });

  it("MenuBrowser's heading is still the one focusable h1.menu-title the exits land on", () => {
    expect(MENU_HEADING_SELECTOR).toBe("h1.menu-title");
    const h1s = elements(parse("apps/qr/components/menu/MenuBrowser.tsx"), "h1").filter(
      (h) => attrs(h).get("className") === '"menu-title"',
    );
    expect(h1s).toHaveLength(1);
    expect(attrs(h1s[0]!).get("tabIndex")).toBe("{-1}");
  });

  it("a parked literal-dead copy is not a mount (the matcher, red-first)", () => {
    const sf = ts.createSourceFile(
      "x.tsx",
      "const a = <div>{false && <DinerGuideFirstRun mode={mode} welcome={welcome} />}</div>;",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    expect(elements(sf, "DinerGuideFirstRun")).toHaveLength(0);
  });
});
