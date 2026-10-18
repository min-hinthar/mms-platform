import { describe, expect, it } from "vitest";
import {
  afterFailedRead,
  cartFate,
  CLOSED_ORDER_CLAUSE,
  dineinMintEntry,
  endCardWords,
  endedNewsKey,
  endComplete,
  endedWriteNotice,
  endPollDelayMs,
  END_POLL_MS,
  endTrackHref,
  heldEndUpgrade,
  leaveWarning,
  mintNotice,
  sessionLive,
  settleEdgeNotice,
  staleCaption,
  tableEnded,
  type CartOutcome,
  type TableEnd,
} from "./session-truth";
import { REGISTER_SETTLING_COPY } from "./counter-pay-state";
import { t } from "./i18n";

/**
 * Session truth — every decision the menu, the Bill and the mint make about a table that stopped
 * answering, pinned as values (the `lcs/` mutants in scripts/verify-slice.mjs falsify each one).
 */

const NOW = Date.parse("2026-10-13T18:00:00.000Z");
const LIVE = { status: "active", expiresAt: "2026-10-13T20:00:00.000Z" };
const PAST = "2026-10-13T17:00:00.000Z";

describe("cartFate — what became of a cart (the one classification /menu and /cart share)", () => {
  it("an open cart on a live session is open", () => {
    expect(cartFate({ cartStatus: "open", session: LIVE, cleared: false, nowMs: NOW })).toEqual({
      kind: "open",
    });
  });

  it("an open cart on a session past its clock is EXPIRED — the sweep leaves the cart open", () => {
    // MUTATION (lcs/fate-trusts-an-open-cart): `open` regardless of the session — the menu stays
    // frozen on a dead table and the next tap re-mints.
    for (const status of ["active", "closed"])
      expect(
        cartFate({
          cartStatus: "open",
          session: { status, expiresAt: PAST },
          cleared: false,
          nowMs: NOW,
        }),
      ).toEqual({ kind: "ended", why: "expired" });
  });

  it("a paid cart is PAID, and says whether its table is still seated", () => {
    expect(cartFate({ cartStatus: "paid", session: LIVE, cleared: false, nowMs: NOW })).toEqual({
      kind: "paid",
      sessionLive: true,
    });
    // A paid table staff then cleared for the next party: still paid — the bill is the fact.
    expect(
      cartFate({
        cartStatus: "paid",
        session: { status: "closed", expiresAt: LIVE.expiresAt },
        cleared: true,
        nowMs: NOW,
      }),
    ).toEqual({ kind: "paid", sessionLive: false });
  });

  it("a CLEAR is named from its record, ahead of the clock", () => {
    // MUTATION (lcs/fate-clear-reads-as-a-merge): ignore the record — a staff Clear says the
    // neutral "closed", and the diner is never told the unserved food was cancelled.
    expect(
      cartFate({
        cartStatus: "cancelled",
        session: { status: "closed", expiresAt: PAST },
        cleared: true,
        nowMs: NOW,
      }),
    ).toEqual({ kind: "ended", why: "cleared" });
  });

  it("a MERGE (no record, the clock still running) is the neutral CLOSED", () => {
    expect(
      cartFate({
        cartStatus: "cancelled",
        session: { status: "closed", expiresAt: LIVE.expiresAt },
        cleared: false,
        nowMs: NOW,
      }),
    ).toEqual({ kind: "ended", why: "closed" });
    // A missing session row establishes no clock: closed, never "timed out".
    expect(
      cartFate({ cartStatus: "cancelled", session: null, cleared: false, nowMs: NOW }),
    ).toEqual({ kind: "ended", why: "closed" });
  });

  it("the session gate is is_member's: `status <> 'closed' and expires_at > now()` — the instant itself is dead", () => {
    // MUTATION (lcs/session-live-at-the-instant): `>=` — a session at its own expiry instant reads
    // live here and dead to every read `assertCartMember` makes.
    expect(sessionLive({ status: "active", expiresAt: new Date(NOW).toISOString() }, NOW)).toBe(
      false,
    );
    expect(sessionLive({ status: "active", expiresAt: LIVE.expiresAt }, NOW)).toBe(true);
    expect(sessionLive({ status: "closed", expiresAt: LIVE.expiresAt }, NOW)).toBe(false);
    expect(sessionLive(null, NOW)).toBe(false);
    expect(sessionLive({ status: "active", expiresAt: "not a date" }, NOW)).toBe(false);
  });
});

