import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * `check:freeze-parity` aimed at its own new arms (the capped blind pass on #362): the clock pin on
 * `effectiveFreeze(cart, Date.now())`, the refusal of more than one live `locked` derivation in the
 * helper, and the literal-dead exclusion that keeps a parked copy from tripping that refusal. Each
 * row is a COMMITTED mutation of the real source, applied to a copy of `apps/qr/lib` and checked
 * through `FREEZE_PARITY_ROOT`; each find must match exactly once, or the row is stale. The baseline
 * row proves the copy itself is clean, so a red row is the mutation's.
 */
const execFileP = promisify(execFile);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GATE = path.join(REPO, "scripts", "check-freeze-parity.mjs");
const AUTHZ = "apps/qr/lib/authz.ts";
const RULE = "apps/qr/lib/lock-ttl.ts";
const RETURN_HEAD = "): FreezeAxes {\n  return {\n    locked:";

type Edit = { file: string; find: string; replace: string };

async function runGate(edit?: Edit): Promise<{ code: number; out: string }> {
  const root = mkdtempSync(path.join(os.tmpdir(), "freeze-parity-"));
  try {
    cpSync(path.join(REPO, "apps/qr/lib"), path.join(root, "apps/qr/lib"), { recursive: true });
    if (edit) {
      const file = path.join(root, edit.file);
      const text = readFileSync(file, "utf8");
      expect(text.split(edit.find).length - 1, `stale row: ${edit.find}`).toBe(1);
      writeFileSync(file, text.replace(edit.find, edit.replace));
    }
    try {
      const { stdout, stderr } = await execFileP("node", [GATE], {
        env: { ...process.env, FREEZE_PARITY_ROOT: root, FORCE_COLOR: "0" },
      });
      return { code: 0, out: stdout + stderr };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return { code: err.code ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("check:freeze-parity — its own arms, red-first", { timeout: 60_000 }, () => {
  it("the baseline copy is clean", async () => {
    expect((await runGate()).code).toBe(0);
  });

  it("a constant clock handed to `effectiveFreeze` is refused (every lock stale at once)", async () => {
    const r = await runGate({
      file: AUTHZ,
      find: "effectiveFreeze(cart, Date.now())",
      replace: "effectiveFreeze(cart, Number.MAX_SAFE_INTEGER)",
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/a clock other than `Date\.now\(\)`/);
  });

  it("a returned `{ locked: false }` beside a parked live-looking copy is refused — ambiguity is not resolved by position", async () => {
    const r = await runGate({
      file: RULE,
      find: RETURN_HEAD,
      replace:
        "): FreezeAxes {\n  void { locked: !!row.locked && row.locked_at !== null && nowMs > 0 };\n  return {\n    locked:",
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/holds 2 `locked` properties/);
  });

  it.each([
    ["false && …", "void (false && { locked: true });"],
    ["if (false)", "if (false) void { locked: true };"],
    ["false ? … : …", "void (false ? { locked: true } : null);"],
    ["while (false)", "while (false) void { locked: true };"],
  ])("a copy parked in a literal-dead `%s` is excluded, not counted", async (_shape, parked) => {
    const r = await runGate({
      file: RULE,
      find: RETURN_HEAD,
      replace: `): FreezeAxes {\n  ${parked}\n  return {\n    locked:`,
    });
    expect(r.code, r.out).toBe(0);
  });

  it("…but only a LITERAL false: `true && …` is a live copy and is refused", async () => {
    const r = await runGate({
      file: RULE,
      find: RETURN_HEAD,
      replace: "): FreezeAxes {\n  void (true && { locked: true });\n  return {\n    locked:",
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/holds 2 `locked` properties/);
  });
});
