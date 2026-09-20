"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { provisionStaff, setStaffActive, setStaffRole } from "@/lib/staff-actions";
import type { StaffRow } from "@/lib/staff";
// The ladder comes from the PLAIN module: importing a value from "@/lib/staff" would pull the
// service-role client into this client bundle (it reaches authz → staff-lock → @mms/db/server).
import { canActOn, ROLE_ORDER, type StaffRole } from "@/lib/staff-roles";
import { RoleBadge } from "./RoleBadge";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";
import { MsgText, type StaffMsg } from "./StaffMsg";
import { useViewStatus } from "./ViewStatus";
import { useZoneFocus } from "./ZoneFocus";
import { al, sx } from "@/lib/staff-labels";
// A rejected Server Action means the request never completed, which IS the outage sentence — and it
// is the one string <OutageText> has an authored Burmese twin for, so a hand-written apology here
// would ship English forever while looking converted.
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

/**
 * Team management (S1.1a), MANAGER and above since A6. Renders the roster from the SERVER prop (no
 * local mirror — every mutation revalidates the page and router.refresh() pulls fresh state, so the
 * list can't drift), plus the add-staff form. Authority is server-side — a `manager` FLOOR plus the
 * `canActOn` CEILING in every action — and this is the affordance + honest success/error feedback,
 * never the gate. The role menus and the per-row controls read that same `canActOn`, so an option
 * shown here is one the action will accept.
 *
 * signin-2 · signin-4 (§17) — NOTHING HERE IS NATIVELY `disabled`. The submit, the role select and
 * the toggle were the roster's three native sites (K35): a control disabled the instant it is
 * tapped drops focus to <body> in a real browser, so its busy name is spoken from nowhere. Each is
 * `aria-disabled` while a write is held, `aria-busy` when it is the one acting, and its handler
 * refuses re-entry on a REF read at tap time (LEARNINGS #126). The two refusals the form can
 * explain itself — no name, no address — are SAID in the live region with focus moved to the field,
 * where the old submit greyed and explained nothing (and a disabled default button blocks Enter
 * too). The roster's line is the VIEW's region when a `ViewStatusProvider` sits above (the sign-in
 * screen mounts one for this card and the PIN card), shown here as an aria-hidden echo; mounted
 * alone it keeps a region of its own. The fields read `--fs-field` (M78's floor: the 13px role
 * select zoomed a manager's phone and never zoomed back), and an inactive member is marked by INK
 * on the name and the address — never by dimming the whole row, which put the Reactivate control a
 * manager needs below AA on exactly the row they need to read.
 *
 * P2 SCOPE, stated so the next reader does not mistake it for a finished conversion: this file's
 * ARIA and its live line are localized; the form's own visible copy (the heading, three field
 * labels, the role options, the submit button, the "(you)" / "Inactive" tags) and the per-row
 * `<RoleBadge>` label are still English, and are tracked under OPEN-ITEMS **P2m**. The two halves
 * are separable because a hand-written English aria-label is the thing that BREAKS when the visible
 * label turns Burmese — an English label beside an English name is merely unconverted.
 *
 * ⚠️ THAT ROW NUMBER IS LOAD-BEARING. It read P2c until an audit followed it: P2c CLOSED with this
 * slice, and its closure names `FloorDetailLive`, `StaffModSheet` and the thirteen pages — never
 * this file. A deferral that points at a closed row is a deferral tracked nowhere.
 */
/** A6 — the roles this caller may grant, high to low. Derived from the SAME `canActOn` the server
 *  refuses with, so the menu and the authority cannot disagree: an option that appears here is one
 *  the action will accept, and one that does not appear is one it would refuse. */
const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  server: "Server",
};

