"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { provisionStaff, setStaffActive } from "@/lib/staff-actions";
import type { StaffRole, StaffRow } from "@/lib/staff";
import { RoleBadge } from "./RoleBadge";

/**
 * Owner team management (S1.1a). Renders the roster from the SERVER prop (no local mirror — every
 * mutation revalidates the page and router.refresh() pulls fresh state, so the list can't drift),
 * plus the add-staff form. Authority is server-side (requireStaff('owner') in every action); this is
 * the affordance + honest success/error feedback, never the gate.
 */
export function TeamManager({ initial, selfUid }: { initial: StaffRow[]; selfUid: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("server");
  const [busy, setBusy] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    setMsg({ ok: true, text: "Added — they can now sign in with a one-time code." });
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
        <h2 id="add-staff-h" style={{ fontSize: 16, margin: "0 0 var(--s4)" }}>
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

      {/* One live region for both add + toggle feedback (QA §A: a single region per view). */}
      <p role="status" aria-live="polite" style={{ minHeight: 20, margin: "var(--s4) 0" }}>
        {msg && (
          <span style={{ fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--warn)" }}>
            {msg.text}
          </span>
        )}
      </p>

      <ul role="list" aria-label="Staff" style={list}>
        {initial.map((row) => {
          const isSelf = row.userId === selfUid;
          return (
            <li
              key={row.userId}
              className="card"
              style={{ ...rowCard, opacity: row.active ? 1 : 0.6 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{row.displayName}</span>
                  <RoleBadge role={row.role} />
                  {isSelf && <span style={{ fontSize: 12, color: "var(--t2)" }}>(you)</span>}
                  {!row.active && (
                    <span style={{ fontSize: 12, color: "var(--warn)" }}>Inactive</span>
                  )}
                </div>
              </div>
              {isSelf ? (
                <span style={{ fontSize: 12, color: "var(--t3)" }} aria-hidden>
                  —
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleActive(row)}
                  disabled={pendingUid === row.userId}
                  aria-busy={pendingUid === row.userId}
                  // Stable, member-specific name so two "Deactivate" buttons aren't identical to a
                  // screen reader (the visible label can shrink to "…" mid-request).
                  aria-label={`${row.active ? "Deactivate" : "Reactivate"} ${row.displayName}`}
                  style={row.active ? deactivateBtn : reactivateBtn}
                >
                  {pendingUid === row.userId ? "…" : row.active ? "Deactivate" : "Reactivate"}
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
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--tx)",
};
const input: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: 16,
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
  fontSize: 15,
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
  fontSize: 13,
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
