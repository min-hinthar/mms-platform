"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  listRefundsNeeded,
  pollPendingApprovals,
  resolveApproval,
  type ApprovalDecision as Decision,
  type PendingApproval,
  type RefundNeeded,
} from "@/lib/approvals";
import { requestCardState, type RequestCardState } from "@/lib/approval-state";
import { leaveForHome, leaveForLogin } from "@/lib/staff-leave";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { boundWrite, stalledSince, tapRefusal } from "@/lib/bounded-write";
import { createPollGate, type PollGate } from "@/lib/poll-gate";
import { listApprovers, type Approver } from "@/lib/voids";
import { paneUrl } from "@/lib/floor-pane";
import { padDishName } from "@/lib/order-pad";
import { EmptyState, Icon, Sheet } from "@mms/ui";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { RefundsNeededStrip } from "./RefundsNeededStrip";
import { RelativeTime } from "./RelativeTime";
import { StaggerList } from "./StaggerList";
import { PIN_NO_PIN_COPY, pinFailureCopy, useLockout } from "./ManagerPinStepUp";
import { ApprovalSlip, KindMark, litApproverId, signersFor, zeroReasonFor } from "./ApprovalSlip";
import { useApprovalsCountPublish } from "./ApprovalsCount";
import { SplitAwareLink } from "./SplitAwareLink";
import { useEchoesShown, useStaffLang } from "./StaffLangProvider";
import { useZoneFocus } from "./ZoneFocus";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { ReloadButton } from "./ReloadOffer";
import { useResaid } from "./useResaid";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { al, sx, type VerbKey } from "@/lib/staff-labels";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/**
 * P2 — the reason a server gave, as a dictionary KEY per code rather than an English label.
 *
 * ⚠️ IT POINTS AT `table.loss.reason.*`, THE SHEET'S OWN KEYS, and that is the whole point. The
 * server picks a reason in `LossActionSheet`; the manager approves the SAME request here. When the
 * two surfaces carried their own key families the Burmese forked — `မှားပြီး မှာမိ` against
 * `မှားပြီး မှာမိတာ`, `မီးဖိုချောင် မှားလုပ်` against `မီးဖိုချောင်က မှားချက်မိတာ` — so under `my` a
 * cook tapped one wording and the manager approved it under another, on a record the server audits.
 * The reason code is the DB's, so the WORD must be the dictionary's, once.
 *
 * SEVEN codes, not six: the void arm offers `sold_out` (`LossActionSheet`'s W23a dine-in 86), and
 * `mms_request_approval` gates on the action and the loss ceiling but never on the reason — so that
 * code reaches this queue and, before this map named it, rendered as the raw column value.
 *
 * `guest_request` is the one code that cannot share a key: the sheet splits it by ACTION
 * (`guestChanged` when voiding, `guestCourtesy` when comping) and this card knows the kind, so it
 * makes the same split rather than flattening two intents into one word.
 *
 * An UNKNOWN code still falls through to the raw column value at the render site: that is a database
 * status key on a manager’s screen (the OPEN-ITEMS P2g shape), and inventing a Burmese word for a
 * code nobody has declared would be a worse answer than showing what the row actually says.
 */
const REASON_KEY: Record<string, StaffKey> = {
  mistake: "table.loss.reason.mistake",
  kitchen_error: "table.loss.reason.kitchenError",
  sold_out: "table.loss.reason.soldOut",
  quality: "table.loss.reason.quality",
  service_recovery: "table.loss.reason.serviceRecovery",
  other: "table.loss.reason.other",
};

/** `guest_request` means something different either side of the void/comp fork. */
const GUEST_REQUEST_KEY: Record<"void" | "comp", StaffKey> = {
  void: "table.loss.reason.guestChanged",
  comp: "table.loss.reason.guestCourtesy",
};

/** PD8 — a verdict the receipt row prints, in the very words the asker's line will show. */
export type ApprovalVerdict = {
  request: Pick<
    PendingApproval,
    "id" | "kind" | "lineName" | "nameMy" | "tableNumber" | "tableLabel" | "initiatorName"
  >;
  decision: Exclude<Decision, "close">;
  approverName: string;
};

/**
 * The manager approvals queue (S2.4 · A4·3 a zone of the counter's one screen) — server-rendered
 * snapshot kept live by a 5s POLL (mms_approvals is owner-read RLS, so it's not on the realtime
 * publication; requests/resolves are low-frequency, so a poll is the right tool). PD8 · m8: each
 * request is a ticket (the table's number as a link to its pane, the flag and the age, the kind mark
 * and the figure, the dish in both scripts) whose Decide opens THE ONE SLIP ("Thiri → Aye", "Aye,
 * your PIN") and the two keys that ARE the decision. A verdict replaces the card with a receipt row
 * (the Remove kind mark, the gift disc, or the ✕ square — never a ✓ disc, which means paid here). A
 * request whose table paid first, or was cleared, or whose line changed after the ask, offers only
 * "Close it" (→ `superseded`, never `denied`; round 3 D2). The bar's approvals circle reads this
 * board's snapshot through `ApprovalsCount` — one poll, never two.
 *
 * Live regions (A4·2's rule for this screen): the floor's region is the ONE state region; this
 * zone's count and freeze are plain text, and each card's `role="status"` exists only once the
 * manager has opened a decision on it — it speaks only about their own tap.
 */
