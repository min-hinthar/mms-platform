import { describe, expect, it } from "vitest";
import {
  acceptView,
  confirmedWrite,
  issueRead,
  readReachedServer,
  readTicketed,
  type ViewSeq,
} from "./view-seq";

/**
 * T21(b) partial — the read-ordering ticket, in the terms the defect is stated in: two views in
 * flight at once, and which one is allowed to reach the screen.
 *
 * The provider fans out several concurrent `getCartView` calls with no cancellation between them, so
 * without this rule the LAST TO RESOLVE won. The freeze re-read makes that expensive rather than
 * untidy: a slow read that observed `locked: true` resolving after a newer read that observed the
 * lock released puts the freeze BACK, and the surface then stays dead for another full TTL.
 *
 * Every case below is written as an interleaving — issue, issue, resolve out of order — because the
 * order of ISSUE and the order of ARRIVAL disagreeing is the entire subject.
 */

const seq = (): ViewSeq => ({ issued: 0, applied: 0 });

describe("issueRead / acceptView — the newest view wins, whatever order they land in", () => {
  it("applies a read that nothing overtook", () => {
    const s = seq();
    const a = issueRead(s);
    expect(acceptView(s, a)).toBe(true);
  });

  it("REFUSES the older of two reads when it lands last", () => {
    const s = seq();
    const older = issueRead(s);
    const newer = issueRead(s);
    // Arrival order reversed on purpose: the newer read answers first.
    expect(acceptView(s, newer)).toBe(true);
    expect(acceptView(s, older)).toBe(false);
  });

  it("keeps applying the newest read while an older one is still outstanding", () => {
    const s = seq();
    issueRead(s); // outstanding, never resolves
    const newer = issueRead(s);
    expect(acceptView(s, newer)).toBe(true);
  });

  // ⚠️ THE ROUND-2 FINDING, AND THE ONE THAT COSTS A DINER SOMETHING. A request in flight must
  // reserve nothing: the first draft refused any ticket that was not the newest ISSUED, so a newer
  // read that FAILED still suppressed an older read that had SUCCEEDED. On this surface that is
  // exactly the T20 bug returning — the scheduled re-read sees the lock expired, a visibility
  // refresh issued moments later 503s and applies nothing, and the good observation is thrown away.
  it("applies an older read that SUCCEEDS when the newer one never lands", () => {
    const s = seq();
    const older = issueRead(s);
    issueRead(s); // issued later, and it will fail — it applies nothing, so it blocks nothing
    expect(acceptView(s, older)).toBe(true);
  });

  it("refuses the older read only once the newer one has actually LANDED", () => {
    const s = seq();
    const older = issueRead(s);
    const newer = issueRead(s);
    expect(acceptView(s, newer)).toBe(true); // this is what supersedes it …
    expect(acceptView(s, older)).toBe(false); // … not the mere fact that it was issued
  });

  it("refuses a duplicate delivery of a view that already landed", () => {
    const s = seq();
    const t = issueRead(s);
    expect(acceptView(s, t)).toBe(true);
    // The watermark has moved to this ticket, so a re-delivery is no longer newer than the screen.
    expect(acceptView(s, t)).toBe(false);
  });

  it("applies a mutation's returned view unconditionally — it is server-commit fresh", () => {
    const s = seq();
    issueRead(s);
    issueRead(s);
    expect(acceptView(s, undefined)).toBe(true);
  });

  it("lets a mutation's view INVALIDATE a read that was issued before it", () => {
    const s = seq();
    const read = issueRead(s);
    // The add commits and renders its own view inside the same statement — strictly fresher than a
    // read that merely started earlier. The read must not be allowed to undo it.
    expect(acceptView(s, undefined)).toBe(true);
    expect(acceptView(s, read)).toBe(false);
  });

  it("gives a read issued AFTER a mutation a ticket that still wins", () => {
    const s = seq();
    acceptView(s, undefined);
    const after = issueRead(s);
    expect(acceptView(s, after)).toBe(true);
  });

  // The bound on the policy above: a mutation outranks reads issued BEFORE it landed, and nothing
  // further. A read issued afterwards is a genuinely later observation and must not be suppressed —
  // otherwise one add would blind this client until the next event.
  it("does not suppress a read issued after the mutation's view landed", () => {
    const s = seq();
    issueRead(s); // in flight when the add resolves — this one loses
    expect(acceptView(s, undefined)).toBe(true);
    const later = issueRead(s);
    expect(acceptView(s, later)).toBe(true);
  });

  it("hands out strictly increasing tickets, and issuing alone moves no watermark", () => {
    const s = seq();
    const tickets = [issueRead(s), issueRead(s), issueRead(s)];
    expect(tickets).toEqual([1, 2, 3]);
    expect(s.issued).toBe(3);
    // The distinction the round-2 fix rests on: three reads outstanding, nothing on screen yet.
    expect(s.applied).toBe(0);
  });
});

describe("ReadOutcome — the two questions a read answers, named apart (T26)", () => {
  it("readReachedServer treats an OVERTAKEN read as a success", () => {
    // T20's re-arm rests on this. An overtaken read still proves the cart is reachable — the freeze
    // axes on screen came from the view that beat it — and narrowing this to `applied` would kill
    // the re-arm chain on a cart that is still frozen, whose unchanged axes do not re-run the
    // effect: the permanent dead menu T20 exists to fix.
    expect(readReachedServer("applied")).toBe(true);
    expect(readReachedServer("overtaken")).toBe(true);
    expect(readReachedServer("failed")).toBe(false);
  });

  it("OVERTAKEN is the state that made the two questions separate", () => {
    // `readIsOurs` was removed in Codex round 5 on #251 — the provider's `readView` returns a union
    // whose rows exist only in the `applied` arm, so "is this snapshot mine?" is now enforced by the
    // type rather than by a predicate. What survives here is the half that is still a RUNTIME
    // decision: T20's re-arm must treat an overtaken read as a success, because the cart was
    // reachable. Narrowing this to `applied` kills the chain on a still-frozen cart whose unchanged
    // axes never re-run the effect — the permanent dead menu T20 exists to fix.
    expect(readReachedServer("overtaken")).toBe(true);
  });
});

