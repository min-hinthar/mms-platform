import { Button, Heading, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { MmsEmailLayout } from "./MmsEmailLayout";
import { EMAIL } from "./palette";

/** Sent (best-effort) when an owner provisions a new staff member — tells them they can sign in. */
export function StaffInviteEmail({
  displayName,
  roleLabel,
  signInUrl,
}: {
  displayName: string;
  roleLabel: string;
  signInUrl: string;
}) {
  return (
    <MmsEmailLayout
      preview="You’re set up on the Mandalay Morning Star floor"
      reason="You’re receiving this because you were added to the Mandalay Morning Star team."
    >
      <Heading style={h1}>You’re on the team</Heading>
      <Text style={text}>
        Hi {displayName}, you’ve been added to the Mandalay Morning Star floor as{" "}
        <strong>{roleLabel}</strong>. Sign in any time with Google or your email — no password to
        remember.
      </Text>
      <Section style={{ margin: "0 0 22px" }}>
        <Button href={signInUrl} style={button}>
          Sign in to the floor
        </Button>
      </Section>
      <Text style={fine}>Or open {signInUrl}</Text>
    </MmsEmailLayout>
  );
}

const h1: CSSProperties = {
  fontFamily: "Georgia,'Times New Roman',serif",
  fontSize: "23px",
  fontWeight: 700,
  margin: "0 0 8px",
  color: EMAIL.tx,
};
const text: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: EMAIL.tx,
  margin: "0 0 20px",
};
const button: CSSProperties = {
  backgroundColor: EMAIL.ac,
  color: EMAIL.oa,
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  padding: "12px 22px",
  borderRadius: "999px",
};
const fine: CSSProperties = { fontSize: "13px", color: EMAIL.t2, margin: 0 };
