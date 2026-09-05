"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { provisionStaff, setStaffActive } from "@/lib/staff-actions";
import type { StaffRole, StaffRow } from "@/lib/staff";
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
 * labels, the role options, the submit button, the "(you)" / "Inactive" tags) is still English and
 * is tracked under OPEN-ITEMS P2c. The two are separable because a hand-written English aria-label
 * is the thing that BREAKS when the visible label turns Burmese — an English label beside an English
 * name is merely unconverted.
 */
export function TeamManager({
  initial,
  selfUid,
  selfEmail,
}: {
  initial: StaffRow[];
  selfUid: string;
  selfEmail: string | null;
}) {
  const router = useRouter();
  const lang = useStaffLang();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("server");
  const [busy, setBusy] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  // A DISCRIMINATED UNION, not `{ ok: boolean; text: string }`: the success half is a dictionary key
  // rendered through <Chrome>, so there is no success STRING left to hold — and keeping a dead one
  // would invite the next reader to feed it to <OutageText>, which passes anything without an
  // authored twin through as English forever while looking converted.
  const [msg, setMsg] = useState<{ ok: true } | { ok: false; text: string } | null>(null);

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
    setMsg({ ok: true });
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
              <option value="server">Server</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
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
              <Chrome lang={lang} k="floor.team.added" echo={false} />
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
              {isSelf ? (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--t3)" }} aria-hidden>
                  —
                </span>
              ) : (
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
                          verb: "floor.verb.deactivate",
                          subject: row.displayName,
                        }).aria
                      : al(lang, {
                          kind: "verb",
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
