"use client";
import { useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import { Icon, Sheet } from "@mms/ui";
import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@mms/db/bounds";
import {
  clearDishPhoto,
  createDish,
  editDish,
  setDishPhoto,
  type MenuStudioRefusal,
} from "@/lib/menu-studio";
import { setMenuPrice } from "@/lib/menu-price";
import { boundWrite, stalledSince, tapRefusal } from "@/lib/bounded-write";
import { heldAfter, keyForAttempt, type HeldAddKey } from "@/lib/staff-add-key";
import { draftCents, priceDraftVerdict } from "@/lib/menu-price-draft";
import {
  MENU_DESCRIPTION_MAX,
  MENU_NAME_MAX,
  TAX_CATEGORIES,
  type MenuTaxCategory,
} from "@/lib/menu-studio-rules";
import { resizePhoto } from "@/lib/photo-resize";
import { dollars } from "@/lib/receipt-view";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { useResaid } from "./useResaid";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";

/** A dish as the studio reads it (every field the sheet edits, plus the row's CAS stamp). */
export type StudioDish = {
  id: string;
  nameEn: string;
  nameMy: string | null;
  descriptionEn: string | null;
  descriptionMy: string | null;
  categoryId: string;
  taxCategory: MenuTaxCategory;
  isActive: boolean;
  priceCents: number;
  imageUrl: string | null;
  updatedAt: string;
};

export type StudioCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  dishCount: number;
};

/** The studio's refusals → the sheet's sentences. */
export const STUDIO_REFUSAL_KEY: Record<MenuStudioRefusal, StaffKey> = {
  signin: "studio.err.failed",
  gate: "studio.err.failed",
  invalid: "studio.err.failed",
  outage: "studio.err.failed",
  gone: "studio.err.gone",
  stale: "studio.err.stale",
  category: "studio.err.category",
  storage: "studio.err.storage",
  type: "studio.err.type",
  size: "studio.err.size",
  empty: "studio.err.read",
  error: "studio.err.failed",
};

/**
 * Menu studio (owner, 2026-10-24) — ONE sheet for a dish: a new one ("Add a dish") or an existing one
 * (the row's photo). Its photo — taken or chosen on the phone (`accept="image/*"` is the iOS camera
 * or library), made small on the device (`resizePhoto`) and saved at once, so a photo never waits on
 * the rest of the form —, both names and descriptions (the Burmese fields marked `lang="my"`), its
 * category, its tax category, its price and whether it is on the menu.
 *
 * Saving an existing dish runs the studio's compare-and-swapped edit (`editDish`) and, only when the
 * price moved, the price's own audited action (`setMenuPrice`) — never a second price path. Every
 * refusal is a stated sentence in the ONE region; every control is aria-disabled while a write is out,
 * never natively disabled (§17), and the sheet is `busy` so no dismissal drops an answer.
 */
