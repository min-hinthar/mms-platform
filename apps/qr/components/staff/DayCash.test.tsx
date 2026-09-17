/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DayCashResult } from "@/lib/register";
import { STAFF } from "@/lib/i18n/staff";
import { DayCash } from "./DayCash";

/**
 * M218 (Codex round 3 on #286, P2) — the Z-report's cash cell, and specifically WHICH SENTENCE the
 * signed net picks.
 *
 * `cashNetCents` became signed so a day that gave back more cash than it took stops reporting a
 * balanced till. That fixed the number and left the words behind: rendered through `reg.day.inDrawer`
 * a negative reads "-$15.00 in drawer", which is not a figure anyone can count a till to. This is a
 * money surface, so the sign has to pick the sentence, not just the sign of the digits.
 */
afterEach(cleanup);

type Summary = Extract<DayCashResult, { ok: true }>["summary"];

const day = (over: Partial<Summary>): DayCashResult => ({
  ok: true,
  sinceIso: "2026-09-16T07:00:00.000Z",
  summary: {
    orders: 1,
    cashCents: 0,
    cashCount: 0,
    cardCents: 0,
    cardCount: 0,
    terminalCents: 0,
    terminalCount: 0,
    cashRefundedCents: 0,
    cashNetCents: 0,
    ...over,
  } as Summary,
});

describe("DayCash — the drawer's own sentence", () => {
  it("a day that gave back MORE than it took reads as short, in a countable magnitude", () => {
    // 20.00 taken, 35.00 handed back (an earlier service day's order refunded this morning).
    render(
      <DayCash
        lang="en"
        day={day({ cashCents: 2000, cashRefundedCents: 3500, cashNetCents: -1500 })}
      />,
    );
    const shown = STAFF["reg.day.short"].en.replace("{m}", "$15.00");
    expect(screen.getByText(new RegExp(shown.replace(/[$.]/g, "\\$&")))).toBeTruthy();
    // ⚠️ The magnitude is POSITIVE and the word carries the direction. "-$15.00 in drawer" is an
    // impossible reconciliation target; a manager cannot count a till to a negative number.
    expect(document.body.textContent).not.toContain("-$15.00");
    expect(document.body.textContent).not.toContain(
      `$15.00 ${STAFF["reg.day.inDrawer"].en.replace("{m} ", "")}`,
    );
  });

  it("a normal day still reads as what is IN the drawer", () => {
    render(
      <DayCash
        lang="en"
        day={day({ cashCents: 5000, cashRefundedCents: 1000, cashNetCents: 4000 })}
      />,
    );
    expect(document.body.textContent).toContain("$40.00 in drawer");
    expect(document.body.textContent).not.toContain("short");
  });

  it("a day with no hand-backs says neither — the line only appears once cash has gone back", () => {
    render(<DayCash lang="en" day={day({ cashCents: 5000, cashNetCents: 5000 })} />);
    expect(document.body.textContent).not.toContain("in drawer");
    expect(document.body.textContent).not.toContain("short");
  });
});
