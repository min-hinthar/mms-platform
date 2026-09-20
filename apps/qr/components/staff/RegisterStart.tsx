"use client";
import { useRef, useState, useTransition, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { openRegisterOrder } from "@/lib/register";
import { haptic } from "@/lib/haptics";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome, OutageText } from "./Chrome";
import { ts, type StaffKey } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { sx } from "@/lib/staff-labels";
import { START_ARM } from "./register-stage";

/**
 * P2 — what the zone has to say, and who authored it.
 *
 * `openRegisterOrder` answers with a SERVER string (`STAFF_WRITE_OUTAGE` on the transport arm, a
 * gate sentence otherwise), which only `<OutageText>` may render: it swaps the one sentence that has
 * an authored twin and passes every other through verbatim, because a sentence with no twin is
 * better shown in English than guessed at in Burmese.
 *
 * The table arm ALSO raises one failure of its own, before any server call — and blanket-wrapping
 * the region in `<OutageText>` would pass that client literal through as English forever while
 * looking converted. So the region carries the branch instead: a `local` notice is a dictionary key
 * rendered through `<Chrome>`; a `server` notice is the string, rendered through `<OutageText>`.
 */
type Notice = { kind: "local"; k: StaffKey } | { kind: "server"; error: string };

type Arm = "none" | "phone" | "table";
type MintKind = "walkup" | "phone" | "table";

/**
 * The register's Start zone (W6a) — Walk-up · Phone order · Start a table. Each arm mints server-side
 * (staff-gated service-role; never /api/session) and lands on the existing drill-down order screen.
 * One busy state for the whole zone: a counter mints one order at a time, and a double-tap minting two
 * sessions is worse than a beat of waiting.
 *
 * counter-3 (§17) — busy is `aria-disabled` on every control in the zone (one mint at a time IS the
 * zone's rule) and `aria-busy` on the ONE control that is minting, never native `disabled`: a
 * natively disabled button drops focus to `<body>` mid-tap, so a REFUSED mint used to leave focus
 * nowhere and the notice unread. The attribute is decorative, so the refusal lives in the handlers,
 * on the same predicate. The tapped control keeps its label AND its focus through the round trip;
 * the `<p role="status">` announces the refusal on its own (focusing a live region on top of that
 * would double the announcement, and a refusal is none of §7's focus-move cases). The blind pass
 * caught the first draft stamping `aria-busy` on Walk-up and both Go buttons whenever ANYTHING
 * minted — assistive tech told Walk-up was updating while the phone form was — so WHICH control
 * minted is recorded (`minting`), and the Go button's "Going…" reads only on the form that went.
 *
 * A LANDED mint never releases the lock: the order screen replaces this one, and a second tap in the
 * beat between the push and the route swap must not mint a second session. Only a refusal or a
 * throw re-arms the zone.
 */
