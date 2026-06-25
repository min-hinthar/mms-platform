"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { bumpLine, getKitchenQueue } from "@/lib/kitchen";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import type { KitchenLine, KitchenQueue, KitchenTicket } from "@/lib/kitchen-types";
import { RelativeTime } from "./RelativeTime";
import { EmptyState } from "@mms/ui";

/**
 * The KDS — kitchen display (S2.1b). Server-rendered initial queue, then kept live by Postgres-Changes
 * (useFloorRealtime watches every qr_cart_items change → re-fetch the server-authoritative
 * getKitchenQueue; never client state-math) with a 5s poll BACKSTOP so a dropped socket can't leave the
 * line staring at a stale board. Re-fetches are debounced so a fire-batch of 5 lines collapses to one
 * fetch. One polite live region announces the ticket count (no per-card chatter). Two-stage bump:
 * Start (fired→in_progress) then Ready (in_progress→served, drops off the board).
 */
export function KdsBoard({ initial }: { initial: KitchenQueue }) {
  const [snap, setSnap] = useState(initial);
  const [err, setErr] = useState<string | null>(null); // one board-level bump-error region (S8)
  const [stale, setStale] = useState(false); // shown after repeated poll failures (S9)
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // coalesce overlapping fetches
    inFlight.current = true;
    try {
      setSnap(await getKitchenQueue());
      setErr(null); // a fresh good snapshot clears a stale bump-error banner (no perma-stuck error)
      fails.current = 0;
      setStale(false);
    } catch (e) {
      // Don't blank the board on a transient fetch error — keep the last good queue; the poll + the
      // realtime self-heal recover. After 2 consecutive failures, tell the line it's working a stale
      // board (S2-audit S9 — a frozen queue mustn't look live).
      fails.current += 1;
      if (fails.current >= 2) setStale(true);
      console.error("[KdsBoard] refresh failed", e);
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
    <section aria-labelledby="kds-h">
      <div style={headRow}>
        <h2 id="kds-h" style={{ fontSize: 16, margin: 0 }}>
          Fire queue
        </h2>
        {/* ONE board-level live region (S2-audit S8): the bump error takes precedence over the count, so
            a flaky socket / failed bump surfaces here instead of N per-line alert regions flooding the SR. */}
        <p
          role="status"
          aria-live="polite"
          style={{ margin: 0, fontSize: 13, color: err || stale ? "var(--warn)" : "var(--t2)" }}
        >
          {err ??
            (stale
              ? "Reconnecting — showing the last known queue"
              : count === 0
                ? "All clear"
                : `${count} open ${count === 1 ? "ticket" : "tickets"}`)}
        </p>
      </div>

      {count === 0 ? (
        <EmptyState
          title="Nothing on the line"
          subtitle="Tickets appear here the moment a table sends its order to the kitchen — oldest first, so you can work the queue top-down."
        />
      ) : (
        <ul role="list" aria-label="Open kitchen tickets" style={grid}>
          {tickets.map((t) => (
            <li key={t.sessionId}>
              <TicketCard
                ticket={t}
                serverNow={snap.serverNow}
                onBumped={refresh}
                onError={setErr}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TicketCard({
  ticket,
  serverNow,
  onBumped,
  onError,
}: {
  ticket: KitchenTicket;
  serverNow: string;
  onBumped: () => void;
  onError: (msg: string | null) => void;
}) {
  return (
    <article className="card" style={cardStyle} aria-label={`Table ${ticket.label}`}>
      <header style={cardHead}>
        <span style={tableLabel}>Table {ticket.label}</span>
        <span style={{ fontSize: 12, color: "var(--t2)" }}>
          <RelativeTime iso={ticket.firedAt} serverNow={serverNow} />
        </span>
      </header>
      <ul role="list" style={lineList}>
        {ticket.lines.map((l) => (
          <KdsLineRow key={l.id} line={l} onBumped={onBumped} onError={onError} />
        ))}
      </ul>
    </article>
  );
}

function KdsLineRow({
  line,
  onBumped,
  onError,
}: {
  line: KitchenLine;
  onBumped: () => void;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const to = line.state === "fired" ? "in_progress" : "served";
  const label = line.state === "fired" ? "Start" : "Ready";

  const bump = () => {
    onError(null); // clear any prior board-level error as we retry
    startTransition(async () => {
      try {
        const res = await bumpLine({ lineId: line.id, to });
        if (!res.ok) onError(res.error);
        else onBumped(); // realtime also refreshes; this makes the bump feel instant
      } catch {
        // S2-audit B3: a thrown action must not silently no-op the bump — surface it on the board region.
        onError(`Couldn’t update ${line.name} — try again.`);
      }
    });
  };

  return (
    <li style={lineRow}>
      <div style={{ minWidth: 0 }}>
        <p style={lineName}>
          <span aria-hidden="true" style={qtyBadge}>
            {line.qty}×
          </span>{" "}
          {line.name}
          {line.fulfillment === "togo" && (
            // S4.2: tells the cook/expo to bag it, not run it to the table. Text (not colour-only) for a11y;
            // the bag glyph is decorative (aria-hidden) so SRs read just "To-go".
            <span style={togoTag}>
              {" · To-go "}
              <span aria-hidden="true">🥡</span>
            </span>
          )}
          {line.state === "in_progress" && <span style={cookingTag}> cooking</span>}
        </p>
        {line.modifiers.length > 0 && <p style={modLine}>{line.modifiers.join(" · ")}</p>}
      </div>
      <button
        type="button"
        onClick={bump}
        disabled={pending}
        aria-label={`${label} — ${line.qty} ${line.name} for the kitchen`}
        style={{ ...bumpBtn, ...(line.state === "fired" ? startBtn : readyBtn) }}
      >
        {pending ? "…" : label}
      </button>
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
  justifyContent: "space-between",
  gap: "var(--s3)",
  paddingTop: "var(--s2)",
  borderTop: "1px solid var(--bd)",
};
const lineName: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.3 };
const qtyBadge: CSSProperties = { color: "var(--t2)", fontWeight: 700 };
const cookingTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ac-strong)",
};
const togoTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--t2)",
};
const modLine: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 13,
  color: "var(--t2)",
  lineHeight: 1.4,
};
const bumpBtn: CSSProperties = {
  flexShrink: 0,
  minWidth: 88,
  minHeight: 44,
  borderRadius: "var(--r-sm)",
  border: "1px solid transparent",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
const startBtn: CSSProperties = {
  background: "var(--sf)",
  color: "var(--tx)",
  borderColor: "var(--bd)",
};
const readyBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
};
