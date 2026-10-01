import { describe, expect, it } from "vitest";
import {
  READER_BLIND_AFTER_MISSES,
  READER_COLLECT_KEY,
  READER_COLLECT_MAX_IDLE_MS,
  READER_LANDED_CAP,
  READER_LANDED_KEY,
  READER_POLL_SILENT_MS,
  READER_POLL_START,
  READER_RECORDING_ESCALATE_MS,
  READER_UNRECORDED_MS,
  adoptLegacyCollect,
  dropLanded,
  handoffCode,
  landedExpired,
  landedHandoff,
  legacyCollectKey,
  nextReaderPoll,
  parseLandedQueue,
  parseLegacyCollect,
  parseReaderCollect,
  queueLanded,
  readLandedStash,
  readReaderStash,
  readerAlertKey,
  readerBusyKey,
  readerChip,
  readerChipAlert,
  readerChipDismissible,
  readerCancelMsg,
  readerChipLinked,
  readerChipShownAt,
  readerChipStatus,
  readerCollectExpired,
  readerLive,
  readerPanelAction,
  readerPolling,
  readerRecordingLong,
  readerSpoken,
  readerStartRefused,
  readerStatus,
  restoredReaderPoll,
  silentMisses,
  takeLegacyCollect,
  writeLandedStash,
  writeReaderStash,
  type ReaderChip,
  type ReaderCollect,
  type ReaderLanded,
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
  recordingSince: null,
  unrecordedAt: null,
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

  it("carries the recording clock across a reload — anything but a clock reads as none", () => {
    // MUTATION (p2g-fix-reader/stash-drops-the-recording-clock): the clock never read back — every
    // reload buys a charge that never records a fresh unrecorded window; red.
    const rec = { ...C, recordingSince: T0 + 5000 };
    expect(parseReaderCollect(JSON.stringify(rec))).toEqual(rec);
    expect(parseReaderCollect(JSON.stringify({ ...C, recordingSince: "soon" }))).toEqual(C);
    const { recordingSince: _r, ...noClock } = C;
    expect(parseReaderCollect(JSON.stringify(noClock))).toEqual(C);
  });

  it("carries the GIVEN-UP mark across a reload — anything but a clock is a live collect (Codex r1 on #309)", () => {
    // MUTATION (p2g-cx1/stash-drops-the-unrecorded-mark): the mark never read back — a reload turns
    // the "don't take payment again" warning into a live collect that polls again; red.
    const warned = { ...C, recordingSince: T0, unrecordedAt: T0 + SETTLE_TTL_MS };
    expect(parseReaderCollect(JSON.stringify(warned))).toEqual(warned);
    expect(parseReaderCollect(JSON.stringify({ ...C, unrecordedAt: "now" }))).toEqual(C);
    const { unrecordedAt: _u, ...noMark } = C;
    expect(parseReaderCollect(JSON.stringify(noMark))).toEqual(C);
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

  it("never retires a given-up charge — the warning leaves only when a person closes it (Codex r1)", () => {
    const warned = { ...C, recordingSince: T0, unrecordedAt: T0 + SETTLE_TTL_MS };
    // MUTATION (p2g-cx1/unrecorded-expires): the warning expires with the freeze it outlived — a tab
    // reloaded later restores nothing, and the cart is open to a second charge; red.
    expect(readerCollectExpired(warned, T0 + 100 * SETTLE_TTL_MS)).toBe(false);
    // …and a live collect still expires exactly as before.
    expect(readerCollectExpired(C, T0 + SETTLE_TTL_MS + 1)).toBe(true);
  });

  it("restores a given-up charge AS the warning: terminal, so no poll restarts behind it", () => {
    const warned = { recordingSince: T0, unrecordedAt: T0 + SETTLE_TTL_MS };
    expect(restoredReaderPoll(warned)).toEqual({
      ...READER_POLL_START,
      phase: "unrecorded",
      recordingSince: T0,
    });
    expect(readerPolling(restoredReaderPoll(warned).phase)).toBe(false);
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
        recordingSince: null,
        unrecordedAt: null,
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

  it("captured with no order for the freeze's whole lifetime: UNRECORDED — terminal, the refusal lifts (C1)", () => {
    const answer = { ok: true, state: "succeeded", orderId: null, totalCents: 4210 } as const;
    const rec = nextReaderPoll(P, answer, T0).poll;
    expect(READER_UNRECORDED_MS).toBe(SETTLE_TTL_MS);
    expect(nextReaderPoll(rec, answer, T0 + READER_UNRECORDED_MS - 1).poll.phase).toBe("recording");
    // MUTATION (p2g-fix-reader/recording-never-given-up): no bound — a PaymentIntent the webhook
    // refused to fulfil answers "succeeded, no order" forever, and the tab polls, holds the reader for
    // every other table and promises an order that never comes; red.
    const gone = nextReaderPoll(rec, answer, T0 + READER_UNRECORDED_MS);
    expect(gone.poll).toMatchObject({ phase: "unrecorded", recordingSince: T0 });
    expect(gone.landed).toBeNull();
    // MUTATION (p2g-fix-reader/unrecorded-keeps-polling): still polling — the poll, the reader hold
    // and the freeze extension never end; red.
    expect(readerPolling("unrecorded")).toBe(false);
    expect(readerLive("unrecorded")).toBe(false);
    // The reader is free of the POLL — the hold is now the warning's, until it is closed (Codex r2;
    // see readerStartRefused).
    // Terminal: an order landing after the tab gave up is the server card's to show, never this poll's.
    expect(
      nextReaderPoll(gone.poll, { ...answer, orderId: "o-1" }, T0 + READER_UNRECORDED_MS + 1),
    ).toEqual({ poll: gone.poll, landed: null });
  });

  it("the bound runs from the FIRST capture, wherever that clock came from (a restored record's)", () => {
    const answer = { ok: true, state: "succeeded", orderId: null, totalCents: 4210 } as const;
    const resumed = restoredReaderPoll({ recordingSince: T0, unrecordedAt: null });
    // MUTATION (p2g-fix-reader/restore-forgets-the-capture): a restored record starts over at
    // "On the reader" with no clock — a reload buys another full window, and says the card is still
    // being taken after it was charged; red.
    expect(resumed).toEqual({ ...P, phase: "recording", recordingSince: T0 });
    expect(nextReaderPoll(resumed, answer, T0 + READER_UNRECORDED_MS).poll.phase).toBe(
      "unrecorded",
    );
    expect(restoredReaderPoll({ recordingSince: null, unrecordedAt: null })).toBe(
      READER_POLL_START,
    );
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

  it("unrecorded: the charge happened and nothing recorded it — a WARN that forbids a second payment", () => {
    expect(readerStatus({ ...P, phase: "unrecorded", recordingSince: T0 }, true)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.status.unrecorded" },
    });
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
    expect(readerSpoken(st, { kind: "local" })).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.cancelUnknown" },
    });
  });

  it("every cancel outcome has its own honest words (Phase 2h · 9d · 9e)", () => {
    // MUTATION (p2h-core/reader-cancel-threw-says-failed): a THROWN cancel says "couldn't cancel —
    // try again" — but the response can be lost after the server cancelled, so the honest line is
    // "couldn't confirm … check it before you take another payment"; red.
    expect(readerCancelMsg({ kind: "local" })).toEqual({ k: "settle.reader.cancelUnknown" });
    // MUTATION (p2h-core/reader-cancel-waiting-unsaid): a cancel still out at the bound says
    // nothing distinct — the cashier takes another payment while the reader may still take the
    // card; red.
    expect(readerCancelMsg({ kind: "waiting" })).toEqual({ k: "settle.reader.cancelWaiting" });
    // MUTATION (p2h-core/reader-cancel-stalled-unsaid): a cancel refused at the tap (never sent) is
    // said as the stalled refusal — the one sentence with a Reload beside it; red.
    expect(readerCancelMsg({ kind: "stalled" })).toEqual({ k: "out.stalled" });
    expect(readerCancelMsg({ kind: "server", text: "Too late." })).toBe("Too late.");
    // The region and the panel read ONE binding.
    const st = readerStatus(P, false);
    for (const e of [
      { kind: "local" },
      { kind: "waiting" },
      { kind: "stalled" },
      { kind: "server", text: "x" },
    ] as const) {
      expect(readerSpoken(st, e)).toEqual({ tone: "warn", msg: readerCancelMsg(e) });
    }
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
    expect(readerStartRefused({ collect: C, phase: "collecting", sessionId: "s-9" })).toBe(true);
    expect(readerStartRefused({ collect: C, phase: "recording", sessionId: "s-9" })).toBe(true);
  });

  it("never on its OWN table, never with no live collect, never with none at all", () => {
    // MUTATION (p2g-reader/start-refused-on-its-own-table): refused whenever any collect is live —
    // the table already collecting is told the reader is busy "for" itself; red.
    expect(readerStartRefused({ collect: C, phase: "collecting", sessionId: "s-7" })).toBe(false);
    // MUTATION (p2g-reader/start-refused-after-the-collect-ended): ignore `live` — a declined card
    // on Table 7 holds the reader for every other table until someone dismisses it; red.
    expect(readerStartRefused({ collect: C, phase: "failed", sessionId: "s-9" })).toBe(false);
    expect(readerStartRefused({ collect: C, phase: "canceled", sessionId: "s-9" })).toBe(false);
    expect(readerStartRefused({ collect: null, phase: "collecting", sessionId: "s-9" })).toBe(
      false,
    );
  });

  it("a charge given up as unrecorded holds EVERY start — its own table's too — until it is closed (Codex r2 on #309)", () => {
    // MUTATION (p2g-cx2/unrecorded-start-replaces-the-warning): admitted like a declined card — a
    // start for another table replaces the tab's one record, and with it the only "don't take payment
    // again"; the original cart can then be charged twice; red.
    expect(readerStartRefused({ collect: C, phase: "unrecorded", sessionId: "s-9" })).toBe(true);
    expect(readerStartRefused({ collect: C, phase: "unrecorded", sessionId: "s-7" })).toBe(true);
    // Closed (no record): free again.
    expect(readerStartRefused({ collect: null, phase: "unrecorded", sessionId: "s-9" })).toBe(
      false,
    );
  });

  it("live = collecting or charged-not-recorded", () => {
    expect(readerLive("collecting")).toBe(true);
    expect(readerLive("recording")).toBe(true);
    expect(readerLive("failed")).toBe(false);
    expect(readerLive("canceled")).toBe(false);
    expect(readerLive("unrecorded")).toBe(false);
  });

  it("says WHICH wait holds the reader — 'taking a payment' only while it really is (PT-2)", () => {
    expect(readerBusyKey("collecting")).toBe("settle.reader.busyElsewhere");
    // MUTATION (p2g-fix-reader/busy-recording-says-taking-a-payment): the recording wait reads
    // "taking a payment … finish that one first" — false (the reader is idle) and impossible; red.
    expect(readerBusyKey("recording")).toBe("settle.reader.busyRecording");
    expect(readerBusyKey("failed")).toBeNull();
    expect(readerBusyKey("canceled")).toBeNull();
    // MUTATION (p2g-cx2/unrecorded-hold-unsaid): held with no reason — a dead button; red.
    expect(readerBusyKey("unrecorded")).toBe("settle.reader.busyUnrecorded");
  });
});

describe("readerPanelAction — the panel's button says what it does (PT-10)", () => {
  it("Cancel while collecting; nothing while recording, then 'Hide this'; Back after a decline or cancel; Close once given up", () => {
    expect(readerPanelAction("collecting", false)).toBe("cancel");
    expect(readerPanelAction("recording", false)).toBeNull();
    // MUTATION (p2g-fix-reader/recording-offers-back-to-payment): "Back to payment" under "don't
    // charge again" — there is no payment to go back to, and the tap only hides the panel; red.
    expect(readerPanelAction("recording", true)).toBe("hide");
    expect(readerPanelAction("failed", false)).toBe("back");
    expect(readerPanelAction("canceled", false)).toBe("back");
    // MUTATION (p2g-fix-reader/unrecorded-offers-back-to-payment): "Back to payment" beside
    // "Don't take payment again"; red.
    expect(readerPanelAction("unrecorded", true)).toBe("close");
  });
});

const LANDED_COUNTER: ReaderLanded = {
  sessionId: "s-3",
  name: { counter: true, display: "reg-3" },
  orderId: "o-00c0de03",
  totalCents: 1800,
  handoff: {
    orderId: "o-00c0de03",
    totalCents: 1800,
    tipCents: null,
    tenderedCents: null,
    isCounter: true,
    cartId: "c-3",
    sentEarly: false,
  },
  landedAt: T0,
};
const LANDED_TABLE: ReaderLanded = {
  sessionId: "s-4",
  name: { counter: false, display: "4" },
  orderId: "o-4",
  totalCents: 4210,
  handoff: null,
  landedAt: T0 + 1000,
};

describe("the landed queue — every off-screen landing held, oldest first (M1 · PT-9)", () => {
  it("a second landing never overwrites the first; one entry per table; the cap lets the OLDEST go", () => {
    // MUTATION (p2g-fix-reader/landed-one-slot): one slot — counter order A's #CODE leaves the bar the
    // moment B lands, with no trace; red.
    const two = queueLanded(queueLanded([], LANDED_COUNTER), LANDED_TABLE);
    expect(two.map((x) => x.sessionId)).toEqual(["s-3", "s-4"]);
    // MUTATION (p2g-fix-reader/landed-duplicates-a-table): a table's newer landing beside its older
    // one — two chips' worth of "Paid" for one table; red.
    const again = queueLanded(two, { ...LANDED_COUNTER, landedAt: T0 + 5000 });
    expect(again.map((x) => x.sessionId)).toEqual(["s-4", "s-3"]);
    expect(again[1]!.landedAt).toBe(T0 + 5000);
    let q: ReaderLanded[] = [];
    for (let i = 0; i < READER_LANDED_CAP + 2; i++)
      q = queueLanded(q, { ...LANDED_TABLE, sessionId: `s-${i}` });
    // MUTATION (p2g-fix-reader/landed-unbounded): no cap — a shift's worth of landings ride every
    // reload; red.
    expect(q.map((x) => x.sessionId)).toEqual(
      Array.from({ length: READER_LANDED_CAP }, (_, i) => `s-${i + 2}`),
    );
    expect(dropLanded(two, "s-3").map((x) => x.sessionId)).toEqual(["s-4"]);
  });

  it("expires like the record: past the freeze's lifetime a landing is history", () => {
    expect(landedExpired(LANDED_COUNTER, T0 + READER_COLLECT_MAX_IDLE_MS)).toBe(false);
    // MUTATION (p2g-fix-reader/landed-never-expires): kept forever — a tab woken hours later
    // re-announces "Paid · #CODE" for a bag long gone; red.
    expect(landedExpired(LANDED_COUNTER, T0 + READER_COLLECT_MAX_IDLE_MS + 1)).toBe(true);
  });

  it("parses field by field: a bad entry goes alone, a card must be THIS order's counter card", () => {
    const raw = JSON.stringify([
      LANDED_COUNTER,
      { ...LANDED_TABLE, totalCents: 1.5 },
      // MUTATION (p2g-fix-reader/landed-parser-takes-a-foreign-card): another order's #CODE rides a
      // tampered entry onto this landing's chip; red.
      { ...LANDED_COUNTER, sessionId: "s-8", orderId: "o-other" },
      {
        ...LANDED_COUNTER,
        sessionId: "s-9",
        handoff: { ...LANDED_COUNTER.handoff, isCounter: false },
      },
      { ...LANDED_TABLE, sessionId: "s-10", handoff: undefined },
      { ...LANDED_TABLE, sessionId: "s-11", name: { counter: "no", display: "x" } },
      LANDED_TABLE,
    ]);
    expect(parseLandedQueue(raw, T0 + 60_000)).toEqual([LANDED_COUNTER, LANDED_TABLE]);
    expect(parseLandedQueue(raw, T0 + READER_COLLECT_MAX_IDLE_MS + 500)).toEqual([LANDED_TABLE]);
    expect(parseLandedQueue("{not json", T0)).toEqual([]);
    expect(parseLandedQueue(JSON.stringify({ a: 1 }), T0)).toEqual([]);
    expect(parseLandedQueue(null, T0)).toEqual([]);
  });

  it("round-trips through its own key, and an empty queue leaves no key behind", () => {
    const store = memStore();
    writeLandedStash([LANDED_COUNTER, LANDED_TABLE], store);
    expect(readLandedStash(T0 + 60_000, store)).toEqual([LANDED_COUNTER, LANDED_TABLE]);
    // Read past the counter card's expiry: dropped from storage as it is read.
    expect(readLandedStash(T0 + READER_COLLECT_MAX_IDLE_MS + 500, store)).toEqual([LANDED_TABLE]);
    expect(JSON.parse(store.m.get(READER_LANDED_KEY)!)).toEqual([LANDED_TABLE]);
    writeLandedStash([], store);
    expect(store.m.has(READER_LANDED_KEY)).toBe(false);
  });
});

describe("readerChip — never over its own table", () => {
  it("the collect, wherever its table is not shown", () => {
    expect(readerChip({ collect: C, landed: [], shown: new Set() })).toEqual({
      kind: "collect",
      sessionId: "s-7",
      name: C.name,
      paymentIntentId: "pi_123",
      totalCents: 4210,
    });
    expect(readerChip({ collect: C, landed: [], shown: new Set(["s-1"]) })?.kind).toBe("collect");
  });

  it("nothing over its own table; a put-away recording is silent", () => {
    // MUTATION (p2g-reader/chip-shown-over-its-own-table): ignore `shown` — the bar repeats the panel
    // beside it, a second voice for the same money; red.
    expect(readerChip({ collect: C, landed: [], shown: new Set(["s-7"]) })).toBeNull();
    expect(
      readerChip({ collect: { ...C, hidden: true }, landed: [], shown: new Set() }),
    ).toBeNull();
  });

  it("a landing off screen — the collect outranks it, the OLDEST shows first, its own table hides it", () => {
    const q = [LANDED_COUNTER, LANDED_TABLE];
    expect(readerChip({ collect: null, landed: q, shown: new Set() })).toEqual({
      kind: "landed",
      sessionId: "s-3",
      name: LANDED_COUNTER.name,
      orderId: "o-00c0de03",
      totalCents: 1800,
      code: "#C0DE03",
    });
    expect(readerChip({ collect: C, landed: q, shown: new Set() })?.kind).toBe("collect");
    expect(readerChip({ collect: C, landed: q, shown: new Set(["s-7"]) })?.sessionId).toBe("s-3");
    // The head's table on screen: the next landing is the chip's.
    expect(readerChip({ collect: null, landed: q, shown: new Set(["s-3"]) })).toMatchObject({
      kind: "landed",
      sessionId: "s-4",
    });
    expect(readerChip({ collect: null, landed: q, shown: new Set(["s-3", "s-4"]) })).toBeNull();
  });

  it("a TABLE's landing reads its amount, never a #CODE (PT-1)", () => {
    // MUTATION (p2g-fix-reader/table-landing-reads-a-code): a #CODE and the counter's call-out over a
    // dine-in table's landing; red.
    expect(readerChip({ collect: null, landed: [LANDED_TABLE], shown: new Set() })).toMatchObject({
      kind: "landed",
      code: null,
      totalCents: 4210,
    });
  });

  it("links everywhere but the lock screen", () => {
    // MUTATION (p2g-reader/chip-links-from-the-lock-screen): always linked — the lock screen offers
    // a way into a table before the PIN; red.
    expect(readerChipLinked("/staff/lock")).toBe(false);
    expect(readerChipLinked("/staff")).toBe(true);
    expect(readerChipLinked("/staff/kitchen")).toBe(true);
    expect(readerChipLinked(null)).toBe(true);
  });

  it("shows nowhere on the sign-in route — the one bar a signed-out person sees (Codex r1 on #309)", () => {
    // MUTATION (p2g-cx1/chip-on-the-sign-in-screen): shown everywhere — a signed-out screen names a
    // table, an amount or a pickup code, and can announce it; red.
    expect(readerChipShownAt("/staff/login")).toBe(false);
    expect(readerChipShownAt("/staff/login/anything")).toBe(false);
    expect(readerChipShownAt("/staff/lock")).toBe(true);
    expect(readerChipShownAt("/staff/loginx")).toBe(true);
    expect(readerChipShownAt("/staff")).toBe(true);
    expect(readerChipShownAt(null)).toBe(true);
  });

  it("every outcome is dismissible from the chip; a collect still polling is not", () => {
    const chip = readerChip({ collect: C, landed: [], shown: new Set() })!;
    const landed = readerChip({ collect: null, landed: [LANDED_TABLE], shown: new Set() })!;
    expect(readerChipDismissible(landed, "collecting")).toBe(true);
    expect(readerChipDismissible(chip, "failed")).toBe(true);
    expect(readerChipDismissible(chip, "canceled")).toBe(true);
    // MUTATION (p2g-fix-reader/unrecorded-stuck-on-the-chip): the given-up charge can never be put
    // away — the P2gb chip that stayed on every page; red.
    expect(readerChipDismissible(chip, "unrecorded")).toBe(true);
    expect(readerChipDismissible(chip, "collecting")).toBe(false);
    expect(readerChipDismissible(chip, "recording")).toBe(false);
  });

  it("the chip's blind line points at the order, never at a Cancel it does not have (PT-8)", () => {
    // MUTATION (p2g-fix-reader/chip-blind-says-cancel): "Hold on, or cancel" beside a View link and
    // no Cancel; red.
    expect(readerChipStatus({ tone: "warn", msg: { k: "settle.reader.status.blind" } })).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.chip.blind" },
    });
    const other = { tone: "warn" as const, msg: "The card was declined." };
    expect(readerChipStatus(other)).toBe(other);
    const waiting = { tone: "ok" as const, msg: { k: "settle.reader.status.waiting" as const } };
    expect(readerChipStatus(waiting)).toBe(waiting);
  });
});

