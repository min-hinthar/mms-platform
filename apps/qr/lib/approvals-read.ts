import { serviceClient } from "@mms/db/server";
import { lineNowFromRow, type RequestLineNow } from "./approval-state";
import type { PendingFlag } from "./settle-approvals";

/**
 * PD8 — THE read behind every flag at Take payment: the cart's pending requests, as the table detail
 * draws them and as the three settle doors compare them (`staffSettleApprovalVerdict`). Named once so
 * the pane and the doors can never disagree about what "pending on this cart" means.
 *
 * ERROR-AWARE: `null` when the rows could not be read, never a guessed `[]` — the staff doors refuse
 * on it (`approvalsUnreadableRefusal`) and the detail degrades to no flag (the dish stays charged, the
 * safe state; the door's own read then re-warns if a request is really there). The initiator's name
 * is advisory: an unreadable roster leaves the request's shipped fallback, never drops the flag.
 */
export async function readPendingApprovalFlags(cartId: string): Promise<PendingFlag[] | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("mms_approvals")
    .select("id,kind,line_id,line_name,qty,amount_cents,cooked,initiator_staff_id,created_at")
    .eq("cart_id", cartId)
    .eq("status", "pending");
  if (error || !data) {
    console.error("[approvals-read] pending read failed", { cartId, message: error?.message });
    return null;
  }
  const initiatorIds = [...new Set(data.map((r) => r.initiator_staff_id))];
  const nameById = new Map<string, string>();
  if (initiatorIds.length) {
    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("user_id,display_name")
      .in("user_id", initiatorIds);
    // Deliberate degrade: the name is attribution on a warning, not the warning. Logged, not raised.
    if (staffError)
      console.error("[approvals-read] initiator names unreadable", staffError.message);
    for (const s of staff ?? []) nameById.set(s.user_id, s.display_name);
  }
  // PD8 (the blind pass on #333) — the line as it stands NOW, through the queue's ONE derivation, so
  // the pane's sheet offers the request's real keys (a changed line: Close it, never only Deny). A
  // failed read is "unknown", never "gone": the doors need only the ids, and the card offers no
  // decision on an unknown line (the queue still can).
  const lineIds = [...new Set(data.map((r) => r.line_id).filter((id): id is string => !!id))];
  let lineById: Map<string, RequestLineNow> | null = new Map();
  if (lineIds.length) {
    const { data: lines, error: lineError } = await db
      .from("qr_cart_items")
      .select("id,qty,unit_price_cents,state,comped")
      .in("id", lineIds);
    if (lineError || !lines) {
      console.error("[approvals-read] live lines unreadable", lineError?.message);
      lineById = null;
    } else {
      for (const l of lines) lineById.set(l.id, lineNowFromRow(l));
    }
  }
  // Oldest first, sorted here (not `.order()`): the shipped detail read this replaces was the bare
  // two-filter query, and every detail fake in the suites answers exactly that shape.
  const rows = [...data].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "comp" ? "comp" : "void",
    lineId: r.line_id,
    lineName: r.line_name ?? "Item",
    nameMy: null,
    qty: r.qty ?? 1,
    amountCents: r.amount_cents,
    cooked: r.cooked,
    initiatorName: nameById.get(r.initiator_staff_id) ?? "A server",
    initiatorStaffId: r.initiator_staff_id,
    createdAt: r.created_at,
    lineNow: lineById === null ? "unknown" : r.line_id ? (lineById.get(r.line_id) ?? null) : null,
  }));
}
