/**
 * A signal that aborts after `ms` — the ONE home of the iPadOS < 16 fallback (Codex r1 on #311,
 * P2it). `AbortSignal.timeout` exists only from Safari / iPadOS 16: on an older staff tablet calling
 * it THROWS, so a bounded read lands in its catch on every call and reads as "no answer" for the life
 * of the device — the version read (`makeFetchServed`) and the health probe (`useConnectionTruth`)
 * both went blind that way. So when it is missing, an AbortController plus a timer does the same
 * job. Read at the call (`as` defaults to the global), never at load. Pure and client-safe.
 */
export function timeoutSignal(
  ms: number,
  as: { timeout?: (ms: number) => AbortSignal } | undefined = globalThis.AbortSignal,
): AbortSignal {
  if (typeof as?.timeout === "function") return as.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
