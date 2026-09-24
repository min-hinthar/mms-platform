/** @vitest-environment jsdom */
import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import type {
  SendNotice,
  StaffFireResult,
  StaffSendHold,
  StaffSendView,
  StaffUndoResult,
} from "@/lib/staff-send-view";

/**
 * Phase 2a · send — the table page's Send + Undo, through the host-owned controller
 * (`useStaffSend`) and its pure view (`StaffSendButton`). The harness below plays the HOST: it owns
 * the hook and hands the view its state, so a "detail refresh" is a re-render with a new view and a
 * "view swap" is the slot unmounting and coming back — the two things that must never kill an open
 * undo.
 */
const fire = vi.fn<(raw: unknown) => Promise<StaffFireResult>>();
const undo = vi.fn<(raw: unknown) => Promise<StaffUndoResult>>();
vi.mock("@/lib/staff-send", () => ({
  staffFireCart: (raw: unknown) => fire(raw),
  staffUndoFire: (raw: unknown) => undo(raw),
}));
const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (m: string) => haptic(m) }));

const { useStaffSend, undoStashKey } = await import("./useStaffSend");
const { StaffSendButton } = await import("./StaffSendButton");

const SESSION = "11111111-1111-4111-8111-111111111111";
const T = Date.parse("2026-09-24T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const SEND: StaffSendView = {
  kind: "send",
  units: 3,
  emphasis: "primary",
  note: null,
  blocked: null,
  staffAdded: 3,
  dinerUnits: 0,
};
const ALL_SENT: StaffSendView = { kind: "allSent" };

let hold: StaffSendHold = null;
const notices: (SendNotice | null)[] = [];
const refreshes = vi.fn();

function Host({
  view,
  seq,
  lang = "en",
  slot = true,
  renderedHold = null,
}: {
  view: StaffSendView;
  seq: number;
  lang?: StaffLang;
  slot?: boolean;
  renderedHold?: StaffSendHold;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ctl = useStaffSend({
    sessionId: SESSION,
    view,
    detailSeq: seq,
    getHold: () => hold,
    rootRef,
    onNotice: (n) => notices.push(n),
    onRefresh: refreshes,
  });
  return (
    <div ref={rootRef}>
      <label htmlFor="note-field">note</label>
      <input id="note-field" data-note-for="l1" />
      {slot && (
        <StaffSendButton
          lang={lang}
          ctl={ctl}
          controlRef={ctl.controlRef}
          statusRef={ctl.statusRef}
          hold={renderedHold}
          hostName={null}
        />
      )}
    </div>
  );
}

const sentOk = (over: Partial<Extract<StaffFireResult, { ok: true }>> = {}): StaffFireResult => ({
  ok: true,
  fired: 3,
  undoUntil: iso(T + 10_000),
  serverNow: iso(T),
  undoBatch: "b",
  ...over,
});

const control = () => document.querySelector<HTMLButtonElement>(".staff-send button")!;
/** Let the resolved action's continuation run, and advance the fake clock. */
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Send, and land in the open undo window with the device clock `skewMs` off the server's. */
async function sendIntoUndo(skewMs = 0) {
  vi.setSystemTime(T + skewMs);
  fire.mockResolvedValueOnce(sentOk());
  const r = render(<Host view={SEND} seq={0} />);
  await flush();
  fireEvent.click(control());
  await flush();
  return r;
}

beforeEach(() => {
  vi.useFakeTimers({ now: T });
  hold = null;
  notices.length = 0;
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the Send — one tap, guarded by a ref", () => {
  it("two taps in ONE frame send once (the in-flight guard is a ref, not a render)", async () => {
    fire.mockReturnValue(new Promise(() => {}));
    render(<Host view={SEND} seq={0} />);
    await flush();
    const btn = control();
    // One act = one frame: no re-render between the taps, so only a REF can refuse the second.
    act(() => {
      btn.click();
      btn.click();
    });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith({ sessionId: SESSION });
    expect(haptic).toHaveBeenCalledWith("commit");
  });

  it("the label says what it sends, and is never natively disabled", async () => {
    render(<Host view={SEND} seq={0} />);
    await flush();
    expect(control().textContent).toBe(STAFF["table.send.cta.many"].en.replace("{n}", "3"));
    expect(document.querySelector("[disabled]")).toBeNull();
  });
});

describe("the Undo — the server's grace, counted from this device's receipt", () => {
  it("mounts on the SAME node, focused, reading 'Undo · 10s' with the device clock 5 min AHEAD", async () => {
    vi.setSystemTime(T + 300_000);
    fire.mockResolvedValueOnce(sentOk());
    render(<Host view={SEND} seq={0} />);
    await flush();
    const before = control();
    fireEvent.click(before);
    await flush();
    expect(control()).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.textContent).toBe("Undo· 10s");
    await flush(1000);
    expect(before.textContent).toBe("Undo· 9s");
  });

  it("its accessible name is the verb alone — no digits, in either language", async () => {
    await sendIntoUndo();
    expect(screen.getByRole("button", { name: STAFF["table.send.undo"].en })).toBe(control());
    cleanup();
    vi.setSystemTime(T);
    fire.mockResolvedValueOnce(sentOk());
    render(<Host view={SEND} seq={0} lang="my" />);
    await flush();
    fireEvent.click(control());
    await flush();
    // The countdown is on screen but aria-hidden; what remains is ပြန်ယူ with its English echo —
    // and no digit in either numeral system.
    const countdown = control().querySelector('[aria-hidden="true"]');
    expect(countdown?.textContent).toMatch(/[\u1040-\u1049]/);
    const name = accessibleText(control());
    expect(name).toContain(STAFF["table.send.undo"].my);
    expect(name).not.toMatch(/[0-9၀-၉]/);
  });

  it("a tap within 350ms of the relabel is the same gesture — ignored; at 351ms it undoes THIS batch", async () => {
    await sendIntoUndo();
    undo.mockResolvedValueOnce({ ok: true, unfired: 3 });
    await flush(349);
    fireEvent.click(control());
    expect(undo).not.toHaveBeenCalled();
    await flush(2);
    fireEvent.click(control());
    expect(undo).toHaveBeenCalledWith({ sessionId: SESSION, batch: "b" });
  });

  it("survives a detail refresh that zeroes the counts, and a view swap", async () => {
    const r = await sendIntoUndo();
    r.rerender(<Host view={ALL_SENT} seq={1} />);
    expect(control().textContent).toContain(STAFF["table.send.undo"].en);
    r.rerender(<Host view={ALL_SENT} seq={2} slot={false} />);
    expect(control()).toBeNull();
    r.rerender(<Host view={ALL_SENT} seq={2} slot />);
    expect(control().textContent).toBe("Undo· 10s");
    undo.mockResolvedValueOnce({ ok: true, unfired: 3 });
    await flush(400);
    fireEvent.click(control());
    expect(undo).toHaveBeenCalledWith({ sessionId: SESSION, batch: "b" });
  });

  it("at the window's close, focus on the Undo moves to the status row WITHOUT scrolling", async () => {
    const r = await sendIntoUndo();
    r.rerender(<Host view={ALL_SENT} seq={1} />);
    control().focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await flush(10_250);
    const row = document.querySelector<HTMLElement>(".staff-send-status")!;
    expect(row).not.toBeNull();
    expect(document.activeElement).toBe(row);
    const call = focus.mock.contexts.findIndex((el) => el === row);
    expect(call).toBeGreaterThanOrEqual(0);
    expect(focus.mock.calls[call]![0]).toEqual({ preventScroll: true });
    expect(sessionStorage.getItem(undoStashKey(SESSION))).toBeNull();
  });
});

