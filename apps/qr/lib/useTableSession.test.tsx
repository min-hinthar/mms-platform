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

// PD3 follow-up — a solo session refuses a second member, so a device whose anonymous identity was
// replaced gets a FRESH session under a fresh key; the device must adopt it.
function SoloProbe() {
  const { session, error } = useTableSession("pickup", { door: "pickup" });
  return <p data-testid="solo">{error ?? (session ? `joined:${session.joinCode}` : "minting")}</p>;
}

describe("useTableSession — a solo key the server re-minted is adopted (PD3 follow-up)", () => {
  it("the stored pickup key is replaced by the fresh one the server minted", async () => {
    // MUTATION: persist the dine-in code only — every visit re-sends the held key, re-mints, and
    // the basket resets.
    window.localStorage.setItem("mms.qr.pickup", "pickup-held");
    fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...MINT, joinCode: "pickup-fresh" }),
      } as Response);
    });
    const { getByTestId } = render(<SoloProbe />);
    await waitFor(() => expect(getByTestId("solo").textContent).toBe("joined:pickup-fresh"));
    expect(bodies[0]).toMatchObject({ qrCode: "pickup-held", mode: "pickup" });
    expect(window.localStorage.getItem("mms.qr.pickup")).toBe("pickup-fresh");
    expect(window.localStorage.getItem("mms.qr.dinein")).toBeNull();
  });

  it("a solo mint never marks its stored key `persisted` (the J15 arm is dine-in's)", async () => {
    window.localStorage.setItem("mms.qr.pickup", "pickup-mine");
    render(<SoloProbe />);
    await minted();
    expect(bodies[0]).toMatchObject({ qrCode: "pickup-mine", mode: "pickup" });
    expect(bodies[0]).not.toHaveProperty("persisted");
  });

  it("an ordinary rejoin (the same key back) leaves the stored key as it was", async () => {
    window.localStorage.setItem("mms.qr.pickup", "pickup-mine");
    fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...MINT, joinCode: "pickup-mine" }),
      } as Response);
    });
    const { getByTestId } = render(<SoloProbe />);
    await waitFor(() => expect(getByTestId("solo").textContent).toBe("joined:pickup-mine"));
    expect(window.localStorage.getItem("mms.qr.pickup")).toBe("pickup-mine");
  });
});

// J16 — a refusal's machine word reaches the caller beside its sentence; GuestList recovers by the
// word (`joinFailureArm`), never by grepping the sentence.
function ReasonProbe() {
  const { error, errorReason, revalidate } = useTableSession("dinein", {
    door: "dinein",
    tableNumber: 7,
  });
  return (
    <>
      <p data-testid="reason">{`${errorReason ?? "none"}|${error ?? "none"}`}</p>
      <button type="button" onClick={revalidate}>
        retry
      </button>
    </>
  );
}
const refusal = (status: number, body: Record<string, unknown>) =>
  fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Promise.resolve({ ok: false, status, json: () => Promise.resolve(body) } as Response);
  });

describe("useTableSession — a refusal carries its `reason` (J16)", () => {
  it("the seated race's word and sentence both reach the caller", async () => {
    // MUTATION (j16-reason/hook-drops-the-word): the hook keeps only the sentence — GuestList
    // is back to grepping English, and the seated race is a futile retry again.
    refusal(409, { error: "That table was just seated.", reason: "seated" });
    const { getByTestId } = render(<ReasonProbe />);
    await waitFor(() =>
      expect(getByTestId("reason").textContent).toBe("seated|That table was just seated."),
    );
  });

  it("a word this build does not know, or none at all, is null — the generic retryable failure, never a verdict", async () => {
    refusal(409, { error: "Something new.", reason: "some_future_word" });
    const { getByTestId, getByRole } = render(<ReasonProbe />);
    await waitFor(() => expect(getByTestId("reason").textContent).toBe("none|Something new."));
    refusal(500, {});
    getByRole("button", { name: "retry" }).click();
    await waitFor(() => expect(getByTestId("reason").textContent).toBe("none|HTTP 500"));
  });

  it("a retry clears the word with the sentence, and a success leaves neither", async () => {
    refusal(400, { error: "That table isn’t available.", reason: "table_not_registered" });
    const { getByTestId, getByRole } = render(<ReasonProbe />);
    await waitFor(() =>
      expect(getByTestId("reason").textContent).toBe(
        "table_not_registered|That table isn’t available.",
      ),
    );
    getByRole("button", { name: "retry" }).click();
    await waitFor(() => expect(getByTestId("reason").textContent).toBe("none|none"));
  });
});

