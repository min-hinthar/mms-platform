"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { getExpoQueue, setTogoStatus } from "@/lib/expo";
import { frozenBoardCopy, nextDegraded, raceTimeout, type StaffDegraded } from "@/lib/staff-outage";
import { useFloorRealtime } from "@/lib/useFloorRealtime";
import { useWakeLock } from "@/lib/useWakeLock";
import { formatSlotLong } from "@/lib/pickupTime";
import { tf } from "@/lib/i18n/fill";
import { al, sx } from "@/lib/staff-labels";
import type { ExpoLine, ExpoQueue, ExpoTicket } from "@/lib/expo-types";
import { ExpoLineMy } from "./TicketText";
import { RelativeTime } from "./RelativeTime";
import { StaggerList } from "./StaggerList";
import { EmptyState, Icon } from "@mms/ui";
import { useStaffLang } from "./StaffLangProvider";
import { StaffLangSwitch } from "./StaffLangSwitch";
import { Chrome, OutageText } from "./Chrome";

/**
 * Expo / bagging station (S4.3a, W3a) — the takeaway counterpart to the KDS. Server-rendered initial
 * queue, kept live by Postgres-Changes (useFloorRealtime watches qr_orders → re-fetch the server-
 * authoritative getExpoQueue; never client state-math) with a 5s poll BACKSTOP. Re-fetches debounced.
 * ONE polite live region (bump error takes precedence over the count). Two-stage bump: "Bagged & ready"
 * (preparing→ready, lights the diner's /track AND the order-ready board) then "Picked up" (ready→
 * picked_up, drops off both). W3a: the queue arrives sorted by EFFECTIVE DUE TIME with "Here now"
 * pinned; pickup/scango bags headline the first name + short code. K10: an expired staff cookie or a
 * locked console redirects honestly instead of wearing "Reconnecting…" forever.
 */
