import { describe, expect, it } from "vitest";
import { STAFF } from "./i18n/staff";
import type { ExpoErrCode } from "./expo-types";
import { expoErrOutcome, expoFailedMsg, type ExpoSubject } from "./expo-errors";

const CODES: readonly ExpoErrCode[] = ["sentence", "signin", "invalid", "failed", "stale"];
const TABLE: ExpoSubject = { kind: "table", id: 7 };
const BAG: ExpoSubject = { kind: "bag", x: "Aye Aye" };
const VERIFY: ExpoSubject = { kind: "verify", x: "Aye Aye · #A1B2C3" };

describe("expoErrOutcome — a refused lane action speaks the device language (P2p)", () => {
  it("every code resolves; sign-in leaves; a sentence is shown as it is", () => {
    for (const code of CODES) {
      const out = expoErrOutcome({ error: "s", code }, TABLE);
      if (code === "signin") expect(out).toEqual({ kind: "leave", href: "/staff/login" });
      else expect(out.kind).toBe("show");
    }
    expect(expoErrOutcome({ error: "That needs a manager.", code: "sentence" }, BAG)).toEqual({
      kind: "show",
      msg: "That needs a manager.",
    });
  });
  it("a table's number rides the Latin-always {id} slot; a name or a code rides {x} as given", () => {
    // MUTATION: collapse the table arm into `{x: "Table 7"}` — the bilingual subject P2p measured
    // ("စားပွဲ 7") would be wrapped whole as Latin by the slot rule.
    expect(expoFailedMsg(TABLE)).toEqual({ k: "expo.err.bagTable", vars: { id: 7 } });
    expect(expoFailedMsg(BAG)).toEqual({ k: "expo.err.bagFor", vars: { x: "Aye Aye" } });
    expect(expoFailedMsg(VERIFY)).toEqual({
      k: "expo.err.verify",
      vars: { x: "Aye Aye · #A1B2C3" },
    });
    expect(expoErrOutcome({ error: "s", code: "stale" }, TABLE)).toEqual({
      kind: "show",
      msg: { k: "expo.err.staleTable", vars: { id: 7 } },
    });
    expect(expoErrOutcome({ error: "s", code: "stale" }, VERIFY)).toEqual({
      kind: "show",
      msg: { k: "expo.err.stale", vars: { x: "Aye Aye · #A1B2C3" } },
    });
    for (const k of ["expo.err.bagTable", "expo.err.staleTable"] as const) {
      expect(STAFF[k].en).toContain("{id}");
      expect(STAFF[k].my).toContain("{id}");
    }
    for (const k of ["expo.err.bagFor", "expo.err.verify", "expo.err.stale"] as const) {
      expect(STAFF[k].en).toContain("{x}");
      expect(STAFF[k].my).toContain("{x}");
    }
  });
});
