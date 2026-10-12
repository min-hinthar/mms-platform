import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { SAME_GESTURE_MS } from "@mms/ui";
import {
  GUIDE_SEEN_MARK,
  GUIDE_STORE_REFUSED,
  claimGuideFirstRun,
  readGuideMark,
} from "./guide-seen";
import { t } from "./i18n";
import { STAFF } from "./i18n/staff";
import { DINER_STAGE_WORD } from "./line-state-copy";
import { PAY_OPENS_SERVED } from "./checkout-verb";
import { SURFACES } from "./surfaces";
import { passRowStage, passHead } from "./live-pass";
import { ACCOUNT_PANELS, accountPanel } from "./account-hub";
import {
  DINER_GUIDE_ARM_MS,
  DINER_GUIDE_COOKIE,
  DINER_GUIDE_KEY,
  GUIDE_COPY,
  GUIDE_FILLING_ID,
  GUIDE_PAGE_COUNT,
  GUIDE_PROVEN_WALLETS,
  GUIDE_SAMPLE,
  GUIDE_WORDS,
  anyDialogOpen,
  cookieMarked,
  dinerGuideAutoOpens,
  dinerGuideStore,
  guideCookieName,
  guideInviteLine,
  guidePages,
  guidePayVariant,
  guidePhonePayLine,
  guideSampleItems,
  guideSendLine,
  guideSpoken,
  guideTenders,
  knownDiner,
  type DinerGuideFacts,
  type GuideContext,
} from "./diner-guide";

/**
 * PD11 (m11) — the diner guide's pure part. Each clause of the first run is falsified by a VALUE
 * (one fact flipped from a quiet, new, joined dine-in arrival); the copy is pinned to the shipped
 * strings it reuses; the pages are pinned for the parked flag EXACTLY (the critic's B1: equality,
 * never a substring search for "card").
 */
const REPO = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const QUIET: DinerGuideFacts = {
  mode: "dinein",
  joined: true,
  joinError: false,
  locked: false,
  settling: false,
  reorderLanding: false,
  dialogOpen: false,
  welcome: { name: null, ordersThisMonth: 0 },
};

describe("dinerGuideAutoOpens — once, for a new guest, on a quiet dine-in arrival", () => {
  it("opens for a quiet, joined, new dine-in guest", () => {
    expect(dinerGuideAutoOpens(QUIET)).toBe(true);
  });

  it.each([
    ["pickup — never a door the guide does not teach", { mode: "pickup" }],
    ["scan-and-go", { mode: "scango" }],
    ["before the join (and its first view) — never over GuestList's recovery", { joined: false }],
    ["over a join error", { joinError: true }],
    ["while a tablemate is paying (the lock)", { locked: true }],
    ["while the table settles", { settling: true }],
    ["while a reorder lands (its note would sit under the guide)", { reorderLanding: true }],
    ["over another open dialog (two traps never stack)", { dialogOpen: true }],
    ["for a named account", { welcome: { name: "Aye", ordersThisMonth: 0 } }],
    ["for a guest with a paid order this month", { welcome: { name: null, ordersThisMonth: 1 } }],
  ] as const)("never %s", (_, flip) => {
    expect(dinerGuideAutoOpens({ ...QUIET, ...flip })).toBe(false);
  });

  it("an UNKNOWN diner (no session, or the read failed: welcome null) may be shown it", () => {
    // MUTATION (pd11/known/null-is-known): null read as known — every phone whose read failed, and
    // every anonymous first scan before its user exists, would never see the guide; red.
    expect(knownDiner(null)).toBe(false);
    expect(dinerGuideAutoOpens({ ...QUIET, welcome: null })).toBe(true);
  });

  it("a whitespace name is no name (the greeting's own rule: `name?.trim()`)", () => {
    expect(knownDiner({ name: "  ", ordersThisMonth: 0 })).toBe(false);
    expect(knownDiner({ name: "Aye", ordersThisMonth: 0 })).toBe(true);
    expect(knownDiner({ name: null, ordersThisMonth: 2 })).toBe(true);
  });

  it("another dialog is anything Radix draws as one (dialog or alertdialog) — read from the page", () => {
    const doc = (hit: string | null) => ({
      querySelector: (sel: string) => (hit && sel.includes(hit) ? ({} as Element) : null),
    });
    expect(anyDialogOpen(doc('role="dialog"'))).toBe(true);
    expect(anyDialogOpen(doc('role="alertdialog"'))).toBe(true);
    expect(anyDialogOpen(doc(null))).toBe(false);
  });
});

