"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { setMenuPrice } from "@/lib/menu-price";
import { setItemSoldOut } from "@/lib/menu-availability";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome, OutageText } from "./Chrome";
import { al, sx } from "@/lib/staff-labels";

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
 * P2 — what the view's ONE live region has to say, and WHO authored it.
 *
 * A `server` message is a sentence `setMenuPrice` / `setItemSoldOut` returned, and only
 * `<OutageText>` may render one: it swaps the single sentence that has an authored Burmese twin and
 * passes every other through verbatim, because a sentence we cannot translate is better shown in
 * English than guessed at in Burmese. Everything else here is copy THIS file authors, and
 * blanket-wrapping the region in `<OutageText>` would pass those literals through as English forever
 * while looking converted — so the region branches instead (the `RegisterStart` idiom).
 *
 * The variants are grouped by SLOT SET rather than by meaning, so every `<Chrome>` below is handed
 * exactly the vars its key declares: `<Chrome>`'s `vars` prop is a loose record and cannot check
 * that for us.
 */
type Msg =
  /** A sentence the Server Action returned. */
  | { ok: false; kind: "server"; error: string }
  /** A key with no slots. */
  | { ok: false; kind: "plain"; k: "browse.price.err.saveUnknown" }
  /** A key whose only slot is the dish. */
  | {
      ok: boolean;
      kind: "dish";
      k: "browse.price.err.flipUnknown" | "browse.price.live.off" | "browse.price.live.on";
      x: string;
    }
  /** The save confirmation — the dish, and the amount it now rings at. */
  | { ok: true; kind: "saved"; x: string; m: string };

/**
 * The search placeholder — a COMPONENT CONSTANT, not a dictionary key, and deliberately so: it is a
 * list of example dish and category names, two of the three Latin. A MY value carrying a bare Latin
 * run is exactly what `strings.test.ts` refuses — nothing marks it, so it would set in Padauk and be
 * announced as Burmese — and the string is already bilingual as it stands.
 */
