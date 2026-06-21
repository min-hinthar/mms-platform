import "server-only";
import { Resend } from "resend";

/**
 * Transactional email via Resend (S1.1a follow-up; same `resend` SDK as the delivery app). The split,
 * by design:
 *   • Magic-link / OTP (staff sign-in) emails are sent by SUPABASE AUTH through its SMTP — pointed at
 *     Resend in the dashboard — so they are NOT here.
 *   • App-INITIATED mail (staff lifecycle: invite, deactivation) is sent here, via the Resend SDK.
 *
 * FAIL-SAFE BY DESIGN: a send NEVER throws into the caller and never returns a rejected promise. App
 * email is best-effort — the DB change (the staff row) is the source of truth, and a Resend outage or
 * an unset key must never fail provisioning/deactivation. Callers fire these from `after()` so they're
 * fully decoupled from the response (same discipline as the QBO sync).
 */

/**
 * Public base URL for links in emails. Always resolve to a STABLE/production origin — never the
 * per-deploy `VERCEL_URL` (preview host), or an invite sent from a preview build would link staff to
 * an ephemeral origin. Explicit env wins; else Vercel's production domain (set on every deploy,
 * incl. previews); else the brand domain.
 */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return "https://mandalaymorningstar.com";
}

export type EmailResult = { ok: boolean; error?: string };

async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  // Unset keys are a deploy/config state, not an error — degrade quietly (the action still succeeds).
  if (!key || !from) {
    console.warn("[email] RESEND_API_KEY/RESEND_FROM unset — skipping transactional send");
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

/** Escape user-controlled text before interpolating into email HTML (displayName is owner-entered). */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

// Email clients can't use @mms/ui tokens (no external CSS / CSS custom properties), so the colors
// here are LITERAL brand values by necessity — the one sanctioned exception to "tokens, not hex".
function shell(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf9f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1714">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#a65f10;margin:0 0 8px">Mandalay Morning Star</p>
    <h1 style="font-size:22px;margin:0 0 14px;font-weight:700">${heading}</h1>
    ${bodyHtml}
    <p style="font-size:12px;color:#6e6358;margin:28px 0 0">Mandalay Morning Star · teahouse</p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#a65f10;color:#fffdf8;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px">${label}</a>`;
}

/** Sent (best-effort) when an owner provisions a new staff member — tells them they can sign in. */
export async function sendStaffInviteEmail(opts: {
  to: string;
  displayName: string;
  role: string;
}): Promise<EmailResult> {
  const url = `${siteUrl()}/staff/login`;
  const roleLabel = ROLE_LABEL[opts.role] ?? "Staff";
  const html = shell(
    "You’re on the team",
    `<p style="font-size:15px;line-height:1.6;margin:0 0 20px">Hi ${escapeHtml(opts.displayName)}, you’ve been added to the Mandalay Morning Star floor as <strong>${roleLabel}</strong>. Sign in any time with your email — we’ll send a one-time code, no password to remember.</p>
     <p style="margin:0 0 22px">${button(url, "Sign in to the floor")}</p>
     <p style="font-size:13px;color:#6e6358;margin:0">Or open <a href="${url}" style="color:#a65f10">${url}</a></p>`,
  );
  return sendEmail(opts.to, "You’re set up on the Mandalay Morning Star floor", html);
}

/** Sent (best-effort) when an owner deactivates a staff member — an honest heads-up, no alarm. */
export async function sendStaffDeactivatedEmail(opts: { to: string }): Promise<EmailResult> {
  const html = shell(
    "Your staff access is paused",
    `<p style="font-size:15px;line-height:1.6;margin:0 0 18px">Your access to the Mandalay Morning Star staff console has been turned off, so you won’t be able to sign in for now.</p>
     <p style="font-size:13px;color:#6e6358;margin:0">If that’s a surprise, check with an owner — they can switch it back on any time.</p>`,
  );
  return sendEmail(opts.to, "Your Mandalay Morning Star staff access is paused", html);
}
