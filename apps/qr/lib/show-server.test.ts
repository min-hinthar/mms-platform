import { describe, expect, it } from "vitest";
import type { CartItem } from "@mms/db";
import {
  GRACE_REREAD_MARGIN_MS,
  graceRereadDelayMs,
  passDishes,
  passListedNow,
  showServerStatus,
  waitingDishes,
} from "./show-server";

/**
 * PD1 — the "Show a server" pass: what it lists and when it flips, as VALUES. The flip is the
 * honest one (m1 B3 · B4): past the grace on the VIEW's clock (its DB clock since PD1's tail — the
 * kitchen track's own rule and clock), never on the fire edge; and a removal is never a send.
 */
const base: CartItem = {
  id: "l",
  menuItemId: "m",
  name: "Mohinga",
  qty: 2,
  modifiers: [],
  unitPriceCents: 1400,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};
const NOW = Date.parse("2026-10-08T10:00:00.000Z");
let n = 0;
const line = (over: Partial<CartItem>): CartItem => ({ ...base, id: `l-${n++}`, ...over });

describe("waitingDishes — the ticket lists exactly what the Send fires", () => {
  it("dine-in drafts only — never a to-go draft (fires at pay), a grocery line or a sent line", () => {
    const items = [
      line({ id: "a" }),
      line({ id: "b", fulfillment: "togo" }),
      line({ id: "c", fulfillment: "grocery" }),
      line({ id: "d", lineState: "fired", fireAt: "2026-10-08T10:00:10.000Z" }),
    ];
    // MUTATION (show-server/ticket-lists-a-togo-draft): the fulfillment filter dropped — a to-go
    // dish Dad cannot send from the Send is held up as waiting on him; red.
    expect(waitingDishes(items).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("passDishes — the rows the pass printed stay on it after they go, a removed row leaves", () => {
  it("keeps the listed dine-in rows in the view's order, whatever state they reached", () => {
    const items = [
      line({ id: "a", lineState: "fired", fireAt: "2026-10-08T10:00:10.000Z" }),
      line({ id: "c", lineState: "served", fireAt: "2026-10-08T09:00:00.000Z" }),
    ];
    expect(passDishes(items, new Set(["c", "a"])).map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("a tablemate's dish added while the pass is up joins it; an earlier round's sent dish never does", () => {
    const items = [
      line({ id: "old", lineState: "served", fireAt: "2026-10-08T09:00:00.000Z" }),
      line({ id: "a", lineState: "fired", fireAt: "2026-10-08T09:59:00.000Z" }),
      line({ id: "late" }),
    ];
    // MUTATION (show-server/earlier-round-joins-the-ticket): the listed check dropped — every sent
    // dine-in line is on the ticket, so removing the waiting dishes reads as a send; red.
    expect(passDishes(items, new Set(["a"])).map((i) => i.id)).toEqual(["a", "late"]);
    expect(showServerStatus(passDishes([items[0]!], new Set()), NOW)).toBe("none");
  });
  it("a removed or voided row leaves the ticket; a to-go draft never joins", () => {
    // MUTATION (show-server/voided-row-stays-on-the-ticket): a "Removed" dish is still held up as
    // waiting on Dad; red.
    const items = [
      line({ id: "a", lineState: "voided" }),
      line({ id: "b" }),
      line({ id: "t", fulfillment: "togo" }),
    ];
    expect(passDishes(items, new Set(["a", "b"])).map((i) => i.id)).toEqual(["b"]);
    expect(passDishes([items[0]!], new Set(["a"]))).toEqual([]);
  });
});

describe("passListedNow — a dish that JOINS the open pass stays on it once sent (Codex's post-merge review of #335)", () => {
  it("a tablemate's draft added while the pass is up is kept: once sent it reads 'sending', then 'sent' — the pass never closes on it", () => {
    // The pass opened on "a"; Thiri's "late" lands while it is up.
    const opened = new Set(["a"]);
    const joined = passListedNow([line({ id: "a" }), line({ id: "late" })], opened);
    expect([...joined].sort()).toEqual(["a", "late"]);
    // "a" is removed and "late" is sent, inside its grace.
    const inGrace = line({ id: "late", lineState: "fired", fireAt: "2026-10-08T10:00:05.000Z" });
    // MUTATION (show-server/joined-dish-forgotten): the join is never kept — the sent dish leaves
    // the ticket, the rows are empty, and the pass reads `none` and closes instead of 'Sending…'; red.
    expect(passDishes([inGrace], joined).map((i) => i.id)).toEqual(["late"]);
    expect(showServerStatus(passDishes([inGrace], joined), NOW)).toBe("sending");
    const past = { ...inGrace, fireAt: "2026-10-08T09:59:59.000Z" };
    expect(showServerStatus(passDishes([past], joined), NOW)).toBe("sent");
    // The control: the set the pass opened on alone closes it — the defect this pins.
    expect(showServerStatus(passDishes([inGrace], opened), NOW)).toBe("none");
  });
  it("keeps only dine-in drafts — never a to-go draft, a grocery line, a voided line or an earlier round's sent dish", () => {
    const listed = new Set(["a"]);
    const items = [
      line({ id: "a", lineState: "fired", fireAt: "2026-10-08T10:00:05.000Z" }),
      line({ id: "t", fulfillment: "togo" }),
      line({ id: "g", fulfillment: "grocery" }),
      line({ id: "v", lineState: "voided" }),
      line({ id: "old", lineState: "served", fireAt: "2026-10-08T09:00:00.000Z" }),
    ];
    expect([...passListedNow(items, listed)]).toEqual(["a"]);
  });
  it("nothing new joins: the SAME set comes back, so the host's render-time update settles", () => {
    const listed = new Set(["a", "late"]);
    // MUTATION (show-server/join-never-settles): a fresh set every call — the host's render-time
    // `setPassListed` never reaches a fixed point ("Too many re-renders"); red.
    expect(passListedNow([line({ id: "a" }), line({ id: "late" })], listed)).toBe(listed);
    expect(passListedNow([], listed)).toBe(listed);
    // A join returns a NEW set and leaves the one it was given alone.
    const next = passListedNow([line({ id: "b" })], listed);
    expect(next).not.toBe(listed);
    expect([...listed]).toEqual(["a", "late"]);
    expect([...next]).toEqual(["a", "late", "b"]);
  });
});

describe("showServerStatus — the flip waits for the grace on the view's clock", () => {
  it("a waiting dish: waiting", () => {
    expect(showServerStatus([line({})], NOW)).toBe("waiting");
  });
  it("fired but inside the grace: still 'sending' — the kitchen has not got it and an Undo may bring it back", () => {
    // MUTATION (show-server/flips-on-the-fire-edge): the grace ignored — "Sent to kitchen" inside
    // the ten seconds the host can still undo; red.
    expect(
      showServerStatus([line({ lineState: "fired", fireAt: "2026-10-08T10:00:09.000Z" })], NOW),
    ).toBe("sending");
  });
  it("past the grace: sent — the same instant Mom's KDS draws the ticket", () => {
    expect(
      showServerStatus([line({ lineState: "fired", fireAt: "2026-10-08T09:59:59.000Z" })], NOW),
    ).toBe("sent");
    // a line with no fire_at is treated as fired at or before now (the KDS's reading)
    expect(showServerStatus([line({ lineState: "in_progress", fireAt: null })], NOW)).toBe("sent");
  });
  it("a draft beside a sent line keeps the ticket waiting (a second round)", () => {
    expect(
      showServerStatus(
        [line({ lineState: "served", fireAt: "2026-10-08T09:50:00.000Z" }), line({})],
        NOW,
      ),
    ).toBe("waiting");
  });
  it("every waiting dish removed, nothing sent: none — a removal never reads as a send", () => {
    // MUTATION (show-server/removal-reads-as-a-send): an empty ticket answers sent; red.
    expect(showServerStatus([], NOW)).toBe("none");
    // MUTATION (pdrem/show-server-status-counts-a-togo-draft): the dine-in filter dropped — a to-go
    // draft (on the track, since it cooks, but fired only at pay) holds the ticket at "waiting"; red.
    expect(showServerStatus([line({ fulfillment: "togo" })], NOW)).toBe("none");
    expect(showServerStatus([line({ lineState: "voided" })], NOW)).toBe("none");
  });
});

describe("showServerStatus — PD1's tail: the ONE kitchen track decides, on the view's DB clock", () => {
  it("a dish Mom has STARTED reads sent — the track's Cooking is past Sent, whatever its fire_at says", () => {
    // The pass's own derivation read any sent line with a future `fire_at` as "sending"; the track
    // (lib/kitchen-track `trackStage`) reads Mom's Start as Cooking, past the Sent stamp — and so do
    // the Bill's live pass, the TV board and Dad's pane. One rule, every surface.
    // MUTATION (pdrem/show-server-derives-its-own-stage): the pass's own grace test restored over
    // the track's roll-up; red.
    expect(
      showServerStatus(
        [line({ lineState: "in_progress", fireAt: "2026-10-08T10:00:09.000Z" })],
        NOW,
      ),
    ).toBe("sent");
    // A served dish still inside Mom's undo window is Cooking on the track — past Sent too.
    expect(
      showServerStatus(
        [
          line({
            lineState: "served",
            fireAt: "2026-10-08T09:50:00.000Z",
            bumpedAt: "2026-10-08T09:59:58.000Z",
          }),
        ],
        NOW,
      ),
    ).toBe("sent");
  });
  it("an UNKNOWN clock never reads sent — not null, not NaN, and never this phone's clock", () => {
    // Long past on any device clock: read on the phone's clock it would be "sent".
    const fired = line({ lineState: "fired", fireAt: "2020-01-01T00:00:00.000Z" });
    // MUTATION (pdrem/show-server-status-reads-the-phone-clock): the view's clock swapped for
    // `new Date()` — a phone whose view has no clock yet reads "Sent to kitchen" on its own time; red.
    expect(showServerStatus([fired], null)).toBe("sending");
    // The pass's own comparison read NaN as "past the grace" (`fire > NaN` is false): "sent".
    expect(showServerStatus([fired], Number.NaN)).toBe("sending");
    // A known clock past the stamp: sent.
    expect(showServerStatus([fired], NOW)).toBe("sent");
  });
});

describe("graceRereadDelayMs — ONE re-read at the grace's end, as a server-measured duration", () => {
  it("the soonest in-grace line, plus the margin so the read lands after the instant", () => {
    const items = [
      line({ lineState: "fired", fireAt: "2026-10-08T10:00:10.000Z" }),
      line({ lineState: "fired", fireAt: "2026-10-08T10:00:04.000Z" }),
    ];
    // MUTATION (show-server/reread-lands-on-the-instant): the margin dropped — the read can land
    // a tick before `fire_at` on the server and show "sending" for good; red.
    expect(graceRereadDelayMs(items, NOW)).toBe(4_000 + GRACE_REREAD_MARGIN_MS);
    expect(GRACE_REREAD_MARGIN_MS).toBeGreaterThan(0);
  });
  it("nothing in grace: null (no read is scheduled)", () => {
    expect(graceRereadDelayMs([line({})], NOW)).toBeNull();
    expect(
      graceRereadDelayMs([line({ lineState: "fired", fireAt: "2026-10-08T09:59:00.000Z" })], NOW),
    ).toBeNull();
    expect(
      graceRereadDelayMs(
        [line({ lineState: "fired", fulfillment: "togo", fireAt: "2026-10-08T10:00:10.000Z" })],
        NOW,
      ),
    ).toBeNull();
  });
});
