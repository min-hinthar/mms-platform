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
/**
 * What this section says when a frozen tap arrives — naming the control, never the lock's holder.
 *
 * ⚠️ An earlier draft echoed Checkout's `freezeNotice` through a `frozenNote` prop whose fallback
 * read "Someone’s checking out". That fallback is reachable in exactly one state — `frozen` true
 * with `frozenNote` null, i.e. the viewer's OWN in-flight `create-intent` — so it blamed a peer in
 * the one window where the code has established the holder is the reader (the M116
 * fabricated-diagnosis class). Echoing the bar's exact string is inert besides: setting the live
 * region to the value it already holds changes nothing and announces nothing.
 */
const FROZEN_NOTE = "Item assignments are locked while a checkout finishes.";

export function SplitSection({
  cartId,
  items,
  totalCents,
  ctx,
  onChanged,
  onStatus,
  frozen,
}: {
  cartId: string;
  items: CartItem[];
  totalCents: number; // server-authoritative grand total (from getCartTotals via the cart view)
  ctx: SplitContext;
  onChanged: () => void; // re-sync the lines after an assignment (parent re-fetches the view)
  onStatus: (msg: string) => void; // announce through the parent's single live region (a11y)
  /** T9 — Checkout's `editsFrozen` (the RAW `locked`, the same predicate `assignLine` refuses on).
   *  Reassignment is provenance, not money, but it is still a cart mutation the server will refuse
   *  while a checkout holds the lock — so the avatars must not present themselves as live. Only
   *  REASSIGNMENT is gated: the Evenly/By-person toggle is pure client-side presentation and stays
   *  usable, and "Split & pay separately" carries its own refusal (`openSettlement` throws
   *  "Payments are already in progress", surfaced by `beginSettle`'s catch). */
  frozen: boolean;
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
    // The gate, not the announcement: `aria-disabled` leaves the control focusable (deliberately —
    // WCAG 2.4.3), so a keyboard Enter still lands here.
    if (frozen) {
      onStatus(FROZEN_NOTE);
      return;
    }
    setBusyLine(lineId);
    try {
      await assignLine(lineId, seat);
      onStatus(`Assigned ${lineName} to ${who}`);
      onChanged();
    } catch {
      // T9 — this catch used to be EMPTY. `assignLine` refuses by THROWING (locked, settling, or
      // "only the host can reassign someone else’s item"), so swallowing it took the tap, left the
      // avatar looking unchanged, and said nothing — J4 clause (b) exactly.
      //
      // ⚠️ BUT DO NOT SURFACE `e.message`. `lib/cart.ts` is `"use server"`, and its own docblock
      // says why it returns discriminated results rather than throwing: **Next redacts thrown
      // Server Action messages in production.** So echoing the error would announce Next's
      // redaction string into the checkout's one live region — loud and wrong, which is a
      // different failure from the silent one it replaced, not a fix for it. `assignLine` gives
      // this caller no reason code to branch on either.
      // (`beginSettle` below still echoes `e.message` from `split.ts`, which is `"use server"` too
      // — same defect, pre-existing, filed rather than widened into this PR.)
      //
      // ⚠️ AND DO NOT CLAIM "NOTHING CHANGED" (Codex round 4 on #247). A thrown Server Action is an
      // UNCERTAIN outcome, not a failed one: the `by_seat` update can commit and the response be
      // lost, and on that same dead connection the realtime update is missed too — so the avatar
      // and the shares beside it would keep showing the old owner while this sentence asserted they
      // were right. `RewardField`'s apply catch already had this rule ("a throw is not proof the
      // write didn't land"); it was not carried here. Say what is certain and RE-READ.
      onStatus("Couldn’t confirm that reassignment — checking with the server.");
      onChanged();
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
                          // `aria-disabled`, never native `disabled`: a diner mid-assignment when a
                          // peer starts checking out must keep focus and hear why, not lose the
                          // control out of the tab order (WCAG 2.4.3). `busyLine` stays native —
                          // that is our own in-flight write, measured in milliseconds.
                          aria-disabled={frozen || undefined}
                          disabled={busyLine === line.id}
                          onClick={() => reassign(line.id, m.seat, line.name, who)}
                          style={aav(on, m.seat, frozen)}
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
            {frozen
              ? // Honest while frozen: the shares below are still true and still worth reading —
                // only the reassignment is unavailable. Don't invite a tap the server will refuse.
                `${FROZEN_NOTE} The shares below still apply.`
              : "Tap a guest to assign your items; the host can assign any."}
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
        Each person’s share of the order, including tax. Tip is added per person at their pay step.
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

const aav = (on: boolean, seat: string, frozen = false): CSSProperties => ({
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
  // ⚠️ A FLAT FROZEN OPACITY ERASED THE SELECTION IT CLAIMED TO KEEP. `opacity` composites the
  // WHOLE element — the `2px solid var(--tx)` ring included — and an earlier draft set both the
  // selected and unselected avatars to 0.4, so the one cue that separated them (1 vs 0.5) was gone
  // and the ring rendered at 40% besides. Which seat owns a line is information the diner still
  // needs while frozen, so the freeze scales the pair DOWN while preserving the gap between them.
  opacity: frozen ? (on ? 0.75 : 0.35) : on ? 1 : 0.5,
  cursor: frozen ? "default" : "pointer",
});