export function TeamManager({
  initial,
  selfUid,
  selfEmail,
  callerRole,
}: {
  /** The roster, or `null` when its read failed — the zone then prints one honest line (A4·4). */
  initial: StaffRow[] | null;
  selfUid: string;
  selfEmail: string | null;
  callerRole: StaffRole;
}) {
  const grantable = ROLE_ORDER.filter((r) => canActOn(callerRole, r));
  const router = useRouter();
  const lang = useStaffLang();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("server");
  // §17 — every in-flight guard is a REF read at TAP time (a render-time flag is stale for a second
  // tap in the same frame); the state beside each exists only to say `aria-disabled` / `aria-busy`
  // on the control it concerns. ONE write of each kind at a time: a role change while another is
  // held is refused (the controlled <select> snaps back to the stored role), and every role select
  // says so with `aria-disabled` while the acting one is `aria-busy`. Toggles likewise.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  // Separate from `pendingUid` so a role <select> busy on one row does not also grey the
  // deactivate button beside it — two independent writes, two independent pending states.
  const rolePendingRef = useRef<string | null>(null);
  const [rolePendingUid, setRolePendingUid] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // A dictionary key for what this file authored (the two refusals, the two successes) and the
  // server's sentence for what it did not — <MsgText> swaps the ONE server sentence that has an
  // authored Burmese twin and passes anything else through verbatim.
  const [msg, setMsg] = useState<{ ok: boolean; m: StaffMsg } | null>(null);
  // The view's announcer when a provider sits above this zone, null when the zone is alone. `say`
  // is the ONE writer: the visible line always, the spoken one through the provider when there is one.
  const announce = useViewStatus();
  const say = (next: { ok: boolean; m: StaffMsg } | null) => {
    setMsg(next);
    announce?.(next ? <MsgText lang={lang} msg={next.m} /> : null);
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return; // re-entry refused HERE, never by `disabled` (§17)
    say(null);
    // signin-2 — the two refusals the form can explain itself are SAID, with focus on the field at
    // fault. The old submit greyed on a short name or address, which explained nothing.
    if (name.trim().length < 1) {
      say({ ok: false, m: { k: "floor.team.err.name" } });
      nameRef.current?.focus();
      return;
    }
    // The address's SHAPE too, by the platform's own `type="email"` grammar (constraint validation
    // still computes `validity` under `noValidate`; only the browser's bubble is off): a malformed
    // address used to be stopped by that bubble, and letting it reach the server would come back as
    // the server's English sentence under the Burmese switch (blind pass, CRITICAL). The server's
    // zod `.email()` is the stricter rule and stays the backstop for the rare address the two
    // grammars disagree on — that sentence is P2m's, not this file's.
    if (email.trim().length < 3 || emailRef.current?.validity.valid === false) {
      say({ ok: false, m: { k: "floor.team.err.email" } });
      emailRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    // ⚠️ EVERY WRITE HERE CLEARS ITS PENDING STATE IN `finally`, and none of the three did before
    // Codex found it on this PR. A Server Action's promise REJECTS on a lost connection, a
    // transport failure or an uncaught server exception — none of which produce an `{ ok: false }`
    // to fall through to — so the clear never ran, the control stayed busy until a reload, and the
    // rejection went unhandled with nothing on screen to explain it.
    try {
      const res = await provisionStaff({ email: email.trim(), displayName: name.trim(), role });
      if (!res.ok) {
        say({ ok: false, m: res.error });
        return;
      }
      setEmail("");
      setName("");
      setRole("server");
      say({ ok: true, m: { k: "floor.team.added" } });
      router.refresh();
    } catch {
      say({ ok: false, m: STAFF_WRITE_OUTAGE });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function changeRole(row: StaffRow, next: StaffRole) {
    if (next === row.role) return;
    if (rolePendingRef.current) return; // a role write is held — refused here, never by `disabled`
    rolePendingRef.current = row.userId;
    setRolePendingUid(row.userId);
    say(null);
    try {
      const res = await setStaffRole({ userId: row.userId, role: next });
      if (!res.ok) {
        say({ ok: false, m: res.error });
        // The <select> is CONTROLLED by `row.role` (server state), so a refused change snaps back
        // to the stored role on its own — no local mirror to unwind, and the console never shows a
        // role nobody saved. That holds for the throw below too.
        return;
      }
      say({ ok: true, m: { k: "floor.team.roleChanged" } });
      router.refresh();
    } catch {
      say({ ok: false, m: STAFF_WRITE_OUTAGE });
    } finally {
      rolePendingRef.current = null;
      setRolePendingUid(null);
    }
  }

  async function toggleActive(row: StaffRow) {
    if (pendingRef.current) return; // a toggle is held — refused here, never by `disabled`
    pendingRef.current = row.userId;
    setPendingUid(row.userId);
    say(null);
    try {
      const res = await setStaffActive({ userId: row.userId, active: !row.active });
      if (!res.ok) {
        say({ ok: false, m: res.error });
        return;
      }
      router.refresh();
    } catch {
      say({ ok: false, m: STAFF_WRITE_OUTAGE });
    } finally {
      pendingRef.current = null;
      setPendingUid(null);
    }
  }

  // A4·4 — the roster is a ZONE of the sign-in screen and `/staff/team` redirects onto its
  // fragment; the heading takes focus on arrival and on a same-page jump (`useZoneFocus`, the one
  // copy of the A4·3 rule since A4·5).
  useZoneFocus("team-h");

  const roleHeld = rolePendingUid !== null;
  const toggleHeld = pendingUid !== null;

  return (
    <section className="staff-zone" aria-labelledby="team-h">
      {/* echo={false}: this heading IS the zone's accessible name (aria-labelledby reads the
          element's full text; an echo would name the region in both scripts at once). */}
      <h2 id="team-h" tabIndex={-1} className="staff-zone-head">
        <Chrome lang={lang} k="floor.team.title" />
      </h2>
      {initial === null ? (
        // W10b — a failed read must not render as an EMPTY roster; nor may it take the sign-in
        // screen's own card down with it (the old page threw to the error boundary, which was the
        // whole page there). One line, and the form withheld: adding to a roster you cannot see
        // is how a name gets entered twice.
        <p className="team-sub">
          <Chrome lang={lang} k="floor.team.outage" echo="stack" />
        </p>
      ) : (
        <>
          <p className="team-sub">
            <Chrome lang={lang} k="floor.team.sub" echo="stack" />
          </p>
          {/* noValidate: the browser's own bubble would pre-empt the said refusal above, in the
              browser's language, with focus it moves itself. The fields stay `required` for what
              they ARE (spoken as such) and `type="email"` for its grammar, which the handler reads
              off `validity`; the handler decides what is said. */}
          <form onSubmit={add} noValidate className="card team-form" aria-labelledby="add-staff-h">
            <h2 id="add-staff-h" className="team-form-h">
              Add a staff member
            </h2>
            <div className="team-fields">
              <div>
                <label htmlFor="ts-name" className="team-label">
                  Name
                </label>
                <input
                  ref={nameRef}
                  id="ts-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  placeholder="Daw Hla"
                  className="team-field"
                />
              </div>
              <div>
                <label htmlFor="ts-email" className="team-label">
                  Email (their sign-in)
                </label>
                <input
                  ref={emailRef}
                  id="ts-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  placeholder="hla@mandalaymorningstar.com"
                  className="team-field"
                />
              </div>
              <div>
                <label htmlFor="ts-role" className="team-label">
                  Role
                </label>
                <select
                  id="ts-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="team-field"
                >
                  {grantable
                    .slice()
                    .reverse()
                    .map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                </select>
              </div>
              {/* The entry card's primary pill (the same control the PIN form submits with), busy
                  by attribute: the person keeps their place while the region speaks. */}
              <button
                type="submit"
                className="entry-primary staff-press"
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
              >
                {busy ? "Adding…" : "Add staff"}
              </button>
            </div>
          </form>

          {/* The zone's line: the VIEW's region speaks it when a provider is mounted (this is then
              the aria-hidden echo, where the eye is); this <p> is the region itself otherwise.
              No echo inside: a bilingual announcement says everything twice. */}
          <p
            className={msg && !msg.ok ? "entry-msg entry-msg-warn team-msg" : "entry-msg team-msg"}
            role={announce ? undefined : "status"}
            aria-hidden={announce ? true : undefined}
          >
            {msg && <MsgText lang={lang} msg={msg.m} />}
          </p>

          <ul role="list" aria-label={sx(lang, "floor.team.a11y.roster")} className="team-list">
            {initial.map((row) => {
              // Match by uid OR email — a Google/magic-link session uid can differ from the uid stamped on
              // the row, so email is the reliable "this is me" signal (mirrors the server self-guard).
              const isSelf =
                row.userId === selfUid ||
                (!!row.email && !!selfEmail && row.email.toLowerCase() === selfEmail.toLowerCase());
              // A6 — a row this caller cannot reach carries NO controls, rather than controls that
              // answer "only the owner can": a manager sees the owner's row and their own as read-only.
              // The same predicate the server refuses with, so the two cannot drift.
              const reachable = !isSelf && canActOn(callerRole, row.role);
              return (
                <li
                  key={row.userId}
                  className="card team-row"
                  data-inactive={row.active ? undefined : "true"}
                >
                  <div className="team-row-main">
                    <div className="team-row-head">
                      <span id={`team-name-${row.userId}`} className="team-name">
                        {row.displayName}
                      </span>
                      <RoleBadge role={row.role} />
                      {isSelf && <span className="team-tag">(you)</span>}
                      {!row.active && <span className="team-tag team-tag-warn">Inactive</span>}
                    </div>
                    {row.email && <div className="team-email">{row.email}</div>}
                  </div>
                  {!reachable ? (
                    <span className="team-none" aria-hidden>
                      —
                    </span>
                  ) : (
                    <div className="team-controls">
                      {/* A6 — the role control. A <select> rather than a promote/demote pair because the
                      ladder has three rungs and a pair of verbs cannot express "server → owner" in
                      one move. CONTROLLED by the server's `row.role`: a refused change snaps back on
                      its own, so the console never displays a role nobody stored. The options are
                      capped at `grantable`, and `row.role` is always in it — `reachable` proved the
                      caller can act on it — so the current value is never missing from its own menu. */}
                      <select
                        value={row.role}
                        onChange={(e) => changeRole(row, e.target.value as StaffRole)}
                        aria-disabled={roleHeld || undefined}
                        aria-busy={rolePendingUid === row.userId || undefined}
                        // ⚠️ LABELLED BY THE MEMBER'S OWN VISIBLE NAME, not by an `aria-label`. Two
                        // reasons, and the second is the one that matters. (a) Without the member, every
                        // row's control announces the same bare word and a screen-reader user cannot
                        // tell whose role they are changing. (b) `sx()` here was a REAL violation, not a
                        // guard false-positive: rule 3 forbids the aria-only form on a control that has
                        // visible text, because it bypasses the {visible, aria} pair — and a `<select>`
                        // has visible text, its selected option. Pointing at text already on screen
                        // gives a genuine label instead of a parallel one only some users hear, and the
                        // role name stays the control's VALUE, which is what a listener needs anyway.
                        aria-labelledby={`team-name-${row.userId}`}
                        className="team-role"
                      >
                        {grantable.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        aria-disabled={toggleHeld || undefined}
                        aria-busy={pendingUid === row.userId || undefined}
                        // Stable, member-specific name so two "Deactivate" buttons aren't identical to a
                        // screen reader. `al()` reads `row.active` alone, so the name is stable across
                        // the flip — and since signin-2 the LABEL is too: busy is the attribute and the
                        // dim, never the "…" that used to replace the word mid-request (§17).
                        //
                        // A TERNARY OVER TWO WHOLE al() CALLS, not one call with a computed `verb:` — the
                        // key has to stay a string literal or rule 3c cannot check that the button RENDERS
                        // the same key it announces, which is the whole of WCAG 2.5.3 here.
                        aria-label={
                          row.active
                            ? al(lang, {
                                kind: "verb",
                                echo: "inline",
                                verb: "floor.verb.deactivate",
                                subject: row.displayName,
                              }).aria
                            : al(lang, {
                                kind: "verb",
                                echo: "inline",
                                verb: "floor.verb.reactivate",
                                subject: row.displayName,
                              }).aria
                        }
                        className={
                          row.active
                            ? "team-toggle team-toggle-warn staff-press"
                            : "team-toggle team-toggle-ok staff-press"
                        }
                      >
                        {/* The SAME keys the name is built from, so 2.5.3 containment holds by
                      construction. echo="inline" rather than "stack": this is a 44px pill in a flex
                      row beside the member's name, and a stacked pair would push every row taller. */}
                        {row.active ? (
                          <Chrome lang={lang} k="floor.verb.deactivate" echo="inline" />
                        ) : (
                          <Chrome lang={lang} k="floor.verb.reactivate" echo="inline" />
                        )}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