// Session truth (M172) — the URL credential is single-use: after the server accepts a mint, every
// later mint of this hook re-joins by the ACCEPTED code under J15 (`persisted`), never by the
// sticker or invite still held in the page's props.
function RemintProbe(props: { code?: string; tableNumber?: number; joinOnly?: boolean }) {
  const { session, revalidate } = useTableSession("dinein", { ...props, door: "dinein" });
  return (
    <>
      <p data-testid="remint">
        {session
          ? `joined:${session.joinCode}:${session.created}:${session.replacedStored}`
          : "minting"}
      </p>
      <button type="button" onClick={revalidate}>
        remint
      </button>
    </>
  );
}

describe("useTableSession — the URL entry is spent once the server accepts it (session truth, M172)", () => {
  it("a sticker's RE-MINT sends the accepted code, persisted — never the sticker again", async () => {
    const { getByTestId, getByRole } = render(<RemintProbe code="SCANNED1" />);
    await waitFor(() => expect(getByTestId("remint").textContent).toContain("joined:ACCEPTED"));
    expect(bodies[0]).toMatchObject({ qrCode: "SCANNED1" });
    expect(bodies[0]).not.toHaveProperty("persisted");
    getByRole("button", { name: "remint" }).click();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodies[1]).toMatchObject({ qrCode: "ACCEPTED", persisted: true });
  });

  it("an invite's and a claim's re-mint drop `joinOnly` and the number — a closed invite no longer 404s, a freed table is not re-claimed", async () => {
    const { getByTestId, getByRole } = render(
      <RemintProbe code="INVITE01" joinOnly tableNumber={5} />,
    );
    await waitFor(() => expect(getByTestId("remint").textContent).toContain("joined:ACCEPTED"));
    expect(bodies[0]).toMatchObject({ qrCode: "INVITE01", joinOnly: true, tableNumber: 5 });
    getByRole("button", { name: "remint" }).click();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodies[1]).toMatchObject({ qrCode: "ACCEPTED", persisted: true });
    expect(bodies[1]).not.toHaveProperty("joinOnly");
    expect(bodies[1]).not.toHaveProperty("tableNumber");
  });

  it("finding 4 — `replacedStored`: a persisted code the server answered with a CREATED session (that table had ended)", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    const { getByTestId } = render(<RemintProbe />);
    await waitFor(() =>
      expect(getByTestId("remint").textContent).toBe("joined:ACCEPTED:true:true"),
    );
  });

  it("a persisted code the server RE-JOINED is not a replaced table, and a URL code never is", async () => {
    window.localStorage.setItem("mms.qr.dinein", "PRIORCOD");
    fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...MINT, created: false }),
      } as Response);
    });
    const first = render(<RemintProbe />);
    await waitFor(() =>
      expect(first.getByTestId("remint").textContent).toBe("joined:ACCEPTED:false:false"),
    );
    first.unmount();
    const second = render(<RemintProbe code="SCANNED1" />);
    await waitFor(() =>
      expect(second.getByTestId("remint").textContent).toBe("joined:ACCEPTED:true:false"),
    );
  });

  it("a route's `fresh` (a server-started table this claim took) reads as created for the resume notice", async () => {
    fetchSpy.mockImplementationOnce((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...MINT, created: false, fresh: true }),
      } as Response);
    });
    const { getByTestId } = render(<RemintProbe tableNumber={5} />);
    await waitFor(() =>
      expect(getByTestId("remint").textContent).toBe("joined:ACCEPTED:true:false"),
    );
  });
});
