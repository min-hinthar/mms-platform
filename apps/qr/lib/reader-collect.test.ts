import { describe, expect, it } from "vitest";
import {
  READER_BLIND_AFTER_MISSES,
  READER_COLLECT_KEY,
  READER_COLLECT_MAX_IDLE_MS,
  READER_POLL_SILENT_MS,
  READER_POLL_START,
  READER_RECORDING_ESCALATE_MS,
  adoptLegacyCollect,
  handoffCode,
  landedHandoff,
  legacyCollectKey,
  nextReaderPoll,
  parseLegacyCollect,
  parseReaderCollect,
  readReaderStash,
  readerChip,
  readerChipAlert,
  readerChipLinked,
  readerCollectExpired,
  readerLive,
  readerRecordingLong,
  readerSpoken,
  readerStartRefused,
  readerStatus,
  silentMisses,
  takeLegacyCollect,
  writeReaderStash,
  type ReaderCollect,
  type ReaderPoll,
} from "./reader-collect";
import { SETTLE_TTL_MS } from "./lock-ttl";

/**
 * Phase 2g · reader — the decisions behind the card reader's collect, falsified by VALUE (the
 * provider and the chip are views over them). verify:slice mutates the module under `p2g-reader/`.
 */
const T0 = 1_800_000_000_000;
const C: ReaderCollect = {
  sessionId: "s-7",
  paymentIntentId: "pi_123",
  totalCents: 4210,
  isCounter: true,
  name: { counter: true, display: "reg-7f3a" },
  sentEarly: true,
  cartId: "c-7",
  startedAt: T0,
  liveAt: T0,
  hidden: false,
};

/** A Storage stand-in: the real calls, a Map behind them. */
function memStore(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("parseReaderCollect — field by field, the stash's only door", () => {
  it("round-trips a written record", () => {
    expect(parseReaderCollect(JSON.stringify(C))).toEqual(C);
  });

  it("refuses a handle that is not a PaymentIntent's (`pi_`), and non-integer cents", () => {
    // MUTATION (p2g-reader/stash-accepts-a-non-pi-id): any string handle — a setup intent or a
    // charge id rides into `terminalStatus` from a tampered stash; red.
    expect(parseReaderCollect(JSON.stringify({ ...C, paymentIntentId: "seti_123" }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, paymentIntentId: "pi_" }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, totalCents: 42.1 }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, totalCents: -1 }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, totalCents: "4210" }))).toBeNull();
  });

  it("refuses a record missing the tap's facts (a name, a counter flag, a clock)", () => {
    const { name: _n, ...noName } = C;
    expect(parseReaderCollect(JSON.stringify(noName))).toBeNull();
    expect(
      parseReaderCollect(JSON.stringify({ ...C, name: { counter: "no", display: "x" } })),
    ).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, isCounter: 1 }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, sessionId: "" }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, cartId: "" }))).toBeNull();
    expect(parseReaderCollect(JSON.stringify({ ...C, liveAt: "now" }))).toBeNull();
    expect(parseReaderCollect("{not json")).toBeNull();
    expect(parseReaderCollect(null)).toBeNull();
  });

  it("reads `sentEarly` / `hidden` as true only when they ARE true", () => {
    expect(parseReaderCollect(JSON.stringify({ ...C, sentEarly: "yes", hidden: 1 }))).toEqual({
      ...C,
      sentEarly: false,
      hidden: false,
    });
  });
});

describe("expiry — the freeze's own lifetime past the last LIVE answer", () => {
  it("is SETTLE_TTL_MS, and a record is expired only past it", () => {
    expect(READER_COLLECT_MAX_IDLE_MS).toBe(SETTLE_TTL_MS);
    expect(readerCollectExpired(C, T0 + SETTLE_TTL_MS)).toBe(false);
    expect(readerCollectExpired(C, T0 + SETTLE_TTL_MS + 1)).toBe(true);
  });

  it("is measured from `liveAt`, not the start: a long collect that kept answering is restored", () => {
    const longLive = { ...C, startedAt: T0, liveAt: T0 + 2 * SETTLE_TTL_MS };
    expect(readerCollectExpired(longLive, T0 + 2 * SETTLE_TTL_MS + 60_000)).toBe(false);
  });

  it("readReaderStash drops an expired record from storage as it reads it — and keeps a fresh one", () => {
    const store = memStore({ [READER_COLLECT_KEY]: JSON.stringify(C) });
    expect(readReaderStash(T0 + 60_000, store)).toEqual(C);
    expect(store.m.has(READER_COLLECT_KEY)).toBe(true);
    // MUTATION (p2g-reader/stash-never-expires): no expiry — a dead attempt from hours ago comes
    // back on every staff page of a tab woken later, as "Payment didn't go through"; red.
    expect(readReaderStash(T0 + SETTLE_TTL_MS + 1, store)).toBeNull();
    expect(store.m.has(READER_COLLECT_KEY)).toBe(false);
  });

  it("writes ONE key per tab", () => {
    const store = memStore();
    writeReaderStash(C, store);
    writeReaderStash({ ...C, sessionId: "s-9" }, store);
    expect([...store.m.keys()]).toEqual([READER_COLLECT_KEY]);
  });
});

