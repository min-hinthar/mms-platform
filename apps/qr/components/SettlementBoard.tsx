"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import type { SplitContext, SettlementShare } from "@/lib/split";
import { getSettlement, abortSettlement } from "@/lib/split";
import { useSettlementRealtime } from "@/lib/realtime";
import { seatColor, seatInitial } from "@/lib/avatars";
import { SharePay } from "./SharePay";

/**
 * Live split-tender settlement board (M3·P3.3b). Once the host opens a split, the cart is frozen and
 * every member pays their OWN share here — this shows the table-wide progress live (each share flips
 * pending → authorized → captured via `useSettlementRealtime`), surfaces the viewer's own SharePay, and
 * lets the host cancel. When every share is captured the order is fulfilled and everyone is sent to the
 * receipt. Amounts are server-derived (getSettlement); no client money math.
 */
export function SettlementBoard({
  cartId,
  accessToken,
  ctx,
  onStatus,
  onChanged,
}: {
  cartId: string;
  accessToken: string;
  ctx: SplitContext;
  onStatus: (msg: string) => void;
  onChanged: () => void; // re-sync the cart view (e.g. after an abort lifts the freeze)
}) {
  const [shares, setShares] = useState<SettlementShare[]>([]);
  const [loaded, setLoaded] = useState(false); // first getSettlement resolved → show the board
  const [loadError, setLoadError] = useState(false); // first load failed → offer a retry
  const [aborting, startAbort] = useTransition();
  const redirected = useRef(false);
  const nameOf = useCallback(
    (seat: string) => ctx.members.find((m) => m.seat === seat)?.name ?? "Guest",
    [ctx.members],
  );

  const load = useCallback(() => {
    void getSettlement(cartId)
      .then((rows) => {
        setShares(rows);
        setLoaded(true);
        setLoadError(false);
        // All shares captured → the order is being fulfilled; move everyone to the receipt (once).
        if (rows.length > 0 && rows.every((s) => s.status === "captured") && !redirected.current) {
          redirected.current = true;
          window.location.assign(`/track?cart=${encodeURIComponent(cartId)}`);
        }
      })
      .catch(() => {
        // A post-fulfillment 403 (cart flipped to paid) after we've loaded is the expected end state —
        // the redirect / realtime carries the diner to /track, so swallow. A FIRST-load failure leaves
        // no data to show, so flag it (the render offers a retry rather than a permanent empty board).
        setLoadError(true);
      });
  }, [cartId]);

  useEffect(() => {
    load();
  }, [load]);
  useSettlementRealtime(cartId, accessToken, true, load);

  // Poll backstop (payment-critical screen): re-fetch every 5s while settling so progress shows even if
  // Realtime is down or the anon token never arrives (the subscription no-ops on an empty token). Stops
  // on unmount (the all-captured redirect / a host cancel returning to review both unmount this).
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const paidCents = shares
    .filter((s) => s.status === "authorized" || s.status === "captured")
    .reduce((a, s) => a + s.amountCents, 0);
  const totalCents = shares.reduce((a, s) => a + s.amountCents, 0);
  const allIn =
    shares.length > 0 && shares.every((s) => s.status !== "pending" && s.status !== "failed");

  function cancel() {
    startAbort(async () => {
      try {
        await abortSettlement(cartId);
        onStatus("Split canceled — back to one bill.");
        onChanged();
      } catch (e) {
        // Host abort lost the race to a completing capture (or not permitted) — surface it honestly.
        onStatus(e instanceof Error ? e.message : "Couldn’t cancel the split.");
        load();
      }
    });
  }

  return (
    <section aria-labelledby="settle-h" style={{ marginTop: 18 }}>
      <h2 id="settle-h" style={{ fontSize: 18, margin: "0 0 4px" }}>
        Everyone pays their share
      </h2>
      <p style={{ fontSize: 11.5, color: "var(--t3)", margin: "0 0 12px", lineHeight: 1.5 }}>
        No one’s card is charged until everyone has paid; then the whole order is captured together.
      </p>

      {!loaded ? (
        loadError ? (
          <p role="alert" style={{ fontSize: 13, color: "var(--warn)" }}>
            Couldn’t load the split.{" "}
            <button
              type="button"
              onClick={load}
              style={{
                minHeight: 44,
                padding: "0 4px",
                background: "none",
                border: "none",
                color: "var(--warn)",
                fontWeight: 800,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "var(--t2)" }}>Loading the split…</p>
        )
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--t2)", margin: "0 0 12px" }}>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>
              ${(paidCents / 100).toFixed(2)}
            </strong>{" "}
            of ${(totalCents / 100).toFixed(2)} authorized
            {allIn ? " — finishing up…" : ""}
          </p>

          <ul
            role="list"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}
          >
            {shares.map((s) => {
              const isMe = s.seat === ctx.mySeat;
              const name = isMe ? "You" : nameOf(s.seat);
              const canPay = isMe && (s.status === "pending" || s.status === "failed");
              return (
                <li key={s.seat} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span aria-hidden style={{ ...avatar, background: seatColor(s.seat) }}>
                      {seatInitial(nameOf(s.seat))}
                    </span>
                    <span style={{ flex: 1, fontWeight: 700 }}>{name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      ${(s.amountCents / 100).toFixed(2)}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  {canPay && <SharePay cartId={cartId} onAuthorized={load} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {ctx.myRole === "host" && (
        <button
          type="button"
          onClick={cancel}
          disabled={aborting}
          style={{
            width: "100%",
            marginTop: 14,
            minHeight: 44,
            borderRadius: 12,
            border: "1.5px solid var(--bd)",
            background: "transparent",
            color: "var(--t2)",
            fontWeight: 700,
            cursor: aborting ? "default" : "pointer",
          }}
        >
          {aborting ? "Canceling…" : "Cancel split — pay as one bill"}
        </button>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: SettlementShare["status"] }) {
  const map: Record<SettlementShare["status"], { label: string; color: string; bg: string }> = {
    pending: { label: "Waiting", color: "var(--t3)", bg: "var(--sf)" },
    authorized: {
      label: "Authorized",
      color: "var(--ac)",
      bg: "color-mix(in oklab, var(--ac) 10%, var(--cd))",
    },
    captured: {
      label: "Paid",
      color: "var(--ac)",
      bg: "color-mix(in oklab, var(--ac) 14%, var(--cd))",
    },
    failed: { label: "Failed", color: "var(--warn)", bg: "var(--warnb)" },
    canceled: { label: "Canceled", color: "var(--t3)", bg: "var(--sf)" },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 800,
        padding: "3px 9px",
        borderRadius: 999,
        color: s.color,
        background: s.bg,
        whiteSpace: "nowrap",
      }}
    >
      {(status === "captured" || status === "authorized") && <span aria-hidden>✓ </span>}
      {s.label}
    </span>
  );
}

const avatar: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
};
