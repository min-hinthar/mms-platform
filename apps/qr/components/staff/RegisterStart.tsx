"use client";
import { useState, type CSSProperties, type MouseEvent } from "react";
import { Button } from "@mms/ui";
import { haptic } from "@/lib/haptics";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { MsgText } from "./StaffMsg";
import { ts } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { useCounterMint, type MintInput, type MintNotice } from "./CounterMint";
import { START_ARM, START_GRID } from "./register-stage";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";
import { useReloadHold } from "./useReloadHold";
import { draftHeld } from "@/lib/reload-guard";

type Arm = "none" | "phone";

/**
 * The register's Start zone (W6a) — Walk-up · Phone order. Each mints server-side (staff-gated
 * service-role; never /api/session) and lands on the order screen. Phase 2d · floor: starting a
 * TABLE moved to the floor's strip (one tap on a free table, owner decision 5c), and the zone reads
 * the screen's ONE mint lock (`useCounterMint`, `CounterMint.tsx`) instead of holding its own — so a
 * Walk-up tap and a table tap in the same frame start one order, not two.
 *
 * counter-3 (§17) — busy is `aria-disabled` on every mint control on the screen (one start at a time
 * IS the counter's rule) and `aria-busy` on the ONE control that is minting, never native
 * `disabled`: a natively disabled button drops focus to `<body>` mid-tap, so a REFUSED mint used to
 * leave focus nowhere and the notice unread. The tapped control keeps its label AND its focus through
 * the round trip; the `<p role="status">` announces the refusal on its own (focusing a live region on
 * top of that would double the announcement, and a refusal is none of §7's focus-move cases).
 *
 * Walk-up is the zone's ONE primary (the primitive Button at `xl`); while the Phone form is open its
 * Go button is the primary and Walk-up steps down to secondary, so the zone never shows two.
 *
 * Phase 2h (S2 critic D1) — a start of THIS zone still unanswered past the bound (`waiting`) says
 * "no answer yet … reload the page" in the region, and the console is installed standalone (no
 * browser reload): the reload sits BESIDE the region, never inside it, until the late answer lands.
 */
export function RegisterStart({
  labelledBy,
}: {
  /** A4·2 — on the counter's one screen the zone's visible heading names the region; without it
   *  (nothing renders it that way today) the region names itself with the same words, aria-only. */
  labelledBy?: string;
}) {
  const lang = useStaffLang();
  const { minting, held, startHeld, waiting, isBusy, run } = useCounterMint();
  const [notice, setNotice] = useState<MintNotice | null>(null);
  const [phoneName, setPhoneName] = useState("");
  const [arm, setArm] = useState<Arm>("none");
  // Codex r2 on #311 — a phone order's name typed and not started holds a reload for a new version
  // while its form is open, focused or not.
  useReloadHold("unsent", "draft", "phoneName", arm === "phone" && draftHeld(phoneName, ""));

  /** counter-5 — opening the arm is a PICK. A notice leaves with it, and the revealed input takes
   *  focus: the form mounts fresh, so `autoFocus` runs inside the tap's own flush and iOS raises the
   *  keyboard. CLOSING the arm unmounts the form that holds focus — and WebKit does not focus a
   *  tapped button — so the arm takes focus back itself, or the §17 drop to `<body>` returns by
   *  another door. Refused while a mint is in flight, like every other control on the screen. */
  function toggle(e: MouseEvent<HTMLButtonElement>) {
    if (isBusy()) return;
    haptic("pick");
    // Phase 2h review c (C3) — never while a start still waits: the zone's notice is then "no
    // answer yet — the order may still start. Don't start it again", still true, and the one reason
    // the starts are dimmed beside the reload. Its late answer (or the reload) retires it.
    if (waiting === null) setNotice(null);
    if (arm === "phone") {
      setArm("none");
      e.currentTarget.focus();
    } else {
      setArm("phone");
    }
  }

  /** The screen's lock alone admits a start; a refused tap changes nothing, a start clears the
   *  zone's last notice (its own refusal, if any, arrives later). */
  function mint(id: "walkup" | "phone", input: MintInput) {
    run(id, input, {
      onStart: () => setNotice(null),
      onRefusal: setNotice,
      // A late start that landed: "no answer yet" is no longer true (one start at a time — the
      // zone's notice can only be that start's).
      onResolved: () => setNotice(null),
    });
  }

  return (
    <section
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : sx(lang, "reg.a11y.start")}
      style={zone}
    >
      <div className={START_GRID}>
        <Button
          variant={arm === "none" ? "primary" : "secondary"}
          size="xl"
          block
          disabled={startHeld}
          busy={minting === "walkup"}
          onClick={() => mint("walkup", { kind: "walkup" })}
        >
          <Chrome lang={lang} k="reg.start.walkup" echo="stack" />
        </Button>
        {/* `aria-expanded` is the state the arm already carries; the lit cap reads it (counter-4). */}
        <button
          type="button"
          className={`${START_ARM} staff-press`}
          aria-disabled={held || undefined}
          aria-expanded={arm === "phone"}
          onClick={toggle}
        >
          <Chrome lang={lang} k="reg.start.phone" echo="stack" />
        </button>
      </div>

      {arm === "phone" && (
        <form
          style={subForm}
          onSubmit={(e) => {
            e.preventDefault();
            mint("phone", { kind: "phone", customerName: phoneName.trim() || undefined });
          }}
        >
          <label style={label} htmlFor="reg-phone-name">
            <Chrome lang={lang} k="reg.phone.label" echo="stack" />
          </label>
          <div style={row}>
            <input
              id="reg-phone-name"
              className="ui-field-control"
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
            {/* Both states echo, so the button cannot change height mid-transition; "Starting…"
                reads only on the form that went — a walk-up mint leaves this label alone. The
                primitive refuses a held tap itself (and preventDefaults the implicit submit an
                Enter synthesises); `mint`'s tap-time guard stays behind it. */}
            <Button
              type="submit"
              variant="primary"
              size="xl"
              disabled={startHeld}
              busy={minting === "phone"}
              busyLabel={<Chrome lang={lang} k="reg.going" echo="stack" />}
            >
              <Chrome lang={lang} k="reg.go" echo="stack" />
            </Button>
          </div>
        </form>
      )}

      {/* The zone's ONE live region — mint refusals land here (outage copy included). No echo: a
          bilingual announcement says everything twice, and <MsgText> marks its own Burmese, so the
          region itself carries no `lang`. */}
      <p role="status" style={notice ? errText : srOnly}>
        {notice === null ? "" : <MsgText lang={lang} msg={notice} />}
      </p>
      {(waiting === "walkup" || waiting === "phone") && <ReloadButton lang={lang} />}
    </section>
  );
}

const zone: CSSProperties = { display: "grid", gap: "var(--s3)" };
// The row stretches, so the Go button and the field share one height.
const row: CSSProperties = {
  display: "flex",
  gap: "var(--s3)",
  flexWrap: "wrap",
  alignItems: "stretch",
};
const subForm: CSSProperties = { display: "grid", gap: "var(--s2)" };
const label: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--t2)",
};
const input: CSSProperties = { flex: "1 1 160px", width: "auto" };
const errText: CSSProperties = { color: "var(--warn)", fontSize: "var(--fs-sm)", margin: 0 };
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
