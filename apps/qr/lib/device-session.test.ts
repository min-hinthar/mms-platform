import { describe, expect, it } from "vitest";
import {
  DEVICE_NAME_KEY,
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

  it("leaves the LOCALE alone — a language is a person's setting, not an order pointer (W5)", () => {
    // The key rides the mms.qr. prefix, so without an explicit exemption the handover clear
    // would reset a Burmese-speaking owner's app to English every time they lend the phone.
    expect(deviceSessionKeys(["mms.qr.locale", "mms.qr.dinein"])).toEqual(["mms.qr.dinein"]);
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
    // Cross-file drift guard: useTableSession/TableCartProvider/Checkout write these literals.
    expect(DEVICE_NAME_KEY).toBe("mms.name");
    expect(DEVICE_SESSION_PREFIX).toBe("mms.qr.");
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
    const s = fakeStorage(["mms.identities", "mms.qr.dinein", "mms.name", "mms.lend"]);
    clearDeviceSession(s);
    expect(s.removed.sort()).toEqual(["mms.name", "mms.qr.dinein"]);
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
