/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryLine, GroceryLinesResult, ScanAddResult } from "@/lib/grocery";

/**
 * G25 — every ok charge this page makes is RECORDED, so the camera never bills it twice — and a
 * record never outlives the line it stands for, so the camera never refuses an item the basket does
 * not hold.
 *
 * M186's charge rule (`classifyScan`, lib/scan-gate.ts) refuses a camera sighting of a code the basket
 * already pays for, judged from three sources: the lines the server last showed, the offline queue,
 * and the charge record (lib/scan-billed.ts) — the ONLY one that survives a failed post-write read
 * (`scanAdd` answering `lines: null`). A LIVE add always recorded it. The offline queue's REPLAY did
 * not: a replay delivered with `lines: null` left the queue (the drain's `syncPending()`) while the
 * list did not show it yet, so the next camera read of that jar charged a second unit. The record's
 * own rules (a removal that crossed the write, a view that no longer holds the code) are pure and
 * pinned in lib/scan-billed.test.ts.
 *
 * This suite is the page's WIRING, which has nowhere else to live (T18): the real page, with the
 * server actions, the session and the camera stubbed. The server is a small model — its lines,
 * `setQty` writes them, every read returns them — so a row can interleave a removal with a write in
 * flight. The stage stub hands back the page's own `onScan` — what the camera calls on a decoded
 * frame — so each sighting is the camera's, not a tap. `check:scan-repeat` proposition 8 pins the
 * same wiring structurally.
 */
const CART = "c-0000-g25";
const FRESH = "c-0001-g25";
const JAR = "012345678905";

const h = vi.hoisted(() => ({
  onScan: null as ((code: string) => void) | null,
  /** The Browse door's one-tap add — the page's own `addFromBrowse`, handed to the aisles. */
  onBrowseAdd: null as ((item: { barcode: string }) => Promise<void>) | null,
  /** Every `scanAdd(cartId, barcode, scanId)` the page made, in order. */
  calls: [] as { cartId: string; barcode: string; scanId: string }[],
  /** The server's answer to `scanAdd` call i (set per row). */
  scan: null as unknown as (i: number) => Promise<unknown>,
  /** Every `getGroceryLines(cartId)` the page made, in order. */
  reads: [] as string[],
  /** The server's answer to read i (set per row; the default returns `server`). */
  read: null as unknown as (i: number, cartId: string) => Promise<unknown>,
  /** The model server's lines — what `setQty` writes and the default read returns. */
  server: [] as { lineId: string; qty: number }[],
  /** `setQty`'s answer (set per row; the default writes the model server). */
  setQty: null as unknown as (lineId: string, qty: number) => Promise<void>,
  /** The session: `revalidate()` (the fresh-basket recovery) moves it to `nextCart`. */
  cart: "",
  nextCart: "",
}));

