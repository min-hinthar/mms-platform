"use server";
import { cookies } from "next/headers";
import { staffLangInput } from "@mms/db/schemas";
import { STAFF_LANG_COOKIE, staffLangCookieOptions, type StaffLang } from "./staff-lang";

export type SetStaffLangResult = { ok: true; lang: StaffLang } | { ok: false; error: string };

/**
 * P2 — set this DEVICE's staff chrome language.
 *
 * ⚠️ DELIBERATELY UNGATED — no `staffGate`, and this is the load-bearing decision in the slice.
 *
 * `staffGate` calls `getStaffAuth`, which makes a live `supa.auth.getUser()` round trip and answers
 * `unavailable` when the platform is unreachable and "Staff sign-in required." for anyone not signed
 * in. Gating this action would therefore kill the language control on exactly the four screens where
 * it matters most:
 *
 *   1. `/staff/login` — the first screen the kitchen tablet shows, where nobody is signed in yet.
 *   2. `/staff/lock`  — the PIN screen a shared tablet sits on between shifts.
 *   3. `/board`       — the wall TV, authorized by a device token, with no staff session at all.
 *   4. `StaffOutageShell` — the full-page outage screen, i.e. precisely when auth is unreachable.
 *
 * The thing being written carries no authority: it is a two-value enum in the caller's own cookie
 * jar that decides which of two translations of the same words render. It grants no access, reveals
 * nothing, and changes no data. Validation is the enum, not a gate. There is a mutant that re-adds
 * `staffGate` and it must turn the `unavailable` case red.
 *
 * No `revalidatePath`: every `/staff/*` page and `/board` is `force-dynamic`, and the caller does a
 * `router.refresh()` so the server re-renders with the new cookie.
 */
export async function setStaffLang(raw: unknown): Promise<SetStaffLangResult> {
  const parsed = staffLangInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick English or Burmese." };

  try {
    (await cookies()).set(STAFF_LANG_COOKIE, parsed.data.lang, staffLangCookieOptions());
  } catch {
    // A cookie write can only fail here if the action ran outside a request scope. Report it as a
    // refusal so the control can mount its own `role="alert"` — never throw, which would surface as
    // the whole staff screen's error boundary for a language tap.
    return { ok: false, error: "Couldn’t save that — tap again." };
  }
  return { ok: true, lang: parsed.data.lang };
}
