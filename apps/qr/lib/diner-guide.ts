import type { CartItem } from "@mms/db";
import { SAME_GESTURE_MS } from "@mms/ui";
import { GUIDE_SEEN_MARK, guideSeenKey, type GuideStore } from "./guide-seen";
import { PAY_OPENS_SERVED } from "./checkout-verb";
import { t } from "./i18n";
import { STAFF } from "./i18n/staff";
import { DINER_STAGE_WORD } from "./line-state-copy";
import type { WelcomeBack } from "./rewards";

/**
 * PD11 (PATH_DESIGN 2026-10-07 decision 12, moment 11 · `docs/path-design-2026-10-07/m11-diner-guide.md`)
 * — the diner's first-visit guide, decided as values. Pure: no React, no I/O. `DinerGuide.tsx` draws
 * it; `lib/guide-seen.ts` (PD12) is the ONE seen-key rule it shares with the staff guides, and
 * `guideActAccepted` (`lib/staff-guide.ts`) the ONE arm.
 *
 * FIVE PAGES, dine-in only: the pass (Mingalaba), the shared order (Not sent yet), the kitchen track
 * (Your order's with the kitchen.), the bill (Your bill) and where things live (Your order). Every
 * TITLE is a shipped bilingual key used whole (the critic's B13: "titles are the controls' own keys",
 * never a fragment of an unrelated sentence); every Burmese line is a shipped string, referenced —
 * never re-typed — so a re-word at the native sitting moves the guide with its source. The English
 * the guide adds has NO Burmese yet: `my: null`, listed for the K15 sitting (OPEN-ITEMS
 * `K15 · diner-cart`), never invented here.
 *
 * NO MONEY, NO COUNTS, NO NAMES, NO TIMES (m11 decision 5). The pictures' dishes are SAMPLES
 * (`GUIDE_SAMPLE`), drawn on the figureless "Your table" pass so a sample is never read as the
 * guest's own order (the critic's C1); only page 1 prints the guest's REAL table number.
 */

// ── The first run ────────────────────────────────────────────────────────────────────────────────

/** The guide's surface and its SHAPE's revision: a guide whose pages change is a new first visit
 *  (`lib/help.ts`'s precedent) — a word that changes at the C2 flip is not a new shape (m11). */
export const DINER_GUIDE_SURFACE = "dinein";
export const DINER_GUIDE_REVISION = 1;
/** Per DEVICE (no person in the key): a phone, not an account. */
export const DINER_GUIDE_KEY = guideSeenKey(DINER_GUIDE_SURFACE, DINER_GUIDE_REVISION);

/**
 * Is this diner one the server already KNOWS? The menu's existing recognition read
 * (`getWelcomeBack`, handed to ArrivalBeat — no new read) knows two kinds: a signed-in account with
 * a display name, and anyone with a card-paid order this month (`earned_by` = their uid). An
 * anonymous dine-in regular who pays at the counter has no earner (`rewards.ts`), so before C2 that
 * is NEARLY EVERY dine-in regular — the critic's B11: the server read covers named accounts and
 * phone payers only; the device mark (and its server-set cookie, below) is what keeps "once per
 * phone". `null` is UNKNOWN (no session, or the read failed) and never suppresses: an unknown diner
 * may be shown the guide; a known one never is.
 */
export function knownDiner(welcome: WelcomeBack | null): boolean {
  if (welcome === null) return false;
  const named = (welcome.name?.trim() ?? "") !== "";
  return named || welcome.ordersThisMonth > 0;
}

/** What the guide's first run reads at its one moment of decision (the claim). */
export type DinerGuideFacts = {
  /** The provider's door — only a dine-in table is taught (never pickup, the market, the kiosk). */
  mode: string;
  /** The table session has JOINED (a cart id) and its first view has been applied (the lock and
   *  freeze below are the server's, not the defaults) — so the guide never covers a join error or
   *  GuestList's recovery block. */
  joined: boolean;
  /** The provider holds a session error (the join failed, or the re-mint is retrying). */
  joinError: boolean;
  /** A tablemate is paying (the pay-window lock). */
  locked: boolean;
  /** The table is settling (the register, or the split). */
  settling: boolean;
  /** A reorder is landing ("Order this again" from Account) — its note would sit under the guide. */
  reorderLanding: boolean;
  /** Another modal is up (the door sheet, the invite sheet, a dish sheet): two focus traps never
   *  stack (the critic's C). */
  dialogOpen: boolean;
  /** The menu's recognition read (`getWelcomeBack`), or null (unknown). */
  welcome: WelcomeBack | null;
};