describe("the mark — the shared helper's rule, plus a server-set cookie that outlives Safari", () => {
  it("the key is the dine-in surface, revision 1, per DEVICE (no person)", () => {
    expect(DINER_GUIDE_KEY).toBe("mms.guide.seen:dinein:1");
    expect(DINER_GUIDE_COOKIE).toBe("mms.guide.seen.dinein.1");
    expect(guideCookieName("a:b:c")).toBe("a.b.c");
  });

  const mem = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      map: m,
    };
  };

  it("local storage first; an EMPTY local store reads the server-set cookie", () => {
    const local = mem();
    const store = dinerGuideStore(
      () => local,
      () => `a=1; ${DINER_GUIDE_COOKIE}=${GUIDE_SEEN_MARK}; b=2`,
    );
    // MUTATION (pd11/store/cookie-ignored): the cookie never read — a phone Safari cleared is shown
    // the guide again on every monthly visit; red.
    expect(readGuideMark(store, DINER_GUIDE_KEY)).toBe(GUIDE_SEEN_MARK);
    expect(claimGuideFirstRun(store, DINER_GUIDE_KEY, true)).toBe(false);
  });

  it("no mark anywhere: due, and the claim marks LOCAL storage before it shows", () => {
    const local = mem();
    const store = dinerGuideStore(
      () => local,
      () => "other=1",
    );
    expect(claimGuideFirstRun(store, DINER_GUIDE_KEY, true)).toBe(true);
    expect(local.map.get(DINER_GUIDE_KEY)).toBe(GUIDE_SEEN_MARK);
  });

  it("a store that throws is REFUSED (never auto-opens), cookie or no cookie", () => {
    const store = dinerGuideStore(
      () => {
        throw new DOMException("denied", "SecurityError");
      },
      () => "",
    );
    expect(readGuideMark(store, DINER_GUIDE_KEY)).toBe(GUIDE_STORE_REFUSED);
    expect(claimGuideFirstRun(store, DINER_GUIDE_KEY, true)).toBe(false);
  });

  it("cookieMarked matches a WHOLE name with a value — never a prefix, a suffix or an empty value", () => {
    const n = DINER_GUIDE_COOKIE;
    expect(cookieMarked(`${n}=1`, n)).toBe(true);
    expect(cookieMarked(` x=2 ;  ${n}=1 `, n)).toBe(true);
    expect(cookieMarked(`${n}x=1`, n)).toBe(false);
    expect(cookieMarked(`x${n}=1`, n)).toBe(false);
    expect(cookieMarked(`${n}=`, n)).toBe(false);
    expect(cookieMarked("", n)).toBe(false);
  });

  it("the arm is the phone's same-gesture guard (350 ms — the console keeps its 400)", () => {
    // MUTATION (pd11/arm/console-number): the console's 400 on a phone; red.
    expect(DINER_GUIDE_ARM_MS).toBe(SAME_GESTURE_MS);
  });
});

const CTX: GuideContext = { tableNumber: 7, role: "guest", atCap: false, payVariant: "counter" };
const en = (s: { en: string }) => s.en;

