/**
 * P1 — the bilingual ticket line, decided in ONE place (pure; pinned by ticket-names.test.ts).
 *
 * The KDS and the expo render the Burmese name the cook reads first (Mom), with the English the
 * add-time snapshot carries beneath it (Dad, and the K15 native check that may still move the
 * Burmese). Three rules, each falsifiable by a value:
 *
 *  1. **A Burmese name is a catalog fact or nothing.** Blank → null. A `name_my` that IS the English
 *     label (a brand name stored twice) is English, and `lang="my"` must not claim it → null. And a
 *     `name_my` with no Myanmar-script character at all is not Burmese whatever it differs from
 *     (a romanisation, a brand-plus-size string) → null; measured on prod at build time, none of
 *     the 531 live names trips this, so it is a belt for the next import, not a live fix.
 *  2. **Per-slot, never pre-substituted.** `modifiersMy[i]` is the Burmese for `modifiers[i]` or
 *     null — the RENDERER does the fallback, wrapping the English in `lang="en"`, so an English
 *     label is never typeset in Padauk or announced as Burmese (QA-CHECKLIST §A: keep `lang="en"` on
 *     interleaved English). The design panel on this slice rejected two drafts that pre-filled the
 *     array with English for exactly that reason.
 *  3. **A count mismatch is NOT a mapping.** Labels and option ids are written as parallel arrays
 *     from one `chosen` list (`order-lines.ts`), so unequal lengths mean a legacy `[]` row or a
 *     partial write — every slot null, an honest unknown, never a prefix pairing. ⚠️ The pairing
 *     is POSITIONAL and this module cannot detect a same-length mismatch: it holds because every
 *     writer threads `optionIds` beside `opts` from that one list, and no path today updates one
 *     column without the other. The day one does, a wrong (allergy-adjacent) Burmese option sits
 *     under a correct English label with no signal — so that writer owes a snapshot, not a fix here.
 *
 * `burmeseAddsInfo` is the dedupe: when every slot is null the board renders the pre-P1 line
 * byte-identically, so an all-English ticket looks exactly as it did.
 */
import { storedOptionIds } from "./reorder-options";

/** The menu_items uuid shape — exported so `kitchen.ts` reads THIS one instead of keeping its own copy
 *  (a third copy was a design-panel defect on this slice; `cart.ts` still carries a looser one). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A uuid-shaped id. The stored `modifier_option_ids` and the soft `menu_item_id` ref both admit
 *  non-uuid strings (a grocery barcode rides `menu_item_id`), and ONE malformed value in a uuid
 *  `.in()` list fails the whole read — partition before the query, never after. */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** The stored option ids that can actually be looked up: uuid-shaped, deduped, in stored order. */
export function uuidOptionIds(raw: unknown): string[] {
  return [...new Set(storedOptionIds(raw).filter(isUuid))];
}

/** One Myanmar-block codepoint (Myanmar · Extended-A · Extended-B). A name with none is not Burmese. */
const MYANMAR_SCRIPT = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/;

/** Rule 1 — the Burmese the board may show for `en`, or null. */
export function catalogNameMy(raw: string | null | undefined, en: string): string | null {
  if (typeof raw !== "string") return null;
  const my = raw.trim();
  if (my === "") return null;
  if (my === en.trim()) return null;
  if (!MYANMAR_SCRIPT.test(my)) return null;
  return my;
}

/** Rules 2 + 3 — per-slot Burmese option labels, PARALLEL to `labels`. */
export function pairModifiersMy(
  rawIds: unknown,
  labels: string[],
  nameMyById: ReadonlyMap<string, string | null | undefined>,
): (string | null)[] {
  const ids = storedOptionIds(rawIds);
  if (ids.length !== labels.length) return labels.map(() => null);
  return ids.map((id, i) => catalogNameMy(nameMyById.get(id), labels[i] ?? ""));
}

/** Does the Burmese half say anything the English line does not? */
export function burmeseAddsInfo(
  nameMy: string | null,
  modifiersMy: readonly (string | null)[],
): boolean {
  return nameMy !== null || modifiersMy.some((m) => m !== null);
}

/** What the All-Day rail reduces over — the line fields it reads, nothing more. */
export type AllDayLine = {
  name: string;
  nameMy: string | null;
  qty: number;
  modifiers: string[];
  modifiersMy: readonly (string | null)[];
};

/** One All-Day row: keyed by the ENGLISH label (counts never move); the Burmese rides beside it. */
export type AllDayRow = {
  label: string;
  qty: number;
  name: string;
  nameMy: string | null;
  modifiers: string[];
  modifiersMy: (string | null)[];
};

/** The W3d rail key, byte for byte: the English name, then the English modifiers comma-joined. */
export function allDayKey(l: Pick<AllDayLine, "name" | "modifiers">): string {
  return l.modifiers.length ? `${l.name} · ${l.modifiers.join(", ")}` : l.name;
}

/**
 * The All-Day rail reduce (SPEC-KDS §2): item+modifier groups, largest first.
 *
 *  - **The key is the English label.** Burmese never enters it, so a legacy row beside a fresh
 *    one (one with `nameMy`, one without) is ONE count, not two — a split count under-reports the
 *    wok's actual obligation, which is the number the rail exists to state.
 *  - **"The most Burmese we know for this key."** Within one poll every line of one `menu_item_id`
 *    reads the same catalog map, so two lines under one English key differ in `nameMy` only when two
 *    CATALOG ROWS share an English snapshot name (a re-added dish, a duplicate row) — which the
 *    English key already conflates. The first non-null `nameMy` wins and a later different value
 *    never overwrites it (one row, one Burmese, not a flip between two); each modifier slot fills
 *    from the first line that carries Burmese for it, which IS reachable in one poll (a legacy `[]`
 *    row beside a fresh one).
 */
export function allDayRows(lines: Iterable<AllDayLine>): AllDayRow[] {
  const rows = new Map<string, AllDayRow>();
  for (const l of lines) {
    const key = allDayKey(l);
    const cur = rows.get(key);
    if (!cur) {
      rows.set(key, {
        label: key,
        qty: l.qty,
        name: l.name,
        nameMy: l.nameMy,
        modifiers: l.modifiers,
        modifiersMy: [...l.modifiersMy],
      });
      continue;
    }
    cur.qty += l.qty;
    if (cur.nameMy === null && l.nameMy !== null) cur.nameMy = l.nameMy;
    l.modifiersMy.forEach((m, i) => {
      if (m !== null && cur.modifiersMy[i] == null) cur.modifiersMy[i] = m;
    });
  }
  return [...rows.values()].sort((a, b) => b.qty - a.qty);
}
