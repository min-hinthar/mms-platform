import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const { proxy } = await import("../proxy");

/**
 * Phase 0 — the bare-/menu rule must be a real 307 at the EDGE. The page repeats it, but a
 * Server Component redirect under a route with `loading.tsx` streams the skeleton first and hops on
 * the client (LEARNINGS #132), so deleting the proxy block would bring the flash back with every
 * other suite green. This pins the block itself.
 */
const req = (path: string) => new NextRequest(new URL(path, "https://qr.example.test"));

describe("proxy — a mode-less /menu is a 307 before anything renders", () => {
  it("sends a bare /menu to the door picker", async () => {
    // MUTATION: delete the `/menu` block in proxy.ts → the request passes through (no 307); red.
    const res = await proxy(req("/menu"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("sends a coded entry to dine-in with its params kept", async () => {
    const res = await proxy(req("/menu?t=3F9A2C1B&door=dinein"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/menu");
    expect(to.searchParams.get("mode")).toBe("dinein");
    expect(to.searchParams.get("t")).toBe("3F9A2C1B");
  });

  it("lets an explicit mode through untouched", async () => {
    const res = await proxy(req("/menu?mode=pickup"));
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });
});
