"use client";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { staffAddItem } from "@/lib/staff-cart";
import {
  pendingBlocker,
  pendingReduce,
  type PendingAdd,
  type PendingEvent,
} from "@/lib/pad-pending";
import {
  padAddNotice,
  padAddVerdict,
  padSentenceNotice,
  type PadAddVerdict,
  type PadMsg,
  type PadNotice,
} from "@/lib/pad-errors";

/**
 * Phase 2c · pad — the order pad's SERIALIZED add chain (DESIGN-LANGUAGE §4 · §23 · §28).
 *
 * Every add is claimed at the TAP (a ghost, a `+1`) and written through ONE promise chain, so the
 * writes commit in tap order. Each attempt mints its own add key (`crypto.randomUUID()`), which
 * `staffAddItem` forwards to the scan-event ledger (`p_scan_id`): a resend of the SAME key can never
 * put the dish on twice, and a NEW tap is a new key by design.
 *
 * ⚠️ 15 SECONDS WITH NO ANSWER IS "UNCONFIRMED", NOT A FAILURE. Next runs Server Actions one at a
 * time, so a hung add holds every later action (the next add, the Send, the reads) — and the raced
 * timeout only SURFACES that: the raw promise stays observed, the chain keeps waiting on it (tap
 * order holds), and a late answer resolves the ghost normally. The pad then offers a reload (which
 * aborts the queue; the reloaded ticket is the server's truth). An answer that says the write MAY
 * have committed, or an action that threw, is `lost`: the ghost stays and offers "Send again" under
 * the same key.
 *
 * `settled()` is the drain the Send and Take payment wait on: it resolves when the chain is idle,
 * or as soon as an add goes unconfirmed (a hung request must not hold the tap forever — the caller
 * then reads `blocker()` and says what it is waiting on).
 */

/** How long an add may go unanswered before its ghost reads "Checking…". A hang detector, not a
 *  latency budget — the same 15s as `raceTimeout` (lib/staff-outage.ts), measured there. */
const ADD_UNCONFIRMED_MS = 15_000;

export type PadAddRequest = {
  itemId: string;
  name: string;
  nameMy: string | null;
  qty: number;
  modifierIds: string[];
  notes?: string;
};

/** What the caller learns: the verdict, or `unconfirmed` (15s with no answer), or `offline` (the
 *  tap never left). */
export type PadAddOutcome = PadAddVerdict["kind"] | "unconfirmed" | "offline";

/** A refusal said somewhere other than the pad's region (the options sheet's own, M82). */
export type PadRefusal = { kind: "msg"; msg: PadMsg };

