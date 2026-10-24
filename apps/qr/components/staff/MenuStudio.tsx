"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@mms/ui";
import { MenuPriceEditor, type PricedItem } from "./MenuPriceEditor";
import { DishSheet, type StudioCategory, type StudioDish } from "./DishSheet";
import { CategoriesSheet } from "./CategoriesSheet";
import type { StaffMsg } from "./StaffMsg";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";

/**
 * Menu studio (owner, 2026-10-24: "elevate full features (iOS photo upload, add new menu items
 * categories etc, updates to names prices categories etc,) to menu-editor and with world-class UI
 * UX") — the manager's menu: the shipped price-and-86 list (`MenuPriceEditor`, unchanged in what it
 * decides), each row now led by its photo as the door to the dish's sheet, plus a toolbar to add a
 * dish and to arrange the categories, and the dishes that are hidden (off every menu) listed apart so
 * they can be found and shown again.
 *
 * A server gets the list alone (`studio` absent): the 86 is theirs, the menu's shape is not.
 *
 * ONE live region for the view (QA §A): the price list's. A sheet's landed write, said after the sheet
 * closes, is handed to it (`announce`) rather than spoken from a second region.
 */
export function MenuStudio({
  items,
  canEditPrice,
  nowIso,
  studio,
}: {
  items: PricedItem[];
  canEditPrice: boolean;
  nowIso: string;
  /** Manager-and-up only: every dish (hidden ones too) and the categories. */
  studio?: { dishes: StudioDish[]; categories: StudioCategory[] };
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const [sheet, setSheet] = useState<
    { kind: "new" } | { kind: "dish"; id: string } | { kind: "categories" } | null
  >(null);
  const [said, setSaid] = useState<StaffMsg | null>(null);

  if (!studio) return <MenuPriceEditor items={items} canEditPrice={canEditPrice} nowIso={nowIso} />;

  const byId = new Map(studio.dishes.map((d) => [d.id, d]));
  const hidden = studio.dishes.filter((d) => !d.isActive);
  const open = sheet?.kind === "dish" ? byId.get(sheet.id) : undefined;
  const landed = (m: StaffMsg) => {
    setSaid(m);
    router.refresh();
  };

  return (
    <>
      <div className="studio-bar">
        <button
          type="button"
          className="staff-btn staff-press studio-bar-primary"
          aria-haspopup="dialog"
          onClick={() => setSheet({ kind: "new" })}
        >
          <span aria-hidden>+ </span>
          <Chrome lang={lang} k="studio.add" echo="inline" />
        </button>
        <button
          type="button"
          className="staff-btn staff-press studio-bar-secondary"
          aria-haspopup="dialog"
          onClick={() => setSheet({ kind: "categories" })}
        >
          <Icon name="grid" size={18} aria-hidden />
          <Chrome lang={lang} k="studio.categories" echo="inline" />
        </button>
      </div>

      <MenuPriceEditor
        items={items}
        canEditPrice={canEditPrice}
        nowIso={nowIso}
        onDetails={(id) => setSheet({ kind: "dish", id })}
        photoOf={(id) => byId.get(id)?.imageUrl ?? null}
        announce={said}
      />

      {hidden.length > 0 && (
        <section className="studio-hidden" aria-labelledby="studio-hidden-h">
          <h2 id="studio-hidden-h" className="studio-hidden-h">
            <Chrome lang={lang} k="studio.hidden" vars={{ n: hidden.length }} echo="inline" />
          </h2>
          <p style={lead}>
            <Chrome lang={lang} k="studio.hidden.lead" echo="stack" />
          </p>
          <ul role="list" style={list} aria-labelledby="studio-hidden-h">
            {hidden.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="card staff-press studio-hidden-row"
                  aria-haspopup="dialog"
                  onClick={() => setSheet({ kind: "dish", id: d.id })}
                >
                  <span lang="en">{d.nameEn}</span>
                  {d.nameMy && (
                    <span lang="my" className="studio-hidden-my">
                      {d.nameMy}
                    </span>
                  )}
                  <span className="sr-only">
                    <Chrome lang={lang} k="studio.dish.open" vars={{ x: d.nameEn }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheet?.kind === "new" && (
        <DishSheet
          dish={null}
          categories={studio.categories}
          onClose={() => setSheet(null)}
          onSaved={landed}
        />
      )}
      {open && (
        <DishSheet
          // A fresh sheet per DISH, never one dish's draft under another's — and NOT per re-read stamp:
          // the sheet's own photo write moves `updated_at` and revalidates the page, and a stamp in
          // the key remounted the sheet, discarding the manager's unsaved edits (Codex round 1 on
          // #373). The sheet carries the stamp its own writes return; another manager's edit since is
          // refused at Save as stale, never silently overwritten.
          key={open.id}
          dish={open}
          categories={studio.categories}
          onClose={() => setSheet(null)}
          onSaved={landed}
        />
      )}
      {sheet?.kind === "categories" && (
        <CategoriesSheet
          categories={studio.categories}
          onClose={() => setSheet(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

const lead: CSSProperties = {
  margin: "0 0 var(--s2)",
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s2)",
};