describe("the legacy per-table key — adopted once, never over a standing collect", () => {
  const at = {
    sessionId: "s-4",
    isCounter: false,
    name: { counter: false, display: "4" },
    sentEarly: false,
    cartId: "c-4",
  };
  it("parses the old {paymentIntentId,totalCents} shape, with the same handle and cents rules", () => {
    expect(
      parseLegacyCollect(JSON.stringify({ paymentIntentId: "pi_9", totalCents: 1200 })),
    ).toEqual({
      paymentIntentId: "pi_9",
      totalCents: 1200,
    });
    expect(
      parseLegacyCollect(JSON.stringify({ paymentIntentId: "ch_9", totalCents: 1200 })),
    ).toBeNull();
    expect(
      parseLegacyCollect(JSON.stringify({ paymentIntentId: "pi_9", totalCents: 12.5 })),
    ).toBeNull();
  });

  it("adopts with the detail's facts and a fresh clock when nothing stands", () => {
    expect(adoptLegacyCollect(null, { paymentIntentId: "pi_9", totalCents: 1200 }, at, T0)).toEqual(
      {
        ...at,
        paymentIntentId: "pi_9",
        totalCents: 1200,
        startedAt: T0,
        liveAt: T0,
        hidden: false,
      },
    );
  });

  it("never over a collect that stands — the standing one keeps its poll", () => {
    // MUTATION (p2g-reader/legacy-adopted-over-a-live-collect): adopt regardless — a live collect on
    // another table loses its poll to a dead per-table entry from before the deploy; red.
    expect(adoptLegacyCollect(C, { paymentIntentId: "pi_9", totalCents: 1200 }, at, T0)).toBeNull();
    expect(adoptLegacyCollect(null, null, at, T0)).toBeNull();
  });

  it("takeLegacyCollect reads the table's key ONCE (removed whatever the adoption decides)", () => {
    const store = memStore({
      [legacyCollectKey("s-4")]: JSON.stringify({ paymentIntentId: "pi_9", totalCents: 1200 }),
      [legacyCollectKey("s-5")]: JSON.stringify({ paymentIntentId: "pi_5", totalCents: 500 }),
    });
    expect(takeLegacyCollect("s-4", store)).toEqual({ paymentIntentId: "pi_9", totalCents: 1200 });
    expect(store.m.has(legacyCollectKey("s-4"))).toBe(false);
    expect(store.m.has(legacyCollectKey("s-5"))).toBe(true);
    expect(takeLegacyCollect("s-4", store)).toBeNull();
  });
});

describe("nextReaderPoll — the poll's reducer", () => {
  const P = READER_POLL_START;
  it("counts misses (transport or refusal), and a live answer resets them", () => {
    const one = nextReaderPoll(P, null, T0).poll;
    const two = nextReaderPoll(one, { ok: false, error: "x" }, T0).poll;
    expect(two.misses).toBe(2);
    expect(nextReaderPoll(two, { ok: true, state: "collecting" }, T0).poll.misses).toBe(0);
  });

  it("succeeded with no order: recording, timed from the FIRST such answer", () => {
    const r1 = nextReaderPoll(
      P,
      { ok: true, state: "succeeded", orderId: null, totalCents: 4210 },
      T0,
    );
    expect(r1.poll.phase).toBe("recording");
    expect(r1.poll.recordingSince).toBe(T0);
    expect(r1.landed).toBeNull();
    const r2 = nextReaderPoll(
      r1.poll,
      { ok: true, state: "succeeded", orderId: null, totalCents: 4210 },
      T0 + 5000,
    );
    expect(r2.poll.recordingSince).toBe(T0);
  });

  it("succeeded with the order: LANDED, with its id and the server's total", () => {
    expect(
      nextReaderPoll(P, { ok: true, state: "succeeded", orderId: "o-1", totalCents: 4210 }, T0)
        .landed,
    ).toEqual({ orderId: "o-1", totalCents: 4210 });
  });

  it("failed carries the server's decline sentence; canceled is canceled", () => {
    expect(
      nextReaderPoll(P, { ok: true, state: "failed", error: "Declined." }, T0).poll,
    ).toMatchObject({
      phase: "failed",
      failCopy: "Declined.",
    });
    expect(nextReaderPoll(P, { ok: true, state: "canceled" }, T0).poll.phase).toBe("canceled");
  });

  it("a terminal phase ignores every later answer (a won cancel is never undone by a stale poll)", () => {
    const canceled: ReaderPoll = { ...P, phase: "canceled" };
    expect(nextReaderPoll(canceled, { ok: true, state: "collecting" }, T0)).toEqual({
      poll: canceled,
      landed: null,
    });
    expect(
      nextReaderPoll(canceled, { ok: true, state: "succeeded", orderId: "o", totalCents: 1 }, T0)
        .landed,
    ).toBeNull();
  });

  it("a poll silent for a span is a miss, one per span", () => {
    expect(silentMisses(T0, T0 + READER_POLL_SILENT_MS - 1)).toBe(0);
    expect(silentMisses(T0, T0 + READER_POLL_SILENT_MS)).toBe(1);
    expect(silentMisses(T0, T0 + 3 * READER_POLL_SILENT_MS)).toBe(3);
  });
});

