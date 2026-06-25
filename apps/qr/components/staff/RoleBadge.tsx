import type { StaffRole } from "@/lib/staff";
import { Badge, type BadgeTone } from "@mms/ui";

/**
 * Role chip (S1.1a) — owner / manager / server. Pure presentational (renders inside server
 * components). Built on the shared `@mms/ui` Badge via semantic `tone` presets, so the AA-on-tint
 * contrast rule (text uses the `-strong` token; the decorative dot keeps the vivid hue) lives once in
 * the primitive rather than here.
 */
const ROLE: Record<StaffRole, { tone: BadgeTone; label: string }> = {
  owner: { tone: "gold", label: "Owner" },
  manager: { tone: "jade", label: "Manager" },
  server: { tone: "accent", label: "Server" },
};

export function RoleBadge({ role }: { role: StaffRole }) {
  const r = ROLE[role];
  return <Badge tone={r.tone}>{r.label}</Badge>;
}