describe("the five pages — every title a shipped key, whole", () => {
  it("five pages, titled by the shipped bilingual keys (never a fragment of another sentence)", () => {
    const pages = guidePages(CTX);
    expect(pages).toHaveLength(GUIDE_PAGE_COUNT);
    expect(pages.map((p) => p.title)).toEqual([
      GUIDE_WORDS.greeting,
      DINER_STAGE_WORD.unsent,
      { en: t("en", "orderWithKitchen"), my: t("my", "orderWithKitchen") },
      { en: t("en", "yourBill"), my: t("my", "yourBill") },
      { en: t("en", "yourOrder"), my: t("my", "yourOrder") },
    ]);
  });

  it("page 1 teaches Invite only while the guest row draws it (Codex round 3 E1)", () => {
    // MUTATION (pd11/invite/cap-ignored): the line at the cap — a full table is taught a control its
    // row replaced with "Table’s full"; red.
    expect(guideInviteLine({ atCap: true, tableNumber: 7 })).toBeNull();
    expect(guidePages({ ...CTX, atCap: true })[0]!.quiet).toBeNull();
    expect(guideInviteLine({ atCap: false, tableNumber: 7 })).toEqual(GUIDE_COPY.invite);
    // MUTATION (pd11/invite/sticker-always): a table with no number has no sticker of its own; red.
    expect(guideInviteLine({ atCap: false, tableNumber: null })).toEqual(
      GUIDE_COPY.inviteNoSticker,
    );
  });

  it("an UNKNOWN cap (null — the Account door sees no table) teaches no Invite (the blind pass on #348)", () => {
    // MUTATION (pd11/invite/unknown-reads-below-cap): null read as "below the cap" — Account teaches
    // "Tap Invite" to a guest whose table may be full; red.
    expect(guideInviteLine({ atCap: null, tableNumber: null })).toBeNull();
    expect(guideInviteLine({ atCap: null, tableNumber: 7 })).toBeNull();
    expect(guidePages({ ...CTX, atCap: null })[0]!.quiet).toBeNull();
  });

  it("page 1 names the guest's REAL table — and only page 1 (the rest are samples)", () => {
    const pages = guidePages(CTX);
    expect(pages[0]!.stageLabel).toBe("Your table’s pass: Table 7");
    expect(guidePages({ ...CTX, tableNumber: null })[0]!.stageLabel).toBe("Your table’s pass");
    for (const p of pages.slice(1)) {
      expect(p.stageLabel.startsWith("Example — ")).toBe(true);
      expect(p.stageLabel).not.toMatch(/\d/);
    }
  });

  it("page 2: the sender is told it is them; everyone else hears a sentence true on a hostless table", () => {
    // MUTATION (pd11/send/sender-ignored): the sender hears "from a phone at the table"; red.
    expect(guideSendLine("host")).toEqual(GUIDE_COPY.sendYou);
    expect(guideSendLine("guest")).toEqual(GUIDE_COPY.sendTable);
    expect(guideSendLine(null)).toEqual(GUIDE_COPY.sendTable);
    // The critic's B4: never "One person … sends … from their phone" — false where nobody's can.
    expect(GUIDE_COPY.sendTable.en).toContain("or by our staff");
  });

  it("page 3 says what the track does — never 'never on a timer' (the Sent grace IS a clock)", () => {
    const p = guidePages(CTX)[2]!;
    expect(p.key).toBe(true);
    expect(p.lines.map(en)).toEqual([GUIDE_COPY.track.en]);
    expect(GUIDE_COPY.track.en).not.toMatch(/timer|reach/i);
  });

  it("page 5 is titled by the Order page's own heading and names where the guide lives — Account, then You", () => {
    expect(guidePages(CTX)[4]!.lines.map(en)).toEqual([
      "Find your order under Order, and this guide under Account, then You.",
    ]);
    // The blind pass on #348: Help & contact is on the You panel, and Account opens on Orders — so
    // the pointer names the panel by its own label.
    expect(accountPanel({})).toBe("orders");
    const you = ACCOUNT_PANELS.find((p) => p.key === "you")!.label;
    expect(GUIDE_COPY.where.en.endsWith(`under Account, then ${you}.`)).toBe(true);
  });
});

describe("page 4 follows the parked phone-pay door (D5; the critic's B1 and B2)", () => {
  it("the variant reads the flag, and the flag is parked today", () => {
    // MUTATION (pd11/pay/variant-inverted): the phone page while parked; red.
    expect(guidePayVariant(false)).toBe("counter");
    expect(guidePayVariant(true)).toBe("phone");
    expect(SURFACES.dineInPhonePay).toBe(false);
  });

  it("PARKED: the counter in the Bill's own words — and EVERY string on the page and in its region equals the expected pre-flip strings", () => {
    const page = guidePages(CTX)[3]!;
    expect(page.picture).toBe("bill-counter");
    expect(page.title).toEqual({ en: t("en", "yourBill"), my: t("my", "yourBill") });
    expect(page.lines).toEqual([
      { en: t("en", "counterKeepOrdering"), my: t("my", "counterKeepOrdering") },
    ]);
    expect(page.quiet).toBeNull();
    expect(page.stageLabel).toBe("Example — the pass your phone shows at the counter");
    expect(guideSpoken(page)).toEqual({
      title: { en: "Your bill", my: t("my", "yourBill") },
      line: "You can keep ordering — you’ll pay for everything on the table at the counter.",
    });
    // And no page of the parked guide names a card, a wallet or a served door.
    const all = guidePages(CTX)
      .flatMap((p) => [p.title.en, ...p.lines.map(en), p.quiet?.en ?? "", p.stageLabel])
      .join(" ");
    expect(all).not.toMatch(/card|Apple Pay|Google Pay|served\./i);
  });

  it("AFTER THE FLIP: D5's own sentence, then the proven wallets only, then the counter last", () => {
    const page = guidePages({ ...CTX, payVariant: "phone" })[3]!;
    expect(page.picture).toBe("bill-phone");
    expect(page.lines.map(en)).toEqual([
      PAY_OPENS_SERVED,
      "Then pay right here on your phone — card or Apple Pay.",
    ]);
    expect(page.quiet).toEqual(GUIDE_COPY.orCounter);
    expect(guideSpoken(page).line).toBe(PAY_OPENS_SERVED);
  });

  it("the wallet sentence is read from the ONE proven list — Google Pay only after a recorded Android payment", () => {
    // MUTATION (pd11/pay/wallets-hardcoded): a sentence that ignores the list; red.
    expect(GUIDE_PROVEN_WALLETS).toEqual(["Apple Pay"]);
    expect(guidePhonePayLine([]).en).toBe("Then pay right here on your phone — card.");
    expect(guidePhonePayLine(["Apple Pay", "Google Pay"]).en).toBe(
      "Then pay right here on your phone — card, Apple Pay or Google Pay.",
    );
    expect(guideTenders(["Apple Pay"])).toBe("card or Apple Pay");
  });

  it("the region speaks each page's heading and FIRST sentence (derived, never a second copy)", () => {
    // MUTATION (pd11/spoken/last-line): the last line instead — after the flip the region would say
    // the wallet sentence where the page leads with the served door; red.
    for (const v of ["counter", "phone"] as const)
      for (const p of guidePages({ ...CTX, payVariant: v }))
        expect(guideSpoken(p)).toEqual({ title: p.title, line: p.lines[0]!.en });
  });
});