describe("readerStatus — THE binding the panel, the region and the chip read", () => {
  const P = READER_POLL_START;
  it("collecting: waiting, then blind after the miss threshold — a WARN", () => {
    expect(readerStatus(P, false)).toEqual({
      tone: "ok",
      msg: { k: "settle.reader.status.waiting" },
    });
    // MUTATION (p2c-register/reader-never-goes-blind, re-anchored): never blind — the panel keeps
    // saying "waiting" over a reader nobody is watching, and the cashier takes a second tender; red.
    expect(readerStatus({ ...P, misses: READER_BLIND_AFTER_MISSES }, false)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.status.blind" },
    });
    expect(readerStatus({ ...P, misses: READER_BLIND_AFTER_MISSES - 1 }, false).tone).toBe("ok");
  });

  it("recording, and its honest escalation after the bound", () => {
    const rec: ReaderPoll = { ...P, phase: "recording", recordingSince: T0 };
    expect(readerStatus(rec, false).msg).toEqual({ k: "settle.reader.status.recording" });
    expect(readerStatus(rec, true)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.status.recordingLong" },
    });
    expect(readerRecordingLong(rec, T0 + READER_RECORDING_ESCALATE_MS)).toBe(false);
    expect(readerRecordingLong(rec, T0 + READER_RECORDING_ESCALATE_MS + 1)).toBe(true);
    expect(readerRecordingLong(P, T0 + 10 * READER_RECORDING_ESCALATE_MS)).toBe(false);
  });

  it("failed speaks the server's decline (else the key); canceled says nothing was charged", () => {
    expect(readerStatus({ ...P, phase: "failed", failCopy: "Declined." }, false)).toEqual({
      tone: "warn",
      msg: "Declined.",
    });
    expect(readerStatus({ ...P, phase: "failed" }, false).msg).toEqual({
      k: "settle.reader.status.failed",
    });
    expect(readerStatus({ ...P, phase: "canceled" }, false).msg).toEqual({
      k: "settle.reader.status.canceled",
    });
  });

  it("what is SPOKEN: a cancel refusal outranks the status while it stands", () => {
    const st = readerStatus(P, false);
    expect(readerSpoken(st, null)).toBe(st);
    expect(readerSpoken(st, { kind: "server", text: "Too late." })).toEqual({
      tone: "warn",
      msg: "Too late.",
    });
    expect(readerSpoken(st, { kind: "local" }).msg).toEqual({ k: "settle.reader.cancelFailed" });
  });
});

describe("landedHandoff — the card a landed charge leaves", () => {
  it("a COUNTER order: the canonical card, no tip, no tender, the TAP's sentEarly and cart", () => {
    // MUTATION (p2g-reader/landed-drops-sent-early): read sentEarly as false — the card never says
    // the food already went out unpaid, and the cashier looks for a bag that is on the lane; red.
    expect(landedHandoff(C, "o-00a1b2c3")).toEqual({
      orderId: "o-00a1b2c3",
      totalCents: 4210,
      tipCents: null,
      tenderedCents: null,
      isCounter: true,
      cartId: "c-7",
      sentEarly: true,
    });
    expect(landedHandoff({ ...C, sentEarly: false }, "o-1")?.sentEarly).toBe(false);
  });

  it("a TABLE: no card — the detail's paid state is the quiet signal", () => {
    // MUTATION (p2g-reader/table-landing-makes-a-card): a table's landing makes a card — a #CODE and
    // "Back to the counter" over a dine-in table; red.
    expect(landedHandoff({ ...C, isCounter: false }, "o-1")).toBeNull();
  });

  it("the #CODE is the card's own derivation", () => {
    expect(handoffCode("o-00a1b2c3")).toBe("#A1B2C3");
  });
});

