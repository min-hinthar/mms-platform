/**
 * Phase 0 / F9 — where a `/menu` request with NO `?mode=` belongs. `null` = render the menu as asked.
 *
 * A bare `/menu` is not neutral: every client default fell through to SCAN & GO, so a guest who typed
 * or bookmarked the address got the restaurant menu wearing the market's eyebrow and a 🛒 arrival
 * card, with dishes landing in the grocery basket (the device's `mms.qr.scango` session). The server
 * refuses to guess instead:
 *   · a sticker token (`t`) or an invite code (`j`) IS a table — dine-in, every other param kept;
 *   · anything else goes to the door picker (`/`), which costs one tap and never costs a table
 *     (the `menuHref` rule, lib/menu-href.ts).
 * An EXPLICIT mode is always honoured — this only answers the question nobody asked.
 */
export function bareMenuRedirect(
  raw: Record<string, string | string[] | undefined>,
): string | null {
  // A repeated key (`?t=a&t=b`) arrives as an ARRAY in a page's searchParams but as its last value
  // through the proxy's URLSearchParams — take the last value on both paths so they agree.
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) params[k] = Array.isArray(v) ? v[v.length - 1] : v;
  if (params.mode) return null;
  if (!params.t && !params.j) return "/";
  const q = new URLSearchParams({ mode: "dinein" });
  for (const [k, v] of Object.entries(params)) if (v && k !== "mode") q.set(k, v);
  return `/menu?${q.toString()}`;
}
