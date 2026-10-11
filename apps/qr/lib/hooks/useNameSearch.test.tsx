/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNameSearch } from "./useNameSearch";

/**
 * PD4 (the blind pass on #329 @ f0d013f) — the name search through the radio's two edges, driven
 * the way the page drives it: a typed query, the 220 ms debounce, and real `online` / `offline`
 * events. Each MUTATION is a row in scripts/verify-slice.mjs (`name-search-hook/…`), induced and
 * watched go red.
 */
type Row = { barcode: string };
let radio = true;
let calls: string[] = [];
let answer: { resolve: (rows: Row[]) => void; reject: (e: Error) => void } | null = null;
const search = (q: string) =>
  new Promise<Row[]>((resolve, reject) => {
    calls.push(q);
    answer = { resolve, reject };
  });

function setRadio(up: boolean) {
  radio = up;
  window.dispatchEvent(new Event(up ? "online" : "offline"));
}

beforeEach(() => {
  vi.useFakeTimers();
  radio = true;
  calls = [];
  answer = null;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => radio });
});
afterEach(() => {
  vi.useRealTimers();
});

const debounce = () => act(() => vi.advanceTimersByTime(220));
const tick = () => act(() => vi.advanceTimersByTime(0));

describe("useNameSearch — the radio coming back never announces a search that was never sent", () => {
  it("a query typed OFFLINE is held: no request, nothing failed — and the moment the radio is back it reads as Searching… and is sent ONCE", async () => {
    radio = false;
    const { result } = renderHook(() => useNameSearch(search));
    act(() => result.current.changeQuery("durian"));
    debounce();
    expect(calls).toEqual([]); // no request while the radio is down
    expect(result.current.held).toBe(true);
    expect(result.current.searchFailed).toBe(false);
    expect(result.current.searching).toBe(false);

    act(() => setRadio(true));
    // MUTATION: the offline step marks the query FAILED → the reconnect render reads "Search
    // unavailable — please try again." about a search nobody sent, with the "Try again" hero; red.
    expect(result.current.searchFailed).toBe(false);
    // MUTATION: "on its way" reads only the in-flight flag → nothing true to say in that render; red.
    expect(result.current.searching).toBe(true);

    tick();
    debounce();
    // MUTATION: the held query is never re-sent → the shopper waits on a search that never goes; red.
    expect(calls).toEqual(["durian"]);
    expect(result.current.searching).toBe(true);
    expect(result.current.searchFailed).toBe(false);
    await act(async () => answer!.resolve([{ barcode: "A" }]));
    expect(result.current.hits).toEqual([{ barcode: "A" }]);
    expect(result.current.searching).toBe(false);
    expect(result.current.held).toBe(false);
    tick();
    debounce();
    expect(calls).toEqual(["durian"]); // once
  });

  it("a search that was SENT and failed still says so when the radio returns — and is not re-sent behind the shopper's back", async () => {
    const { result } = renderHook(() => useNameSearch(search));
    act(() => result.current.changeQuery("durian"));
    debounce();
    await act(async () => answer!.reject(new Error("network")));
    expect(result.current.searchFailed).toBe(true);
    act(() => setRadio(false));
    act(() => setRadio(true));
    tick();
    debounce();
    expect(calls).toEqual(["durian"]);
    expect(result.current.searchFailed).toBe(true); // true: it failed; "Try again" is honest
  });
});

describe("useNameSearch — the radio dropping leaves the rows on screen", () => {
  it("rows for the query survive an `offline` event — they can still be tapped to queue an add", async () => {
    const { result } = renderHook(() => useNameSearch(search));
    act(() => result.current.changeQuery("durian"));
    debounce();
    await act(async () => answer!.resolve([{ barcode: "A" }, { barcode: "B" }]));
    expect(result.current.hits).toHaveLength(2);

    // MUTATION: the search re-runs on the radio (`online` a dependency) → 220 ms after the drop
    // the rows are emptied, and on Browse the focused row's Add button leaves for <body>; red.
    act(() => setRadio(false));
    debounce();
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.hits).toEqual([{ barcode: "A" }, { barcode: "B" }]);
    expect(result.current.searchFailed).toBe(false);
    expect(calls).toEqual(["durian"]);
  });

  it("a NEW query typed offline still drops the old query's rows (they belong to another query)", async () => {
    const { result } = renderHook(() => useNameSearch(search));
    act(() => result.current.changeQuery("tea"));
    debounce();
    await act(async () => answer!.resolve([{ barcode: "T" }]));
    act(() => setRadio(false));
    act(() => result.current.changeQuery("durian"));
    expect(result.current.hits).toBeNull();
    debounce();
    expect(result.current.hits).toEqual([]);
    expect(result.current.held).toBe(true);
    expect(calls).toEqual(["tea"]);
  });
});
