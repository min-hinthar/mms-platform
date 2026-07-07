"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { EmptyState } from "@mms/ui";
import { getStaffOrders, type StaffOrder, type StaffOrderLine } from "@/lib/refunds";
import { RefundActionSheet } from "./RefundActionSheet";
import { StaggerList } from "./StaggerList";

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
  // The last refund's confirmation (the server-authorized amount — may differ from the line estimate when
  // the over-refund cap clamps). One live region for the board (announced once on a successful refund).
  const [confirm, setConfirm] = useState<string | null>(null);
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

  // Refund focus handoff (WCAG 2.4.3): the sheet's cleanup restores focus to the Refund button that
  // opened it — but a successful refund's refresh then swaps that button for the "Refunded" tag,
  // dropping focus to <body>. Stash the order id on success and, once the refreshed list lands, move
  // focus to that order's disclosure header (stable across the swap).
  const refocusOrderId = useRef<string | null>(null);
  useEffect(() => {
    const id = refocusOrderId.current;
    if (!id) return;
    refocusOrderId.current = null;
    if (document.activeElement === document.body)
      document
        .querySelector<HTMLButtonElement>(`[data-order-head="${id}"]`)
        ?.focus({ preventScroll: true });
  }, [orders]);

  if (orders.length === 0)
    return (
      <EmptyState
        title="No paid orders yet"
        subtitle="Recent paid orders land here — expand one to refund a line."
      />
    );

  return (
    <>
      {/* The board's single live region — announces a completed refund's actual amount once. */}
      <p role="status" style={confirmBanner}>
        {confirm}
      </p>
      <StaggerList
        items={orders}
        getKey={(o) => o.id}
        ariaLabel="Recent paid orders"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}
        renderItem={(o) => {
          const isOpen = open.has(o.id);
          const refunded = o.status === "refunded";
          return (
            <div className="card card-textured" style={{ padding: 14 }}>
              <button
                type="button"
                data-order-head={o.id}
                onClick={() => toggle(o.id)}
                aria-expanded={isOpen}
                className="staff-btn"
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
                          {/* The line's refundable value (discounted goods + its share of tax) — the
                              server-derived figure, NOT a per-unit-tax estimate (S4-audit P0-1). */}
                          · ${(l.refundableCents / 100).toFixed(2)}
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
                            className="staff-btn"
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
            </div>
          );
        }}
      />

      {refunding && (
        <RefundActionSheet
          line={refunding.line}
          orderLabel={refunding.order.label}
          onClose={() => setRefunding(null)}
          onDone={(refundedCents?: number) => {
            const orderId = refunding.order.id;
            setRefunding(null);
            if (refundedCents != null) {
              setConfirm(`Refunded $${(refundedCents / 100).toFixed(2)} to the card.`);
              refocusOrderId.current = orderId; // hand focus to the order header once the refresh lands
            }
            refresh();
          }}
        />
      )}
    </>
  );
}

const confirmBanner: CSSProperties = {
  minHeight: 18,
  margin: "0 0 10px",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--ac-strong)",
};
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
  borderRadius: "var(--r-full)",
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
