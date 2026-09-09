import { describe, expect, it } from "vitest";
import { spyAdoption } from "./menu-spy";

describe("spyAdoption — a jump's intermediates are not reading positions (M194)", () => {
  it("adopts every pick while the diner scrolls under their own power", () => {
    // The default, and the one that must never regress: with no jump in flight the spy is the only
    // thing that knows where the page is, so a suppressed pick here is a rail frozen on a stale tab.
    expect(spyAdoption(null, "Curries")).toBe("adopt");
    expect(spyAdoption(null, "Noodles")).toBe("adopt");
  });

  it("ignores a section swept past on the way to the target", () => {
    // The whole cost M194 removes. A tap on "Desserts" from "Starters" crosses everything between,
    // and each crossing used to re-render the ~97-card grid and re-centre the rail (two forced
    // layouts plus a restarted smooth scroll). The diner picked a destination, not a tour.
    expect(spyAdoption("Desserts", "Curries")).toBe("ignore");
    expect(spyAdoption("Desserts", "Noodles")).toBe("ignore");
  });

  it("arrives — and says so — when the pick IS the target", () => {
    // `arrive` is distinct from `adopt` on purpose: the caller has a latch and a timer to clear, and
    // collapsing the two arms would leave the jump privileged until the settle timeout fired, which
    // would then suppress the diner's real scrolling for the rest of that window.
    expect(spyAdoption("Desserts", "Desserts")).toBe("arrive");
  });

  it("never answers `ignore` without a pending target — the gate cannot close on its own", () => {
    // The over-blocking direction, asserted rather than assumed. `lib/cart-freeze.ts` and the
    // delivery repo's `computeDeliveryGate` both record what a gate that is right about its own case
    // and wrong about the valid one costs; here it would be a rail that stops tracking the page.
    for (const picked of ["Starters", "Curries", "Noodles", "Desserts", ""]) {
      expect(spyAdoption(null, picked)).not.toBe("ignore");
    }
  });

  it("treats the empty string as a real category name, not as 'no jump'", () => {
    // `pending` is nullable and `picked` is not, so the null check must be `=== null` and never
    // falsiness. A category whose name is empty is a data problem, but a latch that silently
    // disengaged on one would be a code problem — and an `if (!pending)` would do exactly that.
    expect(spyAdoption("", "Curries")).toBe("ignore");
    expect(spyAdoption("", "")).toBe("arrive");
  });
});
