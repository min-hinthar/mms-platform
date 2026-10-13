/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { BIND_COPY } from "@/lib/bind-copy";
import type { SessionRefusal } from "@/lib/session-refusal";

/**
 * J16 — the failed dine-in join's way out is decided by the route's machine WORD (`errorReason`,
 * `joinFailureArm`), never by grepping its sentence. The sentence is what the row SHOWS. This suite
 * pins the wiring the pure arm cannot: which word reaches the arm, and that the arm's three answers
 * are what the diner sees — the route's own sentence, a "Try again" only where a re-ask can land,
 * and the code entry (JoinTable) where a code is the way in.
 */

type Ctx = {
  isGroup: boolean;
  members: { seat: string; name: string }[];
  me: { seat: string; name: string } | null;
  error: string | null;
  errorReason: SessionRefusal | null;
  loading: boolean;
  locked: boolean;
  lockedByName: string | null;
  lockedByYou: boolean;
  tableNumber: number | null;
  revalidate: () => void;
  settling: boolean;
  cartId: string | null;
};
const ctx = vi.hoisted(() => ({ current: {} as Ctx }));
vi.mock("./TableCartProvider", () => ({ useCart: () => ctx.current }));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: (p: ComponentProps<"a">) => <a {...p} />,
  useJourneyRouter: () => ({ push: () => {} }),
}));
vi.mock("./InviteSheet", () => ({ InviteSheet: () => null }));

const { GuestList } = await import("./GuestList");

const FAILED: Ctx = {
  isGroup: true,
  members: [],
  me: null,
  error: null,
  errorReason: null,
  loading: false,
  locked: false,
  lockedByName: null,
  lockedByYou: false,
  tableNumber: null,
  revalidate: () => {},
  settling: false,
  cartId: null,
};
const failed = (error: string, errorReason: SessionRefusal | null) => {
  ctx.current = { ...FAILED, error, errorReason };
  render(<GuestList />);
};
const alertText = () => screen.getByRole("alert").textContent ?? "";
const retryButton = () => screen.queryByRole("button", { name: "Try again" });
const codeEntry = () => screen.queryByRole("button", { name: "Have a table code? Join a table" });

beforeEach(() => {
  ctx.current = FAILED;
});
afterEach(cleanup);

describe("GuestList — a failed join recovers by the route's word (J16)", () => {
  it("the SEATED race shows the route's sentence and the party's code — no retry that 409s forever", () => {
    // Before J16 this arm matched neither substring: "Couldn’t join this table." + "Try again",
    // and no way to enter the party's code. MUTATION (j16-reason/guest-list-ignores-the-word):
    // the arm is decided without the word — the generic line and the futile retry are back.
    failed(BIND_COPY.seated, "seated");
    expect(alertText()).toContain(BIND_COPY.seated);
    expect(retryButton()).toBeNull();
    expect(codeEntry()).not.toBeNull();
  });

  it("a DE-REGISTERED table shows the route's sentence and a code entry — no retry", () => {
    failed(BIND_COPY.unavailable, "table_not_registered");
    expect(alertText()).toContain(BIND_COPY.unavailable);
    expect(retryButton()).toBeNull();
    expect(codeEntry()).not.toBeNull();
  });

  it("a FULL table is terminal: the sentence alone", () => {
    failed("This table is full (up to 12 guests).", "full");
    expect(alertText()).toContain("This table is full");
    expect(retryButton()).toBeNull();
    expect(codeEntry()).toBeNull();
  });

  it("the word decides, not the sentence: a sentence that merely CONTAINS “No table found” under a transient word is the generic line with a retry", () => {
    failed("No table found for that code", "try_again");
    expect(alertText()).toContain("Couldn’t join this table.");
    expect(alertText()).not.toContain("No table found");
    expect(retryButton()).not.toBeNull();
    expect(codeEntry()).toBeNull();
  });

  it("no word (an older server, a network failure) is the generic line with a retry — the raw text is never read out", () => {
    failed("HTTP 502", null);
    expect(alertText()).toContain("Couldn’t join this table.");
    expect(alertText()).not.toContain("HTTP 502");
    expect(retryButton()).not.toBeNull();
  });
});