describe("what the chip SAYS — keyed once, named once", () => {
  const chip = readerChip({ collect: C, landed: [], shown: new Set() });
  it("a decline, a slow recording and a charge given up — keyed by the collect", () => {
    expect(readerChipAlert(chip, "failed", false)).toBe("pi_123:failed");
    expect(readerChipAlert(chip, "recording", true)).toBe("pi_123:long");
    // MUTATION (p2g-fix-reader/unrecorded-unsaid): the given-up charge — "don't take payment again" —
    // never said off its table; red.
    expect(readerChipAlert(chip, "unrecorded", true)).toBe("pi_123:unrecorded");
    expect(readerChipAlert(chip, "recording", false)).toBeNull();
    expect(readerChipAlert(chip, "collecting", true)).toBeNull();
    expect(readerChipAlert(chip, "canceled", false)).toBeNull();
    expect(readerChipAlert(null, "failed", false)).toBeNull();
  });

  it("a landing off screen is said too, keyed by its order (A11Y-5)", () => {
    const landed: ReaderChip = readerChip({
      collect: null,
      landed: [LANDED_COUNTER],
      shown: new Set(),
    })!;
    // MUTATION (p2g-fix-reader/landing-unsaid): "Paid · #CODE" appears silently — a screen-reader
    // cashier on another page never hears the code the guest is waiting on; red.
    expect(readerChipAlert(landed, "collecting", false)).toBe("o-00c0de03:landed");
  });

  it("the panel and the chip derive the SAME key (the panel marks it said — A11Y-6)", () => {
    for (const [phase, long] of [
      ["failed", false],
      ["recording", true],
      ["unrecorded", true],
      ["collecting", false],
    ] as const)
      expect(readerAlertKey("pi_123", phase, long)).toBe(readerChipAlert(chip, phase, long));
  });
});
