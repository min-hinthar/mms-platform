import { ReadyBoard } from "@/components/ReadyBoard";
import { readBoardLang } from "@/lib/staff-lang-server";

export const metadata = {
  title: "Order ready board — Mandalay Morning Star",
  robots: { index: false, follow: false }, // a device URL, never a search destination
};
export const dynamic = "force-dynamic";

/**
 * W3e: the order-ready board — /board on any smart-TV browser. Preparing | Ready, first name + short
 * code, gold flash on the ready transition. The device token in the URL (?k=…) authorizes the SANITIZED
 * /api/board poll; the page itself renders nothing sensitive (a missing/wrong token just shows the
 * board's honest "not linked" state — the API is the gate, not this shell). Takeout + grocery only;
 * dine-in status stays on the diner's phone.
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; lang?: string }>;
}) {
  const { k, lang } = await searchParams;
  // P2 — the TV's language: `?lang=` on the bookmark first, then the device cookie, then Burmese.
  // The bookmark already carries `?k=<device token>`, so it is where this screen's configuration
  // lives; a smart-TV browser is also the device most likely to lose a cookie between shifts. A
  // GARBAGE `?lang=` falls through to the cookie rather than to the default, so a typo in the URL
  // cannot silently override a screen that was set up correctly.
  const boardLang = await readBoardLang(lang);
  return (
    <main>
      <ReadyBoard token={k ?? ""} lang={boardLang} />
    </main>
  );
}