/**
 * M225 — `readTicketed`, in the terms /cart's defect is stated in.
 *
 * Every case is two reads in flight resolving in the WRONG order, because issue order and arrival
 * order disagreeing is the whole subject. A deferred promise, never a timer: the point is which
 * resolution wins, not how long it waited.
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("readTicketed — the older answer never overwrites the newer one", () => {
  it("applies a read nothing overtook", async () => {
    const s = seq();
    const applied: string[] = [];
    const outcome = await readTicketed(
      s,
      () => Promise.resolve("only"),
      (v) => applied.push(v),
    );
    expect(outcome).toBe("applied");
    expect(applied).toEqual(["only"]);
  });

  it("REFUSES an older read that resolves LAST, and writes nothing", async () => {
    // The /cart defect verbatim: `refresh` fired twice (a mutation's own await overlapping a
    // coalesced echo), the older one came back second, and its eight setters re-asserted a stale
    // `locked: false` over the corrected `true`. /cart has no scheduled freeze re-check to heal it.
    const s = seq();
    const applied: string[] = [];
    const older = deferred<string>();
    const newer = deferred<string>();

    const first = readTicketed(
      s,
      () => older.promise,
      (v) => applied.push(v),
    );
    const second = readTicketed(
      s,
      () => newer.promise,
      (v) => applied.push(v),
    );

    newer.resolve("newer");
    expect(await second).toBe("applied");
    older.resolve("older");
    expect(await first).toBe("overtaken");

    // The older view never reached the screen — not "reached it and was corrected".
    expect(applied).toEqual(["newer"]);
  });

  it("mints the ticket BEFORE the await, so issue order decides and not arrival order", async () => {
    // Minting after the await would hand the LATER-ARRIVING read the higher ticket, which is
    // arrival order wearing a ticket's clothes — and the older read would win exactly as before.
    const s = seq();
    const older = deferred<string>();
    const first = readTicketed(
      s,
      () => older.promise,
      () => {},
    );
    // The ticket exists already, with nothing resolved and nothing applied.
    expect(s.issued).toBe(1);
    expect(s.applied).toBe(0);
    older.resolve("older");
    await first;
  });

  it("a FAILED read leaves the watermark alone, so it cannot suppress an earlier success", async () => {
    // Codex round 2 on #249 found this in the first draft of this module: a newer read that FAILED
    // invalidated an older read that had SUCCEEDED, and the successful observation was discarded.
    const s = seq();
    const applied: string[] = [];
    const slow = deferred<string>();
    const doomed = deferred<string>();

    const first = readTicketed(
      s,
      () => slow.promise,
      (v) => applied.push(v),
    );
    const second = readTicketed(
      s,
      () => doomed.promise,
      (v) => applied.push(v),
    );

    doomed.reject(new Error("503"));
    expect(await second).toBe("failed");
    slow.resolve("slow-but-good");
    // The failure reserved nothing, so the earlier read still lands.
    expect(await first).toBe("applied");
    expect(applied).toEqual(["slow-but-good"]);
  });

  it("does not apply the view when the read throws", async () => {
    const s = seq();
    const applied: string[] = [];
    const outcome = await readTicketed(
      s,
      () => Promise.reject(new Error("offline")),
      (v: string) => applied.push(v),
    );
    expect(outcome).toBe("failed");
    expect(applied).toEqual([]);
  });

  it("an OVERTAKEN read still reports as having reached the server", async () => {
    // The contract /cart's two recovery controls rest on: "Check again" must not say "couldn't
    // check just now" about a read that did reach the server and merely lost the screen.
    const s = seq();
    const older = deferred<string>();
    const first = readTicketed(
      s,
      () => older.promise,
      () => {},
    );
    await readTicketed(
      s,
      () => Promise.resolve("newer"),
      () => {},
    );
    older.resolve("older");
    expect(readReachedServer(await first)).toBe(true);
  });
});

describe("confirmedWrite — a confirmed server value outranks every read in flight", () => {
  it("refuses a read issued BEFORE the confirmed write", async () => {
    // /cart's counter-ask: `askCounter` awaits `requestCounterPay` and writes the returned
    // `counterRequestedAt` straight to state. A read issued before that tap carries a lower ticket
    // and would otherwise land afterwards with its own pre-ask value — the diner's tap undone by an
    // older answer to a question nobody re-asked.
    const s = seq();
    const applied: string[] = [];
    const inFlight = deferred<string>();
    const read = readTicketed(
      s,
      () => inFlight.promise,
      (v) => applied.push(v),
    );

    confirmedWrite(s); // the counter-ask lands
    inFlight.resolve("pre-ask view");

    expect(await read).toBe("overtaken");
    expect(applied).toEqual([]);
  });

  it("leaves a read issued AFTER the confirmed write free to apply", async () => {
    // The ordering must not become a latch: the re-read that follows the tap carries a higher
    // ticket and is exactly the read that should win.
    const s = seq();
    const applied: string[] = [];
    confirmedWrite(s);
    const outcome = await readTicketed(
      s,
      () => Promise.resolve("post-ask view"),
      (v) => applied.push(v),
    );
    expect(outcome).toBe("applied");
    expect(applied).toEqual(["post-ask view"]);
  });
});
