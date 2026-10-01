"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTableNav } from "./TableNav";
import { getMergeCandidates, mergeTables } from "@/lib/floor";
import { boundWrite } from "@/lib/bounded-write";
import { raceTimeout } from "@/lib/staff-outage";
import { type MergeCandidate, tableDisplay } from "@/lib/floor-types";
import { Card } from "@mms/ui";
import { plural } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

/**
 * P2 — the two error sources this panel has, kept APART rather than flattened to one string.
 *
 * `mergeTables` returns a server sentence (during an outage, the one `STAFF_WRITE_OUTAGE` twin
 * `<OutageText>` swaps); the candidate load failing is copy THIS file authors. Folding the second
 * into the first would send an authored English literal through `<OutageText>`, which passes every
 * sentence but that one through verbatim — so it would look converted and render English forever.
 */
type MergeError =
  | { kind: "server"; text: string }
  | { kind: "loadFailed" }
  // Phase 2h (9e) — the merge's answer is still out at the bound: the tables may yet be merged.
  | { kind: "waiting" }
  // Phase 2h (9e) — the merge THREW: the answer was lost, so it may have landed ("couldn't confirm").
  | { kind: "unknown" };

/**
 * One-tap merge (S1.4 soft convergence). The recovery for a double-order: fold THIS table's open order
 * into another table, then this table closes. Explicit + legible (the system can't auto-detect that two
 * labels are one physical table) — open it, pick a same-mode candidate, confirm. The server re-resolves
 * both carts, refuses mid-payment, and re-parents the already-server-priced lines (no client price). On
 * success we route to the target table (this one is now closed). One assertive error region (no extra
 * live region — parity with the detail view's single status region).
 *
 * Phase 2h (P2fc) — both server calls are BOUNDED. The candidate read races `STAFF_HANG_MS` (a hung
 * read says it could not load, never "Loading…" forever); the merge is awaited with `boundWrite`,
 * busy is state cleared in a `finally`, every control is `aria-disabled` (never native — Back and
 * Cancel were natively disabled for as long as the action hung), and a lost or slow answer is said
 * as one ("couldn't confirm" / "no answer yet — don't merge again"); the late answer still lands.
 */
