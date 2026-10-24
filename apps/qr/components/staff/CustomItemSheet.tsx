"use client";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Sheet } from "@mms/ui";
import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@mms/db/bounds";
import { staffAddCustomItem, type StaffWriteResult } from "@/lib/staff-cart";
import { boundWrite, stalledSince, tapRefusal } from "@/lib/bounded-write";
import { draftCents, priceDraftVerdict } from "@/lib/menu-price-draft";
import { addAttemptOutcome, heldAfter, keyForAttempt, type HeldAddKey } from "@/lib/staff-add-key";
import { dollars } from "@/lib/receipt-view";
import type { StaffKey } from "@/lib/i18n/staff";
import { sheetCloseLabel } from "./SheetCloseLabel";
import { useResaid } from "./useResaid";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";

/** The pad's failure codes → its shipped add sentences (`pad.err.add.*`, each naming the dish). */
const FAILURE_KEY: Partial<
  Record<NonNullable<Extract<StaffWriteResult, { ok: false }>["code"]>, StaffKey>
> = {
  paying: "pad.err.add.paying",
  closed: "pad.err.add.closed",
  "no-cart": "pad.err.add.closed",
  outage: "pad.err.add.outage",
  unconfirmed: "pad.err.add.unconfirmed",
};

const NAME_MAX = 60;

/**
 * A CUSTOM item (owner, 2026-10-24: "manual new item add to tables orders") — the pad's sheet for a
 * dish or charge that is not on the menu: its name, its price, how many and an optional kitchen note.
 * Manager-and-up (the action re-checks it; the pad only offers the chip to a manager).
 *
 * Every refusal is a stated sentence in the ONE region (§17: the Add key is aria-disabled, never
 * native, and a tap on it says what is missing). The price field reads the menu editor's own rule
 * (`priceDraftVerdict`, the schema's bounds), so the sheet never offers a figure the write refuses.
 * An add whose answer was LOST keeps its key (`addKey`), so Add again is the same add — idempotent on
 * the scan-event ledger — and can never ring the item twice; only a landed or definite refusal mints
 * a new one. While the write is out the sheet is `busy` (no dismissal drops its answer), freed at the
 * bound (`boundWrite`).
 */
