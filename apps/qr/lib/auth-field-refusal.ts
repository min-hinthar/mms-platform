/**
 * F20 · Codex round 1 on #355 — does an Auth refusal NAME THE VALUE the diner typed?
 *
 * The account card draws a refusal under its box (the `@mms/ui` Field's note, `aria-invalid`,
 * `aria-describedby`, focus moved there) only when retyping that box is the way out. Bound at the
 * submit, every failure of the form landed there: OTP switched off in the project's Auth settings,
 * a dropped connection, a rate limit — the box was marked wrong, focus went to it and the card's
 * one region stayed quiet, so a diner whose address was fine was told it was not. So the binding
 * is an ALLOW-list of refusals that identify the value; everything else (a service, configuration
 * or transport failure, and any answer we cannot name) stays the card's status line.
 *
 * Read from the GoTrue answer itself — the `{ code, message }` auth-js returns, or the card's own
 * stand-in for a rejected call (a message and no code, which is never the box's).
 */
export type AuthAnswer = { code?: string; message?: string };

/**
 * GoTrue's answer to `signInWithOtp({ shouldCreateUser: false })` for an address with no account.
 * ⚠️ The MESSAGE, never the code: GoTrue answers `otp_disabled` both for this and for OTP sign-in
 * switched off in the project's settings (Codex round 1 on #313), and "Signups not allowed for this
 * instance" (`signup_disabled`) is neither. Named once: the card's copy and the binding both read it.
 */
export const NO_ACCOUNT_FOR_OTP = /signups? not allowed for otp/i;

/**
 * The address itself is refused: no account holds it (the sign-in door), GoTrue will not accept it
 * (`email_address_invalid` — e.g. a test domain), or it is not an address GoTrue can read.
 * `email_address_not_authorized` is deliberately absent: that is the project's mail configuration
 * (the default SMTP sends only to its own team), not something the diner can fix by retyping.
 */
export function refusesTheAddress(e: AuthAnswer): boolean {
  const message = e.message ?? "";
  return (
    e.code === "email_address_invalid" ||
    NO_ACCOUNT_FOR_OTP.test(message) ||
    /unable to validate email address/i.test(message)
  );
}

/**
 * The code itself is refused. GoTrue answers a wrong code and an expired one alike —
 * `otp_expired`, "Token has expired or is invalid" — so both mean "type the code again"; the
 * message is read too for an SDK that drops the code. A rate limit or a dropped connection is not
 * the code's fault.
 */
export function refusesTheCode(e: AuthAnswer): boolean {
  return e.code === "otp_expired" || /token has expired or is invalid/i.test(e.message ?? "");
}
