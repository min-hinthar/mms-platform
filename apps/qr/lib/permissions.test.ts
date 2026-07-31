import { describe, expect, it } from "vitest";
import type { LineState } from "@mms/db";
import { canMutateLine, type LineActor } from "./permissions";

/**
 * W8c — the line-authority matrix.
 *
 * `canMutateLine` is the ISOMORPHIC gate: the server enforces it in every cart action and the client
 * imports the SAME rule to disable controls the server would reject. It is what stops a guest
 * silently mutating a fired ticket, and it had zero test coverage.
 *
 * The matrix is exhaustive by construction — `ALL_STATES` is derived from a `Record<LineState, true>`,
 * so widening the union breaks the BUILD rather than silently skipping cells.
 */

// A widened `LineState` fails to compile here. (`settled` is deliberately absent — it is not a member;
// the union is draft | fired | in_progress | served | voided, and the DB CHECK agrees.)
const STATE_SET: Record<LineState, true> = {
  draft: true,
  fired: true,
  in_progress: true,
  served: true,
  voided: true,
};
const ALL_STATES = Object.keys(STATE_SET) as LineState[];

const ACTORS: [name: string, actor: LineActor][] = [
  ["staff", { kind: "staff" }],
  ["host (own line)", { kind: "diner", role: "host", isOwner: true }],
  ["host (someone else's line)", { kind: "diner", role: "host", isOwner: false }],
  ["guest (own line)", { kind: "diner", role: "guest", isOwner: true }],
  ["guest (someone else's line)", { kind: "diner", role: "guest", isOwner: false }],
];

/**
 * The expected truth table, written out by hand from the documented rule — NOT derived from the
 * implementation:
 *   • a comped line is immutable to EVERYONE (a committed $0 decision; changing qty would give away
 *     more and desync the loss audit),
 *   • staff own every NON-TERMINAL line (draft → served) — they edit for a guest post-fire,
 *   • a diner may mutate only a still-`draft` line, host-any / guest-own.
 * Keyed `state → actor name → allowed`, for comped = false.
 */
const EXPECTED: Record<LineState, Record<string, boolean>> = {
  draft: {
    staff: true,
    "host (own line)": true,
    "host (someone else's line)": true, // host may edit ANY draft line at their table
    "guest (own line)": true,
    "guest (someone else's line)": false, // the cross-owner guard
  },
  fired: {
    staff: true,
    "host (own line)": false, // post-fire = staff-only ("Ask a server", S2.2)
    "host (someone else's line)": false,
    "guest (own line)": false,
    "guest (someone else's line)": false,
  },
  in_progress: {
    staff: true,
    "host (own line)": false,
    "host (someone else's line)": false,
    "guest (own line)": false,
    "guest (someone else's line)": false,
  },
  served: {
    staff: true,
    "host (own line)": false,
    "host (someone else's line)": false,
    "guest (own line)": false,
    "guest (someone else's line)": false,
  },
  voided: {
    staff: false, // terminal: nobody mutates a voided line, not even staff
    "host (own line)": false,
    "host (someone else's line)": false,
    "guest (own line)": false,
    "guest (someone else's line)": false,
  },
};

describe("canMutateLine — the 5 × 5 authority matrix (comped = false)", () => {
  for (const state of ALL_STATES) {
    for (const [name, actor] of ACTORS) {
      const expected = EXPECTED[state][name]!;
      it(`${state} × ${name} → ${expected}`, () => {
        expect(canMutateLine(state, actor, false)).toBe(expected);
      });
    }
  }

  it("allows exactly 7 of the 25 cells — a widening is a deliberate act, not a slip", () => {
    // A count assertion is what catches a change that flips a cell AND updates EXPECTED in the same
    // edit: the number here has to move too, so the widening shows up in the diff as a decision.
    const allowed = ALL_STATES.flatMap((s) =>
      ACTORS.map(([, a]) => (canMutateLine(s, a, false) ? 1 : 0)),
    ).reduce<number>((a, b) => a + b, 0);
    expect(allowed).toBe(7); // draft: staff+host-own+host-other+guest-own = 4 · fired/in_progress/served: staff = 3
  });
});

describe("canMutateLine — a comped line is immutable to everyone", () => {
  for (const state of ALL_STATES) {
    for (const [name, actor] of ACTORS) {
      it(`${state} × ${name} × comped → false`, () => {
        // The `comped` short-circuit precedes the staff branch, so it beats even staff authority.
        // S2-audit B1: a comped line can be back in `draft` (comp-in-grace → undo), which is exactly
        // why the gate keys on `comped` and not on state alone.
        expect(canMutateLine(state, actor, true)).toBe(false);
      });
    }
  }
});

describe("M20 (known-open) — the default argument hides a client/server split", () => {
  it("defaults `comped` to false, so a 2-arg call cannot see a comped line", () => {
    // PINNED, NOT FIXED. The server passes 3 args (threading `comped` from authz); the client calls
    // it with 2 (`Checkout.tsx`, `SplitSection.tsx`). On a comped-but-DRAFT line the two therefore
    // disagree: the client renders the For-here/To-go pills and "Make it now", the server rejects
    // both, and the failure is swallowed — so the control visibly flips and snaps back.
    //
    // No money impact (comped lines are excluded from every base), but the module's own docstring
    // claims the opposite. See OPEN-ITEMS M20. The fix is to pass `comped` at the two client call
    // sites; when it lands, these two lines should agree.
    const compedDraft: LineState = "draft";
    const actor: LineActor = { kind: "diner", role: "host", isOwner: true };
    expect(canMutateLine(compedDraft, actor)).toBe(true); // what the CLIENT sees
    expect(canMutateLine(compedDraft, actor, true)).toBe(false); // what the SERVER enforces
  });

  it("is otherwise identical with and without the third argument", () => {
    // Everywhere else the default is harmless — proving that bounds the blast radius of M20 to
    // exactly the comped case rather than leaving it open-ended.
    for (const state of ALL_STATES) {
      for (const [, actor] of ACTORS) {
        expect(canMutateLine(state, actor)).toBe(canMutateLine(state, actor, false));
      }
    }
  });
});
