"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { provisionStaff, setStaffActive, setStaffRole } from "@/lib/staff-actions";
import type { StaffRow } from "@/lib/staff";
// The ladder comes from the PLAIN module: importing a value from "@/lib/staff" would pull the
// service-role client into this client bundle (it reaches authz → staff-lock → @mms/db/server).
import { canActOn, ROLE_ORDER, type StaffRole } from "@/lib/staff-roles";
import { RoleBadge } from "./RoleBadge";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome, OutageText } from "./Chrome";
import { al, sx } from "@/lib/staff-labels";

/**
 * Owner team management (S1.1a). Renders the roster from the SERVER prop (no local mirror — every
 * mutation revalidates the page and router.refresh() pulls fresh state, so the list can't drift),
 * plus the add-staff form. Authority is server-side (requireStaff('owner') in every action); this is
 * the affordance + honest success/error feedback, never the gate.
 *
 * P2 SCOPE, stated so the next reader does not mistake it for a finished conversion: this file's
 * ARIA and its ONE live region are localized; the form's own visible copy (the heading, three field
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
  initial: StaffRow[];
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
  const [busy, setBusy] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  // Separate from `pendingUid` so a role <select> busy on one row does not also grey the
  // deactivate button beside it — two independent writes, two independent pending states.
  const [rolePendingUid, setRolePendingUid] = useState<string | null>(null);
  // A DISCRIMINATED UNION, not `{ ok: boolean; text: string }`: the success half is a dictionary key
  // rendered through <Chrome>, so there is no success STRING left to hold — and keeping a dead one
  // would invite the next reader to feed it to <OutageText>, which passes anything without an
  // authored twin through as English forever while looking converted.
  const [msg, setMsg] = useState<
    | { ok: true; k: "floor.team.added" | "floor.team.roleChanged" }
    | { ok: false; text: string }
    | null
  >(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await provisionStaff({ email: email.trim(), displayName: name.trim(), role });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setEmail("");
    setName("");
    setRole("server");
    setMsg({ ok: true, k: "floor.team.added" });
    router.refresh();
  }

  async function changeRole(row: StaffRow, next: StaffRole) {
    if (next === row.role) return;
    setRolePendingUid(row.userId);
    setMsg(null);
    const res = await setStaffRole({ userId: row.userId, role: next });
    setRolePendingUid(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      // The <select> is CONTROLLED by `row.role` (server state), so a refused change snaps back to
      // the stored role on its own — no local mirror to unwind, and the console never shows a role
      // nobody saved.
      return;
    }
    setMsg({ ok: true, k: "floor.team.roleChanged" });
    router.refresh();
  }

  async function toggleActive(row: StaffRow) {
    setPendingUid(row.userId);
    setMsg(null);
    const res = await setStaffActive({ userId: row.userId, active: !row.active });
    setPendingUid(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={add} className="card" style={formCard} aria-labelledby="add-staff-h">
        <h2 id="add-staff-h" style={{ fontSize: "var(--fs-body)", margin: "0 0 var(--s4)" }}>
          Add a staff member
        </h2>
        <div style={{ display: "grid", gap: "var(--s4)" }}>
          <div>
            <label htmlFor="ts-name" style={label}>
              Name
            </label>
            <input
              id="ts-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={80}
              placeholder="Daw Hla"
              style={input}
            />
          </div>
          <div>
            <label htmlFor="ts-email" style={label}>
              Email (their sign-in)
            </label>
            <input
              id="ts-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              placeholder="hla@mandalaymorningstar.com"
              style={input}
            />
          </div>
          <div>
            <label htmlFor="ts-role" style={label}>
              Role
            </label>
            <select
              id="ts-role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              style={input}
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
          <button
            type="submit"
            disabled={busy || name.trim().length < 1 || email.trim().length < 3}
            style={primaryBtn}
          >
            {busy ? "Adding…" : "Add staff"}
          </button>
        </div>
      </form>

      {/* One live region for both add + toggle feedback (QA §A: a single region per view).
          BRANCHED ON `msg.ok`, never wrapped wholesale: <OutageText> swaps the ONE server sentence
          that has an authored Burmese twin and passes everything else through verbatim, so handing
          it an authored success literal would ship English forever while looking converted.
          echo={false} on both arms — this is a live region (a bilingual announcement says
          everything twice) and its `minHeight: 20` is a measured height a stacked pair would break. */}
      <p role="status" style={{ minHeight: 20, margin: "var(--s4) 0" }}>
        {msg &&
          (msg.ok ? (
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--ok)" }}>
              <Chrome lang={lang} k={msg.k} echo={false} />
            </span>
          ) : (
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>
              <OutageText lang={lang} error={msg.text} />
            </span>
          ))}
      </p>

      <ul role="list" aria-label={sx(lang, "floor.team.a11y.roster")} style={list}>
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
              className="card"
              style={{ ...rowCard, opacity: row.active ? 1 : 0.6 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--fs-body)" }}>
                    {row.displayName}
                  </span>
                  <RoleBadge role={row.role} />
                  {isSelf && (
                    <span style={{ fontSize: "var(--fs-sm)", color: "var(--t2)" }}>(you)</span>
                  )}
                  {!row.active && (
                    <span style={{ fontSize: "var(--fs-sm)", color: "var(--warn)" }}>Inactive</span>
                  )}
                </div>
                {row.email && (
                  <div
                    style={{
                      fontSize: "var(--fs-sm)",
                      color: "var(--t2)",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.email}
                  </div>
                )}
              </div>
              {!reachable ? (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--t3)" }} aria-hidden>
                  —
                </span>
              ) : (
                <div style={rowControls}>
                  {/* A6 — the role control. A <select> rather than a promote/demote pair because the
                      ladder has three rungs and a pair of verbs cannot express "server → owner" in
                      one move. CONTROLLED by the server's `row.role`: a refused change snaps back on
                      its own, so the console never displays a role nobody stored. The options are
                      capped at `grantable`, and `row.role` is always in it — `reachable` proved the
                      caller can act on it — so the current value is never missing from its own menu. */}
                  <select
                    value={row.role}
                    onChange={(e) => changeRole(row, e.target.value as StaffRole)}
                    disabled={rolePendingUid === row.userId}
                    aria-busy={rolePendingUid === row.userId}
                    // Named per MEMBER: without the name, every row's control announces the bare
                    // word "Role" and a screen-reader user cannot tell whose they are changing.
                    aria-label={`${sx(lang, "floor.team.a11y.role")} — ${row.displayName}`}
                    style={roleSelect}
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
                    disabled={pendingUid === row.userId}
                    aria-busy={pendingUid === row.userId}
                    // Stable, member-specific name so two "Deactivate" buttons aren't identical to a
                    // screen reader.
                    //
                    // ⚠️ THE PENDING STATE IS NOT FED INTO al(). The visible label collapses to "…"
                    // mid-request; the NAME must not, or the control a screen-reader user just took
                    // hold of renames itself under them and the row loses its only identifying word.
                    // `al()` reads `row.active` alone, so the name is stable across the flip.
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
                    style={row.active ? deactivateBtn : reactivateBtn}
                  >
                    {/* The SAME keys the name is built from, so 2.5.3 containment holds by
                      construction. echo="inline" rather than "stack": this is a 44px pill in a flex
                      row beside the member's name, and a stacked pair would push every row taller. */}
                    {pendingUid === row.userId ? (
                      "…"
                    ) : row.active ? (
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
    </div>
  );
}

const formCard: CSSProperties = { padding: "var(--s5)" };
const label: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: "var(--fs-body)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
};
const primaryBtn: CSSProperties = {
  minHeight: 48,
  border: "none",
  borderRadius: "var(--r-full)",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
};
const rowCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  padding: "var(--s4) var(--s5)",
};
/** A6 — the row's control pair. `flexShrink: 0` matches the toggle beside it so a long display name
 *  compresses the NAME column (which already ellipsises) rather than squeezing a 44px target below
 *  its minimum; `gap` keeps the two apart on a tablet held one-handed. */
const rowControls: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--s3)",
  flexShrink: 0,
};
/** The role <select>. 44px like every other staff target (QA §A); tokens, never a hardcoded colour. */
const roleSelect: CSSProperties = {
  minHeight: 44,
  padding: "0 10px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
};
const baseToggle: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};
const deactivateBtn: CSSProperties = {
  ...baseToggle,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
};
const reactivateBtn: CSSProperties = {
  ...baseToggle,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--ac)",
};
