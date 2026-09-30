"use server";
import { cookies } from "next/headers";
import { staffLangInput } from "@mms/db/schemas";
import { STAFF_LANG_COOKIE, staffLangCookieOptions, type StaffLangMode } from "./staff-lang";

export type SetStaffLangResult = { ok: true; mode: StaffLangMode } | { ok: false; error: string };

/**
 * P2 — set this DEVICE's staff chrome language. P2e: the value is a MODE — Burmese only, both, or
 * English (`StaffLangMode`) — and it is written verbatim; the export keeps its name because nine
 * suites mock this module and two lib docblocks cite it.
 *
 * ⚠️ DELIBERATELY UNGATED — no `staffGate`, and this is the load-bearing decision in the slice.
 *
 * `staffGate` calls `getStaffAuth`, which makes a live `supa.auth.getUser()` round trip and answers
 * `unavailable` when the platform is unreachable and "Staff sign-in required." for anyone not signed
 * in. Gating this action would therefore kill the language control on exactly the screens where it
 * matters most:
 *
 *   1. `/staff/login` — the first screen the kitchen tablet shows, where nobody is signed in yet.
 *   2. `/staff/lock`  — the PIN screen a shared tablet sits on between shifts.
 *   3. `StaffOutageShell` — the full-page outage screen, i.e. precisely when auth is unreachable.
 *   4. `app/staff/error.tsx` — the error screen, which replaces a page that just failed.
 *   …and the Help sheet's Language row and the Profile's language card under an auth outage.
 *
 * (`/board` mounts no control: it reads `?lang=`, then the cookie through `parseStaffLang`.)
 *
 * The thing being written carries no authority: it is a three-value enum in the caller's own cookie
 * jar that decides how the same words are drawn. It grants no access, reveals nothing, and changes
 * no data. Validation is the enum, not a gate. The tripwire is `staff-lang-actions.test.ts`'s "SETS
 * THE COOKIE WITH NO STAFF SESSION" case: this module imports no auth, so a `staffGate` import lands
 * there unmocked and fails.
 *
 * No `revalidatePath`: every `/staff/*` page and `/board` is `force-dynamic`, and the caller does a
 * `router.refresh()` so the server re-renders with the new cookie.
 */
export async function setStaffLang(raw: unknown): Promise<SetStaffLangResult> {
  const parsed = staffLangInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick Burmese, both, or English." };

  try {
    (await cookies()).set(STAFF_LANG_COOKIE, parsed.data.mode, staffLangCookieOptions());
  } catch {
    // A cookie write can only fail here if the action ran outside a request scope. Report it as a
    // refusal so the control can mount its own `role="alert"` — never throw, which would surface as
    // the whole staff screen's error boundary for a language tap.
    return { ok: false, error: "Couldn’t save that — tap again." };
  }
  return { ok: true, mode: parsed.data.mode };
}
