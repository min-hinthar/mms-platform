/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { HELP_SCREENS, helpCardCount, type HelpDoorScreen } from "@/lib/help";
import { STAFF } from "@/lib/i18n/staff";
import { HelpPicture } from "./HelpPicture";

/**
 * P7·3 — every picture is the real control's OWN declaration, bound structurally: the class the
 * control wears, the style object the control spreads, or the one CSS rule that names both. The
 * first draft passed a green/inverted pair of takeaway stages, an undo pill in the bar's colours,
 * a Screens circle in the static mark's class and a kitchen strip on the takeaway card through a
 * suite that only checked `aria-hidden` — so this file checks the BINDINGS, not the look.
 */
afterEach(cleanup);
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const pic = (screen: HelpDoorScreen, n: number) =>
  render(<HelpPicture screen={screen} n={n} lang="en" />).container.querySelector(".help-pic")!;

describe("HelpPicture — the real control, inert", () => {
  it("every card's picture is hidden and never empty", () => {
    for (const screen of HELP_SCREENS)
      for (let n = 1; n <= helpCardCount(screen); n++) {
        const p = pic(screen, n);
        expect(p.getAttribute("aria-hidden"), `${screen} ${n}`).toBe("true");
        expect(p.children.length, `${screen} ${n}`).toBeGreaterThan(0);
        cleanup();
      }
  });

  it("the undo replica sits in the real bar and shares the button's ONE rule — no rule of its own", () => {
    expect(pic("kitchen", 2).querySelector(".kds-undo > .help-pic-undo-btn")).not.toBeNull();
    // The rule that declares the real button's look names the replica in the SAME selector list…
    const rule = css.match(/([^{}]*\.kds-undo button[^{]*)\{/);
    expect(rule?.[1]).toMatch(/\.kds-undo \.help-pic-undo-btn/);
    // …and nothing declares the replica on its own (that second declaration is the drift).
    expect(css).not.toMatch(/^\s*\.help-pic-undo-btn\s*\{/m);
  });

  it("the Screens circle is the control's class, never the bar's static mark; the Start zone and the strip's free tile wear their own classes", () => {
    const circ = pic("counter", 5).querySelector(".staff-circ")!;
    expect(circ).not.toBeNull();
    expect(circ.className).not.toContain("staff-circ-here");
    cleanup();
    // Phase 2d · floor — the Start zone as it renders now, in the zone's own declarations: its grid
    // (`START_GRID` → `.reg-start`), Walk-up in the primitive Button's own class (`buttonClass`,
    // primary xl block) and ONE Phone order arm (`.staff-arm`, not open, so no cap) — beside ONE
    // free table tile in the strip's own class, which the card's second sentence sends a table to.
    // Every class must be LIVE in the stylesheet: a replica in a class nothing draws is the drift.
    const start = pic("counter", 1);
    const grid = start.querySelector(".reg-start")!;
    expect(grid).not.toBeNull();
    const walk = grid.querySelectorAll(".ui-btn.ui-btn-primary.ui-btn-xl.ui-btn-block");
    expect(walk.length).toBe(1);
    const arms = grid.querySelectorAll(".staff-arm");
    expect(arms.length).toBe(1);
    expect(arms[0]!.getAttribute("aria-expanded")).toBeNull();
    const tiles = start.querySelectorAll(".floor-tile");
    expect(tiles.length).toBe(1);
    expect(tiles[0]!.hasAttribute("data-free")).toBe(true);
    // The tile is the strip's own class and nothing help-only (MUTATION: a bespoke
    // `.help-pic-tile` drawing a tile-alike → this and the placement rule below redden).
    expect([...tiles[0]!.classList].filter((c) => c.startsWith("help-pic"))).toEqual([]);
    // …and it sits in the strip's OWN track, which is what sizes a tile (60–96px): `.floor-tile`
    // is `width: 100%`, so a replica placed straight in the picture's wrapping flex row stretched
    // to the whole line — the drift this discipline exists to stop, and invisible to jsdom's
    // layout. MUTATION: drop the wrapper → the tile's parent is the placement box.
    expect(tiles[0]!.parentElement?.classList.contains("floor-strip")).toBe(true);
    expect(css).toMatch(/(^|[\s,])\.floor-strip\s*\{[^}]*grid-template-columns:/m);
    expect(tiles[0]!.textContent).toContain("7");
    expect(tiles[0]!.textContent).toContain(STAFF["floor.verb.start"].en);
    expect(css).toMatch(/(^|[\s,])\.reg-start\s*\{/m);
    expect(css).toMatch(/(^|[\s,])\.floor-tile\s*\{/m);
    expect(css).toMatch(/\.floor-tile\[data-free\]\s*\{/);
    expect(css).toMatch(/(^|[\s,])\.staff-arm\s*\{/m);
    expect(css).toMatch(/\.staff-arm\[aria-expanded="true"\]/);
    expect(pic("counter", 1).textContent).toContain("Walk-up");
    cleanup();
    const table = pic("counter", 2);
    expect(table.querySelector(".card.card-textured")).not.toBeNull();
    expect(table.textContent).toContain("Table 7");
    expect(table.textContent).toContain("Ordering");
    // Phase 2d · floor — the replica keeps the card's own status edge, in the ordering tone.
    expect(table.querySelector('.card-textured > .floor-edge[data-tone="live"]')).not.toBeNull();
  });

  it("the takeaway stages (the counter's third card since A4·2) spread the board's own style objects: first stage accent, second plain", () => {
    // jsdom keeps `var()` values on inline styles, so the spread can be read back.
    const pair = pic("counter", 3).querySelectorAll(".staff-btn");
    expect(pair.length).toBe(2);
    const first = pair[0] as HTMLElement;
    expect(first.style.background).toBe("var(--ac)");
    expect(first.style.color).toBe("var(--oa)");
    const second = pair[1] as HTMLElement;
    expect(second.style.background).toBe("var(--cd)");
    expect(second.style.color).toBe("var(--tx)");
  });

  it("the frozen card (the counter's fourth) is the lane's status line, never the kitchen strip", () => {
    const p = pic("counter", 4);
    expect(p.querySelector(".expo-status.expo-status-warn")).not.toBeNull();
    expect(p.querySelector(".kds-strip")).toBeNull();
    const warn = css.match(/\.expo-status-warn\s*\{([^}]*)\}/);
    expect(warn?.[1]).toMatch(/color:\s*var\(--warn\)/);
  });

  it("ExpoBoard wears the same declarations — the stage styles imported, the status line classed", () => {
    const src = readFileSync(join(__dirname, "ExpoBoard.tsx"), "utf8");
    const sf = ts.createSourceFile("ExpoBoard.tsx", src, ts.ScriptTarget.Latest, true);
    const imported = new Set<string>();
    const declared = new Set<string>();
    let statusClassed = false;
    let statusInlineStyle = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "./expo-stage" &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      )
        for (const e of node.importClause.namedBindings.elements) imported.add(e.name.text);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
        declared.add(node.name.text);
      // The LIVE <p role="status"> — its className is the conditional over the two shared classes,
      // and it carries no inline style (an inline colour is the copy that drifts).
      if (ts.isJsxOpeningElement(node) && node.tagName.getText() === "p") {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const role = attrs.find((a) => a.name.getText() === "role");
        if (
          role?.initializer &&
          ts.isStringLiteral(role.initializer) &&
          role.initializer.text === "status"
        ) {
          const cls = attrs.find((a) => a.name.getText() === "className");
          if (
            cls?.initializer &&
            ts.isJsxExpression(cls.initializer) &&
            cls.initializer.expression
          ) {
            const e = cls.initializer.expression;
            if (
              ts.isConditionalExpression(e) &&
              ts.isStringLiteral(e.whenTrue) &&
              ts.isStringLiteral(e.whenFalse) &&
              e.whenTrue.text === "expo-status expo-status-warn" &&
              e.whenFalse.text === "expo-status"
            )
              statusClassed = true;
          }
          if (attrs.some((a) => a.name.getText() === "style")) statusInlineStyle = true;
        }
      }
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(sf);
    for (const name of ["bumpBtn", "readyBtn", "pickedBtn"]) {
      expect(imported.has(name), `${name} imported`).toBe(true);
      expect(declared.has(name), `${name} not redeclared`).toBe(false);
    }
    expect(statusClassed).toBe(true);
    expect(statusInlineStyle).toBe(false);
  });
});

/**
 * help-1 — a picture is the control's own declaration at the board's own size, and a `help-pic-*`
 * class says only WHERE it sits. The first cut drew the held card (a dashed box of its own) and
 * re-sized the bump replica (56px, `--fs-h3`) because the board's `--kfs-*` tier did not resolve
 * outside `.kds-root` — two drawings of controls that do not exist, on the surface built to stop
 * exactly that. So: every rule that belongs to a `help-pic-*` class ALONE declares placement only;
 * the held card is the real ticket shell; the tier is declared for the pictures in the SAME block
 * as the root; and the classes the pictures wear and the classes the sheet declares are one set.
 */
describe("help-1 — pictures are declarations, never drawings", () => {
  // Leaf rules: selector list + body. `[^{}]` on both sides makes a rule inside an @media block its
  // own match (the block's opener is left unmatched), so nothing is skipped.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    body: m[2]!,
  }));
  // PLACEMENT — where a replica sits. Never a size, a font, a colour, a border, a radius, a
  // shadow or an opacity: a control's box is its own declaration.
  const PLACEMENT = new Set([
    "display",
    "align-items",
    "align-self",
    "justify-content",
    "gap",
    "order",
    "flex",
    "flex-basis",
    "flex-grow",
    "flex-shrink",
    "flex-direction",
    "flex-wrap",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "position",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "transform",
    "z-index",
    "box-sizing",
    "overflow",
  ]);
  // A BOX property is a re-size, and a re-size is the drift this guard exists for — so each one is
  // admitted by selector, with its reason: a <span> standing in for a <button> gets the button's
  // box (`.help-pic-stage`), and a ticket shell outside the grid that would size it gets a width
  // (`.help-pic-ticket`). Anything else re-sizing a replica is red.
  const BOX_BY_SELECTOR = new Map<string, Set<string>>([
    [".help-pic-stage", new Set(["padding"])],
    [".help-pic-ticket", new Set(["min-width"])],
  ]);
  // The picture's OWN furniture, not a replica of any control: the arrow between two stages.
  const OWN = new Set([".help-pic-arrow"]);
  const props = (body: string) => [...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map((m) => m[1]!);

  it("every rule whose EVERY selector names a help-pic-* class declares placement only — compound selectors included", () => {
    // Every selector, in any position (`.help-pic > .help-pic-bump` is as much the picture's own
    // rule as `.help-pic-bump`); a rule that ALSO names a real control (`.kds-undo button, .kds-undo
    // .help-pic-undo-btn`) is the sharing idiom and declares the control, so it is not subject.
    const own = rules.filter(
      (r) =>
        r.selectors.length > 0 &&
        r.selectors.every((s) => /\.help-pic-[a-z0-9-]+/.test(s)) &&
        !r.selectors.some((s) => OWN.has(s)),
    );
    expect(own.length).toBeGreaterThanOrEqual(4);
    for (const r of own) {
      const declared = props(r.body);
      expect(declared.length, r.selectors.join()).toBeGreaterThan(0);
      for (const p of declared) {
        if (PLACEMENT.has(p)) continue;
        const admitted = r.selectors.every((s) => BOX_BY_SELECTOR.get(s)?.has(p));
        expect(admitted, `${r.selectors.join()} declares ${p}`).toBe(true);
      }
    }
  });

  it("the dial reaches the pictures: each `--kfs-*` stop is declared for .help-pic[data-size] in the SAME block as .kds-root[data-size], and the picture stamps the size it is given", () => {
    const stops = rules.filter((r) => /--kfs-clock:/.test(r.body));
    expect(stops.length).toBe(3);
    for (const r of stops) {
      const sizes = r.selectors.map((s) => s.match(/\[data-size="([sml])"\]/)?.[1] ?? "");
      expect(
        r.selectors.some((s) => /^\.help-pic/.test(s)),
        r.selectors.join(),
      ).toBe(true);
      expect(
        r.selectors.some((s) => /^\.kds-root/.test(s)),
        r.selectors.join(),
      ).toBe(true);
      expect(new Set(sizes).size, r.selectors.join()).toBe(1); // one stop, both hosts
    }
    const { container } = render(<HelpPicture screen="kitchen" n={1} lang="en" size="l" />);
    expect(container.querySelector('.help-pic[data-size="l"]')).not.toBeNull();
    cleanup();
    expect(pic("kitchen", 1).getAttribute("data-size")).toBeNull();
  });

  it("HelpButton hands the board's size to the picture (parsed off its JSX)", () => {
    const src = readFileSync(join(__dirname, "HelpButton.tsx"), "utf8");
    const sf = ts.createSourceFile("HelpButton.tsx", src, ts.ScriptTarget.Latest, true);
    let bound = false;
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        node.tagName.getText() === "HelpPicture"
      ) {
        const size = node.attributes.properties
          .filter(ts.isJsxAttribute)
          .find((a) => a.name.getText() === "size");
        if (
          size?.initializer &&
          ts.isJsxExpression(size.initializer) &&
          size.initializer.expression?.getText() === "size?.value"
        )
          bound = true;
      }
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect(bound).toBe(true);
  });

  it("the held card is the REAL ticket shell — dashed and dimmed by the board's own rule — with no drawing of its own", () => {
    const p = pic("kitchen", 4);
    expect(p.querySelector(".kds-ticket.kds-ticket-held > .kds-bump.kds-bump-fire")).not.toBeNull();
    expect(p.querySelector(".help-pic-held")).toBeNull();
    expect(css).not.toMatch(/\.help-pic-held/);
    const held = rules.find((r) => r.selectors.includes(".kds-ticket-held"));
    expect(held?.body).toMatch(/border-style:\s*dashed/);
    expect(held?.body).toMatch(/opacity:\s*var\(--kds-held-op\)/);
  });

  it("the board's --kfs-* tier is declared for the pictures in the SAME block as the root, so the bump is the board's own size with no class of its own re-sizing it", () => {
    const tier = rules.filter(
      (r) => /--kfs-clock:/.test(r.body) && r.selectors.includes(".help-pic"),
    );
    expect(tier.length).toBe(1);
    expect(tier[0]!.selectors).toContain(".kds-root");
    expect(pic("kitchen", 1).querySelector(".kds-bump")!.className).toBe("kds-bump help-pic-bump");
    cleanup();
    // Phase 2b — the 86 behind the line's ⋯: the real ⋯ class, then the sheet's danger xl Button in
    // the primitive's own classes. MUTATION: keep the old `.kds-line-86` replica — red.
    const eightySix = pic("kitchen", 3);
    expect(eightySix.querySelector(".kds-line-86")).toBeNull();
    expect(eightySix.querySelector(".kds-line-more")!.className).toBe("kds-line-more");
    expect(eightySix.querySelector(".kds-line-more > svg")).not.toBeNull();
    expect(eightySix.querySelector(".ui-btn")!.className).toBe("ui-btn ui-btn-danger ui-btn-xl");
    expect(eightySix.querySelector(".ui-btn")!.textContent).toBe(STAFF["kds.86"].en);
    // …and the ⋯ class is a LIVE rule in the stylesheet, not a name nothing draws.
    expect(css).toMatch(/(^|[\s,])\.kds-line-more\s*\{/m);
  });

  it("the help-pic-* classes the pictures wear and the ones the sheet declares are ONE set", () => {
    const worn = new Set<string>();
    for (const screen of HELP_SCREENS)
      for (let n = 1; n <= helpCardCount(screen); n++) {
        for (const el of pic(screen, n).querySelectorAll("*"))
          for (const c of el.classList) if (c.startsWith("help-pic-")) worn.add(`.${c}`);
        cleanup();
      }
    const declared = new Set(
      rules.flatMap((r) => r.selectors).flatMap((s) => s.match(/\.help-pic-[a-z0-9-]+/g) ?? []),
    );
    expect([...worn].sort()).toEqual([...declared].sort());
  });
});
