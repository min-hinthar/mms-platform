"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  listRefundsNeeded,
  pollPendingApprovals,
  resolveApproval,
  type PendingApproval,
  type RefundNeeded,
} from "@/lib/approvals";
import { leaveForLogin } from "@/lib/staff-leave";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { listApprovers, type Approver } from "@/lib/voids";
import { EmptyState } from "@mms/ui";
import { RefundsNeededStrip } from "./RefundsNeededStrip";
import { RelativeTime } from "./RelativeTime";
import { StaggerList } from "./StaggerList";
import { ManagerPinFields, PIN_NO_PIN_COPY, pinFailureCopy, useLockout } from "./ManagerPinStepUp";
import { useStaffLang } from "./StaffLangProvider";
import { useZoneFocus } from "./ZoneFocus";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";

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

/**
 * The manager approvals queue (S2.4 · A4·3 a zone of the counter's one screen) — server-rendered
 * snapshot kept live by a 5s POLL (mms_approvals is owner-read RLS, so it's not on the realtime
 * publication; requests/resolves are low-frequency, so a poll is the right tool). Each request
 * resolves via the manager-PIN step-up (tap your name → PIN), so it works on a shared tablet
 * regardless of who's signed in; the server re-checks role + self + once-only.
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
  // (`pollPendingApprovals` — `signin` · `outage` · the rows; `lib/approvals-poll.ts` decides it),
  // so an expired session LEAVES for the login like every other board, and an unreadable queue is
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

  const refresh = useCallback(async () => {
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
      const [queue, who, ledger] = await Promise.allSettled([
        raceTimeout(pollPendingApprovals()),
        rosterRef.current === null
          ? raceTimeout(listApprovers())
          : Promise.resolve(rosterRef.current),
        raceTimeout(listRefundsNeeded()),
      ]);
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
      fails.current += 1;
      setNowMs(Date.now());
      if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
      console.error("[ApprovalsBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
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
  // A4·3 — `/staff/approvals` redirects onto this zone's fragment and the bar's approvals circle
  // jumps to it on the same page; the heading takes focus both ways (`useZoneFocus`, the one copy
  // of the rule since A4·5). The catch-all above keeps its ref: it fires on a bump, not a hash.
  useZoneFocus("appr-h");

  const count = snap.length;

  return (
    <>
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
      <section aria-labelledby="appr-h" className="staff-zone" onFocusCapture={markFocus}>
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
              />
            )}
          />
        )}
      </section>
    </>
  );
}

function RequestCard({
  request,
  approvers,
  serverNow,
  onResolved,
}: {
  request: PendingApproval;
  approvers: Approver[] | null;
  serverNow: string;
  onResolved: () => void | Promise<void>;
}) {
  const lang = useStaffLang();
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  // manager-4 — the Approve/Deny row UNMOUNTS when a decision opens (the form takes its place), so
  // the tap used to leave focus on <body> and the PIN step opened unannounced. The form takes focus
  // when it opens; on cancel the row remounts and the button that was tapped takes it back
  // (`lastOpened` says which — the ClearTableButton shape, edge-triggered so a first mount never
  // grabs focus).
  const [lastOpened, setLastOpened] = useState<"approve" | "deny" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const isOpen = decision !== null;
    if (isOpen && !wasOpen.current) formRef.current?.focus();
    else if (!isOpen && wasOpen.current) openerRef.current?.focus();
    wasOpen.current = isOpen;
  }, [decision]);
  const [approverStaffId, setApproverStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const { setLockLeft, locked, lockCopy } = useLockout(lang);
  const [pending, startTransition] = useTransition();

  // `comp` / `void` are DB values, so each gets its own key rather than riding a slot: an English
  // status word interpolated into a Burmese sentence is the OPEN-ITEMS P2g shape one file over.
  const kindKey = request.kind === "comp" ? "table.appr.kind.comp" : "table.appr.kind.void";
  const cardKey = request.kind === "comp" ? "table.appr.card.comp" : "table.appr.card.void";
  // `guest_request` is read through the kind-aware map: the sheet meant two different things by it.
  const reasonKey =
    request.reasonCode === "guest_request"
      ? GUEST_REQUEST_KEY[request.kind]
      : REASON_KEY[request.reasonCode];
  const confirmKey =
    decision === "approve"
      ? request.kind === "comp"
        ? "table.appr.confirm.approveComp"
        : "table.appr.confirm.approveVoid"
      : "table.appr.confirm.deny";
  const pinOk = pin.length >= 4 && pin.length <= 8;
  const canConfirm = !!decision && !!approverStaffId && pinOk && !pending && !locked;

  function open(d: "approve" | "deny") {
    setDecision(d);
    setLastOpened(d);
    setMsg(null);
  }
  function cancel() {
    if (pending) return; // §17 — the button says so with `aria-disabled`; the refusal is here
    setDecision(null);
    setPin("");
    setMsg(null);
  }

  function confirm(e: FormEvent) {
    e.preventDefault();
    if (!canConfirm || !decision) return;
    setMsg(null);
    startTransition(async () => {
      const res = await resolveApproval({ approvalId: request.id, decision, approverStaffId, pin });
      if (res.ok) {
        await onResolved(); // pending covers the refetch — the card drops off before the form re-enables
        return;
      }
      setPin("");
      switch (res.reason) {
        case "pin_wrong":
        case "pin_locked":
          setMsg(pinFailureCopy(res, setLockLeft)); // S2-audit S13: shared PIN-failure copy
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
          onResolved();
          break;
        case "stale":
          setMsg({ k: "table.appr.msg.stale" });
          onResolved();
          break;
        case "not_open":
          setMsg({ k: "table.appr.msg.notOpen" });
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
    });
  }

  // The lockout countdown takes precedence over a transient message.
  const shown = lockCopy ?? msg;
  return (
    <article
      className="card card-textured"
      style={cardStyle}
      aria-label={tf(lang, cardKey, { x: request.lineName })}
    >
      <header style={cardHead}>
        <span style={{ fontWeight: 700, fontSize: "var(--fs-body)" }}>
          {/* A counter/kiosk request carries no tent card, so the fallback is the bare noun. */}
          {request.tableLabel ? (
            <Chrome lang={lang} k="floor.table" vars={{ id: request.tableLabel }} />
          ) : (
            <Chrome lang={lang} k="table.appr.table" />
          )}
        </span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          <RelativeTime iso={request.createdAt} serverNow={serverNow} />
        </span>
      </header>

      <p style={{ margin: 0, fontSize: "var(--fs-body)" }}>
        {/* No echo on the kind badge — it is chip-sized, and two scripts cannot legibly stack in a
            chip. `.chrome-my` restores the face and resets the badge’s tracking; the badge’s
            uppercase is a no-op on Myanmar, which has no case. */}
        <span style={kindBadge}>
          <Chrome lang={lang} k={kindKey} />
        </span>{" "}
        {request.qty}× {request.lineName}
        <span style={{ color: "var(--t2)" }}> · {fmt(request.amountCents)}</span>
        {request.cooked && (
          <span style={{ color: "var(--warn)", fontWeight: 700 }}>
            {" · "}
            <Chrome lang={lang} k="table.appr.cooked" />
          </span>
        )}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
        {/* An UNDECLARED reason code still prints raw — see REASON_KEY’s docblock. */}
        {reasonKey ? <Chrome lang={lang} k={reasonKey} /> : request.reasonCode} ·{" "}
        <Chrome lang={lang} k="table.appr.from" vars={{ x: request.initiatorName }} />
      </p>

      {decision === null ? (
        <div style={btnRow}>
          {/* Every card in the grid shows these same two words, so the name carries the dish the
              decision lands on. The SAME key renders as the button’s visible label, so WCAG 2.5.3
              containment holds by construction (guard rule 3c). */}
          <button
            ref={lastOpened === "approve" ? openerRef : undefined}
            type="button"
            onClick={() => open("approve")}
            className="staff-btn"
            style={{ ...actionBtn, ...approveBtn }}
            aria-label={
              al(lang, {
                kind: "verb",
                echo: "stack",
                verb: "table.appr.verb.approve",
                subject: request.lineName,
              }).aria
            }
          >
            <Chrome lang={lang} k="table.appr.verb.approve" echo="stack" />
          </button>
          <button
            ref={lastOpened === "deny" ? openerRef : undefined}
            type="button"
            onClick={() => open("deny")}
            className="staff-btn"
            style={{ ...actionBtn, ...denyBtn }}
            aria-label={
              al(lang, {
                kind: "verb",
                echo: "stack",
                verb: "table.appr.verb.deny",
                subject: request.lineName,
              }).aria
            }
          >
            <Chrome lang={lang} k="table.appr.verb.deny" echo="stack" />
          </button>
        </div>
      ) : (
        <form
          ref={formRef}
          tabIndex={-1}
          aria-labelledby={`appr-q-${request.id}`}
          onSubmit={confirm}
          style={{ marginTop: 4, outline: "none" }}
          noValidate
        >
          <p
            id={`appr-q-${request.id}`}
            style={{ margin: "0 0 8px", fontSize: "var(--fs-sm)", fontWeight: 600 }}
          >
            <Chrome lang={lang} k={confirmKey} echo="stack" />
          </p>
          <ManagerPinFields
            idPrefix={`appr-${request.id}`}
            approvers={approvers}
            approverStaffId={approverStaffId}
            onApproverChange={setApproverStaffId}
            pin={pin}
            onPinChange={setPin}
            locked={locked}
          />
          <div style={btnRow}>
            <button
              type="submit"
              // §17 (K35) — never native: `confirm` refuses on the same predicate, the dim stays.
              aria-disabled={!canConfirm || undefined}
              aria-busy={pending || undefined}
              className="staff-btn"
              style={{
                ...actionBtn,
                ...(decision === "approve" ? approveBtn : denyBtn),
                opacity: canConfirm ? 1 : 0.6,
              }}
            >
              {/* No aria-label on this one, deliberately: its visible label SWAPS to "Working…"
                  mid-submit, and a fixed name would then no longer contain the visible text. The
                  label alone is the honest name. */}
              {pending ? (
                <Chrome lang={lang} k="table.appr.working" />
              ) : decision === "approve" ? (
                <Chrome lang={lang} k="table.appr.verb.confirmApprove" echo="stack" />
              ) : (
                <Chrome lang={lang} k="table.appr.verb.confirmDeny" echo="stack" />
              )}
            </button>
            <button
              type="button"
              onClick={cancel}
              aria-disabled={pending || undefined}
              className="staff-btn"
              style={{ ...actionBtn, ...cancelBtn }}
            >
              <Chrome lang={lang} k="table.appr.verb.cancel" echo="stack" />
            </button>
          </div>
          {/* The card's live region exists only once a decision is open — it speaks about the
              manager's own tap, never on load (the screen's one state region is the floor's). */}
          <p
            id={`appr-msg-${request.id}`}
            role="status"
            style={{ margin: "8px 0 0", minHeight: 16 }}
          >
            {shown && (
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
                <MsgText lang={lang} msg={shown} />
              </span>
            )}
          </p>
        </form>
      )}
    </article>
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
const cardStyle: CSSProperties = { padding: "var(--s4)", display: "grid", gap: 6 };
const cardHead: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s3)",
};
const kindBadge: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ac-strong)",
};
const btnRow: CSSProperties = { display: "flex", gap: 8, marginTop: 10 };
const actionBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  cursor: "pointer",
};
const approveBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const denyBtn: CSSProperties = { background: "var(--cd)", color: "var(--warn)" };
const cancelBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
