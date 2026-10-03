import { redirect } from "next/navigation";

// /rewards consolidated into /account (the Morning Star Rewards hub + account, M4 P4.1). Phase 3a
// made /account a hub that opens on Orders, so the legacy address names ITS panel — an old bookmark
// or an external link to the Stars must not land on the order history (Codex round 3 on #312).
export default function Rewards() {
  redirect("/account?tab=rewards");
}
