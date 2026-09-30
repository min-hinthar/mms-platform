import { describe, expect, it } from "vitest";
import { counterNoShowInput } from "@mms/db/schemas";

/**
 * Phase 2f blind review — the no-show carries what the approver SAW. `expectedLineIds` is the SENT
 * set the sheet showed; `mms_counter_no_show` derives its own under the cart lock and refuses
 * 'changed' when they differ (supabase/tests/p2f_counter_cook_before_paid_test.sql, P2F.20). The
 * schema is only the transport rail: required (an absent set must never reach the RPC as "anything
 * goes"), uuids only, at most 200. Each bound is pinned on BOTH sides, so a loosened and an
 * over-tightened rail both go red.
 */

const SESSION = "11111111-1111-4111-8111-111111111111";
/** `n` distinct, valid v4 uuids. */
const ids = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `22222222-2222-4222-8222-${i.toString(16).padStart(12, "0")}`,
  );

describe("counterNoShowInput.expectedLineIds", () => {
  it("is required — a caller that sends no set is refused before the RPC", () => {
    expect(counterNoShowInput.safeParse({ sessionId: SESSION }).success).toBe(false);
  });

  it("takes the sheet's set, and an empty one (the SQL answers nothing_sent / changed)", () => {
    expect(
      counterNoShowInput.safeParse({ sessionId: SESSION, expectedLineIds: ids(2) }).success,
    ).toBe(true);
    expect(counterNoShowInput.safeParse({ sessionId: SESSION, expectedLineIds: [] }).success).toBe(
      true,
    );
  });

  it("admits 200 ids and refuses 201", () => {
    expect(
      counterNoShowInput.safeParse({ sessionId: SESSION, expectedLineIds: ids(200) }).success,
    ).toBe(true);
    expect(
      counterNoShowInput.safeParse({ sessionId: SESSION, expectedLineIds: ids(201) }).success,
    ).toBe(false);
  });

  it("refuses an element that is not a uuid", () => {
    expect(
      counterNoShowInput.safeParse({ sessionId: SESSION, expectedLineIds: [...ids(1), "line-7"] })
        .success,
    ).toBe(false);
  });
});
