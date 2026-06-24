"use client";
import { useCallback, useState, useTransition, type CSSProperties } from "react";
import { getStaffOrders, type StaffOrder, type StaffOrderLine } from "@/lib/refunds";
import { RefundActionSheet } from "./RefundActionSheet";

/**
 * Manager orders & refunds board (S4.3b). Lists recent paid orders; expand to lines; refund a line
 * (money-OUT) via the RefundActionSheet (reason + self-PIN). Server-authoritative throughout — the board
 * only displays; the refund amount + PI are re-derived server-side. Refreshes from getStaffOrders after a
 * refund so a refunded line + a fully-refunded order's status reflect immediately (no client state-math).
 */
export function StaffOrdersBoard({ initial }: { initial: StaffOrder[] }) {
  const [orders, setOrders] = useState(initial);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [refunding, setRefunding] = useState<{ order: StaffOrder; line: StaffOrderLine } | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        setOrders(await getStaffOrders());
      } catch (e) {
        console.error("[StaffOrdersBoard] refresh failed", e);
      }
    });
  }, []);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (orders.length === 0) return <p style={{ color: "var(--t2)" }}>No paid orders yet.</p>;

  return (
    <>
      <ul
        role="list"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}
      >
        {orders.map((o) => {
          const isOpen = open.has(o.id);
          const refunded = o.status === "refunded";
          return (
            <li key={o.id} className="card" style={{ padding: 14 }}>
              <button
                type="button"
                onClick={() => toggle(o.id)}
                aria-expanded={isOpen}
                style={orderHead}
              >
                <span style={{ display: "grid", gap: 2, textAlign: "left" }}>
                  <span style={{ fontWeight: 700 }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: "var(--t2)" }}>
                    {new Date(o.createdAt).toLocaleString()} · {o.tender}
                  </span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {refunded && <span style={refundedTag}>Refunded</span>}
                  <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    ${(o.totalCents / 100).toFixed(2)}
                  </span>
                  <span aria-hidden style={{ color: "var(--t2)" }}>
                    {isOpen ? "▲" : "▼"}
                  </span>
                </span>
              </button>

              {isOpen && (
                <ul role="list" style={lineList}>
                  {o.isSplit && (
                    <li style={{ fontSize: 12, color: "var(--t2)", padding: "6px 0" }}>
                      Split-tender order — refund via the Stripe dashboard (per-payer cards).
                    </li>
                  )}
                  {o.lines.map((l) => (
                    <li key={l.id} style={lineRow}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span aria-hidden style={{ fontWeight: 700, color: "var(--ac-strong)" }}>
                          {l.qty}×
                        </span>{" "}
                        {l.name}
                        <span style={{ color: "var(--t2)" }}>
                          {" "}
                          · ${((l.unitPriceCents * l.qty + l.taxCents) / 100).toFixed(2)}
                        </span>
                      </span>
                      {l.refunded ? (
                        <span style={refundedTag}>Refunded</span>
                      ) : (
                        !o.isSplit &&
                        o.status === "paid" && (
                          <button
                            type="button"
                            onClick={() => setRefunding({ order: o, line: l })}
                            style={refundBtn}
                          >
                            Refund
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {refunding && (
        <RefundActionSheet
          line={refunding.line}
          orderLabel={refunding.order.label}
          onClose={() => setRefunding(null)}
          onDone={() => {
            setRefunding(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

const orderHead: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  minHeight: 44,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "inherit",
  padding: 0,
};
const lineList: CSSProperties = {
  listStyle: "none",
  margin: "10px 0 0",
  padding: "10px 0 0",
  borderTop: "1px solid var(--bd)",
  display: "grid",
  gap: 8,
};
const lineRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontSize: 14 };
const refundBtn: CSSProperties = {
  flex: "none",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
const refundedTag: CSSProperties = {
  flex: "none",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--t2)",
};