const PAID: TableEnd = {
  kind: "paid",
  tender: "counter",
  orderId: "o-1",
  sessionLive: true,
  complete: true,
};
const CLEARED: TableEnd = { kind: "ended", why: "cleared" };
const EXPIRED: TableEnd = { kind: "ended", why: "expired" };
const CLOSED: TableEnd = { kind: "ended", why: "closed" };

describe("afterFailedRead — hold, re-mint, or stay", () => {
  it("a dine-in table that ENDED is held — never re-minted on its own", () => {
    // MUTATION (lcs/held-table-re-mints): re-mint a dine-in end — the sticker re-hosts a cleared
    // table and the diner hears a sentence about a fresh order they did not ask for.
    for (const end of [PAID, CLEARED, EXPIRED, CLOSED]) {
      expect(afterFailedRead(end, { isGroup: true, write: true })).toBe("hold");
      expect(afterFailedRead(end, { isGroup: true, write: false })).toBe("hold");
    }
  });

  it("a SOLO order that ended re-mints (with its cause said) — there is no table to hold", () => {
    expect(afterFailedRead(EXPIRED, { isGroup: false, write: false })).toBe("remint");
    expect(afterFailedRead(PAID, { isGroup: false, write: true })).toBe("remint");
  });

  it("an unknowable answer keeps the shipped recovery for a WRITE and the last view for a passive read", () => {
    // MUTATION (lcs/passive-read-re-mints): re-mint on a failed focus read — a blip re-mints the
    // table every time the phone wakes.
    for (const o of [{ kind: "open" }, { kind: "unknown" }] as CartOutcome[]) {
      expect(afterFailedRead(o, { isGroup: true, write: true })).toBe("remint");
      expect(afterFailedRead(o, { isGroup: true, write: false })).toBe("stay");
      expect(afterFailedRead(o, { isGroup: false, write: false })).toBe("stay");
    }
  });

  it("tableEnded is exactly paid + ended", () => {
    expect(tableEnded(PAID)).toBe(true);
    expect(tableEnded(CLOSED)).toBe(true);
    expect(tableEnded({ kind: "open" })).toBe(false);
    expect(tableEnded({ kind: "unknown" })).toBe(false);
  });
});

describe("endPollDelayMs — the close no event carries", () => {
  it("polls a dine-in cart that has not ended, and nothing else", () => {
    // MUTATION (lcs/poll-runs-on-an-ended-table): keep polling after the hold — a server action a
    // minute, for as long as the card is open, about a table that will never reopen.
    expect(endPollDelayMs({ isGroup: true, hasCart: true, ended: false })).toBe(END_POLL_MS);
    expect(endPollDelayMs({ isGroup: true, hasCart: true, ended: true })).toBeNull();
    expect(endPollDelayMs({ isGroup: false, hasCart: true, ended: false })).toBeNull();
    expect(endPollDelayMs({ isGroup: true, hasCart: false, ended: false })).toBeNull();
    expect(END_POLL_MS).toBe(60_000);
  });
});

