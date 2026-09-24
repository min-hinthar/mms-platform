"use client";
import { useSheetSubject } from "@mms/ui";
import { useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { staffAddItem } from "@/lib/staff-cart";
import {
  addAttemptOutcome,
  heldAfter,
  keyForAttempt,
  type AddAttemptOutcome,
  type HeldAddKey,
} from "@/lib/staff-add-key";
import { setCartCustomerName } from "@/lib/register";
import { ts } from "@/lib/i18n/staff";
import { al, sx } from "@/lib/staff-labels";
import { StaffAddButton } from "./StaffAddButton";
import { StaffModSheet, type StaffSheetFailure } from "./StaffModSheet";
import { Chrome, OutageText } from "./Chrome";
import { useStaffLang } from "./StaffLangProvider";
import type { ModGroup } from "@/lib/menu/modifiers";

export type StaffMenuItem = {
  id: string;
  nameEn: string;
  nameMy: string | null;
  priceCents: number;
  imageUrl: string | null;
  soldOut: boolean;
  category: string;
  groups: ModGroup[];
};

/**
 * P2 — what the ONE live region can hold, tagged by ORIGIN rather than flattened to a string.
 *
 * A sentence the SERVER wrote goes through `<OutageText>`, which swaps the single write-outage twin
 * and passes every other sentence through in English — better shown than guessed at. Everything
 * else here is this console's own copy, so it is a dictionary key rendered through `<Chrome>`:
 * routed through `OutageText` instead, an authored English literal would pass through untranslated
 * forever while looking converted.
 *
 * That split is also what keeps the region correctly MARKED. A `lang={lang}` on the `<p>` itself
 * would claim an English server sentence is Burmese; `Chrome` and `OutageText` mark their own
 * output, so the mark lands on exactly the runs that are Burmese.
 */
type BrowserNotice =
  | { kind: "added"; qty: number; name: string }
  | { kind: "nameSet"; name: string }
  | { kind: "nameCleared" }
  | { kind: "nameFailed" }
  | { kind: "server"; message: string };

/**
 * The staff menu browser (W6a — the register's order screen, shared with table service). Search +
 * category chips over the catalog; an item with modifier groups opens the staff modifier sheet
 * (cardinality enforced server-side — K17), a plain item keeps the one-tap add. Counter orders get a
 * name-capture strip (the expo/KDS call-out for a cash order).
 */
export function StaffMenuBrowser({
  sessionId,
  items,
  categories,
  counterOrder,
  initialName,
}: {
  sessionId: string;
  items: StaffMenuItem[];
  categories: string[];
  counterOrder: boolean;
  initialName: string | null;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<StaffMenuItem | null>(null);
  const mod = useSheetSubject(sheetItem);
  const [notice, setNotice] = useState<BrowserNotice | null>(null);
  const [sheetError, setSheetError] = useState<StaffSheetFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName ?? "");
  const [nameSaved, setNameSaved] = useState<boolean>(initialName != null && initialName !== "");
  const [namePending, startNameTransition] = useTransition();
  // Phase 2a (Codex round 1, P1) — the add key held for a retry after an UNKNOWN outcome, bound to
  // the intent it was minted for (`lib/staff-add-key.ts`). One sheet at a time, so one slot.
  const heldKey = useRef<HeldAddKey>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (cat && i.category !== cat) return false;
      if (!needle) return true;
      return (
        i.nameEn.toLowerCase().includes(needle) || (i.nameMy ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, q, cat]);

  function addWithChoice(
    item: StaffMenuItem,
    choice: { modifierIds: string[]; qty: number; notes?: string },
  ) {
    setSheetError(null);
    // The INTENT is the dish + its choices + qty + note: a retry of exactly that resends the held key
    // (a no-op if the first landed); a changed choice is a new add and must not be swallowed as a
    // duplicate of the old one.
    const intent = JSON.stringify([
      item.id,
      [...choice.modifierIds].sort(),
      choice.qty,
      choice.notes ?? "",
    ]);
    const addKey = keyForAttempt(heldKey.current, intent, () => crypto.randomUUID());
    startTransition(async () => {
      let outcome: AddAttemptOutcome;
      try {
        const r = await staffAddItem({ sessionId, menuItemId: item.id, ...choice, addKey });
        outcome = addAttemptOutcome(r);
        if (r.ok) {
          setSheetItem(null);
          setNotice({ kind: "added", qty: choice.qty, name: item.nameEn });
        } else {
          // Into the SHEET's live region — the page-level one is behind the modal scrim. An unknown
          // outcome may have LANDED: say "couldn't confirm", never the server's "couldn't add".
          setSheetError(
            outcome === "unknown" ? { kind: "unconfirmed" } : { kind: "server", message: r.error },
          );
        }
      } catch {
        outcome = "unknown";
        setSheetError({ kind: "unconfirmed" });
      }
      heldKey.current = heldAfter(intent, addKey, outcome);
      // The order's truth (and the "Review · N not sent" bridge) after anything that may have landed.
      if (outcome !== "definite") router.refresh();
    });
  }

  function saveName() {
    if (namePending || nameSaved) return; // §17 — the button says so with `aria-disabled`
    startNameTransition(async () => {
      try {
        const r = await setCartCustomerName({ sessionId, name: name.trim() });
        if (r.ok) {
          setNameSaved(true);
          const trimmed = name.trim();
          setNotice(trimmed ? { kind: "nameSet", name: trimmed } : { kind: "nameCleared" });
        } else {
          setNotice({ kind: "server", message: r.error });
        }
      } catch {
        setNotice({ kind: "nameFailed" });
      }
    });
  }

  return (
    <div>
      {counterOrder && (
        <form
          style={nameStrip}
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <label style={nameLabel} htmlFor="reg-order-name">
            <Chrome lang={lang} k="browse.name.label" echo="stack" />
          </label>
          <div style={nameRow}>
            <input
              id="reg-order-name"
              style={nameInput}
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder={ts(lang, "browse.name.placeholder")}
              onChange={(e) => {
                setName(e.target.value);
                setNameSaved(false);
              }}
            />
            {/* No echo on these three: the button shares a flex row with a `flex: 1` input, and a
                second script beside the label squeezes the field it sits next to. */}
            <button
              type="submit"
              style={nameBtn}
              aria-disabled={namePending || nameSaved || undefined}
              aria-busy={namePending || undefined}
            >
              {namePending ? (
                <Chrome lang={lang} k="browse.name.saving" />
              ) : nameSaved ? (
                <Chrome lang={lang} k="browse.name.saved" />
              ) : (
                <Chrome lang={lang} k="browse.name.save" />
              )}
            </button>
          </div>
        </form>
      )}

      <div style={toolRow}>
        <input
          type="search"
          style={searchInput}
          value={q}
          placeholder={ts(lang, "browse.search.placeholder")}
          aria-label={sx(lang, "browse.a11y.search")}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div style={chipRow} role="group" aria-label={sx(lang, "browse.a11y.categories")}>
        {/* manager-7 — `.staff-chip`: the chosen category wears the console's ONE lit cap. */}
        <button
          type="button"
          className="staff-chip"
          aria-pressed={cat === null}
          onClick={() => setCat(null)}
        >
          {/* No echo on a 44px chip — two scripts cannot legibly stack in one. */}
          <Chrome lang={lang} k="browse.cat.all" />
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className="staff-chip"
            aria-pressed={cat === c}
            onClick={() => setCat(cat === c ? null : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* The browser's ONE polite live region — add confirmations, name saves, and refusals. No
          `lang` on the region itself: a server sentence passing through <OutageText> is English,
          and the two renderers mark their own output. */}
      <p role="status" style={notice ? statusText : srOnly}>
        {notice === null ? (
          ""
        ) : notice.kind === "server" ? (
          <OutageText lang={lang} error={notice.message} />
        ) : notice.kind === "added" ? (
          <Chrome lang={lang} k="browse.added" vars={{ n: notice.qty, x: notice.name }} />
        ) : notice.kind === "nameSet" ? (
          <Chrome lang={lang} k="browse.name.set" vars={{ x: notice.name }} />
        ) : notice.kind === "nameCleared" ? (
          <Chrome lang={lang} k="browse.name.cleared" />
        ) : (
          <Chrome lang={lang} k="browse.name.failed" />
        )}
      </p>

      <ul role="list" aria-label={sx(lang, "browse.a11y.items")} style={list}>
        {shown.map((i) => (
          <li
            key={i.id}
            className="card card-textured"
            style={{ ...rowCard, opacity: i.soldOut ? 0.55 : 1 }}
          >
            <div style={thumb}>
              {i.imageUrl && (
                <Image src={i.imageUrl} alt="" width={64} height={64} sizes="64px" style={img} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "var(--fw-semibold)" }}>
                {i.nameEn}
                {i.soldOut && (
                  <span style={{ color: "var(--t3)", fontWeight: "var(--fw-regular)" }}>
                    {" · "}
                    <Chrome lang={lang} k="browse.soldOut" />
                  </span>
                )}
              </div>
              {i.nameMy && (
                <div
                  style={{
                    fontFamily: "var(--font-my)",
                    fontSize: "var(--fs-sm)",
                    color: "var(--t2)",
                  }}
                  lang="my"
                >
                  {i.nameMy}
                </div>
              )}
              <div style={{ fontWeight: "var(--fw-heavy)", marginTop: 4 }}>
                ${(i.priceCents / 100).toFixed(2)}
              </div>
            </div>
            {i.groups.length > 0 ? (
              <button
                type="button"
                className="staff-btn"
                style={chooseBtn}
                aria-disabled={i.soldOut || undefined}
                // §17 — a sold-out dish's button SAYS sold out (the add button's own word), in the
                // name and on the face, and dims; it used to keep "Choose…" and refuse in silence.
                // Two whole al() calls: rule 3c needs each verb key as a literal (StaffAddButton).
                aria-label={
                  i.soldOut
                    ? al(lang, { kind: "verb", verb: "browse.add.verb.soldOut", subject: i.nameEn })
                        .aria
                    : al(lang, { kind: "verb", verb: "browse.verb.choose", subject: i.nameEn }).aria
                }
                onClick={() => {
                  if (i.soldOut) return;
                  setSheetItem(i);
                }}
              >
                {/* Same key the name leads with (rule 3c). No echo: this is a compact pill in a
                    three-up row, and a second script beside it squeezes the dish name on a phone. */}
                {i.soldOut ? (
                  <Chrome lang={lang} k="browse.add.verb.soldOut" />
                ) : (
                  <Chrome lang={lang} k="browse.verb.choose" />
                )}
              </button>
            ) : (
              <StaffAddButton
                sessionId={sessionId}
                menuItemId={i.id}
                name={i.nameEn}
                soldOut={i.soldOut}
              />
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p style={{ padding: "var(--s5) 0", color: "var(--t2)" }}>
          <Chrome lang={lang} k="browse.empty" echo="stack" />
        </p>
      )}

      {/* M76 — the item is HELD through the exit (`useSheetSubject`); `key` still makes every
          open a fresh sheet (selection, qty and notes reset by remount). */}
      {mod.held && (
        <StaffModSheet
          key={mod.key}
          open={mod.open}
          onOpenChange={(open) => {
            if (!open) {
              setSheetItem(null);
              setSheetError(null);
            }
          }}
          itemName={mod.held.nameEn}
          basePriceCents={mod.held.priceCents}
          groups={mod.held.groups}
          pending={pending}
          error={sheetError}
          lang={lang}
          onAdd={(choice) => addWithChoice(mod.held!, choice)}
        />
      )}
    </div>
  );
}

const nameStrip: CSSProperties = { margin: "0 0 var(--s4)", display: "grid", gap: "var(--s1)" };
const nameLabel: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  color: "var(--tx)",
};
const nameRow: CSSProperties = { display: "flex", gap: "var(--s2)" };
const nameInput: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  flex: 1,
  minWidth: 0,
};
const nameBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s4)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const toolRow: CSSProperties = { margin: "0 0 var(--s3)" };
const searchInput: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const chipRow: CSSProperties = {
  display: "flex",
  gap: "var(--s2)",
  flexWrap: "wrap",
  margin: "0 0 var(--s3)",
};
const statusText: CSSProperties = {
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
  margin: "0 0 var(--s3)",
};
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
const list: CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 };
const rowCard: CSSProperties = { display: "flex", gap: 12, padding: 10, alignItems: "center" };
const thumb: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 12,
  overflow: "hidden",
  flex: "none",
  background: "var(--grad)",
  position: "relative",
};
const img: CSSProperties = { objectFit: "cover", width: "100%", height: "100%" };
const chooseBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--ac)",
  background: "var(--sf)",
  color: "var(--ac-strong)",
  fontWeight: "var(--fw-bold)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
  flex: "none",
};
