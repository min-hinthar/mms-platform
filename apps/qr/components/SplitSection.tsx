"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { CartItem } from "@mms/db";
import { getCartSplit, type SeatShare, type SplitContext } from "@/lib/split";
import { assignLine } from "@/lib/cart";
import { canMutateLine } from "@/lib/permissions";
import { seatColor, seatInitial } from "@/lib/avatars";

/**
 * Dine-in split-the-bill section on /cart (M3·P3.3a). Shows server-authoritative per-seat shares
 * (Even / By person) and, in by-person mode, lets a line be assigned to a seat (canMutate-gated:
 * host any line, a guest only their own). Honest scope: these shares are a REFERENCE breakdown — the
 * order is still paid in full at checkout; per-card tender is P3.3b. No promise the code can't keep.
 */
export function SplitSection({
  cartId,
  items,
  ctx,
  onChanged,
}: {
  cartId: string;
  items: CartItem[];
  ctx: SplitContext;
  onChanged: () => void; // re-sync the lines after an assignment (parent re-fetches the view)
}) {
  const [mode, setMode] = useState<"even" | "by_person">("even");
  const [shares, setShares] = useState<SeatShare[]>([]);
  const [busyLine, setBusyLine] = useState<string | null>(null);

  // Server-authoritative shares (cent-reconciled) — re-derived on mode change or when the lines
  // change (a new ref arrives only when the parent's items state actually updates).
  useEffect(() => {
    let active = true;
    getCartSplit(cartId, mode)
      .then((s) => active && setShares(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [cartId, mode, items]);

  async function reassign(lineId: string, seat: string) {
    setBusyLine(lineId);
    try {
      await assignLine(lineId, seat);
      onChanged();
    } catch {
      // locked / not permitted — the parent's re-sync (onChanged isn't called) leaves state truthful;
      // a failed assign is a no-op the server rejected.
    } finally {
      setBusyLine(null);
    }
  }

  return (
    <section aria-labelledby="split-h" style={{ marginTop: 18 }}>
      <h2 id="split-h" style={{ fontSize: 16, margin: "0 0 8px" }}>
        Split the bill
      </h2>

      <div role="group" aria-label="Split mode" style={seg}>
        {(["even", "by_person"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            style={segBtn(mode === m)}
          >
            {m === "even" ? "Evenly" : "By person"}
          </button>
        ))}
      </div>

      {mode === "by_person" && (
        <ul
          role="list"
          style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 12 }}
        >
          {items.map((line) => {
            const owner = line.bySeat ?? ctx.members[0]?.seat ?? ctx.mySeat;
            const canAssign = canMutateLine("draft", ctx.myRole, line.bySeat === ctx.mySeat);
            return (
              <li key={line.id}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {line.qty}× {line.name}
                </div>
                <div
                  role="group"
                  aria-label={`Assign ${line.name}`}
                  style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}
                >
                  {ctx.members.map((m) => {
                    const on = owner === m.seat;
                    const who = m.seat === ctx.mySeat ? "you" : m.name;
                    return (
                      <button
                        key={m.seat}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Assign ${line.name} to ${who}`}
                        disabled={!canAssign || busyLine === line.id}
                        onClick={() => reassign(line.id, m.seat)}
                        style={aav(on, m.seat, canAssign)}
                      >
                        <span aria-hidden>{seatInitial(m.name)}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
          {!canMutateLine("draft", ctx.myRole, true) ? null : (
            <li style={{ fontSize: 11.5, color: "var(--t3)" }}>Tap a guest to assign each item.</li>
          )}
        </ul>
      )}

      <dl style={{ margin: "14px 0 0", display: "grid", gap: 6 }}>
        {shares.map((s) => (
          <div
            key={s.seat}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <dt style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span aria-hidden style={{ ...avatarSm, background: seatColor(s.seat) }}>
                {seatInitial(s.name)}
              </span>
              {s.seat === ctx.mySeat ? `${s.name} (you)` : s.name}
            </dt>
            <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              ${(s.shareCents / 100).toFixed(2)}
            </dd>
          </div>
        ))}
      </dl>

      <p style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 8, lineHeight: 1.5 }}>
        Each person’s share of the order, including tax &amp; service. The order is paid in full at
        checkout; tip is added then.
      </p>
    </section>
  );
}

const seg: CSSProperties = {
  display: "flex",
  gap: 0,
  border: "1.5px solid var(--bd)",
  borderRadius: 12,
  overflow: "hidden",
};
const segBtn = (on: boolean): CSSProperties => ({
  flex: 1,
  minHeight: 44,
  border: "none",
  background: on ? "color-mix(in oklab, var(--ac) 10%, var(--cd))" : "var(--cd)",
  color: on ? "var(--ac)" : "var(--t2)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
});
const aav = (on: boolean, seat: string, enabled: boolean): CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: on ? "2px solid var(--tx)" : "2px solid transparent",
  background: seatColor(seat),
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  display: "grid",
  placeItems: "center",
  opacity: on ? 1 : enabled ? 0.5 : 0.35,
  cursor: enabled ? "pointer" : "default",
});
const avatarSm: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  fontWeight: 800,
  fontSize: 10,
};
