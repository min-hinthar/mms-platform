import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { siteUrl } from "@/lib/site-url";
import {
  BRAND_ADDRESS,
  BRAND_EMAIL,
  BRAND_FACEBOOK,
  BRAND_INSTAGRAM,
  BRAND_NAME,
  BRAND_PHONE_DISPLAY,
  BRAND_PHONE_TEL,
} from "@/lib/brand";

/**
 * Shared brand shell for every MMS email (React Email) — W22r: brought to the delivery app's
 * polish (its production email shell is the reference): the true-PNG badge up top (hosted URL —
 * email clients can't read the app's WebP-in-.png logo; /email-logo.png is the real 400×250 PNG
 * copied from the delivery repo), the bilingual kicker, and a full identity footer (name ·
 * street address · phone · email · socials — every string verbatim from lib/brand). A 3-cell
 * solid top bar stands in for the triad (email clients drop gradients — flat cells only).
 *
 * Email clients can't load `@mms/ui` tokens (no external CSS / custom properties), so colors here
 * are LITERAL light-palette values — the sanctioned exception. The honest reason line is
 * QR-specific: these are receipts the diner ASKED for, not marketing.
 */
export function MmsEmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  const logoUrl = `${siteUrl()}/email-logo.png`;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={card}>
            {/* The triad bar — three solid cells (gold / amber / ink), never a gradient. */}
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td style={{ ...bar, backgroundColor: "#e8a83c", width: "50%" }} />
                  <td style={{ ...bar, backgroundColor: "#a65f10", width: "30%" }} />
                  <td style={{ ...bar, backgroundColor: "#1b1714", width: "20%" }} />
                </tr>
              </tbody>
            </table>
            <Section style={inner}>
              <Img src={logoUrl} alt={BRAND_NAME} width={100} height={63} style={logo} />
              {/* The delivery shell's production kicker, verbatim (its MY is already owner-run). */}
              <Text style={kicker}>Mingalabar · မင်္ဂလာပါ</Text>
              <Text style={eyebrow}>{BRAND_NAME}</Text>
              {children}
            </Section>
          </Section>
          <Section style={{ marginTop: "20px" }}>
            <Text style={footerStrong}>✦ {BRAND_NAME}</Text>
            <Text style={footerLine}>{BRAND_ADDRESS}</Text>
            <Text style={footerLine}>
              <Link href={`tel:${BRAND_PHONE_TEL}`} style={footerLink}>
                {BRAND_PHONE_DISPLAY}
              </Link>
              {" · "}
              <Link href={`mailto:${BRAND_EMAIL}`} style={footerLink}>
                {BRAND_EMAIL}
              </Link>
            </Text>
            <Text style={footerLine}>
              <Link href={BRAND_INSTAGRAM} style={footerLink}>
                Instagram
              </Link>
              {" · "}
              <Link href={BRAND_FACEBOOK} style={footerLink}>
                Facebook
              </Link>
            </Text>
            {/* Honest reason line — QR receipts are ASKED for at the table, never marketing. */}
            <Text style={footerFine}>
              You’re receiving this because you asked for your receipt when you ordered with us.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: CSSProperties = {
  backgroundColor: "#faf9f5",
  fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  color: "#1b1714",
  margin: 0,
  padding: 0,
};
const container: CSSProperties = { maxWidth: "480px", margin: "0 auto", padding: "32px 16px" };
const card: CSSProperties = {
  backgroundColor: "#fffdf8",
  border: "1px solid #e8e2d9",
  borderRadius: "16px",
  overflow: "hidden",
};
const bar: CSSProperties = { height: "5px", fontSize: "0", lineHeight: "0" };
const inner: CSSProperties = { padding: "24px 24px 28px" };
const logo: CSSProperties = { display: "block", margin: "0 0 12px" };
const kicker: CSSProperties = {
  fontSize: "12px",
  color: "#6e6358",
  margin: "0 0 2px",
};
const eyebrow: CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "#a65f10",
  margin: "0 0 14px",
};
const footerStrong: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#1b1714",
  margin: "0 0 2px",
  textAlign: "center" as const,
};
const footerLine: CSSProperties = {
  fontSize: "12px",
  color: "#6e6358",
  margin: "0 0 2px",
  textAlign: "center" as const,
};
const footerLink: CSSProperties = { color: "#6e6358", textDecoration: "underline" };
const footerFine: CSSProperties = {
  fontSize: "11px",
  color: "#9b8f82",
  margin: "10px 0 0",
  textAlign: "center" as const,
};
