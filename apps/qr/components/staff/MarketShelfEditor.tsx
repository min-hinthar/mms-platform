"use client";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/bounded-write";
import { setGroceryAvailable } from "@/lib/market-availability";
import { browseRows } from "@/lib/menu-browse";
import { useEchoesShown, useStaffLang } from "./StaffLangProvider";
import { Chrome, OutageText } from "./Chrome";
import { al, sx } from "@/lib/staff-labels";
import { localizeCount } from "@/lib/i18n/fill";
import { shelfWho } from "@/lib/market-shelf";

/** One market item as the shelf list renders it — presentation fields only; the price is SHOWN in
 *  `detail` (to tell same-name rows apart), never edited here. */
export type ShelfItem = {
  barcode: string;
  nameEn: string;
  nameMy: string | null;
  /** The aisle in both tongues (`lib/grocery-aisles.ts`), or the raw slug when it has none. */
  aisleEn: string;
  aisleMy: string | null;
  /** Brand · size · price · barcode (`shelfDetail`) — what tells two same-name rows apart. */
  detail: string;
  available: boolean;
};

/** What the view's ONE live region says, and which row it is about (MenuPriceEditor's `Msg` shape). */
type Msg = { id: string } & (
  | { ok: false; kind: "server"; error: string }
  | {
      ok: boolean;
      kind: "item";
      k: "browse.market.err.flipUnknown" | "browse.market.live.out" | "browse.market.live.back";
      x: string;
    }
);

/** The search placeholder — data-shaped examples in both scripts, a component constant for the
 *  reason MenuPriceEditor's is (a MY dictionary value may not carry a bare Latin run). */
const SEARCH_PLACEHOLDER = "Laphet, လက်ဖက်, Mohinga…";

/**
 * M190 (lifecycle residuals) — the market's out-of-stock list, the second list on /staff/menu
 * (`?shelf=market`). The 86's twin, in the 86's own vocabulary (MenuPriceEditor, slice 6):
 *  - ONE tap each way ("Mark sold out" / "Put back"), the menu's own verbs and pill styles — the
 *    person who finds the empty shelf has their hands full, and the flip is cheap to undo;
 *  - the pill is `aria-disabled` while its flip is in flight and the handler refuses re-entry on a
 *    REF (§17), so focus stays on it and a refused tap keeps its name;
 *  - the server's confirmed value is laid over the list until the next list arrives (menu-3), so a
 *    second tap inside the refresh window never posts a stale `expectedAvailable`;
 *  - ONE live region, sr-only for good, and the same words echoed `aria-hidden` in the row (menu-2);
 *  - the lit-gold cap is the sold-out chip's (`.staff-chip[aria-pressed]`), never a parallel one.
 * The authority is `setGroceryAvailable` (server floor re-checked, compare-and-swap, row count read);
 * everything here is affordance.
 */
