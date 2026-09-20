"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@mms/db/bounds";
import { setMenuPrice } from "@/lib/menu-price";
import { setItemSoldOut } from "@/lib/menu-availability";
import { draftCents, priceDraftVerdict } from "@/lib/menu-price-draft";
import { browseRows } from "@/lib/menu-browse";
import { soldOutSinceParts } from "@/lib/sold-out-since";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome, OutageText } from "./Chrome";
import { al, sx } from "@/lib/staff-labels";
import { localizeCount } from "@/lib/i18n/fill";

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
 * P2 — what the view's ONE live region has to say, WHO authored it, and (menu-2) WHICH ROW it is
 * about, so the same words can be echoed where the eye already is.
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
type Msg = { id: string } &
  // A sentence the Server Action returned.
  (| { ok: false; kind: "server"; error: string }
    // A key with no slots.
    | { ok: false; kind: "plain"; k: "browse.price.err.saveUnknown" }
    // A key whose only slot is the dish.
    | {
        ok: boolean;
        kind: "dish";
        k: "browse.price.err.flipUnknown" | "browse.price.live.off" | "browse.price.live.on";
        x: string;
      }
    // The save confirmation — the dish, and the amount it now rings at.
    | { ok: true; kind: "saved"; x: string; m: string }
  );

/** menu-3 — a value the SERVER confirmed, held until the list prop agrees (the refresh landed). */
type Confirmed = { soldOut?: boolean; priceCents?: number };

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
 *
 * Slice 6 (menu-1 · 2 · 3 · 4 · 5) — what changed about the feedback loop, in the audit's words:
 *  - §17: no control here goes native `disabled` after a tap. The 86 pill, Keep, Set and Save are
 *    `aria-disabled` with the handler refusing re-entry on a REF (a render-lagged flag cannot gate a
 *    double tap), so focus stays where the thumb is and a refused tap keeps its name.
 *  - The ONE live region stays sr-only for good (no srOnly→visible swap, no layout shift above a
 *    115-row list) and the same words are ECHOED, `aria-hidden`, inside the row they concern.
 *  - The 86 and the price are recorded the moment the server confirms them (`confirmed`), so the
 *    row shows the new verb and the new amount before `router.refresh()` lands — a second tap in
 *    that window used to post a stale `expectedSoldOut` and be refused. The prop remains the truth:
 *    a refusal changes nothing (revert-to-confirmed IS the prop), and the override is dropped the
 *    moment the prop agrees.
 *  - A draft that cannot be saved says why, beside the field (`priceDraftVerdict`), and Return
 *    opens the confirm the way the Save tap does.
 */
