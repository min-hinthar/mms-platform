"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, type ButtonVariant } from "@mms/ui";
import { settleCard, terminalStatus, cancelTerminal } from "@/lib/terminal";
import { inFlightMsg, type InFlightHolder } from "@/lib/inflight-refusal";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2c · gate ──
import { settleBlockedMsg } from "@/lib/staff-send-view";

/**
 * P2 — the two error sources on this surface, kept APART.
 *
 * `kind: "server"` is a sentence the Server Action returned, so it goes through `<OutageText>`
 * (which swaps the one write-outage twin and passes everything else through verbatim).
 * `kind: "local"` is copy THIS file authors for a thrown/rejected action — routing that through
 * `<OutageText>` would pass it through as English forever while looking converted, so it branches
 * to its own dictionary key instead.
 *
 * `kind: "inflight"` (Phase 2c · register, P2w) — the start was refused while money is already
 * moving on the table; `holder` picks the `settle.inflight.*` key (never the server's English).
 */
type SettleError =
  | { kind: "server"; text: string }
  | { kind: "local" }
  | { kind: "inflight"; holder: InFlightHolder }
  // Phase 2c · gate — the settle gate refused the start (dishes the kitchen never got), with the
  // server's count. Shown here, SAID by the page's one region (the jump hands it up).
  | { kind: "unsent"; units: number };

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const POLL_MS = 2500;
/** Consecutive failed polls before the panel admits it's blind (Stripe unreachable). */
const BLIND_AFTER_MISSES = 3;
/** How long "Recording the order…" may claim progress before escalating honestly. */
const RECORDING_ESCALATE_MS = 20_000;

/**
 * Card-present settle at the register (W6c). Two halves, split on purpose:
 *
 *  - `TerminalSettleButton` starts the collect. It lives INSIDE the open-cart settle section — and
 *    unmounts seconds after starting (the settlement freeze flips `paymentInFlight`, which unmounts
 *    the whole section on the next detail refresh).
 *  - `TerminalCollectPanel` is the live collect window. Its state lives in the PARENT
 *    (FloorDetailLive) exactly like the cash handoff card — the W6a confirmed-HIGH lesson: any UI
 *    that must outlive the settle section cannot keep its state inside it.
 *
 * The button never sends an amount; the panel's poll (`terminalStatus`) is also what keeps the
 * settlement freeze alive across a slow chip interaction (server-side `extendSettlement`).
 */

export type TerminalCollect = { paymentIntentId: string; totalCents: number };

/** What the collect panel says, handed to the page's ONE polite region (P2r) — the panel shows the
 *  same words visibly but is no live region of its own. `tone` colours nothing here; the page's
 *  region reads it for its precedence and tint. */
export type ReaderStatus = { tone: "ok" | "warn"; msg: StaffMsg };

