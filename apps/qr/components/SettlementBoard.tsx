"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { SplitContext, SettlementShare } from "@/lib/split";
import { getSettlement, abortSettlement } from "@/lib/split";
import { useSettlementRealtime } from "@/lib/realtime";
import { seatColor, seatInitial } from "@/lib/avatars";
import { Avatar, Icon, NumberFlow, Skeleton } from "@mms/ui";
import { SharePay } from "./SharePay";

/**
 * Live split-tender settlement board (M3·P3.3b). Once the host opens a split, the cart is frozen and
 * every member pays their OWN share here — this shows the table-wide progress live (each share flips
 * pending → authorized → captured via `useSettlementRealtime`), surfaces the viewer's own SharePay, and
 * lets the host cancel. When every share is captured the order is fulfilled and everyone is sent to the
 * receipt. Amounts are server-derived (getSettlement); no client money math.
 */
export function SettlementBoard({
  cartId,
  accessToken,
  ctx,
  onStatus,
  onChanged,
}: {
  cartId: string;
  accessToken: string;
  ctx: SplitContext;
  onStatus: (msg: string) => void;
  onChanged: () => void; // re-sync the cart view (e.g. after an abort lifts the freeze)
}) {
  const [shares, setShares] = useState<SettlementShare[]>([]);
  const [loaded, setLoaded] = useState(false); // first getSettlement resolved → show the board
  const [loadError, setLoadError] = useState(false); // first load failed → offer a retry
  // J4 — the shared end-beat: every share captured → the whole table sees "everyone's paid" TOGETHER
  // for a breath before the receipt (the shared end of the shared meal), instead of being yanked
  // mid-glance into a hard navigation.
  const [complete, setComplete] = useState(false);
  const navTimer = useRef<number | null>(null);
  const [aborting, startAbort] = useTransition();
  const redirected = useRef(false);
  const nameOf = useCallback(
    (seat: string) => ctx.members.find((m) => m.seat === seat)?.name ?? "Guest",
    [ctx.members],
  );

  const load = useCallback(() => {
    // Once we've sent the table to the receipt, stop fetching: window.location.assign navigates but
    // doesn't synchronously unmount, so without this the 5s poll + realtime callbacks keep calling
    // getSettlement on a now-paid cart (swallowed 403s / dead work) until the navigation completes.
    if (redirected.current) return;
    void getSettlement(cartId)
      .then((rows) => {
        setShares(rows);
        setLoaded(true);
        setLoadError(false);
        // All shares captured → the order is being fulfilled; show the table-wide end-beat, then move
        // everyone to the receipt (once). `paid=1` tells /track this is a completed split (no Stripe
        // redirect params) so it resolves the order by cart instead of falling through to the "no
        // order yet" stub (the C1 fix). The beat is announced through the settle view's ONE status
        // region (onStatus); setComplete runs in a promise callback, not an effect body (lint-safe).
        if (rows.length > 0 && rows.every((s) => s.status === "captured") && !redirected.current) {
          redirected.current = true;
          setComplete(true);
          onStatus("Everyone’s paid — pulling up the table’s receipt…");
          navTimer.current = window.setTimeout(() => {
            window.location.assign(`/track?cart=${encodeURIComponent(cartId)}&paid=1`);
          }, 1600);
        }
      })
      .catch(() => {
        // A post-fulfillment 403 (cart flipped to paid) after we've loaded is the expected end state —
        // the redirect / realtime carries the diner to /track, so swallow. A FIRST-load failure leaves
        // no data to show, so flag it (the render offers a retry rather than a permanent empty board).
        setLoadError(true);
      });
  }, [cartId, onStatus]);

  useEffect(() => {
    load();
  }, [load]);

  // If the diner navigates away during the end-beat's breath, don't yank them back to /track later —
  // the pending navigation dies with the board. (The redirected ref already stops further loads.)
  useEffect(
    () => () => {
      if (navTimer.current) window.clearTimeout(navTimer.current);
    },
    [],
  );

  // The complete flip unmounts interactive things (the host's Cancel, the progress line) — if focus
  // fell to <body> with them, park it on the beat so a keyboard/SR user isn't dropped mid-breath
  // (WCAG 2.4.3; same convention as the share-row restore above).
  const completeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (complete && document.activeElement === document.body)
      completeRef.current?.focus({ preventScroll: true });
  }, [complete]);
  useSettlementRealtime(cartId, accessToken, true, load);

  // Poll backstop (payment-critical screen): re-fetch every 5s while settling so progress shows even if
  // Realtime is down or the anon token never arrives (the subscription no-ops on an empty token). Stops
  // on unmount (the all-captured redirect / a host cancel returning to review both unmount this).
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const paidCents = shares
    .filter((s) => s.status === "authorized" || s.status === "captured")
    .reduce((a, s) => a + s.amountCents, 0);
  const totalCents = shares.reduce((a, s) => a + s.amountCents, 0);
  const allIn =
    shares.length > 0 && shares.every((s) => s.status !== "pending" && s.status !== "failed");

  // The viewer's OWN share flipping out of payable (authorized/captured lands via realtime) unmounts
  // their SharePay form silently — announce it through the settle view's ONE status region (Checkout's)
  // and, if focus fell to <body> with the form, restore it to the viewer's row (WCAG 2.4.3). Edge-
  // triggered on the status transition so a page refresh onto an already-authorized share stays quiet.
  const myRowRef = useRef<HTMLLIElement>(null);
  const prevMyStatus = useRef<SettlementShare["status"] | null>(null);
  useEffect(() => {
    const mine = shares.find((s) => s.seat === ctx.mySeat);
    if (!mine) return;
    const prev = prevMyStatus.current;
    prevMyStatus.current = mine.status;
    const wasPayable = prev === "pending" || prev === "failed";
    const nowIn = mine.status === "authorized" || mine.status === "captured";
    if (wasPayable && nowIn) {
      // Once the end-beat has announced "everyone's paid", don't overwrite it with "finishing up" —
      // the last payer (whose own flip can be observed in the same load as the table completing) is
      // exactly the diner who should hear the table-wide message, not their solo one.
      if (redirected.current) return;
      // Honest copy for the LAST payer: if this authorization completed the table, don't say "waiting".
      const everyoneIn = shares.every((s) => s.status !== "pending" && s.status !== "failed");
      onStatus(
        everyoneIn
          ? "Your share is in — that’s everyone. Finishing up…"
          : "Your share is in — waiting for the rest of the table.",
      );
      if (document.activeElement === document.body)
        myRowRef.current?.focus({ preventScroll: true });
    }
  }, [shares, ctx.mySeat, onStatus]);

  function cancel() {
    startAbort(async () => {
      try {
        await abortSettlement(cartId);
        onStatus("Split canceled — back to one bill.");
        onChanged();
      } catch (e) {
        // Host abort lost the race to a completing capture (or not permitted) — surface it honestly,
        // UNLESS the table just completed: the end-beat's announcement owns the one status region
        // during the breath, and "couldn't cancel" would clobber "everyone's paid" (the completed
        // capture IS the answer to the failed abort).
        if (!redirected.current)
          onStatus(e instanceof Error ? e.message : "Couldn’t cancel the split.");
        load();
      }
    });
  }

  return (
    <section aria-labelledby="settle-h" style={{ marginTop: 18 }}>
      <h2 id="settle-h" style={{ fontSize: "var(--fs-h3)", margin: "0 0 4px" }}>
        Everyone pays their share
        {/* K2: anchor the split to the real table. */}
        {ctx.tableNumber != null && (
          <span style={{ color: "var(--t3)", fontWeight: 600, fontSize: "var(--fs-sm)" }}>
            {" "}
            · Table {ctx.tableNumber}
          </span>
        )}
      </h2>
      <p
        style={{
          fontSize: "var(--fs-xs)",
          color: "var(--t3)",
          margin: "0 0 12px",
          lineHeight: 1.5,
        }}
      >
        No one’s card is charged until everyone has paid; then the whole order is captured together.
      </p>

      {!loaded ? (
        loadError ? (
          <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
            Couldn’t load the split.{" "}
            <button
              type="button"
              onClick={load}
              style={{
                minHeight: 44,
                padding: "0 4px",
                background: "none",
                border: "none",
                color: "var(--warn)",
                fontWeight: 800,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </p>
        ) : (
          // Skeleton mirror of the share rows. Decorative (aria-hidden) — the section's <h2> already
          // names it and the error branch above owns the only role=alert (one live region per view).
          // A sibling sr-only string keeps an SR loading cue.
          <>
            <span className="sr-only">Loading the split…</span>
            <div aria-hidden>
              <Skeleton width={160} height={13} style={{ margin: "0 0 12px" }} />
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="card" style={{ padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Skeleton circle height={30} />
                      <Skeleton height={14} style={{ flex: 1 }} />
                      <Skeleton width={56} height={14} />
                      <Skeleton width={64} height={18} radius={999} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )
      ) : (
        <>
          {complete ? (
            // J4 — the shared end-beat: the whole table sees this together for a breath before the
            // receipt. NOT a live region — the announcement went through the settle view's one status
            // region (onStatus above); this is the visible face of the same moment. Bilingual per the
            // J2 journey-copy rule (the farewell is content, not decoration).
            <div ref={completeRef} tabIndex={-1} className="settle-complete mms-rise">
              <p className="settle-complete-line">
                <span aria-hidden>🎉 </span>Everyone’s paid —{" "}
                <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
                  ကျေးဇူးတင်ပါတယ်
                </span>
              </p>
              <p className="settle-complete-sub">Pulling up the table’s receipt…</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", margin: "0 0 8px" }}>
                {/* The paid figure ROLLS as shares land (live-board language); the frozen total stays static. */}
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                  <NumberFlow
                    value={paidCents / 100}
                    format={{ style: "currency", currency: "USD" }}
                  />
                </strong>{" "}
                of ${(totalCents / 100).toFixed(2)} authorized
                {allIn ? " — finishing up…" : ""}
              </p>

              {/* Live progress — the gold→clay fill grows as shares are authorized (real values). Decorative
            (aria-hidden): the line above is the accessible source of truth, so the SR isn't double-told. */}
              <div className="settle-progress" aria-hidden="true" style={{ margin: "0 0 14px" }}>
                <div
                  className="settle-progress-fill"
                  style={{
                    width: `${totalCents > 0 ? Math.round((paidCents / totalCents) * 100) : 0}%`,
                  }}
                />
              </div>
            </>
          )}

          <ul
            role="list"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}
          >
            {shares.map((s, i) => {
              const isMe = s.seat === ctx.mySeat;
              const name = isMe ? "You" : nameOf(s.seat);
              const canPay = isMe && (s.status === "pending" || s.status === "failed");
              const settled = s.status === "authorized" || s.status === "captured";
              return (
                // Textured + rise-in (keys are stable seats — status flips re-render, never re-animate).
                // A settled share gets a warm accent left-edge (.settle-row-paid). tabIndex -1 on the
                // viewer's own row = the focus target when their pay form unmounts.
                <li
                  key={s.seat}
                  ref={isMe ? myRowRef : undefined}
                  tabIndex={isMe ? -1 : undefined}
                  aria-label={isMe ? `Your share` : undefined}
                  className={`card card-textured mms-rise${settled ? " settle-row-paid" : ""}`}
                  style={{ padding: 12, animationDelay: `${Math.min(i, 6) * 45}ms` }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar
                      size="md"
                      initial={seatInitial(nameOf(s.seat))}
                      color={seatColor(s.seat)}
                    />
                    <span style={{ flex: 1, fontWeight: 700 }}>{name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      ${(s.amountCents / 100).toFixed(2)}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  {canPay && <SharePay cartId={cartId} onAuthorized={load} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* No cancel once every share is captured (the beat is showing) — the capture already happened;
          offering an abort that must fail is a dead affordance, not an option. */}
      {ctx.myRole === "host" && !complete && (
        <button
          type="button"
          onClick={cancel}
          disabled={aborting}
          style={{
            width: "100%",
            marginTop: 14,
            minHeight: 44,
            borderRadius: 12,
            border: "1.5px solid var(--bd)",
            background: "transparent",
            color: "var(--t2)",
            fontWeight: 700,
            cursor: aborting ? "default" : "pointer",
          }}
        >
          {aborting ? "Canceling…" : "Cancel split — pay as one bill"}
        </button>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: SettlementShare["status"] }) {
  const map: Record<SettlementShare["status"], { label: string; color: string; bg: string }> = {
    pending: { label: "Waiting", color: "var(--t3)", bg: "var(--sf)" },
    authorized: {
      label: "Authorized",
      color: "var(--ac-strong)",
      bg: "color-mix(in oklab, var(--ac) 10%, var(--cd))",
    },
    captured: {
      label: "Paid",
      color: "var(--ac-strong)",
      bg: "color-mix(in oklab, var(--ac) 14%, var(--cd))",
    },
    failed: { label: "Failed", color: "var(--warn)", bg: "var(--warnb)" },
    canceled: { label: "Canceled", color: "var(--t3)", bg: "var(--sf)" },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontSize: "var(--fs-xs)",
        fontWeight: 800,
        padding: "3px 9px",
        borderRadius: 999,
        color: s.color,
        background: s.bg,
        whiteSpace: "nowrap",
        // A paper sheen lip on every badge; the captured/"Paid" badge also gets a warm gold halo.
        boxShadow:
          status === "captured"
            ? "inset 0 1px 0 var(--sheen), 0 0 10px -3px var(--glow-gold)"
            : "inset 0 1px 0 var(--sheen)",
      }}
    >
      {(status === "captured" || status === "authorized") && (
        <Icon
          name="check"
          size={13}
          style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
        />
      )}
      {s.label}
    </span>
  );
}
