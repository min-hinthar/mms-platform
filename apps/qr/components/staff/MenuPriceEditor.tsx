"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { setMenuPrice } from "@/lib/menu-price";
import { setItemSoldOut } from "@/lib/menu-availability";

export type PricedItem = {
  id: string;
  nameEn: string;
  nameMy: string | null;
  priceCents: number;
  category: string;
  soldOut: boolean;
  /** W23a — when it was taken off, or null. The owner chose a MANUAL 86 lifetime, so this stamp is
   *  the only thing that makes a flag which has outlived its shift visible to whoever looks next. */
  soldOutAt: string | null;
};

/**
 * W17b — the manager price editor (owner: "staff portal should be able to update prices?").
 *
 * The shape follows the staff console's existing two-step idiom (CashSettleButton, ClearTableButton,
 * MergeTableButton): the row's Save button is REPLACED in place by a `role="group"` confirm naming
 * the old price, the new price, and the direction — no modal, no portal, nothing else inerted, so no
 * `aria-modal` lie. A price change is a decision every future guest pays for, which is exactly the
 * class of button the owner asked to confirm (W16c).
 *
 * The authority is `setMenuPrice` (manager floor re-checked server-side, Zod + a column CHECK
 * bounding the amount). Everything here is affordance and honest feedback — never the gate.
 */