describe("readerStartRefused — the ONE refusal left (one reader)", () => {
  it("refuses a start on ANOTHER table while a collect is live", () => {
    // MUTATION (p2g-reader/start-admitted-on-another-table): never refused — a second freeze, a
    // second PaymentIntent and a reader command thrown at a reader already taking a card; red.
    expect(readerStartRefused({ collect: C, live: true, sessionId: "s-9" })).toBe(true);
  });

  it("never on its OWN table, never with no live collect, never with none at all", () => {
    // MUTATION (p2g-reader/start-refused-on-its-own-table): refused whenever any collect is live —
    // the table already collecting is told the reader is busy "for" itself; red.
    expect(readerStartRefused({ collect: C, live: true, sessionId: "s-7" })).toBe(false);
    // MUTATION (p2g-reader/start-refused-after-the-collect-ended): ignore `live` — a declined card
    // on Table 7 holds the reader for every other table until someone dismisses it; red.
    expect(readerStartRefused({ collect: C, live: false, sessionId: "s-9" })).toBe(false);
    expect(readerStartRefused({ collect: null, live: false, sessionId: "s-9" })).toBe(false);
  });

  it("live = collecting or charged-not-recorded", () => {
    expect(readerLive("collecting")).toBe(true);
    expect(readerLive("recording")).toBe(true);
    expect(readerLive("failed")).toBe(false);
    expect(readerLive("canceled")).toBe(false);
  });
});

describe("readerChip — never over its own table", () => {
  const landed = {
    sessionId: "s-3",
    name: { counter: true, display: "reg-3" },
    handoff: { orderId: "o-3" },
  };
  it("the collect, wherever its table is not shown", () => {
    expect(readerChip({ collect: C, landed: null, shown: new Set() })).toEqual({
      kind: "collect",
      sessionId: "s-7",
      name: C.name,
      paymentIntentId: "pi_123",
      totalCents: 4210,
    });
    expect(readerChip({ collect: C, landed: null, shown: new Set(["s-1"]) })?.kind).toBe("collect");
  });

  it("nothing over its own table; a put-away recording is silent", () => {
    // MUTATION (p2g-reader/chip-shown-over-its-own-table): ignore `shown` — the bar repeats the panel
    // beside it, a second voice for the same money; red.
    expect(readerChip({ collect: C, landed: null, shown: new Set(["s-7"]) })).toBeNull();
    expect(
      readerChip({ collect: { ...C, hidden: true }, landed: null, shown: new Set() }),
    ).toBeNull();
  });

  it("a counter card that landed off screen — the collect outranks it, its own table hides it", () => {
    expect(readerChip({ collect: null, landed, shown: new Set() })).toEqual({
      kind: "landed",
      sessionId: "s-3",
      name: landed.name,
      orderId: "o-3",
    });
    expect(readerChip({ collect: C, landed, shown: new Set() })?.kind).toBe("collect");
    expect(readerChip({ collect: C, landed, shown: new Set(["s-7"]) })?.kind).toBe("landed");
    expect(readerChip({ collect: null, landed, shown: new Set(["s-3"]) })).toBeNull();
  });

  it("links everywhere but the lock screen", () => {
    // MUTATION (p2g-reader/chip-links-from-the-lock-screen): always linked — the lock screen offers
    // a way into a table before the PIN; red.
    expect(readerChipLinked("/staff/lock")).toBe(false);
    expect(readerChipLinked("/staff")).toBe(true);
    expect(readerChipLinked("/staff/kitchen")).toBe(true);
    expect(readerChipLinked(null)).toBe(true);
  });

  it("says a decline and a slow recording — keyed by the collect, nothing else", () => {
    const chip = readerChip({ collect: C, landed: null, shown: new Set() });
    expect(readerChipAlert(chip, "failed", false)).toBe("pi_123:failed");
    expect(readerChipAlert(chip, "recording", true)).toBe("pi_123:long");
    expect(readerChipAlert(chip, "recording", false)).toBeNull();
    expect(readerChipAlert(chip, "collecting", true)).toBeNull();
    expect(readerChipAlert(chip, "canceled", false)).toBeNull();
    expect(readerChipAlert(null, "failed", false)).toBeNull();
  });
});