export function RegisterStart({
  labelledBy,
}: {
  /** A4·2 — on the counter's one screen the zone's visible heading names the region; without it
   *  (nothing renders it that way today) the region names itself with the same words, aria-only. */
  labelledBy?: string;
}) {
  const lang = useStaffLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Two taps in one frame both read `pending === false` — the transition has not committed yet —
  // so the guard that stops the second MINT is a ref written synchronously (the doors' shape,
  // `StaffDoors.tsx`); `minting` is the same fact as STATE, what the controls SAY one render later —
  // the two are written together and cleared together, one predicate with a synchronous twin.
  const inFlight = useRef<MintKind | null>(null);
  const [minting, setMinting] = useState<MintKind | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [phoneName, setPhoneName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [arm, setArm] = useState<Arm>("none");
  // Read at TAP time, never at render: a render-time constant is the same stale `false` for every
  // tap of one frame (the suite's two-taps case reddened on exactly that draft).
  const isBusy = () => pending || inFlight.current !== null;
  // What the controls say: the zone is held while a mint is in flight OR has landed (see above).
  const held = pending || minting !== null;

  /** counter-5 — opening an arm is a PICK. The other arm's notice leaves with it (a table-number
   *  refusal must not sit under the phone form), and the revealed input takes focus: the form
   *  mounts fresh per arm, so `autoFocus` runs inside the tap's own flush and iOS raises the
   *  keyboard. CLOSING an arm unmounts the form that holds focus — and WebKit does not focus a
   *  tapped button — so the arm takes focus back itself, or the §17 drop to `<body>` returns by
   *  another door. Refused while a mint is in flight, like every other control in the zone. */
  function toggle(next: Exclude<Arm, "none">, e: MouseEvent<HTMLButtonElement>) {
    if (isBusy()) return;
    haptic("pick");
    setNotice(null);
    if (arm === next) {
      setArm("none");
      e.currentTarget.focus();
    } else {
      setArm(next);
    }
  }

  function mint(input: { kind: MintKind; tableNumber?: number; customerName?: string }) {
    if (isBusy()) return;
    inFlight.current = input.kind;
    setMinting(input.kind);
    setNotice(null);
    // A mint is a COMMIT (W22c): the press is its visible half, the order screen the outcome.
    haptic("commit");
    startTransition(async () => {
      let landed = false;
      try {
        const r = await openRegisterOrder(input);
        if (!r.ok) {
          setNotice({ kind: "server", error: r.error });
          return;
        }
        router.push(`/staff/table/${r.sessionId}/add`);
        landed = true;
      } finally {
        // Re-armed on a refusal or a throw only. A landed mint keeps the zone held until the route
        // swap unmounts it (docblock) — releasing here re-armed Walk-up for the beat of the swap.
        if (!landed) {
          inFlight.current = null;
          setMinting(null);
        }
      }
    });
  }

  return (
    <section
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : sx(lang, "reg.a11y.start")}
      style={zone}
    >
      <div style={row}>
        <button
          type="button"
          className={`${START_ARM} staff-press`}
          aria-disabled={held || undefined}
          aria-busy={minting === "walkup" || undefined}
          onClick={() => mint({ kind: "walkup" })}
        >
          <Chrome lang={lang} k="reg.start.walkup" echo="stack" />
        </button>
        {/* `aria-expanded` is the state the arm already carries; the lit cap reads it (counter-4). */}
        <button
          type="button"
          className={`${START_ARM} staff-press`}
          aria-disabled={held || undefined}
          aria-expanded={arm === "phone"}
          onClick={(e) => toggle("phone", e)}
        >
          <Chrome lang={lang} k="reg.start.phone" echo="stack" />
        </button>
        <button
          type="button"
          className={`${START_ARM} staff-press`}
          aria-disabled={held || undefined}
          aria-expanded={arm === "table"}
          onClick={(e) => toggle("table", e)}
        >
          <Chrome lang={lang} k="reg.start.table" echo="stack" />
        </button>
      </div>

      {arm === "phone" && (
        <form
          style={subForm}
          onSubmit={(e) => {
            e.preventDefault();
            mint({ kind: "phone", customerName: phoneName.trim() || undefined });
          }}
        >
          <label style={label} htmlFor="reg-phone-name">
            <Chrome lang={lang} k="reg.phone.label" echo="stack" />
          </label>
          <div style={row}>
            <input
              id="reg-phone-name"
              style={input}
              value={phoneName}
              maxLength={40}
              autoComplete="off"
              autoFocus
              enterKeyHint="go"
              onChange={(e) => setPhoneName(e.target.value)}
              // A placeholder is a flat attribute — it carries no markup and so no `lang`, the same
              // trade-off an accessible name makes (lib/staff-labels.ts). The visible <label> above
              // is the marked one.
              placeholder={ts(lang, "reg.phone.placeholder")}
            />
            {/* Both states echo, so the button cannot change height mid-transition; "Going…" reads
                only on the form that went — a walk-up mint leaves this label alone. */}
            <button
              type="submit"
              className="staff-btn"
              style={goBtn}
              aria-disabled={held || undefined}
              aria-busy={minting === "phone" || undefined}
            >
              <Chrome lang={lang} k={minting === "phone" ? "reg.going" : "reg.go"} echo="stack" />
            </button>
          </div>
        </form>
      )}

      {arm === "table" && (
        <form
          style={subForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (isBusy()) return;
            const n = Number.parseInt(tableNumber, 10);
            if (!Number.isInteger(n) || n < 1) {
              setNotice({ kind: "local", k: "reg.err.table" });
              return;
            }
            mint({ kind: "table", tableNumber: n });
          }}
        >
          <label style={label} htmlFor="reg-table-number">
            <Chrome lang={lang} k="reg.table.label" echo="stack" />
          </label>
          <div style={row}>
            <input
              id="reg-table-number"
              style={input}
              value={tableNumber}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              autoComplete="off"
              autoFocus
              enterKeyHint="go"
              onChange={(e) => setTableNumber(e.target.value.replace(/\D/g, ""))}
              // The example number rides an `{id}` slot: it is an identifier, Latin in both tongues,
              // and no dictionary VALUE may carry a digit of either script.
              placeholder={tf(lang, "reg.table.placeholder", { id: EXAMPLE_TABLE })}
            />
            <button
              type="submit"
              className="staff-btn"
              style={goBtn}
              aria-disabled={held || undefined}
              aria-busy={minting === "table" || undefined}
            >
              <Chrome lang={lang} k={minting === "table" ? "reg.going" : "reg.go"} echo="stack" />
            </button>
          </div>
        </form>
      )}

      {/* The zone's ONE live region — mint failures land here (outage copy included). No echo: a
          bilingual announcement says everything twice, and <Chrome>/<OutageText> mark their own
          Burmese, so the region itself carries no `lang`. */}
      <p role="status" style={notice ? errText : srOnly}>
        {notice === null ? (
          ""
        ) : notice.kind === "local" ? (
          <Chrome lang={lang} k={notice.k} />
        ) : (
          <OutageText lang={lang} error={notice.error} />
        )}
      </p>
    </section>
  );
}

/** The table number the placeholder shows as an example. Latin in both tongues. */
const EXAMPLE_TABLE = 4;

const zone: CSSProperties = { display: "grid", gap: "var(--s3)" };
const row: CSSProperties = { display: "flex", gap: "var(--s3)", flexWrap: "wrap" };
// The three arms are `.staff-arm` (`register-stage.ts` names it; `globals.css` draws it) — the help
// card wears the same class.
const subForm: CSSProperties = { display: "grid", gap: "var(--s2)" };
const label: CSSProperties = { fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--t2)" };
const input: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  flex: "1 1 160px",
};
const goBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s5)",
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const errText: CSSProperties = { color: "var(--warn)", fontSize: "var(--fs-sm)", margin: 0 };
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
