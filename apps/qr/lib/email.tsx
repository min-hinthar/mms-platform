import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { AuthCodeEmail } from "@/emails/AuthCodeEmail";
import { StaffInviteEmail } from "@/emails/StaffInviteEmail";
import { StaffDeactivatedEmail } from "@/emails/StaffDeactivatedEmail";

/**
 * Email via Resend (`resend` SDK) with **React Email** templates (same stack as the delivery app).
 *   • Staff sign-in (magic-link / OTP) — rendered by `sendAuthEmail`, called from the Supabase
 *     Send-Email Hook (`/api/auth/send-email`). This REPLACES Supabase SMTP, so there's no SMTP to
 *     misconfigure/rate-limit.
 *   • Staff lifecycle (invite / deactivation) — app-initiated, best-effort via `after()`.
 *
 * `sendEmail` never throws (returns {ok}); unset keys ⇒ skip + log. The AUTH path treats a failed send
 * as an error to surface (the user is waiting on the code); the lifecycle path is best-effort.
 */

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return "https://qr.mandalaymorningstar.com";
}

export type EmailResult = { ok: boolean; error?: string };

async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    console.warn("[email] RESEND_API_KEY/RESEND_FROM unset — skipping send");
    return { ok: false, error: "email-not-configured" };
  }
  try {
    const { error } = await new Resend(key).emails.send({ from, to, subject, html });
    if (error) {
      console.error("[email] Resend send failed", error.name, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] Resend send threw", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", server: "Server" };

/** Staff sign-in email (Supabase Send-Email Hook). Code is the hero; magic link is secondary. */
export async function sendAuthEmail(opts: {
  to: string;
  code: string;
  magicLink?: string;
  heading?: string;
  intro?: string;
  subject?: string;
}): Promise<EmailResult> {
  const html = await render(
    <AuthCodeEmail
      code={opts.code}
      magicLink={opts.magicLink}
      heading={opts.heading}
      intro={opts.intro}
    />,
  );
  return sendEmail(opts.to, opts.subject ?? "Your Mandalay Morning Star sign-in code", html);
}

export async function sendStaffInviteEmail(opts: {
  to: string;
  displayName: string;
  role: string;
}): Promise<EmailResult> {
  const html = await render(
    <StaffInviteEmail
      displayName={opts.displayName}
      roleLabel={ROLE_LABEL[opts.role] ?? "Staff"}
      signInUrl={`${siteUrl()}/staff/login`}
    />,
  );
  return sendEmail(opts.to, "You’re set up on the Mandalay Morning Star floor", html);
}

export async function sendStaffDeactivatedEmail(opts: { to: string }): Promise<EmailResult> {
  const html = await render(<StaffDeactivatedEmail />);
  return sendEmail(opts.to, "Your Mandalay Morning Star staff access is paused", html);
}
