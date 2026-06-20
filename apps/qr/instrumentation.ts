/**
 * Server-side error capture (App Router). Next calls `onRequestError` for every UNCAUGHT error in a
 * Server Component, Server Action, route handler, or middleware — the layer that was invisible during
 * the session-expiry bug: a thrown Server Action error is redacted in prod, so it never reached the
 * client or any tool (diagnosis meant reading Supabase logs). Forwarding it to PostHog names the
 * failure where the product analytics already live. Client exceptions are captured by posthog-js
 * (`capture_exceptions: true` in instrumentation-client.ts), so together we cover both sides — no
 * second vendor (Sentry would be redundant here).
 */
type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: RequestErrorContext,
): Promise<void> {
  // posthog-node is a Node client — only safe on the Node.js runtime, so the Edge bundle (proxy.ts
  // middleware) never pulls it in. Edge/middleware faults skip server capture; client posthog-js still
  // reports anything that surfaces in the browser.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { getPostHogClient } = await import("@/lib/posthog-server");
    // captureExceptionImmediate captures AND flushes (awaited) — required on serverless, where the
    // function can freeze before a buffered event sends. Personless (no distinctId): a server fault
    // isn't a user action, and we attach only opaque, non-PII context (path/route/method — QA §C P2).
    await getPostHogClient().captureExceptionImmediate(
      error instanceof Error ? error : new Error(String(error)),
      undefined,
      {
        path: request.path,
        method: request.method,
        route: context.routePath,
        route_type: context.routeType,
      },
    );
  } catch {
    // Never let error reporting throw inside the error handler — that would mask the original error.
  }
}
