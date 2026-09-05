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
import { useStaffLang } from "./StaffLangProvider";
import { StaffLangSwitch } from "./StaffLangSwitch";
import { Chrome, OutageText } from "./Chrome";
import { plural } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import type { StaffKey } from "@/lib/i18n/staff";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// P2 — keys, not labels. The three modes already have dictionary entries on the floor card
// (`floor.mode.*`); this surface reads the SAME ones rather than minting a second set that could
// drift from the board a manager compares it against. `scango` stays Latin in both tongues — it is
// the product's own name, and the dictionary carries that decision with its reason.
const MODE_KEY: Record<TableDetail["mode"], StaffKey> = {
  dinein: "floor.mode.dinein",
  scango: "floor.mode.scango",
  pickup: "floor.mode.pickup",
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
  // P2 — the device language, from app/staff/layout.tsx (the outage banner below speaks it).
  const lang = useStaffLang();
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
      {/* P2 — the language control is mounted PER SURFACE (see KdsBoard): the staff layout owns no
          strip, so this row is where the person looking at this table changes its language.
          `check-staff-lang.mjs` rule 4 holds this page to that mount. The arrow belongs to the
          label and lives inside the dictionary value (precedent: `kds.back`). */}
      <div style={topRow}>
        <Link href="/staff" style={back}>
          <Chrome lang={lang} k="floor.back" />
        </Link>
        <StaffLangSwitch lang={lang} />
      </div>

      <header style={header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* K2: the real table number; an unregistered/legacy sticker shows its raw token + flag.
                W6a: a register (`reg-`) session is a COUNTER ORDER, not a broken table — name it so,
                and never wave the unregistered-sticker warning at it. */}
            <h1 style={h1}>
              {isCounter ? (
                <Chrome lang={lang} k="floor.counter" echo="stack" />
              ) : (
                <Chrome
                  lang={lang}
                  k="floor.table"
                  vars={{ id: tableDisplay(detail).text }}
                  echo="stack"
                />
              )}
            </h1>
            {!isCounter && tableDisplay(detail).unregistered && (
              // A badge is a 44px object: two scripts cannot legibly stack inside one, so no echo.
              <Badge tone="warn" bordered>
                <Chrome lang={lang} k="table.detail.unregisteredBadge" />
              </Badge>
            )}
            <FloorStatusChip status={detail.status} lang={lang} />
            {detail.tab !== "none" && (
              // Announced (not decorative): this chip's text is the only place the tab state is named.
              // Secured = jade (affirmative, card-backed); open = accent (neutral-attention). `bordered`
              // matches the sibling FloorStatusChip; the "· card on file" suffix is the non-color cue.
              <Badge tone={detail.tab === "secure" ? "jade" : "accent"} bordered>
                <Chrome
                  lang={lang}
                  k={detail.tab === "secure" ? "floor.tabSecured" : "table.detail.tabOpen"}
                />
              </Badge>
            )}
          </div>
          {/* P2 — four fragments on one middot-separated line, so every one of them takes
              `echo={false}`: an English echo per fragment would double a line already at its width
              budget and the middots would stop reading as separators. The relative time beside them
              is still English (`RelativeTime` is not in this slice) and sits OUTSIDE the Burmese
              spans, so it keeps the body face rather than being typeset in Padauk. */}
          <p style={sub}>
            <Chrome lang={lang} k={MODE_KEY[detail.mode]} /> ·{" "}
            <Chrome
              lang={lang}
              k={plural(detail.members.length, "table.detail.guest.one", "table.detail.guest.many")}
              vars={{ n: detail.members.length }}
            />{" "}
            ·{" "}
            {detail.tab !== "none" && detail.tabOpenedAt ? (
              <>
                <Chrome lang={lang} k="table.detail.tabOpened" />{" "}
                <RelativeTime iso={detail.tabOpenedAt} serverNow={detail.serverNow} />
              </>
            ) : (
              <>
                <Chrome lang={lang} k="table.detail.lastActivity" />{" "}
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
          {/* TWO keys for one sentence: it quotes TWO money figures and `{m}` fills globally, so a
              single template could not carry both. The lead-in keeps its <strong> and takes an
              inline echo (it is one short bolded clause); the advisory body stacks. Neither amount
              is recomputed — both come from `fmt()` on the server-derived cents, as before. */}
          <span>
            <strong>
              <Chrome
                lang={lang}
                k="table.detail.ceiling.at"
                vars={{ m: fmt(detail.runningSubtotalCents) }}
                echo="inline"
              />
            </strong>{" "}
            <Chrome
              lang={lang}
              k="table.detail.ceiling.past"
              vars={{ m: fmt(detail.ceilingCents) }}
              echo="stack"
            />
          </span>
        </div>
      )}
      {detail.nudgeSecure && detail.tab !== "secure" && (
        <div style={nudgeBanner}>
          <Icon name="star" size={16} style={{ marginTop: 2 }} />
          <span>
            <Chrome
              lang={lang}
              k={
                detail.nudgeSecure === "party"
                  ? "table.detail.nudge.party"
                  : "table.detail.nudge.age"
              }
              echo="stack"
            />
          </span>
        </div>
      )}

      {/* Party */}
      <section className="card card-textured" style={sectionCard} aria-labelledby="party-h">
        {/* `echo={false}` is REQUIRED on a heading that is an aria-labelledby target: the computed
            name is the element's whole text, so an echo would name this region "အဖွဲ့ Party". */}
        <h2 id="party-h" style={sectionH}>
          <Chrome lang={lang} k="table.detail.party.title" />
        </h2>
        {detail.members.length === 0 ? (
          <p style={muted}>
            <Chrome lang={lang} k="table.detail.party.empty" echo="stack" />
          </p>
        ) : (
          <ul role="list" style={chipList} aria-label={sx(lang, "table.detail.a11y.guests")}>
            {detail.members.map((m) => (
              <li key={m.seatId} style={guestChip}>
                {m.name}
                {m.isHost && (
                  <span style={{ color: "var(--ac)", fontSize: "var(--fs-sm)" }}>
                    {" · "}
                    <Chrome lang={lang} k="table.detail.host" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* Host-of-record (S3.3 / T14): on a secure tab, the host who opened it is cardholder-of-record —
            the off-session close charges their saved card (or the table splits). */}
        {detail.tab === "secure" && detail.members.some((m) => m.isHost) && (
          <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
            {/* The name rides an {x} slot instead of its own <strong>, and that costs the emphasis
                deliberately: the sentence ends in a full stop that has to be Burmese on a Burmese
                console, and a terminator written as bare JSX between two elements cannot be. In
                exchange <Chrome> marks a Latin name `lang="en"`, so it keeps the body face inside
                the Burmese run instead of being typeset in Padauk. */}
            <Chrome
              lang={lang}
              k="table.detail.hostOfRecord"
              vars={{ x: detail.members.find((m) => m.isHost)?.name ?? "" }}
              echo="stack"
            />
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
            {/* `echo={false}`: this heading names the region through aria-labelledby AND is the
                focus target the catch-all restores to — an echo would put both scripts in both. */}
            <Chrome lang={lang} k="table.detail.order.title" />
          </h2>
          {canWrite && (
            <Link href={`/staff/table/${sessionId}/add`} style={addLink}>
              {/* Inline, not stacked: this link shares a baseline-aligned row with the heading and
                  a stacked pair would push that row to two lines. The "+" belongs to the label and
                  lives inside the dictionary value. */}
              <Chrome lang={lang} k="table.detail.addItems" echo="inline" />
            </Link>
          )}
        </div>

        {detail.lines.length === 0 ? (
          <p style={muted}>
            <Chrome lang={lang} k="table.detail.cart.empty" echo="stack" />
          </p>
        ) : canWrite ? (
          // A `role="list"` with `list-style: none` and no accessible name is a QA gap (§A): both
          // branches of this list now carry one.
          <ul
            role="list"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
            aria-label={sx(lang, "table.detail.a11y.lines")}
          >
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
          <ul
            role="list"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
            aria-label={sx(lang, "table.detail.a11y.lines")}
          >
            {detail.lines.map((l) => {
              const off = l.state === "voided" || l.comped;
              return (
                <li key={l.id} style={lineRow}>
                  <span style={{ minWidth: 0, opacity: l.state === "voided" ? 0.55 : 1 }}>
                    <span style={{ fontWeight: 600 }}>{l.qty}×</span> {l.name}
                    {l.state === "voided" && (
                      <span style={offBadge}>
                        {" · "}
                        <Chrome lang={lang} k="table.detail.line.voided" />
                      </span>
                    )}
                    {l.comped && (
                      <span style={offBadge}>
                        {" · "}
                        <Chrome lang={lang} k="table.detail.line.comped" />
                      </span>
                    )}
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
              {/* The AMOUNT is untouched — `LiveMoney` still renders the server-derived cents. Only
                  the label speaks the device language: inline on the words, no echo on the count
                  (an echoed count would print the same number twice, once per numeral system). */}
              <span style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
                <Chrome lang={lang} k="table.detail.subtotalSoFar" echo="inline" /> ·{" "}
                <Chrome
                  lang={lang}
                  k={plural(detail.itemCount, "table.detail.item.one", "table.detail.item.many")}
                  vars={{ n: detail.itemCount }}
                />
              </span>
            </span>
          )}
          {detail.paidTotalCents != null && (
            <span style={{ color: "var(--ok)", fontWeight: 700 }}>
              <Chrome lang={lang} k="table.detail.paid" vars={{ m: fmt(detail.paidTotalCents) }} />
            </span>
          )}
        </div>
        <p style={{ ...muted, marginTop: 8, fontSize: "var(--fs-sm)" }}>
          <Chrome lang={lang} k="table.detail.pretaxNote" echo="stack" />
        </p>
        {/* One shared live region for staff line-edit feedback + the stale-poll signal (S2-audit S9): a
            frozen detail view mustn't look live. The write error takes precedence over the reconnect note. */}
        {/* P2 — EACH ARM MARKS ITS OWN SCRIPT, so the region itself carries no `lang`. The write
            error is a server string: `<OutageText>` swaps the one sentence that has an authored
            Burmese twin (the write-outage line) and passes every other sentence through in English,
            verbatim — so a `lang="my"` on this <p> would typeset those English arms in Padauk and
            announce them as Burmese. The frozen-board copy is fully authored, and its mark sits on
            the span that holds it. That is why the old conditional suppression can go: the
            condition it encoded now lives inside the component that knows the answer. */}
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
          {writeError !== null ? (
            <OutageText lang={lang} error={writeError} />
          ) : degraded ? (
            <span lang={lang}>
              {frozenBoardCopy(
                lang,
                detail.serverNow,
                nowMs - degraded.since,
                "what.order",
                degraded.cause,
              )}
            </span>
          ) : null}
        </p>
      </section>

      {/* Open a tab (S3.1) — when there's an open cart, no tab yet, and no payment in flight. Marks the
          table so it settles once at close; moves no money. The diner can also open one from /cart. */}
      {canWrite && detail.tab === "none" && (
        <section
          style={{ marginTop: "var(--s4)" }}
          aria-label={sx(lang, "table.detail.a11y.openTab")}
        >
          <OpenTabButton cartId={detail.cartId!} />
        </section>
      )}

      {/* Settle in cash — when there's an open order with items and no payment in flight. On a trust
          tab this IS the tab close (re-framed copy); the money path is the same cash reconcile. */}
      {canWrite && detail.itemCount > 0 && detail.settleTotalCents != null && (
        <section
          style={{ marginTop: "var(--s4)" }}
          aria-label={sx(lang, "table.detail.a11y.settle")}
        >
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
            tipBaseCents={detail.settleTipBaseCents}
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
              <Chrome
                lang={lang}
                k={terminalReady ? "table.detail.trust.reader" : "table.detail.trust.phone"}
                echo="stack"
              />
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
          aria-label={sx(lang, "table.detail.a11y.paid")}
          className="card"
          style={{
            marginTop: "var(--s4)",
            padding: "var(--s4)",
            textAlign: "center",
            outline: "none",
          }}
        >
          {/* The two amounts now go through `fmt()` — the SAME formatter the rest of this file
              uses, and byte-for-byte what the inline `$${(cents / 100).toFixed(2)}` produced. They
              ride `{m}` slots, so they stay Latin and <Chrome> marks them `lang="en"` inside the
              Burmese run; no amount is recomputed and no rounding changes. */}
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            <Chrome
              lang={lang}
              k="table.detail.handoff.paid"
              vars={{ m: fmt(handoff.totalCents) }}
              echo="inline"
            />
            {handoff.changeCents != null && handoff.changeCents > 0 && (
              <>
                {" — "}
                <Chrome
                  lang={lang}
                  k="table.detail.handoff.change"
                  vars={{ m: fmt(handoff.changeCents) }}
                  echo="inline"
                />
              </>
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
            <Chrome lang={lang} k="table.detail.handoff.callout" echo="stack" />
          </p>
        </div>
      )}
      {detail.paymentInFlight && terminalCollect == null && (
        <p style={{ ...muted, marginTop: "var(--s4)", fontSize: "var(--fs-sm)" }}>
          {/* Two whole sentences, not one with a spliced clause: the differing phrase sits in the
              middle in English and at the end in Burmese, and a template with a hole there would
              have to be reordered per tongue. */}
          <Chrome
            lang={lang}
            k={
              detail.tab !== "none"
                ? "table.detail.payingPhone.tab"
                : "table.detail.payingPhone.cash"
            }
            echo="stack"
          />
        </p>
      )}

      {/* Soft convergence (S1.4): fold a double-order into another table. Same gate as a write (open cart,
          not mid-payment) and only when there's something to move. */}
      {canWrite && detail.itemCount > 0 && detail.tab !== "secure" && (
        <section
          style={{ marginTop: "var(--s4)" }}
          aria-label={sx(lang, "table.detail.a11y.merge")}
        >
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
// The back link and the language control share one row: the link keeps its own bottom margin, so
// the space below the row is unchanged from before the control was added.
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  flexWrap: "wrap",
};
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
