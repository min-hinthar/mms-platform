import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared brand shell for every MMS email (React Email). Email clients can't load `@mms/ui` tokens
 * (no external CSS / CSS custom properties), so colors here are LITERAL brand values — the sanctioned
 * exception. Mirrors the light palette (pg/cd/tx/t2/ac) + the eyebrow treatment from tokens.css.
 */
export function MmsEmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={eyebrow}>Mandalay Morning Star</Text>
          {children}
          <Section style={{ marginTop: "28px" }}>
            <Text style={footer}>Mandalay Morning Star · teahouse</Text>
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
const container: CSSProperties = { maxWidth: "480px", margin: "0 auto", padding: "32px 24px" };
const eyebrow: CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "#a65f10",
  margin: "0 0 14px",
};
const footer: CSSProperties = { fontSize: "12px", color: "#6e6358", margin: 0 };
