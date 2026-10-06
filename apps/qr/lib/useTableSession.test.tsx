/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

/**
 * Phase 3c-ii (D25) — the mint's POST body on a `?table=N` claim carries the persisted dine-in code
 * BESIDE the number. The server reads that code only as `priorCode` — this phone's own live session,
 * verified by `host_seat === seat` — so an UNBOUND session the diner hosts is BOUND to the table
 * instead of a second session minting over its drafts (J33's unbound half). It is never the key the
 * number resolves: the claim still finds the table by NUMBER.
 *
 * W9a stays law and is pinned beside it: the code is read from storage, never written before the
 * server accepts it; a deep-link code (`?t=`/`?j=`) wins over the persisted key; with neither there
 * is no `qrCode` at all (the server mints one). This is `useTableSession.ts`'s first suite — the
 * line it pins (`resolveQrCode` on a claim) is W9a-sensitive, which is why the whole shape of the
 * body is asserted and not just the one key.
 */

vi.mock("./useAnonSession", () => ({
  useAnonSession: () => ({ accessToken: "anon-token", seat: "seat-1" }),
}));

const { useTableSession } = await import("./useTableSession");

const MINT = {
  sessionId: "5e551011-0000-4000-8000-000000000001",
  seat: "5e551011-0000-4000-8000-000000000002",
  role: "host",
  cartId: "ca97f000-0000-4000-8000-000000000003",
  joinCode: "ACCEPTED",
  tableNumber: null,
  created: true,
};

let bodies: Record<string, unknown>[] = [];
const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
  bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
  return Promise.resolve({ ok: true, json: () => Promise.resolve(MINT) } as Response);
});

function Probe(props: { code?: string; tableNumber?: number; joinOnly?: boolean }) {
  const { session, error } = useTableSession("dinein", { ...props, door: "dinein" });
  return <p data-testid="probe">{error ?? (session ? `joined:${session.joinCode}` : "minting")}</p>;
}

beforeEach(() => {
  bodies = [];
  window.localStorage.clear();
  vi.stubGlobal("fetch", fetchSpy);
  window.history.replaceState(null, "", "/menu?mode=dinein&door=dinein");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

const minted = () => waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

describe("useTableSession — the claim's POST body (D25)", () => {
  it("a `?table=N` claim with a persisted code sends BOTH: the code as priorCode, the number as the claim", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    render(<Probe tableNumber={5} />);
    await minted();
    expect(bodies[0]).toMatchObject({ qrCode: "PRIORCOD", tableNumber: 5, mode: "dinein" });
  });

  it("a claim with NO persisted code sends the number alone — no `qrCode` key at all", async () => {
    render(<Probe tableNumber={5} />);
    await minted();
    expect(bodies[0]).toMatchObject({ tableNumber: 5, mode: "dinein" });
    expect(bodies[0]).not.toHaveProperty("qrCode");
  });

  it("a bare host-start with neither sends no `qrCode` and no `tableNumber` (the server mints a code)", async () => {
    render(<Probe />);
    await minted();
    expect(bodies[0]).not.toHaveProperty("qrCode");
    expect(bodies[0]).not.toHaveProperty("tableNumber");
  });

  it("a persisted code with no table rejoins by that code, as before — MARKED `persisted` (J15: the server re-joins only a session this seat belongs to)", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    render(<Probe />);
    await minted();
    expect(bodies[0]).toMatchObject({ qrCode: "PRIORCOD", persisted: true });
    expect(bodies[0]).not.toHaveProperty("tableNumber");
  });

  it("a URL code (`?t=` / `?j=`) is never marked persisted — the sticker is the join identity", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    render(<Probe code="SCANNED1" />);
    await minted();
    expect(bodies[0]).toMatchObject({ qrCode: "SCANNED1" });
    expect(bodies[0]).not.toHaveProperty("persisted");
  });

  it("a claim's prior code is never marked persisted — the number is the key, the code is `priorCode`", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    render(<Probe tableNumber={5} />);
    await minted();
    expect(bodies[0]).not.toHaveProperty("persisted");
  });

  it("W9a — a deep-link code wins over the persisted key, and a claim never marks itself join-only", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    render(<Probe code="SCANNED1" tableNumber={5} />);
    await minted();
    expect(bodies[0]).toMatchObject({ qrCode: "SCANNED1", tableNumber: 5 });
    expect(bodies[0]).not.toHaveProperty("joinOnly");
  });

  it("W9a — only the code the server ACCEPTED is persisted, after the mint", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    const { getByTestId } = render(<Probe tableNumber={5} />);
    await waitFor(() => expect(getByTestId("probe").textContent).toBe("joined:ACCEPTED"));
    expect(window.localStorage.getItem("mms.qr.dinein")).toBe("ACCEPTED");
  });
});
