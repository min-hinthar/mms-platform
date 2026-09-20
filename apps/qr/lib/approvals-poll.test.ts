import { describe, expect, it, vi } from "vitest";

// `lib/authz.ts` is a server module (`server-only`); the verdict is pure, so the marker is stubbed.
vi.mock("server-only", () => ({}));
const { AuthzError } = await import("./authz");
import { approvalsPollVerdict } from "./approvals-poll";

describe("approvalsPollVerdict — the poll's two refusals", () => {
  it("401 is a person who must sign in again; 403 is a person still signed in but no longer a manager", () => {
    expect(approvalsPollVerdict(new AuthzError("Staff sign-in required.", 401))).toBe("signin");
    // MUTATION: `err.status === 401 || err.status === 403` → "signin" — a demoted manager is sent
    // to the login and lands on their own profile with no word why; this reddens.
    expect(approvalsPollVerdict(new AuthzError("Insufficient role", 403))).toBe("role");
  });

  it("the platform unreachable is an outage, never a sign-in — the board must not evict a manager mid-service over a 503", () => {
    // MUTATION: `err instanceof AuthzError` alone — a 503 reads as signin and this reddens.
    expect(
      approvalsPollVerdict(
        new AuthzError("We can’t reach the ordering system right now", 503, "unavailable"),
      ),
    ).toBe("outage");
  });

  it("a throw that is not the gate's — a library error, a bare value — is an outage", () => {
    expect(approvalsPollVerdict(new Error("connection reset"))).toBe("outage");
    expect(approvalsPollVerdict("nope")).toBe("outage");
    expect(approvalsPollVerdict(undefined)).toBe("outage");
  });
});