export function MergeTableButton({
  sourceSessionId,
  sourceLabel,
  sourceItemCount,
}: {
  sourceSessionId: string;
  sourceLabel: string;
  sourceItemCount: number;
}) {
  const lang = useStaffLang();
  // Phase 2d · split — the exit is the page's or the pane's (`TableNav`), bound once.
  const nav = useTableNav();
  const [step, setStep] = useState<"idle" | "picking" | "confirm">("idle");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MergeError | null>(null);
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [target, setTarget] = useState<MergeCandidate | null>(null);
  // Phase 2h — the merge's tap-time guard (a REF: two taps in one frame both read the same render),
  // and whether this control is still mounted when a LATE answer lands (re-armed at setup).
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickingRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Follow focus across the step panels (S1-audit S6): into each panel as it opens, back to the trigger
  // when we return to idle — so focus is never dropped to <body> when a step unmounts.
  const prevStep = useRef(step);
  useEffect(() => {
    if (step !== prevStep.current) {
      if (step === "picking") pickingRef.current?.focus();
      else if (step === "confirm") confirmRef.current?.focus();
      else if (step === "idle" && prevStep.current !== "idle") triggerRef.current?.focus();
    }
    prevStep.current = step;
  }, [step]);

  async function open() {
    setStep("picking");
    setError(null);
    setLoading(true);
    try {
      // Phase 2h — a READ, raced at the bound (a timeout is a failure: "Couldn't load tables. Try
      // again."), never left on "Loading…" while the action queue is stuck.
      setCandidates(await raceTimeout(getMergeCandidates(sourceSessionId)));
    } catch {
      setError({ kind: "loadFailed" });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    if (busy) return; // aria-disabled while the merge is out (§17) — the refusal is here
    setStep("idle");
    setTarget(null);
    setError(null);
  }

  /** The merge's answer, whenever it lands — at once, or after the bound (9e: never dropped). */
  function land(res: Awaited<ReturnType<typeof mergeTables>>, into: MergeCandidate) {
    if (!res.ok) {
      setError({ kind: "server", text: res.error });
      return;
    }
    // This table is now closed; go to the table that received the order — its page, or (in the
    // counter's pane) the pane switches to it, named by the candidate's own label.
    nav.toTable(res.targetSessionId, { counter: false, display: tableDisplay(into).text });
  }

  async function confirm() {
    if (!target || inFlight.current) return;
    const into = target;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let left = false;
    try {
      // 9b — the RAW action, awaited with a bound (`boundWrite` never rejects, tracks the raw).
      const out = await boundWrite(
        mergeTables({ sourceSessionId, targetSessionId: into.sessionId }),
      );
      if (out.kind === "answer") {
        left = out.value.ok; // this table is leaving: stay busy until the swap
        land(out.value, into);
        return;
      }
      if (out.kind === "threw") {
        console.error("[MergeTableButton] merge unconfirmed", out.error);
        setError({ kind: "unknown" });
        return;
      }
      setError({ kind: "waiting" });
      void out.late.then((late) => {
        // A detail that is gone has nothing to leave or say; a late merge is seen on the floor.
        if (!alive.current) return;
        if (late.kind === "answer") land(late.value, into);
        else setError({ kind: "unknown" });
      });
    } finally {
      // Frees AT THE BOUND (fact 3) — unless the table is leaving under this control.
      if (!left) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div>
      {step === "idle" && (
        <button
          className="staff-btn"
          ref={triggerRef}
          type="button"
          onClick={open}
          style={mergeBtn}
        >
          <Chrome lang={lang} k="settle.merge.btn" echo="stack" />
        </button>
      )}

      {step === "picking" && (
        <Card
          ref={pickingRef}
          tabIndex={-1}
          role="group"
          aria-label={sx(lang, "settle.a11y.pickTable")}
          style={{ ...panel, outline: "none" }}
        >
          <div style={panelHead}>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)" }}>
              {/* Inline echo: this heading shares a flex row with Cancel. */}
              <Chrome lang={lang} k="settle.merge.into" vars={{ id: sourceLabel }} echo="inline" />
            </span>
            <button
              className="staff-btn"
              type="button"
              onClick={reset}
              aria-disabled={busy || undefined}
              style={linkBtn}
            >
              <Chrome lang={lang} k="settle.cancel" echo={false} />
            </button>
          </div>
          {loading ? (
            <p style={muted}>
              <Chrome lang={lang} k="settle.merge.loading" echo={false} />
            </p>
          ) : candidates.length === 0 ? (
            <p style={muted}>
              <Chrome lang={lang} k="settle.merge.noCandidates" echo="stack" />
            </p>
          ) : (
            <ul role="list" aria-label={sx(lang, "settle.a11y.mergeTargets")} style={list}>
              {candidates.map((c) => (
                <li key={c.sessionId}>
                  <button
                    className="staff-btn"
                    type="button"
                    onClick={() => {
                      setTarget(c);
                      setStep("confirm");
                    }}
                    style={candidateBtn}
                  >
                    {/* The floor's own keys, not new ones: this row says exactly what a table card
                        says, and one wording is the point (`floor.table` / `floor.card.item.*` /
                        `floor.party`). No echo — the row is dense metadata inside a 44px target. */}
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      <Chrome
                        lang={lang}
                        k="floor.table"
                        vars={{ id: tableDisplay(c).text }}
                        echo={false}
                      />
                    </span>
                    <span style={{ color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
                      <Chrome
                        lang={lang}
                        k={plural(c.itemCount, "floor.card.item.one", "floor.card.item.many")}
                        vars={{ n: c.itemCount }}
                        echo={false}
                      />
                      {" · "}
                      <Chrome lang={lang} k="floor.party" vars={{ n: c.partySize }} echo={false} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {step === "confirm" && target && (
        <Card
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={sx(lang, "settle.a11y.confirmMerge")}
          style={{ ...panel, outline: "none" }}
        >
          <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
            {/* {id} is the SOURCE table and {into} the TARGET — two Latin tokens, so two slots, each
                named for its role: `fill` substitutes by NAME, and one slot cannot carry two values. */}
            <Chrome
              lang={lang}
              k={plural(sourceItemCount, "settle.merge.move.one", "settle.merge.move.many")}
              vars={{ n: sourceItemCount, id: sourceLabel, into: tableDisplay(target).text }}
              echo="stack"
            />{" "}
            <Chrome lang={lang} k="settle.merge.closes" vars={{ id: sourceLabel }} echo="stack" />
          </p>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            {/* aria-disabled + the handlers' guards (§17, K35) — never native `disabled`, which drops
                focus to <body> under the tap; busy frees at the bound, so neither is stranded. */}
            <button
              className="staff-btn"
              type="button"
              onClick={() => {
                if (busy) return;
                setStep("picking");
              }}
              aria-disabled={busy || undefined}
              style={cancelBtn}
            >
              <Chrome lang={lang} k="settle.back" echo={false} />
            </button>
            <button
              className="staff-btn"
              type="button"
              onClick={() => void confirm()}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              style={mergeBtn}
            >
              {busy ? (
                <Chrome lang={lang} k="settle.merge.merging" echo={false} />
              ) : (
                <Chrome
                  lang={lang}
                  k="settle.merge.confirmBtn"
                  vars={{ into: tableDisplay(target).text }}
                  echo="stack"
                />
              )}
            </button>
          </div>
        </Card>
      )}

      {error && (
        <p role="alert" style={{ ...muted, marginTop: 6, color: "var(--warn)" }}>
          {error.kind === "server" ? (
            <OutageText lang={lang} error={error.text} />
          ) : error.kind === "waiting" ? (
            <Chrome lang={lang} k="settle.merge.waiting" echo={false} />
          ) : error.kind === "unknown" ? (
            <Chrome lang={lang} k="settle.merge.unknown" echo={false} />
          ) : (
            <Chrome lang={lang} k="settle.merge.loadFailed" echo={false} />
          )}
        </p>
      )}
      {/* Phase 2h — the waiting line says "reload the page", and the console is installed standalone
          (no browser reload): the one way out sits BESIDE the alert, never inside it. */}
      {error?.kind === "waiting" && (
        <div style={{ marginTop: "var(--s2)" }}>
          <ReloadButton lang={lang} />
        </div>
      )}
    </div>
  );
}

const mergeBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  cursor: "pointer",
};
const linkBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 6px",
  border: "none",
  background: "none",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  cursor: "pointer",
};
// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const panel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  padding: "var(--s4)",
};
const panelHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
};
const candidateBtn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  width: "100%",
  minHeight: 44,
  padding: "8px 14px",
  textAlign: "left",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  cursor: "pointer",
};
const muted: CSSProperties = { margin: 0, color: "var(--t3)", fontSize: "var(--fs-sm)" };
