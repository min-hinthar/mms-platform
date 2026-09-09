import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6a — the staff add path's two new money/authority rules, asserted against the CALLS the module
 * makes (the degenerate-mock lesson: assert the predicate/options, never an answer we chose):
 *
 *   • cardinality is ENFORCED (`enforceCardinality: true`) — reverting to the old lenient add ships
 *     modifier-less required items again (K17's bug, now a register-visible money rule: the priced
 *     line omits required choices the customer was quoted);
 *   • the register's qty rides to `insertOrIncLine` — dropping it silently collapses a "3 × curry"
 *     add to one unit while the cashier quotes three;
 *   • W16a — the session's mode rides into the PRICE: a counter/pickup session prices togo (×1.05),
 *     a table session dinein (×1.15). Collapsing the fork misprices every register add.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));

const priceItemCalls: { menuItemId: string; modifierIds: string[]; opts?: unknown }[] = [];
let priceItemThrows = false;
const insertCalls: {
  cartId: string;
  bySeat: string | null;
  qty: number | undefined;
  fulfillment: unknown;
  taxCents: unknown;
}[] = [];

vi.mock("./order-lines", () => ({
  priceItem: (menuItemId: string, modifierIds: string[], opts?: unknown) => {
    priceItemCalls.push({ menuItemId, modifierIds, opts });
    if (priceItemThrows) return Promise.reject(new Error("choose a required option"));
    return Promise.resolve({
      name: "Chicken Curry",
      unitPriceCents: 1450,
      category: "hot_prepared",
      opts: [],
    });
  },
  insertOrIncLine: (
    cartId: string,
    line: { fulfillment?: unknown; taxCents?: unknown },
    bySeat: string | null,
    qty?: number,
  ) => {
    insertCalls.push({
      cartId,
      bySeat,
      qty,
      fulfillment: line.fulfillment,
      taxCents: line.taxCents,
    });
    return Promise.resolve();
  },
  touchCart: () => Promise.resolve(),
}));

vi.mock("./staff", () => ({
  staffGate: () =>
    Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1", role: "server" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./lock", () => ({
  acquireSettlement: () => Promise.resolve("acquired"),
  releaseSettlement: () => Promise.resolve(null),
}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./stripe", () => ({ getStripe: () => ({}) }));
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));

// Per-test session mode (W16a): the mode now decides the PRICE fork, so both directions get a pin.
let sessionMode = "pickup";

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, _v: unknown) => ({
          maybeSingle: () =>
            Promise.resolve(
              table === "table_sessions"
                ? { data: { id: SESSION, status: "active", mode: sessionMode }, error: null }
                : { data: null, error: null },
            ),
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                table === "qr_carts"
                  ? {
                      data: {
                        id: "cart-1",
                        locked: false,
                        locked_at: null,
                        settle_at: null,
                        tab_type: "none",
                      },
                      error: null,
                    }
                  : { data: null, error: null },
              ),
          }),
        }),
      }),
    }),
  }),
}));

const SESSION = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const { staffAddItem } = await import("./staff-cart");

beforeEach(() => {
  priceItemCalls.length = 0;
  insertCalls.length = 0;
  priceItemThrows = false;
  sessionMode = "pickup";
});

describe("staffAddItem — cardinality + qty are money rules (W6a)", () => {
  it("prices every staff add with cardinality ENFORCED — and the price takes no mode (W17a)", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(true);
    expect(priceItemCalls).toHaveLength(1);
    // W17a — the POS price is the POS price: nothing about the session's mode reaches the pricing
    // seam. A `fulfillment` here would be a markup limb growing back.
    expect(priceItemCalls[0]?.opts).toEqual({ enforceCardinality: true });
  });

  it("tags a pickup/counter session's line togo — the routing + tax fork", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(true);
    expect(insertCalls[0]?.fulfillment).toBe("togo");
    // Cold food is exempt to-go; hot_prepared is taxable either way, so the fixture's tax is the
    // 10.5% rate on 1450 — computed in the shell, never transcribed.
    expect(insertCalls[0]?.taxCents).toBe(152);
  });

  it("tags a TABLE session's line dinein — the other arm of the fork", async () => {
    sessionMode = "dinein";
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(true);
    expect(insertCalls[0]?.fulfillment).toBe("dinein");
    expect(insertCalls[0]?.taxCents).toBe(152);
  });

  it("forwards the register's qty to the ledger insert", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM, qty: 3 });
    expect(r.ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.qty).toBe(3);
    expect(insertCalls[0]?.bySeat).toBeNull();
  });

  it("a cardinality refusal lands NO line", async () => {
    priceItemThrows = true;
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(false);
    expect(insertCalls).toHaveLength(0);
  });

  it("bounds qty at the schema (10 is refused before any pricing)", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM, qty: 10 });
    expect(r).toEqual({ ok: false, error: "Invalid request." });
    expect(priceItemCalls).toHaveLength(0);
  });
});

