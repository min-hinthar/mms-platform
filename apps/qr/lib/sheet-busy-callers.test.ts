import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * M82 — the CALLER half of the `Sheet` `busy` guard.
 *
 * `packages/ui` owns the policy and asserts that `sheet.tsx` consults it. Neither of those notices
 * whether a caller actually PASSES `busy`, and the adversarial pass proved it: deleting
 * `busy={pending}` from `LossActionSheet` — re-opening the spent-PIN-attempt defect the whole slice
 * leads with — left `@mms/ui` at 85 passed and `apps/qr` at 821 passed. Every gate green, the fix
 * gone.
 *
 * That is the third time this repo has shipped a correct module whose caller defeated it (W22c's
 * freshness stamp, W22e's catalog mapping, W22f's arming), and the first time the guard for it was
 * written in the same commit. It lives HERE rather than beside the policy because a `packages/ui`
 * test reading `apps/qr` off disk would invert the one-way dependency rule.
 *
 * An ALLOWLIST, not a sweep. Eight of the eleven `Sheet` callers must NOT pass `busy` — they write
 * nothing irreversible, and a lock a user cannot predict is worse than no lock — so "every Sheet has
 * busy" would be the wrong assertion and would pressure a future author into adding it everywhere.
 */

const COMPONENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components");
const read = (rel: string) =>
  readFileSync(path.join(COMPONENTS, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** The three that perform an irreversible write, and why each one earned the prop. */
const GUARDED: [file: string, because: string][] = [
  [
    "staff/LossActionSheet.tsx",
    "voidLine spends one of the manager's five PIN attempts before the RPC",
  ],
  ["staff/StaffModSheet.tsx", "the add's refusal renders only inside this sheet, behind the scrim"],
  ["staff/RefundActionSheet.tsx", "real money leaves the account"],
];

/** Sheets that must stay dismissible — pickers, viewers, and writes that land above the sheet. */
const UNGUARDED = [
  "InviteSheet.tsx",
  "JoinTable.tsx",
  "OrdersTray.tsx",
  "PickupSlotSheet.tsx",
  "TablePicker.tsx",
  "grocery/GroceryBasketSheet.tsx",
  "grocery/GroceryItemSheet.tsx",
  "menu/ItemSheet.tsx",
];

describe("M82 — the sheets that hold an irreversible write pass `busy`", () => {
  it.each(GUARDED)("%s passes busy — %s", (rel) => {
    expect(read(rel)).toMatch(/<Sheet[^>]*\sbusy=\{/s);
  });

  it("⚠️ each flag is a transition's `pending`, never a hand-rolled boolean", () => {
    // The prop's one caller-owned contract. All four exits are blocked while `busy` is true, inside
    // a trapped focus scope, so a flag that can strand is a permanent keyboard trap (WCAG 2.1.2). A
    // `useTransition` pending settles by construction — including on the failure path — and a
    // `useState` boolean does not.
    for (const [rel] of GUARDED) {
      expect(read(rel)).toMatch(/busy=\{pending\}/);
      expect(read(rel)).toMatch(/useTransition\(\)|pending\??:\s*boolean/);
    }
  });

  it("⚠️ the sheets that write nothing irreversible stay freely dismissible", () => {
    // The negative half, and the one that keeps this honest. `busy` on a picker is a lock with no
    // reason: a diner tugs the handle, nothing happens, and no copy anywhere explains it. If one of
    // these ever needs the prop it will be because it grew a write — which should be a deliberate
    // edit to this list, not a quiet addition nobody reviewed.
    for (const rel of UNGUARDED) {
      expect(read(rel)).not.toMatch(/<Sheet[^>]*\sbusy=/s);
    }
  });

  it("covers every Sheet caller in the app — the split is exhaustive, not a sample", () => {
    // If a twelfth caller appears, it must be triaged into one list or the other rather than
    // silently escaping both.
    expect(GUARDED.length + UNGUARDED.length).toBe(11);
  });
});
