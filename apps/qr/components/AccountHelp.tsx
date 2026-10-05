import type { CSSProperties } from "react";
import { Card, Icon } from "@mms/ui";
import {
  BRAND_ADDRESS,
  BRAND_EMAIL,
  BRAND_FACEBOOK,
  BRAND_INSTAGRAM,
  BRAND_PHONE_DISPLAY,
  BRAND_PHONE_TEL,
} from "@/lib/brand";

/**
 * Phase 3a (D4) — the hub's Help & contact card, on the You panel. Every string is `lib/brand.ts`
 * (W22r: the restaurant's identity, once, verbatim from the delivery app's production constants).
 * There are NO business hours anywhere in either repo, so none are offered here — fabricating
 * hours would be the exact honesty violation the design language forbids.
 */
export function AccountHelp() {
  return (
    <Card as="section" style={card} aria-labelledby="acct-help-h">
      <h2 id="acct-help-h" style={cardH}>
        Help & contact
      </h2>
      <ul role="list" style={list}>
        <li style={row}>
          <span style={glyph} aria-hidden>
            <Icon name="info" size={18} />
          </span>
          <a href={`tel:${BRAND_PHONE_TEL}`} className="nav-link" style={rowLink}>
            Call us · {BRAND_PHONE_DISPLAY}
          </a>
        </li>
        <li style={row}>
          <span style={glyph} aria-hidden>
            <Icon name="pin" size={18} />
          </span>
          <span style={rowText}>{BRAND_ADDRESS}</span>
        </li>
        <li style={row}>
          <span style={glyph} aria-hidden>
            <Icon name="receipt" size={18} />
          </span>
          <a href={`mailto:${BRAND_EMAIL}`} className="nav-link" style={rowLink}>
            {BRAND_EMAIL}
          </a>
        </li>
        <li style={row}>
          <span style={glyph} aria-hidden>
            <Icon name="star" size={18} />
          </span>
          <span style={rowText}>
            <a href={BRAND_INSTAGRAM} className="nav-link" rel="noopener" target="_blank">
              Instagram
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {" · "}
            <a href={BRAND_FACEBOOK} className="nav-link" rel="noopener" target="_blank">
              Facebook
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </span>
        </li>
      </ul>
      <p style={note}>
        Something wrong with an order? Call or email and we’ll sort it out — a receipt code from
        your orders helps us find it fast.
      </p>
    </Card>
  );
}

const card: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const cardH: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-heavy)",
  letterSpacing: "var(--track-snug)",
  textTransform: "uppercase",
  color: "var(--t2)",
};
const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 };
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 10, minHeight: 44 };
const glyph: CSSProperties = { display: "inline-grid", placeItems: "center", color: "var(--ac)" };
const rowLink: CSSProperties = { fontWeight: "var(--fw-bold)" };
const rowText: CSSProperties = { color: "var(--tx)" };
const note: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  lineHeight: 1.5,
};
