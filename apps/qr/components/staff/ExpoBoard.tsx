"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { getExpoQueue, setTogoStatus } from "@/lib/expo";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { useWakeLock } from "@/lib/useWakeLock";
import { formatSlotLong } from "@/lib/pickupTime";
import type { ExpoLine, ExpoQueue, ExpoTicket } from "@/lib/expo-types";
import { RelativeTime } from "./RelativeTime";
import { StaggerList } from "./StaggerList";
import { EmptyState } from "@mms/ui";

/**
 * Expo / bagging station (S4.3a, W3a) — the takeaway counterpart to the KDS. Server-rendered initial
 * queue, kept live by Postgres-Changes (useFloorRealtime watches qr_orders → re-fetch the server-
 * authoritative getExpoQueue; never client state-math) with a 5s poll BACKSTOP. Re-fetches debounced.
 * ONE polite live region (bump error takes precedence over the count). Two-stage bump: "Bagged & ready"
 * (preparing→ready, lights the diner's /track AND the order-ready board) then "Picked up" (ready→
 * picked_up, drops off both). W3a: the queue arrives sorted by EFFECTIVE DUE TIME with "Here now"
 * pinned; pickup/scango bags headline the first name + short code. K10: an expired staff cookie or a
 * locked console redirects honestly instead of wearing "Reconnecting…" forever.
 */
export function ExpoBoard({ initial }: { initial: ExpoQueue }) {
  const [snap, setSnap] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useWakeLock(); // O-F: the bagging tablet is always-on too

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await getExpoQueue();
      if (!res.ok) {
        window.location.assign(res.reason === "locked" ? "/staff/lock" : "/staff/login");
        return;
      }
      setSnap(res.queue);
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

  // Focus catch-all (WCAG 2.4.3; the KdsBoard pattern): a picked-up bump drops the card — restore focus
  // to the heading only when it fell to <body> from a real control (edge-triggered; poll-safe).
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set at interaction time too (onFocusCapture on the root) — closes the blind window where the FIRST
  // bump after load lands before any snapshot has sampled focus (Codex P2).
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    if (document.activeElement === document.body && hadRealFocus.current)
      headingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [snap]);

  const tickets = snap.tickets;
  const count = tickets.length;

  return (
    <section aria-labelledby="expo-h" onFocusCapture={markFocus}>
      <div style={headRow}>
        <h2 id="expo-h" ref={headingRef} tabIndex={-1} style={{ fontSize: 16, margin: 0 }}>
          Takeaway bags
        </h2>
        <p
          role="status"
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
        <EmptyState
          title="Nothing to bag"
          subtitle="Bags appear here once a to-go or grocery order is paid."
          icon="🥡"
        />
      ) : (
        <StaggerList
          items={tickets}
          getKey={(t) => t.orderId}
          ariaLabel="Bags waiting"
          style={grid}
          renderItem={(t) => (
            <ExpoCard ticket={t} serverNow={snap.serverNow} onBumped={refresh} onError={setErr} />
          )}
        />
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
  onBumped: () => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const to = ticket.status === "preparing" ? "ready" : "picked_up";
  const label = ticket.status === "preparing" ? "Bagged & ready" : "Picked up";

  // K2 + W3e call-out identity: a dine-in to-go bag calls out its real table; a pickup/scango bag
  // headlines the first name captured at checkout (short code as the collision-safe suffix), falling
  // back to the short code alone when the diner skipped the name — expo always has something to call.
  const callOut =
    ticket.tableNumber != null
      ? `Table ${ticket.tableNumber}`
      : ticket.customerName
        ? ticket.customerName
        : `#${ticket.shortCode}`;

  const bump = () => {
    onError(null);
    startTransition(async () => {
      try {
        const res = await setTogoStatus({ orderId: ticket.orderId, to });
        if (!res.ok) onError(res.error);
        else await onBumped(); // pending covers the refetch — no stale-label flicker
      } catch {
        onError(`Couldn’t update the bag for ${callOut} — try again.`);
      }
    });
  };

  return (
    <article className="card card-textured" style={cardStyle} aria-label={`Bag for ${callOut}`}>
      <header style={cardHead}>
        <span style={tableLabel}>
          {callOut}
          {ticket.tableNumber == null && ticket.customerName && (
            <span style={codeSuffix}> #{ticket.shortCode}</span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {/* J5: the diner tapped "I'm here" on /track (qr_orders.arrived_at) — a waiting HUMAN
              outranks bag age; hand this one over first. Rendered only from the real stamp. */}
          {ticket.arrivedAt && <span style={hereTag}>Here now</span>}
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
        aria-label={`${label} — bag for ${callOut}`}
        className="staff-btn"
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
        {/* W3b: the allergy/request note rides to the bag too — pack the sauce separately, etc. */}
        {line.notes && <span style={noteInline}>“{line.notes}”</span>}
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
const codeSuffix: CSSProperties = { fontWeight: 700, fontSize: 12, color: "var(--t2)" };
// The note is safety-adjacent — full text color (not muted), quoted so it reads as the diner's words.
const noteInline: CSSProperties = { display: "block", fontWeight: 700, color: "var(--tx)" };
const readyTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ok)",
};
// "Here now" (J5) — accent, not success-green: it flags a waiting person, not a completed step.
const hereTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ac-strong)",
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
  borderRadius: "var(--r-sm)",
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