const SEARCH_PLACEHOLDER = "Mohinga, ကြေးအိုး, Curries…";

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
export function MenuPriceEditor({
  items,
  canEditPrice,
}: {
  items: PricedItem[];
  /** W23a (Codex P2) — a SERVER reaches this page for the 86 control alone. The price editor is
   *  manager-only and `setMenuPrice` re-checks that server-side; hiding the Edit button is what
   *  keeps the screen from offering an action the authority would refuse. It is also the ONLY door
   *  into the edit form (`openEdit` has no other caller), so withholding it withholds the form. */
  canEditPrice: boolean;
}) {
  // P2 — the device language, from app/staff/layout.tsx (one cookie read, one provider).
  const lang = useStaffLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  // The row being edited, and its typed dollars. One row at a time: a bulk grid of live price inputs
  // invites a mis-tab into the wrong dish, and there is no undo on a price.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // W23a — the ids whose 86 is in flight, so only those rows' controls disable (a page-wide busy flag
  // would freeze every row while one cook flips one dish). A SET, not one id: two taps in quick
  // succession are ordinary during a rush, and a single slot would let the first flip's completion
  // re-enable the second row's button while that flip was still in the air.
  const [flipping, setFlipping] = useState<ReadonlySet<string>>(() => new Set());
  // ONE live region for this view (QA §A) — outcomes and refusals both ride it.
  const [msg, setMsg] = useState<Msg | null>(null);

  // W23a — the 86 toggle. ONE tap in both directions, deliberately: this is the control the cook
  // reaches for with their hands full at the moment the pan comes up empty, and a confirm step is
  // exactly the friction that makes people skip it and let the orders keep coming. It is also cheap
  // to undo — unlike a price, which every future guest pays and which keeps its two-step confirm
  // right below. The ledger is what keeps a one-tap control accountable.
  async function toggleSoldOut(i: PricedItem) {
    setFlipping((f) => new Set(f).add(i.id));
    setMsg(null);
    // Same shape as `save()` below, and for the same reason it was added there (Codex P2 on #180): a
    // REJECTED Server Action promise — dead radio, 5xx transport — would otherwise skip the re-enable
    // and strand the row on "…" forever, which on this control means the cook cannot retry the 86.
    let r: Awaited<ReturnType<typeof setItemSoldOut>>;
    try {
      r = await setItemSoldOut({
        menuItemId: i.id,
        soldOut: !i.soldOut,
        // The state this row RENDERED with — the server refuses a flip made against a stale screen.
        expectedSoldOut: i.soldOut,
      });
    } catch {
      setMsg({ ok: false, kind: "dish", k: "browse.price.err.flipUnknown", x: i.nameEn });
      // The list is the only honest account of what landed; the toggle's own state is a guess.
      router.refresh();
      return;
    } finally {
      setFlipping((f) => {
        const next = new Set(f);
        next.delete(i.id);
        return next;
      });
    }
    if (!r.ok) {
      setMsg({ ok: false, kind: "server", error: r.error });
      // Codex P2 on #193, same rule as the price refusal: a concurrency refusal means this screen is
      // stale, and without a refresh the row keeps feeding the SAME stale `expectedSoldOut` forever —
      // so every retry fails identically and the cook cannot get the dish off the menu at all.
      router.refresh();
      return;
    }
    setMsg({
      ok: true,
      kind: "dish",
      k: r.soldOut ? "browse.price.live.off" : "browse.price.live.on",
      x: i.nameEn,
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
      setMsg({ ok: false, kind: "plain", k: "browse.price.err.saveUnknown" });
      setConfirming(false);
      return;
    } finally {
      setBusy(false);
    }
    setConfirming(false);
    if (!res.ok) {
      // The row stays open with the typed value intact — a refusal should not also cost the manager
      // their input.
      setMsg({ ok: false, kind: "server", error: res.error });
      // W21d (Codex P2 on #193) — refresh the LIST on a refusal: the concurrency refusal tells the
      // manager to "check the new price and try again", but the stale `items` prop would keep
      // feeding the same stale expectedPriceCents forever. The edit row's own client state
      // (editing/draft) survives a router.refresh, so nothing typed is lost.
      router.refresh();
      return;
    }
    setMsg({
      ok: true,
      kind: "saved",
      x: current.nameEn,
      // The SERVER's amount, never the draft — the confirmation quotes what actually landed.
      m: dollars(res.priceCents),
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
        <Chrome lang={lang} k="browse.price.find" echo="stack" />
      </label>
      <input
        id="mp-search"
        ref={searchRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        // A placeholder is a flat attribute: it carries no markup and so no `lang`. The visible
        // <label> above is the marked one.
        placeholder={SEARCH_PLACEHOLDER}
        autoComplete="off"
        style={input}
      />

      {/* The view's ONE live region — every outcome and refusal lands here. No echo: a bilingual
          announcement says everything twice, and <Chrome>/<OutageText> mark their own Burmese, so
          the region itself carries no `lang`. */}
      <p role="status" style={msg ? (msg.ok ? okLine : errLine) : srOnly}>
        {msg === null ? (
          ""
        ) : msg.kind === "server" ? (
          // ⚠️ INERT TODAY, and saying so is the point. `<OutageText>` swaps exactly one sentence —
          // `STAFF_WRITE_OUTAGE` — and BOTH producers of this arm pass their own outage copy to the
          // gate (`staffGate("manager", PRICE_OUTAGE)` and `staffGate("server", AVAILABILITY_OUTAGE)`),
          // so nothing here can ever match and every server sentence on this screen stays English in
          // both tongues. It is kept rather than removed because it costs nothing and becomes live
          // the moment either module drops its custom copy — but a mechanism that cannot fail must
          // not be mistaken for the conversion. The twins those two constants need are OPEN-ITEMS P2i.
          <OutageText lang={lang} error={msg.error} />
        ) : msg.kind === "plain" ? (
          <Chrome lang={lang} k={msg.k} />
        ) : msg.kind === "dish" ? (
          <Chrome lang={lang} k={msg.k} vars={{ x: msg.x }} />
        ) : (
          <Chrome lang={lang} k="browse.price.live.saved" vars={{ x: msg.x, m: msg.m }} />
        )}
      </p>

      {/* The list's name follows the PAGE's heading, which is role-conditional: a server is shown
          "Menu availability" and is deliberately not offered the price editor. */}
      <ul
        role="list"
        aria-label={sx(
          lang,
          canEditPrice ? "browse.price.a11y.list" : "browse.price.a11y.listAvail",
        )}
        style={list}
      >
        {shown.map((i) => {
          const open = editing === i.id;
          return (
            <li key={i.id} className="card" style={row}>
              <div style={{ minWidth: 0 }}>
                <p style={name}>
                  {i.nameEn}
                  {i.soldOut && (
                    <span style={soldOutTag}>
                      {/* The leading " · " lives INSIDE the value, the way `kds.held` carries its
                          own separator — a joiner spliced in here would be authored text in a
                          language nobody chose. No echo: this is a badge on a row. */}
                      {i.soldOutAt ? (
                        <Chrome
                          lang={lang}
                          k="browse.price.soldOutSince"
                          vars={{ t: clock(i.soldOutAt) }}
                        />
                      ) : (
                        <Chrome lang={lang} k="browse.price.soldOut" />
                      )}
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
                    disabled={flipping.has(i.id)}
                    onClick={() => void toggleSoldOut(i)}
                    // The visible label is one verb; the accessible name has to say WHICH dish,
                    // because every row in this list carries the same one. TWO whole al() calls
                    // rather than one with a computed key: rule 3c can only find a string LITERAL
                    // verb, and it is that literal which ties this name to the label rendered
                    // below it — the two halves become one edit.
                    aria-label={
                      i.soldOut
                        ? al(lang, {
                            kind: "verb",
                            verb: "browse.price.verb.putBack",
                            subject: i.nameEn,
                          }).aria
                        : al(lang, {
                            kind: "verb",
                            verb: "browse.price.verb.eightySix",
                            subject: i.nameEn,
                          }).aria
                    }
                  >
                    {/* echo="inline": the 86 control is named in <Chrome>'s echo policy, and a
                        stacked pair on every row would grow the row's height fifty times over. */}
                    {flipping.has(i.id) ? (
                      "…"
                    ) : i.soldOut ? (
                      <Chrome lang={lang} k="browse.price.verb.putBack" echo="inline" />
                    ) : (
                      <Chrome lang={lang} k="browse.price.verb.eightySix" echo="inline" />
                    )}
                  </button>
                  {canEditPrice && (
                    <button
                      type="button"
                      style={ghostBtn}
                      onClick={() => openEdit(i)}
                      // "Edit" reads the same on every row, so the name says which dish. This
                      // replaces an sr-only English tail — a hand-built name no guard could see.
                      aria-label={
                        al(lang, {
                          kind: "verb",
                          verb: "browse.price.verb.edit",
                          subject: i.nameEn,
                        }).aria
                      }
                    >
                      <Chrome lang={lang} k="browse.price.verb.edit" echo="inline" />
                    </button>
                  )}
                </div>
              ) : confirming && current ? (
                <div
                  ref={confirmRef}
                  tabIndex={-1}
                  role="group"
                  aria-label={
                    al(lang, {
                      kind: "verb",
                      verb: "browse.price.verb.confirm",
                      subject: current.nameEn,
                    }).aria
                  }
                  style={confirmCard}
                >
                  {/* The group's name LEADS with this exact key, so the words are on the screen
                      rather than in an sr-only span: WCAG 2.5.3 containment holds because a person
                      can read the label the group announces, in whichever language is on. */}
                  <p style={confirmLead}>
                    <Chrome lang={lang} k="browse.price.verb.confirm" echo="stack" />
                  </p>
                  <p style={confirmQ}>
                    {/* Both amounts ride slots — {old} is what the screen shows now, {m} what the
                        next tap sets. Preformatted by `dollars()`, Latin in both tongues, and
                        <Chrome> marks each one lang="en" so neither can break mid-amount inside a
                        Burmese run. Nothing here recomputes a price. */}
                    <Chrome
                      lang={lang}
                      k="browse.price.confirmQ"
                      vars={{
                        x: current.nameEn,
                        old: dollars(current.priceCents),
                        m: dollars(draftCents),
                      }}
                      echo="stack"
                    />
                  </p>
                  <p style={confirmDetail}>
                    <Chrome lang={lang} k="browse.price.confirmDetail" echo="stack" />
                  </p>
                  <div style={{ display: "flex", gap: "var(--s2)" }}>
                    <button
                      type="button"
                      style={cancelBtn}
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      <Chrome
                        lang={lang}
                        k="browse.price.keep"
                        vars={{ m: dollars(current.priceCents) }}
                        echo="stack"
                      />
                    </button>
                    <button type="button" style={proceedBtn} disabled={busy} onClick={save}>
                      {/* Both states echo, so the button cannot change height mid-save. The busy
                          key declares no {m} slot, so the var is simply unused there. */}
                      <Chrome
                        lang={lang}
                        k={busy ? "browse.price.saving" : "browse.price.set"}
                        vars={{ m: dollars(draftCents) }}
                        echo="stack"
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
                  <span aria-hidden="true" style={{ color: "var(--t2)" }}>
                    $
                  </span>
                  <label htmlFor={`mp-${i.id}`} style={srOnly}>
                    {/* Never seen on screen, so no echo — but it carries the dish, and sx() takes
                        no vars, so it is <Chrome> rather than an aria-only lookup. */}
                    <Chrome lang={lang} k="browse.price.a11y.newPrice" vars={{ x: i.nameEn }} />
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
                    <Chrome lang={lang} k="browse.price.verb.cancel" echo="inline" />
                  </button>
                  <button
                    ref={saveRef}
                    type="button"
                    style={validDraft ? saveBtn : saveBtnOff}
                    disabled={!validDraft}
                    onClick={() => setConfirming(true)}
                  >
                    <Chrome lang={lang} k="browse.price.verb.save" echo="inline" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && (
        <p style={cat}>
          <Chrome lang={lang} k="browse.price.noMatch" vars={{ x: q.trim() }} echo="stack" />
        </p>
      )}
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
/** The confirm group's visible lead. No `letter-spacing` — tracking a Burmese run separates a
 *  syllable from its own diacritics, which is the defect rule 5 of check-staff-lang.mjs exists for. */
const confirmLead: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  color: "var(--t2)",
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