export function ExpoBoard({ initial }: { initial: ExpoQueue }) {
  // P2 — the device language, from app/staff/layout.tsx. The outage banner below is the first
  // thing on this board to speak it; the rest of the chrome follows in its own commit.
  const lang = useStaffLang();
  const [snap, setSnap] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  // W10b — one degraded state carrying WHEN it started and WHY (see KdsBoard for the full note).
  // `since` and `nowMs` are BOTH the device clock here, so the elapsed driving the paper-flow
  // escalation is measured in one domain — a skewed tablet can't shorten or extend it.
  const [degraded, setDegraded] = useState<StaffDegraded | null>(null);
  // Clock for the escalation only (no 1s ticker here like the KDS): Date.now() in render is impure
  // under the compiler, so it advances in the failure callbacks and a slow tick while degraded.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fails = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useWakeLock(); // O-F: the bagging tablet is always-on too

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // raceTimeout (W10b): a hung poll must degrade into the catch path, not freeze inFlight.
      const res = await raceTimeout(getExpoQueue());
      if (!res.ok) {
        // W10b (M32): outage ≠ signed out — keep the last-known bags instead of redirecting the
        // counter to login mid-service.
        if (res.reason === "outage") {
          setNowMs(Date.now());
          setDegraded((d) => nextDegraded(d, "outage", Date.now()));
          return;
        }
        window.location.assign(res.reason === "locked" ? "/staff/lock" : "/staff/login");
        return;
      }
      setSnap(res.queue);
      setErr(null);
      fails.current = 0;
      setDegraded(null);
    } catch (e) {
      // Cause `unknown` — this end failed, which isn't evidence the platform is down.
      fails.current += 1;
      setNowMs(Date.now());
      if (fails.current >= 2) setDegraded((d) => nextDegraded(d, "unknown", Date.now()));
      console.error("[ExpoBoard] refresh failed", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Slow escalation tick while frozen/stale — the banner's ≥2min flip needs a re-render even if
  // every poll keeps failing silently.
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [degraded]);

  const onChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  }, [refresh]);

  useFloorRealtime(true, onChange);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => {
      clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  // Focus catch-all (WCAG 2.4.3; the KdsBoard pattern): a picked-up bump drops the card — restore focus
  // to the heading only when it fell to <body> from a real control (edge-triggered; poll-safe).
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

  const tickets = snap.tickets;
  const count = tickets.length;
  // W9d — a PURE-grocery (scan-&-go) order has nothing to bag: the shopper already holds the goods,
  // and the counter's job is to check the exit pass. Counting it as a "bag waiting" handed staff
  // phantom bagging work, so the header names the two kinds separately. Vocabulary only — the
  // status machine (mms_set_togo_status / mms_init_togo_status) is untouched.
  // Only PREPARING grocery tickets await verification — a ready one was already verified (its
  // remaining action is recording the hand-over), so counting it here would show staff a shopper
  // they just checked as still pending (Codex). Verified-not-yet-cleared tickets get their OWN
  // segment: without it, a queue of only ready grocery tickets rendered a nonzero grid under a
  // BLANK header status (both other counts zero → empty join), silencing the live region's summary
  // of remaining work (Codex round 3). Every ticket lands in exactly one of the three counts.
  const verifyCount = tickets.filter(
    (t) => t.status === "preparing" && t.lines.every((l) => l.fulfillment === "grocery"),
  ).length;
  const handOverCount = tickets.filter(
    (t) => t.status === "ready" && t.lines.every((l) => l.fulfillment === "grocery"),
  ).length;
  const bagCount = tickets.filter((t) => t.lines.some((l) => l.fulfillment !== "grocery")).length;

  return (
    <section aria-labelledby="expo-h" onFocusCapture={markFocus}>
      <div style={headRow}>
        <h2
          id="expo-h"
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: "var(--fs-body)", margin: 0 }}
        >
          {/* `echo={false}`: this heading is the `aria-labelledby` target for the whole section, and
              a `chrome-pair` echo would name it "ပါဆယ်ထုပ်များTakeaway bags". */}
          <Chrome lang={lang} k="expo.title" />
        </h2>
        {/* P2 — the `lang` mark is STILL conditional, and now for one reason only: `frozenBoardCopy`
              returns a flat STRING and `<OutageText>`'s passthrough arm returns a bare text node, so
              those two branches have nowhere else to carry a mark. Every other branch renders
              <Chrome>, which marks itself. (It used to be conditional because the other branches
              were English literals "until PR B converts them" — this is PR B.) */}
        <p
          role="status"
          lang={!err && degraded ? lang : undefined}
          style={{
            margin: 0,
            fontSize: "var(--fs-sm)",
            color: err || degraded ? "var(--warn)" : "var(--t2)",
          }}
        >
          {err !== null ? (
            // P2 — a server error reaches the DOM here, so it goes through <OutageText>: it swaps the
            // ONE sentence that has an authored Burmese twin (the write outage — the sentence a
            // counter reads when a bump did not save) and passes every other error through verbatim.
            <OutageText lang={lang} error={err} />
          ) : degraded ? (
            frozenBoardCopy(
              lang,
              snap.serverNow,
              nowMs - degraded.since,
              "what.bags",
              degraded.cause,
            )
          ) : count === 0 ? (
            <Chrome lang={lang} k="expo.none" />
          ) : (
            // The three counts are ELEMENTS now, not strings, so `.join(" · ")` cannot make the
            // line: the middot is rendered between the surviving segments instead. Same output,
            // same order, and each segment carries its own `lang` mark.
            [
              bagCount > 0 ? (
                <Chrome
                  key="bags"
                  lang={lang}
                  k={bagCount === 1 ? "expo.count.one" : "expo.count.many"}
                  vars={{ n: bagCount }}
                />
              ) : null,
              verifyCount > 0 ? (
                <Chrome key="verify" lang={lang} k="expo.count.verify" vars={{ n: verifyCount }} />
              ) : null,
              handOverCount > 0 ? (
                <Chrome
                  key="hand"
                  lang={lang}
                  k="expo.count.handOver"
                  vars={{ n: handOverCount }}
                />
              ) : null,
            ]
              .filter(Boolean)
              .map((seg, i) => (
                <Fragment key={i}>
                  {i > 0 ? " · " : null}
                  {seg}
                </Fragment>
              ))
          )}
        </p>
        {/* P2 — mounted per SURFACE, never by app/staff/layout.tsx: a layout-owned strip would add
            height to every staff board, including the measured ones. Last in the head row so it
            never precedes the live region in the reading order. `check-staff-lang.mjs` rule 4 holds
            this mount and reddens if the expo ever loses it. */}
        <StaffLangSwitch lang={lang} />
      </div>

      {count === 0 ? (
        // W10b — mid-freeze this must not read as an all-clear, nor promise bags we can't hear about.
        <EmptyState
          title={
            <Chrome lang={lang} k={degraded ? "expo.emptyFrozen" : "expo.empty"} echo="stack" />
          }
          subtitle={
            <Chrome
              lang={lang}
              k={degraded ? "expo.emptyFrozenSub" : "expo.emptySub"}
              echo="stack"
            />
          }
          icon={<Icon name="bag" size={30} style={{ color: "var(--ac)" }} />}
        />
      ) : (
        <StaggerList
          items={tickets}
          getKey={(t) => t.orderId}
          ariaLabel={sx(lang, "expo.a11y.bags")}
          style={grid}
          renderItem={(t) => (
            <ExpoCard ticket={t} serverNow={snap.serverNow} onBumped={refresh} onError={setErr} />
          )}
        />
      )}
    </section>
  );
}