describe("after an undo — busy until the drafts come back", () => {
  it("stays aria-busy 'Bringing it back…' on a stale commit, then the Send returns focused", async () => {
    const r = await sendIntoUndo();
    r.rerender(<Host view={ALL_SENT} seq={1} />);
    undo.mockResolvedValueOnce({ ok: true, unfired: 3 });
    await flush(400);
    fireEvent.click(control());
    await flush();
    expect(notices.at(-1)).toEqual({ tone: "ok", msg: { k: "table.send.undone" } });
    // A poll that began before the undo landed: still "all sent" — the control holds, busy.
    r.rerender(<Host view={ALL_SENT} seq={2} />);
    expect(control().getAttribute("aria-busy")).toBe("true");
    expect(control().textContent).toBe(STAFF["table.send.undoing"].en);
    r.rerender(<Host view={SEND} seq={3} />);
    await flush();
    expect(control().getAttribute("aria-busy")).toBeNull();
    expect(control().textContent).toBe(STAFF["table.send.cta.many"].en.replace("{n}", "3"));
    expect(document.activeElement).toBe(control());
  });

  it("the hold is bounded: two stale commits release it", async () => {
    const r = await sendIntoUndo();
    r.rerender(<Host view={ALL_SENT} seq={1} />);
    undo.mockResolvedValueOnce({ ok: true, unfired: 3 });
    await flush(400);
    fireEvent.click(control());
    await flush();
    r.rerender(<Host view={ALL_SENT} seq={2} />);
    expect(control().getAttribute("aria-busy")).toBe("true");
    r.rerender(<Host view={ALL_SENT} seq={3} />);
    await flush();
    expect(document.querySelector(".staff-send-status")).not.toBeNull();
  });

  it("a Send that comes back is held for 350ms too — ANY relabel, not only Send → Undo", async () => {
    const r = await sendIntoUndo();
    undo.mockResolvedValueOnce({ ok: true, unfired: 3 });
    await flush(400);
    fireEvent.click(control());
    await flush();
    r.rerender(<Host view={SEND} seq={1} />);
    await flush();
    fire.mockResolvedValueOnce(sentOk());
    await flush(200);
    fireEvent.click(control());
    expect(fire).toHaveBeenCalledTimes(1); // only the first send
    await flush(200);
    fireEvent.click(control());
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it("a count that moves under the finger is a relabel too", async () => {
    const r = render(<Host view={SEND} seq={0} />);
    await flush(1000);
    r.rerender(<Host view={{ ...SEND, units: 4, staffAdded: 4 }} seq={1} />);
    fire.mockResolvedValue(sentOk());
    fireEvent.click(control());
    expect(fire).not.toHaveBeenCalled();
    await flush(351);
    fireEvent.click(control());
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("an expired take-back says so and closes the window, focus kept in the slot", async () => {
    const r = await sendIntoUndo();
    r.rerender(<Host view={ALL_SENT} seq={1} />);
    undo.mockResolvedValueOnce({ ok: false, reason: "expired" });
    await flush(400);
    fireEvent.click(control());
    await flush();
    expect(notices.at(-1)).toEqual({ tone: "warn", msg: { k: "table.send.err.expired" } });
    expect(document.activeElement).toBe(document.querySelector(".staff-send-status"));
  });
});

describe("refusals and the unknown", () => {
  it("a THROWN send says 'couldn't confirm', offers no Undo, and re-reads the table now", async () => {
    fire.mockRejectedValueOnce(new Error("network"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Host view={SEND} seq={0} />);
    await flush();
    fireEvent.click(control());
    await flush();
    expect(notices.at(-1)).toEqual({ tone: "warn", msg: { k: "table.send.err.unknown" } });
    expect(refreshes).toHaveBeenCalled();
    expect(control().textContent).not.toContain(STAFF["table.send.undo"].en);
    spy.mockRestore();
  });

  it("a note held open on a sendable dish: aria-disabled, no send, and the finger goes to the note", async () => {
    hold = { kind: "note", lineId: "l1", name: "Mohinga" };
    render(<Host view={SEND} seq={0} renderedHold={hold} />);
    await flush();
    const btn = control();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    const hint = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toBe(STAFF["table.send.hold.note"].en.replace("{x}", "Mohinga"));
    fireEvent.click(btn);
    expect(fire).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.querySelector('[data-note-for="l1"]'));
  });

  it("a payment in flight: no [disabled] anywhere, aria-disabled, described by the paying hint", async () => {
    render(<Host view={{ ...SEND, blocked: "paying" }} seq={0} />);
    await flush();
    const btn = control();
    expect(document.querySelector("[disabled]")).toBeNull();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    const hint = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toBe(STAFF["table.send.paying"].en);
    fireEvent.click(btn);
    expect(fire).not.toHaveBeenCalled();
  });

  it("mounts no live region of its own, in any phase", async () => {
    const live = () => document.querySelector("[role=status],[role=alert],[aria-live]");
    const r = await sendIntoUndo();
    expect(live()).toBeNull();
    r.rerender(<Host view={ALL_SENT} seq={1} />);
    await flush(10_250);
    expect(live()).toBeNull();
  });
});

describe("the per-device stash — an open undo survives '← Floor' and a reload", () => {
  it("re-arms on a remount inside the deadline, without moving focus", async () => {
    const r = await sendIntoUndo();
    r.unmount();
    await flush(3000);
    render(<Host view={ALL_SENT} seq={0} />);
    await flush();
    expect(control().textContent).toBe("Undo· 7s");
    expect(document.activeElement).not.toBe(control());
  });

  it("does NOT re-arm after the deadline", async () => {
    const r = await sendIntoUndo();
    r.unmount();
    await flush(11_000);
    render(<Host view={ALL_SENT} seq={0} />);
    await flush();
    expect(control()).toBeNull();
    expect(document.querySelector(".staff-send-status")).not.toBeNull();
    expect(sessionStorage.getItem(undoStashKey(SESSION))).toBeNull();
  });

  it("a throwing storage still renders, and still sends", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await sendIntoUndo();
    expect(control().textContent).toBe("Undo· 10s");
  });
});

/** The text a screen reader names a control with: every text node outside an aria-hidden subtree. */
function accessibleText(el: Element): string {
  let out = "";
  const walk = (n: Node) => {
    if (n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true") return;
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent;
    n.childNodes.forEach(walk);
  };
  walk(el);
  return out;
}
