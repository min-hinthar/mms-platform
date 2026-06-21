import { Heading, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { MmsEmailLayout } from "./MmsEmailLayout";

/** Sent (best-effort) when an owner deactivates a staff member — an honest heads-up, no alarm. */
export function StaffDeactivatedEmail() {
  return (
    <MmsEmailLayout preview="Your Mandalay Morning Star staff access is paused">
      <Heading style={h1}>Your staff access is paused</Heading>
      <Text style={text}>
        Your access to the Mandalay Morning Star staff console has been turned off, so you won’t be
        able to sign in for now.
      </Text>
      <Text style={fine}>
        If that’s a surprise, check with an owner — they can switch it back on any time.
      </Text>
    </MmsEmailLayout>
  );
}

const h1: CSSProperties = {
  fontFamily: "Georgia,'Times New Roman',serif",
  fontSize: "23px",
  fontWeight: 700,
  margin: "0 0 8px",
  color: "#1b1714",
};
const text: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#1b1714",
  margin: "0 0 18px",
};
const fine: CSSProperties = { fontSize: "13px", color: "#6e6358", margin: 0 };
