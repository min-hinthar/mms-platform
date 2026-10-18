import { Badge, type BadgeTone } from "@mms/ui";
import type { PaymentModeStatus } from "@/lib/stripe-env";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * The payments badge (owner, 2026-10-18) — a READ-ONLY line on the staff home naming the Stripe mode
 * this deployment runs in, so every manager can see it. There is deliberately NO toggle: the mode
 * lives in Vercel's environment and nowhere else, and a switch a manager could flip to test would
 * make real orders look paid with no money behind them.
 *
 * The verdict is `readPaymentMode()` (`lib/stripe.ts`), computed on the server from the resolvers
 * checkout itself uses; this component receives the ENUM and nothing else, so no credential — not a
 * value, not a prefix — can reach the client from here. A Server Component: no hooks, no state.
 *
 * Copy: the badge is a chip, so no echo (Chrome's echo policy); the note and the fix line are the
 * sentences a manager acts on, so they echo. Colour is never the only signal — every state has its
 * own words. Static text, not a live region: nothing about it changes while the page is open.
 */
type Copy = {
  readonly label: StaffKey;
  readonly tone: BadgeTone;
  readonly note?: StaffKey;
  /** A setup fault: the note takes the warn ink and the fix line follows it. */
  readonly fault?: true;
};

export const PAYMENT_MODE_COPY: Readonly<Record<PaymentModeStatus, Copy>> = {
  live: { label: "shell.pay.live", tone: "ok" },
  test: { label: "shell.pay.test", tone: "warn", note: "shell.pay.test.note" },
  mismatch: {
    label: "shell.pay.check",
    tone: "warn",
    note: "shell.pay.mismatch.note",
    fault: true,
  },
  webhook_mismatch: {
    label: "shell.pay.check",
    tone: "warn",
    note: "shell.pay.webhook.note",
    fault: true,
  },
  unconfigured: {
    label: "shell.pay.check",
    tone: "warn",
    note: "shell.pay.unconfigured.note",
    fault: true,
  },
  unknown: {
    label: "shell.pay.unknown",
    tone: "warn",
    note: "shell.pay.unknown.note",
    fault: true,
  },
};

export function PaymentModeBadge({ lang, status }: { lang: StaffLang; status: PaymentModeStatus }) {
  const c = PAYMENT_MODE_COPY[status];
  return (
    <div className="staff-paymode" data-status={status}>
      <Badge tone={c.tone}>
        <Chrome lang={lang} k={c.label} />
      </Badge>
      {c.note && (
        <p
          className={c.fault ? "staff-paymode-note staff-paymode-note-warn" : "staff-paymode-note"}
        >
          <Chrome lang={lang} k={c.note} echo="stack" />
          {c.fault && (
            <>
              {" "}
              <Chrome
                lang={lang}
                k="shell.pay.fix"
                vars={{ x: ts(lang, "table.appr.stripe"), y: ts(lang, "shell.pay.vercel") }}
                echo="stack"
              />
            </>
          )}
        </p>
      )}
    </div>
  );
}
