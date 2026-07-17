# Order ownership & authority model

Decisions from a Cowork thinking session (June 2026) on how the order is owned, who may change it, and how voids/refunds are authorized. Not yet built — this informs the dine-in / tab / fallback work (post-M1). It extends, and is enforced by, the server-authoritative + RLS rules in [`RED-TEAM.md`](RED-TEAM.md) and [`RESEARCH-DIGEST.md`](RESEARCH-DIGEST.md).

## The spine — the order belongs to the _table_, not the device or channel

One server-authoritative **table-order ledger** is the source of truth. QR phones, a staff POS, and a counter kiosk are all _doors_ that read/write the **same** table session — the cart belongs to the table, not the phone that started it. Settlement is decoupled from ordering: an order can accumulate and be closed later, by any channel and any tender (card now, card-on-file at close, or cash to a cashier). "Pay a human," "open a tab," and "cash" are the **same** capability — an unpaid table order settled later.

> **Make-or-break:** if the POS, kiosk, and phone don't all write the _same_ table order, you get double-orders (guest scans _and_ tells the server) and reconciliation chaos. Single source of truth per table is non-negotiable; it's a staff-orchestration rule as much as code ("is this table self-serving, or shall I take it?").

## Decision — edit rights are a function of line **state × actor role**

A line moves **draft → fired (sent to kitchen) → in progress → served → settled**, and who may mutate it shrinks at each step. Every mutation passes one server-side guard: `canMutate(line_state, actor_role)` (the generalization of the v7.1 host-lock finding — enforce server-side, never just hide the button).

