import { redirect } from "next/navigation";

// /rewards consolidated into /account (the Morning Star Rewards hub + account, M4 P4.1).
export default function Rewards() {
  redirect("/account");
}
