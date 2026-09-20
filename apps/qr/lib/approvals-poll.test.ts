import { describe, expect, it, vi } from "vitest";

// `lib/authz.ts` is a server module (`server-only`); the verdict is pure, so the marker is stubbed.
vi.mock("server-only", () => ({}));
const { AuthzError } = await import("./authz");
import { approvalsPollVerdict } from "./approvals-poll";

describe("approvalsPollVerdict — the poll's two refusals", () => {
  it("a gate refusal is a person who must sign in again — 401 and 403 alike", () => {
    expect(approvalsPollVerdict(new AuthzError("Staff sign-in required.", 401))).toBe("signin");
    expect(approvalsPollVerdict(new AuthzError("Manager only.", 403))).toBe("signin");
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
