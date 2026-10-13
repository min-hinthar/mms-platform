import { describe, expect, it } from "vitest";
import { NO_ACCOUNT_FOR_OTP, refusesTheAddress, refusesTheCode } from "./auth-field-refusal";

/**
 * F20 · Codex round 1 on #355 — which Auth answers name the value in a box. The split is the spec,
 * written out as one: the refusals the diner fixes by retyping that box, and the failures that are
 * the service's, the project's configuration or the connection's.
 */
describe("refusesTheAddress", () => {
  it("binds the refusals that identify the ADDRESS", () => {
    // MUTATION uia11y/f20-no-account-off-the-box: "no account for that email" left the box; red.
    expect(
      refusesTheAddress({ message: "Signups not allowed for otp", code: "otp_disabled" }),
    ).toBe(true);
    // MUTATION uia11y/f20-invalid-address-off-the-box: GoTrue's refusal of the address itself; red.
    expect(
      refusesTheAddress({
        message: 'Email address "a@example.com" is invalid',
        code: "email_address_invalid",
      }),
    ).toBe(true);
    expect(refusesTheAddress({ code: "email_address_invalid" })).toBe(true);
    // MUTATION uia11y/f20-unreadable-address-off-the-box: red.
    expect(
      refusesTheAddress({
        message: "Unable to validate email address: invalid format",
        code: "validation_failed",
      }),
    ).toBe(true);
  });

  it("never marks the address wrong for the service, the configuration or the connection", () => {
    const notTheAddress = [
      // MUTATION uia11y/f20-otp-code-means-no-account: keyed on the code, the outage is "no account"; red.
      { message: "Email logins are disabled", code: "otp_disabled" },
      { message: "Signups not allowed for this instance", code: "signup_disabled" },
      { message: "Email rate limit exceeded", code: "over_email_send_rate_limit" },
      {
        message: "Email address not authorized",
        code: "email_address_not_authorized",
      },
      { message: "Failed to fetch" },
      { message: "" },
      {},
    ];
    for (const e of notTheAddress) expect(refusesTheAddress(e), JSON.stringify(e)).toBe(false);
  });

  it("names the no-account answer once — the card's copy reads the same rule", () => {
    expect(NO_ACCOUNT_FOR_OTP.test("Signups not allowed for otp")).toBe(true);
    expect(NO_ACCOUNT_FOR_OTP.test("Signups not allowed for this instance")).toBe(false);
  });
});

describe("refusesTheCode", () => {
  it("binds a wrong or expired code, by GoTrue's code or by its message", () => {
    // MUTATION uia11y/f20-otp-expired-off-the-box: the code alone no longer binds; red.
    expect(refusesTheCode({ code: "otp_expired", message: "OTP has expired" })).toBe(true);
    // MUTATION uia11y/f20-token-message-off-the-box: an SDK that drops the code; red.
    expect(refusesTheCode({ message: "Token has expired or is invalid" })).toBe(true);
  });

  it("never marks the code wrong for a rate limit, the connection or an answer we cannot name", () => {
    const notTheCode = [
      { message: "Request rate limit reached", code: "over_request_rate_limit" },
      { message: "Failed to fetch" },
      { message: "Email logins are disabled", code: "otp_disabled" },
      { message: "" },
      {},
    ];
    for (const e of notTheCode) expect(refusesTheCode(e), JSON.stringify(e)).toBe(false);
  });
});