export function TerminalSettleButton({
  sessionId,
  totalCents,
  variant = "secondary",
  onStarted,
  blocked = false,
  blockedNoteId,
  onBlockedTap,
}: {
  sessionId: string;
  totalCents: number;
  /** Phase 2c — the reader is never the settle section's primary (`settlePrimary`, owner decision
   *  8): it sits BELOW cash as a secondary. The prop exists so that decision stays one line. */
  variant?: Extract<ButtonVariant, "primary" | "secondary">;
  onStarted: (c: TerminalCollect) => void;
  /** Phase 2c · gate — the settle gate holds (read by the page): `aria-disabled`, described by the
   *  page's note, and a tap starts NO reader — it hands up (`onBlockedTap`). */
  blocked?: boolean;
  /** The page's note that says why — prepended to the trigger's description while blocked. */
  blockedNoteId?: string;
  /** A refused tap (`null` — the page's count is the reading), or the server's `unsent` refusal
   *  (its count): the page says why in its one region and moves focus to the Send. */
  onBlockedTap?: (units: number | null) => void;
}) {
  const lang = useStaffLang();
  const [busy, setBusy] = useState(false);
  // The tap-time guard: a REF, read when the finger lands (two taps in one frame both read the
  // render before `busy`).
  const inFlight = useRef(false);
  const [error, setError] = useState<SettleError | null>(null);

  async function start() {
    if (inFlight.current) return;
    if (blocked) {
      // Phase 2c · gate — refused at the tap: no reader, no freeze; the page names the fix.
      setError(null);
      onBlockedTap?.(null);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await settleCard({ sessionId });
      setBusy(false);
      if (!res.ok) {
        setError(
          res.code === "inflight"
            ? { kind: "inflight", holder: res.holder }
            : res.code === "unsent"
              ? { kind: "unsent", units: res.units }
              : { kind: "server", text: res.error },
        );
        // Phase 2c · gate — a raced refusal (a guest's dish landed after the page's last read):
        // the page says it in its one region and takes the cashier to the Send.
        if (res.code === "unsent") onBlockedTap?.(res.units);
        return;
      }
      onStarted({ paymentIntentId: res.paymentIntentId, totalCents: res.totalCents });
    } catch {
      // A rejected action (Next redacts the message in prod) must never latch the button on
      // "Starting…" — the W10c bug class.
      setBusy(false);
      setError({ kind: "local" });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div>
      {/* Phase 2c — a `@mms/ui` Button: busy is aria-busy + aria-disabled with the label kept as a
          stated word, never a native `disabled` that drops focus to <body> under the tap (K35). */}
      <Button
        variant={variant}
        size="xl"
        block
        busy={busy}
        busyLabel={<Chrome lang={lang} k="settle.reader.starting" echo={false} />}
        // Phase 2c · gate — the attribute (spread only when set) plus `start`'s own guard.
        {...(blocked ? { "aria-disabled": true } : {})}
        aria-describedby={
          blocked && blockedNoteId ? `${blockedNoteId} terminal-hint` : "terminal-hint"
        }
        onClick={start}
      >
        <Chrome lang={lang} k="settle.reader.trigger" vars={{ m: fmt(totalCents) }} echo="stack" />
      </Button>
      <p id="terminal-hint" style={hint}>
        <Chrome lang={lang} k="settle.reader.hint" echo="stack" />
      </p>
      {/* Phase 2c · gate — the settle gate's refusal is SHOWN here but SAID by the page's one polite
          region (the jump hands it up), so it carries no role of its own; once the page's note
          under the triggers says the same (the page read the drafts), this line gives way to it. */}
      {error?.kind === "unsent" && !blocked && (
        <p style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          <Chrome
            lang={lang}
            k={settleBlockedMsg(error.units, false).k}
            vars={settleBlockedMsg(error.units, false).vars}
            echo={false}
          />
        </p>
      )}
      {error && error.kind !== "unsent" && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.text} />
          ) : error.kind === "inflight" ? (
            <Chrome
              lang={lang}
              k={inFlightMsg(error.holder).k}
              vars={inFlightMsg(error.holder).vars}
              echo={false}
            />
          ) : (
            <Chrome lang={lang} k="settle.reader.startFailed" echo={false} />
          )}
        </p>
      )}
    </div>
  );
}

type PanelPhase = "collecting" | "recording" | "failed" | "canceled";

/**
 * The live collect window: polls the PI's truth until it lands somewhere terminal. On success it
 * hands the counter's paid order up (the parent maps it into the canonical paid card — no tip, no
 * tender: the reader records neither) — for a table settle there is no card; the detail's paid state
 * is the quiet signal. `onDone(null)` just dismisses.
 *
 * Phase 2c — the panel's status is SAID through the page's one polite region (`onStatus`, P2r) and
 * SHOWN here as plain text; the settle that lands re-reads the page's own detail (`onChanged`), not a
 * `router.refresh()` that updated nothing the page reads.
 */
