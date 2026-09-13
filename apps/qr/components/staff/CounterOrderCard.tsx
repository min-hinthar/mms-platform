import Link from "next/link";
import { Badge, Card } from "@mms/ui";
import type { RegisterQueueRow } from "@/lib/register-queue";
import type { StaffLang } from "@/lib/staff-lang";
import { al, chromeVisible } from "@/lib/staff-labels";
import { plural } from "@/lib/i18n/fill";
import { Chrome } from "./Chrome";
import { RelativeTime } from "./RelativeTime";
import { tableCardStyle } from "./TableCard";

/** Preformatted money — the repo's counter idiom. Latin in both tongues: it rides the `{m}` slot,
 *  which `fill()` never localizes. */
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The row's own text, assembled for the NAME — every piece composed the way the card RENDERS it,
 * echo included, through `chromeVisible` (the one derivation), so an edit to `reg.row.*` moves both
 * the visible text and the accessible name and WCAG 2.5.3 containment cannot drift.
 *
 * ⚠️ Moved verbatim from the register page (A4·2), where it was a LIVE 2.5.3 failure once: built
 * from `ts()`/`tf()`, the name under `my` said only the Burmese halves of two echoed Chromes. The
 * echo passed here must match the `echo` prop on the matching `<Chrome>` below; the channel chip
 * deliberately has none — two scripts cannot legibly stack in a chip.
 */
function subjectOf(lang: StaffLang, r: RegisterQueueRow): string {
  const name = r.customerName ?? chromeVisible(lang, "reg.row.walkup", "inline");
  const chip = chromeVisible(lang, r.source === "kiosk" ? "reg.row.kiosk" : "floor.counter.chip");
  const meta = chromeVisible(lang, plural(r.itemCount, "reg.row.one", "reg.row.many"), "inline", {
    n: r.itemCount,
    m: fmt(r.subtotalCents),
  });
  return `${name} · ${chip}, ${meta}`;
}

/**
 * A4·2 — one open COUNTER order on the counter's one list, beside the tables. The same card surface
 * as `TableCard` (its exported styles, so the two cannot drift apart on one grid) and the same
 * whole-card link into the order screen the register queue's rows opened (`/staff/table/[id]/add`).
 * The channel chip is what tells it from a table at a glance: Counter, or Kiosk when the guest
 * built it themselves.
 */
export function CounterOrderCard({
  order,
  serverNow,
  lang,
}: {
  order: RegisterQueueRow;
  serverNow: string;
  lang: StaffLang;
}) {
  // `kind: "subject"` — the verb LEADS the announcement ("Resume, Aye · Counter, 2 items · …") and
  // the card's own text is what the name must contain.
  const { aria } = al(lang, {
    kind: "subject",
    verb: "reg.verb.resume",
    subject: subjectOf(lang, order),
  });
  return (
    <Card
      as={Link}
      href={`/staff/table/${order.sessionId}/add`}
      interactive
      textured
      style={tableCardStyle.card}
      aria-label={aria}
    >
      <div style={tableCardStyle.topRow}>
        <span style={tableCardStyle.label}>
          {order.customerName ?? <Chrome lang={lang} k="reg.row.walkup" echo="inline" />}
        </span>
        {/* Decorative: the card's name already says the channel. `bordered` matches the sibling
            table cards' outlined status chip. */}
        <Badge tone="accent" bordered decorative>
          <Chrome
            lang={lang}
            k={order.source === "kiosk" ? "reg.row.kiosk" : "floor.counter.chip"}
          />
        </Badge>
      </div>
      <div style={tableCardStyle.metaRow}>
        <Chrome
          lang={lang}
          k={plural(order.itemCount, "reg.row.one", "reg.row.many")}
          vars={{ n: order.itemCount, m: fmt(order.subtotalCents) }}
          echo="inline"
        />
      </div>
      {/* No status line: a counter order's status IS that it is open, which the chip already says,
          and every visible word inside this link must be in its name (WCAG 2.5.3 — the blind pass
          caught a draft that drew "Order in progress" here and left it out of the name). */}
      <div style={tableCardStyle.bottomRow}>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          <RelativeTime iso={order.startedAt} serverNow={serverNow} />
        </span>
      </div>
    </Card>
  );
}