export function CustomItemSheet({
  open,
  sessionId,
  onClose,
  onAdded,
}: {
  open: boolean;
  sessionId: string;
  onClose: () => void;
  /** A landed add: the pad re-reads the order and says it in its own region. */
  onAdded: (name: string) => void;
}) {
  const lang = useStaffLang();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<StaffMsg | null>(null);
  const [tried, setTried] = useState(false);
  const inFlight = useRef(false);
  // The key held for a retry, bound to the payload it was minted for (`staff-add-key.ts`): a retry of
  // the SAME add resends it, and an edited name, price, quantity or note is a new add with a new key —
  // never swallowed by the ledger as a duplicate of the first (Codex round 1 on #373).
  const held = useRef<HeldAddKey>(null);
  const said = useResaid(msg);

  const trimmed = name.replace(/\s+/g, " ").trim();
  const verdict = priceDraftVerdict(price, -1);
  const cents = verdict === "ok" ? draftCents(price) : null;
  const nameOk = trimmed.length > 0;
  const ready = nameOk && cents !== null && !busy;
  const example = dollars(1200);
  const priceHint: StaffMsg | null =
    verdict === "ok" || (!tried && verdict === "empty")
      ? null
      : verdict === "below"
        ? { k: "browse.price.draft.below", vars: { m: dollars(PRICE_MIN_CENTS) } }
        : verdict === "above"
          ? { k: "browse.price.draft.above", vars: { m: dollars(PRICE_MAX_CENTS) } }
          : verdict === "empty"
            ? { k: "browse.price.draft.empty", vars: { m: example } }
            : { k: "browse.price.draft.nan", vars: { m: example } };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setTried(true);
    if (!nameOk) {
      setMsg({ k: "pad.custom.err.name" });
      document.getElementById("custom-name")?.focus();
      return;
    }
    if (cents === null) {
      setMsg(priceHint ?? { k: "browse.price.draft.empty", vars: { m: example } });
      document.getElementById("custom-price")?.focus();
      return;
    }
    const refused = tapRefusal(null, stalledSince(), "out.stalled");
    if (refused !== null) {
      setMsg({ k: refused });
      return;
    }
    const notes = note.trim() || undefined;
    const intent = JSON.stringify([trimmed, cents, qty, notes ?? null]);
    const addKey = keyForAttempt(held.current, intent, newKey);
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const out = await boundWrite(
        staffAddCustomItem({ sessionId, name: trimmed, priceCents: cents, qty, notes, addKey }),
      );
      if (out.kind === "answer") {
        const res = out.value;
        // A definite answer retires the key; an unconfirmed one keeps it for the SAME add.
        held.current = heldAfter(intent, addKey, addAttemptOutcome(res));
        if (res.ok) {
          onAdded(trimmed);
          onClose();
          return;
        }
        const k = (res.code && FAILURE_KEY[res.code]) || "pad.err.add.failed";
        setMsg(res.code === "sentence" ? res.error : { k, vars: { x: trimmed } });
        return;
      }
      // No answer, or a lost one: it may have landed — the key stays, so Add again cannot double it.
      held.current = heldAfter(intent, addKey, "unknown");
      setMsg({ k: "pad.err.add.unconfirmed", vars: { x: trimmed } });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      busy={busy}
      closeLabel={sheetCloseLabel(lang)}
      onOpenChange={(next) => !next && onClose()}
      title={<Chrome lang={lang} k="pad.custom.title" />}
    >
      <form onSubmit={submit} noValidate style={body}>
        <p style={lead}>
          <Chrome lang={lang} k="pad.custom.lead" echo="stack" />
        </p>
        <label style={lbl} htmlFor="custom-name">
          <Chrome lang={lang} k="pad.custom.name" echo="inline" />
        </label>
        <input
          id="custom-name"
          style={field}
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          enterKeyHint="next"
          aria-invalid={tried && !nameOk ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <label style={lbl} htmlFor="custom-price">
          <Chrome lang={lang} k="pad.custom.price" echo="inline" />
        </label>
        <div style={priceRow}>
          <span aria-hidden style={currency}>
            $
          </span>
          <input
            id="custom-price"
            style={{ ...field, paddingLeft: 28 }}
            value={price}
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.00"
            aria-invalid={priceHint ? true : undefined}
            aria-describedby={priceHint ? "custom-price-hint" : undefined}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
          />
        </div>
        {priceHint && (
          <p id="custom-price-hint" style={hint}>
            <MsgText lang={lang} msg={priceHint} />
          </p>
        )}
        <span style={lbl} id="custom-qty-l">
          <Chrome lang={lang} k="pad.custom.qty" echo="inline" />
        </span>
        <div role="group" aria-labelledby="custom-qty-l" style={stepper}>
          <button
            type="button"
            className="staff-btn staff-press"
            style={stepBtn}
            aria-disabled={qty <= 1 || undefined}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            <span aria-hidden>−</span>
            <span className="sr-only">
              <Chrome lang={lang} k="pad.custom.less" />
            </span>
          </button>
          <output style={qtyOut} aria-live="off">
            {qty}
          </output>
          <button
            type="button"
            className="staff-btn staff-press"
            style={stepBtn}
            aria-disabled={qty >= 9 || undefined}
            onClick={() => setQty((q) => Math.min(9, q + 1))}
          >
            <span aria-hidden>+</span>
            <span className="sr-only">
              <Chrome lang={lang} k="pad.custom.more" />
            </span>
          </button>
        </div>
        <label style={lbl} htmlFor="custom-note">
          <Chrome lang={lang} k="pad.custom.note" echo="inline" />
        </label>
        <input
          id="custom-note"
          style={field}
          value={note}
          maxLength={160}
          autoComplete="off"
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="submit"
          className="staff-btn staff-press"
          style={{ ...primaryBtn, opacity: ready ? 1 : 0.6 }}
          aria-disabled={!ready || undefined}
          aria-busy={busy || undefined}
        >
          {busy ? (
            <Chrome lang={lang} k="pad.ghost.adding" echo="inline" />
          ) : cents !== null ? (
            <Chrome
              lang={lang}
              k="pad.custom.add"
              vars={{ n: qty, m: dollars(cents * qty) }}
              echo="inline"
            />
          ) : (
            <Chrome lang={lang} k="pad.custom.addBare" echo="inline" />
          )}
        </button>
        {/* ONE live region (QA §A). */}
        <p role="status" style={region}>
          {msg && (
            <span key={said} style={{ color: "var(--warn)" }}>
              <MsgText lang={lang} msg={msg} />
            </span>
          )}
        </p>
      </form>
    </Sheet>
  );
}

function newKey(): string {
  return crypto.randomUUID();
}

const body: CSSProperties = { marginTop: "var(--s2)" };
const lead: CSSProperties = {
  margin: "0 0 var(--s2)",
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
  fontSize: "var(--fs-body)",
};
const priceRow: CSSProperties = { position: "relative" };
const currency: CSSProperties = {
  position: "absolute",
  left: "var(--s3)",
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--t2)",
  fontWeight: "var(--fw-bold)",
};
const hint: CSSProperties = {
  margin: "var(--s1) 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
const stepper: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--s2)" };
const stepBtn: CSSProperties = {
  minWidth: 48,
  minHeight: 48,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-lead)",
  fontWeight: "var(--fw-bold)",
};
const qtyOut: CSSProperties = {
  minWidth: 32,
  textAlign: "center",
  fontSize: "var(--fs-lead)",
  fontWeight: "var(--fw-heavy)",
  fontVariantNumeric: "tabular-nums",
};
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