vi.mock("@/lib/grocery", () => ({
  scanAdd: (cartId: string, barcode: string, scanId: string) => {
    const i = h.calls.push({ cartId, barcode, scanId }) - 1;
    return h.scan(i);
  },
  getGroceryLines: (cartId: string) => {
    const i = h.reads.push(cartId) - 1;
    return h.read(i, cartId);
  },
  searchGroceryItems: () => Promise.resolve([]),
}));
vi.mock("@/lib/cart", () => ({
  setQty: (lineId: string, qty: number) => h.setQty(lineId, qty),
}));
vi.mock("@/lib/useTableSession", () => {
  const sessions = new Map<string, { cartId: string; sessionId: string }>();
  const revalidate = () => {
    h.cart = h.nextCart;
  };
  return {
    useTableSession: () => {
      let session = sessions.get(h.cart);
      if (!session) sessions.set(h.cart, (session = { cartId: h.cart, sessionId: `s-${h.cart}` }));
      return { session, error: null, revalidate };
    },
  };
});
vi.mock("next/navigation", () => {
  const router = { prefetch: () => {}, push: () => {}, replace: () => {}, back: () => {} };
  return {
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams("tab=scan"),
  };
});
vi.mock("@/components/nav/TransitionNav", () => {
  const journey = { push: () => {} };
  return {
    TransitionLink: (p: { href: string; children?: ReactNode }) => (
      <a href={p.href}>{p.children}</a>
    ),
    useJourneyRouter: () => journey,
  };
});
vi.mock("@/components/ActiveOrderProvider", () => {
  const publish = () => {};
  const register = () => {};
  return { usePublishCart: () => publish, useRegisterDrain: () => register };
});
vi.mock("posthog-js", () => ({ default: { capture: () => {} } }));
// `@mms/ui` stays REAL except for ONE export: `NumberFlow` drives a custom element jsdom does not
// register (`this.el?.willUpdate is not a function` when the running total changes; the Checkout
// suites stub it the same way). The animated digits are not what this suite guards.
vi.mock("@mms/ui", async (orig) => ({
  ...(await orig<typeof import("@mms/ui")>()),
  NumberFlow: ({ value }: { value: number }) => <span>{value}</span>,
}));
vi.mock("@/components/PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("@/components/DoorSheet", () => ({ DoorSheet: () => null }));
// The Browse door's aisles (their own catalog read): drawn as nothing, handing back the page's own
// one-tap add — a Browse add is a deliberate tap, so it asks neither the classifier nor the queue.
vi.mock("@/components/grocery/GroceryBrowse", () => ({
  GroceryBrowse: (p: { onAdd: (item: { barcode: string }) => Promise<void> }) => {
    h.onBrowseAdd = p.onAdd;
    return null;
  },
}));
// The camera: the stage hands back the page's own `onScan`, and draws the result bar it is given.
vi.mock("@/components/grocery/ScanStage", () => ({
  ScanStage: (p: { onScan: (code: string) => void; result?: ReactNode }) => {
    h.onScan = p.onScan;
    return <div id="scan-stage">{p.result}</div>;
  },
}));

const { default: GroceryPage } = await import("./page");
const { enqueueScan, pendingFor } = await import("@/lib/grocery-queue");

/** The jar's line as the server shows it. */
const jarLine = (qty: number): GroceryLine => ({
  lineId: "l-jar",
  barcode: JAR,
  name: "Jasmine rice",
  nameMy: null,
  qty,
  unitPriceCents: 899,
  compareAtCents: null,
  ebt: true,
  imageUrl: null,
});
/** Another item in the basket — the green tea. */
const teaLine = (qty: number): GroceryLine => ({
  ...jarLine(qty),
  lineId: "l-tea",
  barcode: "076808280357",
  name: "Green tea",
  ebt: false,
});
/** The model server's lines, as a read returns them. */
const serverView = (): GroceryLine[] =>
  h.server.map((l) => (l.lineId === "l-tea" ? teaLine(l.qty) : jarLine(l.qty)));
/** The model server's own write: `setQty` sets a line's qty, and 0 removes it. */
const writeServer = (lineId: string, qty: number) => {
  h.server = h.server.flatMap((l) =>
    l.lineId !== lineId ? [l] : qty > 0 ? [{ lineId, qty }] : [],
  );
  return Promise.resolve();
};

const ok = (lines: GroceryLine[] | null = null): ScanAddResult => ({
  ok: true,
  name: "Jasmine rice",
  unitPriceCents: 899,
  ebt: true,
  lines, // null: the post-write read failed — nothing on screen proves the charge
});
const linesOk = (lines: GroceryLine[]): GroceryLinesResult => ({ ok: true, lines });
/** A read that fails in transport — the radio is still flaky after the write. */
const readFails = () => Promise.reject(new Error("radio"));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Let every pending promise (the mount read, a write's continuation) settle. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

/** Wait for an EVENT the page shows — never for a moment: a row that read the page at a fixed tick
 *  could pass or fail by scheduling (LEARNINGS #248). Generous bounds: a loaded CI shard renders this
 *  page slowly, and a pass returns at the first match. */
const shown = (text: RegExp) =>
  waitFor(() => expect(screen.getByText(text)).toBeTruthy(), { timeout: 20_000 });
const until = (check: () => void) => waitFor(check, { timeout: 20_000 });
const ROW_MS = 30_000;

/** A camera sighting of `code`, through the page's own handler. A charge's `scanAdd` is called
 *  synchronously inside it (nothing is awaited before the write), so the count is readable at once. */
async function sight(code: string) {
  expect(h.onScan).not.toBeNull();
  await act(async () => {
    h.onScan!(code);
  });
}

/** The shopper comes back to the tab: the page's re-focus read leaves (a read DURING whatever is in
 *  flight). jsdom reports the document visible, so `visibilitychange` takes the sync path. */
async function refocus() {
  expect(document.visibilityState).toBe("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** A Browse card's one-tap add of `code`, through the page's own handler, until it has landed. */
async function browseAdd(code: string) {
  expect(h.onBrowseAdd).not.toBeNull();
  await act(async () => {
    await h.onBrowseAdd!({ barcode: code });
  });
}

const chargesOf = (code: string, cart = CART) =>
  h.calls.filter((c) => c.barcode === code && c.cartId === cart).length;

beforeEach(() => {
  // jsdom has no `matchMedia`; the page's scroll and motion hooks ask it. No preference, no match.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
  window.sessionStorage.clear();
  h.onScan = null;
  h.onBrowseAdd = null;
  h.calls = [];
  h.reads = [];
  h.server = [];
  h.cart = CART;
  h.nextCart = FRESH;
  h.scan = () => Promise.resolve(ok());
  h.read = () => Promise.resolve(linesOk(serverView()));
  h.setQty = writeServer;
});
afterEach(() => {
  cleanup();
});

describe("the grocery page — an ok charge is recorded, so a re-read never bills it twice (G25 · M186)", () => {
  it(
    "a LIVE add whose post-write read failed: the jar re-read is refused, not charged again — and the basket is re-read",
    async () => {
      h.read = (i) => (i === 0 ? Promise.resolve(linesOk([])) : readFails());
      render(<GroceryPage />);
      await settle();
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
      await shown(/Added Jasmine rice/); // the charge's continuation has run
      // MUTANT grocery-page/a-live-add-unseen-is-never-reread — nothing on screen shows the charge,
      // and nothing asks the server again: the total leaves it out until the shopper leaves the tab.
      expect(h.reads).toHaveLength(2);
      // MUTANT grocery-page/a-live-add-forgets-its-charge — the list shows nothing (both reads
      // failed), nothing waits in the queue, and an unrecorded charge reads as a new item.
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
      // …and the refusal is SAID, in the classifier's own words for a charge the view cannot prove.
      await shown(/Already added — your list is out of date/);
    },
    ROW_MS,
  );

  it(
    "a REPLAYED scan delivered with no view: the jar re-read is refused, not charged again — and the basket is re-read",
    async () => {
      h.read = (i) => (i === 0 ? Promise.resolve(linesOk([])) : readFails());
      // A scan saved in a dead spot, replayed on mount (the drain's kick) with the radio back.
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000a1");
      render(<GroceryPage />);
      // The drain has answered: the summary is spoken in the same continuation that re-reads the
      // queue (`syncPending()`), so the entry has left it and the classifier no longer counts it.
      await shown(/added 1 saved scan/);
      await settle();
      expect(pendingFor(CART)).toEqual([]);
      expect(h.calls).toEqual([
        { cartId: CART, barcode: JAR, scanId: "00000000-0000-4000-8000-0000000000a1" },
      ]);
      // MUTANT grocery-page/a-replay-unseen-is-never-reread.
      expect(h.reads).toHaveLength(2);
      // MUTANT grocery-page/a-replay-forgets-its-charge — G25: the queue no longer holds it, the list
      // does not show it yet, and the replay never said it charged — the camera bills a second unit.
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
      await shown(/Already added — your list is out of date/);
    },
    ROW_MS,
  );

  it(
    "a replay delivered with no view: the re-read brings its line onto the list (the total includes it)",
    async () => {
      // The server holds the replayed line; only the replay's OWN read failed.
      h.read = (i) => Promise.resolve(linesOk(i === 0 ? [] : [jarLine(1)]));
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000a3");
      render(<GroceryPage />);
      await shown(/added 1 saved scan/);
      // MUTANT grocery-page/a-replay-unseen-is-never-reread — the line never appears.
      await until(() =>
        expect(screen.getByRole("button", { name: "Remove Jasmine rice" })).toBeTruthy(),
      );
    },
    ROW_MS,
  );

  it(
    "a REFUSED replay charged nothing — the jar re-read still reaches the server",
    async () => {
      // The other direction: a replay the server refused (an unknown code) billed nothing, so it must
      // NOT be recorded — or the shopper's next read of that code is refused as a repeat of a charge
      // that never happened, and an item that later joins the catalog can never be scanned in.
      h.scan = (i) => Promise.resolve(i === 0 ? { ok: false, reason: "unknown_barcode" } : ok());
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000b2");
      render(<GroceryPage />);
      await shown(/couldn’t be added/);
      await settle();
      expect(pendingFor(CART)).toEqual([]);
      expect(chargesOf(JAR)).toBe(1);
      // MUTANT grocery-page/a-refused-replay-recorded-as-charged — refused as "Already added".
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(2);
    },
    ROW_MS,
  );
});

describe("…and a record never outlives the line it stands for (the reviews of #344)", () => {
  it(
    "BLIND CRITICAL — the shopper removes the item while its replay is in flight: the replay lands last, and the jar scans in again",
    async () => {
      // The basket holds the jar ×1; a second unit was saved offline and replays on mount.
      h.server = [{ lineId: "l-jar", qty: 1 }];
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000c4");
      const replay = deferred<ScanAddResult>();
      h.scan = (i) => (i === 0 ? replay.promise : Promise.resolve(ok()));
      render(<GroceryPage />);
      const remove = await screen.findByRole(
        "button",
        { name: "Remove Jasmine rice" },
        { timeout: 20_000 },
      );
      await until(() => expect(h.calls).toHaveLength(1)); // the replay is in flight
      // The shopper removes the jar; its write and its reconcile read land. The model server holds
      // what the removal left (no line). The server-side ORDER — the replay's +1 applied before the
      // removal took the whole line — is modelled by the answers, not by writing `h.server`: the
      // replay's own answer, below, carries the ×2 view it read before the removal.
      await act(async () => {
        fireEvent.click(remove);
      });
      await until(() =>
        expect(screen.queryByRole("button", { name: /Remove Jasmine rice|One less/ })).toBeNull(),
      );
      // …and only now the replay's answer arrives, its view read BEFORE the removal: ×2.
      await act(async () => {
        replay.resolve(ok([jarLine(2)]));
      });
      await shown(/added 1 saved scan/);
      await settle();
      // MUTANT grocery-page/a-replay-mark-taken-at-landing · grocery-page/a-removal-is-not-a-crossing:
      // the replay's record outlives the removal, and the camera refuses forever ("Already added — your
      // list is out of date") a jar the basket no longer holds.
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(2);
    },
    ROW_MS,
  );

  it(
    'the same race on a LIVE add ("Add another"): the removal crosses it, the add lands last, and the jar scans in again',
    async () => {
      h.server = [{ lineId: "l-jar", qty: 1 }];
      const add = deferred<ScanAddResult>();
      h.scan = (i) => (i === 0 ? add.promise : Promise.resolve(ok()));
      render(<GroceryPage />);
      const remove = await screen.findByRole(
        "button",
        { name: "Remove Jasmine rice" },
        { timeout: 20_000 },
      );
      // The jar in frame is refused as a repeat; the chip offers the deliberate second unit.
      await sight(JAR);
      expect(h.calls).toHaveLength(0);
      const another = await screen.findByRole(
        "button",
        { name: "Add another Jasmine rice" },
        { timeout: 20_000 },
      );
      await act(async () => {
        fireEvent.click(another);
      });
      expect(h.calls).toHaveLength(1); // the add is in flight
      await act(async () => {
        fireEvent.click(remove);
      });
      await until(() =>
        expect(screen.queryByRole("button", { name: /Remove Jasmine rice|One less/ })).toBeNull(),
      );
      await act(async () => {
        add.resolve(ok([jarLine(2)])); // its view, read before the removal
      });
      await shown(/Added Jasmine rice/);
      await settle();
      // MUTANT grocery-page/a-live-add-mark-taken-at-landing — refused forever as "Already added".
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(2);
    },
    ROW_MS,
  );

  it(
    "CODEX P2 — a replay whose view no longer holds the code (an idempotent replay of a removed line) records nothing",
    async () => {
      // The scan's first, lost-response attempt committed; the shopper since removed the line; the
      // replay is an idempotent ok that writes nothing, and its view (after the write) is empty.
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000d5");
      h.scan = (i) => Promise.resolve(i === 0 ? ok([]) : ok());
      render(<GroceryPage />);
      await shown(/added 1 saved scan/);
      await settle();
      expect(chargesOf(JAR)).toBe(1);
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(2);
    },
    ROW_MS,
  );

  it(
    "CODEX P2 — an old basket's replay that lands as the shopper starts a fresh one never marks the fresh basket",
    async () => {
      // The basket was closed while a saved scan's replay was still in flight to it.
      h.read = (_i, cart) =>
        Promise.resolve(cart === CART ? { ok: false, reason: "cancelled" } : linesOk([]));
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000e6");
      const replay = deferred<ScanAddResult>();
      h.scan = (i) => (i === 0 ? replay.promise : Promise.resolve(ok()));
      render(<GroceryPage />);
      const fresh = await screen.findByRole(
        "button",
        { name: "Start a fresh basket" },
        { timeout: 20_000 },
      );
      await until(() => expect(h.calls).toHaveLength(1));
      // The shopper starts a fresh basket, and the old basket's replay lands in the same moment.
      // ⚠️ React flushes a click's passive effects synchronously (React 18+: discrete input), so
      // `cartId`'s effect has already moved `cartIdRef` before this continuation runs: the window
      // Codex named is closed here by React's scheduling, not by the page — which is why the page
      // ends the era itself, synchronously, in the handler (pinned by check:scan-repeat
      // proposition 8; no row can open the window to watch it). This row pins the record's
      // PLACEMENT behind the era check.
      await act(async () => {
        fireEvent.click(fresh);
        replay.resolve(ok());
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      await until(() => expect(h.reads).toContain(FRESH));
      await settle();
      // MUTANT grocery-page/a-replay-recorded-before-the-era-check — the abandoned basket's charge
      // marks the fresh one, and its first scan of the jar is refused as "Already added".
      await sight(JAR);
      expect(chargesOf(JAR, FRESH)).toBe(1);
    },
    ROW_MS,
  );

  it(
    "CODEX P1 — an older replay's empty view lands after a NEWER Browse add of the jar: the newer charge's record stands, and the stale view is not shown",
    async () => {
      // The basket holds a green tea. The jar's first, lost-response scan committed and the shopper
      // removed its line; its replay is an idempotent ok whose view — read while the tea was still
      // there, and without the jar — is delayed.
      h.server = [{ lineId: "l-tea", qty: 1 }];
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000f7");
      const replay = deferred<ScanAddResult>();
      h.scan = (i) => (i === 0 ? replay.promise : Promise.resolve(ok()));
      // The mount read lands; every later read fails (the radio is still flaky).
      h.read = (i) => (i === 0 ? Promise.resolve(linesOk(serverView())) : readFails());
      render(<GroceryPage />);
      const tea = await screen.findByRole(
        "button",
        { name: "Remove Green tea" },
        { timeout: 20_000 },
      );
      await until(() => expect(h.calls).toHaveLength(1)); // the replay is in flight
      // The shopper removes the tea (its write lands, its reconcile read fails: the list keeps the
      // removal)…
      await act(async () => {
        fireEvent.click(tea);
      });
      await until(() =>
        expect(screen.queryByRole("button", { name: "Remove Green tea" })).toBeNull(),
      );
      // …then taps Add on the jar's Browse card: a fresh unit, its own read failed.
      await browseAdd(JAR);
      expect(chargesOf(JAR)).toBe(2);
      await shown(/Couldn’t check your basket\./); // its re-read failed — said
      // …and only now the older replay lands, its view still holding the tea and not the jar.
      await act(async () => {
        replay.resolve(ok([teaLine(1)]));
      });
      await shown(/added 1 saved scan/);
      await settle();
      expect(pendingFor(CART)).toEqual([]);
      // MUTANT grocery-page/a-live-add-raises-no-view-floor (the Browse add is the NEWER charge here)
      // — the older view applies: the removed tea is back on the list, a basket that is not true.
      expect(screen.queryByRole("button", { name: "Remove Green tea" })).toBeNull();
      expect(screen.getByText(/Couldn’t check your basket\./)).toBeTruthy();
      // MUTANT scan-billed/an-older-view-drops-a-newer-charge — the list is empty, the queue is
      // empty and the record was dropped: the jar in frame charges a THIRD unit.
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(2);
    },
    ROW_MS,
  );

  it(
    "a basket read issued BEFORE a live add lands after it: it never replaces what the add's failed re-read said",
    async () => {
      const mount = deferred<GroceryLinesResult>();
      h.read = (i) => (i === 0 ? mount.promise : readFails());
      render(<GroceryPage />);
      await settle();
      await browseAdd(JAR); // lands with no view; its re-read fails
      expect(chargesOf(JAR)).toBe(1);
      await shown(/Couldn’t check your basket\./);
      // The mount read — issued before the add left, read before it committed — lands last.
      await act(async () => {
        mount.resolve(linesOk([]));
      });
      await settle();
      // MUTANT grocery-page/a-live-add-raises-no-view-floor — an empty basket the add just disproved.
      expect(screen.getByText(/Couldn’t check your basket\./)).toBeTruthy();
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
    },
    ROW_MS,
  );

  it(
    "a basket read issued BEFORE a replay lands after it: it never replaces what the replay's failed re-read said",
    async () => {
      // The mount read is slow; the drain's replay (issued after it) lands first, with no view.
      const mount = deferred<GroceryLinesResult>();
      h.read = (i) => (i === 0 ? mount.promise : readFails());
      enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000a8");
      render(<GroceryPage />);
      await shown(/added 1 saved scan/);
      await shown(/Couldn’t check your basket\./); // the replay's re-read failed — said
      // The mount read — issued before the replay left, read before it committed — lands last.
      await act(async () => {
        mount.resolve(linesOk([]));
      });
      await settle();
      // MUTANT grocery-page/a-replay-raises-no-view-floor — an empty basket the replay just disproved.
      expect(screen.getByText(/Couldn’t check your basket\./)).toBeTruthy();
      await sight(JAR);
      expect(chargesOf(JAR)).toBe(1);
    },
    ROW_MS,
  );

  // ── The second blind pass on #344: the floor is the LANDING's, not the dispatch's ──────────────
  for (const path of ["live", "replay"] as const) {
    const dispatch = async (held: Promise<ScanAddResult>) => {
      if (path === "replay") {
        enqueueScan(CART, JAR, "00000000-0000-4000-8000-0000000000b9");
        h.scan = (i) => (i === 0 ? held : Promise.resolve(ok()));
        render(<GroceryPage />);
        await until(() => expect(h.calls).toHaveLength(1)); // the drain's replay is in flight
        return async () => {
          await shown(/added 1 saved scan/);
          await settle();
        };
      }
      h.scan = (i) => (i === 0 ? held : Promise.resolve(ok()));
      render(<GroceryPage />);
      await settle();
      let landed: Promise<void> = Promise.resolve();
      await act(async () => {
        landed = h.onBrowseAdd!({ barcode: JAR }); // in flight — not awaited
      });
      expect(h.calls).toHaveLength(1);
      return async () => {
        await act(async () => {
          await landed;
        });
        await settle();
      };
    };

    it(
      `(${path}) a read issued WHILE the charge is in flight, answered before its commit, arriving after it lands: never applied`,
      async () => {
        const mid = deferred<GroceryLinesResult>();
        // Mount: an empty basket. The re-focus read during the flight is held. Every later read fails.
        h.read = (i) =>
          i === 0 ? Promise.resolve(linesOk([])) : i === 1 ? mid.promise : readFails();
        const charge = deferred<ScanAddResult>();
        const landed = await dispatch(charge.promise);
        await refocus();
        expect(h.reads).toHaveLength(2); // the re-focus read left during the flight
        await act(async () => {
          charge.resolve(ok()); // lands with no view…
        });
        await landed();
        await shown(/Couldn’t check your basket\./); // …and its re-read failed — said
        // The re-focus read answers now: read before the write committed, without the jar.
        await act(async () => {
          mid.resolve(linesOk([]));
        });
        await settle();
        // MUTANT grocery-page/${path === "live" ? "live-add" : "replay"}-floor-at-dispatch — the
        // floor stopped at the charge's dispatch ticket: the crossing read applies, and the honest
        // "Couldn’t check" becomes an empty basket the charge disproved.
        expect(screen.getByText(/Couldn’t check your basket\./)).toBeTruthy();
        await sight(JAR);
        expect(chargesOf(JAR)).toBe(1);
      },
      ROW_MS,
    );

    it(
      `(${path}) a read issued WHILE the charge is in flight applies BEFORE it lands: the landing re-reads, and the jar shows`,
      async () => {
        // Mount: empty. The re-focus read answers at once — read before the write committed. Every
        // read after that one shows the jar.
        h.read = (i) => Promise.resolve(linesOk(i <= 1 ? [] : [jarLine(1)]));
        const charge = deferred<ScanAddResult>();
        const landed = await dispatch(charge.promise);
        await refocus();
        await settle();
        expect(h.reads).toHaveLength(2);
        // The charge lands WITH its own view — but that view's ticket is older than the read that
        // already applied, so it cannot.
        await act(async () => {
          charge.resolve(ok([jarLine(1)]));
        });
        await landed();
        // MUTANT grocery-page/${path === "live" ? "live-add" : "replay"}-crossed-read-no-reread — nothing
        // asks again: the list keeps the crossing read's basket, without the jar the shopper paid for.
        expect(h.reads).toHaveLength(3);
        await until(() =>
          expect(screen.getByRole("button", { name: "Remove Jasmine rice" })).toBeTruthy(),
        );
      },
      ROW_MS,
    );
  }

  it(
    "a REFUSED stepper write whose reconcile the floor rejects (a charge landed during that read): its flip is rolled back",
    async () => {
      h.server = [{ lineId: "l-tea", qty: 1 }];
      const add = deferred<ScanAddResult>();
      h.scan = (i) => (i === 0 ? add.promise : Promise.resolve(ok()));
      const reconcile = deferred<GroceryLinesResult>();
      // Mount: the tea ×1. The stepper's reconcile is held. Every later read fails.
      h.read = (i) =>
        i === 0
          ? Promise.resolve(linesOk(serverView()))
          : i === 1
            ? reconcile.promise
            : readFails();
      h.setQty = () => Promise.reject(new Error("refused")); // the stepper's write is refused
      render(<GroceryPage />);
      const more = await screen.findByRole(
        "button",
        { name: "One more Green tea" },
        { timeout: 20_000 },
      );
      let landed: Promise<void> = Promise.resolve();
      await act(async () => {
        landed = h.onBrowseAdd!({ barcode: JAR }); // a Browse add of the jar, in flight
      });
      // The shopper taps + on the tea: the flip shows ×2, the write is refused, the reconcile leaves.
      await act(async () => {
        fireEvent.click(more);
      });
      await until(() => expect(h.reads).toHaveLength(2));
      // The add lands (no view; its re-read fails) — its floor rises past the reconcile's ticket…
      await act(async () => {
        add.resolve(ok());
        await landed;
      });
      await until(() => expect(h.reads).toHaveLength(3));
      // …and the reconcile answers the truth, ×1, under a floor it cannot pass.
      await act(async () => {
        reconcile.resolve(linesOk([teaLine(1)]));
      });
      await settle();
      // MUTANT grocery-page/a-refused-step-outlives-a-floored-read — the refused ×2 stays on screen.
      expect(screen.getByRole("button", { name: "Remove Green tea" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "One less Green tea" })).toBeNull();
    },
    ROW_MS,
  );
});
