"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { SplitContext, SettlementShare } from "@/lib/split";
import { getSettlement, abortSettlement } from "@/lib/split";
import { everyShareIn } from "@/lib/split-board";
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
  // W9b — the table's order was closed WITHOUT payment (merged/cleared by a server). Distinct from
  // `complete`: no money moved and there is no receipt.
  const [gone, setGone] = useState(false);
  // ⚠️ W11 (M44) — the host aborting the split DELETES the ledger while the cart stays open; without
  // this, the payer whose card carried a real authorization seconds ago is shown an empty board and
  // left to wonder whether they still owe money.
  const [splitCanceled, setSplitCanceled] = useState(false);
  const hadShares = useRef(false);
  // W9b review — same discipline as the pickup sheet's retry: the button must survive its own tap.
  // `load()` is fire-and-forget, so without a busy flag the banner can vanish under the focused button
  // (on success) or sit inert with no feedback (on a slow retry).
  const [retrying, setRetrying] = useState(false);
  const navTimer = useRef<number | null>(null);
  const [aborting, startAbort] = useTransition();
  const redirected = useRef(false);
  const nameOf = useCallback(
    (seat: string) => ctx.members.find((m) => m.seat === seat)?.name ?? "Guest",
    [ctx.members],
  );

  // W10c — consecutive load failures, for the poll backoff below. A ref, not state: the poll reads it
  // when it schedules and nothing renders from it (the frozen-board banner is driven by `loadError`).
  const failStreak = useRef(0);

  const load = useCallback((): Promise<void> => {
    // Once we've sent the table to the receipt, stop fetching: window.location.assign navigates but
    // doesn't synchronously unmount, so without this the 5s poll + realtime callbacks keep calling
    // getSettlement on a now-paid cart (swallowed 403s / dead work) until the navigation completes.
    if (redirected.current) {
      setRetrying(false); // W9b pre-merge — every exit of load() clears it, or the button latches
      return Promise.resolve();
    }
    return getSettlement(cartId)
      .then((r) => {
        // W9b — a failed read is NOT an empty board (M24). Only the server-typed `settled` may
        // navigate: in production Server Action errors are redacted, so "it threw" can't tell a
        // network blip from a real 403, and guessing would eject a mid-authorization payer to a
        // receipt that doesn't exist yet.
        if (!r.ok) {
          // `cart_gone` — the cart left 'open' WITHOUT being paid (a server merged or cleared the
          // table off a stale freeze). Nobody owes anything and there is no receipt to go to, so say
          // that plainly instead of celebrating a payment that never happened.
          if (r.reason === "cart_gone") {
            failStreak.current = 0;
            setLoadError(false);
            setLoaded(true);
            setGone(true);
            setRetrying(false);
            redirected.current = true; // stop the 5s poll — there is nothing left to watch
            onStatus("This table’s order was closed — nobody was charged.");
            return;
          }
          if (r.reason !== "settled") {
            // `error` / `not_member` — the board could not be read. (During an outage
            // `assertCartMember` raises before any share is fetched, so this is the shape a paused
            // platform takes here.) Counts toward the backoff below.
            failStreak.current += 1;
            setLoadError(true);
            setRetrying(false);
            return;
          }
          if (redirected.current) return;
          failStreak.current = 0;
          redirected.current = true;
          setRetrying(false);
          setLoaded(true); // the cart is gone; show the beat, not the skeleton
          setLoadError(false);
          setComplete(true);
          onStatus("Everyone’s paid — pulling up the table’s receipt…");
          navTimer.current = window.setTimeout(() => {
            window.location.assign(`/track?cart=${encodeURIComponent(cartId)}&paid=1`);
          }, 1600);
          return;
        }
        const rows = r.shares;
        failStreak.current = 0; // the board answered — back to the 5s cadence
        setShares(rows);
        // W11 (M44): a ledger that HAD rows and now has none, with the cart still open, is a host
        // abort — the one moment the payer needs to hear their hold is gone. A fresh non-empty ledger
        // (the host re-opened) supersedes the beat.
        if (rows.length > 0) {
          hadShares.current = true;
          setSplitCanceled(false);
        } else if (hadShares.current && !redirected.current) {
          setSplitCanceled(true);
          onStatus(
            "The host canceled the split — nothing more will be charged. Any hold on your card is being released.",
          );
        }
        setLoaded(true);
        setLoadError(false);
        setRetrying(false);
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
        // A throw that reaches here is a transport/runtime failure — `getSettlement` returns its
        // authorization outcomes as data. Flag it either way: before first load the render offers a
        // retry instead of a permanent skeleton, and AFTER first load it says the board is stale
        // rather than passing off a frozen snapshot as live (W9b).
        failStreak.current += 1;
        setLoadError(true);
        setRetrying(false);
      });
  }, [cartId, onStatus]);

  useEffect(() => {
    void load();
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
    if ((complete || gone) && document.activeElement === document.body)
      completeRef.current?.focus({ preventScroll: true });
  }, [complete, gone]);
  useSettlementRealtime(cartId, accessToken, true, load);

  // Poll backstop (payment-critical screen): re-fetch every 5s while settling so progress shows even if
  // Realtime is down or the anon token never arrives (the subscription no-ops on an empty token). Stops
  // on unmount (the all-captured redirect / a host cancel returning to review both unmount this).
  //
  // W10c — it BACKS OFF while the board can't be read (5 → 10 → 20 → 30s cap), and returns to 5s the
  // instant it answers. The old fixed interval kept firing a full Server Action (an auth round-trip
  // plus reads) every 5s for as long as the platform was down, on a phone that was already fighting
  // realtime-js's own reconnect loop — a battery cost paid by a diner who is mid-payment and can do
  // nothing about it. Self-scheduling (not setInterval) so the next delay is chosen from the outcome
  // of the load that just finished, and recovery is never one slow tick late. `load` never rejects.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void load().then(() => {
        // Pre-PR review — stop at a TERMINAL state, don't just no-op through it. `cart_gone` sets
        // `redirected` with NO navigation behind it, so the old loop re-armed every 5s forever under
        // a screen that reads "This table's order was closed" — on a slice whose stated point is not
        // burning a diner's battery. (The `setInterval` it replaced did the same; this is where the
        // fix belongs.)
        if (cancelled || redirected.current) return;
        timer = setTimeout(run, Math.min(5000 * 2 ** failStreak.current, 30_000));
      });
    };
    timer = setTimeout(run, 5000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const paidCents = shares
    .filter((s) => s.status === "authorized" || s.status === "captured")
    .reduce((a, s) => a + s.amountCents, 0);
  const totalCents = shares.reduce((a, s) => a + s.amountCents, 0);
  // ⚠️ W10d pre-merge RE-REVIEW — `everyShareIn` (lib/split-board.ts) rather than an inline `.every()`:
  // this rule must agree with `captureAllIfReady`'s gate, and a `.tsx` component has no suite in this
  // repo, so an inline version could not be made to fail. See that file for the regression it closes.
  const allIn = everyShareIn(shares);

  // W9b — a member with NO share row joined the table after the host opened the split, so the ledger
  // has no line for them: every control on this screen is inert and nothing says why. Read-only is the
  // correct answer, not a bug to paper over — `mms_fulfill_split_order` hard-raises when Σ(captured) ≠
  // the expected total, so minting a share mid-flight would break fulfillment for everyone. Name the
  // situation and give the two real ways out (restart the split, or pay together).
  const hostName = ctx.members.find((m) => m.role === "host")?.name ?? "the host";
  const lateJoiner =
    loaded && !complete && !gone && shares.length > 0 && !shares.some((s) => s.seat === ctx.mySeat);

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
      // Same gate as `allIn`, and for the sharper reason: this one is SPOKEN into the view's single
      // live region with no adjacent figure to contradict it, so "that's everyone" over a canceled
      // share is an unqualified false assertion to a screen-reader user.
      const everyoneIn = everyShareIn(shares);
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
        void load();
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
            {retrying ? "Loading the split…" : "Couldn’t load the split."}{" "}
            <button
              type="button"
              aria-disabled={retrying}
              onClick={() => {
                if (retrying) return;
                setRetrying(true);
                load();
              }}
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
              {retrying ? "Retrying…" : "Try again"}
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
          {/* W9b — the board loaded once and a later refresh failed. The rows below are a frozen
              snapshot on a screen whose whole promise is "live", so say so rather than let a stale
              status pass for the truth. Plain static text, not a live region: the 5s poll would
              otherwise re-announce this on every flap (Checkout's status region is the view's one
              announcer). */}
          {loadError && (
            <p
              style={{
                fontSize: "var(--fs-xs)",
                color: "var(--t2)",
                background: "var(--warnb)",
                border: "1px solid var(--warn)",
                borderRadius: 10,
                padding: "8px 10px",
                margin: "0 0 12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span>
                {retrying ? "Refreshing…" : "Couldn’t refresh — showing the last update."}
              </span>
              <button
                type="button"
                aria-disabled={retrying}
                onClick={() => {
                  if (retrying) return;
                  setRetrying(true);
                  load();
                }}
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
                {retrying ? "Retrying…" : "Try again"}
              </button>
            </p>
          )}
          {gone ? (
            // W9b — the honest terminal state for a table that was closed without paying. Not a live
            // region: `onStatus` (the settle view's one announcer) carries the message below.
            <div ref={completeRef} tabIndex={-1} className="settle-complete">
              <p className="settle-complete-line">This table’s order was closed</p>
              <p className="settle-complete-sub">
                Nobody was charged. Ask your server if that wasn’t expected.
              </p>
            </div>
          ) : splitCanceled && !complete ? (
            // W11 (M44) — the abort's payer-facing face. Not a live region (onStatus announced it);
            // the visible copy answers the question an authorized payer is actually asking.
            <div className="settle-complete">
              <p className="settle-complete-line">The host canceled the split</p>
              <p className="settle-complete-sub">
                Nothing more will be charged. Any hold on your card is being released — it can take
                a few days to drop off your statement. You can split again or pay together.
              </p>
            </div>
          ) : complete ? (
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

          {/* W9b — the late joiner. Plain static text (not a live region): the rows below are still
              worth watching, this only explains why none of them is theirs. */}
          {lateJoiner && (
            <p
              style={{
                fontSize: "var(--fs-sm)",
                color: "var(--t2)",
                background: "var(--sf)",
                border: "1px solid var(--bd)",
                borderRadius: 12,
                padding: "10px 12px",
                margin: "0 0 12px",
                lineHeight: 1.5,
              }}
            >
              You joined after the split started, so there’s no share here for you yet — ask{" "}
              <strong style={{ color: "var(--t1)" }}>{hostName}</strong> to restart the split, or
              pay together.
            </p>
          )}

          {/* ⚠️ `gone` gates the LIST too, not just the header above it. Leaving the rows mounted put a
              live "Pay $X" Payment Element directly under "Nobody was charged" — a control that can
              falsify the sentence sitting on top of it, against a cart that no longer exists. */}
          {!gone && (
            <ul
              role="list"
              style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}
            >
              {shares.map((s, i) => {
                const isMe = s.seat === ctx.mySeat;
                const name = isMe ? "You" : nameOf(s.seat);
                // ⚠️ W10d pre-merge review — `canceled` belongs here. The server's claim predicate has
                // always accepted `pending | failed | canceled`, so a canceled share IS payable; the UI
                // was the only thing saying otherwise. It's reachable whenever a mint dies after the
                // prior intent was released (a 503 from the provider, or the claim write failing):
                // Stripe's `payment_intent.canceled` flips the row, realtime pushes it, and SharePay —
                // with the "Try again" the payer needed — unmounted, leaving a grey badge and no way
                // forward for either them or the table.
                const canPay =
                  isMe &&
                  (s.status === "pending" || s.status === "failed" || s.status === "canceled");
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
          )}
        </>
      )}

      {/* No cancel once every share is captured (the beat is showing) — the capture already happened;
          offering an abort that must fail is a dead affordance, not an option. */}
      {ctx.myRole === "host" && !complete && !gone && (
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
