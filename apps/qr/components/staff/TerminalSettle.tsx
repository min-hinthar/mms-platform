"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { settleCard, terminalStatus, cancelTerminal } from "@/lib/terminal";
import { Card } from "@mms/ui";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const POLL_MS = 2500;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await settleCard({ sessionId });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onStarted({ paymentIntentId: res.paymentIntentId, totalCents: res.totalCents });
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
        {busy ? "Starting the reader…" : `Card on the reader · ${fmt(totalCents)}`}
      </button>
      <p id="terminal-hint" style={hint}>
        Sends the charge to the card reader — the guest taps or inserts there.
      </p>
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error}
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
  const router = useRouter();
  const [phase, setPhase] = useState<PanelPhase>("collecting");
  const [failCopy, setFailCopy] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The settle section unmounts under the cashier as the freeze lands — carry focus here.
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (phase === "failed" || phase === "canceled") return; // terminal — stop polling
    let stopped = false;
    const tick = async () => {
      const res = await terminalStatus({
        sessionId,
        paymentIntentId: collect.paymentIntentId,
      }).catch(() => null);
      if (stopped || !res) return; // transient poll miss — the next interval retries
      if (!res.ok) return; // staff-session hiccup etc. — keep trying; Cancel stays available
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
    const res = await cancelTerminal({ sessionId, paymentIntentId: collect.paymentIntentId });
    setCancelBusy(false);
    if (!res.ok) {
      // "Too late" (the tap won) or a transport miss — the poll keeps reporting the truth.
      setCancelError(res.error);
      return;
    }
    setPhase("canceled");
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="status"
      aria-label="Card reader payment"
      className="card"
      style={{ ...panel, outline: "none" }}
    >
      {phase === "collecting" && (
        <>
          <p style={panelTitle}>
            On the reader · <strong>{fmt(collect.totalCents)}</strong>
          </p>
          <p style={panelSub}>Waiting for the guest to tap or insert their card…</p>
          <button
            className="staff-btn"
            type="button"
            onClick={cancel}
            disabled={cancelBusy}
            style={cancelBtn}
          >
            {cancelBusy ? "Canceling…" : "Cancel the reader"}
          </button>
          {cancelError && (
            <p role="alert" style={{ ...panelSub, color: "var(--warn)" }}>
              {cancelError}
            </p>
          )}
        </>
      )}
      {phase === "recording" && (
        <>
          <p style={panelTitle}>
            Paid · <strong>{fmt(collect.totalCents)}</strong>
          </p>
          <p style={panelSub}>Recording the order…</p>
        </>
      )}
      {phase === "failed" && (
        <>
          <p style={{ ...panelTitle, color: "var(--warn)" }}>Payment didn’t go through</p>
          <p style={panelSub}>{failCopy}</p>
          <button className="staff-btn" type="button" onClick={() => onDone(null)} style={cancelBtn}>
            Back to settle
          </button>
        </>
      )}
      {phase === "canceled" && (
        <>
          <p style={panelTitle}>Canceled</p>
          <p style={panelSub}>Nothing was charged.</p>
          <button className="staff-btn" type="button" onClick={() => onDone(null)} style={cancelBtn}>
            Back to settle
          </button>
        </>
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
