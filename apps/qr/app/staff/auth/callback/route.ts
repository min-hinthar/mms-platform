import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverClient } from "@mms/db/server";

// Node runtime: exchanges the auth code for a session (sets cookies). This is where BOTH Google OAuth
// and the email magic-LINK land (the PKCE `?code=` flow); the email OTP *code* path verifies in-page
// and never hits here. The /staff shell then gates on the staff row (allowlist) — so this route only
// establishes the session, it doesn't decide who's staff.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  // No code (or the user denied at Google / a malformed return) → back to the login, no session minted.
  if (!code) return NextResponse.redirect(`${origin}/staff/login`);

  const supa = serverClient(await cookies());
  const { error } = await supa.auth.exchangeCodeForSession(code);
  if (error) {
    // Most commonly an expired/used link, or a magic link opened in a DIFFERENT browser than the one
    // that requested it (the PKCE verifier cookie isn't present). Send them back to retry — the OTP
    // code path is the cross-device-safe alternative.
    console.error("[staff callback] code exchange failed", error.message);
    return NextResponse.redirect(`${origin}/staff/login`);
  }
  // Session is in cookies; /staff re-gates against the staff allowlist (→ ?denied=1 if not staff).
  return NextResponse.redirect(`${origin}/staff`);
}