export function MarketShelfEditor({ items }: { items: ShelfItem[] }) {
  const lang = useStaffLang();
  const echoes = useEchoesShown();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [outOnly, setOutOnly] = useState(false);
  const [flipping, setFlipping] = useState<ReadonlySet<string>>(() => new Set());
  const flippingRef = useRef(new Set<string>());
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirmed, setConfirmed] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  // A confirmed value lives until the NEXT list arrives, whatever it says (menu-3's corrected rule):
  // the action revalidates this path, so a newer list is at least as fresh as the confirmation.
  const [seenItems, setSeenItems] = useState(items);
  if (items !== seenItems) {
    setSeenItems(items);
    if (confirmed.size > 0) setConfirmed(new Map());
  }

  // The rows as the screen KNOWS them, in `browseRows`' shape (the menu list's ONE filter).
  const rows = useMemo(
    () =>
      items.map((i) => {
        const available = confirmed.get(i.barcode) ?? i.available;
        return {
          ...i,
          id: i.barcode,
          available,
          soldOut: !available,
          // The needle finds an aisle by either name, whatever the device's tongue.
          category: i.aisleMy ? `${i.aisleEn} ${i.aisleMy}` : i.aisleEn,
        };
      }),
    [items, confirmed],
  );

  async function toggle(i: (typeof rows)[number]) {
    if (flippingRef.current.has(i.id)) return; // §17 — the second tap of a bounce, refused here
    flippingRef.current.add(i.id);
    setFlipping((f) => new Set(f).add(i.id));
    setMsg(null);
    let r: Awaited<ReturnType<typeof setGroceryAvailable>>;
    try {
      r = await track(
        setGroceryAvailable({
          barcode: i.barcode,
          available: !i.available,
          // The state this row RENDERED with — the server refuses a flip against a stale screen.
          expectedAvailable: i.available,
        }),
      );
      // Recorded before the pill re-enables: never tappable while wearing the old verb.
      if (r.ok) {
        const landed = r.available;
        setConfirmed((prev) => new Map(prev).set(i.id, landed));
      }
    } catch {
      // A rejected action (dead radio, 5xx): the write may or may not have landed — the list says.
      setMsg({
        id: i.id,
        ok: false,
        kind: "item",
        k: "browse.market.err.flipUnknown",
        x: shelfWho(i),
      });
      router.refresh();
      return;
    } finally {
      flippingRef.current.delete(i.id);
      setFlipping((f) => {
        const next = new Set(f);
        next.delete(i.id);
        return next;
      });
    }
    if (!r.ok) {
      setMsg({ id: i.id, ok: false, kind: "server", error: r.error });
      // A concurrency refusal means this screen is stale: refresh, or every retry fails the same way.
      router.refresh();
      return;
    }
    setMsg({
      id: i.id,
      ok: true,
      kind: "item",
      k: r.available ? "browse.market.live.back" : "browse.market.live.out",
      x: shelfWho(i),
    });
    router.refresh();
  }

  const outCount = rows.reduce((n, r) => n + (r.soldOut ? 1 : 0), 0);
  // The chip filters rows that EXIST: with nothing sold out it lets go of its state (slice 6).
  if (outOnly && outCount === 0) setOutOnly(false);
  const filterOut = outOnly && outCount > 0;
  const shown = useMemo(
    () => browseRows(rows, q, filterOut, msg?.id ?? null),
    [rows, q, filterOut, msg],
  );

  function msgNode(m: Msg): ReactNode {
    return m.kind === "server" ? (
      <OutageText lang={lang} error={m.error} />
    ) : (
      <Chrome lang={lang} k={m.k} vars={{ x: m.x }} />
    );
  }

  return (
    <div>
      <label htmlFor="ms-search" style={label}>
        <Chrome lang={lang} k="browse.market.find" echo="stack" />
      </label>
      <div style={searchRow}>
        <input
          id="ms-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
          autoComplete="off"
          style={input}
        />
        {outCount > 0 && (
          <button
            type="button"
            className="staff-chip staff-press"
            aria-pressed={filterOut}
            onClick={() => setOutOnly((v) => !v)}
          >
            <Chrome
              lang={lang}
              k="browse.price.soldOutOnly"
              vars={{ n: localizeCount(outCount, lang) }}
            />
          </button>
        )}
      </div>

      {/* The view's ONE live region: sr-only for good, echoed in the row (menu-2). */}
      <p role="status" style={srOnly}>
        {msg === null ? "" : msgNode(msg)}
      </p>

      <ul role="list" aria-label={sx(lang, "browse.market.a11y.list")} style={list}>
        {shown.map((i) => {
          const inFlight = flipping.has(i.id);
          return (
            <li key={i.id} className="card" style={row}>
              <div style={{ minWidth: 0 }}>
                <p style={name}>
                  {i.nameEn}
                  {i.soldOut && (
                    <span style={soldOutTag}>
                      <Chrome lang={lang} k="browse.price.soldOut" />
                    </span>
                  )}
                </p>
                {i.nameMy && (
                  <p lang="my" style={nameMy}>
                    {i.nameMy}
                  </p>
                )}
                {i.detail && <p style={cat}>{i.detail}</p>}
                <p style={cat}>
                  {lang === "my" && i.aisleMy ? <span lang="my">{i.aisleMy}</span> : i.aisleEn}
                </p>
              </div>
              <button
                type="button"
                className="staff-btn staff-press"
                style={i.soldOut ? restoreBtn : outBtn}
                aria-disabled={inFlight || undefined}
                aria-busy={inFlight || undefined}
                onClick={() => void toggle(i)}
                // One verb per row; the name says WHICH item (rule 3c: two whole al() calls, each
                // naming its verb key as a literal, so the name contains the visible label).
                aria-label={
                  i.soldOut
                    ? al(lang, {
                        kind: "verb",
                        echo: "inline",
                        shown: echoes,
                        verb: "browse.price.verb.putBack",
                        subject: shelfWho(i),
                      }).aria
                    : al(lang, {
                        kind: "verb",
                        echo: "inline",
                        shown: echoes,
                        verb: "browse.price.verb.eightySix",
                        subject: shelfWho(i),
                      }).aria
                }
              >
                {inFlight ? (
                  "…"
                ) : i.soldOut ? (
                  <Chrome lang={lang} k="browse.price.verb.putBack" echo="inline" />
                ) : (
                  <Chrome lang={lang} k="browse.price.verb.eightySix" echo="inline" />
                )}
              </button>
              {msg !== null && msg.id === i.id && (
                <p aria-hidden style={msg.ok ? okLine : errLine}>
                  {msgNode(msg)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && (
        <p style={cat}>
          <Chrome
            lang={lang}
            k={filterOut ? "browse.market.noMatchOut" : "browse.market.noMatch"}
            vars={{ x: q.trim() }}
            echo="stack"
          />
        </p>
      )}
    </div>
  );
}

// The menu list's own geometry and pill styles (MenuPriceEditor), so the two lists read as one screen.
const list: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "var(--s4) 0 0",
  display: "grid",
  gap: "var(--s2)",
};
const row: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--s3)",
  padding: "var(--s3) var(--s4)",
  flexWrap: "wrap",
};
const name: CSSProperties = { margin: 0, fontWeight: "var(--fw-bold)", fontSize: "var(--fs-body)" };
const nameMy: CSSProperties = { margin: 0, color: "var(--t2)", fontSize: "var(--fs-sm)" };
const cat: CSSProperties = { margin: "2px 0 0", color: "var(--t3)", fontSize: "var(--fs-xs)" };
const soldOutTag: CSSProperties = { color: "var(--t3)", fontWeight: "var(--fw-regular)" };
const outBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid color-mix(in oklab, var(--warn) 40%, var(--bd))",
  background: "var(--warnb)",
  color: "var(--warn)",
  fontWeight: "var(--fw-heavy)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const restoreBtn: CSSProperties = {
  ...outBtn,
  border: "1px solid color-mix(in oklab, var(--ok) 40%, var(--bd))",
  background: "var(--okb)",
  color: "var(--ok)",
};
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  marginBottom: "var(--s2)",
};
const searchRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--s2)",
  flexWrap: "wrap",
};
const input: CSSProperties = {
  flex: "1 1 200px",
  minWidth: 0,
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const okLine: CSSProperties = {
  flexBasis: "100%",
  margin: 0,
  color: "var(--ac-strong)",
  fontSize: "var(--fs-sm)",
};
const errLine: CSSProperties = {
  flexBasis: "100%",
  margin: 0,
  color: "var(--warn)",
  fontSize: "var(--fs-sm)",
};
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
