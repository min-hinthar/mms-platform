"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { getExpoQueue, setTogoStatus } from "@/lib/expo";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { useWakeLock } from "@/lib/useWakeLock";
import { formatSlotLong } from "@/lib/pickupTime";
import type { ExpoLine, ExpoQueue, ExpoTicket } from "@/lib/expo-types";
import { burmeseAddsInfo } from "@/lib/ticket-names";
import { RelativeTime } from "./RelativeTime";
import { StaggerList } from "./StaggerList";
import { EmptyState, Icon } from "@mms/ui";

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
  // W10b — one degraded state carrying WHEN it started and WHY (see KdsBoard for the full note).
  // `since` and `nowMs` are BOTH the device clock here, so the elapsed driving the paper-flow
  // escalation is measured in one domain — a skewed tablet can't shorten or extend it.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  // Clock for the escalation only (no 1s ticker here like the KDS): Date.now() in render is impure
  // under the compiler, so it advances in the failure callbacks and a slow tick while degraded.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useWakeLock(); // O-F: the bagging tablet is always-on too

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      const res = await raceTimeout(getExpoQueue());
      if (!res.ok) {
        // W10b (M32): outage ≠ signed out — keep the last-known bags instead of redirecting the
        // counter to login mid-service.
        if (res.reason === "outage") {
          setNowMs(Date.now());
          setDegraded((d) => nextDegraded(d, "outage", Date.now()));
          return;
        }
        window.location.assign(res.reason === "locked" ? "/staff/lock" : "/staff/login");
        return;
      }
      setSnap(res.queue);
      setErr(null);
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // Cause `unknown` — this end failed, which isn't evidence the platform is down.
      fails.current += 1;
      setNowMs(Date.now());
      if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
      console.error("[ExpoBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Slow escalation tick while frozen/stale — the banner's ≥2min flip needs a re-render even if
  // every poll keeps failing silently.
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

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
  // W9d — a PURE-grocery (scan-&-go) order has nothing to bag: the shopper already holds the goods,
  // and the counter's job is to check the exit pass. Counting it as a "bag waiting" handed staff
  // phantom bagging work, so the header names the two kinds separately. Vocabulary only — the
  // status machine (mms_set_togo_status / mms_init_togo_status) is untouched.
  // Only PREPARING grocery tickets await verification — a ready one was already verified (its
  // remaining action is recording the hand-over), so counting it here would show staff a shopper
  // they just checked as still pending (Codex). Verified-not-yet-cleared tickets get their OWN
  // segment: without it, a queue of only ready grocery tickets rendered a nonzero grid under a
  // BLANK header status (both other counts zero → empty join), silencing the live region's summary
  // of remaining work (Codex round 3). Every ticket lands in exactly one of the three counts.
  const verifyCount = tickets.filter(
    (t) => t.status === "preparing" && t.lines.every((l) => l.fulfillment === "grocery"),
  ).length;
  const handOverCount = tickets.filter(
    (t) => t.status === "ready" && t.lines.every((l) => l.fulfillment === "grocery"),
  ).length;
  const bagCount = tickets.filter((t) => t.lines.some((l) => l.fulfillment !== "grocery")).length;

  return (
    <section aria-labelledby="expo-h" onFocusCapture={markFocus}>
      <div style={headRow}>
        <h2
          id="expo-h"
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: "var(--fs-body)", margin: 0 }}
        >
          Takeaway bags
        </h2>
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: "var(--fs-sm)",
            color: err || degraded ? "var(--warn)" : "var(--t2)",
          }}
        >
          {err ??
            (degraded
              ? frozenBoardCopy(snap.serverNow, nowMs - degraded.since, "the bags", degraded.cause)
              : count === 0
                ? "No bags waiting"
                : [
                    bagCount > 0 ? `${bagCount} bag${bagCount === 1 ? "" : "s"} waiting` : null,
                    verifyCount > 0 ? `${verifyCount} to verify` : null,
                    handOverCount > 0 ? `${handOverCount} to hand over` : null,
                  ]
                    .filter(Boolean)
                    .join(" · "))}
        </p>
      </div>

      {count === 0 ? (
        // W10b — mid-freeze this must not read as an all-clear, nor promise bags we can't hear about.
        <EmptyState
          title={degraded ? "Nothing to bag as of the last update" : "Nothing to bag"}
          subtitle={
            degraded
              ? "New bags won’t land here until this board is updating again. Nothing already paid for is lost."
              : "Bags appear here once a to-go or grocery order is paid."
          }
          icon={<Icon name="bag" size={30} style={{ color: "var(--ac)" }} />}
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
  // W9d — a pure-grocery (scan-&-go) order: the shopper already HOLDS the goods, so "Bagged & ready"
  // is fiction. Same two-stage status machine (untouched), mapped to the counter's two real moments:
  // check the exit pass ("Verified", preparing→ready) then record the walk-out ("Handed over",
  // ready→picked_up, drops the card). The first cut of this put "Handed over" on the FIRST bump,
  // which left a zombie second stage still counted as unverified (Codex) — each label now names the
  // action its own tap performs.
  const grocery = ticket.lines.every((l) => l.fulfillment === "grocery");
  const label =
    ticket.status === "preparing"
      ? grocery
        ? "Verified"
        : "Bagged & ready"
      : grocery
        ? "Handed over"
        : "Picked up";

  // K2 + W3e call-out identity: a dine-in to-go bag calls out its real table; a pickup/scango bag
  // headlines the first name captured at checkout (short code as the collision-safe suffix), falling
  // back to the short code alone when the diner skipped the name — expo always has something to call.
  const callOut =
    ticket.tableNumber != null
      ? `Table ${ticket.tableNumber}`
      : ticket.customerName
        ? ticket.customerName
        : `#${ticket.shortCode}`;
  // Who to verify (grocery accessible names): keep the NAME when we have one — an SR staffer needs
  // WHOSE exit pass to match, not just a code — with the code as the collision-safe suffix,
  // mirroring the visible header (callOut + codeSuffix).
  const verifyWho = ticket.customerName
    ? `${callOut} · #${ticket.shortCode}`
    : `#${ticket.shortCode}`;

  const bump = () => {
    onError(null);
    startTransition(async () => {
      try {
        const res = await setTogoStatus({ orderId: ticket.orderId, to });
        if (!res.ok) onError(res.error);
        else await onBumped(); // pending covers the refetch — no stale-label flicker
      } catch {
        onError(
          grocery
            ? `Couldn’t update ${verifyWho} — try again.`
            : `Couldn’t update the bag for ${callOut} — try again.`,
        );
      }
    });
  };

  return (
    <article
      className="card card-textured"
      style={cardStyle}
      // The card's name tracks its CURRENT stage — a ready grocery ticket was already verified, so
      // announcing "Verify" for it would read the previous workflow step to an SR staffer (Codex).
      aria-label={
        grocery
          ? `${ticket.status === "preparing" ? "Verify" : "Hand over"} · ${verifyWho}`
          : `Bag for ${callOut}`
      }
    >
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
          {/* Grocery's ready-stage means "pass checked", not "food ready" — tag it honestly. */}
          {ticket.status === "ready" && (
            <span style={readyTag}>{grocery ? "Verified" : "Ready"}</span>
          )}
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            <RelativeTime iso={ticket.createdAt} serverNow={serverNow} />
          </span>
        </span>
      </header>
      {ticket.pickupSlot && (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          Pickup {formatSlotLong(ticket.pickupSlot)}
        </p>
      )}
      {/* W21 — the pickup contact the checkout REQUIRED, finally readable where it's needed: a
          tel: link so the counter phone dials in one tap. Staff-gated surface; never public. */}
      {ticket.customerPhone && (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          <a
            href={`tel:${ticket.customerPhone.replace(/[^0-9+]/g, "")}`}
            style={{ color: "inherit", fontWeight: 700, minHeight: 44, display: "inline-block" }}
          >
            <span aria-hidden>☎ </span>
            {ticket.customerPhone}
          </a>
        </p>
      )}
      {/* W9d — the honest job description: the shopper already holds these items, so the counter's
          work is the exit-pass check, not bagging. */}
      {grocery && (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          Scan &amp; Go — verify the exit pass; nothing to bag.
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
        aria-label={grocery ? `${label} — ${verifyWho}` : `${label} — bag for ${callOut}`}
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
        {/* P1 — the Burmese half of the bag line, above the English the counter already showed.
            Name and modifiers fall back INDEPENDENTLY: a bag line with Burmese options but an
            English-only name still shows its Burmese options. Per-slot English fallbacks are
            marked lang="en" and reset to the body face. */}
        {burmeseAddsInfo(line.nameMy, line.modifiersMy) && (
          <span lang="my" style={myLine}>
            {line.nameMy ?? (
              <span lang="en" style={enInMy}>
                {line.name}
              </span>
            )}
            {line.modifiersMy.some((m) => m !== null) && (
              <span style={{ color: "var(--t2)" }}>
                {" · "}
                {line.modifiers.map((en, i) => (
                  <Fragment key={i}>
                    {i > 0 && " · "}
                    {line.modifiersMy[i] ?? (
                      <span lang="en" style={enInMy}>
                        {en}
                      </span>
                    )}
                  </Fragment>
                ))}
              </span>
            )}
          </span>
        )}
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
const tableLabel: CSSProperties = { fontWeight: 700, fontSize: "var(--fs-body)" };
const codeSuffix: CSSProperties = { fontWeight: 700, fontSize: "var(--fs-sm)", color: "var(--t2)" };
// The note is safety-adjacent — full text color (not muted), quoted so it reads as the diner's words.
const noteInline: CSSProperties = { display: "block", fontWeight: 700, color: "var(--tx)" };
const readyTag: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ok)",
};
// "Here now" (J5) — accent, not success-green: it flags a waiting person, not a completed step.
const hereTag: CSSProperties = {
  fontSize: "var(--fs-xs)",
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
  // P1 — baseline, not center: with a Burmese line above the English one the label is two lines
  // tall, and the 2× badge and the destination tag belong on the FIRST line's baseline.
  alignItems: "baseline",
  gap: "var(--s2)",
  fontSize: "var(--fs-sm)",
};
// P1 — the Burmese line on a bag row: its own block, the body size (Padauk's consonant body is ~8%
// shorter than Hanken's x-height, and the expo's 13px row is already at the Burmese floor), 700 =
// the heaviest cut Padauk ships, the Burmese leading token, and never a synthesized bold (a
// swap-window fallback face would smear the stacked marks).
const myLine: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  fontSynthesis: "none",
  lineHeight: "var(--lh-my)",
};
// Interleaved English inside a Burmese run keeps the body face (Padauk's Latin reads as
// "Burmese-styled English").
const enInMy: CSSProperties = { fontFamily: "var(--font-body)" };
const qtyBadge: CSSProperties = { fontWeight: 800, color: "var(--ac-strong)", flex: "none" };
const destTag: CSSProperties = {
  flex: "none",
  fontSize: "var(--fs-xs)",
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
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const readyBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const pickedBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
