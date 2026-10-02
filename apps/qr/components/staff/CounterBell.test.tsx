/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2d · bell — the counter's sound chip, wired to the REAL engine (`lib/counter-sound.ts`, a
 * module singleton) over a fake AudioContext. What only a render can show:
 *
 *   - the chip's tap arms INSIDE the gesture (iOS arms audio nowhere else), plays the guest phrase
 *     once (the tap is the volume check) and leaves a plain hint;
 *   - a refused arm is said as an alert and the chip stays "Turn on sound"; a resume that never
 *     settles returns the chip to tappable at ARM_TIMEOUT_MS, never busy forever — and one that
 *     lands after that drops the alert the moment the context runs;
 *   - a context suspended out from under the bell turns the chip PAUSED (warn), and the next click
 *     anywhere else re-arms it silently — no tone, and never the chip's busy state;
 *   - "wanted" and "armed" are two facts, each read through useSyncExternalStore (§15).
 */

type ResumeMode = "run" | "refuse" | "hang" | "late";
let resumeMode: ResumeMode = "run";
/** `late`: the resume stays pending until the test lands it — the browser allowing it after all. */
let landLate: (() => void) | null = null;
const contexts: Array<EventTarget & { state: AudioContextState; resumed: number }> = [];
const freqs: number[] = [];

class FakeCtx extends EventTarget {
  state: AudioContextState = "suspended";
  resumed = 0;
  currentTime = 0;
  destination = {};
  constructor() {
    super();
    contexts.push(this);
  }
  resume(): Promise<void> {
    this.resumed += 1;
    if (resumeMode === "hang") return new Promise(() => {});
    if (resumeMode === "late")
      return new Promise<void>((resolve) => {
        landLate = () => {
          this.state = "running";
          this.dispatchEvent(new Event("statechange"));
          resolve();
        };
      });
    if (resumeMode === "run" && this.state !== "running") {
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
    }
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: "",
      frequency: {
        set value(v: number) {
          freqs.push(v);
        },
      },
      connect: (d: unknown) => d,
      start() {},
      stop() {},
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (d: unknown) => d,
    };
  }
}
Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeCtx });
/** The engine is a module singleton: ONE context for the whole file, created by the first arm. */
const ctxOf = () => contexts[0];

const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CounterBellProvider, CounterSoundChip, useCounterAttention } =
  await import("./CounterBell");
const { setCounterWanted } = await import("@/lib/counter-sound");
const { ARM_TIMEOUT_MS, COUNTER_SOUND_KEY, COUNTER_TONES, SOUND_HINT_MS } =
  await import("@/lib/counter-chime");
const { ERR_DWELL_MS } = await import("@/lib/kds-errors");
const { ts } = await import("@/lib/i18n/staff");
const { autoBlock, reloadHolds } = await import("@/lib/reload-guard");

/** Online, quiet, nothing saving: only the holds can refuse the automatic reload. */
const QUIET = {
  online: true,
  holds: [],
  youngWrite: false,
  stalledWrite: false,
  ownWait: false,
  msSinceWriteSettled: null,
  msSinceInput: Number.MAX_SAFE_INTEGER,
  dialogOpen: false,
  typing: false,
  retired: false,
};

const GUEST = COUNTER_TONES.guest.map((n) => n.freq);
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

/** The engine outlives a test (a singleton, by design): put its context back to suspended. */
function suspend() {
  const c = ctxOf();
  if (c && c.state !== "suspended") {
    c.state = "suspended";
    c.dispatchEvent(new Event("statechange"));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  resumeMode = "run";
  landLate = null;
  suspend();
  setCounterWanted(false);
  localStorage.clear();
  freqs.length = 0;
  haptic.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <CounterBellProvider>
        <div className="staff-greet-row">
          <p className="staff-greeting">Hi</p>
          <CounterSoundChip />
        </div>
        <button type="button">Somewhere else</button>
      </CounterBellProvider>
    </StaffLangProvider>,
  );
}
const chip = () => document.querySelector<HTMLButtonElement>("[data-counter-sound]")!;
const elsewhere = () => screen.getByRole("button", { name: "Somewhere else" });

/** Arm through the chip, as the counter person does at the start of a shift. */
async function armViaChip() {
  fireEvent.click(chip());
  await flush();
  freqs.length = 0;
  haptic.mockClear();
}

