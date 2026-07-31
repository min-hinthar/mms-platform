"use client";
import { useState, type CSSProperties } from "react";
import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { useCart } from "./TableCartProvider";
import { InviteSheet } from "./InviteSheet";
import { JoinTable } from "./JoinTable";
import { seatColor, seatInitial } from "@/lib/avatars";
import { MAX_PARTY_SIZE } from "@/lib/limits";
import { Avatar, Icon } from "@mms/ui";

/**
 * Dine-in group cart guest list (M3·P3.1). Renders the live presence party (real second phones —
 * no simulation; presence is dine-in only) as overlapping avatars + a "party of N" label, and the
 * invite affordance. Self is always shown (even before the channel syncs) and labelled "(you)".
 * Solo modes return null (honesty — RED-TEAM #3).
 */
export function GuestList() {
  const {
    isGroup,
    members,
    me,
    error,
    loading,
    locked,
    lockedByName,
    tableNumber,
    revalidate,
    settling,
    cartId,
  } = useCart();
  const [inviteOpen, setInviteOpen] = useState(false);
  // W9a — `revalidate()` clears `error`, and the failure block below is gated on `error`. Without a
  // busy state the retry button DELETES ITSELF the moment it is tapped: focus drops to <body>
  // (WCAG 2.4.3 — the very defect this slice fixed one file over in JoinTable), nothing announces,
  // and the block silently reappears when the re-mint fails again.
  //
  // DERIVED, not an effect (the React Compiler lint rightly bans setState-in-effect, and this needs
  // no synchronization): the provider's `loading` is already `!session && !error`, so it is true for
  // exactly the re-mint round trip and flips false on either outcome. Gating it behind a tick set in
  // the click handler keeps the block hidden during the ordinary FIRST mount, when `loading` is also
  // true but there is nothing to report yet.
  const [retryTick, setRetryTick] = useState(0);
  const retrying = retryTick > 0 && loading;
  if (!isGroup) return null;

  // Pay-window lock (P3.2-lock): a member is checking out → the order's read-only for the moment
  // (AddButtons disable in parallel). A PLAIN visual banner (v7.2 .lockbar) — NOT a second live
  // region: the transition is announced through the provider's single live region, and the disabled
  // Add buttons carry the locked state for SR users who tab to them.
  if (locked)
    return (
      <p style={lockBar}>
        <Icon
          name="lock"
          size={14}
          style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
        />
        {lockedByName === "You" ? "You’re" : `${lockedByName} is`} checking out — the order’s locked
        for a moment.
      </p>
    );

  // The dine-in join is the whole point of this screen — if the session mint failed, don't silently
  // drop the group UI; surface the way out so the diner isn't stranded.
  //
  // W9a — three things matter here:
  //   • **Retry re-mints IN PLACE (`revalidate`), never `window.location.reload()`.** A reload arrives
  //     with `?t=`/`?j=` already stripped from the address bar, so the mint is no longer join-only and
  //     the server PROVISIONS a phantom table with this diner as host — they then order a whole meal
  //     onto a cart their party can never see. `revalidate` re-POSTs with the join code still held in
  //     memory, so a retry can only ever rejoin the real table. That makes retry safe on every arm.
  //   • **"No table found" also offers a different code.** `findActive` swallows its PostgREST error,
  //     so a transient DB read failure returns the SAME 404 string as a genuinely wrong code — which
  //     is exactly why this arm keeps a retry as well as the JoinTable escape, instead of being
  //     treated as terminal.
  //   • **Party-full (409) is the one truly terminal arm** — no retry can free a seat, and offering
  //     one would just re-fail.
  // The server's own reason is shown verbatim where it is specific and diner-safe; the generic
  // fallback stays for the transient arm, where naming the cause would be a guess.
  if (!me) {
    // `retrying` keeps this mounted through a re-mint (see above); without it the block — and the
    // focused button inside it — vanishes the instant retry is tapped.
    if (!error && !retrying) return null; // still establishing the session — the menu renders meanwhile
    const full = error?.includes("table is full") ?? false;
    const noTable = error?.includes("No table found") ?? false;
    return (
      <div style={{ marginTop: 10 }}>
        <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", margin: 0 }}>
          {/* The text CHANGES on retry, so the one live region narrates the attempt — and changes
              again when the failure returns, which is what makes a repeat of an identical error
              audible at all. */}
          {retrying
            ? "Reconnecting to your table…"
            : full || noTable
              ? error
              : "Couldn’t join this table."}{" "}
          {!full && (
            // `aria-disabled`, not `disabled`: a disabled button is removed from the focus order, so
            // the keyboard user who just pressed it would lose their place — the same failure mode
            // the mount-preservation above exists to prevent.
            <button
              type="button"
              aria-disabled={retrying}
              onClick={() => {
                if (retrying) return;
                setRetryTick((n) => n + 1);
                revalidate();
              }}
              style={retryBtn}
            >
              {retrying ? "Reconnecting…" : "Try again"}
            </button>
          )}
        </p>
        {/* Not a live region — the alert above already announced the failure; this is the way out for
            a code that is genuinely wrong. JoinTable owns its own sheet and routes with a fresh `?j=`,
            so a corrected code takes the join-only path and can never provision a table. */}
        {noTable && !retrying && (
          <div style={{ marginTop: 6 }}>
            <JoinTable />
          </div>
        )}
      </div>
    );
  }

  // W9b — the table is settling: the cart is frozen table-wide and every Add on this menu is inert.
  // Placed AFTER the `!me` branch on purpose — the `locked` early-return above already sits ahead of
  // it, and a second early-return alongside that one would shadow "Couldn't join this table" / the
  // party-full copy for a diner whose session never established.
  //
  // Plain visual banner, not a live region: the provider announced the transition through the view's
  // one region. Unlike `locked` (a moment that passes on its own) settling needs somewhere to GO —
  // the diner's share is waiting on the board — so this one carries a link.
  if (settling && cartId)
    return (
      <p style={settleBar}>
        <Icon
          name="people"
          size={14}
          style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
        />
        <span>Your table is splitting the bill — the order’s locked while everyone pays.</span>
        <Link
          href={`/cart?cart=${encodeURIComponent(cartId)}`}
          style={{
            marginLeft: "auto",
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
            color: "var(--ac-strong)",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          Pay your share →
        </Link>
      </p>
    );

  // Always include self first (presence may not have synced yet); dedupe peers by seat.
  const bySeat = new Map<string, { seat: string; name: string }>();
  bySeat.set(me.seat, me);
  for (const m of members) if (!bySeat.has(m.seat)) bySeat.set(m.seat, m);
  const list = [...bySeat.values()];
  // Party-size cap (P3.4): a sticker is one table. At the cap, the server rejects further joins, so
  // hide the invite affordance and say so honestly rather than offering an invite that can't be honored.
  const atCap = list.length >= MAX_PARTY_SIZE;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
      <ul role="list" aria-label="Guests at your table" style={listReset}>
        {list.map((m, i) => {
          const isMe = m.seat === me.seat;
          const label = isMe ? `${m.name} (you)` : m.name;
          return (
            // Rise-in per avatar (keys are stable seats — presence re-syncs never re-animate; only a
            // genuinely NEW guest animates once on mount). `.mms-rise` (the dynamic-mount variant —
            // J1's SurfaceMemory never zeroes it, unlike `.mms-stagger`) is reduced-motion-gated.
            <li
              key={m.seat}
              className="mms-rise"
              style={{ display: "flex", marginLeft: i === 0 ? 0 : -8 }}
            >
              <Avatar
                initial={seatInitial(m.name)}
                color={seatColor(m.seat)}
                ring
                aria-label={label}
              />
            </li>
          );
        })}
      </ul>
      <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", fontWeight: 600 }}>
        {/* K2: lead with the real table when it's registered — "Table 7 · Party of 3". */}
        {tableNumber != null ? `Table ${tableNumber} · ` : ""}
        {list.length === 1 ? "Just you" : `Party of ${list.length}`}
      </span>
      {atCap ? (
        <span aria-label={`Table is full, up to ${MAX_PARTY_SIZE} guests`} style={fullNote}>
          <Icon
            name="check"
            size={13}
            style={{ display: "inline", verticalAlign: "-2px", marginRight: 2 }}
          />{" "}
          Table’s full
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          aria-label="Invite people to your table"
          style={inviteChip}
        >
          <Icon name="people" size={15} /> Invite
        </button>
      )}
      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

const listReset: CSSProperties = {
  display: "flex",
  listStyle: "none",
  margin: 0,
  padding: 0,
  alignItems: "center",
};
const lockBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
  padding: "9px 13px",
  borderRadius: 11,
  background: "var(--warnb)",
  color: "var(--warn)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
};
// W9b — the settle banner. Same shape as `lockBar` but neutral-surfaced rather than warn-coloured:
// the table paying is the intended end of the meal, not something going wrong. `flexWrap` keeps the
// link's 44px target from crushing the copy on a narrow phone.
const settleBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
  padding: "9px 13px",
  borderRadius: 11,
  background: "var(--sf)",
  border: "1px solid var(--bd)",
  color: "var(--t2)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
};
const retryBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 4px",
  background: "none",
  border: "none",
  color: "var(--ac)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  textDecoration: "underline",
  cursor: "pointer",
};
const inviteChip: CSSProperties = {
  marginLeft: "auto",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 14px",
  borderRadius: 999,
  border: "1.5px solid var(--ac)",
  background: "color-mix(in oklab, var(--ac) 9%, var(--cd))",
  color: "var(--ac-strong)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const fullNote: CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--t2)",
};