/**
 * Does the guide open BY ITSELF now? Every clause is a reason the screen is not quiet or the guest
 * is not new (m11 WHEN 1–6, the critic's B11 and C). The seen mark is the shared helper's clause
 * (`guideDue`): a stored mark, or a store that refuses, never opens — that half is mutated where it
 * lives (`pd12/guide-seen/*`), and the cookie half below.
 */
export function dinerGuideAutoOpens(f: DinerGuideFacts): boolean {
  if (f.mode !== "dinein") return false;
  if (!f.joined) return false;
  if (f.joinError) return false;
  if (f.locked) return false;
  if (f.settling) return false;
  if (f.reorderLanding) return false;
  if (f.dialogOpen) return false;
  if (knownDiner(f.welcome)) return false;
  return true;
}

/** Is any modal dialog up in this document? (Radix renders `role="dialog"`; an alert dialog too.) */
export function anyDialogOpen(doc: Pick<Document, "querySelector">): boolean {
  return doc.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/**
 * The arm (Codex round 3 E1, m11 A4): the guide's controls count a tap only `DINER_GUIDE_ARM_MS`
 * after the guide shows and after every page change, and never a press that began before — the
 * phone's same-gesture guard, the kit's ONE number (`SAME_GESTURE_MS`, 350 ms; the console's guides
 * keep 400). Read through the shared `guideActAccepted`.
 */
export const DINER_GUIDE_ARM_MS = SAME_GESTURE_MS;

// ── The mark that outlives Safari's script storage (the critic's B11) ────────────────────────────

/**
 * iOS Safari deletes SCRIPT-WRITTEN storage (localStorage, `document.cookie` cookies) after seven
 * days without a visit; a cookie set by an HTTP RESPONSE from the site itself is not capped. So the
 * guide also asks the server to set its mark (`POST /api/guide-seen`, at open), and the first run
 * reads it back from `document.cookie` when local storage holds nothing. The cookie name is the
 * seen key in cookie-token characters (a `:` is a separator in a cookie name).
 */
export function guideCookieName(key: string): string {
  return key.replace(/:/g, ".");
}
export const DINER_GUIDE_COOKIE = guideCookieName(DINER_GUIDE_KEY);

/** 400 days — the longest lifetime a browser keeps (Chrome caps there). */
export const DINER_GUIDE_COOKIE_MAX_AGE = 34_560_000;

/**
 * The cookie's attributes. NOT HttpOnly: the first run reads it in the browser (the menu render is
 * frozen this wave, so the server cannot hand it down). It carries no authority — a "seen" flag in
 * the caller's own jar — so a page reading it is harmless.
 */
export function dinerGuideCookieOptions(production: boolean) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: production,
    path: "/",
    maxAge: DINER_GUIDE_COOKIE_MAX_AGE,
  };
}

/** Does a `Cookie` header (or `document.cookie`) carry the named mark? Whole names only. */
export function cookieMarked(cookie: string, name: string): boolean {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name && part.slice(eq + 1).trim() !== "") return true;
  }
  return false;
}

/**
 * The diner guide's store: `localStorage` first, then — when it holds nothing for a key — the
 * server-set cookie for that key. A store that THROWS still throws (the shared helper reads that as
 * refused: never auto-open), and writes go to local storage only (the cookie is the server's).
 */
export function dinerGuideStore(local: () => GuideStore, cookie: () => string): () => GuideStore {
  return () => {
    const ls = local();
    return {
      getItem: (k) =>
        ls.getItem(k) ?? (cookieMarked(cookie(), guideCookieName(k)) ? GUIDE_SEEN_MARK : null),
      setItem: (k, v) => ls.setItem(k, v),
    };
  };
}