describe("the chip's tap arms the bell inside the gesture", () => {
  it("resumes in the handler's own turn, lights the cap, plays the guest phrase ONCE, then a plain hint", async () => {
    mount();
    expect(chip().textContent).toBe(ts("en", "kds.sound.enable"));
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    const before = ctxOf()?.resumed ?? 0;
    fireEvent.click(chip());
    // Synchronously — before any await: the context exists and the resume rode the tap.
    expect(ctxOf()?.resumed).toBe(before + 1);
    await flush();
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    expect(chip().textContent).toBe(ts("en", "board.sound.on"));
    expect(freqs).toEqual(GUEST); // the tap IS the volume check — exactly one phrase
    expect(haptic).toHaveBeenCalledWith("pick");
    expect(localStorage.getItem(COUNTER_SOUND_KEY)).toBe("1");
    const hint = screen.getByText(ts("en", "floor.sound.hint"));
    expect(hint.closest("[role]")).toBeNull(); // nothing went wrong: not an alert, not live
    expect(screen.queryByRole("alert")).toBeNull();
    await tick(SOUND_HINT_MS);
    expect(screen.queryByText(ts("en", "floor.sound.hint"))).toBeNull();
  });

  it("a tap on the lit chip mutes — no tone, the cap goes out, the device forgets it", async () => {
    mount();
    await armViaChip();
    fireEvent.click(chip());
    await flush();
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    expect(chip().textContent).toBe(ts("en", "kds.sound.enable"));
    expect(freqs).toEqual([]);
    expect(haptic).toHaveBeenCalledWith("pick");
    expect(localStorage.getItem(COUNTER_SOUND_KEY)).toBeNull();
  });

  it("a REFUSED arm says so as an alert, keeps 'Turn on sound', and plays nothing", async () => {
    resumeMode = "refuse";
    mount();
    fireEvent.click(chip());
    await flush();
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    expect(chip().textContent).toBe(ts("en", "kds.sound.enable"));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "floor.sound.refused"));
    expect(freqs).toEqual([]);
    expect(localStorage.getItem(COUNTER_SOUND_KEY)).toBeNull();
    // The refusal dwells, then goes — and a retry that works clears it at once.
    await tick(ERR_DWELL_MS);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a resume that never settles holds the chip busy (label kept) and frees it at ARM_TIMEOUT_MS", async () => {
    // MUTATION (by hand, red-first): `armWithin` without its race — the chip stays aria-busy forever.
    resumeMode = "hang";
    mount();
    const before = ctxOf()?.resumed ?? 0;
    fireEvent.click(chip());
    expect(chip().getAttribute("aria-busy")).toBe("true");
    expect(chip().getAttribute("aria-disabled")).toBe("true");
    expect(chip().textContent).toBe(ts("en", "kds.sound.enable")); // §17: the label stays
    // A second tap while it is arming is refused by the in-flight REF — one resume, not two.
    fireEvent.click(chip());
    expect(ctxOf()?.resumed).toBe(before + 1);
    await tick(ARM_TIMEOUT_MS - 1);
    expect(chip().getAttribute("aria-busy")).toBe("true");
    await tick(1);
    expect(chip().getAttribute("aria-busy")).toBeNull();
    expect(chip().getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "floor.sound.refused"));
  });

  it("an arm that answers after the chip LEFT keeps the answer but plays no tone on the next page", async () => {
    // MUTATION (counter-bell/the-check-tone-follows-the-counter-out): the volume check plays on
    // /staff/table/7 — a tap on the chip, then straight into a table inside the arm window.
    resumeMode = "late";
    const view = mount();
    fireEvent.click(chip());
    view.unmount();
    await act(async () => {
      landLate!();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(freqs).toEqual([]);
    expect(haptic).not.toHaveBeenCalled();
    // The tap asked for the bell and it armed: the counter home comes back to "Sound on".
    expect(localStorage.getItem(COUNTER_SOUND_KEY)).toBe("1");
  });
});

