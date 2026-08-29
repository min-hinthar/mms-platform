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
  // Anchored on the STORAGE KEY alone, deliberately — not on the fixed `var f=null;` prefix.
  //
  // The first draft matched the post-fix shape, which meant reverting M147 made the script
  // unfindable: this IIFE threw at import and vitest reported "no tests" rather than a red
  // assertion. A guard that DISAPPEARS on the regression it exists to catch is worse than no
  // guard, because "no tests" reads like nothing was wrong. Matching the key finds whatever
  // script is there, so a regression fails on the assertion below with its real reason.
  const m = /__html: `([^`]*mms\.fx[^`]*)`/.exec(src);
  if (!m?.[1])
    throw new Error("fx boot script not found in layout.tsx — did the storage key change?");
  return m[1];
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
