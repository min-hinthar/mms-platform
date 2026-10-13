import "server-only";
import { cache } from "react";
import { serviceClient } from "@mms/db/server";
import { readLedgerSince, type LedgerRow } from "./refund-ledger";

/**
 * M221 — the service day's refund ledger, read ONCE per request and shared by every reader in it.
 *
 * `/staff` renders the settled list (`getSettledToday`, lib/refunds.ts) and the register's drawer
 * (`getDayCashSummary`, lib/register.ts) on one page, and both answer from the day's `mms_refunds`
 * rows. M218/M219 put that read behind one function (`readLedgerSince`) so the two could not DERIVE
 * differently, but each still made its own read: a refund committing between the two asks landed in
 * one screen's answer and not the other's — on the one page where the two sit side by side — and the
 * page's most expensive read (it pages the whole service day) ran twice.
 *
 * So the read is wrapped in React's request-scoped `cache()`: within one server request, the first
 * ask reads and every later ask for the SAME floor receives that same promise, settled or not, so
 * both screens render one snapshot. Keyed on `sinceIso` alone — a string, compared by value — because
 * the client is constructed inside: each caller holds its own `serviceClient()`, and an argument that
 * differs per caller would key nothing. A different floor is a different question and is read on its
 * own (a request straddling the day's boundary is never handed the other day's ledger).
 *
 * What it does NOT change: the read itself (`readLedgerSince` — keyset-paged, null on any failure,
 * complete as of its first page's snapshot, M222), and a request is still the boundary — the settled
 * list's own refresh (a Server Action, `SettledToday`) is a new request and reads afresh. A failed
 * read is shared too: both screens answer `outage` together, which is the honest pairing. Outside a
 * server request React's `cache` calls straight through, so a plain caller behaves exactly as before.
 */
export const readDayLedger = cache(
  (sinceIso: string): Promise<LedgerRow[] | null> => readLedgerSince(serviceClient(), sinceIso),
);