export function DishSheet({
  dish,
  categories,
  onClose,
  onSaved,
}: {
  /** null — a new dish. */
  dish: StudioDish | null;
  categories: readonly StudioCategory[];
  onClose: () => void;
  /** A landed write: the parent refreshes the list and says it in the page's region. */
  onSaved: (msg: StaffMsg) => void;
}) {
  const lang = useStaffLang();
  const isNew = dish === null;
  const firstCat = categories.find((c) => c.isActive) ?? categories[0];
  const [nameEn, setNameEn] = useState(dish?.nameEn ?? "");
  const [nameMy, setNameMy] = useState(dish?.nameMy ?? "");
  const [descEn, setDescEn] = useState(dish?.descriptionEn ?? "");
  const [descMy, setDescMy] = useState(dish?.descriptionMy ?? "");
  const [categoryId, setCategoryId] = useState(dish?.categoryId ?? firstCat?.id ?? "");
  const [tax, setTax] = useState<MenuTaxCategory>(dish?.taxCategory ?? "hot_prepared");
  const [onMenu, setOnMenu] = useState(dish?.isActive ?? true);
  const [price, setPrice] = useState(dish ? (dish.priceCents / 100).toFixed(2) : "");
  const [photo, setPhoto] = useState<string | null>(dish?.imageUrl ?? null);
  const [updatedAt, setUpdatedAt] = useState(dish?.updatedAt ?? "");
  const createKey = useRef<HeldAddKey>(null);
  const [busy, setBusy] = useState(false);
  // Which write is out — the button that says "Saving…" (busy is the Sheet's lock, M82).
  const [doing, setDoing] = useState<null | "save" | "photo">(null);
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const [tried, setTried] = useState(false);
  const inFlight = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const said = useResaid(msg);

  // -1: no saved price can equal it, so "unchanged" never refuses here (a same-price save is
  // simply no price write).
  const verdict = priceDraftVerdict(price, -1);
  const cents = verdict === "ok" ? draftCents(price) : null;
  const nameOk = nameEn.trim().length > 0;
  const priceHint: StaffMsg | null =
    verdict === "ok" || (!tried && verdict === "empty")
      ? null
      : verdict === "below"
        ? { k: "browse.price.draft.below", vars: { m: dollars(PRICE_MIN_CENTS) } }
        : verdict === "above"
          ? { k: "browse.price.draft.above", vars: { m: dollars(PRICE_MAX_CENTS) } }
          : verdict === "empty"
            ? { k: "browse.price.draft.empty", vars: { m: dollars(1200) } }
            : { k: "browse.price.draft.nan", vars: { m: dollars(1200) } };
  const ready = nameOk && cents !== null && categoryId !== "" && !busy;

  /** Refused AT THE TAP while the tablet is stalled (9d) — a write would only queue behind it. */
  function stalled(): boolean {
    const refused = tapRefusal(null, stalledSince(), "out.stalled");
    if (refused === null) return false;
    setMsg({ k: refused });
    return true;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setTried(true);
    if (!nameOk) {
      setMsg({ k: "studio.err.name" });
      document.getElementById("dish-name-en")?.focus();
      return;
    }
    if (cents === null) {
      setMsg(priceHint ?? { k: "browse.price.draft.empty", vars: { m: dollars(1200) } });
      document.getElementById("dish-price")?.focus();
      return;
    }
    if (stalled()) return;
    inFlight.current = true;
    setBusy(true);
    setDoing("save");
    setMsg(null);
    try {
      const fields = {
        nameEn,
        nameMy: nameMy || null,
        descriptionEn: descEn || null,
        descriptionMy: descMy || null,
        categoryId,
        taxCategory: tax,
      };
      if (isNew) {
        // The creation key rides retries of the SAME dish (`staff-add-key.ts`): an Add whose answer
        // was lost or late resends it, and the action answers ok for the dish it already made.
        const intent = JSON.stringify([fields, cents]);
        const itemId = keyForAttempt(createKey.current, intent, () => crypto.randomUUID());
        const out = await boundWrite(createDish({ ...fields, priceCents: cents, itemId }));
        if (out.kind !== "answer") {
          createKey.current = heldAfter(intent, itemId, "unknown");
          return setMsg({ k: "studio.err.unknown" });
        }
        const res = out.value;
        createKey.current = heldAfter(
          intent,
          itemId,
          res.ok ? "ok" : res.reason === "error" ? "unknown" : "definite",
        );
        if (!res.ok) return setMsg({ k: STUDIO_REFUSAL_KEY[res.reason] });
        onSaved({ k: "studio.dish.created", vars: { x: nameEn.trim() } });
        onClose();
        return;
      }
      const out = await boundWrite(
        editDish({ ...fields, itemId: dish.id, expectedUpdatedAt: updatedAt, isActive: onMenu }),
      );
      if (out.kind !== "answer") return setMsg({ k: "studio.err.unknown" });
      const res = out.value;
      if (!res.ok) return setMsg({ k: STUDIO_REFUSAL_KEY[res.reason] });
      setUpdatedAt(res.updatedAt);
      let changed = res.changed;
      if (cents !== dish.priceCents) {
        const p = await boundWrite(
          setMenuPrice({
            menuItemId: dish.id,
            priceCents: cents,
            expectedPriceCents: dish.priceCents,
          }),
        );
        if (p.kind !== "answer") return setMsg({ k: "studio.err.unknown" });
        // The price action speaks its own sentence (its bounds, a newer price) — said as it is.
        if (!p.value.ok) return setMsg(p.value.error);
        changed += 1;
      }
      if (changed === 0) return setMsg({ k: "studio.dish.nothing" });
      onSaved(
        res.audited
          ? { k: "studio.dish.saved", vars: { x: nameEn.trim() } }
          : { k: "studio.dish.unaudited" },
      );
      onClose();
    } finally {
      inFlight.current = false;
      setBusy(false);
      setDoing(null);
    }
  }

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same photo picked twice still fires
    if (!file || !dish || inFlight.current) return;
    if (stalled()) return;
    // The resize is the device's own work (no write, nothing to lose on a dismissal), so it runs
    // BEFORE the sheet's lock — the lock covers only the upload, a bounded write (M82 · 9a).
    inFlight.current = true;
    setMsg({ k: "studio.dish.photo.saving" });
    const small = await resizePhoto(file);
    if (!small) {
      inFlight.current = false;
      setMsg({ k: "studio.err.read" });
      return;
    }
    setBusy(true);
    setDoing("photo");
    try {
      const form = new FormData();
      form.set("itemId", dish.id);
      form.set("expectedUpdatedAt", updatedAt);
      form.set("photo", new File([small], "photo.jpg", { type: "image/jpeg" }));
      const out = await boundWrite(setDishPhoto(form));
      if (out.kind !== "answer") return setMsg({ k: "studio.err.unknown" });
      const res = out.value;
      if (!res.ok) return setMsg({ k: STUDIO_REFUSAL_KEY[res.reason] });
      setPhoto(res.imageUrl);
      setUpdatedAt(res.updatedAt);
      setMsg({ k: "studio.dish.photo.saved" });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setDoing(null);
    }
  }

  async function removePhoto() {
    if (!dish || inFlight.current || stalled()) return;
    inFlight.current = true;
    setBusy(true);
    setDoing("photo");
    setMsg(null);
    try {
      const out = await boundWrite(
        clearDishPhoto({ itemId: dish.id, expectedUpdatedAt: updatedAt }),
      );
      if (out.kind !== "answer") return setMsg({ k: "studio.err.unknown" });
      if (!out.value.ok) return setMsg({ k: STUDIO_REFUSAL_KEY[out.value.reason] });
      setPhoto(null);
      setUpdatedAt(out.value.updatedAt);
      setMsg({ k: "studio.dish.photo.removed" });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setDoing(null);
    }
  }

  return (
    <Sheet
      open
      busy={busy}
      closeLabel={sheetCloseLabel(lang)}
      onOpenChange={(next) => !next && onClose()}
      title={
        isNew ? (
          <Chrome lang={lang} k="studio.dish.titleNew" />
        ) : (
          <Chrome lang={lang} k="studio.dish.titleEdit" vars={{ x: dish.nameEn }} />
        )
      }
    >
      <form onSubmit={save} noValidate style={body}>
        {/* The photo leads: it is what a guest sees first. */}
        <div className="studio-photo">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the manager's own preview of the bytes just saved
            <img src={photo} alt="" className="studio-photo-img" />
          ) : (
            <span className="studio-photo-empty" aria-hidden>
              <Icon name="camera" size={32} />
            </span>
          )}
          <div className="studio-photo-actions">
            {isNew ? (
              <p style={note}>
                <Chrome lang={lang} k="studio.dish.photo.afterAdd" echo="stack" />
              </p>
            ) : (
              <>
                {/* A real <label> over the hidden file input: one tap opens the iOS camera / library
                    sheet, and the control keeps its own accessible name. */}
                <label
                  htmlFor="dish-photo"
                  className="staff-btn staff-press studio-photo-btn"
                  aria-disabled={busy || undefined}
                >
                  <Icon name="camera" size={18} aria-hidden />
                  <Chrome
                    lang={lang}
                    k={photo ? "studio.dish.photo.replace" : "studio.dish.photo.take"}
                    echo="inline"
                  />
                </label>
                <input
                  ref={fileRef}
                  id="dish-photo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void onPhoto(e)}
                />
                {photo && (
                  <button
                    type="button"
                    className="staff-btn staff-press studio-photo-remove"
                    aria-disabled={busy || undefined}
                    onClick={() => void removePhoto()}
                  >
                    <Chrome lang={lang} k="studio.dish.photo.remove" echo="inline" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <label style={lbl} htmlFor="dish-name-en">
          <Chrome lang={lang} k="studio.dish.nameEn" echo="inline" />
        </label>
        <input
          id="dish-name-en"
          lang="en"
          style={field}
          value={nameEn}
          maxLength={MENU_NAME_MAX}
          autoComplete="off"
          aria-invalid={tried && !nameOk ? true : undefined}
          onChange={(e) => setNameEn(e.target.value)}
        />
        <label style={lbl} htmlFor="dish-name-my">
          <Chrome lang={lang} k="studio.dish.nameMy" echo="inline" />
        </label>
        <input
          id="dish-name-my"
          lang="my"
          style={field}
          value={nameMy}
          maxLength={MENU_NAME_MAX}
          autoComplete="off"
          onChange={(e) => setNameMy(e.target.value)}
        />
        <div style={twoCol}>
          <div>
            <label style={lbl} htmlFor="dish-price">
              <Chrome lang={lang} k="studio.dish.price" echo="inline" />
            </label>
            <input
              id="dish-price"
              style={field}
              value={price}
              inputMode="decimal"
              autoComplete="off"
              placeholder="12.00"
              aria-invalid={priceHint ? true : undefined}
              aria-describedby={priceHint ? "dish-price-hint" : undefined}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
            />
          </div>
          <div>
            <label style={lbl} htmlFor="dish-category">
              <Chrome lang={lang} k="studio.dish.category" echo="inline" />
            </label>
            <select
              id="dish-category"
              lang="en"
              style={field}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isActive ? c.name : `${c.name} · ${ts("en", "studio.cat.hiddenTag")}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        {priceHint && (
          <p id="dish-price-hint" style={hint}>
            <MsgText lang={lang} msg={priceHint} />
          </p>
        )}
        <label style={lbl} htmlFor="dish-tax">
          <Chrome lang={lang} k="studio.dish.tax" echo="inline" />
        </label>
        <select
          id="dish-tax"
          lang={lang}
          style={field}
          value={tax}
          onChange={(e) => setTax(e.target.value as MenuTaxCategory)}
        >
          {TAX_CATEGORIES.map((t) => (
            <option key={t} value={t}>
              {ts(lang, TAX_KEY[t])}
            </option>
          ))}
        </select>
        <label style={lbl} htmlFor="dish-desc-en">
          <Chrome lang={lang} k="studio.dish.descEn" echo="inline" />
        </label>
        <textarea
          id="dish-desc-en"
          lang="en"
          style={area}
          rows={2}
          value={descEn}
          maxLength={MENU_DESCRIPTION_MAX}
          onChange={(e) => setDescEn(e.target.value)}
        />
        <label style={lbl} htmlFor="dish-desc-my">
          <Chrome lang={lang} k="studio.dish.descMy" echo="inline" />
        </label>
        <textarea
          id="dish-desc-my"
          lang="my"
          style={area}
          rows={2}
          value={descMy}
          maxLength={MENU_DESCRIPTION_MAX}
          onChange={(e) => setDescMy(e.target.value)}
        />
        {!isNew && (
          <div style={switchRow}>
            <label htmlFor="dish-on-menu" style={{ flex: 1 }}>
              <span style={switchLabel}>
                <Chrome lang={lang} k="studio.dish.onMenu" echo="inline" />
              </span>
              {!onMenu && (
                <span style={note}>
                  <Chrome lang={lang} k="studio.dish.onMenu.off" echo="inline" />
                </span>
              )}
            </label>
            <input
              id="dish-on-menu"
              type="checkbox"
              role="switch"
              className="studio-switch"
              checked={onMenu}
              onChange={(e) => setOnMenu(e.target.checked)}
            />
          </div>
        )}
        <button
          type="submit"
          className="staff-btn staff-press"
          style={{ ...primaryBtn, opacity: ready ? 1 : 0.6 }}
          aria-disabled={!ready || undefined}
          aria-busy={doing === "save" || undefined}
        >
          {doing === "save" ? (
            <Chrome lang={lang} k="studio.dish.saving" echo="inline" />
          ) : isNew ? (
            <Chrome
              lang={lang}
              k="studio.dish.create"
              vars={{ m: cents !== null ? dollars(cents) : "—" }}
              echo="inline"
            />
          ) : (
            <Chrome lang={lang} k="studio.dish.save" echo="inline" />
          )}
        </button>
        {/* ONE live region (QA §A). */}
        <p role="status" style={region}>
          {msg && (
            <span key={said} style={{ color: "var(--t2)" }}>
              <MsgText lang={lang} msg={msg} />
            </span>
          )}
        </p>
      </form>
    </Sheet>
  );
}

/** An <option> holds text only, so each tax label is the dictionary's plain string in the device
 *  tongue (the <select> carries the `lang`). */
const TAX_KEY: Record<MenuTaxCategory, StaffKey> = {
  hot_prepared: "studio.tax.hotPrepared",
  cold_food: "studio.tax.coldFood",
  beverage_hot: "studio.tax.beverageHot",
  beverage_cold: "studio.tax.beverageCold",
  grocery_food: "studio.tax.groceryFood",
  retail_nonfood: "studio.tax.retailNonfood",
};

const body: CSSProperties = { marginTop: "var(--s2)" };
const note: CSSProperties = {
  display: "block",
  margin: 0,
  color: "var(--t2)",
  fontSize: "var(--fs-sm)",
};
const lbl: CSSProperties = {
  display: "block",
  margin: "var(--s3) 0 var(--s1)",
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-bold)",
  color: "var(--t2)",
};
const field: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-field)",
};
const area: CSSProperties = { ...field, padding: "var(--s2) var(--s3)", resize: "vertical" };
const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s3)" };
const hint: CSSProperties = {
  margin: "var(--s1) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
const switchRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--s3)",
  marginTop: "var(--s4)",
  minHeight: 48,
};
const switchLabel: CSSProperties = { display: "block", fontWeight: "var(--fw-bold)" };
const primaryBtn: CSSProperties = {
  width: "100%",
  minHeight: 56,
  marginTop: "var(--s4)",
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-bold)",
};
const region: CSSProperties = {
  margin: "var(--s3) 0 0",
  minHeight: "1.4em",
  fontSize: "var(--fs-sm)",
};
