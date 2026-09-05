"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { settleCard, terminalStatus, cancelTerminal } from "@/lib/terminal";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";

/**
 * P2 — the two error sources on this surface, kept APART.
 *
 * `kind: "server"` is a sentence the Server Action returned, so it goes through `<OutageText>`
 * (which swaps the one write-outage twin and passes everything else through verbatim).
 * `kind: "local"` is copy THIS file authors for a thrown/rejected action — routing that through
 * `<OutageText>` would pass it through as English forever while looking converted, so it branches
 * to its own dictionary key instead.
 */
type SettleError = { kind: "server"; text: string } | { kind: "local" };

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

export function TerminalSettleButton({
  sessionId,
  totalCents,
  onStarted,
}: {
  sessionId: string;
  totalCents: number;
  onStarted: (c: TerminalCollect) => void;
}) {
  const lang = useStaffLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SettleError | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await settleCard({ sessionId });
      setBusy(false);
      if (!res.ok) {
        setError({ kind: "server", text: res.error });
        return;
      }
      onStarted({ paymentIntentId: res.paymentIntentId, totalCents: res.totalCents });
    } catch {
      // A rejected action (Next redacts the message in prod) must never latch the button on
      // "Starting…" — the W10c bug class.
      setBusy(false);
      setError({ kind: "local" });
    }
  }

  return (
    <div style={{ marginBottom: "var(--s3)" }}>
      <button
        className="staff-btn"
        type="button"
        onClick={start}
        disabled={busy}
        aria-describedby="terminal-hint"
        style={{ ...payBtn, width: "100%" }}
      >
        {busy ? (
          <Chrome lang={lang} k="settle.reader.starting" echo={false} />
        ) : (
          <Chrome
            lang={lang}
            k="settle.reader.trigger"
            vars={{ m: fmt(totalCents) }}
            echo="stack"
          />
        )}
      </button>
      <p id="terminal-hint" style={hint}>
        <Chrome lang={lang} k="settle.reader.hint" echo="stack" />
      </p>
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.text} />
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
 * hands the counter handoff up (the parent renders the #CODE card) — for a table settle there is
 * no handoff card; the detail's paid state is the quiet signal. `onDone(null)` just dismisses.
 */
export function TerminalCollectPanel({
  sessionId,
  collect,
  isCounter,
  onDone,
}: {
  sessionId: string;
  collect: TerminalCollect;
  isCounter: boolean;
  onDone: (h: { orderId: string; totalCents: number; changeCents: number | null } | null) => void;
}) {
  const lang = useStaffLang();
  const router = useRouter();
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
          onDone(
            isCounter
              ? { orderId: res.orderId, totalCents: res.totalCents, changeCents: null }
              : null,
          );
          router.refresh();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll keyed on the PI + phase; onDone/router read from the closure per tick
  }, [collect.paymentIntentId, sessionId, phase]);

  async function cancel() {
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
    }
  }

  const blind = pollMisses >= BLIND_AFTER_MISSES;
  const recordingLong = recordingSince != null && nowMs - recordingSince > RECORDING_ESCALATE_MS;

  // ONE live region: the status line below carries every phase/degradation change. The panel root
  // and its buttons stay OUTSIDE it (a status region wrapping interactive content re-announces the
  // buttons on every tick; a nested alert inside a status double-fires — review finding).
  //
  // ⚠️ P2 — STILL ENGLISH, deliberately and reported rather than half-done. `statusText` is a plain
  // `string`, and a Burmese run has to reach the DOM inside a marked element (`<Chrome>`, or a
  // `lang=` host) or it renders in the Latin face at Latin leading. Marking the `<p>` itself is what
  // the KDS does — but the KDS region holds ONLY dictionary text, while this one also carries the
  // cancel error beside it, so a `lang="my"` host would re-lead an English sentence. Making these
  // five sentences bilingual means turning this binding into a ReactNode (a `<Chrome>` per arm),
  // which is a refactor of the panel's one live region and is left for the owner of that change.
  const statusText =
    phase === "collecting"
      ? blind
        ? "Can’t reach Stripe right now — the reader may still be live. Hold on, or cancel."
        : "Waiting for the guest to tap or insert their card…"
      : phase === "recording"
        ? recordingLong
          ? "The charge went through, but the order isn’t recorded yet. Don’t re-charge — note the amount and check Orders in a minute."
          : "Recording the order…"
        : phase === "failed"
          ? (failCopy ?? "The payment didn’t go through.")
          : "Nothing was charged.";

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
      <p role="status" style={{ ...panelSub, color: blind ? "var(--warn)" : "var(--t2)" }}>
        {statusText}
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
        <button
          className="staff-btn"
          type="button"
          onClick={cancel}
          disabled={cancelBusy}
          style={cancelBtn}
        >
          {cancelBusy ? (
            <Chrome lang={lang} k="settle.reader.canceling" echo={false} />
          ) : (
            <Chrome lang={lang} k="settle.reader.cancelBtn" echo="stack" />
          )}
        </button>
      )}
      {(phase === "failed" || phase === "canceled" || recordingLong) && (
        <button className="staff-btn" type="button" onClick={() => onDone(null)} style={cancelBtn}>
          <Chrome lang={lang} k="settle.reader.backToSettle" echo="stack" />
        </button>
      )}
    </div>
  );
}

const payBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid transparent",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
};
const panel: CSSProperties = {
  marginTop: "var(--s4)",
  padding: "var(--s4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--s3)",
};
const panelTitle: CSSProperties = { margin: 0, fontSize: "var(--fs-body)", fontWeight: 700 };
const panelSub: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