export function MenuPriceEditor({
  items,
  canEditPrice,
  nowIso,
}: {
  items: PricedItem[];
  /** W23a (Codex P2) — a SERVER reaches this page for the 86 control alone. The price editor is
   *  manager-only and `setMenuPrice` re-checks that server-side; hiding the Edit button is what
   *  keeps the screen from offering an action the authority would refuse. It is also the ONLY door
   *  into the edit form (`openEdit` has no other caller), so withholding it withholds the form. */
  canEditPrice: boolean;
  /** menu-4 — the request's clock, from the page: the server render and the hydrating client must
   *  agree on which stamps are from another service day, and a client `new Date()` at render would
   *  not. Re-read on every refresh (the page is `force-dynamic`). */
  nowIso: string;
}) {
  // P2 — the device language, from app/staff/layout.tsx (one cookie read, one provider).
  const lang = useStaffLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  // The row being edited, and its typed dollars. One row at a time: a bulk grid of live price inputs
  // invites a mis-tab into the wrong dish, and there is no undo on a price.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Mirrors `busy` synchronously — the re-entry guard `save()` reads (§17, StaffPromoControl). */
  const busyRef = useRef(false);
  // W23a — the ids whose 86 is in flight, so only those rows' controls dim (a page-wide busy flag
  // would freeze every row while one cook flips one dish). A SET, not one id: two taps in quick
  // succession are ordinary during a rush, and a single slot would let the first flip's completion
  // re-enable the second row's button while that flip was still in the air. The REF is the guard
  // (`aria-disabled` does not block a click); the state is what the row renders.
  const [flipping, setFlipping] = useState<ReadonlySet<string>>(() => new Set());
  const flippingRef = useRef(new Set<string>());
  // ONE live region for this view (QA §A) — outcomes and refusals both ride it.
  const [msg, setMsg] = useState<Msg | null>(null);
  // menu-3 — the server's confirmed values, per row, until the list prop catches up.
  const [confirmed, setConfirmed] = useState<ReadonlyMap<string, Confirmed>>(() => new Map());

  // Drop an override the moment the prop agrees with it — the refresh landed and the list is the
  // truth again — and keep it while the prop still lags (a refresh requested by an EARLIER action
  // can land before this one's write is readable). Reconciled DURING the render that first sees a
  // new `items` array (React's "adjust state from a prop change" shape, one re-render, no effect),
  // and spent for good once dropped: a value another tablet moves later never wakes it again.
  const [seenItems, setSeenItems] = useState(items);
  if (items !== seenItems) {
    setSeenItems(items);
    if (confirmed.size > 0) {
      const next = new Map<string, Confirmed>();
      for (const [id, c] of confirmed) {
        const live = items.find((i) => i.id === id);
        if (!live) continue;
        const rest: Confirmed = {};
        if (c.soldOut !== undefined && c.soldOut !== live.soldOut) rest.soldOut = c.soldOut;
        if (c.priceCents !== undefined && c.priceCents !== live.priceCents)
          rest.priceCents = c.priceCents;
        if (Object.keys(rest).length > 0) next.set(id, rest);
      }
      setConfirmed(next);
    }
  }

  function record(id: string, c: Confirmed) {
    setConfirmed((prev) => new Map(prev).set(id, { ...prev.get(id), ...c }));
  }

  // The rows as the screen KNOWS them: the prop, with every server-confirmed value laid over it.
  const rows = useMemo(
    () =>
      items.map((i) => {
        const c = confirmed.get(i.id);
        const soldOut = c?.soldOut ?? i.soldOut;
        return {
          ...i,
          soldOut,
          priceCents: c?.priceCents ?? i.priceCents,
          // The stamp is the SERVER's and arrives with the refresh: a flag confirmed here but not
          // yet in the prop shows the bare "sold out" until then, never a stamp for the wrong flag.
          soldOutAt: soldOut && i.soldOut ? i.soldOutAt : null,
        };
      }),
    [items, confirmed],
  );

  // W23a — the 86 toggle. ONE tap in both directions, deliberately: this is the control the cook
  // reaches for with their hands full at the moment the pan comes up empty, and a confirm step is
  // exactly the friction that makes people skip it and let the orders keep coming. It is also cheap
  // to undo — unlike a price, which every future guest pays and which keeps its two-step confirm
  // right below. The ledger is what keeps a one-tap control accountable.
  async function toggleSoldOut(i: (typeof rows)[number]) {
    // §17 — the guard is the REF: `aria-disabled` keeps the pill in the focus order and does not
    // block the click, so the second tap of a bounce lands here and is refused.
    if (flippingRef.current.has(i.id)) return;
    flippingRef.current.add(i.id);
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
        // `i.soldOut` is the CONFIRMED value when one is held, so a second flip inside the refresh
        // window posts what the server itself just answered, not the stale prop (menu-3).
        expectedSoldOut: i.soldOut,
      });
      // Recorded BEFORE the pill re-enables (the `finally` below): the row must never be tappable
      // while still wearing the verb the server just answered against.
      if (r.ok) record(i.id, { soldOut: r.soldOut });
    } catch {
      setMsg({ id: i.id, ok: false, kind: "dish", k: "browse.price.err.flipUnknown", x: i.nameEn });
      // The list is the only honest account of what landed; the toggle's own state is a guess.
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
      // Codex P2 on #193, same rule as the price refusal: a concurrency refusal means this screen is
      // stale, and without a refresh the row keeps feeding the SAME stale `expectedSoldOut` forever —
      // so every retry fails identically and the cook cannot get the dish off the menu at all.
      router.refresh();
      return;
    }
    setMsg({
      id: i.id,
      ok: true,
      kind: "dish",
      k: r.soldOut ? "browse.price.live.off" : "browse.price.live.on",
      x: i.nameEn,
    });
    router.refresh();
  }

  const soldOutCount = rows.reduce((n, r) => n + (r.soldOut ? 1 : 0), 0);
  // The chip is a filter over rows that EXIST: with nothing off the menu it has nothing to show, so
  // a pressed chip whose count fell to zero (the last dish put back) lets go on its own.
  const filterSoldOut = soldOutOnly && soldOutCount > 0;
  const shown = useMemo(() => browseRows(rows, q, filterSoldOut), [rows, q, filterSoldOut]);

  const current = rows.find((i) => i.id === editing) ?? null;
  // menu-5 — the verdict on the typed dollars, decided in lib, said beside the field.
  const verdict = current ? priceDraftVerdict(draft, current.priceCents) : "empty";
  const validDraft = verdict === "ok";
  const cents = draftCents(draft);

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

  function toConfirm() {
    if (!validDraft) return; // §17 — a refused Save keeps its focus and its stated reason
    setConfirming(true);
  }

  /** Return in the price field does what the Save tap does — the tablet keyboard's Done key. */
  function onDraftKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    toConfirm();
  }

  async function save() {
    if (!current || !validDraft) return;
    if (busyRef.current) return; // §17 — the second tap of a bounce, refused on the ref
    busyRef.current = true;
    setBusy(true);
    // W21d (Codex P2 on #180) — a rejected Server Action promise (dead radio, 5xx transport) used
    // to skip setBusy(false) entirely: both confirm buttons stuck on "Saving…" forever. The
    // finally re-enables; the catch reports the honest ambiguity (the write may or may not have
    // landed — the list refresh shows the truth).
    let res: Awaited<ReturnType<typeof setMenuPrice>>;
    try {
      res = await setMenuPrice({
        menuItemId: current.id,
        priceCents: cents,
        // W21d (Codex P1 on #180) — the price this screen SHOWED; the server refuses if it moved.
        expectedPriceCents: current.priceCents,
      });
      // The server's amount is a CONFIRMED value — recorded before the buttons re-enable, so the
      // row rings the new price the instant the answer lands (menu-3).
      if (res.ok) record(current.id, { priceCents: res.priceCents });
    } catch {
      setMsg({ id: current.id, ok: false, kind: "plain", k: "browse.price.err.saveUnknown" });
      setConfirming(false);
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    setConfirming(false);
    if (!res.ok) {
      // The row stays open with the typed value intact — a refusal should not also cost the manager
      // their input.
      setMsg({ id: current.id, ok: false, kind: "server", error: res.error });
      // W21d (Codex P2 on #193) — refresh the LIST on a refusal: the concurrency refusal tells the
      // manager to "check the new price and try again", but the stale `items` prop would keep
      // feeding the same stale expectedPriceCents forever. The edit row's own client state
      // (editing/draft) survives a router.refresh, so nothing typed is lost.
      router.refresh();
      return;
    }
    setMsg({
      id: current.id,
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

  /** The words the live region says and the acted row echoes — ONE rendering, used twice. */
  function msgNode(m: Msg): ReactNode {
    return m.kind === "server" ? (
      // ⚠️ INERT TODAY, and saying so is the point. `<OutageText>` swaps exactly one sentence —
      // `STAFF_WRITE_OUTAGE` — and BOTH producers of this arm pass their own outage copy to the
      // gate (`staffGate("manager", PRICE_OUTAGE)` and `staffGate("server", AVAILABILITY_OUTAGE)`),
      // so nothing here can ever match and every server sentence on this screen stays English in
      // both tongues. It is kept rather than removed because it costs nothing and becomes live
      // the moment either module drops its custom copy — but a mechanism that cannot fail must
      // not be mistaken for the conversion. The twins those two constants need are OPEN-ITEMS P2i.
      <OutageText lang={lang} error={m.error} />
    ) : m.kind === "plain" ? (
      <Chrome lang={lang} k={m.k} />
    ) : m.kind === "dish" ? (
      <Chrome lang={lang} k={m.k} vars={{ x: m.x }} />
    ) : (
      <Chrome lang={lang} k="browse.price.live.saved" vars={{ x: m.x, m: m.m }} />
    );
  }

  const hintKey =
    verdict === "below"
      ? "browse.price.draft.below"
      : verdict === "above"
        ? "browse.price.draft.above"
        : verdict === "nan"
          ? "browse.price.draft.nan"
          : verdict === "unchanged"
            ? "browse.price.draft.unchanged"
            : null;

  return (
    <div>
      <label htmlFor="mp-search" style={label}>
        <Chrome lang={lang} k="browse.price.find" echo="stack" />
      </label>
      <div style={searchRow}>
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
        {soldOutCount > 0 && (
          // The lit-gold cap is the ONE selection vocabulary (`.staff-chip[aria-pressed="true"]`,
          // manager-7): pressed, the list narrows to what is off the menu — the flags the lead copy
          // tells a server to watch for, findable without reading 115 rows top to bottom.
          <button
            type="button"
            className="staff-chip staff-press"
            aria-pressed={filterSoldOut}
            onClick={() => setSoldOutOnly((v) => !v)}
          >
            <Chrome
              lang={lang}
              k="browse.price.soldOutOnly"
              vars={{ n: localizeCount(soldOutCount, lang) }}
            />
          </button>
        )}
      </div>

      {/* The view's ONE live region — every outcome and refusal lands here, and it stays sr-only
          for good (menu-2): a region that grew from 1px to a line above a 115-row list shifted the
          whole list under the thumb, and was off-screen for any row past the first viewport. The
          same words are echoed inside the row they concern. No echo of the tongue: a bilingual
          announcement says everything twice, and <Chrome>/<OutageText> mark their own Burmese, so
          the region itself carries no `lang`. */}
      <p role="status" style={srOnly}>
        {msg === null ? "" : msgNode(msg)}
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
          const inFlight = flipping.has(i.id);
          const since = i.soldOutAt ? soldOutSinceParts(i.soldOutAt, nowIso) : null;
          return (
            <li key={i.id} className="card" style={row}>
              <div style={{ minWidth: 0 }}>
                <p style={name}>
                  {i.nameEn}
                  {i.soldOut && (
                    // menu-4 — a stamp from another service day carries its day AND wears the warn
                    // ink: the one signal a manual 86 has outlived its shift, pre-attentive.
                    <span style={since && !since.sameDay ? soldOutTagOld : soldOutTag}>
                      {/* The leading " · " lives INSIDE the value, the way `kds.held` carries its
                          own separator — a joiner spliced in here would be authored text in a
                          language nobody chose. No echo: this is a badge on a row. */}
                      {since ? (
                        <Chrome lang={lang} k="browse.price.soldOutSince" vars={{ t: since.t }} />
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
                    className="staff-btn staff-press"
                    style={i.soldOut ? restoreBtn : eightySixBtn}
                    aria-disabled={inFlight || undefined}
                    aria-busy={inFlight || undefined}
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
                            echo: "inline",
                            verb: "browse.price.verb.putBack",
                            subject: i.nameEn,
                          }).aria
                        : al(lang, {
                            kind: "verb",
                            echo: "inline",
                            verb: "browse.price.verb.eightySix",
                            subject: i.nameEn,
                          }).aria
                    }
                  >
                    {/* echo="inline": the 86 control is named in <Chrome>'s echo policy, and a
                        stacked pair on every row would grow the row's height fifty times over. */}
                    {inFlight ? (
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
                      className="staff-btn staff-press"
                      style={ghostBtn}
                      onClick={() => openEdit(i)}
                      // "Edit" reads the same on every row, so the name says which dish. This
                      // replaces an sr-only English tail — a hand-built name no guard could see.
                      aria-label={
                        al(lang, {
                          kind: "verb",
                          echo: "inline",
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
                      echo: "stack",
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
                        m: dollars(cents),
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
                      className="staff-btn staff-press"
                      style={cancelBtn}
                      aria-disabled={busy || undefined}
                      onClick={() => {
                        if (busyRef.current) return;
                        setConfirming(false);
                      }}
                    >
                      <Chrome
                        lang={lang}
                        k="browse.price.keep"
                        vars={{ m: dollars(current.priceCents) }}
                        echo="stack"
                      />
                    </button>
                    <button
                      type="button"
                      className="staff-btn staff-press"
                      style={proceedBtn}
                      aria-disabled={busy || undefined}
                      aria-busy={busy || undefined}
                      onClick={() => void save()}
                    >
                      {/* Both states echo, so the button cannot change height mid-save. The busy
                          key declares no {m} slot, so the var is simply unused there. */}
                      <Chrome
                        lang={lang}
                        k={busy ? "browse.price.saving" : "browse.price.set"}
                        vars={{ m: dollars(cents) }}
                        echo="stack"
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={editWrap}>
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
                      onKeyDown={onDraftKey}
                      // `decimal` gives the numeric pad WITH a decimal point on the tablet the console
                      // runs on; `numeric` would hide it and make $14.50 untypeable.
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      aria-invalid={hintKey !== null || undefined}
                      aria-describedby={hintKey ? `mp-hint-${i.id}` : undefined}
                      style={priceInput}
                    />
                    <button
                      type="button"
                      className="staff-btn staff-press"
                      style={ghostBtn}
                      onClick={closeEdit}
                    >
                      <Chrome lang={lang} k="browse.price.verb.cancel" echo="inline" />
                    </button>
                    <button
                      ref={saveRef}
                      type="button"
                      className="staff-btn staff-press"
                      style={saveBtn}
                      // §17 — stated, never native: the reason is the hint line the field describes
                      // itself by, and a refused tap keeps focus where the thumb is.
                      aria-disabled={!validDraft || undefined}
                      onClick={toConfirm}
                    >
                      <Chrome lang={lang} k="browse.price.verb.save" echo="inline" />
                    </button>
                  </div>
                  {hintKey && (
                    // menu-5 — WHY Save is refused. `{m}` is the bound the write enforces, or the
                    // shape a malformed draft should take; Latin in both tongues.
                    <p id={`mp-hint-${i.id}`} style={hintLine}>
                      <Chrome
                        lang={lang}
                        k={hintKey}
                        vars={{
                          m:
                            hintKey === "browse.price.draft.below"
                              ? dollars(PRICE_MIN_CENTS)
                              : hintKey === "browse.price.draft.above"
                                ? dollars(PRICE_MAX_CENTS)
                                : hintKey === "browse.price.draft.nan"
                                  ? "14.50"
                                  : dollars(i.priceCents),
                        }}
                        echo="stack"
                      />
                    </p>
                  )}
                </div>
              )}
              {msg !== null && msg.id === i.id && (
                // menu-2 — the verdict where the eye already is: the same words the sr-only region
                // announced, echoed `aria-hidden` inside the row that changed (or refused).
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
/** menu-4 — a flag from another service day: the warn ink, pre-attentive across the list. */
const soldOutTagOld: CSSProperties = { color: "var(--warn)", fontWeight: 600 };
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
const priceInput: CSSProperties = { ...input, flex: "none", width: 96, textAlign: "right" };
const editWrap: CSSProperties = { display: "grid", gap: "var(--s2)" };
const hintLine: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  color: "var(--warn)",
};
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
/** The row's echo of the live region's words — a full-width line under the row's controls. */
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
