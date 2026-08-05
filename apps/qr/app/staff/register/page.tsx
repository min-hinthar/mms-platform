import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { getRegisterQueue } from "@/lib/register";
import { RegisterStart } from "@/components/staff/RegisterStart";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Register — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The FOH register (W6a — closes K6): walk-up and phone orders finally have a way to exist. Counter
 * home for any staff role — start an order, resume an open one. Counter (`reg-`) sessions live here,
 * deliberately OFF the floor board. Day cash summary lands in W6a·3.
 */
export default async function RegisterPage() {
  const caller = await requireStaffPage("server");
  if (!caller) return <StaffOutageShell what="the register" />;

  const queue = await getRegisterQueue();

  return (
    <main style={wrap}>
      <Link href="/staff" style={back}>
        <span aria-hidden>←</span> Floor
      </Link>
      <h1 style={h1}>Register</h1>
      <p style={sub}>Walk-up and phone orders, entered here and paid at the counter.</p>

      <RegisterStart />

      <h2 style={h2}>Open counter orders</h2>
      {!queue.ok ? (
        <p style={mut}>Couldn’t load the counter queue — check the connection and refresh.</p>
      ) : queue.rows.length === 0 ? (
        <p style={mut}>None right now.</p>
      ) : (
        <ul role="list" style={list} aria-label="Open counter orders">
          {queue.rows.map((r) => (
            <li key={r.sessionId}>
              <Link
                href={`/staff/table/${r.sessionId}/add`}
                style={rowCard}
                aria-label={`Resume ${r.customerName ?? "walk-up"} — ${r.itemCount} item${r.itemCount === 1 ? "" : "s"}`}
              >
                <span style={rowName}>{r.customerName ?? "Walk-up"}</span>
                <span style={rowMeta}>
                  {r.itemCount} item{r.itemCount === 1 ? "" : "s"} · $
                  {(r.subtotalCents / 100).toFixed(2)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "var(--s5) var(--s4) var(--s8)",
};
const back: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--ac-strong)",
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--s1)",
};
const h1: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h1)",
  margin: "var(--s2) 0 0",
};
const sub: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "var(--s1) 0 var(--s5)" };
const h2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h3)",
  margin: "var(--s6) 0 var(--s3)",
};
const mut: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)" };
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "var(--s2)",
};
const rowCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--s3)",
  minHeight: 56,
  padding: "var(--s2) var(--s4)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  textDecoration: "none",
};
const rowName: CSSProperties = { fontWeight: 700, fontSize: "var(--fs-body)" };
const rowMeta: CSSProperties = { color: "var(--t2)", fontSize: "var(--fs-sm)" };
