"use client";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Icon, Sheet } from "@mms/ui";
import { moveCategoryAction, saveCategory } from "@/lib/menu-studio";
import { boundWrite, stalledSince, tapRefusal } from "@/lib/bounded-write";
import { CATEGORY_NAME_MAX } from "@/lib/menu-studio-rules";
import { plural } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { useResaid } from "./useResaid";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { STUDIO_REFUSAL_KEY, type StudioCategory } from "./DishSheet";

/**
 * Menu studio (owner, 2026-10-24) — the menu's categories, in the menu's own order: rename one in
 * place, move it up or down (a swap with its neighbour — `moveCategory`), hide or show it (a hidden
 * category takes its dishes off the menu, the kiosk and the pad — `categoryShown`), or add one at the
 * end. Each write is compare-and-swapped server-side; after one lands the parent re-reads the page
 * (`onChanged`) and this list follows the new props.
 *
 * ONE live region. Every control is aria-disabled while a write is out (§17), and the row's controls
 * are named with the category (each row carries the same verbs).
 */
export function CategoriesSheet({
  categories,
  onClose,
  onChanged,
}: {
  categories: readonly StudioCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const lang = useStaffLang();
  const [names, setNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const inFlight = useRef(false);
  const said = useResaid(msg);
  const sorted = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  async function run(key: string, write: () => Promise<{ kind: string }>) {
    if (inFlight.current) return;
    const refused = tapRefusal(null, stalledSince(), "out.stalled");
    if (refused !== null) return setMsg({ k: refused });
    inFlight.current = true;
    setBusy(key);
    setMsg(null);
    try {
      await write();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function save(c: StudioCategory, isActive: boolean) {
    const name = (names[c.id] ?? c.name).trim();
    if (name === "") return setMsg({ k: "studio.cat.err.name" });
    return run(`save:${c.id}`, async () => {
      const out = await boundWrite(saveCategory({ categoryId: c.id, name, isActive }));
      if (out.kind !== "answer") setMsg({ k: "studio.err.unknown" });
      else if (!out.value.ok) setMsg({ k: STUDIO_REFUSAL_KEY[out.value.reason] });
      else {
        setMsg({ k: "studio.cat.saved", vars: { x: name } });
        onChanged();
      }
      return out;
    });
  }

  function move(c: StudioCategory, direction: "up" | "down") {
    return run(`move:${c.id}`, async () => {
      const out = await boundWrite(moveCategoryAction({ categoryId: c.id, direction }));
      if (out.kind !== "answer") setMsg({ k: "studio.err.unknown" });
      else if (!out.value.ok) setMsg({ k: STUDIO_REFUSAL_KEY[out.value.reason] });
      else {
        setMsg({ k: "studio.cat.moved", vars: { x: c.name } });
        onChanged();
      }
      return out;
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (name === "") return setMsg({ k: "studio.cat.err.name" });
    return run("add", async () => {
      const out = await boundWrite(saveCategory({ name, isActive: true }));
      if (out.kind !== "answer") setMsg({ k: "studio.err.unknown" });
      else if (!out.value.ok) setMsg({ k: STUDIO_REFUSAL_KEY[out.value.reason] });
      else {
        setAdding("");
        setMsg({ k: "studio.cat.saved", vars: { x: name } });
        onChanged();
      }
      return out;
    });
  }

  const dim = busy !== null || undefined;
  return (
    <Sheet
      open
      busy={busy !== null}
      closeLabel={sheetCloseLabel(lang)}
      onOpenChange={(next) => !next && onClose()}
      title={<Chrome lang={lang} k="studio.cat.title" />}
    >
      <p style={lead}>
        <Chrome lang={lang} k="studio.cat.lead" echo="stack" />
      </p>
      <ol style={list} aria-label={ts(lang, "studio.cat.title")}>
        {sorted.map((c, i) => {
          const draft = names[c.id] ?? c.name;
          const renamed = draft.trim() !== c.name;
          return (
            <li key={c.id} className="card studio-cat" data-hidden={!c.isActive || undefined}>
              <div className="studio-cat-main">
                <label className="sr-only" htmlFor={`cat-${c.id}`}>
                  <Chrome lang={lang} k="studio.cat.rename" vars={{ x: c.name }} />
                </label>
                <input
                  id={`cat-${c.id}`}
                  lang="en"
                  style={field}
                  value={draft}
                  maxLength={CATEGORY_NAME_MAX}
                  autoComplete="off"
                  onChange={(e) => setNames((n) => ({ ...n, [c.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (renamed) void save(c, c.isActive);
                    }
                  }}
                />
                <span style={meta}>
                  <Chrome
                    lang={lang}
                    k={plural(c.dishCount, "studio.cat.count.one", "studio.cat.count.many")}
                    vars={{ n: c.dishCount }}
                  />
                  {!c.isActive && (
                    <>
                      {" · "}
                      <Chrome lang={lang} k="studio.cat.hiddenTag" />
                    </>
                  )}
                </span>
              </div>
              <div className="studio-cat-actions">
                {renamed && (
                  <button
                    type="button"
                    className="staff-btn staff-press studio-cat-save"
                    aria-disabled={dim}
                    onClick={() => void save(c, c.isActive)}
                  >
                    <Chrome lang={lang} k="studio.dish.save" echo="inline" />
                  </button>
                )}
                <button
                  type="button"
                  className="staff-circ staff-press"
                  aria-disabled={i === 0 || dim}
                  onClick={() => i > 0 && void move(c, "up")}
                >
                  <Icon name="chevron-up" size={20} aria-hidden />
                  <span className="sr-only">
                    <Chrome lang={lang} k="studio.cat.up" vars={{ x: c.name }} />
                  </span>
                </button>
                <button
                  type="button"
                  className="staff-circ staff-press"
                  aria-disabled={i === sorted.length - 1 || dim}
                  onClick={() => i < sorted.length - 1 && void move(c, "down")}
                >
                  <Icon name="chevron-down" size={20} aria-hidden />
                  <span className="sr-only">
                    <Chrome lang={lang} k="studio.cat.down" vars={{ x: c.name }} />
                  </span>
                </button>
                {/* A verb, not a toggle: its word says what the tap does (Hide / Show). */}
                <button
                  type="button"
                  className="staff-btn staff-press studio-cat-vis"
                  aria-disabled={dim}
                  onClick={() => void save(c, !c.isActive)}
                >
                  <Chrome
                    lang={lang}
                    k={c.isActive ? "studio.cat.hide" : "studio.cat.show"}
                    echo="inline"
                  />
                  <span className="sr-only"> — {c.name}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={add} style={addRow} noValidate>
        <label className="sr-only" htmlFor="cat-new">
          <Chrome lang={lang} k="studio.cat.addField" />
        </label>
        <input
          id="cat-new"
          lang="en"
          style={{ ...field, flex: 1 }}
          value={adding}
          maxLength={CATEGORY_NAME_MAX}
          autoComplete="off"
          placeholder="Noodles"
          onChange={(e) => setAdding(e.target.value)}
        />
        <button
          type="submit"
          className="staff-btn staff-press"
          style={addBtn}
          aria-disabled={dim}
          aria-busy={busy === "add" || undefined}
        >
          <Chrome lang={lang} k="studio.cat.add" echo="inline" />
        </button>
      </form>
      {/* ONE live region (QA §A). */}
      <p role="status" style={region}>
        {msg && (
          <span key={said}>
            <MsgText lang={lang} msg={msg} />
          </span>
        )}
      </p>
    </Sheet>
  );
}

const lead: CSSProperties = {
  margin: "var(--s2) 0 var(--s3)",
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
const field: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-field)",
};
const meta: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "var(--t3)",
  fontSize: "var(--fs-xs)",
};
const addRow: CSSProperties = { display: "flex", gap: "var(--s2)", marginTop: "var(--s4)" };
const addBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s4)",
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: "var(--fw-bold)",
  whiteSpace: "nowrap",
};
const region: CSSProperties = {
  margin: "var(--s3) 0 0",
  minHeight: "1.4em",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
