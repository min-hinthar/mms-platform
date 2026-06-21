"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTableDetail } from "@/lib/floor";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import type { TableDetail } from "@/lib/floor-types";
import { FloorStatusChip } from "./FloorStatusChip";
import { RelativeTime } from "./RelativeTime";
import { ClearTableButton } from "./ClearTableButton";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const MODE_LABEL: Record<TableDetail["mode"], string> = {
  dinein: "Dine-in",
  scango: "Scan & Go",
  pickup: "Pickup",
};

/**
 * Read-only per-table drill-down (S1.2) — what they've ordered, who's at the table, and the turnover
 * clear-table. Kept live by the same Postgres-Changes hook scoped to this session; if the table is
 * cleared/closed (here or elsewhere) the re-fetch returns null and we return to the floor rather than
 * showing a stale order.
 */
export function FloorDetailLive({
  initial,
  sessionId,
}: {
  initial: TableDetail;
  sessionId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TableDetail>(initial);
  const inFlight = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await getTableDetail(sessionId);
      if (next) setDetail(next);
      else {
        // Closed/cleared — the detail no longer exists; go back to the floor.
        router.replace("/staff");
        router.refresh();
      }
    } catch (e) {
      console.error("[FloorDetailLive] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router]);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange, sessionId, detail.cartId);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => {
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  return (
    <main style={wrap}>
      <Link href="/staff" style={back}>
        ← Floor
      </Link>

      <header style={header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={h1}>Table {detail.label}</h1>
            <FloorStatusChip status={detail.status} />
          </div>
          <p style={sub}>
            {MODE_LABEL[detail.mode]} · {detail.members.length}{" "}
            {detail.members.length === 1 ? "guest" : "guests"} · last activity{" "}
            <RelativeTime iso={detail.lastActivityAt} serverNow={detail.serverNow} />
          </p>
        </div>
      </header>

      {/* Party */}
      <section className="card" style={sectionCard} aria-labelledby="party-h">
        <h2 id="party-h" style={sectionH}>
          Party
        </h2>
        {detail.members.length === 0 ? (
          <p style={muted}>No guests yet.</p>
        ) : (
          <ul role="list" style={chipList} aria-label="Guests at this table">
            {detail.members.map((m) => (
              <li key={m.seatId} style={guestChip}>
                {m.name}
                {m.isHost && <span style={{ color: "var(--ac)", fontSize: 12 }}> · host</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Order so far */}
      <section className="card" style={sectionCard} aria-labelledby="order-h">
        <h2 id="order-h" style={sectionH}>
          Order so far
        </h2>
        {detail.lines.length === 0 ? (
          <p style={muted}>Nothing in the cart yet.</p>
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {detail.lines.map((l) => (
              <li key={l.id} style={lineRow}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{l.qty}×</span> {l.name}
                  {l.bySeatName && (
                    <span style={{ color: "var(--t3)", fontSize: 12 }}> · {l.bySeatName}</span>
                  )}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmt(l.unitPriceCents * l.qty)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div style={totalRow}>
          {detail.itemCount > 0 && (
            <span>
              <span style={{ fontWeight: 700 }}>{fmt(detail.runningSubtotalCents)}</span>{" "}
              <span style={{ color: "var(--t2)", fontSize: 13 }}>
                subtotal so far · {detail.itemCount} {detail.itemCount === 1 ? "item" : "items"}
              </span>
            </span>
          )}
          {detail.paidTotalCents != null && (
            <span style={{ color: "var(--ok)", fontWeight: 700 }}>
              {fmt(detail.paidTotalCents)} paid
            </span>
          )}
        </div>
        <p style={{ ...muted, marginTop: 8, fontSize: 12 }}>
          Running pre-tax subtotal — tax, service, and tip are added at checkout.
        </p>
      </section>

      <section style={{ marginTop: "var(--s5)" }}>
        <ClearTableButton
          sessionId={sessionId}
          label={detail.label}
          paymentInFlight={detail.paymentInFlight}
        />
      </section>
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "var(--s6)" };
const back: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  marginBottom: "var(--s3)",
};
const header: CSSProperties = { marginBottom: "var(--s5)" };
const h1: CSSProperties = { fontSize: 24, margin: 0 };
const sub: CSSProperties = { color: "var(--t2)", fontSize: 14, margin: "6px 0 0" };
const sectionCard: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const sectionH: CSSProperties = { fontSize: 13, margin: "0 0 var(--s3)", color: "var(--t2)" };
const muted: CSSProperties = { margin: 0, color: "var(--t3)", fontSize: 14 };
const chipList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--s3)",
};
const guestChip: CSSProperties = {
  padding: "4px 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  fontSize: 14,
};
const lineRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  padding: "8px 0",
  borderTop: "1px solid var(--bd)",
  fontSize: 14,
};
const totalRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
  marginTop: "var(--s3)",
  paddingTop: "var(--s3)",
  borderTop: "2px solid var(--bd)",
};
