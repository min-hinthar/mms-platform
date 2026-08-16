"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTableDetail } from "@/lib/floor";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { type TableDetail, tableDisplay } from "@/lib/floor-types";
import { FloorStatusChip } from "./FloorStatusChip";
import { RelativeTime } from "./RelativeTime";
import { LiveMoney } from "./LiveMoney";
import { Badge, Icon } from "@mms/ui";
import { ClearTableButton } from "./ClearTableButton";
import { StaffLineEditor } from "./StaffLineEditor";
import { CashSettleButton } from "./CashSettleButton";
import { TerminalSettleButton, TerminalCollectPanel, type TerminalCollect } from "./TerminalSettle";
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
  terminalReady = false,
}: {
  initial: TableDetail;
  sessionId: string;
  /** W6c: STRIPE_TERMINAL_READER_ID is configured (server-checked by the page) — the Card settle
   *  renders. Unset = feature-off: no button, and the action refuses independently. */
  terminalReady?: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TableDetail>(initial);
  const [writeError, setWriteError] = useState<string | null>(null);
  // W10b — one degraded state carrying WHEN it started and WHY (see KdsBoard). Only a genuine
  // `closed` bounces back to the floor; an unreadable table is NOT a cleared one. `since` and
  // `nowMs` share the device clock, so the escalation elapsed is measured in one domain.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const inFlight = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderHeadingRef = useRef<HTMLHeadingElement>(null);

  // Staff can write while there's an open cart and no payment in flight; once settled (cartId null) or
  // mid-payment the order goes read-only. The server enforces this too — this is just the affordance.
  const canWrite = detail.cartId != null && !detail.paymentInFlight;
  const isCounter = detail.label.startsWith("reg-");
  // W6a review (confirmed HIGH): the settle handoff card must SURVIVE the settled detail state — the
  // settle button lives inside the open-cart conditional, and the realtime/poll refresh unmounts it
  // (client state included) within ~0.4-5s of the settle, mid-handoff. The card's data lives HERE.
  const [handoff, setHandoff] = useState<{
    orderId: string;
    totalCents: number;
    changeCents: number | null;
  } | null>(null);
  // W6c: the live reader-collect window — SAME survival rule as the handoff card (the settlement
  // freeze flips paymentInFlight, which unmounts the settle section seconds after the start),
  // PLUS reload survival: the PI handle is mirrored to sessionStorage, so a mid-collect refresh /
  // tab sleep re-attaches to the live reader charge instead of orphaning it with no Cancel and
  // misleading "guest is paying on their phone" copy (review finding).
  const [terminalCollect, setTerminalCollectState] = useState<TerminalCollect | null>(null);
  useEffect(() => {
    // setState via a scheduled callback, not synchronously in the effect (react-hooks rule).
    const id = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(`mms-terminal-collect:${sessionId}`);
        if (!raw) return;
        const parsed = JSON.parse(raw) as TerminalCollect;
        if (
          typeof parsed?.paymentIntentId === "string" &&
          parsed.paymentIntentId.startsWith("pi_") &&
          typeof parsed?.totalCents === "number"
        )
          setTerminalCollectState(parsed);
      } catch {
        /* deliberate: an unreadable stash is just a cold start */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [sessionId]);
  const setTerminalCollect = useCallback(
    (c: TerminalCollect | null) => {
      setTerminalCollectState(c);
      try {
        if (c) sessionStorage.setItem(`mms-terminal-collect:${sessionId}`, JSON.stringify(c));
        else sessionStorage.removeItem(`mms-terminal-collect:${sessionId}`);
      } catch {
        /* deliberate: storage may be unavailable — in-memory state still drives the panel */
      }
    },
    [sessionId],
  );
  const handoffRef = useRef<HTMLDivElement>(null);
  // The webhook's counter-session close races the panel's poll: a `closed` verdict must not bounce
  // to the floor while the collect panel / handoff card IS the live surface — the cashier would
  // never see the #CODE call-out (review finding). "← Floor" is the deliberate exit.
  const terminalFlowLive = useRef(false);
  useEffect(() => {
    terminalFlowLive.current = terminalCollect != null || handoff != null;
  }, [terminalCollect, handoff]);
  useEffect(() => {
    // Focus the handoff card when it appears (the settle control it replaced has unmounted).
    if (handoff) handoffRef.current?.focus();
  }, [handoff]);

  // Focus catch-all (WCAG 2.4.3): ANY detail refresh can unmount the control that held focus — a line
  // removal (stepper row gone), a void/comp (row swaps to the no-controls variant), an approval request
  // (badge replaces the buttons), a tab open (OpenTabButton unmounts), or a payment starting (the whole
  // editor list swaps read-only). Instead of one narrow effect per seam (the previous shape covered only
  // the list-shrink + tab-flip cases and missed void/comp/approval), run once per detail change and
  // restore to the order heading when focus FELL to <body> — edge-triggered on "had real focus on the
  // last detail change, on <body> now", so an idle touch device (activeElement persistently <body>)
  // never gets focus planted by the 5s poll, and a control the user moved to is never yanked.
  // preventScroll: the restore is an SR/keyboard continuity cue, not a viewport jump.
  // `hadRealFocus` is set BOTH at interaction time (onFocusCapture on the root — closes the blind window
  // where the FIRST action after load lands before any snapshot has sampled focus) and re-sampled at each
  // detail commit (so a deliberate de-focus decays it and the poll can't re-plant focus forever after).
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    const onBody = document.activeElement === document.body;
    if (onBody && hadRealFocus.current) orderHeadingRef.current?.focus({ preventScroll: true });
    hadRealFocus.current = document.activeElement !== document.body;
  }, [detail]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      const res = await raceTimeout(getTableDetail(sessionId));
      if (res.kind === "detail") {
        setDetail(res.detail);
        fails.current = 0;
        setDegraded(null);
      } else if (res.kind === "closed") {
        // Genuinely closed/cleared — the detail no longer exists; go back to the floor. (The old
        // `null` also fired on OUTAGE, kicking staff off a live table's order mid-service — M32.)
        // W6c exception: the terminal webhook CLOSES a counter session moments after fulfilling —
        // bouncing now would yank the collect panel / #CODE handoff card out from under the
        // cashier before the poll ever reports it. Hold; "← Floor" is the deliberate exit.
        if (!terminalFlowLive.current) {
          router.replace("/staff");
          router.refresh();
        }
      } else if (res.kind === "signin") {
        // An expired/invalid staff session is a verdict, not a blip — the honest surface is login.
        window.location.assign("/staff/login");
      } else {
        setNowMs(Date.now());
        setDegraded((d) => nextDegraded(d, "outage", Date.now()));
      }
    } catch (e) {
      // Cause `unknown` — this end failed, which isn't evidence the platform is down.
      fails.current += 1;
      setNowMs(Date.now());
      if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
      console.error("[FloorDetailLive] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router]);

  // Slow escalation tick while frozen/stale (the ≥2min paper-flow flip needs a re-render).
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

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
    <main style={wrap} onFocusCapture={markFocus}>
      <Link href="/staff" style={back}>
        ← Floor
      </Link>

      <header style={header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* K2: the real table number; an unregistered/legacy sticker shows its raw token + flag.
                W6a: a register (`reg-`) session is a COUNTER ORDER, not a broken table — name it so,
                and never wave the unregistered-sticker warning at it. */}
            <h1 style={h1}>{isCounter ? "Counter order" : `Table ${tableDisplay(detail).text}`}</h1>
            {!isCounter && tableDisplay(detail).unregistered && (
              <Badge tone="warn" bordered>
                Unregistered sticker
              </Badge>
            )}
            <FloorStatusChip status={detail.status} />
            {detail.tab !== "none" && (
              // Announced (not decorative): this chip's text is the only place the tab state is named.
              // Secured = jade (affirmative, card-backed); open = accent (neutral-attention). `bordered`
              // matches the sibling FloorStatusChip; the "· card on file" suffix is the non-color cue.
              <Badge tone={detail.tab === "secure" ? "jade" : "accent"} bordered>
                {detail.tab === "secure" ? "Tab secured · card on file" : "Tab open"}
              </Badge>
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

      {/* Server-discretion gating (S3.3). Advisory only — never an auto-charge/auto-convert (T11), never
          per-customer judgment (T12). The path to secure is the diner's "Secure your tab" on /cart; staff
          check in or suggest it. Plain banners (not live regions — one view already owns aria-live). */}
      {detail.tabOverCeiling && (
        <div style={ceilingBanner}>
          <Icon name="alert" size={16} style={{ marginTop: 2 }} />
          <span>
            <strong>Tab at {fmt(detail.runningSubtotalCents)}</strong> — past the{" "}
            {fmt(detail.ceilingCents)} mark. Check in with the table, or ask them to secure the tab
            with a card on file.
          </span>
        </div>
      )}
      {detail.nudgeSecure && detail.tab !== "secure" && (
        <div style={nudgeBanner}>
          <Icon name="star" size={16} style={{ marginTop: 2 }} />
          <span>
            {detail.nudgeSecure === "party"
              ? "Large party — consider suggesting a secure tab (a card on file) so they can order freely and settle once."
              : "This tab's been open a while — consider suggesting they secure it with a card on file."}
          </span>
        </div>
      )}

      {/* Party */}
      <section className="card card-textured" style={sectionCard} aria-labelledby="party-h">
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
                {m.isHost && (
                  <span style={{ color: "var(--ac)", fontSize: "var(--fs-sm)" }}> · host</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* Host-of-record (S3.3 / T14): on a secure tab, the host who opened it is cardholder-of-record —
            the off-session close charges their saved card (or the table splits). */}
        {detail.tab === "secure" && detail.members.some((m) => m.isHost) && (
          <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
            Card on file — host of record:{" "}
            <strong style={{ color: "var(--tx)" }}>
              {detail.members.find((m) => m.isHost)?.name}
            </strong>
            .
          </p>
        )}
      </section>

      {/* Order so far */}
      <section className="card card-textured" style={sectionCard} aria-labelledby="order-h">
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
                      <span style={{ color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
                        {" "}
                        · {l.bySeatName}
                      </span>
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
              <span style={{ fontWeight: 700 }}>
                <LiveMoney cents={detail.runningSubtotalCents} />
              </span>{" "}
              <span style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
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
        <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
          Running pre-tax subtotal — tax is added at settle.
        </p>
        {/* One shared live region for staff line-edit feedback + the stale-poll signal (S2-audit S9): a
            frozen detail view mustn't look live. The write error takes precedence over the reconnect note. */}
        <p
          role="status"
          style={{
            ...muted,
            marginTop: 6,
            fontSize: "var(--fs-sm)",
            minHeight: writeError || degraded ? 16 : 0,
            color: writeError || degraded ? "var(--warn)" : "var(--t3)",
          }}
        >
          {writeError ??
            (degraded
              ? frozenBoardCopy(
                  detail.serverNow,
                  nowMs - degraded.since,
                  "this order",
                  degraded.cause,
                )
              : null)}
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
          {/* W6c: card-present on the reader — only when the reader env is configured. The collect
              window itself renders BELOW, outside this open-cart conditional (it must survive the
              freeze flipping paymentInFlight). */}
          {terminalReady && terminalCollect == null && (
            <TerminalSettleButton
              sessionId={sessionId}
              totalCents={detail.settleTotalCents}
              onStarted={setTerminalCollect}
            />
          )}
          <CashSettleButton
            sessionId={sessionId}
            totalCents={detail.settleTotalCents}
            intendedTipCents={detail.intendedTipCents}
            isTab={detail.tab !== "none"}
            // W6a: a counter (register) order ends in a handoff — tendered/change helper + the
            // #CODE card the cashier calls out. Table settles keep the quiet flow.
            handoff={isCounter}
            onHandoff={(h) => setHandoff(h)}
          />
          {detail.tab === "trust" && (
            <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
              {/* W6c: with a reader configured, card-at-the-counter is the button above — don't
                  send the guest back to their phone for a payment the reader takes right here. */}
              {terminalReady
                ? "Paying by card? Use the reader above, or the guest can close the tab from their phone."
                : "Paying by card? The guest closes the tab from their phone — it settles when that payment lands."}
            </p>
          )}
        </section>
      )}
      {terminalCollect && (
        <TerminalCollectPanel
          sessionId={sessionId}
          collect={terminalCollect}
          isCounter={isCounter}
          onDone={(h) => {
            setTerminalCollect(null);
            if (h) setHandoff(h);
          }}
        />
      )}
      {handoff && (
        <div
          ref={handoffRef}
          tabIndex={-1}
          role="status"
          aria-label="Order paid"
          className="card"
          style={{
            marginTop: "var(--s4)",
            padding: "var(--s4)",
            textAlign: "center",
            outline: "none",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            Paid · ${(handoff.totalCents / 100).toFixed(2)}
            {handoff.changeCents != null && handoff.changeCents > 0 && (
              <> — change ${(handoff.changeCents / 100).toFixed(2)}</>
            )}
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h1)",
              fontWeight: 800,
              letterSpacing: "0.06em",
            }}
          >
            #{handoff.orderId.slice(-6).toUpperCase()}
          </p>
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            The pickup call-out — it&rsquo;s on the kitchen ticket and the ready board.
          </p>
        </div>
      )}
      {detail.paymentInFlight && terminalCollect == null && (
        <p style={{ ...muted, marginTop: "var(--s4)", fontSize: "var(--fs-sm)" }}>
          A guest is paying on their phone — editing and{" "}
          {detail.tab !== "none" ? "tab close" : "cash settle"} are paused until that finishes.
        </p>
      )}

      {/* Soft convergence (S1.4): fold a double-order into another table. Same gate as a write (open cart,
          not mid-payment) and only when there's something to move. */}
      {canWrite && detail.itemCount > 0 && detail.tab !== "secure" && (
        <section style={{ marginTop: "var(--s4)" }} aria-label="Merge this table">
          <MergeTableButton
            sourceSessionId={sessionId}
            sourceLabel={tableDisplay(detail).text}
            sourceItemCount={detail.itemCount}
          />
        </section>
      )}

      <section style={{ marginTop: "var(--s5)" }}>
        <ClearTableButton
          sessionId={sessionId}
          label={tableDisplay(detail).text}
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
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  textDecoration: "none",
};

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "var(--s6)" };
const back: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  textDecoration: "none",
  marginBottom: "var(--s3)",
};
const header: CSSProperties = { marginBottom: "var(--s5)" };
const h1: CSSProperties = { fontSize: "var(--fs-h1)", margin: 0 };
const sub: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "6px 0 0" };
const ceilingBanner: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  alignItems: "flex-start",
  padding: "var(--s3) var(--s4)",
  marginBottom: "var(--s4)",
  borderRadius: "var(--r-card)",
  border: "1px solid color-mix(in oklab, var(--warn) 35%, transparent)",
  background: "color-mix(in oklab, var(--warn) 9%, var(--cd))",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.5,
};
const nudgeBanner: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  alignItems: "flex-start",
  padding: "var(--s3) var(--s4)",
  marginBottom: "var(--s4)",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "color-mix(in oklab, var(--ac) 7%, var(--cd))",
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  lineHeight: 1.5,
};
const sectionCard: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const sectionH: CSSProperties = {
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s3)",
  color: "var(--t2)",
};
const muted: CSSProperties = { margin: 0, color: "var(--t3)", fontSize: "var(--fs-sm)" };
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
  fontSize: "var(--fs-sm)",
};
const lineRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  padding: "8px 0",
  borderTop: "1px solid var(--bd)",
  fontSize: "var(--fs-sm)",
};
const offBadge: CSSProperties = { color: "var(--t3)", fontSize: "var(--fs-sm)", fontWeight: 700 };
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
