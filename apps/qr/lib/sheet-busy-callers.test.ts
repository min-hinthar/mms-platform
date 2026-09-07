import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
 * An ALLOWLIST, not a sweep. Nine of the twelve `Sheet` callers must NOT pass `busy` — they write
 * nothing irreversible, and a lock a user cannot predict is worse than no lock — so "every Sheet has
 * busy" would be the wrong assertion and would pressure a future author into adding it everywhere.
 *
 * M137 added the twelfth (`menu/DietFilterButton.tsx`) and this guard is why it was a decision
 * rather than an oversight: its sheet toggles CLIENT-SIDE dietary filters and writes nothing at
 * all, so it belongs in the unguarded list. Locking a filter picker mid-tap would be the "lock with
 * no reason" the prop's own doc forbids.
 */

const COMPONENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components");
const read = (rel: string) =>
  readFileSync(path.join(COMPONENTS, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Every component that renders the `Sheet` primitive, found on disk rather than listed by hand.
 *
 * Recursive, and `.tsx` only because a `Sheet` is JSX. The primitive itself lives in `packages/ui`
 * and is not swept — this is the caller side.
 */
function componentFiles(): string[] {
  return readdirSync(COMPONENTS, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tsx") && !/\.test\.tsx?$/.test(f))
    .map((f) => f.split(path.sep).join("/"));
}

/** Files that render a given JSX tag. */
const rendering = (tag: string) =>
  componentFiles().filter((f) => new RegExp(`<${tag}[\\s>]`).test(read(f)));

function sheetCallers(): string[] {
  return rendering("Sheet");
}

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
  "menu/DietFilterButton.tsx",
  "menu/ItemSheet.tsx",
  // P7·1b — the KDS text-size sheet: three chips, a localStorage write, nothing irreversible.
  "staff/KdsBoard.tsx",
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
    }
    // Two of the three own their transition outright.
    for (const rel of ["staff/LossActionSheet.tsx", "staff/RefundActionSheet.tsx"]) {
      expect(read(rel)).toMatch(/useTransition\(\)/);
    }
  });

  it("⚠️ StaffModSheet's `pending` is traced to the PARENT that owns the transition", () => {
    // Codex round 2, P2. `StaffModSheet` takes `pending` as a PROP, so asserting on that file can
    // only ever confirm a boolean was declared — the earlier version accepted `pending?: boolean`
    // and would have stayed green if a parent later handed it a hand-rolled flag, which is exactly
    // the stranding the prop doc warns about. The contract lives where the value is produced.
    const parents = ["staff/StaffMenuBrowser.tsx", "kiosk/KioskMenu.tsx"];
    for (const rel of parents) {
      const src = read(rel);
      expect(src).toMatch(/<StaffModSheet/);
      expect(src).toMatch(/pending=\{pending\}/);
      expect(src).toMatch(/\[\s*pending\s*,\s*start\w*\s*\]\s*=\s*useTransition\(\)/);
    }
    // …and those are ALL of its parents, so no third one can wire it from somewhere else.
    expect(rendering("StaffModSheet").sort()).toEqual([...parents].sort());
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

  it("⚠️ the two lists ARE the Sheet callers — discovered, never transcribed", () => {
    // Codex round 2, P2. The first version asserted `GUARDED.length + UNGUARDED.length === 11`,
    // which checks the two arrays against each other and nothing against the app: a twelfth caller
    // could ship with no `busy` while a test claiming exhaustive coverage stayed green. That is the
    // "never transcribe a number into an assertion" rule, one level up — the LIST was transcribed.
    // Now the call sites are discovered on disk and the union must match them exactly, so a new
    // caller fails here until someone triages it into one list or the other.
    expect(sheetCallers().sort()).toEqual([...GUARDED.map(([f]) => f), ...UNGUARDED].sort());
  });
});
