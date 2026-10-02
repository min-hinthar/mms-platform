/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS, hasOwnWait } from "@/lib/bounded-write";

/**
 * Phase 2h — the running-bill opener. It was three English literals ("Open a tab", "Opening…",
 * "…settles once at close, with any tender") on a console that speaks Burmese, a native `disabled`
 * that dropped focus under the tap, and an unbounded await with no catch: a hung action latched
 * "Opening…" for good and a thrown one reached the error boundary. What only a render can show: the
 * words are the dictionary's in the device's tongue, the control frees at the bound and says "no
 * answer yet" with the reload, a late open still lands, and a lost answer says "couldn't confirm".
 */
const openTab = vi.fn();
vi.mock("@/lib/tabs", () => ({ openTab: (...a: unknown[]) => openTab(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { OpenTabButton } = await import("./OpenTabButton");
const { ts } = await import("@/lib/i18n/staff");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  openTab.mockReset();
  refresh.mockReset();
});

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const onChanged = vi.fn();
function mount(lang: "en" | "my" = "en") {
  onChanged.mockReset();
  return render(
    <StaffLangProvider lang={lang}>
      <OpenTabButton cartId="c1" onChanged={onChanged} />
    </StaffLangProvider>,
  );
}
function hungOpen() {
  let answer!: (v: unknown) => void;
  let fail!: (e: Error) => void;
  openTab.mockReturnValueOnce(
    new Promise((res, rej) => {
      answer = res;
      fail = rej;
    }),
  );
  return { answer: (v: unknown) => answer(v), fail: (e: Error) => fail(e) };
}
const MYANMAR = /[က-႟]/;

/** Whether the region's CONTENT was replaced or rewritten (what a screen reader announces) between
 *  this call and the returned check; equal text rendered in place records nothing — the dead tap. */
function watchRegion(node: Element) {
  const recs: MutationRecord[] = [];
  const obs = new MutationObserver((rs) => {
    recs.push(...rs);
  });
  obs.observe(node, { childList: true, subtree: true, characterData: true });
  return () => {
    recs.push(...obs.takeRecords());
    obs.disconnect();
    return recs.some(
      (r) => r.type === "characterData" || (r.type === "childList" && r.addedNodes.length > 0),
    );
  };
}
const reload = () => screen.queryByRole("button", { name: ts("en", "out.reload") });

describe("OpenTabButton — the dictionary's words, in the device's tongue", () => {
  it("on a Burmese tablet the label and the hint lead in Burmese, and no old English literal remains", () => {
    // MUTATION (p2h-doors/open-bill-english-literal): the label is the old "Open a tab" — English on
    // a Burmese console, and the jargon word the staff vocabulary retired; red.
    const { container } = mount("my");
    const btn = screen.getByRole("button");
    expect(btn.querySelector('[lang="my"]')?.textContent).toBe(
      ts("my", "table.detail.openBill.btn"),
    );
    expect(container.textContent).toMatch(MYANMAR);
    expect(container.textContent).not.toContain("Open a tab");
    expect(container.textContent).not.toContain("settles once at close");
    // The hint is the button's description, by a minted id.
    const hint = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
    expect(hint?.querySelector('[lang="my"]')?.textContent).toBe(
      ts("my", "table.detail.openBill.hint"),
    );
  });
});

describe("OpenTabButton — the open is bounded, never natively disabled", () => {
  it("while it opens it is aria-busy + aria-disabled (never native); at the bound 'Opening…' goes, the control stays HELD, and it says 'no answer yet' with the reload", async () => {
    hungOpen();
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.opening"));
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-doors/open-bill-native-disabled): natively disabled while it opens — focus
    // drops to <body> under the tap; red.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn); // refused in the handler
    expect(openTab).toHaveBeenCalledTimes(1);
    await flush(STAFF_HANG_MS - 1);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-doors/open-bill-unbounded): the bound never fires — "Opening…" holds for as
    // long as the queue is stuck; red.
    await flush(1);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.btn"));
    // Codex r1 on #310 (CX2) — this case used to assert the control FREE here (aria-disabled null):
    // that pinned the defect. Its own open is still in the queue, so the control is HELD — the
    // attribute, never native — and described by the line that says why.
    // MUTATION (p2h-cx1/open-bill/held-looks-live): it reads as a live "Open a running bill" over an
    // open that may still land; red.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    // MUTATION (p2h-doors/open-bill-waiting-unsaid): the bound passes in silence; red.
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    expect(btn.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
    expect(reload()).not.toBeNull();
    expect(screen.getByRole("alert").contains(reload())).toBe(false);
  });

  it("a tap on the HELD control re-says 'no answer yet' as a new node — every tap announced, nothing sent; a late refusal frees it with its sentence (Codex r1 on #310, CX2)", async () => {
    const h = hungOpen();
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush(STAFF_HANG_MS);
    for (let tap = 0; tap < 2; tap += 1) {
      const said = watchRegion(screen.getByRole("alert"));
      await act(async () => {
        fireEvent.click(btn);
      });
      // MUTATION (p2h-cx1/open-bill/waiting-frees-guard): the guard let go at the bound — the tap
      // sends a second open behind the stuck one; red.
      expect(openTab).toHaveBeenCalledTimes(1);
      // MUTATION (p2h-cx1/open-bill/held-tap-silent · p2h-cx1/open-bill/resay-unkeyed): the held tap
      // is dead — equal text re-rendered in place is no DOM change, nothing announced; red.
      expect(said()).toBe(true);
      expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
      expect(btn.getAttribute("aria-disabled")).toBe("true");
    }
    // The late REFUSAL ends the wait: said, and the control is free — a tap asks again.
    await act(async () => h.answer({ ok: false, error: "Tabs aren’t available right now." }));
    expect(screen.getByRole("alert").textContent).toBe("Tabs aren’t available right now.");
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(reload()).toBeNull();
    openTab.mockResolvedValueOnce({ ok: true });
    // MUTATION (p2h-cx1/open-bill/late-refusal-stays-held): the guard stays spent after the answer
    // came — a live-looking control that silently refuses; red.
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("a LATE open lands: the detail re-reads, and 'no answer yet' goes", async () => {
    const h = hungOpen();
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open a running bill/ }));
    });
    await flush(STAFF_HANG_MS);
    expect(onChanged).not.toHaveBeenCalled();
    // MUTATION (p2h-doors/open-bill-late-ok-dropped): the late answer is dropped — the bill IS open
    // and the detail never re-reads it; red.
    await act(async () => h.answer({ ok: true }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    // MUTATION (p2h-doors/open-bill-late-open-rearms): a LATE open frees the control — a tap before
    // the re-read swaps it away asks for a second open; red.
    const btn = screen.getByRole("button", { name: /Opening/ });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("a tap landing between a LATE open and React's commit never re-says 'no answer yet' over the opened bill — the hold is read at the tap, never from the render (Codex r1 follow-up, V3)", async () => {
    const h = hungOpen();
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    await act(async () => {
      h.answer({ ok: true });
      // Let the late answer land (its state is queued, NOT yet committed: act holds the render)…
      for (let i = 0; i < 10 && onChanged.mock.calls.length === 0; i += 1) await Promise.resolve();
      expect(onChanged).toHaveBeenCalledTimes(1);
      // …and a tap fires through the COMMITTED render's handler, whose `waiting` still reads true.
      fireEvent.click(btn);
    });
    // MUTATION (p2h-cx1/open-bill/held-tap-reads-render · p2h-cx1/open-bill/held-ref-outlives-answer):
    // the stale render's `waiting` re-sets "no answer yet" over a bill that just opened; red.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(reload()).toBeNull();
    // The opened bill holds "Opening…" until the re-read swaps the button away (D8), and nothing
    // was sent again.
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("an OPENED bill keeps 'Opening…' until the re-read swaps the button away — a second tap opens nothing (S2 critic D8)", async () => {
    openTab.mockResolvedValueOnce({ ok: true });
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-doors/open-bill-opened-rearms): the busy frees on success — the button reads
    // "Open a running bill" again over a bill that is open, and a second tap sends a second open;
    // red.
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.opening"));
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("a LATE throw says 'couldn't confirm' over the waiting line", async () => {
    const h = hungOpen();
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open a running bill/ }));
    });
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    // MUTATION (p2h-doors/open-bill-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.unknown"));
    // CX2 — the lost answer ends the hold: the control is free, and a tap asks again.
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    openTab.mockResolvedValueOnce({ ok: true });
    // MUTATION (p2h-cx1/open-bill/late-throw-stays-held): the guard stays spent after the lost
    // answer — the tap does nothing, and nothing says why; red.
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(2);
  });

  it("a THROWN open says 'couldn't confirm' and frees the control; a refusal says the server's sentence", async () => {
    const h = hungOpen();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.unknown"));
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(reload()).toBeNull();
    openTab.mockResolvedValueOnce({ ok: false, error: "Tabs aren’t available right now." });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("alert").textContent).toBe("Tabs aren’t available right now.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

/**
 * Codex round 2 on #310 (B1) — the hold is the CART's, never the mount's. The bound frees the caller,
 * never the action, so the open stays in Next's per-tab queue after the button that sent it is gone;
 * staff switch to another table and back, the button remounts with both refs fresh, and the next tap
 * dispatched another open behind the unresolved one. The hold now lives in the tab's own-wait
 * register under `open:<cart>` (subscribed), as the other remount-safe guards do.
 */
describe("OpenTabButton — the hold outlives the mount (Codex r2 on #310, B1)", () => {
  function mountCart(cartId: string, changed = vi.fn()) {
    render(
      <StaffLangProvider lang="en">
        <OpenTabButton cartId={cartId} onChanged={changed} />
      </StaffLangProvider>,
    );
    return changed;
  }
  /** Send the open, let the bound pass, and leave for another table. */
  async function openThenLeave() {
    const h = hungOpen();
    const first = mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open a running bill/ }));
    });
    await flush(STAFF_HANG_MS);
    first.unmount();
    return h;
  }

  it("back on the table while its open still waits: the button is HELD, says 'no answer yet' with the reload, and a tap sends nothing", async () => {
    await openThenLeave();
    mountCart("c1");
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    // MUTATION (p2h-cx2b/open-bill/hold-per-mount): the hold is the mount's again — the remounted
    // button reads live, says nothing, and its tap queues a second open behind the first; red.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    expect(btn.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
    expect(reload()).not.toBeNull();
    const said = watchRegion(screen.getByRole("alert"));
    // MUTATION (p2h-cx2b/open-bill/remount-tap-dispatches): the tap reads only the mount's own
    // in-flight ref (fresh: false) — a second open is sent behind the stuck one; red.
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
    expect(said()).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
  });

  it("the LATE open lands on the remounted button: its detail re-reads, and it holds 'Opening…' until the swap", async () => {
    const h = await openThenLeave();
    const changed = mountCart("c1");
    // MUTATION (p2h-cx2b/open-bill/remount-late-unheard): the remounted button never hears the late
    // answer — the hold frees, and the bill that opened reads as a live "Open a running bill"; red.
    await act(async () => h.answer({ ok: true }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    const btn = screen.getByRole("button", { name: /Opening/ });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("a LATE refusal on the remounted button says its sentence and frees it; a LATE throw says 'couldn't confirm'", async () => {
    const h = await openThenLeave();
    mountCart("c1");
    await act(async () => h.answer({ ok: false, error: "Tabs aren’t available right now." }));
    expect(screen.getByRole("alert").textContent).toBe("Tabs aren’t available right now.");
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(reload()).toBeNull();
    cleanup();
    const t = await openThenLeave();
    mountCart("c1");
    await act(async () => t.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.unknown"));
    const again = screen.getByRole("button", { name: /Open a running bill/ });
    expect(again.getAttribute("aria-disabled")).toBeNull();
    openTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(again);
    });
    expect(openTab).toHaveBeenCalledTimes(3);
  });

  it("ANOTHER table's button is not held by this table's wait", async () => {
    await openThenLeave();
    mountCart("c2");
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    // MUTATION (p2h-cx2b/open-bill/hold-unkeyed): one hold for every cart — the wait on table 4
    // freezes the opener on every other table; red.
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    openTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(2);
    expect(openTab).toHaveBeenLastCalledWith({ cartId: "c2" });
  });
});

/**
 * Codex r2 follow-up on #310 (R1 · R2) — the cart's open is held from the moment it is SENT, and every
 * mount hears it. B1 set the hold only at the bound and attached a remounted button only at mount: a
 * button remounted INSIDE the first STAFF_HANG_MS read free (a tap sent a second open behind the
 * first), and when the bound then filled the hold it turned "no answer yet" with nothing attached —
 * the late open re-read nothing, "no answer yet… Reload" stood over a bill that had opened, and a
 * late refusal was never said.
 */
describe("OpenTabButton — held from the moment it is sent, heard by every mount (Codex r2 follow-up, R1 · R2)", () => {
  function mountCart(cartId: string, changed = vi.fn()) {
    const r = render(
      <StaffLangProvider lang="en">
        <OpenTabButton cartId={cartId} onChanged={changed} />
      </StaffLangProvider>,
    );
    return { changed, r };
  }
  /** Send the open, leave for another table at 5 s, come back at 8 s — inside the bound. */
  async function openLeaveReturn() {
    const h = hungOpen();
    const first = mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open a running bill/ }));
    });
    await flush(5_000);
    first.unmount();
    await flush(3_000);
    const { changed, r } = mountCart("c1");
    return { h, changed, r };
  }

  it("remounted INSIDE the bound: 'Opening…' and a tap sends nothing; at the bound 'no answer yet'; a re-said tap; then the LATE open lands on it", async () => {
    const { h, changed } = await openLeaveReturn();
    // MUTATION (p2h-cx2b/open-bill/pre-bound-remount-reads-live): the remounted button reads a live
    // "Open a running bill" while its cart's open is in flight; red.
    const btn = screen.getByRole("button", { name: /Opening/ });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    // MUTATION (p2h-cx2b/open-bill/hold-at-bound-only): the hold is set only at the bound — the
    // remount reads free and its tap sends a second open behind the first; red.
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
    await flush(STAFF_HANG_MS - 8_000);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.waiting"));
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(reload()).not.toBeNull();
    const said = watchRegion(screen.getByRole("alert"));
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(said()).toBe(true);
    expect(openTab).toHaveBeenCalledTimes(1);
    // The LATE open reaches THIS button (the one that sent it is gone): its detail re-reads, the
    // line and the reload go, and it holds "Opening…" until the swap — a tap opens nothing.
    await act(async () => h.answer({ ok: true }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(reload()).toBeNull();
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.opening"));
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
  });

  it("remounted inside the bound, a LATE refusal is said on it and frees it — the next tap asks again", async () => {
    const { h, changed } = await openLeaveReturn();
    await flush(STAFF_HANG_MS - 8_000);
    await act(async () => h.answer({ ok: false, error: "Tabs aren’t available right now." }));
    expect(screen.getByRole("alert").textContent).toBe("Tabs aren’t available right now.");
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(reload()).toBeNull();
    openTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(openTab).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("an ON-TIME answer reaching a button remounted before it lands there too (an open holds 'Opening…'; a lost one says 'couldn't confirm')", async () => {
    const { h, changed } = await openLeaveReturn();
    // MUTATION (p2h-cx2b/open-bill/remount-late-unheard): a remounted button never attaches to its
    // cart's open — the bill that opened reads as a live control and its detail never re-reads; red.
    await act(async () => h.answer({ ok: true }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Opening/ }).getAttribute("aria-busy")).toBe("true");
    cleanup();
    const t = await openLeaveReturn();
    // MUTATION (p2h-cx2b/open-bill/remount-late-throw-unsaid): a lost answer reaching the remounted
    // button frees it in silence — an open that may have landed reads as never tried; red.
    await act(async () => t.h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.detail.openBill.unknown"));
    expect(
      screen.getByRole("button", { name: /Open a running bill/ }).getAttribute("aria-disabled"),
    ).toBeNull();
    expect(t.changed).not.toHaveBeenCalled();
  });

  it("two buttons on ONE cart: the one that did not send is held from the tap and hears the answer too", async () => {
    const h = hungOpen();
    const a = mountCart("c1");
    const b = mountCart("c1");
    const [btnA, btnB] = screen.getAllByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btnA!);
    });
    expect(btnB!.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(btnB!);
    });
    expect(openTab).toHaveBeenCalledTimes(1);
    await flush(STAFF_HANG_MS);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    // MUTATION (p2h-cx2b/open-bill/attach-mount-only): a button attaches only to a hold it finds at
    // mount — the one mounted before the tap never hears the open; red.
    await act(async () => h.answer({ ok: true }));
    expect(a.changed).toHaveBeenCalledTimes(1);
    expect(b.changed).toHaveBeenCalledTimes(1);
    expect(btnB!.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a button whose cart CHANGED under it never takes the old cart's late answer", async () => {
    const { h, changed, r } = await openLeaveReturn();
    await flush(STAFF_HANG_MS - 8_000);
    r.rerender(
      <StaffLangProvider lang="en">
        <OpenTabButton cartId="c2" onChanged={changed} />
      </StaffLangProvider>,
    );
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-cx2b/open-bill/attach-other-cart): the attached answer lands whatever cart the
    // button now shows — table 4's open turns table 9's opener into "Opening…" and re-reads; red.
    await act(async () => h.answer({ ok: true }));
    expect(changed).not.toHaveBeenCalled();
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.textContent).toBe(ts("en", "table.detail.openBill.btn"));
  });

  it("a tap landing between a LATE refusal and React's commit asks again — the hold is read at the tap, never from the render (V3)", async () => {
    const h = hungOpen();
    mount();
    const btn = screen.getByRole("button", { name: /Open a running bill/ });
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush(STAFF_HANG_MS);
    openTab.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      h.answer({ ok: false, error: "Tabs aren’t available right now." });
      // Let the answer release the hold (its state is queued, NOT yet committed: act holds it)…
      for (let i = 0; i < 10 && hasOwnWait("open:c1"); i += 1) await Promise.resolve();
      expect(hasOwnWait("open:c1")).toBe(false);
      // …and a tap fires through the COMMITTED render's handler, whose hold still reads held.
      fireEvent.click(btn);
    });
    // MUTATION (p2h-cx1/open-bill/held-tap-reads-render): the tap reads the render's hold — the
    // answer already freed the control, and the tap is swallowed as a re-said wait; red.
    expect(openTab).toHaveBeenCalledTimes(2);
  });
});