describe("PAUSED — wanted, but the context is not running", () => {
  it("a suspension out from under the armed bell turns the chip warn; the next click ELSEWHERE re-arms it silently", async () => {
    mount();
    await armViaChip();
    act(() => suspend());
    expect(chip().textContent).toBe(ts("en", "kds.sound.off"));
    expect(chip().getAttribute("data-muted")).toBe("true");
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    const before = ctxOf()!.resumed;
    fireEvent.click(elsewhere());
    // The background re-arm is lock-free: the chip never goes busy for it.
    expect(chip().getAttribute("aria-busy")).toBeNull();
    expect(ctxOf()!.resumed).toBe(before + 1);
    await flush();
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    expect(chip().getAttribute("data-muted")).toBeNull();
    // MUTATION (counter-bell/the-re-arm-plays-the-tone): a tone nobody asked for, on every tap.
    expect(freqs).toEqual([]);
  });

  it("a key press elsewhere re-arms too, and so does the tab coming back into view", async () => {
    mount();
    await armViaChip();
    act(() => suspend());
    fireEvent.keyDown(elsewhere(), { key: "Tab" });
    await flush();
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    act(() => suspend());
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    expect(freqs).toEqual([]);
  });

  it("a tap ON the paused chip is the chip's own arm — one resume, with the chip's lock", async () => {
    mount();
    await armViaChip();
    act(() => suspend());
    resumeMode = "hang";
    const before = ctxOf()!.resumed;
    fireEvent.click(chip());
    expect(ctxOf()!.resumed).toBe(before + 1); // the page's re-arm left the chip's own tap alone
    expect(chip().getAttribute("aria-busy")).toBe("true");
  });

  it("a resume that lands AFTER the timeout drops the refusal — never 'tap to try again' beside a lit chip", async () => {
    // MUTATION (counter-bell/a-late-arm-keeps-the-refusal): the alert dwelt its 8s beside the lit
    // cap, and the tap it asks for MUTES the bell (`soundTapIntent('on')`).
    mount();
    await armViaChip();
    act(() => suspend());
    resumeMode = "late";
    fireEvent.click(chip());
    await tick(ARM_TIMEOUT_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "floor.sound.refused"));
    await act(async () => {
      landLate!();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    // DROPPED, not hidden: the context pausing again inside the old dwell does not bring it back.
    act(() => suspend());
    expect(chip().textContent).toBe(ts("en", "kds.sound.off"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("on an OFF chip, a late resume drops the refusal too (it is no longer true) and leaves the chip off", async () => {
    resumeMode = "late";
    mount();
    fireEvent.click(chip());
    await tick(ARM_TIMEOUT_MS);
    expect(screen.getByRole("alert")).toBeTruthy();
    await act(async () => {
      landLate!();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    expect(chip().textContent).toBe(ts("en", "kds.sound.enable"));
  });

  it("a device that wanted the bell on an earlier load mounts PAUSED, never 'Sound on'", () => {
    localStorage.setItem(COUNTER_SOUND_KEY, "1");
    mount();
    expect(chip().textContent).toBe(ts("en", "kds.sound.off"));
    expect(chip().getAttribute("aria-pressed")).toBe("false");
  });

  it("the server renders OFF whatever this device stored (the server snapshot is off)", () => {
    localStorage.setItem(COUNTER_SOUND_KEY, "1");
    const html = renderToString(
      <StaffLangProvider lang="en">
        <CounterSoundChip />
      </StaffLangProvider>,
    );
    expect(html).toContain(ts("en", "kds.sound.enable"));
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("data-muted");
  });
});

describe("the chip in Burmese", () => {
  it("renders each posture's word through the dictionary, marked", async () => {
    mount("my");
    const mark = () => chip().querySelector('[lang="my"]')?.textContent;
    expect(mark()).toBe(ts("my", "kds.sound.enable"));
    fireEvent.click(chip());
    await flush();
    expect(mark()).toBe(ts("my", "board.sound.on"));
    expect(document.querySelector('.staff-sound-line [lang="my"]')?.textContent).toBe(
      ts("my", "floor.sound.hint"),
    );
  });
});

describe("the provider rings on the counter home only", () => {
  it("a ring that lands after the provider unmounted plays nothing", async () => {
    // MUTATION (counter-bell/the-bell-rings-after-the-counter-left): the provider's `mounted` guard
    // dropped. A board without its own alive guard, polling across the unmount, rang the armed
    // document-scoped engine on the table page.
    const ear: { hear: ((f: { guest: Set<string>; food: Set<string> }) => unknown) | null } = {
      hear: null,
    };
    function Ear() {
      const hear = useCounterAttention(() => ({
        guest: new Set<string>(),
        food: new Set<string>(),
      }));
      useEffect(() => {
        ear.hear = hear;
      }, [hear]);
      return null;
    }
    const view = render(
      <StaffLangProvider lang="en">
        <CounterBellProvider>
          <CounterSoundChip />
          <Ear />
        </CounterBellProvider>
      </StaffLangProvider>,
    );
    await armViaChip();
    // The ear is live while the provider is: a new key rings.
    act(() => void ear.hear!({ guest: new Set(["here:ear-a"]), food: new Set() }));
    expect(freqs).toEqual(GUEST);
    freqs.length = 0;
    view.unmount();
    await tick(10_000); // well past RING_GAP_MS: only the unmount can refuse the next ring
    act(() => void ear.hear!({ guest: new Set(["here:ear-a", "here:ear-b"]), food: new Set() }));
    expect(freqs).toEqual([]);
  });
});

// ── Phase 2i (P2bi) ──
describe("Phase 2i — a live bell holds the automatic reload for a new build", () => {
  it("held only while the bell is ON — never while off or paused", async () => {
    // MUTATION (p2i-bell/sound-unheld): no hold — the automatic reload silences the counter bell
    // and the next guest's ask rings nothing until someone notices; red.
    const bell = () => reloadHolds().filter((h) => h.reason === "bellSound");
    mount();
    expect(bell()).toHaveLength(0);
    await armViaChip();
    expect(bell()).toMatchObject([{ kind: "sound", subject: "counter" }]);
    expect(autoBlock({ ...QUIET, holds: reloadHolds() })).toEqual({
      kind: "hold",
      reason: "bellSound",
    });
    // Paused (a suspended context): the sound is already off — nothing for a reload to lose.
    act(() => suspend());
    expect(bell()).toHaveLength(0);
  });
});
