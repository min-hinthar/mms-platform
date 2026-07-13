"use client";
import { useState, type CSSProperties } from "react";
import { useCart } from "./TableCartProvider";
import { InviteSheet } from "./InviteSheet";
import { seatColor, seatInitial } from "@/lib/avatars";
import { MAX_PARTY_SIZE } from "@/lib/limits";
import { Avatar } from "@mms/ui";

/**
 * Dine-in group cart guest list (M3·P3.1). Renders the live presence party (real second phones —
 * no simulation; presence is dine-in only) as overlapping avatars + a "party of N" label, and the
 * invite affordance. Self is always shown (even before the channel syncs) and labelled "(you)".
 * Solo modes return null (honesty — RED-TEAM #3).
 */
export function GuestList() {
  const { isGroup, members, me, error, locked, lockedByName, tableNumber } = useCart();
  const [inviteOpen, setInviteOpen] = useState(false);
  if (!isGroup) return null;

  // Pay-window lock (P3.2-lock): a member is checking out → the order's read-only for the moment
  // (AddButtons disable in parallel). A PLAIN visual banner (v7.2 .lockbar) — NOT a second live
  // region: the transition is announced through the provider's single live region, and the disabled
  // Add buttons carry the locked state for SR users who tab to them.
  if (locked)
    return (
      <p style={lockBar}>
        <span aria-hidden>🔒</span> {lockedByName === "You" ? "You’re" : `${lockedByName} is`}{" "}
        checking out — the order’s locked for a moment.
      </p>
    );

  // The dine-in join is the whole point of this screen — if the session mint failed, don't silently
  // drop the group UI; surface a retry (reload re-runs the mint) so the diner isn't stranded. A
  // party-full 409 (P3.4) is terminal, though — retrying can't free a seat, so show the honest server
  // copy WITHOUT a retry that would just re-fail.
  if (!me) {
    if (!error) return null; // still establishing the session — the menu renders meanwhile
    const full = error.includes("table is full");
    return (
      <p role="alert" style={{ fontSize: 13, color: "var(--warn)", marginTop: 10 }}>
        {full ? error : "Couldn’t join this table."}{" "}
        {!full && (
          <button type="button" onClick={() => window.location.reload()} style={retryBtn}>
            Try again
          </button>
        )}
      </p>
    );
  }

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
      <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600 }}>
        {/* K2: lead with the real table when it's registered — "Table 7 · Party of 3". */}
        {tableNumber != null ? `Table ${tableNumber} · ` : ""}
        {list.length === 1 ? "Just you" : `Party of ${list.length}`}
      </span>
      {atCap ? (
        <span aria-label={`Table is full, up to ${MAX_PARTY_SIZE} guests`} style={fullNote}>
          <span aria-hidden>✓</span> Table’s full
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          aria-label="Invite people to your table"
          style={inviteChip}
        >
          <span aria-hidden>👥</span> Invite
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
  fontSize: 12.5,
};
const retryBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 4px",
  background: "none",
  border: "none",
  color: "var(--ac)",
  fontWeight: 800,
  fontSize: 13,
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
  fontSize: 13,
  cursor: "pointer",
};
const fullNote: CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--t2)",
};