// ── The pages ────────────────────────────────────────────────────────────────────────────────────

/** A line in two tongues; `my: null` where no Burmese exists yet (English-only, listed for K15). */
export type GuideText = { en: string; my: string | null };

const EN = (en: string): GuideText => ({ en, my: null });
const KEY = (k: Parameters<typeof t>[1]): GuideText => ({ en: t("en", k), my: t("my", k) });

/**
 * Page 4 follows the parked phone-pay door (`SURFACES.dineInPhonePay`, PD2): `counter` while it is
 * parked — the counter in the Bill's own words, and NO card word anywhere (D5: "no card words and no
 * 'coming soon'") — and `phone` after the flip: D5's own sentence, then what the restaurant accepts.
 */
export type GuidePayVariant = "counter" | "phone";
export function guidePayVariant(dineInPhonePay: boolean): GuidePayVariant {
  return dineInPhonePay ? "phone" : "counter";
}

/**
 * The wallets the after-flip sentence may NAME (round 3: "only the wallets the post-flip proof
 * payment showed working"; m11 A6 · B2). D5's proof is one real Apple Pay sale at a table, made right
 * after the flip deploys — and if it fails, the flip is reverted, so this list is never read with
 * the door open on an unproven wallet. "Google Pay" joins only in a commit that cites a recorded
 * Android payment at a table. No wallet is ever drawn as a logo.
 */
export const GUIDE_PROVEN_WALLETS: readonly string[] = ["Apple Pay"];

/** "card", "card or Apple Pay", "card, Apple Pay or Google Pay". */
export function guideTenders(wallets: readonly string[]): string {
  const all = ["card", ...wallets];
  if (all.length === 1) return all[0]!;
  return `${all.slice(0, -1).join(", ")} or ${all[all.length - 1]}`;
}

/** The copy the guide adds. English-only (no Burmese exists; none invented — K15 · diner-cart). */
export const GUIDE_COPY = {
  /** The dialog's name. */
  frame: "How it works",
  /** The close's accessible name (the visible ✕ is the sheet's; "Close" leads — WCAG 2.5.3). */
  closeName: "Close the guide",
  /** The Account row that reopens it. */
  accountRow: "How it works at a table",
  /** Page 1 — InviteSheet's shipped sentence, verbatim (`InviteSheet.tsx`). */
  shared: EN("Everyone at the table adds to one shared order."),
  /** Page 1's quiet line — only while GuestList draws Invite (Codex round 3 E1). A table with no
   *  number has no sticker of its own to scan yet, so its form drops the clause. */
  invite: EN("Tap Invite to add a phone — or just scan the table’s QR sticker."),
  inviteNoSticker: EN("Tap Invite to add a phone."),
  /** Page 2 — on the sender's own phone. */
  sendYou: EN("You send the table’s order to the kitchen — everyone’s dishes go with it."),
  /** Page 2 — everyone else. TRUE on a hostless table too (the critic's B4: a staff-opened table
   *  where every diner joined by link has no phone that sends; the console always can). */
  sendTable: EN(
    "Your table’s order goes to the kitchen in one send — from a phone at the table, or by our staff.",
  ),
  /** Page 3 — true for all three stamps (the critic's B3: Sent is the Send's grace on a clock, not a
   *  kitchen tap, so "never on a timer" was false). */
  track: EN(
    "Each dish moves on your pass when it’s sent, then as the kitchen starts it and finishes it.",
  ),
  /** Page 3's key's name. */
  keyName: "What each mark means",
  /** Page 4 (after the flip) — the quiet human fallback, last. */
  orCounter: EN("Or pay at the counter."),
  /** Page 5. */
  where: EN("Find your order under Order, and this guide under Account."),
} as const;

/** The after-flip pay sentence, from the proven wallets ONLY (the critic's B2). */
export function guidePhonePayLine(wallets: readonly string[]): GuideText {
  return EN(`Then pay right here on your phone — ${guideTenders(wallets)}.`);
}