export function usePadWrites({
  sessionId,
  readsRef,
  dishName,
  onLanded,
  onNotice,
  onSignin,
  onRefused,
}: {
  sessionId: string;
  /** The last read STARTED (a landed add records it — the ghost leaves on a later read). */
  readsRef: MutableRefObject<number>;
  /** The dish as the console renders it (Burmese-first), for the region's sentences. */
  dishName: (req: Pick<PadAddRequest, "name" | "nameMy">) => string;
  /** An add landed: re-read the order now. */
  onLanded: () => void;
  onNotice: (n: PadNotice) => void;
  onSignin: () => void;
  /** A DEFINITE non-landing for this dish (the settle cue; `soldOut` turns the tile). */
  onRefused: (itemId: string, soldOut: boolean) => void;
}) {
  const [pending, setPending] = useState<PendingAdd[]>([]);
  // The state's mirror, written in the same handler as the state (never in render), so a tap or a
  // drain reads the truth at the moment it runs.
  const stateRef = useRef<PendingAdd[]>([]);
  const apply = useCallback((e: PendingEvent) => {
    stateRef.current = pendingReduce(stateRef.current, e);
    setPending(stateRef.current);
  }, []);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const requests = useRef(new Map<string, PadAddRequest>());
  // Attempts whose refusal belongs to their ORIGIN (the sheet), not the pad's region.
  const quiet = useRef(new Set<string>());
  // Each finished attempt's refusal, for the origin to read (`lastRefusal`).
  const refusals = useRef(new Map<string, PadRefusal>());
  // Attempts that reached a definite end — a resend of one answers from here, sending nothing.
  const finals = useRef(new Map<string, "ok" | "refused">());
  const waiters = useRef(new Set<() => void>());
  const wake = useCallback(() => {
    for (const w of [...waiters.current]) w();
  }, []);
  // The latest callbacks, mirrored after each commit (never written during render).
  const cbs = useRef({ dishName, onLanded, onNotice, onSignin, onRefused });
  useEffect(() => {
    cbs.current = { dishName, onLanded, onNotice, onSignin, onRefused };
  }, [dishName, onLanded, onNotice, onSignin, onRefused]);

  const handle = useCallback(
    (key: string, req: PadAddRequest, v: PadAddVerdict) => {
      const cb = cbs.current;
      const say = (n: PadNotice) => {
        refusals.current.set(key, { kind: "msg", msg: n.msg });
        if (!quiet.current.has(key)) cb.onNotice(n);
      };
      if (v.kind === "ok") {
        apply({ kind: "ok", key, seq: readsRef.current });
        finals.current.set(key, "ok");
        cb.onLanded();
        return;
      }
      if (v.kind === "unknown") {
        // It may be on the order: the ghost stays, "Send again" resends THIS key, and the read
        // below shows the truth if it did land.
        apply({ kind: "rejected", key });
        say(padAddNotice("pad.err.add.unconfirmed", cb.dishName(req)));
        cb.onLanded();
        return;
      }
      apply({ kind: "refused", key });
      finals.current.set(key, "refused");
      const err = v.err;
      if (err.kind === "signin") {
        cb.onSignin();
        return;
      }
      if (err.kind === "sentence") say(padSentenceNotice(err.text));
      else say(padAddNotice(err.key, cb.dishName(req)));
      cb.onRefused(req.itemId, err.kind === "key" && err.code === "sold_out");
    },
    [apply, readsRef],
  );

  /**
   * Queue one attempt at `key`. The returned outcome resolves at its answer — or 15s after the TAP
   * with no answer ("unconfirmed"), even while it is still QUEUED behind a hung add: its origin (the
   * options sheet holds itself busy on it) must never wait longer than that on someone else's hang.
   * The GHOST goes "Checking…" only 15s after its own DISPATCH: until then it is simply in line.
   */
  const enqueue = useCallback(
    (key: string): Promise<PadAddOutcome> =>
      new Promise<PadAddOutcome>((resolveOutcome) => {
        let resolved = false;
        const resolveOnce = (o: PadAddOutcome) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(tapTimer);
          // The origin stops waiting here: whatever this attempt says LATER is the pad's to say.
          if (o === "unconfirmed") quiet.current.delete(key);
          resolveOutcome(o);
        };
        // Declared after `resolveOnce` reads it: every call to it runs later (a timer, the chain).
        const tapTimer = setTimeout(() => resolveOnce("unconfirmed"), ADD_UNCONFIRMED_MS);
        chain.current = chain.current.then(
          () =>
            new Promise<void>((done) => {
              const req = requests.current.get(key);
              if (!req) {
                resolveOnce("refused");
                done();
                return;
              }
              let answered = false;
              const timer = setTimeout(() => {
                if (answered) return;
                apply({ kind: "timeout", key });
                resolveOnce("unconfirmed");
                wake();
              }, ADD_UNCONFIRMED_MS);
              staffAddItem({
                sessionId,
                menuItemId: req.itemId,
                modifierIds: req.modifierIds,
                qty: req.qty,
                notes: req.notes,
                addKey: key,
              })
                .then(
                  (r) => padAddVerdict(r),
                  (e: unknown) => {
                    console.error("[usePadWrites] staffAddItem threw", e);
                    return padAddVerdict("threw");
                  },
                )
                .then((v) => {
                  answered = true;
                  clearTimeout(timer);
                  handle(key, req, v);
                  resolveOnce(v.kind);
                  done();
                  wake();
                });
            }),
        );
      }),
    [apply, handle, sessionId, wake],
  );

  /** A tap: claimed now, written in tap order. A tap made offline never leaves the device. A
   *  `quietRefusal` attempt (the sheet's) keeps its refusal for its origin to show. */
  const add = useCallback(
    (
      req: PadAddRequest,
      opts: { quietRefusal?: boolean } = {},
    ): { key: string | null; done: Promise<PadAddOutcome> } => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!opts.quietRefusal)
          cbs.current.onNotice(padAddNotice("pad.err.add.offline", cbs.current.dishName(req)));
        return { key: null, done: Promise.resolve("offline") };
      }
      const key = crypto.randomUUID();
      requests.current.set(key, req);
      if (opts.quietRefusal) quiet.current.add(key);
      apply({
        kind: "tap",
        key,
        itemId: req.itemId,
        name: req.name,
        nameMy: req.nameMy,
        qty: req.qty,
      });
      return { key, done: enqueue(key) };
    },
    [apply, enqueue],
  );

  /** "Send again" on a LOST add: the SAME key, so it cannot go on twice. */
  const resend = useCallback(
    (key: string): Promise<PadAddOutcome> => {
      const final = finals.current.get(key);
      if (final) return Promise.resolve(final); // it already ended — nothing to send again
      const p = stateRef.current.find((x) => x.key === key);
      if (!p || !requests.current.has(key)) return Promise.resolve("refused");
      // Only a LOST attempt is sent again; one still in the air (or landed, unread) is not a second
      // request — its own answer is coming.
      if (p.state === "landed") return Promise.resolve("ok");
      if (p.state !== "lost") return Promise.resolve("unconfirmed");
      apply({ kind: "retry", key });
      return enqueue(key);
    },
    [apply, enqueue],
  );

  /** What an attempt's refusal said (for the origin that asked to say it itself). */
  const lastRefusal = useCallback(
    (key: string | null): PadRefusal | null => (key ? (refusals.current.get(key) ?? null) : null),
    [],
  );

  /** A read committed (its start sequence): landed ghosts that read now shows leave. */
  const commit = useCallback(
    (readStartSeq: number) => apply({ kind: "commit", readStartSeq }),
    [apply],
  );

  /** The drain: resolves when every queued add has answered — or at once when one goes
   *  unconfirmed (the caller then reads `blocker()`). */
  const settled = useCallback(async (): Promise<void> => {
    for (;;) {
      const c = chain.current;
      if (stateRef.current.some((p) => p.state === "unconfirmed")) return;
      let release: () => void = () => {};
      const woke = new Promise<"woke">((r) => {
        release = () => r("woke");
        waiters.current.add(release);
      });
      const why = await Promise.race([c.then(() => "done" as const), woke]);
      waiters.current.delete(release);
      // Woken (an add answered or went unconfirmed) or done: the loop's first line decides.
      if (chain.current === c && why === "done") return;
    }
  }, []);

  /** The first add whose fate is unknown, read NOW. */
  const blocker = useCallback((): PendingAdd | null => pendingBlocker(stateRef.current), []);

  return { pending, add, resend, commit, settled, blocker, lastRefusal };
}
