import { describe, expect, it } from "vitest";
import {
  INVITE_CREATE_FAILED,
  INVITE_SAVE_FAILED,
  MANAGERS_ONLY,
  provisionOutcome,
  readProvisionVerdict,
  readSetVerdict,
  setOutcome,
  TEAM_UPDATE_FAILED,
} from "./staff-team-outcome";

/**
 * M210 · M208 · M205 — reading the database's verdict on a team write. Every mapping is pinned by
 * VALUE, because the failure this module exists to prevent is a quiet one: a status read as success
 * shows the console a change nobody stored, and a sentence swapped between the two kinds tells a
 * person the wrong thing about their own authority.
 */

describe("readSetVerdict — only a status the RPC can return is a verdict", () => {
  it("reads every status mms_staff_set returns", () => {
    for (const status of [
      "ok",
      "noop",
      "not_authorized",
      "not_found",
      "self",
      "changed",
      "ceiling",
    ]) {
      expect(readSetVerdict({ status })?.status).toBe(status);
    }
  });

  it("refuses anything else — never an ok it did not say", () => {
    expect(readSetVerdict(null)).toBeNull();
    expect(readSetVerdict(undefined)).toBeNull();
    expect(readSetVerdict("ok")).toBeNull();
    expect(readSetVerdict([{ status: "ok" }])).toBeNull();
    expect(readSetVerdict({})).toBeNull();
    expect(readSetVerdict({ status: "OK" })).toBeNull();
    expect(readSetVerdict({ status: "exists" })).toBeNull(); // the invite's, not this RPC's
  });

  it("carries the address the RPC answered, and only a real one", () => {
    expect(readSetVerdict({ status: "ok", email: "a@b.c" })?.email).toBe("a@b.c");
    expect(readSetVerdict({ status: "ok", email: "" })?.email).toBeNull();
    expect(readSetVerdict({ status: "ok", email: 7 })?.email).toBeNull();
    expect(readSetVerdict({ status: "ok" })?.email).toBeNull();
  });
});

describe("setOutcome — what the console says", () => {
  it("ok and noop are both success: the member is where they were asked to be", () => {
    for (const kind of ["role", "active"] as const) {
      expect(setOutcome(kind, { status: "ok" })).toEqual({ ok: true });
      expect(setOutcome(kind, { status: "noop" })).toEqual({ ok: true });
    }
  });

  it("an unreadable verdict is a failure, never success", () => {
    expect(setOutcome("role", null)).toEqual({ ok: false, error: TEAM_UPDATE_FAILED });
    expect(setOutcome("active", null)).toEqual({ ok: false, error: TEAM_UPDATE_FAILED });
  });

  it("each refusal says which one it was, for a role change", () => {
    expect(setOutcome("role", { status: "not_authorized" })).toEqual({
      ok: false,
      error: MANAGERS_ONLY,
    });
    expect(setOutcome("role", { status: "not_found" })).toEqual({
      ok: false,
      error: "No such staff member.",
    });
    expect(setOutcome("role", { status: "self" })).toEqual({
      ok: false,
      error: "You can’t change your own role.",
    });
    expect(setOutcome("role", { status: "changed" })).toEqual({
      ok: false,
      error: "That role just changed — the list now shows it. Check it and try again.",
      refresh: true, // the one refusal whose cause is the screen: the console re-reads the roster
    });
    expect(setOutcome("role", { status: "ceiling" })).toEqual({
      ok: false,
      error: "Only the owner can change an owner’s role.",
    });
  });

  it("and for an active flip", () => {
    expect(setOutcome("active", { status: "not_authorized" })).toEqual({
      ok: false,
      error: MANAGERS_ONLY,
    });
    expect(setOutcome("active", { status: "self" })).toEqual({
      ok: false,
      error: "You can’t deactivate your own account.",
    });
    expect(setOutcome("active", { status: "changed" })).toEqual({
      ok: false,
      error: "That member’s role just changed — the list now shows it. Check it and try again.",
      refresh: true,
    });
    expect(setOutcome("active", { status: "ceiling" })).toEqual({
      ok: false,
      error: "Only the owner can change an owner’s account.",
    });
  });
});

describe("the invite", () => {
  it("reads only the statuses mms_staff_provision returns", () => {
    for (const status of ["ok", "not_authorized", "ceiling", "exists"]) {
      expect(readProvisionVerdict({ status })).toBe(status);
    }
    expect(readProvisionVerdict({ status: "noop" })).toBeNull();
    expect(readProvisionVerdict(null)).toBeNull();
    expect(readProvisionVerdict([])).toBeNull();
    expect(readProvisionVerdict("ok")).toBeNull();
  });

  it("maps each verdict, and a duplicate reads exactly like any other refusal to create", () => {
    expect(provisionOutcome("ok")).toEqual({ ok: true });
    expect(provisionOutcome("not_authorized")).toEqual({ ok: false, error: MANAGERS_ONLY });
    expect(provisionOutcome("ceiling")).toEqual({
      ok: false,
      error: "Only the owner can add another owner.",
    });
    // S1-audit S7: no account-existence oracle — the same sentence `createUser`'s failure gives.
    expect(provisionOutcome("exists")).toEqual({ ok: false, error: INVITE_CREATE_FAILED });
    expect(INVITE_CREATE_FAILED).toBe(
      "Couldn’t create that account. Check the email and try again.",
    );
    expect(provisionOutcome(null)).toEqual({ ok: false, error: INVITE_SAVE_FAILED });
  });
});
