"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mms/ui";
import { boundWrite, stalledSince } from "@/lib/bounded-write";
import { checkTablePayment } from "@/lib/payment-recovery-actions";
import { checkPaymentSays } from "@/lib/payment-recovery-verdict";
import type { StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * M160(b) — staff's "Check payment", beside a clear that refused because a card payment started on
 * the table and did not finish (`card_live`, m7 graft 8). It asks the SERVER to retrieve that card
 * payment from Stripe and, only if Stripe says it went through, record the order through the
 * webhook's own fulfillment (`checkTablePayment` → `recoverIntent`). Nothing here decides money.
 *
 * ONE live region per view (QA-CHECKLIST §A): this control draws NO sentence of its own. It hands
 * the answer's dictionary key up (`onAnswer`) and the clear's existing `role="alert"` says it — the
 * same split `ReloadButton` keeps. `@mms/ui`'s Button gives the 44px floor; `busy` is its
 * `aria-disabled` + `aria-busy` (re-entry refused there and by the ref here), never native `disabled` (K35).
 *
 * Bounded like every staff write (Phase 2h, 9b · 9d): refused at the tap on a stalled tablet (the
 * caller says `out.stalled`), and an answer that has not come back by the bound is "couldn't check"
 * — never a guess. A recorded order re-reads the page so the table shows it paid.
 */
export function CheckPaymentButton({
  sessionId,
  lang,
  onAnswer,
}: {
  sessionId: string;
  lang: StaffLang;
  /** The sentence to say, in the dictionary's words — or `"out.stalled"` for a stalled tablet. */
  onAnswer: (k: StaffKey) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function check() {
    if (inFlight.current) return;
    if (stalledSince() !== null) {
      onAnswer("out.stalled");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const out = await boundWrite(checkTablePayment({ sessionId }));
      if (out.kind !== "answer") {
        if (out.kind === "threw") console.error("[CheckPaymentButton] check failed", out.error);
        onAnswer("settle.check.error");
        return;
      }
      onAnswer(checkPaymentSays(out.value));
      // The server revalidated the table's pages; re-read them so the paid state shows here too.
      if (out.value.kind === "recorded" || out.value.kind === "refund_needed") router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      busy={busy}
      busyLabel={<Chrome lang={lang} k="settle.check.checking" echo={false} />}
      onClick={() => void check()}
    >
      <Chrome lang={lang} k="settle.check.btn" echo="stack" />
    </Button>
  );
}
