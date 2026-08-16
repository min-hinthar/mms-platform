"use client";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { staffAddItem } from "@/lib/staff-cart";
import { setCartCustomerName } from "@/lib/register";
import { StaffAddButton } from "./StaffAddButton";
import { StaffModSheet } from "./StaffModSheet";
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
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<StaffMenuItem | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName ?? "");
  const [nameSaved, setNameSaved] = useState<boolean>(initialName != null && initialName !== "");
  const [namePending, startNameTransition] = useTransition();

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
    startTransition(async () => {
      try {
        const r = await staffAddItem({ sessionId, menuItemId: item.id, ...choice });
        if (r.ok) {
          setSheetItem(null);
          setStatus(`Added ${choice.qty} × ${item.nameEn}.`);
          router.refresh();
        } else {
          // Into the SHEET's live region — the page-level one is behind the modal scrim.
          setSheetError(r.error);
        }
      } catch {
        setSheetError("Couldn’t add that — try again.");
      }
    });
  }

  function saveName() {
    startNameTransition(async () => {
      try {
        const r = await setCartCustomerName({ sessionId, name: name.trim() });
        if (r.ok) {
          setNameSaved(true);
          setStatus(name.trim() ? `Order name: ${name.trim()}.` : "Order name cleared.");
        } else {
          setStatus(r.error);
        }
      } catch {
        setStatus("Couldn’t save the name — try again.");
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
            Name for the order
          </label>
          <div style={nameRow}>
            <input
              id="reg-order-name"
              style={nameInput}
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder="First name — it’s the pickup call-out"
              onChange={(e) => {
                setName(e.target.value);
                setNameSaved(false);
              }}
            />
            <button type="submit" style={nameBtn} disabled={namePending || nameSaved}>
              {namePending ? "Saving…" : nameSaved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </form>
      )}

      <div style={toolRow}>
        <input
          type="search"
          style={searchInput}
          value={q}
          placeholder="Search the menu…"
          aria-label="Search the menu"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div style={chipRow} role="group" aria-label="Filter by category">
        <button
          type="button"
          style={cat === null ? chipOn : chip}
          aria-pressed={cat === null}
          onClick={() => setCat(null)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            style={cat === c ? chipOn : chip}
            aria-pressed={cat === c}
            onClick={() => setCat(cat === c ? null : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* The browser's ONE polite live region — add confirmations, name saves, and refusals. */}
      <p role="status" style={status ? statusText : srOnly}>
        {status ?? ""}
      </p>

      <ul role="list" aria-label="Menu items" style={list}>
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
              <div style={{ fontWeight: 600 }}>
                {i.nameEn}
                {i.soldOut && (
                  <span style={{ color: "var(--t3)", fontWeight: 400 }}> · Sold out</span>
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
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                ${(i.priceCents / 100).toFixed(2)}
              </div>
            </div>
            {i.groups.length > 0 ? (
              <button
                type="button"
                style={chooseBtn}
                disabled={i.soldOut}
                aria-label={`Choose options for ${i.nameEn}`}
                onClick={() => setSheetItem(i)}
              >
                Choose…
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
          Nothing matches — clear the search or pick another category.
        </p>
      )}

      {sheetItem && (
        <StaffModSheet
          key={sheetItem.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSheetItem(null);
              setSheetError(null);
            }
          }}
          itemName={sheetItem.nameEn}
          basePriceCents={sheetItem.priceCents}
          groups={sheetItem.groups}
          pending={pending}
          error={sheetError}
          onAdd={(choice) => addWithChoice(sheetItem, choice)}
        />
      )}
    </div>
  );
}

const nameStrip: CSSProperties = { margin: "0 0 var(--s4)", display: "grid", gap: "var(--s1)" };
const nameLabel: CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--tx)" };
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
  fontWeight: 700,
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
const chip: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const chipOn: CSSProperties = {
  ...chip,
  background: "var(--ac)",
  borderColor: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 700,
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
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
  flex: "none",
};
