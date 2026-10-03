import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  DEVICE_NAME_KEY,
  DEVICE_PHONE_KEY,
  DEVICE_SESSION_PREFIX,
  clearDeviceSession,
  deviceSessionKeys,
} from "./device-session";

// W14 / J19 — the handover boundary: which device keys die on switch/lend, and which MUST survive.

describe("deviceSessionKeys", () => {
  it("selects the name key and every mms.qr.* pointer", () => {
    const keys = [
      "mms.name",
      "mms.qr.dinein",
      "mms.qr.scango",
      "mms.qr.pickup",
      "mms.qr.activeMode",
      "mms.qr.activeCart",
      "mms.qr.activeOrder",
    ];
    expect(deviceSessionKeys(keys)).toEqual(keys);
  });

  it("leaves the re-auth chips, lend flag, merge token, and scan queue alone", () => {
    // The SURVIVORS are the safety rule: identities/lend are the one-tap return path, the merge
    // token has its own TTL + clear sites, and the scan queue is member-gated server-side.
    expect(
      deviceSessionKeys([
        "mms.identities",
        "mms.lend",
        "mms.merge_token",
        "mms.scanQueue.v1",
        "mms.groceryCatalog.v1",
        "mms.kds.volume",
        "unrelated",
      ]),
    ).toEqual([]);
  });

  it("exports the literal keys the rest of the app writes", () => {
    // Cross-file drift guard: useTableSession/TableCartProvider write these literals.
    expect(DEVICE_NAME_KEY).toBe("mms.name");
    expect(DEVICE_PHONE_KEY).toBe("mms.phone");
    expect(DEVICE_SESSION_PREFIX).toBe("mms.qr.");
  });

  it("the pickup phone is device memory too — it dies with the handover (Phase 3b, D11)", () => {
    // Checkout wrote and read `mms.phone` as a bare literal outside this boundary, so "Order for a
    // friend" / "Switch account" left the owner's phone pre-filled in the friend's pickup order.
    expect(deviceSessionKeys(["mms.phone", "mms.name", "mms.qr.x", "mms.identities"])).toEqual([
      "mms.phone",
      "mms.name",
      "mms.qr.x",
    ]);
  });

  it("Checkout reads BOTH keys from here — no literal copies anywhere in its code", () => {
    // The one-source guard: a second spelling of either key is how the phone escaped the boundary.
    // PARSED, never grepped (LEARNINGS #60; the blind pass on 3b caught the grep form twice — a
    // double-quote-only scan that a single quote evades, then a quote-agnostic scan that a backticked
    // key in a COMMENT trips): every string and template literal in the file, comments excluded.
    const file = path.join(__dirname, "..", "components", "Checkout.tsx");
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const literals: string[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literals.push(n.text);
      else if (ts.isTemplateExpression(n)) {
        literals.push(n.head.text);
        for (const span of n.templateSpans) literals.push(span.literal.text);
      }
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect(literals.filter((t) => t.includes("mms.phone") || t.includes("mms.name"))).toEqual([]);
    expect(literals).toContain("@/lib/device-session");
  });
});

describe("clearDeviceSession", () => {
  function fakeStorage(initial: string[]) {
    const keys = [...initial];
    return {
      removed: [] as string[],
      get length() {
        return keys.length;
      },
      key(i: number) {
        return keys[i] ?? null;
      },
      removeItem(k: string) {
        this.removed.push(k);
        const at = keys.indexOf(k);
        if (at >= 0) keys.splice(at, 1);
      },
    };
  }

  it("removes exactly the device-session keys", () => {
    const s = fakeStorage(["mms.identities", "mms.qr.dinein", "mms.name", "mms.lend", "mms.phone"]);
    clearDeviceSession(s);
    expect(s.removed.sort()).toEqual(["mms.name", "mms.phone", "mms.qr.dinein"]);
  });

  it("swallows a throwing storage (private mode) instead of crashing the handover", () => {
    const s = {
      get length(): number {
        throw new Error("denied");
      },
      key: () => null,
      removeItem: () => {},
    };
    expect(() => clearDeviceSession(s)).not.toThrow();
  });
});
