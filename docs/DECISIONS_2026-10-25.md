# Decisions — 2026-10-25 (OA3 · OA4 · OA9)

The owner, 2026-10-25: "Decide OA3, OA4 and OA9 with world-class design-thinking". The same day the
owner had OA1 applied to prod ("apply OA1 migration to prod"), so a manager now approves their own
void, comp or no-show on their own sign-in. Each decision below starts from the person at the tablet
and what goes wrong for them, then picks the rule. Each one says what shipped on #373.

## The frame

No-PIN (the owner's ask, 2026-10-24) moved the restaurant from two proofs of presence to one:

- **Before:** a signed-in tablet, plus a manager's PIN typed at the moment of the loss.
- **Now:** a signed-in tablet, on the manager's own sign-in.

Every money-out decision therefore rests on two questions. Is the person at the tablet the person
who signed in? Does that person hold the authority? These three decisions keep both answers true
without adding a step back in.

## OA3 — a manager's own queued request

**Who meets it:** a manager looking at a request in the approvals queue that they filed themselves.

**When it happens:** after OA1, a manager acts directly on a line, so no request is ever filed for
them. A manager's own request exists only as a leftover: one filed before OA1 applied, or one filed
while the person was still a server and since promoted.

**Options:**

- (a) Let them approve it. The queue's one purpose is a second person's eyes, so this removes it.
- (b) Keep the rule, as now: the asker cannot approve, but may close the request.
- (c) Keep the rule, and have the refusal name the way through.

**Decision: (c).** The SQL rule in `mms_resolve_approval` stays. The refusal no longer says "another
manager decides it", which is a dead end with one manager on shift. It now says to make the change on
the line, where the manager's own sign-in now approves it, and then close the request. The order is
the SQL's: a close is admitted only once the line has changed, and a live, unchanged request answers
`still_open` (Codex caught the first draft's reversed order).

**Shipped:** `table.appr.ownRequest` rewritten (en + my, a K15 draft). No migration.

## OA4 — a custom item for servers

**Who meets it:** a server whose guest asks for something off the menu (a cake brought in, a corkage,
a special) at a busy table.

**What could go wrong:** a custom item is a price typed by a person. That is price authority, the same
authority as editing a menu price, which is manager-only. It is also the shortest path to
undercharging a friend: ring a $0.25 "special" in place of a $16 dish. The kitchen and the receipt
would both look normal.

**Options:**

- (a) Open it to servers.
- (b) Open it to servers under a cap.
- (c) A server's custom item goes to the approvals queue.
- (d) Keep it to managers and owners.

**Decision: (d).**

- (a) and (b) make a typed price ordinary.
- (c) builds a queue for a price, the one kind of request with no fixed amount to approve against.

Since OA1, a manager adds the item from their own sign-in in seconds, with no PIN hand-off, so the
cost that once argued for (a) is gone. Off a table, a custom item is refused outright (Codex round 5):
counter and pickup settlement re-derive each line against the catalog.

**Shipped:** unchanged. `staffAddCustomItem` stays `staffGate("manager")`; the pad offers the chip to
managers and owners on a dine-in table.

## OA9 — money-out while the console is locked

**Who meets it:** anyone holding a tablet a manager locked and walked away from. The tablet still
carries that manager's session.

**What could go wrong:** the lock was an attribution screen. The PIN was what guarded money-out. With
the PIN gone, the lock is the only proof that the person at the tablet is the person signed in. Yet
the money-out actions never read it, while the KDS, the floor and the lane already refuse with
`locked`.

**Options:**

- (a) Leave it: the path needs a crafted request.
- (b) Make every money-out and price-authority write refuse while the console is locked, and send the
  console to its lock screen.

**Decision: (b).** It costs one cookie read per write. It turns "the lock is a screen" into "the lock
is the presence check" exactly where the PIN used to stand, and its answer is the one the console
already gives everywhere else (`/staff/lock`).

**Shipped.** Each of these actions answers `locked` before any read:

- `voidLine` (void and comp);
- `recordCounterNoShow`;
- `resolveApproval`;
- `refundLine`;
- `setMenuPrice`;
- every menu-studio write;
- `staffAddCustomItem`.

Their sheets go to the lock screen (`toLockScreen`). Each check carries a `verify:slice` mutant.