describe("an INCOMPLETE paid answer is not a final one (Codex round 2 on #361)", () => {
  // The cart's `paid` is established, but a read behind its details failed: `counterPayOutcome`
  // turned a failed order read into `tender: "unknown"` and a failed visibility read into
  // `orderId: null`, and the menu and the Bill cached that as the end — no receipt link, the poll
  // stopped, for as long as the card was open. An unknowable read establishes nothing (M116).
  const PENDING: TableEnd = {
    kind: "paid",
    tender: "unknown",
    orderId: null,
    sessionLive: true,
    complete: false,
  };

  it("an ended table is always complete; a paid one only when its answer is whole", () => {
    // MUTATION (lcs/incomplete-paid-is-final): every paid end reads complete — the poll stops on a
    // failed read and the card never gains its receipt link.
    expect(endComplete(CLEARED)).toBe(true);
    expect(endComplete(CLOSED)).toBe(true);
    expect(endComplete(PAID)).toBe(true);
    expect(endComplete(PENDING)).toBe(false);
  });

  it("a held incomplete end takes the later answer's resolved fields, and never forgets a known one", () => {
    // MUTATION (lcs/held-end-forgets-the-order): the later answer's `orderId` replaces a known one
    // with an unknown null — the receipt link the card already drew disappears.
    expect(heldEndUpgrade(PENDING, PAID)).toEqual(PAID);
    const half = { ...PENDING, orderId: "o-1" };
    const tenderOnly: TableEnd = { ...PENDING, tender: "card" };
    expect(heldEndUpgrade(half, tenderOnly)).toEqual({
      kind: "paid",
      tender: "card",
      orderId: "o-1",
      sessionLive: true,
      complete: false,
    });
    // A failed tender read never un-learns a tender an earlier answer read.
    // MUTATION (lcs/held-end-forgets-the-tender): take the later tender whatever it says.
    expect(heldEndUpgrade({ ...PENDING, tender: "counter" }, PENDING)).toMatchObject({
      tender: "counter",
    });
  });

  it("a complete end is final, and only a paid answer can fill a paid end", () => {
    // MUTATION (lcs/complete-end-reopens): a final end is replaced by a later answer — a table held
    // with its receipt link flips back to an incomplete one on the next blip.
    expect(heldEndUpgrade(PAID, PENDING)).toBeNull();
    expect(heldEndUpgrade(CLEARED, PAID)).toBeNull();
    expect(heldEndUpgrade(PENDING, CLEARED)).toBeNull();
  });
});

describe("dineinMintEntry — the URL credential is single-use (M172)", () => {
  const url = { code: "STICKER5", joinOnly: false, tableNumber: undefined, stored: "OLDKEY" };

  it("the FIRST mint follows the URL: the sticker wins, never marked persisted", () => {
    expect(dineinMintEntry({ ...url, accepted: null })).toEqual({ qrCode: "STICKER5" });
  });

  it("every later mint re-joins by the ACCEPTED code, marked persisted — the sticker cannot re-host a cleared table", () => {
    // MUTATION (lcs/remint-reuses-the-sticker): ignore `accepted` — a recovery re-mint sends the
    // sticker again and the route provisions a NEW session at the table with this diner as host.
    expect(
      dineinMintEntry({
        ...url,
        accepted: { code: "STICKER5", forCode: "STICKER5", forTable: null },
      }),
    ).toEqual({ qrCode: "STICKER5", persisted: true });
    // An invite's re-mint is no longer join-only (no "No table found for that code" after a close),
    // and a claim's number is not re-claimed.
    expect(
      dineinMintEntry({
        code: "INVITE1",
        joinOnly: true,
        tableNumber: 5,
        stored: undefined,
        accepted: { code: "TABLECODE", forCode: "INVITE1", forTable: 5 },
      }),
    ).toEqual({ qrCode: "TABLECODE", persisted: true });
  });

  it("a NEW credential on the same page (a code typed into the join form) is a new entry, and is honoured", () => {
    // MUTATION (lcs/spent-entry-swallows-a-new-code): spend on `accepted` alone — a diner who types
    // another table's code is silently re-joined to the table they were leaving.
    expect(
      dineinMintEntry({
        code: "OTHER222",
        joinOnly: true,
        tableNumber: undefined,
        stored: "STICKER5",
        accepted: { code: "STICKER5", forCode: "STICKER5", forTable: null },
      }),
    ).toEqual({ qrCode: "OTHER222", joinOnly: true });
  });

  it("before a success, the shipped rules hold: a stored key is persisted, a claim carries its number, an invite is join-only", () => {
    expect(
      dineinMintEntry({
        code: undefined,
        joinOnly: false,
        tableNumber: undefined,
        stored: "OLDKEY",
        accepted: null,
      }),
    ).toEqual({ qrCode: "OLDKEY", persisted: true });
    expect(
      dineinMintEntry({
        code: undefined,
        joinOnly: false,
        tableNumber: 5,
        stored: "OLDKEY",
        accepted: null,
      }),
    ).toEqual({ qrCode: "OLDKEY", tableNumber: 5 });
    expect(
      dineinMintEntry({
        code: "INVITE1",
        joinOnly: true,
        tableNumber: undefined,
        stored: undefined,
        accepted: null,
      }),
    ).toEqual({ qrCode: "INVITE1", joinOnly: true });
    expect(
      dineinMintEntry({
        code: undefined,
        joinOnly: false,
        tableNumber: undefined,
        stored: undefined,
        accepted: null,
      }),
    ).toEqual({});
  });
});