export function ApprovalsBoard({
  initial,
  approvers,
  initialRefunds,
  initialOutage = false,
}: {
  initial: PendingApproval[];
  /** null — the approver roster could not be read at render; the poll fetches it. */
  approvers: Approver[] | null;
  /** The refunds-needed ledger (W11/M43) at render; null — unreadable. Rides the poll from here
   *  (Codex round 2 on #283, P1): a row the webhook writes after load must reach the tablet. */
  initialRefunds: RefundNeeded[] | null;
  /** The server could not read the queue at render: start FROZEN (`outage`), never all-clear. */
  initialOutage?: boolean;
}) {
  // P2 — the device language, from app/staff/layout.tsx (the outage banner below speaks it).
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  const [roster, setRoster] = useState(approvers);
  const [refunds, setRefunds] = useState(initialRefunds);
  // A ledger read that failed AFTER a good one (Codex round 3 on #283, P1): the last rows stay,
  // but an empty strip over a feed the board cannot hear must never read as all-clear — the
  // strip says the ledger could not refresh until a read succeeds again.
  const [ledgerStale, setLedgerStale] = useState(false);
  // Rows the server has CONFIRMED resolved (the action throws otherwise). A poll already in flight
  // when the manager marked one can answer AFTER the resolve with the row still listed; that
  // older answer must not put it back (Codex round 3 on #283, P1 — a reappearing row prompts a
  // duplicate dashboard refund). Forgotten once a fresh read no longer lists the id.
  const resolvedIds = useRef(new Set<string>());
  const [serverNow] = useState(() => new Date().toISOString());
  // W10b — degraded state with the moment it began. M34: the poll answers with a VERDICT now
  // (`pollPendingApprovals` — `signin` · `role` · `outage` · the rows; `lib/approvals-poll.ts`
  // decides it), so an expired session LEAVES for the login like every other board, a lowered role
  // leaves for the counter without these zones, and an unreadable queue is
  // a KNOWN outage ("we can't reach the ordering system"). Only a rejection the client itself
  // raises — `raceTimeout`, a dropped transport — is still a miss whose side nobody knows, and
  // that one stays `unknown`: the copy says "not updating", never a side there is no evidence
  // for (pre-merge review). The server render's own failed read (`initialOutage`) is known too.
  // `asOfIso`/`since`/`nowMs` are all this device's clock, so the escalation elapsed is
  // single-domain.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(() =>
    initialOutage ? nextDegraded(null, "outage", Date.now()) : null,
  );
  const [asOfIso, setAsOfIso] = useState(() => new Date().toISOString());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const inFlight = useRef(false);
  const rosterRef = useRef(approvers);
  // PD8 — the one receipt row (the last verdict), until "Got it" or the next verdict (appendix C2).
  const [receipt, setReceipt] = useState<ApprovalVerdict | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  // PD8 — where focus goes once the queue re-reads after a close (the next Decide, else the heading).
  const focusNextDecide = useRef(false);

  // ── Phase 2h (9f) ── polls never stack (`lib/poll-gate.ts`). Each tick reads THREE feeds, and a feed
  // `raceTimeout` gave up on at 15 s is still IN Next's one-at-a-time queue — a tick that started
  // three more after it only queued them behind the hung one, every 5 s. The gate watches the tick's
  // reads AS ONE (`Promise.allSettled` of the raw promises — shut until the LAST answers); the ticks it
  // refused are owed ONE tick, kicked just after. Made ONCE for the zone's life, on first use from a
  // callback (never during render, never in an effect's setup), never disposed from a cleanup (Strict
  // Mode would latch it): the kick is guarded by `alive`, re-armed at setup.
  const alive = useRef(true);
  const kick = useRef<() => void>(() => {});
  const gateRef = useRef<PollGate | null>(null);
  const gateOf = useCallback((): PollGate => {
    if (gateRef.current === null) {
      gateRef.current = createPollGate(() => {
        if (alive.current) kick.current();
      });
    }
    return gateRef.current;
  }, []);
  /** One missed tick — a failed, hung, or refused-past-the-bound one. Two in a row arm the freeze
   *  (cause `unknown`: no side is in evidence). */
  const miss = useCallback(() => {
    fails.current += 1;
    setNowMs(Date.now());
    if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
  }, []);

  const refresh = useCallback(async () => {
    // Phase 2h · critic B4 — a decision's LATE answer can land after the zone is gone (it left its
    // transition, so a navigation commits while it is out), and a late ok re-reads the queue: a dead
    // zone starts no read — nothing queued on the tab for a screen nobody is looking at.
    if (!alive.current) return;
    const gate = gateOf();
    const asked = gate.ask();
    if (asked.go === "owed") {
      // Phase 2h (9f) — a tick refused while a raw read has been out a hang's worth of time IS a miss.
      if (asked.missed) miss();
      return;
    }
    // A bare coalesce is safe: the owed kick is deferred past this tick's `finally`, and nothing below
    // is awaited after the reads.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      // The roster rides the same poll while it is still unknown — on its OWN promise, settled
      // separately (Codex round 1 on #283, P1): coupled in one `Promise.all`, a roster read that
      // kept failing rejected every poll and the QUEUE's good answers were thrown away with it —
      // new requests hidden behind the initial "all clear" for as long as the roster was down.
      // The queue is the board; the roster only gates the decision controls (`approvers === null`
      // reads "Loading…" in the step-up, never "No managers available"). Each arm carries its own
      // timeout, so a hung roster cannot stall the queue either.
      // The refunds-needed ledger rides the same poll, on its own promise too (Codex round 2 on
      // #283, P1): server-rendered once, the strip never re-read the ledger, so a charge the
      // webhook recorded after load stayed hidden until someone reloaded.
      // Phase 2h — the RAW reads, dispatched once: the gate watches them as one, and each is raced
      // on its own (a hung roster still never stalls the queue's answer).
      const rawQueue = pollPendingApprovals();
      const rawWho = rosterRef.current === null ? listApprovers() : null;
      const rawLedger = listRefundsNeeded();
      gate.watch(Promise.allSettled([rawQueue, rawWho, rawLedger]));
      const [queue, who, ledger] = await Promise.allSettled([
        raceTimeout(rawQueue, "read"),
        rawWho !== null ? raceTimeout(rawWho, "read") : Promise.resolve(rosterRef.current),
        raceTimeout(rawLedger, "read"),
      ]);
      // Phase 2h · review b (B1) — the reads can answer AFTER the zone is gone (queued behind another
      // screen's action): `alive` is re-checked after the await, before any side effect — a dead
      // zone's "go sign in" must not send the tablet away from the screen the manager moved to.
      if (!alive.current) return;
      // Each feed's settled answer is applied on its own, BEFORE the queue's failure is raised
      // (Codex round 3 on #283, P1): raised first, an approvals-table outage threw away every
      // good ledger read beside it and hid newly stranded charges until the queue recovered.
      if (who.status === "fulfilled") {
        rosterRef.current = who.value;
        setRoster(who.value);
      } else {
        console.error(
          "[ApprovalsBoard] approver roster read failed — decisions wait for the next poll",
          who.reason,
        );
      }
      if (ledger.status === "fulfilled") {
        const seen = new Set(ledger.value.map((r) => r.id));
        for (const id of resolvedIds.current) if (!seen.has(id)) resolvedIds.current.delete(id);
        setRefunds(ledger.value.filter((r) => !resolvedIds.current.has(r.id)));
        setLedgerStale(false);
      } else {
        // The last good rows stay (an empty strip must MEAN empty); a ledger that never loaded
        // keeps its honest outage line until a poll reads it, and one that loaded before says
        // it could not refresh.
        setLedgerStale(true);
        console.error(
          "[ApprovalsBoard] refunds-needed read failed — the strip keeps its last rows",
          ledger.reason,
        );
      }
      if (queue.status === "rejected") throw queue.reason;
      const poll = queue.value;
      if (!poll.ok) {
        // M34 — a genuinely expired/invalid staff session: the honest surface is the login (the
        // floor board's line). The counter's other boards would do this on their own poll within
        // one interval; this zone no longer waits for them.
        if (poll.reason === "signin") {
          leaveForLogin();
          return;
        }
        // Still signed in, no longer a manager (the role lowered under an open screen): the counter
        // re-rendered without these zones is the honest surface, not the login.
        if (poll.reason === "role") {
          leaveForHome();
          return;
        }
        // A KNOWN outage: the last good queue stays, and after two misses the freeze says which
        // side is down instead of "not updating".
        fails.current += 1;
        setNowMs(Date.now());
        if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "outage", Date.now()));
        return;
      }
      setSnap(poll.rows);
      setAsOfIso(new Date().toISOString());
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // Keep the last good queue on a transient error; flag stale after 2 misses (S2-audit S9).
      miss();
      console.error("[ApprovalsBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, [gateOf, miss]);
  useEffect(() => {
    kick.current = () => void refresh();
  }, [refresh]);

  useEffect(() => {
    alive.current = true; // re-armed at setup (Strict Mode runs cleanup between two setups)
    const id = setInterval(refresh, 5000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  // Slow escalation tick while stale (the ≥2min paper-flow flip needs a re-render).
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

  // Focus catch-all (WCAG 2.4.3; the KdsBoard pattern): an approve/deny drops the request card —
  // restore focus to the heading only when it fell to <body> from a real control (edge-triggered).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const zoneRef = useRef<HTMLElement>(null);
  // Set at interaction time too (onFocusCapture on the root) — closes the blind window where the FIRST
  // bump after load lands before any snapshot has sampled focus (Codex P2).
  const hadRealFocus = useRef(false);
  const markFocus = useCallback(() => {
    hadRealFocus.current = true;
  }, []);
  useEffect(() => {
    if (document.activeElement === document.body && hadRealFocus.current) {
      // PD8 — after a close (no receipt row): the next Decide, else the heading. After a verdict,
      // the receipt row (below) takes focus and this never runs.
      const next = focusNextDecide.current
        ? zoneRef.current?.querySelector<HTMLButtonElement>("[data-appr-decide]")
        : null;
      focusNextDecide.current = false;
      (next ?? headingRef.current)?.focus({ preventScroll: true });
    }
    hadRealFocus.current = document.activeElement !== document.body;
  }, [snap]);
  // A4·3 — `/staff/approvals` redirects onto this zone's fragment and the bar's approvals circle
  // jumps to it on the same page; the heading takes focus both ways (`useZoneFocus`, the one copy
  // of the rule since A4·5). The catch-all above keeps its ref: it fires on a bump, not a hash.
  useZoneFocus("appr-h");
  useZoneFocus("appr-zone", "appr-h"); // the strip's chip lands on the wrapper; focus goes to the heading

  const count = snap.length;
  // PD8 (m8 decisions 3 · 4) — the bar's circle reads THIS snapshot: one poll. A frozen queue is a
  // dashed ring with the as-of sentence; the count is never a false 0.
  useApprovalsCountPublish({
    count,
    frozen: degraded !== null,
    unknown: false,
    frozenCopy: degraded
      ? frozenBoardCopy(lang, asOfIso, nowMs - degraded.since, "what.list", degraded.cause)
      : null,
  });
  // PD8 — the receipt row takes focus once it mounts (its headline IS the announcement; B9: one channel).
  useEffect(() => {
    if (receipt) receiptRef.current?.focus({ preventScroll: true });
  }, [receipt]);

  function gotIt() {
    setReceipt(null);
    focusNextDecide.current = true;
    // The catch-all runs on a snapshot change; "Got it" changes none, so move focus here.
    const next = zoneRef.current?.querySelector<HTMLButtonElement>("[data-appr-decide]");
    focusNextDecide.current = false;
    (next ?? headingRef.current)?.focus({ preventScroll: true });
  }

  return (
    // The zone's ANCHOR (the strip's `#appr-zone` chip): the rails zone begins at the refunds strip,
    // not at the approvals heading below it (deep pass on #312). Focusable for the fragment jump,
    // named by the heading it groups.
    <div id="appr-zone">
      {/* The strip keeps its own region above the queue's, exactly as the page laid it out. */}
      <RefundsNeededStrip
        lang={lang}
        refunds={refunds}
        stale={ledgerStale}
        onResolved={(id) => {
          // The server confirmed (the action throws otherwise) — drop the row now, pin the id
          // against a poll already in flight, then re-poll.
          resolvedIds.current.add(id);
          setRefunds((prev) => (prev === null ? prev : prev.filter((r) => r.id !== id)));
          void refresh();
        }}
      />
      <section
        ref={zoneRef}
        aria-labelledby="appr-h"
        className="staff-zone"
        onFocusCapture={markFocus}
      >
        <div style={headRow}>
          <h2 id="appr-h" ref={headingRef} tabIndex={-1} className="staff-zone-head">
            {/* echo={false} is REQUIRED here, not a style choice: this heading is the
              `aria-labelledby` target of the section above, and the computed name is the
              element’s full text — an English echo would name the region twice, once per script. */}
            <Chrome lang={lang} k="table.appr.open" echo={false} />
          </h2>
          {/* P2 — every branch of this line is dictionary content, so the mark is unconditional.
              PLAIN text, not a live region (A4·2): the floor's region is the screen's one state
              region, and three regions flipping to the same frozen sentence in the same second is
              worse than one. No echo — a count line saying everything twice reads as two counts. */}
          <p
            lang={lang}
            style={{
              margin: 0,
              fontSize: "var(--fs-sm)",
              color: degraded ? "var(--warn)" : "var(--t2)",
            }}
          >
            {degraded
              ? frozenBoardCopy(lang, asOfIso, nowMs - degraded.since, "what.list", degraded.cause)
              : count === 0
                ? ts(lang, "table.appr.allclear")
                : tf(lang, "table.appr.waiting", { n: count })}
          </p>
        </div>

        {receipt && <ReceiptRow ref={receiptRef} verdict={receipt} onDone={gotIt} />}

        {count === 0 ? (
          // W10b — mid-freeze this must not read as an authoritative "queue clear", nor promise
          // arrivals this board can't currently hear about.
          <EmptyState
            title={
              <Chrome
                lang={lang}
                k={degraded ? "table.appr.empty.degraded" : "table.appr.empty"}
                echo="stack"
              />
            }
            subtitle={
              <Chrome
                lang={lang}
                k={degraded ? "table.appr.empty.outage" : "table.appr.empty.hint"}
                echo="stack"
              />
            }
          />
        ) : (
          <StaggerList
            items={snap}
            getKey={(a) => a.id}
            ariaLabel={sx(lang, "table.appr.a11y.queue")}
            style={grid}
            renderItem={(a) => (
              <RequestCard
                request={a}
                approvers={roster}
                serverNow={serverNow}
                onResolved={refresh}
                onVerdict={(v) => setReceipt(v)}
                onClosed={() => {
                  focusNextDecide.current = true;
                }}
              />
            )}
          />
        )}
      </section>
    </div>
  );
}

/** The dish in both scripts, the console's tongue first (`padDishName`). */
function Dish({ name, nameMy }: { name: string; nameMy: string | null }) {
  const lang = useStaffLang();
  const d = padDishName(lang, name, nameMy);
  return (
    <span>
      <span lang={d.lead.lang === lang && lang === "en" ? undefined : d.lead.lang}>
        {d.lead.text}
      </span>
      {d.echo && (
        <span className="appr-card-fact" style={{ display: "block" }} lang={d.echo.lang}>
          {d.echo.text}
        </span>
      )}
    </span>
  );
}

/** PD8 — the verdict's receipt row: the mark, the headline, the facts, "Got it". Focused on mount. */
function ReceiptRow({
  ref,
  verdict,
  onDone,
}: {
  ref: React.Ref<HTMLDivElement>;
  verdict: ApprovalVerdict;
  onDone: () => void;
}) {
  const lang = useStaffLang();
  const { request, decision, approverName } = verdict;
  const headKey: StaffKey =
    decision === "deny"
      ? "table.appr.verdict.kept"
      : request.kind === "comp"
        ? "table.appr.verdict.free"
        : "table.appr.verdict.removed";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="card appr-receipt mms-rise"
      style={{ marginBottom: "var(--s3)" }}
      data-appr-receipt={decision}
    >
      {/* The verdict mark: the Remove kind mark (never the ✓ disc — ✓ means paid on this counter),
          the gift disc, or the ✕ square for a Deny. */}
      {decision === "deny" ? (
        <span className="appr-mark appr-mark-lg appr-mark-deny" aria-hidden>
          <Icon name="close" size={18} />
        </span>
      ) : (
        <KindMark kind={request.kind} size="lg" />
      )}
      <div className="appr-receipt-words">
        <p className="appr-receipt-head" style={{ margin: 0 }}>
          <Chrome lang={lang} k={headKey} vars={{ x: approverName }} echo="stack" />
        </p>
        <p className="appr-receipt-sub" style={{ margin: 0 }}>
          <Dish name={request.lineName} nameMy={request.nameMy} />
          {" · "}
          {request.tableNumber != null || request.tableLabel ? (
            <Chrome
              lang={lang}
              k="floor.table"
              vars={{ id: request.tableNumber ?? request.tableLabel ?? "" }}
            />
          ) : (
            <Chrome lang={lang} k="table.appr.table" />
          )}
          {" · "}
          <Chrome lang={lang} k="table.appr.from" vars={{ x: request.initiatorName }} />
        </p>
      </div>
      <button type="button" className="staff-btn" onClick={onDone} style={quietBtn}>
        <Chrome lang={lang} k="help.done" echo="inline" />
      </button>
    </div>
  );
}

function RequestCard({
  request,
  approvers,
  serverNow,
  onResolved,
  onVerdict,
  onClosed,
}: {
  request: PendingApproval;
  approvers: Approver[] | null;
  serverNow: string;
  onResolved: () => void | Promise<void>;
  onVerdict: (v: ApprovalVerdict) => void;
  onClosed: () => void;
}) {
  const lang = useStaffLang();
  // P2e review (A5) — the device's echo state, the value <Chrome> reads: every name below that
  // composes an echoed label takes it too, so the name follows the mode the label renders in.
  const echoes = useEchoesShown();
  // PD8 — what this card IS: open (Approve · Deny), or close-only (paid · cleared · changed).
  const state = requestCardState({
    cartStatus: request.cartStatus,
    qty: request.qty,
    amountCents: request.amountCents,
    lineNow: request.lineNow,
  });
  const [open, setOpen] = useState(false);
  const decideRef = useRef<HTMLButtonElement>(null);
  // manager-4 — the Decide UNMOUNTS when the decision opens (the form takes its place): the form
  // takes focus when it opens; on cancel the Decide remounts and takes it back (edge-triggered).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) decideRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // `comp` / `void` are DB values, so each gets its own key rather than riding a slot: an English
  // status word interpolated into a Burmese sentence is the OPEN-ITEMS P2g shape one file over.
  const kindKey = request.kind === "comp" ? "table.appr.kind.comp" : "table.appr.kind.void";
  const cardKey = request.kind === "comp" ? "table.appr.card.comp" : "table.appr.card.void";
  // `guest_request` is read through the kind-aware map: the sheet meant two different things by it.
  const reasonKey =
    request.reasonCode === "guest_request"
      ? GUEST_REQUEST_KEY[request.kind]
      : REASON_KEY[request.reasonCode];
  const tableText =
    request.tableNumber != null ? String(request.tableNumber) : (request.tableLabel ?? null);

  return (
    <article
      className="card card-textured appr-card"
      data-open={open || undefined}
      data-appr-state={state}
      aria-label={tf(lang, cardKey, { x: request.lineName })}
    >
      {/* THE STRIP: the table's number as a link to its pane; the flag and the age (never coloured). */}
      <header className="appr-card-strip">
        {tableText !== null && request.sessionId ? (
          <SplitAwareLink
            href={`/staff/table/${request.sessionId}`}
            paneHref={paneUrl(request.sessionId)}
            className="appr-card-table staff-press"
          >
            <Chrome lang={lang} k="table.appr.table" />{" "}
            <span className="appr-card-number">{tableText}</span>
            <Icon name="chevron" size={16} />
          </SplitAwareLink>
        ) : (
          <span className="appr-card-table">
            {/* A counter/kiosk request carries no tent card, so the fallback is the bare noun. */}
            <Chrome lang={lang} k="table.appr.table" />
          </span>
        )}
        <span className="appr-card-age">
          {state === "paid" ? (
            <span className="appr-paid-word">
              <Chrome lang={lang} k="floor.status.paid" echo="inline" />
            </span>
          ) : (
            <>
              <Icon name="flag" size={16} className="appr-flag-glyph" />
              <RelativeTime iso={request.createdAt} serverNow={serverNow} />
            </>
          )}
        </span>
      </header>

      <div className="appr-card-body">
        {/* Row A: the kind mark + word, and the figure the manager acts on — the request's snapshot. */}
        <div className="appr-card-row">
          <span className="appr-card-kind">
            <KindMark kind={request.kind} />
            <span
              className={`appr-kind-word ${request.kind === "comp" ? "appr-kind-word-free" : ""}`}
            >
              <Chrome lang={lang} k={kindKey} echo="inline" />
            </span>
          </span>
          <span className="appr-card-amount">{fmt(request.amountCents)}</span>
        </div>
        {/* Row B: qty × the dish in both scripts; cooked is a FACT in --t2 (appendix B6). */}
        <div className="appr-card-row" style={{ alignItems: "flex-start" }}>
          <span className="appr-card-dish">
            {request.qty}× <Dish name={request.lineName} nameMy={request.nameMy} />
          </span>
          {request.cooked && (
            <span
              className="appr-card-fact"
              style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              <Icon name="flame" size={16} />
              <Chrome lang={lang} k="table.appr.cooked" echo="inline" />
            </span>
          )}
        </div>
        {/* Row C: the reason, and (collapsed) who asked. */}
        <p className="appr-card-fact" style={{ margin: 0 }}>
          {/* An UNDECLARED reason code still prints raw — see REASON_KEY’s docblock. */}
          {reasonKey ? <Chrome lang={lang} k={reasonKey} echo="inline" /> : request.reasonCode}
          {!open && (
            <>
              {" · "}
              <Chrome
                lang={lang}
                k="table.appr.from"
                vars={{ x: request.initiatorName }}
                echo="inline"
              />
            </>
          )}
        </p>
        {state === "changed" && (
          // The line moved after the ask (M184): a △ in warn plus the words, no fill (appendix B8).
          <p className="appr-changed">
            <Icon name="alert" size={16} />
            <span>
              {request.lineNow ? (
                <Chrome
                  lang={lang}
                  k="table.appr.changed.note"
                  vars={{
                    x: request.initiatorName,
                    n: request.lineNow.qty,
                    m: fmt(request.lineNow.qty * request.lineNow.unitPriceCents),
                  }}
                  echo="stack"
                />
              ) : (
                <Chrome
                  lang={lang}
                  k="table.appr.changed.goneNote"
                  vars={{ x: request.initiatorName }}
                  echo="stack"
                />
              )}
            </span>
          </p>
        )}
        {!open && (
          <button
            ref={decideRef}
            type="button"
            data-appr-decide=""
            onClick={() => setOpen(true)}
            className="staff-btn"
            style={decideBtn}
            aria-expanded={false}
            aria-label={
              al(lang, {
                kind: "verb",
                echo: "stack",
                shown: echoes,
                verb: "table.appr.verb.decide",
                subject: request.lineName,
              }).aria
            }
          >
            <Chrome lang={lang} k="table.appr.verb.decide" echo="stack" />
            <Icon name="chevron" size={18} />
          </button>
        )}
      </div>

      {open && (
        <ApprovalDecision
          request={request}
          state={state}
          approvers={approvers}
          onCancel={() => setOpen(false)}
          onResolved={onResolved}
          onVerdict={onVerdict}
          onClosed={onClosed}
        />
      )}
    </article>
  );
}

/**
 * PD8 — THE DECISION: the slip and the keys that ARE the decision. Shared by the request card and the
 * pane's centred sheet ("Decide it here"). `state` picks the keys: an OPEN request offers Deny and
 * Approve; a PAID / CLEARED / CHANGED one offers only "Close it" (→ `superseded`). Enter in the PIN
 * field submits the form, which REFUSES and says "Choose Approve or Deny." — two verbs share the field.
 * ONE live region per decision, existing only while it is open (A4·2); a verdict says nothing in it:
 * the receipt row takes focus instead (B9, one channel).
 */
export function ApprovalDecision({
  request,
  state,
  approvers,
  rosterFailed = false,
  retrying = false,
  onRetry,
  onCancel,
  onResolved,
  onVerdict,
  onClosed,
  hideCancel = false,
  sheet,
}: {
  request: Pick<
    PendingApproval,
    | "id"
    | "kind"
    | "lineName"
    | "nameMy"
    | "initiatorName"
    | "initiatorStaffId"
    | "tableNumber"
    | "tableLabel"
  >;
  state: RequestCardState;
  approvers: Approver[] | null;
  rosterFailed?: boolean;
  retrying?: boolean;
  onRetry?: () => Promise<boolean>;
  onCancel: () => void;
  onResolved: () => void | Promise<void>;
  onVerdict: (v: ApprovalVerdict) => void;
  /** A close landed (nothing was decided about food): no receipt row. */
  onClosed: () => void;
  /** The pane's sheet has its own ✕: no Cancel key. */
  hideCancel?: boolean;
  /** PD8 — "Decide it here": host the decision in the shipped centred Sheet (the pane's one primary
   *  stays Take cash, untouched behind the scrim — appendix B2). `busy` while the decision is out
   *  (M82: the resolve spends a PIN attempt and takes a dish off the bill); the ✕ is the way out. */
  sheet?: { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode };
}) {
  const lang = useStaffLang();
  const echoes = useEchoesShown();
  const closeOnly = state !== "open";
  const formRef = useRef<HTMLFormElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const firstTileRef = useRef<HTMLButtonElement>(null);
  // Decide → the PIN (one eligible, already lit) or else the first tile (A11Y, screen 2).
  useEffect(() => {
    (pinRef.current ?? firstTileRef.current ?? formRef.current)?.focus({ preventScroll: true });
  }, []);
  const [chosenApprover, setChosenApprover] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const { setLockLeft, locked, lockCopy } = useLockout(lang);
  // Phase 2h (9a · 9b) — busy is STATE cleared in `finally` around a BOUNDED await (it frees at the
  // bound), never a transition's `pending` — which held until the action ANSWERED, and with it every
  // other transition and every router commit on the tab (LEARNINGS #149 · #200). The ref is the guard
  // read at tap time (LEARNINGS #126); the state is what renders. The name stays `pending`.
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  // The key in flight, so its label can read "Working…" while the other stays.
  const [decision, setDecision] = useState<Decision | null>(null);
  // The region's waiting line promises a reload: its button stands beside the region.
  const [reload, setReload] = useState(false);
  // Phase 2h · critic B3 — a decision still out past the bound answers into THIS form (the card's only
  // region, and its Reload, live in it): Cancel refuses until the late answer lands. Cancelled, a late
  // refusal had no region left to be said in; re-opened, it read as the answer to the new attempt.
  // The ref is the tap-time guard (LEARNINGS #126); the state is what `aria-disabled` renders.
  const [late, setLate] = useState(false);
  const lateRef = useRef(false);
  // A late answer is said only while this card is mounted (9e).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // re-armed at setup (Strict Mode runs cleanup between two setups)
    return () => {
      alive.current = false;
    };
  }, []);

  // PD8 — the signers for THIS request: never the asker, except a close (D2: the asker may close).
  const eligible = signersFor(approvers, request.initiatorStaffId, closeOnly);
  const zero = zeroReasonFor(approvers, request.initiatorStaffId, closeOnly);
  const approverStaffId = litApproverId(chosenApprover, eligible);
  const approverName = eligible?.find((e) => e.staffId === approverStaffId)?.displayName ?? "";
  const pinOk = pin.length >= 4 && pin.length <= 8;
  const canConfirm = approverStaffId !== "" && pinOk && !pending && !locked;

  function cancel() {
    // §17 — the button says so with `aria-disabled`; refused here. Also while a decision's answer is
    // still owed to this form (critic B3).
    if (pendingRef.current || lateRef.current) return;
    onCancel();
  }

  /** The server's verdict, said — on time, or LATE (9e: a late refusal is said if the card is still
   *  here; a late ok re-reads the queue, which takes the card away). */
  function answered(res: Awaited<ReturnType<typeof resolveApproval>>): void | Promise<void> {
    if (res.ok) {
      // PD8 — the receipt row (the one channel, B9), or a close: focus goes to the next Decide.
      if (res.decision === "close") onClosed();
      else onVerdict({ request, decision: res.decision, approverName });
      // Critic B2 — a LATE ok retires "no answer yet" (its Reload already went): the decision is
      // recorded, and the queue's re-read takes the card away. On time the region is already empty.
      if (alive.current) setMsg(null);
      return onResolved();
    }
    if (!alive.current) return;
    setPin("");
    switch (res.reason) {
      case "pin_wrong":
      case "pin_locked":
        setMsg(pinFailureCopy(res, setLockLeft)); // S2-audit S13: shared PIN-failure copy
        pinRef.current?.focus({ preventScroll: true }); // the emptied field takes focus
        break;
      case "pin_no_pin":
        setMsg(PIN_NO_PIN_COPY);
        break;
      case "bad_approver":
        setMsg({ k: "pin.badApprover.requester" });
        break;
      case "step_up_rate_limited":
        setMsg({ k: "pin.rateLimited" });
        break;
      case "already":
        setMsg({ k: "table.appr.msg.already" });
        void onResolved();
        break;
      case "stale":
      case "changed":
        // M184 — the line is no longer the one asked about: nothing was taken off; the re-read
        // draws the changed band and its "Close it".
        setMsg({ k: "table.appr.msg.stale" });
        void onResolved();
        break;
      case "still_open":
        setMsg({ k: "table.appr.msg.stillOpen" });
        void onResolved();
        break;
      case "not_open":
        setMsg({ k: "table.appr.msg.notOpen" });
        void onResolved();
        break;
      case "in_flight":
        setMsg({ k: "table.appr.msg.inFlight" });
        break;
      case "outage":
        // W10b — nothing was recorded and the request is STILL PENDING; never imply the PIN or
        // the request was the problem.
        setMsg({ k: "table.appr.msg.outage" });
        break;
      default:
        setMsg({ k: "table.appr.msg.failed" });
    }
  }

  /** Enter in the PIN field submits the form — refused: two verbs share the field (one verb only
   *  on the close-only card, where Enter is that key). */
  function submit(e: FormEvent) {
    e.preventDefault();
    if (closeOnly) {
      void decide("close");
      return;
    }
    setMsg({ k: "table.appr.chooseKey" });
  }

  async function decide(d: Decision) {
    const decision = d;
    if (!canConfirm || pendingRef.current) {
      // §17 — refused out loud: the key is aria-disabled, never native; the region says what is missing.
      if (!pendingRef.current && approverStaffId === "") setMsg({ k: "pin.manager.pick" });
      else if (!pendingRef.current && !pinOk) setMsg({ k: "pin.label" });
      return;
    }
    // 9d — an approval removes food from a bill or gives it away (a void or a comp). Refused AT THE
    // TAP, never dispatched, while any action on this tab has gone unanswered past the bound: sent,
    // it would only queue behind the stuck one, to land minutes later. Read now, never from render.
    // Owner decision (Phase 2h · A1): KEEP this refusal — an approval authorizes a refund or void.
    // Owner decision (Phase 2h · integration): while THIS card's own decision is still out past the
    // bound (its PIN cleared, typed again), the refusal re-says ITS line ("Don't decide again"),
    // never the tablet's "this did nothing" (`tapRefusal`).
    const refused = tapRefusal<StaffKey>(
      lateRef.current ? "table.appr.msg.waiting" : null,
      stalledSince(),
      "out.stalled",
    );
    if (refused !== null) {
      setMsg({ k: refused });
      setReload(true);
      return;
    }
    setMsg(null);
    setReload(false);
    pendingRef.current = true;
    setPending(true);
    setDecision(decision);
    try {
      // 9b — called OUTSIDE any transition, awaited bounded: the RAW action promise.
      const out = await boundWrite(
        resolveApproval({ approvalId: request.id, decision, approverStaffId, pin }),
      );
      if (out.kind === "answer") {
        // Not awaited (M82): the re-read it starts is the queue's own bounded poll, and the receipt
        // row — not a held busy — is what stands in for the card once the verdict lands.
        void answered(out.value);
        return;
      }
      // No answer, or a lost one: the decision may be recorded. The PIN is cleared either way (a
      // second decision is exactly what the sentence says not to make), and the queue re-reads.
      setPin("");
      void onResolved();
      if (out.kind === "threw") {
        // Today's rejection reached the error boundary; a lost answer is "we couldn't confirm".
        setMsg({ k: "table.appr.msg.unknown" });
        return;
      }
      setMsg({ k: "table.appr.msg.waiting" });
      setReload(true);
      lateRef.current = true;
      setLate(true);
      void out.late.then((late) => {
        lateRef.current = false;
        if (alive.current) {
          setLate(false);
          setReload(false);
        }
        if (late.kind === "answer") void answered(late.value);
        else if (alive.current) setMsg({ k: "table.appr.msg.unknown" });
      });
    } finally {
      pendingRef.current = false;
      setPending(false); // frees AT THE BOUND (fact 3), whatever the action is doing
      if (alive.current) setDecision(null);
    }
  }

  // The lockout countdown takes precedence over a transient message.
  const shown = lockCopy ?? msg;
  // Critic F1 — every SET of the message (a re-tap's refusal re-says the standing waiting line)
  // replaces the region's content, so the re-said sentence is announced, not swallowed as no change.
  const said = useResaid(msg);
  const legendId = `appr-q-${request.id}`;
  const keyName = (verb: VerbKey) =>
    al(lang, { kind: "verb", echo: "stack", shown: echoes, verb, subject: request.lineName }).aria;
  const keyStyle = (on: boolean): CSSProperties => ({
    ...actionBtn,
    opacity: canConfirm || on ? 1 : 0.6,
  });
  const form = (
    <form
      ref={formRef}
      tabIndex={-1}
      aria-labelledby={legendId}
      onSubmit={submit}
      className="appr-card-decision"
      noValidate
    >
      <span id={legendId} className="sr-only">
        <Chrome lang={lang} k="table.loss.managerLegend" />
      </span>
      {closeOnly && (
        // The close-only inset: what happened, derived from the cart's status; the payments link.
        <>
          <p className="appr-close-note">
            {state === "paid" ? (
              request.tableNumber != null ? (
                <Chrome
                  lang={lang}
                  k="table.appr.paid.note"
                  vars={{ t: request.tableNumber, x: request.lineName }}
                  echo="stack"
                />
              ) : (
                <Chrome
                  lang={lang}
                  k="table.appr.paid.noteCounter"
                  vars={{ x: request.lineName }}
                  echo="stack"
                />
              )
            ) : state === "cleared" ? (
              <Chrome lang={lang} k="table.appr.cleared.note" echo="stack" />
            ) : (
              <Chrome
                lang={lang}
                k="table.appr.changed.goneNote"
                vars={{ x: request.initiatorName }}
                echo="stack"
              />
            )}
          </p>
          {state === "paid" && (
            <a href="#settled-h" className="staff-btn" style={quietLink}>
              <Chrome lang={lang} k="floor.settled.head" echo="inline" /> →
            </a>
          )}
        </>
      )}
      <ApprovalSlip
        idPrefix={`appr-${request.id}`}
        askerName={request.initiatorName}
        eligible={eligible}
        zero={zero}
        rosterFailed={rosterFailed}
        retrying={retrying}
        onRetry={onRetry}
        lit={approverStaffId}
        onPick={(id) => {
          setChosenApprover(id);
          pinRef.current?.focus({ preventScroll: true });
        }}
        pin={pin}
        onPinChange={setPin}
        locked={locked}
        pinRef={pinRef}
        firstTileRef={firstTileRef}
      />
      {zero === null && (
        <div className="appr-keys">
          {closeOnly ? (
            // ONE paper key: Close it (→ superseded). Never an Approve, so "no longer open — deny it"
            // can no longer be reached.
            <button
              type="button"
              onClick={() => void decide("close")}
              aria-disabled={!canConfirm || undefined}
              aria-busy={pending || undefined}
              className="staff-btn"
              style={{ ...keyStyle(decision === "close"), ...paperKey }}
              aria-label={keyName("table.appr.verb.close")}
            >
              {pending ? (
                <Chrome lang={lang} k="table.appr.working" />
              ) : (
                <Chrome lang={lang} k="table.appr.verb.close" echo="stack" />
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void decide("deny")}
                aria-disabled={!canConfirm || undefined}
                aria-busy={(pending && decision === "deny") || undefined}
                className="staff-btn"
                style={{ ...keyStyle(decision === "deny"), ...paperKey }}
                aria-label={keyName("table.appr.verb.deny")}
              >
                <Icon name="close" size={20} className="appr-key-glyph" />
                {pending && decision === "deny" ? (
                  <Chrome lang={lang} k="table.appr.working" />
                ) : (
                  <Chrome lang={lang} k="table.appr.verb.deny" echo="stack" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void decide("approve")}
                aria-disabled={!canConfirm || undefined}
                aria-busy={(pending && decision === "approve") || undefined}
                className="staff-btn"
                style={{ ...keyStyle(decision === "approve"), ...approveKey }}
                aria-label={keyName("table.appr.verb.approve")}
              >
                {/* The request's kind mark on Approve (appendix C3): a check never means an approval. */}
                <KindMark kind={request.kind} size="sm" />
                {pending && decision === "approve" ? (
                  <Chrome lang={lang} k="table.appr.working" />
                ) : (
                  <Chrome lang={lang} k="table.appr.verb.approve" echo="stack" />
                )}
              </button>
            </>
          )}
        </div>
      )}
      {!hideCancel && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={cancel}
            aria-disabled={pending || late || undefined}
            className="staff-btn"
            style={quietBtn}
          >
            <Chrome lang={lang} k="table.appr.verb.cancel" echo="inline" />
          </button>
        </div>
      )}
      {/* The card's live region exists only once a decision is open — it speaks about the
          manager's own tap, never on load (the screen's one state region is the floor's). */}
      <p id={`appr-msg-${request.id}`} role="status" style={{ margin: 0, minHeight: 20 }}>
        {shown && (
          <span key={said} style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
            <MsgText lang={lang} msg={shown} />
          </span>
        )}
      </p>
      {/* Phase 2h — the stalled refusal and the waiting line both say "reload the page"; the
          console installs standalone (no browser reload), so the button they promise stands
          BESIDE the card's one region — never inside it. */}
      {reload && (
        <div className="mms-rise">
          <ReloadButton lang={lang} block />
        </div>
      )}
    </form>
  );
  if (!sheet) return form;
  return (
    <Sheet
      open={sheet.open}
      onOpenChange={sheet.onOpenChange}
      busy={pending}
      closeLabel={sheetCloseLabel(lang)}
      title={sheet.title}
    >
      {form}
    </Sheet>
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
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
};
const decideBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  minHeight: 54,
  marginTop: 4,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const actionBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 64,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const approveKey: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const paperKey: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
const quietBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  border: "none",
  background: "transparent",
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const quietLink: CSSProperties = {
  ...quietBtn,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-start",
  padding: 0,
  textDecoration: "none",
};
