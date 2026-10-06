// verify:slice-exempt — static door table, no branch; its hrefs are pinned against the DoorSheet by DoorSheet.test
import type { OrderMode } from "./menu-href";

/**
 * Phase 3b (D9) — the THREE DOORS, named once (the name-it-ONCE rule applied to the front door, as
 * `brand.ts` applies it to identity and `track-order.ts` to the order shape). The home renders this
 * table as its three `ModeCard`s and the `DoorSheet` renders it as the "Change order type" rows, so
 * the two surfaces cannot disagree about a name, a Burmese line, an href or the analytics `door` tag.
 *
 * `mode` is the ANALYTICS mode that lands on `mode_selected` (K0) — presentation; the menu's internal
 * mode (dinein|pickup|scango, a DB CHECK) is `OrderMode` and `currentDoor` maps between the two. The
 * Dine-in line is v7.2's modecard verbatim ("Grab a table, invite friends, order together" — the
 * shipped "Pick your table…" promised a pre-menu picker Phase 3c-ii retired); the other two stay as
 * they shipped. Burmese: the three door names are v7.2-era copy already on the home — no new MY here.
 *
 * Phase 3c-ii (D27) — the Dine-in door enters the MENU on a bare host-start: its href is the LITERAL
 * `dineInMenuHref({})` builds (`lib/table-pick.ts`), pinned equal by `doors.test.ts` — this module
 * cannot import the builder (table-pick imports `currentDoor` from here). `/dine-in` stays as a route
 * that redirects to the same href; the table is asked inside the first Send.
 */
export type DoorMode = "dinein" | "pickup" | "grocery";

export type Door = {
  /** Analytics mode on `mode_selected` — mirrors the `door` that lands on `session_created` at mint. */
  mode: DoorMode;
  href: string;
  /** The K0 door tag — two doors may share an internal mode, so the IA stays funnel-able. */
  door: "dinein" | "togo" | "grocery";
  emoji: string;
  name: string;
  /** Burmese companion to the English name (bilingual door, lang="my"). */
  my: string;
  description: string;
};

export const DOORS: readonly Door[] = [
  {
    mode: "dinein",
    door: "dinein",
    href: "/menu?mode=dinein&door=dinein", // = dineInMenuHref({}), pinned by doors.test (3c-ii)
    emoji: "🪑",
    name: "Dine-in",
    my: "ဆိုင်တွင်စားရန်",
    description: "Grab a table, invite friends, order together", // v7.2
  },
  {
    mode: "pickup",
    door: "togo",
    href: "/menu?mode=pickup&door=togo",
    emoji: "🥡",
    name: "To-go",
    my: "ပါဆယ်ယူရန်",
    description: "Order ahead for pickup — now or scheduled",
  },
  {
    mode: "grocery",
    door: "grocery",
    href: "/grocery",
    emoji: "🛒",
    name: "Grocery",
    my: "ကုန်စုံဝယ်ရန်",
    description: "Browse the aisles or scan the code on each package as you shop",
  },
];

/** The door each internal mode enters through — `scango` IS the market (menu-href's own rule). */
const DOOR_OF_MODE: Record<OrderMode, DoorMode> = {
  dinein: "dinein",
  pickup: "pickup",
  scango: "grocery",
};

/**
 * The door a diner is standing in, by the menu's internal mode string. An unknown mode falls back
 * to the market — the same fallback `doorFor` (below) makes, so the trigger and the lit row always
 * describe the SAME door. They use two vocabularies for it on purpose: the eyebrow speaks the PLACE
 * ("Scan & go", "To go", "At the table" — the masthead's words since #239) and the row the DOOR's
 * name ("Grocery", "To-go", "Dine-in" — the home's); the row's sr-only "you’re here" is the sentence
 * that joins them. Unifying the two is filed (OPEN-ITEMS, Phase 3b blind pass).
 */
export function currentDoor(mode: string): Door {
  const target = (DOOR_OF_MODE as Record<string, DoorMode | undefined>)[mode] ?? "grocery";
  return DOORS.find((d) => d.mode === target) ?? DOORS[DOORS.length - 1]!;
}

/**
 * The ONE door vocabulary for the MASTHEAD — the eyebrow's word and the greeting's glyph (name-it-ONCE;
 * moved here from ArrivalBeat in Phase 3b so the door table, the eyebrow and the greeting live in one module). The adversarial pass on #239 caught the menu eyebrow speaking its own dialect: bare /menu
 * defaults to scango (page.tsx), whose branch the eyebrow's ternary lacked, so the masthead said
 * "TO-GO" over this card's "SCAN & GO" — two door claims on one screen. Both surfaces read this map
 * now, so a new mode that misses a branch falls back visibly to the same word everywhere instead of
 * silently disagreeing.
 */
const DOOR = {
  dinein: { glyph: "🍽", label: "At the table" },
  pickup: { glyph: "🥡", label: "To go" },
  scango: { glyph: "🛒", label: "Scan & go" },
} as const;

/** The door for a mode string, unknown modes falling back VISIBLY to scan & go — the same word on
 *  every surface beats a per-surface guess. */
export function doorFor(mode: string): { glyph: string; label: string } {
  return (DOOR as Record<string, { glyph: string; label: string }>)[mode] ?? DOOR.scango;
}
