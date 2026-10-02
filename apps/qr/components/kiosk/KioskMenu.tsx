"use client";
import { useSheetSubject } from "@mms/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { addItem } from "@/lib/cart";
import { boundWrite } from "@/lib/bounded-write";
import { t, type KioskLang } from "@/lib/kiosk/strings";
import { StaffModSheet } from "@/components/staff/StaffModSheet";
import { useResaid } from "@/components/staff/useResaid";
import { PhotoPlaceholder } from "@/components/menu/PhotoPlaceholder";
import type { KioskItem } from "./types";

/**
 * Dishes whose add went past the bound unanswered — `${cartId}:${itemId}` — a re-add would put a
 * second one on when both land. MODULE state, per tab (critic F8), like the stall ledger and like
 * Next's action queue it stands for: "View order" → Back remounts this screen, and a per-mount set
 * forgot the waiting dish while its add was still out. Keyed by cart, so the next guest's order is
 * never refused by this one's wait; each entry leaves when its add answers or throws. Written only
 * from a tap's handler, so a server render never touches it.
 */
const waiting = new Set<string>();

/**
 * The kiosk food browser (W6b): category chips + a 3-col big-touch grid over the same catalog the
 * diner menu reads. Adds ride the DINER `addItem` action (the kiosk uid is a member of its minted
 * session — server-authoritative pricing, cardinality enforced); required-choice items open the
 * staff modifier sheet (pure presentation — its onAdd is ours).
 *
 * Phase 2h (P2cz) — an UNATTENDED screen must never trap a guest. The add is called outside any
 * transition and awaited BOUNDED (`boundWrite`), and the busy that locks the options sheet is state
 * cleared in a `finally` — never a transition's `pending`, which held the sheet until the add
 * answered, and on a stuck connection that is never (Next queues actions one per tab). At
 * STAFF_HANG_MS the sheet frees and says `addWaiting` ("Still adding that — please don't add it
 * again. When it's in, the number on “View order” goes up…"); the LATE answer is applied when it
 * comes — a late ok calls `onAdded`, which is what moves that number, so the sentence's promise is
 * kept. A re-add of a dish still waiting is refused with the same sentence. A thrown add may have
 * gone on: `addUnknown` sends the guest to the counter before a re-add.
 */
