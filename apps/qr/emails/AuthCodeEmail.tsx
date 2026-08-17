import { Button, Heading, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { MmsEmailLayout } from "./MmsEmailLayout";

/**
 * The staff sign-in email (magic-link / OTP), rendered for the Supabase Send-Email Hook. The 6-digit
 * CODE is the hero (typed on the sign-in screen → reliable, immune to email link-prefetchers that can
 * consume a single-use magic link); the magic-link button is a secondary convenience. heading/intro
 * are set per email_action_type by the hook.
 */
export function AuthCodeEmail({
  code,
  magicLink,
  heading = "Your sign-in code",
  intro = "Enter this code on the sign-in screen to reach the floor.",
  expiresMinutes = 60,
}: {
  code: string;
  magicLink?: string;
  heading?: string;
  intro?: string;
  expiresMinutes?: number;
}) {
  return (
    <MmsEmailLayout
      preview={`${code} — your Mandalay Morning Star sign-in code`}
      reason="You’re receiving this because a staff sign-in was requested for this address. If that wasn’t you, you can ignore this email."
    >
      <Heading style={h1}>{heading}</Heading>
      <Text style={text}>{intro}</Text>
      <Section style={codeBox}>
        <Text style={codeText}>{code}</Text>
      </Section>
      {magicLink ? (
        <Section style={{ margin: "20px 0 4px" }}>
          <Button href={magicLink} style={button}>
            Or tap to sign in
          </Button>
        </Section>
      ) : null}
      <Text style={fine}>
        This code expires in {expiresMinutes} minutes. If you didn’t request it, you can ignore this
        email.
      </Text>
    </MmsEmailLayout>
  );
}

const h1: CSSProperties = {
  fontFamily: "Georgia,'Times New Roman',serif",
  fontSize: "23px",
  fontWeight: 700,
  letterSpacing: "-0.01em",
  margin: "0 0 8px",
  color: "#1b1714",
};
const text: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#1b1714",
  margin: "0 0 18px",
};
const codeBox: CSSProperties = {
  backgroundColor: "#fffdf8",
  border: "1px solid rgba(58,35,23,0.12)",
  borderRadius: "14px",
  padding: "18px",
  textAlign: "center",
};
const codeText: CSSProperties = {
  fontSize: "34px",
  fontWeight: 700,
  letterSpacing: "0.3em",
  color: "#a65f10",
  margin: 0,
  // tabular so the digits sit evenly; the trailing letter-spacing pads the right — offset with padding-left
  fontVariantNumeric: "tabular-nums",
  paddingLeft: "0.3em",
};
const button: CSSProperties = {
  backgroundColor: "#a65f10",
  color: "#fffdf8",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  padding: "12px 22px",
  borderRadius: "999px",
};
const fine: CSSProperties = { fontSize: "13px", color: "#6e6358", margin: "18px 0 0" };
