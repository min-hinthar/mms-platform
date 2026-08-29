import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The GPU dial's boot script, tested as the STRING THAT SHIPS.
 *
 * M126 made this script blocking because applying the dial from a React effect lands after the
 * first composite has already allocated full-strength buffers — on the devices whose first
 * composite OOM-crashed a WebKit tab. That makes it a correctness path with no component around it
 * to test, so the assertions here read `layout.tsx` and evaluate the literal it injects. A test
 * that re-typed the script would pass forever while the shipped one rotted.
 *
 * The case that matters is M147 (Codex P2 on #238, post-merge, unanswered until now): the storage
 * read and the hardware-tier derivation shared ONE `try`, so a browser that throws on
 * `localStorage` — Safari private mode, cookies blocked, a partitioned iframe — skipped the tier
 * derivation with it. The device most likely to throw is a locked-down mobile browser, which is
 * precisely the low-end device `lite` exists for, and it was the one getting the full budget.
 */

const SCRIPT = (() => {
  const src = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");

  // Bound to the RENDERED <script>, and rejecting ambiguity rather than picking the first match
  // (Codex P2 on #242). Two earlier shapes were both wrong in the same direction — they could find
  // a string that is not the shipped script:
  //
  //   1. anchoring on the post-fix `var f=null;` prefix made a REGRESSION unfindable, so vitest
  //      reported "no tests" instead of failing;
  //   2. taking the first `__html` template containing the storage key would happily read a
  //      known-good initializer left behind in a JSX comment or a dead branch ABOVE a regressed
  //      live one — a realistic edit in a file this heavily annotated — and every assertion below
  //      would then pass against a snippet nobody ships.
  //
  // So: strip JSX comments first (that is where a stale copy would sit), then require EXACTLY ONE
  // surviving candidate. Ambiguity fails loudly; it is never resolved by position.
  const live = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const candidates = [...live.matchAll(/__html: `([^`]*mms\.fx[^`]*)`/g)].map((m) => m[1]!);

  if (candidates.length === 0) {
    throw new Error(
      "fx boot script not found in layout.tsx — did the storage key change, or is the only " +
        "remaining copy inside a JSX comment? Either way the shipped dial is unverified.",
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `layout.tsx has ${candidates.length} live scripts naming "mms.fx". This guard cannot know ` +
        "which one ships, and picking the first is how a stale copy gets tested while a regressed " +
        "one runs. Delete the dead one, or teach this guard to identify the live script.",
    );
  }
  return candidates[0]!;
})();

/** Run the shipped string against a fake document/window, and report what the dial ended up as. */
function boot(opts: { stored?: string | null; throws?: boolean; cores?: number }) {
  const root = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem(k: string) {
      if (opts.throws) throw new DOMException("The operation is insecure.", "SecurityError");
      return k === "mms.fx" ? (opts.stored ?? null) : null;
    },
  };
  // `"cores" in opts`, NOT `opts.cores ?? 8` — the default has to distinguish "the caller said
  // nothing" from "the caller explicitly passed undefined", because the second is the real browser
  // case being asserted (a UA that does not report `hardwareConcurrency` at all). A `??` default
  // silently rewrote that case to 8 cores and the assertion tested nothing; it was caught only
  // because the expectation disagreed.
  const navigator = { hardwareConcurrency: "cores" in opts ? opts.cores : 8 };
  const document = { documentElement: root };
  // eslint-disable-next-line no-new-func -- evaluating the SHIPPED literal is the whole point
  new Function("localStorage", "navigator", "document", SCRIPT)(localStorage, navigator, document);
  return root.dataset.fx;
}

describe("the GPU dial's boot script — a storage throw must not cost the tier fallback", () => {
  it("THE M147 CASE: storage throws on a low-core device — `lite` still applies", () => {
    // Before the split this returned undefined: the throw skipped the whole block, and the weakest
    // device — the one most likely to be running a browser that throws — got the full budget.
    expect(boot({ throws: true, cores: 2 })).toBe("lite");
  });

  it("storage throws on a capable device — no dial, which is the correct nothing", () => {
    expect(boot({ throws: true, cores: 8 })).toBeUndefined();
  });

  it("derives `lite` from a low core count when storage is readable but empty", () => {
    expect(boot({ stored: null, cores: 2 })).toBe("lite");
  });

  it("leaves a capable device undialled", () => {
    expect(boot({ stored: null, cores: 8 })).toBeUndefined();
  });

  it("honours an explicit override over the hardware tier, in both directions", () => {
    // `off` on a capable machine, and `off` on a weak one that would otherwise derive `lite`.
    expect(boot({ stored: "off", cores: 8 })).toBe("off");
    expect(boot({ stored: "off", cores: 2 })).toBe("off");
    expect(boot({ stored: "lite", cores: 8 })).toBe("lite");
  });

  it("writes NOTHING for an explicit `full`, since `html[data-fx]` itself is a selector", () => {
    // `data-fx="full"` would still match `html[data-fx]`, which the reduced-transparency override
    // keys on — so "full" must be the ABSENCE of the attribute, not a value of it.
    expect(boot({ stored: "full", cores: 8 })).toBeUndefined();
    expect(boot({ stored: "full", cores: 2 })).toBeUndefined();
  });

  it("ignores a junk stored value and falls back to the hardware tier", () => {
    expect(boot({ stored: "turbo", cores: 2 })).toBe("lite");
    expect(boot({ stored: "turbo", cores: 8 })).toBeUndefined();
  });

  it("treats a missing hardwareConcurrency as low-end, not as capable", () => {
    // `(navigator.hardwareConcurrency || 0) < 4` — an undefined count reads 0, so an unknown device
    // gets the cheaper budget. Asserted because the opposite default would be the dangerous one.
    expect(boot({ stored: null, cores: undefined as unknown as number })).toBe("lite");
  });
});
