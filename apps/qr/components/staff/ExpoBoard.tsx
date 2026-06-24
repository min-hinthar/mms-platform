"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { getExpoQueue, setTogoStatus } from "@/lib/expo";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { formatSlotLong } from "@/lib/pickupTime";
import type { ExpoLine, ExpoQueue, ExpoTicket } from "@/lib/expo-types";
import { RelativeTime } from "./RelativeTime";

/**
 * Expo / bagging station (S4.3a) — the takeaway counterpart to the KDS. Server-rendered initial queue,
 * kept live by Postgres-Changes (useFloorRealtime watches qr_orders → re-fetch the server-authoritative
 * getExpoQueue; never client state-math) with a 5s poll BACKSTOP. Re-fetches debounced. ONE polite live
 * region (bump error takes precedence over the count). Two-stage bump: "Bagged & ready" (preparing→ready,
 * lights the diner's /track) then "Picked up" (ready→picked_up, drops off the board).
 */
export function ExpoBoard({ initial }: { initial: ExpoQueue }) {
  const [snap, setSnap] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setSnap(await getExpoQueue());
      setErr(null);
      fails.current = 0;
      setStale(false);
    } catch (e) {
      fails.current += 1;
      if (fails.current >= 2) setStale(true);
      console.error("[ExpoBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => {
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  const tickets = snap.tickets;
  const count = tickets.length;

  return (
    <section aria-labelledby="expo-h">
      <div style={headRow}>
        <h2 id="expo-h" style={{ fontSize: 16, margin: 0 }}>
          Takeaway bags
        </h2>
        <p
          role="status"
          aria-live="polite"
          style={{ margin: 0, fontSize: 13, color: err || stale ? "var(--warn)" : "var(--t2)" }}
        >
          {err ??
            (stale
              ? "Reconnecting…"
              : count === 0
                ? "No bags waiting"
                : `${count} bag${count === 1 ? "" : "s"} waiting`)}
        </p>
      </div>

      {count === 0 ? (
        <p style={empty}>Bags appear here once a to-go or grocery order is paid. 🥡</p>
      ) : (
        <ul role="list" style={grid}>
          {tickets.map((t) => (
            <li key={t.orderId}>
              <ExpoCard ticket={t} serverNow={snap.serverNow} onBumped={refresh} onError={setErr} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExpoCard({
  ticket,
  serverNow,
  onBumped,
  onError,
}: {
  ticket: ExpoTicket;
  serverNow: string;
  onBumped: () => void;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const to = ticket.status === "preparing" ? "ready" : "picked_up";
  const label = ticket.status === "preparing" ? "Bagged & ready" : "Picked up";

  const bump = () => {
    onError(null);
    startTransition(async () => {
      try {
        const res = await setTogoStatus({ orderId: ticket.orderId, to });
        if (!res.ok) onError(res.error);
        else onBumped();
      } catch {
        onError(`Couldn’t update the bag for ${ticket.label} — try again.`);
      }
    });
  };

  return (
    <article className="card" style={cardStyle} aria-label={`Bag for ${ticket.label}`}>
      <header style={cardHead}>
        <span style={tableLabel}>{ticket.label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {ticket.status === "ready" && <span style={readyTag}>Ready</span>}
          <span style={{ fontSize: 12, color: "var(--t2)" }}>
            <RelativeTime iso={ticket.createdAt} serverNow={serverNow} />
          </span>
        </span>
      </header>
      {ticket.pickupSlot && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--t2)" }}>
          Pickup {formatSlotLong(ticket.pickupSlot)}
        </p>
      )}
      <ul role="list" style={lineList}>
        {ticket.lines.map((l) => (
          <ExpoLineRow key={l.id} line={l} />
        ))}
      </ul>
      <button
        type="button"
        onClick={bump}
        disabled={pending}
        aria-label={`${label} — bag for ${ticket.label}`}
        style={{ ...bumpBtn, ...(ticket.status === "preparing" ? readyBtn : pickedBtn) }}
      >
        {pending ? "…" : label}
      </button>
    </article>
  );
}

function ExpoLineRow({ line }: { line: ExpoLine }) {
  return (
    <li style={lineRow}>
      <span aria-hidden="true" style={qtyBadge}>
        {line.qty}×
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {line.name}
        {line.modifiers.length > 0 && (
          <span style={{ color: "var(--t2)" }}> · {line.modifiers.join(" · ")}</span>
        )}
      </span>
      <span style={destTag}>{line.fulfillment === "grocery" ? "Grocery" : "To-go"}</span>
    </li>
  );
}

const headRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s4)",
};
const empty: CSSProperties = { padding: "var(--s6)", color: "var(--t2)" };
const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
};
const cardStyle: CSSProperties = { padding: "var(--s4)", display: "grid", gap: "var(--s3)" };
const cardHead: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s3)",
};
const tableLabel: CSSProperties = { fontWeight: 700, fontSize: 16 };
const readyTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ok)",
};
const lineList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s2)",
};
const lineRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--s2)",
  fontSize: 14,
};
const qtyBadge: CSSProperties = { fontWeight: 800, color: "var(--ac-strong)", flex: "none" };
const destTag: CSSProperties = {
  flex: "none",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--t2)",
};
const bumpBtn: CSSProperties = {
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--bd)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const readyBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const pickedBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