/** Page 1's quiet line: none at the cap (the row says "Table’s full"); the sticker clause only for a
 *  table with a number. */
export function guideInviteLine(f: {
  atCap: boolean;
  tableNumber: number | null;
}): GuideText | null {
  if (f.atCap) return null;
  return f.tableNumber != null ? GUIDE_COPY.invite : GUIDE_COPY.inviteNoSticker;
}

/** Page 2's sentence: the sender is told it is them; everyone else hears the sentence that is true
 *  whether or not their table has a sender (the critic's B4). */
export function guideSendLine(role: "host" | "guest" | null): GuideText {
  return role === "host" ? GUIDE_COPY.sendYou : GUIDE_COPY.sendTable;
}

/** The shipped words the guide reuses, referenced (never re-typed). */
export const GUIDE_WORDS = {
  /** ArrivalBeat's greeting, verbatim (pinned by the suite). */
  greeting: { en: "Mingalaba", my: "မင်္ဂလာပါ" } as GuideText,
  notSent: DINER_STAGE_WORD.unsent as GuideText,
  withKitchen: KEY("orderWithKitchen"),
  yourBill: KEY("yourBill"),
  yourOrder: KEY("yourOrder"),
  keepOrdering: KEY("counterKeepOrdering"),
  payOpensServed: EN(PAY_OPENS_SERVED),
  /** The dock — the staff guides' own pager words (`help.next` · `help.back`), referenced so a
   *  re-word at the native sitting moves both guides (m11: "staff Burmese on a guest surface"). */
  next: STAFF["help.next"] as GuideText,
  back: STAFF["help.back"] as GuideText,
  /** The one dismiss word (round 3) — the Account door's last primary. */
  close: KEY("close"),
  /** The auto-open's last primary: the real first action. */
  browseMenu: KEY("browseMenu"),
  /** The pager's group name and each dot's (aria only). */
  steps: STAFF["help.a11y.pager"].en,
  step: (n: number, total: number) =>
    STAFF["help.step"].en.replace("{n}", String(n)).replace("{total}", String(total)),
  /** The pass's two-tongue label, as every diner pass prints it. */
  passLabel: { en: "Table", my: STAFF["floor.table"].my.replace(" {id}", "") },
} as const;

export type GuidePicture = "pass" | "unsent" | "kitchen" | "bill-counter" | "bill-phone" | "where";

export type GuidePage = {
  /** The page's heading — a shipped key, whole. */
  title: GuideText;
  /** Page 1's ✦ and page 2's hollow ring beside the English. */
  mark: "spark" | "ring" | null;
  /** The sentence(s), then the quiet line (or none). */
  lines: readonly GuideText[];
  quiet: GuideText | null;
  /** Page 3 carries the track's key. */
  key: boolean;
  picture: GuidePicture;
  /** The stage's one-line accessible name. Sample pictures say so ("Example —"). */
  stageLabel: string;
};

export type GuideContext = {
  /** The table's number, or null (not bound yet, or opened from Account with no table). */
  tableNumber: number | null;
  role: "host" | "guest" | null;
  /** `guestListAtCap` — the guest row's own rule. */
  atCap: boolean;
  payVariant: GuidePayVariant;
};

export const GUIDE_PAGE_COUNT = 5;

