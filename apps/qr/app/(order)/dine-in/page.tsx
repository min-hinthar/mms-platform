import { redirect } from "next/navigation";
import { dineInMenuHref } from "@/lib/table-pick";

// Phase 3c-ii (D27) — browse first. K2's "Which table are you at?" picker stood here before the menu;
// the table is now asked ONCE, inside the first Send, as a sheet on the cart (`TableBindSheet`), and
// a scanned sticker or a `?table=N` claim stamps the number at mint and never sees it. The ROUTE
// stays — the manifest's jump list names it and `ActiveOrderProvider` / `diner-tabs` read the path
// as the dine-in door — and enters the dine-in menu on today's bare host-start: the ONE builder's
// href, the same string the home's Dine-in door carries (`lib/doors.ts`, pinned by doors.test).
export default function DineIn() {
  redirect(dineInMenuHref({}));
}
