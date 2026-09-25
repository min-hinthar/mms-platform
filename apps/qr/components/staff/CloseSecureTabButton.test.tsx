/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import { tf } from "@/lib/i18n/fill";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";

/**
 * Phase 2a · register — a secure-tab close whose Server Action REJECTS (the connection dropped
 * mid-charge) used to latch the confirm on "Charging…" with both buttons disabled and focus on
 * <body> until a reload. The charge's outcome is UNKNOWN there — the server arm holds the freeze —
 * so the sentence is the unknown-outcome one, never the write-outage twin.
 */
const closeSecureTab = vi.fn();
vi.mock("@/lib/staff-cart", () => ({
  closeSecureTab: (...a: unknown[]) => closeSecureTab(...(a as [])),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CloseSecureTabButton } = await import("./CloseSecureTabButton");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const onChanged = vi.fn();
function mount() {
  const view = (totalCents: number) => (
    <StaffLangProvider lang="en">
      <CloseSecureTabButton sessionId="s1" totalCents={totalCents} onChanged={onChanged} />
    </StaffLangProvider>
  );
  const r = render(view(4210));
  /** The page's detail re-read moving the prop (the confirm may be open). */
  const rerender = (totalCents: number) => r.rerender(view(totalCents));
  const trigger = () =>
    screen.getByRole("button", {
      name: new RegExp(`^${STAFF["settle.card.trigger"].en.replace("{m}", "\\$42\\.10")}`),
    });
  const charge = async () => {
    fireEvent.click(trigger());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.10/ }));
    });
  };
  return { trigger, charge, rerender };
}

describe("CloseSecureTabButton — a rejected close never latches", () => {
  it("a REJECTING closeSecureTab clears busy, closes the confirm, returns focus to the trigger and says the outcome is unknown", async () => {
    closeSecureTab.mockRejectedValueOnce(new Error("fetch failed"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { trigger, charge } = mount();
    await charge();
    // MUTATION: remove the catch — the rejection escapes, busy stays true and the confirm stays
    // open on "Charging…" with focus on <body>; red.
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText("Charging…")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(STAFF["settle.card.unknown"].en);
    expect(alert.textContent).not.toContain(STAFF_WRITE_OUTAGE);
    expect(refresh).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
  });

  it("a server refusal still reads the server's sentence (OutageText), not the unknown-outcome one", async () => {
    closeSecureTab.mockResolvedValueOnce({
      ok: false,
      error: "The card on file was declined — settle by cash or a fresh card.",
    });
    const { trigger, charge } = mount();
    await charge();
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(screen.getByRole("alert").textContent).toBe(
      "The card on file was declined — settle by cash or a fresh card.",
    );
  });

  it("the next attempt clears the last one's alert", async () => {
    closeSecureTab.mockRejectedValueOnce(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { charge } = mount();
    await charge();
    expect(screen.getByRole("alert")).toBeTruthy();
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await charge();
    expect(screen.queryByRole("alert")).toBeNull();
    // Phase 2c — the landed close re-reads the PAGE's detail (`onChanged`); `router.refresh()`
    // updated nothing FloorDetailLive reads. MUTATION: drop the call — red.
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("CloseSecureTabButton — Buttons, never native `disabled` (Phase 2c · register, K35)", () => {
  it("trigger, Cancel and Charge are @mms/ui Buttons; while charging, Charge is busy and Cancel refuses — no native disabled anywhere", async () => {
    let resolve!: (v: { ok: true }) => void;
    closeSecureTab.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { trigger } = mount();
    expect(trigger().classList.contains("ui-btn-primary")).toBe(true);
    fireEvent.click(trigger());
    const charge = screen.getByRole("button", { name: /^Charge \$42\.10/ });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(charge.classList.contains("ui-btn")).toBe(true);
    await act(async () => {
      fireEvent.click(charge);
    });
    const busy = document.querySelector('[aria-busy="true"]')!;
    expect(busy.textContent).toBe(STAFF["settle.card.charging"].en);
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    // The whole component, not one control: K35 is "no native disabled on a tapped control".
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    // A second tap while charging never asks twice.
    await act(async () => {
      fireEvent.click(busy);
    });
    expect(closeSecureTab).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true });
    });
  });
});

describe("CloseSecureTabButton — the confirm's quote and a MOVED total (Phase 2c · register, P2aa)", () => {
  it("the charge carries the total the confirm SHOWED as a compare-only quote", async () => {
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    const { charge } = mount();
    await charge();
    // MUTATION: drop `quotedCents` — the server's compare never runs; red.
    expect(closeSecureTab).toHaveBeenCalledWith({ sessionId: "s1", quotedCents: 4210 });
  });

  it("a moved total names both figures, re-reads the page, quotes the server's figure, and the re-tap sends it", async () => {
    closeSecureTab.mockResolvedValueOnce({
      ok: false,
      code: "moved",
      totalCents: 4265,
      error: "The total changed — check the order, then take payment again.",
    });
    const { charge } = mount();
    await charge();
    expect(screen.getByRole("alert").textContent).toBe(
      STAFF["settle.cash.moved"].en.replace("{old}", "$42.10").replace("{m}", "$42.65"),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    // The confirm closed (focus back on the trigger), and the trigger now reads the server's figure.
    const trigger = screen.getByRole("button", {
      name: new RegExp(`^${STAFF["settle.card.trigger"].en.replace("{m}", "\\$42\\.65")}`),
    });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.65/ }));
    });
    expect(closeSecureTab).toHaveBeenLastCalledWith({ sessionId: "s1", quotedCents: 4265 });
  });
});