describe("the shipped words, verbatim (a re-word moves the guide with its source)", () => {
  it("the dock and the pager are the staff guides' own keys, referenced", () => {
    expect(GUIDE_WORDS.next).toBe(STAFF["help.next"]);
    expect(GUIDE_WORDS.back).toBe(STAFF["help.back"]);
    expect(GUIDE_WORDS.steps).toBe(STAFF["help.a11y.pager"].en);
    expect(GUIDE_WORDS.step(2, 5)).toBe("Step 2 of 5");
    expect(GUIDE_WORDS.close).toEqual({ en: "Close", my: "ပိတ်" });
    expect(GUIDE_WORDS.browseMenu).toEqual({
      en: t("en", "browseMenu"),
      my: t("my", "browseMenu"),
    });
  });

  /** Every JSX text and string literal in a file, comments excluded (a parse, never a scan). */
  const texts = (rel: string): string[] => {
    const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const out: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isJsxText(n)) out.push(n.text.replace(/\s+/g, " ").trim());
      else if (ts.isStringLiteral(n)) out.push(n.text);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    return out.filter(Boolean);
  };

  it("the greeting is ArrivalBeat's, both tongues", () => {
    const beat = texts("apps/qr/components/menu/ArrivalBeat.tsx");
    expect(beat).toContain(GUIDE_WORDS.greeting.my);
    expect(beat.some((s) => s.startsWith(GUIDE_WORDS.greeting.en))).toBe(true);
  });

  it("page 1's sentence opens InviteSheet's own paragraph, verbatim", () => {
    const invite = texts("apps/qr/components/InviteSheet.tsx");
    expect(invite.some((s) => s.startsWith(GUIDE_COPY.shared.en))).toBe(true);
  });

  it("the sample dishes are the catalog's own two names (no invented dish)", () => {
    const catalog = JSON.parse(read("docs/data/menu_catalog.json")) as {
      name_en: string;
      name_my: string;
    }[];
    for (const d of [GUIDE_SAMPLE.mohinga, GUIDE_SAMPLE.coconutRice])
      expect(catalog.some((c) => c.name_en === d.name && c.name_my === d.nameMy)).toBe(true);
  });
});

describe("the pictures' samples read the stage they teach — on the ONE track", () => {
  const stages = (p: "unsent" | "kitchen" | "bill-phone") =>
    guideSampleItems(p).map((i) => passRowStage(i, GUIDE_SAMPLE.nowIso));

  it("page 2: two dishes, both not sent; the moving row is last", () => {
    expect(stages("unsent")).toEqual(["unsent", "unsent"]);
    expect(guideSampleItems("unsent").at(-1)!.name).toBe(GUIDE_SAMPLE.mohinga.name);
  });

  it("page 3: Mohinga served (past Mom's undo), Coconut Rice cooking — and it is the filling row", () => {
    expect(stages("kitchen")).toEqual(["served", "cooking"]);
    expect(guideSampleItems("kitchen")[1]!.id).toBe(GUIDE_FILLING_ID);
    expect(passHead(guideSampleItems("kitchen"), GUIDE_SAMPLE.nowIso).stage).toBe("cooking");
  });

  it("page 4 after the flip: every dish served, so the pass head reads Served", () => {
    expect(stages("bill-phone")).toEqual(["served", "served"]);
    expect(passHead(guideSampleItems("bill-phone"), GUIDE_SAMPLE.nowIso).stage).toBe("served");
  });

  it("no sample carries a price, a person, a note or an option", () => {
    for (const p of ["unsent", "kitchen", "bill-phone"] as const)
      for (const i of guideSampleItems(p)) {
        expect(i.unitPriceCents).toBe(0);
        expect(i.bySeat).toBeUndefined();
        expect(i.notes ?? null).toBeNull();
        expect(i.modifiers).toEqual([]);
        expect(i.qty).toBe(1);
      }
  });
});