export function KioskMenu({
  lang,
  cartId,
  items,
  categories,
  count,
  onAdded,
  onReview,
}: {
  lang: KioskLang;
  cartId: string;
  items: KioskItem[];
  categories: string[];
  /** The order tally lives in the FLOW (review finding): a per-mount count of 0 after "Back" from
   *  review disabled "View order" over a non-empty cart — a double-add / walk-away dead end. */
  count: number;
  onAdded: (qty: number) => void;
  onReview: () => void;
}) {
  const [cat, setCat] = useState<string | null>(categories[0] ?? null);
  const [sheetItem, setSheetItem] = useState<KioskItem | null>(null);
  const mod = useSheetSubject(sheetItem);
  // Phase 2h review c (C5) — each line is held as a fresh `{ text }` per SAY, so `useResaid` moves on
  // a re-said, equal sentence (a re-tap of a waiting dish) and the keyed content is announced again.
  const [sheetError, setSheetError] = useState<{ text: string } | null>(null);
  const [status, setStatus] = useState<{ text: string } | null>(null);
  const sheetSaid = useResaid(sheetError);
  const statusSaid = useResaid(status);
  // Phase 2h (9a) — the sheet's busy: state set at the tap, cleared in the finally around the bounded
  // add (the M82 guard parses for it). The ref is the tap-time guard (two taps in one frame).
  const [adding, setAdding] = useState(false);
  const addFlight = useRef(false);
  // The dish whose sheet is showing NOW, for words that land late (a closure would read the tap's).
  const sheetNow = useRef<KioskItem | null>(null);
  useEffect(() => {
    sheetNow.current = sheetItem;
  }, [sheetItem]);

  const shown = useMemo(() => items.filter((i) => (cat ? i.category === cat : true)), [items, cat]);

  /** Into ITS sheet while that sheet is open (the page region is behind the scrim), else the page. */
  function say(item: KioskItem, msg: string) {
    if (sheetNow.current?.id === item.id) setSheetError({ text: msg });
    else setStatus({ text: msg });
  }

  /** The add went on — on time, or LATE (9e): the count moves (`onAdded` is the flow's, so it lands
   *  even after this screen remounted), and its sheet, if still open, closes. */
  function landed(item: KioskItem, qty: number) {
    onAdded(qty);
    if (sheetNow.current?.id === item.id) {
      setSheetItem(null);
      setSheetError(null);
    }
    setStatus({ text: `${t(lang, "add")} · ${qty} × ${item.nameEn}` });
  }

  async function add(
    item: KioskItem,
    choice: { modifierIds: string[]; qty: number; notes?: string },
  ) {
    if (addFlight.current) return;
    const waitKey = `${cartId}:${item.id}`;
    if (waiting.has(waitKey)) {
      // Its last add is still out: a second tap would be a second plate when both land.
      say(item, t(lang, "addWaiting"));
      return;
    }
    addFlight.current = true;
    setAdding(true);
    setSheetError(null);
    try {
      // 9b — the RAW action, awaited bounded, outside any transition.
      const out = await boundWrite(
        addItem(cartId, item.id, choice.modifierIds, choice.notes, choice.qty),
      );
      if (out.kind === "answer") {
        landed(item, choice.qty);
        return;
      }
      if (out.kind === "threw") {
        // A refusal and a lost response both arrive as a throw here; either way it may have gone
        // on (the response lost after the insert), so the counter is asked before a re-add.
        say(item, t(lang, "addUnknown"));
        return;
      }
      waiting.add(waitKey);
      say(item, t(lang, "addWaiting"));
      void out.late.then((late) => {
        waiting.delete(waitKey);
        // ⚠️ A late ok MUST reach `onAdded`: `addWaiting` promises the number on “View order” goes
        // up when the add is in, and only the count can keep that promise.
        if (late.kind === "answer") landed(item, choice.qty);
        else say(item, t(lang, "addUnknown"));
      });
    } finally {
      addFlight.current = false;
      setAdding(false); // frees AT THE BOUND on every path — the M82 guard parses for it
    }
  }

  return (
    <div className="kiosk-screen">
      <div
        style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}
        role="group"
        aria-label={t(lang, "categories")}
      >
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={cat === c ? "kiosk-cta" : "kiosk-ghost"}
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* The screen's ONE polite live region — add confirmations + refusals. */}
      <p role="status" className="kiosk-touch-hint" style={{ minHeight: 28, margin: 0 }}>
        {status === null ? "" : <span key={statusSaid}>{status.text}</span>}
      </p>

      <ul
        role="list"
        aria-label={t(lang, "menu")}
        className="kiosk-door-grid"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {shown.map((i) => (
          <li key={i.id}>
            {/* Critic F7 — refused by the ATTRIBUTE and the handler, never a native `disabled`: the
                tile the guest just tapped goes busy while focused, and a disabled control drops
                focus to <body> for as long as the add is out. The dim, the stilled press and the
                sold-out shade have ONE source, the stylesheet (`.kiosk-door[aria-disabled="true"]`
                and `.kiosk-door[data-sold-out]` in globals.css) — never a second, inline copy. */}
            <button
              type="button"
              className="kiosk-door"
              style={{ width: "100%" }}
              data-sold-out={i.soldOut || undefined}
              aria-disabled={i.soldOut || adding || undefined}
              onClick={() => {
                if (i.soldOut || adding) return;
                if (i.groups.length > 0) setSheetItem(i);
                else void add(i, { modifierIds: [], qty: 1 });
              }}
            >
              {/* W16e review — the slot ALWAYS renders (the rule the diner rails follow): gating it
                  away made the 3 photo-less dishes short ragged cards beside full ones on the
                  attract grid. A null src shows the designed placeholder, not an empty tile. */}
              <span
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "var(--r-card)",
                  overflow: "hidden",
                  background: "var(--grad)",
                  position: "relative",
                  display: "block",
                }}
              >
                {i.imageUrl ? (
                  <Image
                    src={i.imageUrl}
                    alt=""
                    width={96}
                    height={96}
                    sizes="96px"
                    style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  />
                ) : (
                  <PhotoPlaceholder category={i.category} />
                )}
              </span>
              <span className="kiosk-door-label">{i.nameEn}</span>
              {i.nameMy && (
                <span className="kiosk-door-hint" lang="my">
                  {i.nameMy}
                </span>
              )}
              <span
                className="kiosk-door-hint"
                style={{ fontWeight: "var(--fw-heavy)", color: "var(--tx)" }}
              >
                ${(i.priceCents / 100).toFixed(2)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          position: "sticky",
          bottom: "var(--s4)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button type="button" className="kiosk-cta" disabled={count === 0} onClick={onReview}>
          {t(lang, "viewOrder")}
          {count > 0 ? ` · ${count}` : ""}
        </button>
      </div>

      {/* M76 — the item is HELD through the exit (`useSheetSubject`); `key` still makes every
          open a fresh sheet (selection, qty and notes reset by remount). */}
      {mod.held && (
        <StaffModSheet
          key={mod.key}
          open={mod.open}
          onOpenChange={(open) => {
            if (!open) {
              // C5 — an add of THIS dish still out past the bound: its line moves to the page as the
              // sheet goes (the late answer will speak there too), never dropped under an older one.
              const held = sheetNow.current;
              if (held && waiting.has(`${cartId}:${held.id}`))
                setStatus({ text: t(lang, "addWaiting") });
              setSheetItem(null);
              setSheetError(null);
            }
          }}
          itemName={mod.held.nameEn}
          basePriceCents={mod.held.priceCents}
          groups={mod.held.groups}
          busy={adding}
          error={sheetError?.text ?? null}
          errorSaid={sheetSaid}
          onAdd={(choice) => void add(mod.held!, choice)}
        />
      )}
    </div>
  );
}
