import { NextRequest, NextResponse } from "next/server";
import { sendAuthEmail } from "@/lib/email";
import { verifyStandardWebhook, withinTolerance } from "@/lib/standard-webhook";

// Node runtime: signature verification (node:crypto) + React Email render. This is the Supabase
// **Send-Email Hook** — GoTrue POSTs here (signed) whenever it needs to send an auth email, and WE
// send it via Resend instead of SMTP. The middleware matcher already skips /api, so it's ungated.
export const runtime = "nodejs";

type HookPayload = {
  user?: { email?: string };
  email_data?: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
  };
};

/** Per email_action_type copy (the code is the same component; just the words change). */
function templateFor(type: string): { heading: string; intro: string; subject: string } {
  switch (type) {
    case "recovery":
      return {
        heading: "Reset your password",
        intro: "Enter this code on the reset screen to set a new password.",
        subject: "Reset your Mandalay Morning Star password",
      };
    case "signup":
    case "email":
      return {
        heading: "Confirm your email",
        intro: "Enter this code to confirm your email and finish signing in.",
        subject: "Confirm your Mandalay Morning Star email",
      };
    case "email_change":
    case "email_change_new":
      return {
        heading: "Confirm your new email",
        intro: "Enter this code to confirm your new email address.",
        subject: "Confirm your new Mandalay Morning Star email",
      };
    default: // magiclink / login / otp
      return {
        heading: "Your sign-in code",
        intro: "Enter this code on the sign-in screen to reach the floor.",
        subject: "Your Mandalay Morning Star sign-in code",
      };
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    console.error("[auth send-email hook] SEND_EMAIL_HOOK_SECRET is not set");
    return NextResponse.json(
      { error: { http_code: 500, message: "Hook not configured" } },
      { status: 500 },
    );
  }

  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signature = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signature)
    return NextResponse.json(
      { error: { http_code: 401, message: "Missing signature" } },
      { status: 401 },
    );
  if (!withinTolerance(timestamp))
    return NextResponse.json(
      { error: { http_code: 401, message: "Stale timestamp" } },
      { status: 401 },
    );

  const body = await req.text();
  if (!verifyStandardWebhook(secret, id, timestamp, body, signature))
    return NextResponse.json(
      { error: { http_code: 401, message: "Bad signature" } },
      { status: 401 },
    );

  let payload: HookPayload;
  try {
    payload = JSON.parse(body) as HookPayload;
  } catch {
    return NextResponse.json(
      { error: { http_code: 400, message: "Bad payload" } },
      { status: 400 },
    );
  }

  const to = payload.user?.email;
  const data = payload.email_data;
  if (!to || !data?.token) {
    console.error("[auth send-email hook] missing recipient or token");
    return NextResponse.json(
      { error: { http_code: 400, message: "Missing email or token" } },
      { status: 400 },
    );
  }

  const type = data.email_action_type ?? "magiclink";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Build the verification (magic) link only when we can; the CODE is the primary path regardless.
  const magicLink =
    supabaseUrl && data.token_hash && data.redirect_to
      ? `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(data.token_hash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(data.redirect_to)}`
      : undefined;

  const t = templateFor(type);
  const res = await sendAuthEmail({
    to,
    code: data.token,
    magicLink,
    heading: t.heading,
    intro: t.intro,
    subject: t.subject,
  });
  if (!res.ok) {
    // The user is waiting on this email — surface the failure so GoTrue reports it (not a silent drop).
    console.error("[auth send-email hook] send failed", res.error);
    return NextResponse.json(
      { error: { http_code: 500, message: "Could not send email" } },
      { status: 500 },
    );
  }
  return NextResponse.json({}, { status: 200 });
}