describe("closeSecureTab — the freeze is the double-charge guard, so an UNKNOWN outcome must hold it", () => {
  /**
   * Structural, and deliberately so. Reaching this catch needs a live Stripe, a secure-tab row and a
   * totals read; the *rule* is one identifier. The regression is a single edit — restoring the
   * unconditional `await releaseSettlement(cart.id)` that used to sit at the top of the catch — and
   * it reads perfectly innocently.
   *
   * Why it matters is stated by this function's own idempotency-key comment: "The concurrent
   * double-charge guard here is the FREEZE (paymentInFlightReason + acquireSettlement serialize
   * attempts), not this key." Releasing on an outcome we could not establish removes exactly that
   * guard, over a PaymentIntent created with `confirm: true` which may already be captured.
   */
  const catchBlock = () => {
    const abs = path.join(__dirname, "staff-cart.ts");
    const src = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
    let found: ts.Block | undefined;
    const walk = (n: ts.Node) => {
      if (ts.isCatchClause(n) && n.block.getText().includes("closeSecureTab off-session charge"))
        found = n.block;
      ts.forEachChild(n, (c) => {
        walk(c);
      });
    };
    walk(src);
    if (!found) throw new Error("closeSecureTab catch not found");
    return found;
  };

  /**
   * ⚠️ THE FIRST DRAFT OF THIS GUARD WAS GREEN FOR THE WRONG REASON, and the blind adversarial pass
   * on #275 named all three ways. It asserted (a) no bare `ExpressionStatement` mentioning
   * `releaseSettlement`, (b) SOME `IfStatement` mentioning it, and (c) that the block's text
   * CONTAINED `offSessionChargeOutcome`. Every one is a scan dressed as a parse:
   *
   *   • `if (true) await releaseSettlement(cart.id);` satisfies (a) and (b) and ships the exact
   *     double-collect the describe block is named for;
   *   • `if (!declined) await releaseSettlement(cart.id);` — the precise INVERSION of the rule, the
   *     one edit that turns "hold the freeze when we cannot tell" into "release it only then" —
   *     satisfies them too;
   *   • `Node.getText()` spans interior comment trivia, so (c) is satisfied by the word appearing in
   *     a comment, with the call itself deleted.
   *
   * That is CLAUDE.md #60 verbatim: a guard about executable behaviour that matches a name,
   * substring, count or position is satisfied by text that does not ship the behaviour. So this
   * parses the DECISION CHAIN instead — the classifier call as a real CallExpression node, the
   * binding it initialises, the comparison that derives the release predicate from that binding, and
   * the `if` whose condition is exactly that predicate identifier, unnegated.
   */
  const decls = () =>
    catchBlock()
      .statements.filter(ts.isVariableStatement)
      .flatMap((st) => [...st.declarationList.declarations]);

  it("derives the verdict from the classifier — as a CALL, which a comment cannot fake", () => {
    // `offSessionChargeOutcome` is where "unknowable is never a verdict" is tested BY VALUE.
    // Re-deriving it inline (`err.code === "card_declined"`, say) would put a second, untested copy
    // of the rule on the money path — the repo's "name it ONCE".
    const outcomeDecl = decls().find(
      (d) =>
        d.initializer !== undefined &&
        ts.isCallExpression(d.initializer) &&
        ts.isIdentifier(d.initializer.expression) &&
        d.initializer.expression.text === "offSessionChargeOutcome",
    );
    expect(outcomeDecl).toBeDefined();
    expect(ts.isIdentifier(outcomeDecl!.name)).toBe(true);
  });

  it("releases ONLY on a verdict, and only on the positive one", () => {
    const outcomeDecl = decls().find(
      (d) =>
        d.initializer !== undefined &&
        ts.isCallExpression(d.initializer) &&
        ts.isIdentifier(d.initializer.expression) &&
        d.initializer.expression.text === "offSessionChargeOutcome",
    );
    const outcomeName = (outcomeDecl!.name as ts.Identifier).text;

    // The predicate must be derived from the classifier's result by an explicit `!== "unknown"`.
    // Binding it to the RESULT rather than accepting any boolean is what makes the inversion
    // detectable: `!declined` and `declined` are both identifiers, and only the chain tells them
    // apart.
    const predDecl = decls().find((d) => {
      const init = d.initializer;
      if (!init || !ts.isBinaryExpression(init)) return false;
      if (init.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false;
      const left = init.left;
      const right = init.right;
      return (
        ts.isIdentifier(left) &&
        left.text === outcomeName &&
        ts.isStringLiteral(right) &&
        right.text === "unknown"
      );
    });
    expect(predDecl).toBeDefined();
    const predName = (predDecl!.name as ts.Identifier).text;

    // Exactly ONE statement in the catch may release, it must be an `if`, and its condition must be
    // the bare predicate identifier — not a literal, not a negation, not some other boolean.
    const releasing = catchBlock().statements.filter((st) =>
      st.getText().includes("releaseSettlement("),
    );
    expect(releasing).toHaveLength(1);
    const gate = releasing[0]!;
    expect(ts.isIfStatement(gate)).toBe(true);
    const cond = (gate as ts.IfStatement).expression;
    expect(ts.isIdentifier(cond)).toBe(true);
    expect((cond as ts.Identifier).text).toBe(predName);
    // And the release is the THEN branch, not the else — `if (declined) {} else release()` would
    // read as guarded while shipping the inversion.
    expect((gate as ts.IfStatement).thenStatement.getText()).toContain("releaseSettlement(");
    expect((gate as ts.IfStatement).elseStatement).toBeUndefined();
  });
});