- **Pre-fire, own line:** the customer edits freely (add / remove / qty / modifiers).
- **Pre-fire, another guest's line (group tab):** host-only or confirm (cross-owner-delete guard).
- **Post-fire (committed food):** **staff-only.** The customer's "Remove" becomes **"Ask server"** — a _request_, not an action. Agency without destructive control.
- **Adding is always allowed** post-fire (it's a new draft line that fires fresh); only _removing / reducing / changing modifiers_ on a fired line is gated. Asymmetric.
- **Grace window:** a ~5s "Sent! — Undo" before the ticket truly hits the KDS kills fat-finger fires without handing back indefinite delete power.
- **Grocery doesn't "fire":** a Scan & Go line locks at **payment**, not at kitchen-fire. In a mixed basket each line's lock trigger follows its fulfillment type (kitchen line → fire; grocery line → tender).

> Post-fire immutability is also what lets the **kitchen trust the KDS** — if a customer could mutate a fired ticket, line cooks revert to paper and the system loses its authority.

## Decision — voids / comps / refunds: server-initiated + manager step-up, gated by **loss**

- A void of an item the kitchen **hasn't started** = ~zero loss → the **server does it solo with a logged reason code** (no PIN). Avoids PIN-fatigue.
- A comp/void of **cooked** food, or any **money-leaving refund** = real loss → **manager-PIN step-up** on the server's own device (no walk to a back office). Two-party audit: initiating server **and** authorizing manager, + reason + amount + timestamp.
- Treat the PIN as **sudo on the existing role model**, not a new subsystem: per-person (never a shared `1234`), verified **server-side**, rate-limited with lockout, rotatable, logged.

## Decision — no manager on site → **owner remote-approve** (async)

The "manager" is often also serving (family-run); when none is present, a high-loss action **pings the owner to approve from their phone**.

- Because the order is table-owned + settlement is deferred, a **pending void resolves into the final tab** — async approval rarely blocks anything (the line shows "void pending"; it clears whenever approved, even after the guest leaves).
- **Fail to the SAFE state if unreachable** — stay pending / server uses capped solo discretion. **Never auto-approve on timeout** (that's the hole a bad actor probes at 2am).
- **Two approvers + SMS backup:** both owners on the chain, so a muted phone falls to the other owner, never to nothing.
- **One-glance push:** item · amount · reason · server · table — enough to decide without calling the restaurant.
- Honest caveat: remote-approve is **weaker** than in-person (you can't see the plate). Its value is that the decision is _yours and logged_; the real protection is the **audit trail + anomaly review** (a server whose voids cluster after close), not the approval tap.

## Decision — build a general **approvals primitive**

`request → notify → approve/deny → audit`, with the post-fire void as **consumer #1**. Refunds, large discounts, price overrides, and after-hours tab-closes all reuse the same queue. (Same instinct as collapsing tabs + cash + "pay a human" into one deferred-settlement spine — build the general capability once.)

## Decision — tabs: trust by default, secure on the server's call

A tab is just the table order with settlement deferred. **Default = trust tab** — no card up front; settle at close with any tender (card, cash, or a cashier), the same plumbing as "pay a human." **Secure tab** — a card saved via SetupIntent at open _or attached to a live tab_, charged off-session at close — is offered/required at **server discretion**, for the cases where walk-out risk concentrates (large parties, unfamiliar faces, big watch-party tables). The host who opens the tab is cardholder of record; at close it's host-pays-all or split (existing split feature); tip lands on the final total.

- **No pre-auth holds online** — card-not-present can't increment a hold cleanly and a too-large hold annoys guests; reserve that pattern for a future staff-Terminal/card-present path.
- **Frame secure-tab as a courtesy, not an accusation** ("want me to hold it on a card so you don't have to think about it?"). Scripting matters with a regular base — and guard against the demand reading as **profiling**; pair discretion with a light system nudge ("large/new table → consider a secure tab") rather than pure unaided judgment, so it's consistent and less awkward.
- **Silent ceiling:** even a trust tab flags the server when it balloons past a $ threshold ("this tab is at $X — convert or check in?") — surfaced, never auto-converted. The safety net under discretion.
- **Convert mid-tab** (attach a card to an already-open trust tab), **log the tab type + who set it** (walk-out post-mortem + reviewing discretion patterns), and treat a close-time off-session decline like any failed payment (validate the card at open; retry/notify).

## Decision — multi-door convergence: soft / advisory (trust the shared cart)

Phone, staff POS, and kiosk all write the same table session; the system **shows table state** and **warns on divergence** — when a server starts a _new_ order on a table that already has an active guest cart ("Table 7 has a live guest cart — add to it?") — but never hard-locks the table or forces guest phones read-only. The shared, visible cart is what keeps everyone converged.

- **Soft works only if table state is legible** — invest in an accurate floor view (per-table session / cart / last-activity); that's where the effort goes instead of into locks.
- **Warn on divergence, not on every touch** — fire only when creating a _parallel_ order; stay silent when correctly extending the existing one, or servers reflexively dismiss it (the PIN-fatigue / live-region-flood lesson).
- **Design the recovery, not just the prevention:** soft means the occasional double-order _will_ happen, so make it a **one-tap merge** of two table orders (role-gated, logged) — a 5-second cleanup, not a billing dispute.
- **Session lifecycle:** expire stale/abandoned guest sessions (timeout) and give staff a **"clear table"** on bus/turnover, so a ghost cart never carries to the next party (same as kiosk "start fresh").

## Decision — unified basket: one cart, routed by destination, to-go fires at checkout

Dine-in + to-go + grocery live in one table basket with one payment (per-line `tax_category` separates taxable hot food from exempt grocery; the mixed receipt is good SB-1524 transparency). Each line carries a **fulfillment tag** that routes it: dine-in → kitchen **now** (served to table); to-go food → kitchen **at checkout** (freshest) with a guest **"make it now"** toggle; grocery → no kitchen, locks at payment, bagged at checkout. The KDS and the expo/bagging station each see only their subset of the order.

- **"Checkout" = tab-close** (or the pay step). On a **pay-now** order there's no later close to ride on, so the **"make it now" toggle is the explicit fire trigger** for to-go. The toggle does double duty: manual fire for pay-now, early fire for a tab.
- **Signal departure-readiness** — "your to-go will be ready in ~X min" + a "to-go ready" status, so a guest doesn't pay and walk out without it.
- **Group the guest cart by destination** ("At your table / To take home — kitchen / Grocery") so one basket stays legible.
- **Watch-out (defer):** fire-at-checkout can spike the kitchen if a whole section closes out at once (Final-match night) — kitchen-load smoothing is a later optimization, not launch.

## Open — decide before building

- The exact **loss threshold $** for "server-solo vs manager-PIN."
- **Split-tender** for EBT (2027) inside a mixed basket — design the seam now (a payment can cover a _subset_ of lines); build the tender split in the 2027 EBT track.