/** The five pages for this guest, this table and this door. */
export function guidePages(c: GuideContext): readonly GuidePage[] {
  const phone = c.payVariant === "phone";
  return [
    {
      title: GUIDE_WORDS.greeting,
      mark: "spark",
      lines: [GUIDE_COPY.shared],
      quiet: guideInviteLine(c),
      key: false,
      picture: "pass",
      // The guest's REAL table — the one personal value the guide prints.
      stageLabel:
        c.tableNumber != null ? `Your table’s pass: Table ${c.tableNumber}` : "Your table’s pass",
    },
    {
      title: GUIDE_WORDS.notSent,
      mark: "ring",
      lines: [guideSendLine(c.role)],
      quiet: null,
      key: false,
      picture: "unsent",
      stageLabel: "Example — dishes from everyone at the table, on one order, not sent yet",
    },
    {
      title: GUIDE_WORDS.withKitchen,
      mark: null,
      lines: [GUIDE_COPY.track],
      quiet: null,
      key: true,
      picture: "kitchen",
      stageLabel: "Example — a pass with Mohinga served and Coconut Rice cooking",
    },
    phone
      ? {
          title: GUIDE_WORDS.yourBill,
          mark: null,
          lines: [GUIDE_WORDS.payOpensServed, guidePhonePayLine(GUIDE_PROVEN_WALLETS)],
          quiet: GUIDE_COPY.orCounter,
          key: false,
          picture: "bill-phone",
          stageLabel: "Example — a pass with every dish served",
        }
      : {
          title: GUIDE_WORDS.yourBill,
          mark: null,
          lines: [GUIDE_WORDS.keepOrdering],
          quiet: null,
          key: false,
          picture: "bill-counter",
          stageLabel: "Example — the pass your phone shows at the counter",
        },
    {
      title: GUIDE_WORDS.yourOrder,
      mark: null,
      lines: [GUIDE_COPY.where],
      quiet: null,
      key: false,
      picture: "where",
      stageLabel: "Example — the tab bar, with your pass under Order",
    },
  ];
}

/**
 * What the dialog's ONE live region says when a page changes (it is silent on open): the page's
 * heading in both tongues, then its first sentence — DERIVED from the page, so a variant can never
 * speak a promise its own page does not show (the critic's B1: before C2 the region said "Pay opens
 * once everything’s served." over a counter-only page).
 */
export function guideSpoken(page: GuidePage): { title: GuideText; line: string } {
  return { title: page.title, line: page.lines[0]!.en };
}

// ── The pictures' sample (decision 5: no money, no counts, no names, no times) ─────────────────────

/** The two catalog dishes every picture shows (`docs/data/menu_catalog.json`, pinned by the suite). */
export const GUIDE_SAMPLE = {
  mohinga: { name: "Mohinga", nameMy: "မုန့်ဟင်းခါး" },
  coconutRice: { name: "Coconut Rice", nameMy: "အုန်းထမင်း" },
  /** The pictures' fixed clock — a stage is read against it, never the phone's. */
  nowIso: "2026-10-07T18:30:00.000Z",
} as const;

const FIRED = "2026-10-07T18:05:00.000Z";
const BUMPED = "2026-10-07T18:20:00.000Z"; // long past Mom's undo window on the sample clock

function sample(
  id: string,
  dish: { name: string; nameMy: string },
  state: CartItem["lineState"],
): CartItem {
  return {
    id,
    menuItemId: id,
    name: dish.name,
    nameMy: dish.nameMy,
    qty: 1,
    modifiers: [],
    unitPriceCents: 0, // never drawn: a guide picture prints no price
    taxCents: 0,
    lineState: state,
    fireAt: state === "draft" ? null : FIRED,
    bumpedAt: state === "served" ? BUMPED : null,
    fulfillment: "dinein",
    notes: null,
  };
}

/** The sample rows a pass picture renders, in cart order (the moving row last on page 2). */
export function guideSampleItems(picture: "unsent" | "kitchen" | "bill-phone"): CartItem[] {
  const S = GUIDE_SAMPLE;
  switch (picture) {
    case "unsent":
      // A tablemate's Mohinga lands on the same order as yours (the page's one movement).
      return [
        sample("guide-rice", S.coconutRice, "draft"),
        sample("guide-mohinga", S.mohinga, "draft"),
      ];
    case "kitchen":
      // Coconut Rice is the row whose segment fills (Sent → Cooking).
      return [
        sample("guide-mohinga", S.mohinga, "served"),
        sample("guide-rice", S.coconutRice, "in_progress"),
      ];
    case "bill-phone":
      return [
        sample("guide-mohinga", S.mohinga, "served"),
        sample("guide-rice", S.coconutRice, "served"),
      ];
  }
}

/** The row whose segment FILLs on page 3. */
export const GUIDE_FILLING_ID = "guide-rice";