describe("the words — never 'idle', always the cause we know", () => {
  const base = {
    firstMint: false,
    recovering: false,
    restarted: false,
    newCart: false,
    unconfirmed: false,
    cause: null,
    created: false,
    resume: false,
    replacedStored: false,
  };

  it("no sentence anywhere says 'idle'", () => {
    const all: (string | null)[] = [];
    for (const recovering of [true, false])
      for (const newCart of [true, false])
        for (const unconfirmed of [true, false])
          for (const cause of [null, PAID, CLEARED, EXPIRED, CLOSED])
            for (const resume of [true, false])
              for (const replacedStored of [true, false])
                all.push(
                  mintNotice({
                    ...base,
                    firstMint: !recovering,
                    recovering,
                    newCart,
                    unconfirmed,
                    cause,
                    created: true,
                    resume,
                    replacedStored,
                  })?.text ?? null,
                );
    expect(all.filter((s) => s && /idle/i.test(s))).toEqual([]);
  });

  it("a re-mint onto a NEW cart names the cause it knows, and says so when it knows none", () => {
    const say = (cause: TableEnd | null) =>
      mintNotice({ ...base, recovering: true, newCart: true, cause })?.text;
    expect(say(null)).toBe("We couldn’t reach your last order — this is a new one.");
    expect(say(PAID)).toBe("That order’s already paid — this is a new one.");
    expect(say(EXPIRED)).toBe("Your last order timed out — this is a new one.");
    expect(say(CLOSED)).toBe("Your last order was closed — this is a new one.");
  });

  it("a re-mint onto the SAME cart never invites the retry of a write it could not confirm", () => {
    expect(mintNotice({ ...base, recovering: true, unconfirmed: true })?.text).toBe(
      "Reconnected to your table — check your order below.",
    );
    expect(mintNotice({ ...base, recovering: true })?.text).toBe(
      "Reconnected to your table — please try that again.",
    );
  });

  it("the diner's own new order is confirmed, ahead of every other reading", () => {
    expect(
      mintNotice({
        ...base,
        restarted: true,
        recovering: true,
        newCart: true,
        created: true,
        replacedStored: true,
      })?.text,
    ).toBe("Your new order is ready — add whatever you like.");
  });

  it("finding 4 — a cold mount whose stored table had ended SAYS so (it used to land silently in 'Just you')", () => {
    // MUTATION (lcs/stored-table-ended-silently): drop the replacedStored arm — the reload after a
    // clear lands in a new, unnumbered session with no word.
    expect(
      mintNotice({ ...base, firstMint: true, created: true, replacedStored: true })?.text,
    ).toBe("Your last table’s order had ended — this is a new one.");
    // Only a mint that CREATED: a re-join of the same table says nothing.
    expect(mintNotice({ ...base, firstMint: true, replacedStored: true })).toBeNull();
    // The home card's resume keeps its own sentence.
    expect(mintNotice({ ...base, firstMint: true, created: true, resume: true })?.text).toBe(
      "Your earlier visit at this table had ended — we’ve started a fresh one for you.",
    );
    // A later, ordinary mint says nothing.
    expect(mintNotice({ ...base, created: true, replacedStored: true })).toBeNull();
  });

  it("a write whose answer was lost when the table ENDED is UNCONFIRMED, never refused — on every end", () => {
    // The blind pass on #361, CRITICAL 1. An Add commits its line, a racing staff MERGE re-parents
    // that line onto the target table's cart and cancels this one, and the Add's trailing read
    // throws `cart_closed`: the dish is on the target's order, cooking and charged there. "Mohinga
    // didn't go through" invited the re-add that puts it on two bills. A clear and the sweep look
    // the same from this phone, so every end says what we know — and who can see where it went.
    // MUTATION (lcs/ended-write-claims-a-refusal): the retired "didn't go through" sentence back.
    for (const end of [CLEARED, CLOSED, EXPIRED]) {
      expect(endedWriteNotice(end, "Mohinga")).toBe(
        "We couldn’t confirm Mohinga — this table’s order has closed; ask our staff whether it made it onto your order before you add it again.",
      );
      expect(endedWriteNotice(end)).toMatch(/^We couldn’t confirm that — /);
      expect(endedWriteNotice(end, "Mohinga")).not.toMatch(/didn’t go through/);
    }
    // MUTATION (lcs/paid-write-claims-a-refusal): drop the paid arm — the paid table borrows the
    // closed table's sentence, which names no payment.
    expect(endedWriteNotice(PAID, "Mohinga")).toBe(
      "We couldn’t confirm Mohinga — your table’s bill was paid just then.",
    );
    // The DOOR's refusal (nothing was sent) is the provider's own sentence, from this clause.
    expect(CLOSED_ORDER_CLAUSE).toBe("this order has closed");
  });

  it("CRITICAL 2 — the paid strip's caption names when the last READ landed, never the settle moment", () => {
    // MUTATION (lcs/stale-caption-claims-the-settle): the retired "As it stood when your bill was
    // paid" — unprovable when the last view predates a pocketed phone by an hour.
    const clock = (iso: string) => (iso === "2026-10-13T02:42:00.000Z" ? "7:42 PM" : "");
    expect(staleCaption("2026-10-13T02:42:00.000Z", clock)).toBe(
      "Last updated 7:42 PM — this list won’t update here.",
    );
    // No view ever read, or a clock that cannot be read: only what is certain.
    expect(staleCaption(null, clock)).toBe("This list won’t update here.");
    expect(staleCaption("not a date", clock)).toBe("This list won’t update here.");
    for (const c of [staleCaption("2026-10-13T02:42:00.000Z", clock), staleCaption(null, clock)])
      expect(c).not.toMatch(/paid/);
  });

  it("finding 5 — the leave warns a HOST whose DURABLE party holds another seat, and never claims 'alone' it has not read", () => {
    const party = (seats: string[], current = true) => ({ seats, current });
    // MUTATION (lcs/leave-warning-counts-the-host-alone): count every seat — a host alone at the
    // table is warned about others who do not exist.
    expect(
      leaveWarning({ role: "host", mySeat: "me", ended: false, party: party(["me", "aye"]) }),
    ).toBe("sends");
    expect(
      leaveWarning({ role: "host", mySeat: "me", ended: false, party: party(["me"]) }),
    ).toBeNull();
    // A guest's leave strands nothing: only the host sends.
    expect(
      leaveWarning({ role: "guest", mySeat: "me", ended: false, party: party(["me", "aye"]) }),
    ).toBeNull();
    expect(leaveWarning({ role: null, mySeat: "me", ended: false, party: null })).toBeNull();
    // Codex round 2 on #361 — the party not established NOW (never read, or the read asked when the
    // leave flow opened still out, or failed): the hedged sentence, never silence, which reads as
    // "you are alone". MUTATION (lcs/leave-warning-claims-alone-unread): stale "alone" says nothing.
    expect(leaveWarning({ role: "host", mySeat: "me", ended: false, party: null })).toBe("maybe");
    expect(
      leaveWarning({ role: "host", mySeat: "me", ended: false, party: party(["me"], false) }),
    ).toBe("maybe");
    // Membership never shrinks: a stale answer that SAW another seat still holds.
    expect(
      leaveWarning({
        role: "host",
        mySeat: "me",
        ended: false,
        party: party(["me", "aye"], false),
      }),
    ).toBe("sends");
  });

  it("the blind pass on #361 (B1) — a table that ENDED gives no leave warning: the Send is gone with the order, so nothing is stranded", () => {
    // MUTATION (lcs/leave-warning-ignores-the-end): a host held on "this table closed" (a clear, a
    // merge) keeps role host and the last party read, and was told leaving strands the others' Send.
    const party = (seats: string[], current = true) => ({ seats, current });
    for (const p of [party(["me", "aye"]), party(["me", "aye"], false), party(["me"], false), null])
      expect(leaveWarning({ role: "host", mySeat: "me", ended: true, party: p })).toBeNull();
  });

  it("the card names each end by its own words, and the paid arms reuse the Bill's close", () => {
    expect(endCardWords(CLEARED)).toMatchObject({
      title: "tableClearedTitle",
      body: "tableClearedBody",
      staffLine: true,
    });
    expect(endCardWords(CLOSED)).toMatchObject({ title: "tableClosedTitle", staffLine: true });
    expect(endCardWords(EXPIRED)).toMatchObject({ title: "tableExpiredTitle", staffLine: true });
    expect(endCardWords(PAID)).toMatchObject({
      title: "counterSettledTitle",
      body: "counterSettledBody",
      staffLine: false,
    });
    // A tablemate's CARD is never "paid at the counter" (the Bill's CRITICAL 1, on the menu too).
    // MUTATION (lcs/card-paid-reads-as-the-counter)
    expect(endCardWords({ ...PAID, tender: "card" })).toMatchObject({
      eyebrow: "Paid",
      title: "billPaidTitle",
      body: "billPaidBody",
    });
    // An unreadable tender claims nothing about where.
    expect(endCardWords({ ...PAID, tender: "unknown" }).body).toBeNull();
    // A paid table whose session closed may no longer be the diner's: the staff line shows.
    expect(endCardWords({ ...PAID, sessionLive: false }).staffLine).toBe(true);
    expect(endedNewsKey(CLEARED)).toBe("tableClearedTitle");
  });

  it("every card key resolves in both tongues (the dictionary holds them)", () => {
    for (const end of [PAID, CLEARED, EXPIRED, CLOSED, { ...PAID, tender: "card" as const }]) {
      const w = endCardWords(end);
      for (const k of [w.title, w.body].filter((x): x is NonNullable<typeof x> => x !== null)) {
        expect(t("en", k).length).toBeGreaterThan(0);
        expect(t("my", k)).toMatch(/[က-႟]/);
      }
    }
    expect(t("en", "tableClearedBody")).toBe(
      "Anything not yet served was cancelled — you won’t be charged for it.",
    );
    // The blind pass on #361 — after a MERGE the dishes are still cooking and charged on the table
    // it moved to: the closed card sends the diner to staff before a second order.
    expect(t("en", "tableClosedBody")).toBe(
      "Nothing more can be added from this phone — if your table was moved, ask our staff before you order again.",
    );
    // The sweep closes the SESSION, not the bill: the register can still take what is owed, so the
    // expired card never says "it closed".
    expect(t("en", "tableExpiredBody")).toBe(
      "Nothing had changed on it for hours, so this phone can’t add to it any more — anything owed can still be paid at the counter.",
    );
    expect(t("en", "tableExpiredBody")).not.toMatch(/so it closed/);
  });

  it("the tracker is offered only for an order this seat may see", () => {
    expect(endTrackHref(PAID, "cart-1")).toBe("/track?cart=cart-1&paid=1");
    expect(endTrackHref({ ...PAID, orderId: null }, "cart-1")).toBeNull();
    expect(endTrackHref(CLEARED, "cart-1")).toBeNull();
    expect(endTrackHref(PAID, null)).toBeNull();
  });
});

describe("settleEdgeNotice — the register's own words while the split is parked (finding 2)", () => {
  it("parked: the register's sentence on the freeze, its own on a release — never the split's", () => {
    // MUTATION (lcs/menu-settle-speaks-the-split): ignore the flag — a family whose bill Dad is
    // taking in cash hears "Your table is splitting the bill", a door no phone can open.
    expect(settleEdgeNotice(true, false)).toBe(REGISTER_SETTLING_COPY);
    expect(settleEdgeNotice(false, false)).toBe(
      "The counter stopped taking payment — you can edit the order again",
    );
  });

  it("open: the split's own sentences, unchanged", () => {
    expect(settleEdgeNotice(true, true)).toBe(
      "Your table is splitting the bill — the order’s locked while everyone pays",
    );
    expect(settleEdgeNotice(false, true)).toBe(
      "The split was called off — you can edit the order again",
    );
  });
});