describe("CloseSecureTabButton — the confirm's figure is FROZEN when it opens (critic finding)", () => {
  it("a total that moves while the confirm is open never changes the charge silently: the alert names both, the tap adopts, only the NEXT tap charges", async () => {
    const { trigger, rerender } = mount();
    fireEvent.click(trigger());
    rerender(4610);
    // MUTATION: bind the confirm to the live prop — it reads "Charge $46.10" with no announcement,
    // and the tap sends a quote that equals the live total, so the compare passes unread; red.
    const charge = screen.getByRole("button", { name: /^Charge \$42\.10/ });
    const moved = STAFF["settle.cash.moved"].en.replace("{old}", "$42.10").replace("{m}", "$46.10");
    expect(screen.getByRole("alert").textContent).toBe(moved);
    await act(async () => {
      fireEvent.click(charge);
    });
    // MUTATION: drop the drift arm — the old quote goes to the server; red.
    expect(closeSecureTab).not.toHaveBeenCalled();
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$46\.10/ }));
    });
    expect(closeSecureTab).toHaveBeenCalledWith({ sessionId: "s1", quotedCents: 4610 });
  });
});

describe("CloseSecureTabButton — a refusal mid-payment is said in the device language (P2w, critic finding)", () => {
  it("the typed `inflight` refusal renders its holder's key in Burmese — never the server's English", async () => {
    const english = "A payment on this table is already going through.";
    closeSecureTab.mockResolvedValueOnce({
      ok: false,
      code: "inflight",
      holder: "unsure",
      error: english,
    });
    render(
      <StaffLangProvider lang="my">
        <CloseSecureTabButton sessionId="s1" totalCents={4210} onChanged={onChanged} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]!); // the confirm's Charge (Cancel comes first)
    });
    // MUTATION: render `res.error` through <OutageText> — the English passes through verbatim; red.
    const alert = screen.getByRole("alert").textContent;
    expect(alert).toBe(tf("my", "settle.inflight.unsure", { n: SETTLE_MINUTES }));
    expect(alert).not.toContain(english);
  });
});