export function MenuPriceEditor({ items }: { items: PricedItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // The row being edited, and its typed dollars. One row at a time: a bulk grid of live price inputs
  // invites a mis-tab into the wrong dish, and there is no undo on a price.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // W23a — the id whose 86 is in flight, so only that row's control disables (a page-wide busy flag
  // would freeze every row while one cook flips one dish).
  const [flipping, setFlipping] = useState<string | null>(null);
  // ONE live region for this view (QA §A) — outcomes and refusals both ride it.
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // W23a — the 86 toggle. ONE tap in both directions, deliberately: this is the control the cook
  // reaches for with their hands full at the moment the pan comes up empty, and a confirm step is
  // exactly the friction that makes people skip it and let the orders keep coming. It is also cheap
  // to undo — unlike a price, which every future guest pays and which keeps its two-step confirm
  // right below. The ledger is what keeps a one-tap control accountable.
  async function toggleSoldOut(i: PricedItem) {
    setFlipping(i.id);
    setMsg(null);
    const r = await setItemSoldOut({
      menuItemId: i.id,
      soldOut: !i.soldOut,
      // The state this row RENDERED with — the server refuses a flip made against a stale screen.
      expectedSoldOut: i.soldOut,
    });
    setFlipping(null);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({
      ok: true,
      text: r.soldOut
        ? `${i.nameEn} is off the menu — nobody can order it until you put it back.`
        : `${i.nameEn} is back on the menu.`,
    });
    router.refresh();
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.nameEn.toLowerCase().includes(needle) ||
        (i.nameMy ?? "").includes(q.trim()) ||
        i.category.toLowerCase().includes(needle),
    );
  }, [items, q]);

  // Parsed to integer cents the same way the server bounds it. NaN on an empty/garbage field.
  const draftCents = Math.round(Number.parseFloat(draft) * 100);
  const current = items.find((i) => i.id === editing) ?? null;
  const validDraft =
    Number.isFinite(draftCents) &&
    draftCents >= 25 &&
    draftCents <= 500000 &&
    current != null &&
    draftCents !== current.priceCents;

  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  // Focus the amount field when a row opens for editing — the row's Edit button just became the
  // field's sibling, so focus would otherwise sit on a button that no longer does anything.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Move focus into the confirm group as it replaces Save, and back to Save on cancel, so it is
  // never dropped to <body> as the step unmounts (the staff-console rule, S1-audit S6).
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) saveRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  function openEdit(item: PricedItem) {
    setEditing(item.id);
    setDraft((item.priceCents / 100).toFixed(2));
    setConfirming(false);
    setMsg(null);
  }

  function closeEdit() {
    setEditing(null);
    setDraft("");
    setConfirming(false);
  }

  async function save() {
    if (!current || !validDraft) return;
    setBusy(true);
    // W21d (Codex P2 on #180) — a rejected Server Action promise (dead radio, 5xx transport) used
    // to skip setBusy(false) entirely: both confirm buttons stuck on "Saving…" forever. The
    // finally re-enables; the catch reports the honest ambiguity (the write may or may not have
    // landed — the list refresh shows the truth).
    let res: Awaited<ReturnType<typeof setMenuPrice>>;
    try {
      res = await setMenuPrice({
        menuItemId: current.id,
        priceCents: draftCents,
        // W21d (Codex P1 on #180) — the price this screen SHOWED; the server refuses if it moved.
        expectedPriceCents: current.priceCents,
      });
    } catch {
      setMsg({
        ok: false,
        text: "Couldn’t reach the menu — the save may not have landed. Check the price and try again.",
      });
      setConfirming(false);
      return;
    } finally {
      setBusy(false);
    }
    setConfirming(false);
    if (!res.ok) {
      // The row stays open with the typed value intact — a refusal should not also cost the manager
      // their input.
      setMsg({ ok: false, text: res.error });
      // W21d (Codex P2 on #193) — refresh the LIST on a refusal: the concurrency refusal tells the
      // manager to "check the new price and try again", but the stale `items` prop would keep
      // feeding the same stale expectedPriceCents forever. The edit row's own client state
      // (editing/draft) survives a router.refresh, so nothing typed is lost.
      router.refresh();
      return;
    }
    setMsg({
      ok: true,
      text: `${current.nameEn} is now ${dollars(res.priceCents)}. Lines already in a cart keep the price they were quoted.`,
    });
    closeEdit();
    // W21d (Codex P2 on #180) — closeEdit unmounts the whole edit form (confirm group included),
    // and the confirm-group focus effect can only re-home to the also-unmounted Save button — so a
    // successful save dropped keyboard/SR users to <body>. Park on the stable search input.
    searchRef.current?.focus();
    router.refresh();
  }

  return (
    <div>
      <label htmlFor="mp-search" style={label}>
        Find a dish
      </label>
      <input
        id="mp-search"
        ref={searchRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Mohinga, ကြေးအိုး, Curries…"
        autoComplete="off"
        style={input}
      />

      {/* The view's ONE live region — every outcome and refusal lands here. */}
      <p role="status" style={msg ? (msg.ok ? okLine : errLine) : srOnly}>
        {msg?.text ?? ""}
      </p>

      <ul role="list" aria-label="Menu prices" style={list}>
        {shown.map((i) => {
          const open = editing === i.id;
          return (
            <li key={i.id} className="card" style={row}>
              <div style={{ minWidth: 0 }}>
                <p style={name}>
                  {i.nameEn}
                  {i.soldOut && (
                    <span style={soldOutTag}>
                      {" "}
                      · sold out{i.soldOutAt ? ` since ${clock(i.soldOutAt)}` : ""}
                    </span>
                  )}
                </p>
                {i.nameMy && (
                  <p lang="my" style={nameMy}>
                    {i.nameMy}
                  </p>
                )}
                <p style={cat}>{i.category}</p>
              </div>

              {!open ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
                  <span style={price}>{dollars(i.priceCents)}</span>
                  <button
                    type="button"
                    style={i.soldOut ? restoreBtn : eightySixBtn}
                    disabled={flipping === i.id}
                    onClick={() => void toggleSoldOut(i)}
                    // The visible label is two words; the accessible name has to say WHICH dish,
                    // because every row in this list carries the same one.
                    aria-label={
                      i.soldOut
                        ? `Put ${i.nameEn} back on the menu`
                        : `Mark ${i.nameEn} sold out — nobody can order it until you put it back`
                    }
                  >
                    {flipping === i.id ? "…" : i.soldOut ? "Put back" : "86"}
                  </button>
                  <button type="button" style={ghostBtn} onClick={() => openEdit(i)}>
                    Edit
                    {/* The name alone reads as "Edit" on every row in the list — say which dish. */}
                    <span style={srOnly}> the price of {i.nameEn}</span>
                  </button>
                </div>
              ) : confirming && current ? (
                <div
                  ref={confirmRef}
                  tabIndex={-1}
                  role="group"
                  aria-label={`Confirm the new price for ${current.nameEn}`}
                  style={confirmCard}
                >
                  <p style={confirmQ}>
                    Change {current.nameEn} from {dollars(current.priceCents)} to{" "}
                    <strong>{dollars(draftCents)}</strong>?
                  </p>
                  <p style={confirmDetail}>
                    Every new order pays the new price. Lines already in a cart keep what they were
                    quoted, and paid orders never change.
                  </p>
                  <div style={{ display: "flex", gap: "var(--s2)" }}>
                    <button
                      type="button"
                      style={cancelBtn}
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      Keep {dollars(current.priceCents)}
                    </button>
                    <button type="button" style={proceedBtn} disabled={busy} onClick={save}>
                      {busy ? "Saving…" : `Set ${dollars(draftCents)}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
                  <span aria-hidden="true" style={{ color: "var(--t2)" }}>
                    $
                  </span>
                  <label htmlFor={`mp-${i.id}`} style={srOnly}>
                    New price for {i.nameEn}, in dollars
                  </label>
                  <input
                    id={`mp-${i.id}`}
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    // `decimal` gives the numeric pad WITH a decimal point on the tablet the console
                    // runs on; `numeric` would hide it and make $14.50 untypeable.
                    inputMode="decimal"
                    autoComplete="off"
                    style={priceInput}
                  />
                  <button type="button" style={ghostBtn} onClick={closeEdit}>
                    Cancel
                  </button>
                  <button
                    ref={saveRef}
                    type="button"
                    style={validDraft ? saveBtn : saveBtnOff}
                    disabled={!validDraft}
                    onClick={() => setConfirming(true)}
                  >
                    Save
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p style={cat}>No dish matches “{q.trim()}”.</p>}
    </div>
  );
}

/** Latin digits, integer cents — never a locale-formatted numeral on the money path. */
const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

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
const name: CSSProperties = { margin: 0, fontWeight: 700, fontSize: "var(--fs-body)" };
const nameMy: CSSProperties = { margin: 0, color: "var(--t2)", fontSize: "var(--fs-sm)" };
const cat: CSSProperties = { margin: "2px 0 0", color: "var(--t3)", fontSize: "var(--fs-xs)" };
const soldOutTag: CSSProperties = { color: "var(--t3)", fontWeight: 400 };
/** The restaurant's clock, never the device's — a manager travelling must read the counter's time. */
const clockFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});
const clock = (iso: string): string => clockFmt.format(new Date(iso));
const eightySixBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid color-mix(in oklab, var(--warn) 40%, var(--bd))",
  background: "var(--warnb)",
  color: "var(--warn)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const restoreBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: "var(--r-full)",
  border: "1px solid color-mix(in oklab, var(--ok) 40%, var(--bd))",
  background: "var(--okb)",
  color: "var(--ok)",
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const price: CSSProperties = { fontWeight: 800, fontSize: "var(--fs-body)" };
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  marginBottom: "var(--s2)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const priceInput: CSSProperties = { ...input, width: 96, textAlign: "right" };
const ghostBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
const saveBtn: CSSProperties = {
  ...ghostBtn,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 800,
};
const saveBtnOff: CSSProperties = { ...saveBtn, opacity: 0.5, cursor: "default" };
const confirmCard: CSSProperties = {
  border: "1px solid var(--ac)",
  borderRadius: "var(--r-sm)",
  padding: "var(--s3)",
  display: "grid",
  gap: "var(--s2)",
  maxWidth: 340,
};
const confirmQ: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", fontWeight: 700 };
const confirmDetail: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  color: "var(--t2)",
};
const cancelBtn: CSSProperties = { ...ghostBtn, flex: 1 };
const proceedBtn: CSSProperties = { ...saveBtn, flex: 1 };
const okLine: CSSProperties = {
  margin: "var(--s3) 0 0",
  color: "var(--ac-strong)",
  fontSize: "var(--fs-sm)",
};
const errLine: CSSProperties = {
  margin: "var(--s3) 0 0",
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
