/**
 * Codex round 4 on #312 (P1) — the in-flight write ledger behind a `settled()` barrier, as a value.
 *
 * `TableCartProvider` has carried this shape inline since W21 (Codex P1 on #191): every cart write
 * is TRACKED, and the checkout navigation awaits `settled()` so an add still in flight when the diner
 * leaves for /cart cannot be missed by /cart's first read or refused by its create-intent lock. The
 * market (`app/grocery/page.tsx`) writes through `scanAdd` / `setQty` with no provider and had no
 * ledger at all, so the Order tab's new drain (round 3) resolved at once there — a no-op on exactly
 * the surface whose adds take longest. A factory rather than a hook so it is falsified by a VALUE
 * (the repo's lib-first rule), and so the market can hold ONE instance across its 1400 lines.
 *
 * `settled()` loops: an op enqueued WHILE the drain awaits (a rapid second scan) is caught by the
 * next pass, so the barrier resolves only when the ledger is truly empty. The tracked copy owns its
 * rejection — the CALLER still gets the original promise with its error intact.
 */
export type WriteLedger = {
  /** Count an in-flight write. Returns the SAME promise, so `await track(p)` reads like `await p`. */
  track: <T>(p: Promise<T>) => Promise<T>;
  /** Resolves once every tracked write has settled — including ones tracked during the wait. */
  settled: () => Promise<void>;
  /** How many writes are in flight right now (for the surfaces that narrate a drain). */
  size: () => number;
};

export function createWriteLedger(): WriteLedger {
  const inflight = new Set<Promise<unknown>>();
  return {
    track<T>(p: Promise<T>): Promise<T> {
      inflight.add(p);
      void p.catch(() => {}).finally(() => inflight.delete(p));
      return p;
    },
    async settled() {
      while (inflight.size > 0) {
        await Promise.allSettled([...inflight]);
      }
    },
    size: () => inflight.size,
  };
}

/**
 * The deadline on a drain a NAVIGATION awaits (deep pass on #312). A `settled()` barrier is only as
 * finite as the slowest write behind it, and a `"use server"` action on a dying mobile radio can hang
 * for as long as the OS keeps the socket half-open — minutes. Behind the Order tab, CartBar and the
 * market's Check out that meant `aria-busy` forever and every further tap swallowed. After the
 * deadline the navigation goes: a write hung this long is dead, and /cart's own read is the truth.
 */
export const DRAIN_MAX_MS = 8000;

/** Resolve when `p` settles or when `ms` has passed — whichever first. Never rejects: a drain's
 *  outcome is not the caller's error, and the write keeps its own promise. */
export function bounded(p: Promise<unknown>, ms: number = DRAIN_MAX_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    p.then(done, done);
  });
}