export function TerminalCollectPanel({
  sessionId,
  collect,
  isCounter,
  onDone,
  onStatus,
  onChanged,
}: {
  sessionId: string;
  collect: TerminalCollect;
  isCounter: boolean;
  onDone: (h: { orderId: string; totalCents: number } | null) => void;
  /** The page's ONE polite region takes the panel's status (and a cancel refusal) from here. */
  onStatus?: (s: ReaderStatus) => void;
  /** The page's own detail refresh. */
  onChanged?: () => void;
}) {
  const lang = useStaffLang();
  const [phase, setPhase] = useState<PanelPhase>("collecting");
  // ⚠️ NOT an <OutageText> candidate, and the reason is narrower than "it is a server string".
  // `failCopy` is set ONLY in the `res.state === "failed"` arm below, whose `error` is
  // `declineCopy(intent.last_payment_error.code)` (lib/terminal.ts) — a card-decline sentence, which
  // has no Burmese twin. The arm that CAN carry STAFF_WRITE_OUTAGE is `!res.ok`, and this component
  // swallows that into `pollMisses` without rendering it. So wrapping this would be a behavioural
  // no-op (OutageText passes every non-twin sentence through verbatim) and would imply a swap that
  // can never happen. What it actually needs is a twin per decline reason, which is a dictionary
  // question, not a rendering one.
  const [failCopy, setFailCopy] = useState<string | null>(null);
  // Consecutive poll misses — past the threshold the panel admits it can't see Stripe instead of
  // claiming a live wait it isn't actually watching (review finding: the honest server copy was
  // dead code and the freeze-extension silently stopped).
  const [pollMisses, setPollMisses] = useState(0);
  // When the recording phase started — bounds how long "Recording…" may claim progress.
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<SettleError | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The settle section unmounts under the cashier as the freeze lands — carry focus here.
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (phase === "failed" || phase === "canceled") return; // terminal — stop polling
    let stopped = false;
    const tick = async () => {
      setNowMs(Date.now());
      const res = await terminalStatus({
        sessionId,
        paymentIntentId: collect.paymentIntentId,
      }).catch(() => null);
      if (stopped) return;
      if (!res || !res.ok) {
        // Transient miss (Stripe/staff-session hiccup) — count it so the panel can stop claiming
        // a live wait; the next interval retries and Cancel stays available.
        setPollMisses((n) => n + 1);
        return;
      }
      setPollMisses(0);
      if (res.state === "succeeded") {
        if (res.orderId) {
          onDone(isCounter ? { orderId: res.orderId, totalCents: res.totalCents } : null);
          onChanged?.();
        } else {
          setPhase("recording"); // charged; the webhook is landing the order — keep polling
          setRecordingSince((t) => t ?? Date.now());
        }
      } else if (res.state === "failed") {
        setPhase("failed");
        setFailCopy(res.error);
      } else if (res.state === "canceled") {
        setPhase("canceled");
      }
    };
    const id = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll keyed on the PI + phase; onDone/onChanged read from the closure per tick
  }, [collect.paymentIntentId, sessionId, phase]);

  const cancelInFlight = useRef(false);
  async function cancel() {
    if (cancelInFlight.current) return;
    cancelInFlight.current = true;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const res = await cancelTerminal({ sessionId, paymentIntentId: collect.paymentIntentId });
      setCancelBusy(false);
      if (!res.ok) {
        // "Too late" (the tap won) or a transport miss — the poll keeps reporting the truth.
        setCancelError({ kind: "server", text: res.error });
        return;
      }
      setPhase("canceled");
    } catch {
      setCancelBusy(false);
      setCancelError({ kind: "local" });
    } finally {
      cancelInFlight.current = false;
    }
  }

  const blind = pollMisses >= BLIND_AFTER_MISSES;
  const recordingLong = recordingSince != null && nowMs - recordingSince > RECORDING_ESCALATE_MS;

  // Phase 2c (P2r) — the status is a dictionary KEY per arm now (bilingual for the first time; the
  // decline copy stays the server's sentence, passed through `<MsgText>`). ONE binding feeds both the
  // visible line below and the page's region, so the two can never say different things.
  const status: ReaderStatus =
    phase === "collecting"
      ? blind
        ? { tone: "warn", msg: { k: "settle.reader.status.blind" } }
        : { tone: "ok", msg: { k: "settle.reader.status.waiting" } }
      : phase === "recording"
        ? recordingLong
          ? { tone: "warn", msg: { k: "settle.reader.status.recordingLong" } }
          : { tone: "ok", msg: { k: "settle.reader.status.recording" } }
        : phase === "failed"
          ? { tone: "warn", msg: failCopy ?? { k: "settle.reader.status.failed" } }
          : { tone: "ok", msg: { k: "settle.reader.status.canceled" } };
  // What the region SPEAKS: a cancel refusal is the newer fact while it stands; otherwise the status.
  const spoken: ReaderStatus =
    cancelError === null
      ? status
      : {
          tone: "warn",
          msg:
            cancelError.kind === "server" ? cancelError.text : { k: "settle.reader.cancelFailed" },
        };
  const spokenKey = JSON.stringify(spoken);
  useEffect(() => {
    // The parent's setter, from an effect (never during render); keyed on the VALUE so a poll tick
    // that changes nothing re-announces nothing.
    onStatus?.(JSON.parse(spokenKey) as ReaderStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the spoken VALUE; onStatus is the parent's stable setter
  }, [spokenKey]);

  return (
    // `role="group"` is load-bearing, not decoration: a bare <div> maps to the `generic` role, which
    // PROHIBITS an author-supplied name — so the `aria-label` below was being discarded, and the
    // cashier's focus (carried here by the effect above, as the settle section unmounts under them)
    // landed on an unnamed container at the moment the reader took the transaction. A blind audit
    // found it; `check-staff-lang.mjs` rule 3d now holds the shape.
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label={sx(lang, "settle.a11y.readerPanel")}
      className="card"
      style={{ ...panel, outline: "none" }}
    >
      <p style={{ ...panelTitle, color: phase === "failed" ? "var(--warn)" : "var(--tx)" }}>
        {/* The amount stays OUTSIDE the dictionary sentence here — it trails the middot in both
            tongues — so it keeps its <strong> and its Latin figure untouched. */}
        {phase === "collecting" && (
          <>
            <Chrome lang={lang} k="settle.reader.onReader" echo="inline" />
            {" · "}
            <strong>{fmt(collect.totalCents)}</strong>
          </>
        )}
        {phase === "recording" && (
          <>
            <Chrome lang={lang} k="settle.reader.paid" echo="inline" />
            {" · "}
            <strong>{fmt(collect.totalCents)}</strong>
          </>
        )}
        {phase === "failed" && <Chrome lang={lang} k="settle.reader.failedTitle" echo="stack" />}
        {phase === "canceled" && (
          <Chrome lang={lang} k="settle.reader.canceledTitle" echo="stack" />
        )}
      </p>
      {/* SHOWN here, SAID by the page's one polite region (`onStatus` above) — no `role` of its own:
          a second polite region under one <main> was OPEN-ITEMS P2r. */}
      <p style={{ ...panelSub, color: status.tone === "warn" ? "var(--warn)" : "var(--t2)" }}>
        <MsgText lang={lang} msg={status.msg} />
        {/* Lifted out of the template literal it used to be spliced into: `<OutageText>` returns
            JSX and cannot live inside a string. */}
        {cancelError !== null && (
          <>
            {" "}
            {cancelError.kind === "server" ? (
              <OutageText lang={lang} error={cancelError.text} />
            ) : (
              <Chrome lang={lang} k="settle.reader.cancelFailed" echo={false} />
            )}
          </>
        )}
      </p>
      {phase === "collecting" && (
        <Button
          variant="secondary"
          size="lg"
          style={{ alignSelf: "flex-start" }}
          busy={cancelBusy}
          busyLabel={<Chrome lang={lang} k="settle.reader.canceling" echo={false} />}
          onClick={cancel}
        >
          <Chrome lang={lang} k="settle.reader.cancelBtn" echo="stack" />
        </Button>
      )}
      {(phase === "failed" || phase === "canceled" || recordingLong) && (
        <Button
          variant="secondary"
          size="lg"
          style={{ alignSelf: "flex-start" }}
          onClick={() => onDone(null)}
        >
          <Chrome lang={lang} k="settle.reader.backToSettle" echo="stack" />
        </Button>
      )}
    </div>
  );
}

const panel: CSSProperties = {
  marginTop: "var(--s4)",
  padding: "var(--s4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--s3)",
};
const panelTitle: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-bold)",
};
const panelSub: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
