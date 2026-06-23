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
import { StaffLineEditor } from "./StaffLineEditor";
import { CashSettleButton } from "./CashSettleButton";
import { MergeTableButton } from "./MergeTableButton";
import { OpenTabButton } from "./OpenTabButton";
import { CloseSecureTabButton } from "./CloseSecureTabButton";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const MODE_LABEL: Record<TableDetail["mode"], string> = {
  dinein: "Dine-in",
  scango: "Scan & Go",
  pickup: "Pickup",
};

/**
 * Per-table drill-down (S1.2 read · S1.3 staff write). Shows the party + the table's order, and lets
 * staff edit it FOR a guest (qty steppers, add items) and settle it in CASH. Kept live by the
 * Postgres-Changes hook scoped to this session; if the table is cleared/closed (here or elsewhere) the
 * re-fetch returns null and we return to the floor rather than showing a stale order. Writes are
 * disabled while a payment is in flight (and the server refuses regardless); the cart goes read-only
 * once settled (cartId null → paid total shown).
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
  const [writeError, setWriteError] = useState<string | null>(null);
  const [stale, setStale] = useState(false); // shown after repeated poll failures (S9)
  const fails = useRef(0);
  const inFlight = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderHeadingRef = useRef<HTMLHeadingElement>(null);
  const prevLineCount = useRef(initial.lines.length);
  const prevTab = useRef(initial.tab);

  // Staff can write while there's an open cart and no payment in flight; once settled (cartId null) or
  // mid-payment the order goes read-only. The server enforces this too — this is just the affordance.
  const canWrite = detail.cartId != null && !detail.paymentInFlight;

  // When a line is removed (the list shrinks), the editor row unmounts — move focus to the order
  // heading so keyboard/SR focus isn't dropped to <body> (WCAG 2.4.3; parity with Checkout.tsx).
  useEffect(() => {
    if (detail.lines.length < prevLineCount.current) orderHeadingRef.current?.focus();
    prevLineCount.current = detail.lines.length;
  }, [detail.lines.length]);

  // When a tab is opened here, the OpenTabButton (which held focus) unmounts as `detail.tab` flips —
  // move focus to the order heading so it isn't dropped to <body> (WCAG 2.4.3; parity with the line-
  // removal handler above). Only on none→tab, and only if focus actually fell to <body>, so a tab
  // opened elsewhere (the diner's phone, another staff device) doesn't yank this user's focus.
  useEffect(() => {
    if (
      prevTab.current === "none" &&
      detail.tab !== "none" &&
      document.activeElement === document.body
    )
      orderHeadingRef.current?.focus();
    prevTab.current = detail.tab;
  }, [detail.tab]);

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
      fails.current = 0;
      setStale(false);
    } catch (e) {
      fails.current += 1;
      if (fails.current >= 2) setStale(true); // S2-audit S9: signal a frozen detail view
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
            {detail.tab !== "none" && (
              <span style={tabChip}>
                <span aria-hidden>{detail.tab === "secure" ? "✓" : "●"}</span>{" "}
                {detail.tab === "secure" ? "Tab secured · card on file" : "Tab open"}
              </span>
            )}
          </div>
          <p style={sub}>
            {MODE_LABEL[detail.mode]} · {detail.members.length}{" "}
            {detail.members.length === 1 ? "guest" : "guests"} ·{" "}
            {detail.tab !== "none" && detail.tabOpenedAt ? (
              <>
                tab opened <RelativeTime iso={detail.tabOpenedAt} serverNow={detail.serverNow} />
              </>
            ) : (
              <>
                last activity{" "}
                <RelativeTime iso={detail.lastActivityAt} serverNow={detail.serverNow} />
              </>
            )}
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
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--s4)",
          }}
        >
          <h2
            id="order-h"
            ref={orderHeadingRef}
            tabIndex={-1}
            style={{ ...sectionH, outline: "none" }}
          >
            Order so far
          </h2>
          {canWrite && (
            <Link href={`/staff/table/${sessionId}/add`} style={addLink}>
              + Add items
            </Link>
          )}
        </div>

        {detail.lines.length === 0 ? (
          <p style={muted}>Nothing in the cart yet.</p>
        ) : canWrite ? (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {detail.lines.map((l) => (
              <StaffLineEditor
                key={l.id}
                sessionId={sessionId}
                line={l}
                disabled={false}
                onError={setWriteError}
              />
            ))}
          </ul>
        ) : (
          // Read-only (settled, or a payment in flight): show the lines without the steppers. A
          // voided/comped line is struck + badged so it reads honestly beside the (excluding) subtotal.
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {detail.lines.map((l) => {
              const off = l.state === "voided" || l.comped;
              return (
                <li key={l.id} style={lineRow}>
                  <span style={{ minWidth: 0, opacity: l.state === "voided" ? 0.55 : 1 }}>
                    <span style={{ fontWeight: 600 }}>{l.qty}×</span> {l.name}
                    {l.state === "voided" && <span style={offBadge}> · Voided</span>}
                    {l.comped && <span style={offBadge}> · Comped</span>}
                    {l.bySeatName && (
                      <span style={{ color: "var(--t3)", fontSize: 12 }}> · {l.bySeatName}</span>
                    )}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      textDecoration: off ? "line-through" : "none",
                      color: off ? "var(--t3)" : "inherit",
                    }}
                  >
                    {fmt(l.unitPriceCents * l.qty)}
                  </span>
                </li>
              );
            })}
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
          Running pre-tax subtotal — tax and the service charge are added at settle.
        </p>
        {/* One shared live region for staff line-edit feedback + the stale-poll signal (S2-audit S9): a
            frozen detail view mustn't look live. The write error takes precedence over the reconnect note. */}
        <p
          role="status"
          aria-live="polite"
          style={{
            ...muted,
            marginTop: 6,
            fontSize: 12.5,
            minHeight: writeError || stale ? 16 : 0,
            color: writeError || stale ? "var(--warn)" : "var(--t3)",
          }}
        >
          {writeError ?? (stale ? "Reconnecting — showing the last known order" : null)}
        </p>
      </section>

      {/* Open a tab (S3.1) — when there's an open cart, no tab yet, and no payment in flight. Marks the
          table so it settles once at close; moves no money. The diner can also open one from /cart. */}
      {canWrite && detail.tab === "none" && (
        <section style={{ marginTop: "var(--s4)" }} aria-label="Open a tab for this table">
          <OpenTabButton cartId={detail.cartId!} />
        </section>
      )}

      {/* Settle in cash — when there's an open order with items and no payment in flight. On a trust
          tab this IS the tab close (re-framed copy); the money path is the same cash reconcile. */}
      {canWrite && detail.itemCount > 0 && detail.settleTotalCents != null && (
        <section style={{ marginTop: "var(--s4)" }} aria-label="Settle this table">
          {/* Secure tab (S3.2): the off-session charge on the card on file is the primary close; cash
              stays available as a fallback below. */}
          {detail.tab === "secure" && (
            <div style={{ marginBottom: "var(--s3)" }}>
              <CloseSecureTabButton sessionId={sessionId} totalCents={detail.settleTotalCents} />
            </div>
          )}
          <CashSettleButton
            sessionId={sessionId}
            totalCents={detail.settleTotalCents}
            isTab={detail.tab !== "none"}
          />
          {detail.tab === "trust" && (
            <p style={{ ...muted, marginTop: 8, fontSize: 12.5 }}>
              Paying by card? The guest closes the tab from their phone — it settles when that
              payment lands.
            </p>
          )}
        </section>
      )}
      {detail.paymentInFlight && (
        <p style={{ ...muted, marginTop: "var(--s4)", fontSize: 13 }}>
          A guest is paying on their phone — editing and{" "}
          {detail.tab !== "none" ? "tab close" : "cash settle"} are paused until that finishes.
        </p>
      )}

      {/* Soft convergence (S1.4): fold a double-order into another table. Same gate as a write (open cart,
          not mid-payment) and only when there's something to move. */}
      {canWrite && detail.itemCount > 0 && (
        <section style={{ marginTop: "var(--s4)" }} aria-label="Merge this table">
          <MergeTableButton
            sourceSessionId={sessionId}
            sourceLabel={detail.label}
            sourceItemCount={detail.itemCount}
          />
        </section>
      )}

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

const addLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};

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
const tabChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid color-mix(in oklab, var(--ac) 35%, var(--bd))",
  background: "color-mix(in oklab, var(--ac) 10%, var(--cd))",
  color: "var(--ac-strong)",
  fontSize: 12.5,
  fontWeight: 800,
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
const offBadge: CSSProperties = { color: "var(--t3)", fontSize: 12, fontWeight: 700 };
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
