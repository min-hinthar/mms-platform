/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffLangProvider } from "./StaffLangProvider";
import {
  ManagerPinFields,
  PIN_NO_PIN_COPY,
  lockoutDuration,
  pinFailureCopy,
  secondsUntil,
} from "./ManagerPinStepUp";

/**
 * P7·2 — the shared PIN vocabulary. The mapper returns KEYS, not sentences, so what is pinned is the
 * key chosen and the slot it carries; the sentence itself is the dictionary's, guarded there. The
 * duration is the one string this module formats, in both tongues.
 */
afterEach(cleanup);

describe("lockoutDuration", () => {
  it("English: seconds alone, or minutes with zero-padded seconds", () => {
    expect(lockoutDuration("en", 45)).toBe("45s");
    expect(lockoutDuration("en", 65)).toBe("1m 05s");
    expect(lockoutDuration("en", 600)).toBe("10m 00s");
  });
  it("Burmese: the device's numerals and the unit words, no Latin at all", () => {
    expect(lockoutDuration("my", 45)).toBe("၄၅ စက္ကန့်");
    expect(lockoutDuration("my", 65)).toBe("၁ မိနစ် ၀၅ စက္ကန့်");
    expect(/[A-Za-z0-9]/.test(lockoutDuration("my", 125))).toBe(false);
  });
});

describe("pinFailureCopy", () => {
  const noop = vi.fn();
  it("a wrong PIN with tries left picks the plural key for the count", () => {
    expect(pinFailureCopy({ reason: "pin_wrong", attemptsRemaining: 3 }, noop)).toEqual({
      k: "pin.wrong.many",
      vars: { n: 3 },
    });
    expect(pinFailureCopy({ reason: "pin_wrong", attemptsRemaining: 1 }, noop)).toEqual({
      k: "pin.wrong.one",
      vars: { n: 1 },
    });
  });
  it("a wrong PIN with no tries left carries no count", () => {
    expect(pinFailureCopy({ reason: "pin_wrong", attemptsRemaining: 0 }, noop)).toEqual({
      k: "pin.wrong",
    });
  });
  it("a lockout seeds the countdown from the server clock and names the PIN, not the person", () => {
    const setLockLeft = vi.fn();
    const lockedUntil = new Date(Date.now() + 30_000).toISOString();
    expect(pinFailureCopy({ reason: "pin_locked", lockedUntil }, setLockLeft)).toEqual({
      k: "pin.tooManyThat",
    });
    expect(setLockLeft).toHaveBeenCalledTimes(1);
    expect(setLockLeft.mock.calls[0]![0]).toBeGreaterThanOrEqual(29);
    expect(setLockLeft.mock.calls[0]![0]).toBeLessThanOrEqual(30);
  });
  it("secondsUntil is ceiled and floored at zero", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(secondsUntil("2026-01-01T00:01:00Z", now)).toBe(60);
    expect(secondsUntil("2026-01-01T00:00:00.400Z", now)).toBe(1);
    expect(secondsUntil("2025-12-31T23:59:00Z", now)).toBe(0);
  });
  it("the no-PIN constant is a key, so the live region can mark it", () => {
    expect(PIN_NO_PIN_COPY).toEqual({ k: "pin.noPin.manager" });
  });
});

describe("ManagerPinFields", () => {
  const props = {
    idPrefix: "t",
    approverStaffId: "",
    onApproverChange: () => {},
    pin: "",
    onPinChange: () => {},
    locked: false,
  };
  it("under Burmese the labels are marked and the placeholder option carries the mark itself", () => {
    render(
      <StaffLangProvider lang="my">
        <ManagerPinFields {...props} approvers={null} />
      </StaffLangProvider>,
    );
    expect(document.querySelector('label[for="t-mgr"] [lang="my"]')?.textContent).toBe("မန်နေဂျာ");
    expect(document.querySelector('label[for="t-pin"] [lang="my"]')?.textContent).toBe("ပင်နံပါတ်");
    const placeholder = document.querySelector('option[value=""]')!;
    expect(placeholder.getAttribute("lang")).toBe("my");
    expect(placeholder.textContent).toBe("ဖွင့်နေပါတယ်…");
  });
  it("an empty roster says so in the option AND in the honest note beneath", () => {
    render(
      <StaffLangProvider lang="en">
        <ManagerPinFields {...props} approvers={[]} />
      </StaffLangProvider>,
    );
    expect(document.querySelector('option[value=""]')?.textContent).toBe("No managers available");
    expect((screen.getByLabelText("Manager") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/none are signed in right now/)).not.toBeNull();
  });
});