// ── Phase 2c · gate ──
describe("CloseSecureTabButton — the settle gate (refused while dishes are unsent)", () => {
  const triggerName = new RegExp(
    `^${STAFF["settle.card.trigger"].en.replace("{m}", "\\$42\\.10")}`,
  );

  it("blocked: aria-disabled (never native), read with the page's note first, and a tap opens NO confirm — it hands up once", () => {
    const onBlockedTap = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <CloseSecureTabButton
          sessionId="s1"
          totalCents={4210}
          blocked
          blockedNoteId="settle-unsent-note"
          onBlockedTap={onBlockedTap}
        />
      </StaffLangProvider>,
    );
    const trigger = screen.getByRole("button", { name: triggerName });
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.hasAttribute("disabled")).toBe(false);
    expect(trigger.getAttribute("aria-describedby")).toBe("settle-unsent-note secure-close-hint");
    fireEvent.click(trigger);
    // MUTATION (secure-close/unsent-tap-opens-the-confirm): drop the handler's guard — the "Charge
    // $x" confirm opens over dishes nobody sent, one tap from an off-session charge; red.
    expect(screen.queryByRole("group")).toBeNull();
    expect(closeSecureTab).not.toHaveBeenCalled();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledWith(null);
  });

  it("not blocked: no aria-disabled from the gate", () => {
    // MUTATION (secure-close/unsent-trigger-always-dimmed): spread aria-disabled regardless; red.
    render(
      <StaffLangProvider lang="en">
        <CloseSecureTabButton sessionId="s1" totalCents={4210} />
      </StaffLangProvider>,
    );
    const trigger = screen.getByRole("button", { name: triggerName });
    expect(trigger.getAttribute("aria-disabled")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")).toBe("secure-close-hint");
  });

  it("a server `unsent` refusal renders the RUNNING BILL's sentence in Burmese with its count, hands the jump up once, and never pulls focus back to the trigger", async () => {
    const english = "Some dishes haven’t gone to the kitchen.";
    closeSecureTab.mockResolvedValueOnce({ ok: false, code: "unsent", units: 2, error: english });
    const onBlockedTap = vi.fn(() => {
      // The page's jump: focus moves to the order's lines (a stand-in heading here).
      document.getElementById("stand-in-order-h")!.focus();
    });
    render(
      <StaffLangProvider lang="my">
        <h2 id="stand-in-order-h" tabIndex={-1}>
          order
        </h2>
        <CloseSecureTabButton sessionId="s1" totalCents={4210} onBlockedTap={onBlockedTap} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    const charge = screen
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(charge);
    });
    // MUTATION (secure-close/unsent-said-in-english): drop the `unsent` arm — the server's English
    // passes through on a Burmese console; red.
    const said = tf("my", "table.send.settleBlocked.tab.many", { n: 2 });
    expect(document.body.textContent).toContain(said);
    expect(document.body.textContent).not.toContain(english);
    expect(screen.queryByRole("alert")).toBeNull();
    // MUTATION (secure-close/unsent-refusal-never-jumps): drop the hand-up — staff are left on a
    // refused close with the lines to remove somewhere above; red.
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledWith(2);
    // The confirm's close does not steal focus back from the page's jump.
    expect(document.activeElement).toBe(document.getElementById("stand-in-order-h"));
  });
  // ── the critic's findings (Phase 2c · gate, round 2) ──
  const said = tf("en", "table.send.settleBlocked.tab.many", { n: 2 });
  const el = (p: { blocked?: boolean; gateLive?: boolean }) => (
    <StaffLangProvider lang="en">
      <CloseSecureTabButton sessionId="s1" totalCents={4210} {...p} />
    </StaffLangProvider>
  );
  async function raceIt() {
    closeSecureTab.mockResolvedValueOnce({ ok: false, code: "unsent", units: 2, error: "x" });
    fireEvent.click(screen.getAllByRole("button")[0]!);
    const charge = screen
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(charge);
    });
  }

  it("a raced line is DROPPED once the page reads the table blocked — it never comes back once the dishes are removed", async () => {
    const { rerender } = render(el({}));
    await raceIt();
    expect(document.body.textContent).toContain(said);
    rerender(el({ blocked: true }));
    expect(document.body.textContent).not.toContain(said);
    rerender(el({ blocked: false }));
    // MUTATION (secure-close/unsent-raced-line-outlives-the-page): clear only when the page's line
    // retires — the close offers to remove dishes that were just removed; red.
    expect(document.body.textContent).not.toContain(said);
  });

  it("a raced line goes when the page's own gate line retires", async () => {
    const { rerender } = render(el({ gateLive: true }));
    await raceIt();
    expect(document.body.textContent).toContain(said);
    rerender(el({ gateLive: false }));
    // MUTATION (secure-close/unsent-raced-line-outlives-the-gate): clear only on `blocked`; red.
    expect(document.body.textContent).not.toContain(said);
  });
});

// ── Phase 2c · review fixes · reg2 ──
describe("CloseSecureTabButton — a refusal's figure is settled by the page's NEXT read (R1)", () => {
  const triggerAt = (m: string) =>
    screen.getByRole("button", {
      name: new RegExp(
        `^${STAFF["settle.card.trigger"].en.replace("{m}", m.replace(/[$.]/g, "\\$&"))}`,
      ),
    });
  it("add-then-remove before the re-read: the read that began AFTER the refusal re-opens the confirm on $42.10", async () => {
    closeSecureTab.mockResolvedValueOnce({
      ok: false,
      code: "moved",
      totalCents: 4265,
      error: "The total changed — check the order, then take payment again.",
    });
    const el = (totalCents: number, readTicket: number) => (
      <StaffLangProvider lang="en">
        <CloseSecureTabButton
          sessionId="s1"
          totalCents={totalCents}
          onChanged={onChanged}
          readTicket={readTicket}
          readsStarted={() => Math.max(readTicket, 4)}
        />
      </StaffLangProvider>
    );
    // Read #3 committed; read #4 already in the air when the refusal comes back.
    const { rerender } = render(el(4210, 3));
    fireEvent.click(triggerAt("$42.10"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.10/ }));
    });
    expect(triggerAt("$42.65")).toBeTruthy();
    // MUTATION (p2c-reg2/tab-close-refusal-raised-at-the-committed-read): read #4 (in the air at
    // the refusal) would settle it and put the pre-refusal $42.10 back on the trigger; red.
    rerender(el(4210, 4));
    expect(triggerAt("$42.65")).toBeTruthy();
    // Read #5 began after the refusal — the guest removed the item: the trigger reads $42.10 again.
    // MUTATION (p2c-reg2/tab-close-quote-ignores-the-read-clock): the trigger keeps $42.65; red.
    rerender(el(4210, 5));
    fireEvent.click(triggerAt("$42.10"));
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.10/ }));
    });
    expect(closeSecureTab).toHaveBeenLastCalledWith({ sessionId: "s1", quotedCents: 4210 });
  });
});
