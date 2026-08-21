import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverClient } from "@mms/db/server";
import { DEFAULT_NEXT, NEXT_COOKIE, safeNext } from "@/lib/safe-next";

// Node runtime: exchanges the auth code for a session (sets cookies). This is where BOTH Google OAuth
// and the email magic-LINK land (the PKCE `?code=` flow); the email OTP *code* path verifies in-page
// and never hits here. The /staff shell then gates on the staff row (allowlist) — so this route only
// establishes the session, it doesn't decide who's staff.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  // Where this sign-in was FOR. The cookie is the carrier (Supabase glob-matches `redirectTo`
  // against the allow list, so a query string on it would MISS — see `safe-next.ts`); an explicit
  // `?next=` still wins for a hand-built URL. Either way it is attacker-reachable, so `safeNext`
  // re-validates and falls back to /staff. Preserved through the failure paths too, so a retry after
  // an expired link still lands on the surface the sign-in was for.
  //
  // ⚠️ Read the cookie value AS-IS — do NOT `decodeURIComponent` it. Next's request-cookie parser
  // already decodes what `document.cookie` wrote, so a second decode is one decode too many, and it
  // is not harmless: a device token is base64 and routinely contains `+`. `/board?k=aB%2Bc%2Fd%3D%3D`
  // survives one decode intact, but a second turns it into `/board?k=aB+c/d==`, and `+` in a query
  // string means SPACE — so `/board` then reads the token as `aB c/d==` and the token-first fallback
  // this whole flow exists to preserve is silently dead. `url.searchParams.get` decodes once too,
  // which is why that carrier never had the bug (Codex round 2, P2 — measured, not reasoned).
  const parked = (await cookies()).get(NEXT_COOKIE)?.value;
  const next = safeNext(url.searchParams.get("next") ?? parked);
  const backToLogin = `${origin}/staff/login${next === DEFAULT_NEXT ? "" : `?next=${encodeURIComponent(next)}`}`;

  /** Redirect, always clearing the parked destination — it is single-use, whatever the outcome. */
  const leave = (to: string) => {
    const res = NextResponse.redirect(to);
    res.cookies.set(NEXT_COOKIE, "", { path: "/staff", maxAge: 0 });
    return res;
  };

  // No code (or the user denied at Google / a malformed return) → back to the login, no session minted.
  if (!code) return leave(backToLogin);

  const supa = serverClient(await cookies());
  const { error } = await supa.auth.exchangeCodeForSession(code);
  if (error) {
    // Most commonly an expired/used link, or a magic link opened in a DIFFERENT browser than the one
    // that requested it (the PKCE verifier cookie isn't present). Send them back to retry — the OTP
    // code path is the cross-device-safe alternative.
    console.error("[staff callback] code exchange failed", error.message);
    return leave(backToLogin);
  }
  // Session is in cookies; the destination re-gates on its own (/staff against the staff allowlist
  // → ?denied=1 if not staff; /kiosk and /board via authorizeDevice). This route only establishes
  // the session — it has never decided who is staff, and still doesn't.
  return leave(`${origin}${next}`);
}