function ExpoCard({
  ticket,
  serverNow,
  onBumped,
  onError,
}: {
  ticket: ExpoTicket;
  serverNow: string;
  onBumped: () => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const lang = useStaffLang();
  const [pending, startTransition] = useTransition();
  // The stage this card is AT, named once: it decides the next status, the button's word, the
  // button's tint and the card's own name. Four separate `=== "preparing"` tests were four chances
  // for one of them to drift.
  const firstStage = ticket.status === "preparing";
  const to = firstStage ? "ready" : "picked_up";
  // W9d — a pure-grocery (scan-&-go) order: the shopper already HOLDS the goods, so "Bagged & ready"
  // is fiction. Same two-stage status machine (untouched), mapped to the counter's two real moments:
  // check the exit pass ("Verified", preparing→ready) then record the walk-out ("Handed over",
  // ready→picked_up, drops the card). The first cut of this put "Handed over" on the FIRST bump,
  // which left a zombie second stage still counted as unverified (Codex) — each label names the
  // action its OWN tap performs. P2 — those four words are now `expo.verb.*`, rendered on the button
  // and led with by its accessible name from the SAME key, so WCAG 2.5.3 holds by construction.
  const grocery = ticket.lines.every((l) => l.fulfillment === "grocery");

  // K2 + W3e call-out identity: a dine-in to-go bag calls out its real table; a pickup/scango bag
  // headlines the first name captured at checkout (short code as the collision-safe suffix), falling
  // back to the short code alone when the diner skipped the name — expo always has something to call.
  // The identifier half of the call-out — the diner's own name, else the short code. Neither is a
  // WORD, so it is the same string in both tongues and is derived once for both call-outs below.
  const whoElse = ticket.customerName ?? `#${ticket.shortCode}`;
  const callOut = ticket.tableNumber != null ? `Table ${ticket.tableNumber}` : whoElse;
  // The same call-out for the EAR, with the one word in it taken from the dictionary. `callOut`
  // above is the visible header and stays as authored — the expo board's chips are still English
  // and converting one word of it alone would read as a half-translated line (OPEN-ITEMS P2q). A
  // NAME is different: it is the whole sentence a Burmese staffer hears, and splicing an English
  // word the console already owns into it ("Table 7 အတွက် ပါဆယ်ထုပ်") is the defect the ARIA ratchet
  // exists for. `floor.table`'s `{id}` is a Latin-always slot, so the tent-card number stays Latin,
  // which is what is printed on the card. A diner's own name and a short code are identifiers, not
  // words, and pass through as given.
  const callOutAria =
    ticket.tableNumber != null
      ? tf(lang, "floor.table", { id: String(ticket.tableNumber) })
      : whoElse;
  // Who to verify (grocery accessible names): keep the NAME when we have one — an SR staffer needs
  // WHOSE exit pass to match, not just a code — with the code as the collision-safe suffix,
  // mirroring the visible header (callOut + codeSuffix).
  const verifyWho = ticket.customerName
    ? `${callOutAria} · #${ticket.shortCode}`
    : `#${ticket.shortCode}`;
  // The card's name, as a KEY picked here rather than inside the attribute: a `=== "preparing"`
  // test sitting inside a localized name reads to check-staff-lang.mjs rule 3 as authored English
  // spliced into it, which is the very defect that rule exists to catch.
  const cardNameKey = grocery
    ? firstStage
      ? "expo.a11y.cardVerify"
      : "expo.a11y.cardHandOver"
    : "expo.a11y.cardBag";

  const bump = () => {
    onError(null);
    startTransition(async () => {
      try {
        const res = await setTogoStatus({ orderId: ticket.orderId, to });
        if (!res.ok) onError(res.error);
        else await onBumped(); // pending covers the refetch — no stale-label flicker
      } catch {
        // ⚠️ STILL ENGLISH, DELIBERATELY — OPEN-ITEMS P2p, not an oversight. The obvious conversion
        // (`tf(lang, "expo.err.bag", { x: callOutAria })`) is WRONG here twice over: this string is
        // rendered through `<OutageText>`, whose passthrough arm returns a bare text node, so a
        // Burmese sentence would land unmarked — Latin face, announced as English, the exact defect
        // rule 5 exists for; and the slot value a bilingual sentence needs is ITSELF bilingual
        // ("စားပွဲ 7"), which `<Chrome>`'s slot rule would wrap whole in `lang="en"`. Doing it right
        // means a branched notice plus a table/non-table key per stage. Filed, not guessed.
        onError(
          grocery
            ? `Couldn’t update ${verifyWho} — try again.`
            : `Couldn’t update the bag for ${callOut} — try again.`,
        );
      }
    });
  };

  return (
    <article
      className="card card-textured"
      style={cardStyle}
      // The card's name tracks its CURRENT stage — a ready grocery ticket was already verified, so
      // announcing "Verify" for it would read the previous workflow step to an SR staffer (Codex).
      aria-label={tf(lang, cardNameKey, { x: grocery ? verifyWho : callOutAria })}
    >
      <header style={cardHead}>
        <span style={tableLabel}>
          {callOut}
          {ticket.tableNumber == null && ticket.customerName && (
            <span style={codeSuffix}> #{ticket.shortCode}</span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {/* J5: the diner tapped "I'm here" on /track (qr_orders.arrived_at) — a waiting HUMAN
              outranks bag age; hand this one over first. Rendered only from the real stamp. */}
          {ticket.arrivedAt && <span style={hereTag}>Here now</span>}
          {/* Grocery's ready-stage means "pass checked", not "food ready" — tag it honestly. */}
          {ticket.status === "ready" && (
            <span style={readyTag}>{grocery ? "Verified" : "Ready"}</span>
          )}
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
            <RelativeTime iso={ticket.createdAt} serverNow={serverNow} />
          </span>
        </span>
      </header>
      {ticket.pickupSlot && (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          Pickup {formatSlotLong(ticket.pickupSlot)}
        </p>
      )}
      {/* W21 — the pickup contact the checkout REQUIRED, finally readable where it's needed: a
          tel: link so the counter phone dials in one tap. Staff-gated surface; never public. */}
      {ticket.customerPhone && (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          <a
            href={`tel:${ticket.customerPhone.replace(/[^0-9+]/g, "")}`}
            style={{ color: "inherit", fontWeight: 700, minHeight: 44, display: "inline-block" }}
          >
            <span aria-hidden>☎ </span>
            {ticket.customerPhone}
          </a>
        </p>
      )}
      {/* W9d — the honest job description: the shopper already holds these items, so the counter's
          work is the exit-pass check, not bagging. */}
      {grocery && (
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          Scan &amp; Go — verify the exit pass; nothing to bag.
        </p>
      )}
      {/* `listStyle: none` strips the list semantics a screen reader would otherwise announce, so
          the role is restored explicitly — and a restored list still needs a name to be worth
          landing on. */}
      <ul role="list" aria-label={sx(lang, "expo.a11y.lines")} style={lineList}>
        {ticket.lines.map((l) => (
          <ExpoLineRow key={l.id} line={l} />
        ))}
      </ul>
      {/* P2 — the four (grocery × stage) labels are spelled out as WHOLE al() calls with LITERAL
          verb keys, and the same four keys render below through <Chrome>. A computed key would read
          as one call site to the guard and as four to the counter.

          What rule 3c proves, stated precisely because the first version of this comment overstated
          it: that each announced key is RENDERED in this element, on the same ternary branch, with
          the SAME echo. It does not read what `<Chrome>` emits. The reason the echo is part of that
          check is that an echo puts TWO strings on screen under `my`, so `al()` must compose its
          visible label through `chromeVisible(lang, key, echo)` — pass different echoes at the two
          ends and the name silently drops half the visible label (WCAG 2.5.3). The rendered text is
          pinned against that derivation in `Chrome.test.tsx`, which is the only place it can be. */}
      <button
        type="button"
        onClick={bump}
        disabled={pending}
        aria-label={
          grocery
            ? firstStage
              ? al(lang, {
                  kind: "verb",
                  echo: "stack",
                  verb: "expo.verb.verified",
                  subject: verifyWho,
                }).aria
              : al(lang, {
                  kind: "verb",
                  echo: "stack",
                  verb: "expo.verb.handedOver",
                  subject: verifyWho,
                }).aria
            : firstStage
              ? al(lang, {
                  kind: "verb",
                  echo: "stack",
                  verb: "expo.verb.bagged",
                  subject: callOutAria,
                }).aria
              : al(lang, {
                  kind: "verb",
                  echo: "stack",
                  verb: "expo.verb.pickedUp",
                  subject: callOutAria,
                }).aria
        }
        className="staff-btn"
        style={{ ...bumpBtn, ...(firstStage ? readyBtn : pickedBtn) }}
      >
        {pending ? (
          "…"
        ) : grocery ? (
          firstStage ? (
            <Chrome lang={lang} k="expo.verb.verified" echo="stack" />
          ) : (
            <Chrome lang={lang} k="expo.verb.handedOver" echo="stack" />
          )
        ) : firstStage ? (
          <Chrome lang={lang} k="expo.verb.bagged" echo="stack" />
        ) : (
          <Chrome lang={lang} k="expo.verb.pickedUp" echo="stack" />
        )}
      </button>
    </article>
  );
}

function ExpoLineRow({ line }: { line: ExpoLine }) {
  return (
    <li style={lineRow}>
      <span aria-hidden="true" style={qtyBadge}>
        {line.qty}×
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* P1 — the Burmese half of the bag line, above the English the counter already showed
            (`TicketText.tsx`, pinned by its own jsdom suite). */}
        <ExpoLineMy line={line} />
        {line.name}
        {line.modifiers.length > 0 && (
          <span style={{ color: "var(--t2)" }}> · {line.modifiers.join(" · ")}</span>
        )}
        {/* W3b: the allergy/request note rides to the bag too — pack the sauce separately, etc. */}
        {line.notes && <span style={noteInline}>“{line.notes}”</span>}
      </span>
      <span style={destTag}>{line.fulfillment === "grocery" ? "Grocery" : "To-go"}</span>
    </li>
  );
}

const headRow: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s4)",
  // P2 — three children now (heading · live region · language control); wrap rather than crush
  // the 44px switch on a narrow counter tablet.
  flexWrap: "wrap",
};
const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
};
const cardStyle: CSSProperties = { padding: "var(--s4)", display: "grid", gap: "var(--s3)" };
const cardHead: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--s3)",
};
const tableLabel: CSSProperties = { fontWeight: 700, fontSize: "var(--fs-body)" };
const codeSuffix: CSSProperties = { fontWeight: 700, fontSize: "var(--fs-sm)", color: "var(--t2)" };
// The note is safety-adjacent — full text color (not muted), quoted so it reads as the diner's words.
const noteInline: CSSProperties = { display: "block", fontWeight: 700, color: "var(--tx)" };
const readyTag: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ok)",
};
// "Here now" (J5) — accent, not success-green: it flags a waiting person, not a completed step.
const hereTag: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ac-strong)",
};
const lineList: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s2)",
};
const lineRow: CSSProperties = {
  display: "flex",
  // P1 — baseline, not center: with a Burmese line above the English one the label is two lines
  // tall, and the 2× badge and the destination tag belong on the FIRST line's baseline.
  alignItems: "baseline",
  gap: "var(--s2)",
  fontSize: "var(--fs-sm)",
};
const qtyBadge: CSSProperties = { fontWeight: 800, color: "var(--ac-strong)", flex: "none" };
const destTag: CSSProperties = {
  flex: "none",
  fontSize: "var(--fs-xs)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--t2)",
};
const bumpBtn: CSSProperties = {
  minHeight: 44,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const readyBtn: CSSProperties = {
  background: "var(--ac)",
  color: "var(--oa)",
  borderColor: "var(--ac)",
};
const pickedBtn: CSSProperties = { background: "var(--cd)", color: "var(--tx)" };
