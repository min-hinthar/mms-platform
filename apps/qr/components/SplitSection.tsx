"use client";
import { useState, useTransition, type CSSProperties } from "react";
import type { CartItem } from "@mms/db";
import type { SplitContext } from "@/lib/split";
import { computeShares } from "@/lib/split-math";
import { openSettlement } from "@/lib/split";
import { assignLine } from "@/lib/cart";
import { canMutateLine } from "@/lib/permissions";
import { seatColor, seatInitial } from "@/lib/avatars";
import { Avatar, NumberFlow } from "@mms/ui";

/**
 * Dine-in split-the-bill section on /cart (M3·P3.3a). Per-seat shares are computed CLIENT-side from
 * the server-authoritative grand total + lines (the same isomorphic split-math the server uses), so
 * they render instantly with no round-trip / layout shift. Even / By-person; by-person lets a line be
 * (re)assigned (canMutate-gated: host any line, a guest only their own). Honest scope: a REFERENCE
 * breakdown — the order is paid in full at checkout; per-card tender is P3.3b. No promise the code can't keep.
 */
export function SplitSection({
  cartId,
  items,
  totalCents,
  ctx,
  onChanged,
  onStatus,
}: {
  cartId: string;
  items: CartItem[];
  totalCents: number; // server-authoritative grand total (from getCartTotals via the cart view)
  ctx: SplitContext;
  onChanged: () => void; // re-sync the lines after an assignment (parent re-fetches the view)
  onStatus: (msg: string) => void; // announce through the parent's single live region (a11y)
}) {
  const [mode, setMode] = useState<"even" | "by_person">("even");
  const [busyLine, setBusyLine] = useState<string | null>(null);

  // Instant, cent-reconciled shares from server-authoritative inputs (no fetch → no empty-then-pop).
  const shares = computeShares(
    totalCents,
    ctx.members.map((m) => ({ seat: m.seat, name: m.name })),
    items.map((i) => ({ bySeat: i.bySeat ?? null, qty: i.qty, unitPriceCents: i.unitPriceCents })),
    mode,
  );

  function switchMode(m: "even" | "by_person") {
    if (m === mode) return;
    setMode(m);
    onStatus(m === "even" ? "Split evenly" : "Split by person");
  }

  async function reassign(lineId: string, seat: string, lineName: string, who: string) {
    setBusyLine(lineId);
    try {
      await assignLine(lineId, seat);
      onStatus(`Assigned ${lineName} to ${who}`);
      onChanged();
    } catch {
      // locked / not permitted — a no-op the server rejected; the parent stays truthful (no onChanged).
    } finally {
      setBusyLine(null);
    }
  }

  // Host opens a real split-tender (M3·P3.3b): freeze the cart + derive server shares, then everyone
  // pays their own card on the live board. onChanged re-syncs the cart view → the board renders.
  const [splitting, startSplit] = useTransition();
  function beginSettle() {
    startSplit(async () => {
      try {
        await openSettlement(cartId, mode);
        onStatus(
          mode === "even"
            ? "Splitting evenly — everyone pays their share"
            : "Splitting by person — everyone pays their share",
        );
        onChanged();
      } catch (e) {
        onStatus(e instanceof Error ? e.message : "Couldn’t start the split.");
        // W9b — `openSettlement` is NOT all-or-nothing: it acquires the table-wide freeze (split.ts,
        // `acquireSettlement`) BEFORE the checks that can throw ("Payments are already in progress",
        // a failed share insert re-throws after its own release). So a throw can still leave the
        // server state changed, and a stale review screen then offers edits the freeze will refuse.
        // Re-syncing is exactly what surfaces the board. Do NOT release the freeze here: it gates
        // every cart mutation while live PaymentIntents are out.
        onChanged();
      }
    });
  }

  return (
    <section aria-labelledby="split-h" style={{ marginTop: 18 }}>
      <h2 id="split-h" style={{ fontSize: "var(--fs-body)", margin: "0 0 8px" }}>
        Split the bill
      </h2>

      <div role="group" aria-label="Split mode" className="checkout-pill-row">
        {(["even", "by_person"] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              className={`checkout-pill${on ? " checkout-pill-on" : ""}`}
              aria-pressed={on}
              onClick={() => switchMode(m)}
              style={{ flex: "1 1 0" }}
            >
              {m === "even" ? "Evenly" : "By person"}
            </button>
          );
        })}
      </div>

      {mode === "by_person" && (
        <ul
          role="list"
          style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 12 }}
        >
          {items.map((line) => {
            const owner = line.bySeat ?? ctx.members[0]?.seat ?? ctx.mySeat;
            // UI hint only (server enforces real state); split lines are pre-fire 'draft' (S2.2 threads it).
            const canAssign = canMutateLine("draft", {
              kind: "diner",
              role: ctx.myRole,
              isOwner: line.bySeat === ctx.mySeat,
            });
            const ownerMember = ctx.members.find((m) => m.seat === owner);
            const ownerName = !ownerMember
              ? "Guest"
              : ownerMember.seat === ctx.mySeat
                ? "you"
                : ownerMember.name;
            return (
              <li key={line.id}>
                <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
                  {line.qty}× {line.name}
                </div>
                {canAssign ? (
                  // Owner (or host) → tappable avatars to (re)assign.
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
                          className="mms-aav"
                          aria-pressed={on}
                          aria-label={`Assign ${line.name} to ${who}`}
                          disabled={busyLine === line.id}
                          onClick={() => reassign(line.id, m.seat, line.name, who)}
                          style={aav(on, m.seat)}
                        >
                          <span aria-hidden>{seatInitial(m.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // A guest viewing someone else's line → static attribution, no dead controls.
                  <div
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6 }}
                  >
                    <Avatar
                      size="sm"
                      initial={seatInitial(ownerMember?.name ?? "Guest")}
                      color={seatColor(owner)}
                    />
                    <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
                      Assigned to {ownerName}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
          <li style={{ fontSize: "var(--fs-xs)", color: "var(--t3)" }}>
            Tap a guest to assign your items; the host can assign any.
          </li>
        </ul>
      )}

      <dl style={{ margin: "14px 0 0", display: "grid", gap: 6 }}>
        {shares.map((s) => (
          <div
            key={s.seat}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <dt
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: "var(--fs-sm)",
              }}
            >
              <Avatar size="sm" initial={seatInitial(s.name)} color={seatColor(s.seat)} />
              {s.seat === ctx.mySeat ? `${s.name} (you)` : s.name}
            </dt>
            <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              {/* Rolls as assignments shift the shares (presentation only — amounts stay server-derived). */}
              <NumberFlow
                value={s.shareCents / 100}
                format={{ style: "currency", currency: "USD" }}
              />
            </dd>
          </div>
        ))}
      </dl>

      <p style={{ fontSize: "var(--fs-xs)", color: "var(--t3)", marginTop: 8, lineHeight: 1.5 }}>
        Each person’s share of the order, including tax &amp; service. Tip is added per person at
        their pay step.
      </p>

      {ctx.myRole === "host" ? (
        <button
          type="button"
          onClick={beginSettle}
          disabled={splitting}
          className="checkout-pill checkout-pill-accent"
          style={{
            width: "100%",
            marginTop: 12,
            minHeight: 48,
            fontSize: "var(--fs-body)",
            opacity: splitting ? 0.7 : 1,
          }}
        >
          {splitting ? "Starting…" : "Split & pay separately"}
        </button>
      ) : (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", marginTop: 12, lineHeight: 1.5 }}>
          The host can start a split so everyone pays their own card — or pay as one bill below.
        </p>
      )}
    </section>
  );
}

const aav = (on: boolean, seat: string): CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: on ? "2px solid var(--tx)" : "2px solid transparent",
  background: seatColor(seat),
  // The documented Avatar-primitive exception (packages/ui/src/avatar.tsx): a white initial on the
  // vivid fixed seat hues — every hue clears AA behind #fff (avatars.test.ts). This control IS the
  // 44px tap-target avatar (the primitive's discs are 22/30px), so it carries the exception inline.
  color: "#fff",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  display: "grid",
  placeItems: "center",
  opacity: on ? 1 : 0.5,
  cursor: "pointer",
});
