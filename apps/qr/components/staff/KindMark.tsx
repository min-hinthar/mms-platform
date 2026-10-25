"use client";
import { Icon } from "@mms/ui";

/** The kind mark — a minus-square for Remove, the gift disc for Make it free — beside its word; it
 *  is decorative (the word carries the kind), so a check never means an approval. (It lived in the
 *  PD8 approval slip, which No-PIN retired — owner, 2026-10-24.) */
export function KindMark({
  kind,
  size = "md",
}: {
  kind: "void" | "comp";
  size?: "sm" | "md" | "lg";
}) {
  const cls = `appr-mark ${size === "sm" ? "appr-mark-sm" : size === "lg" ? "appr-mark-lg" : ""} ${
    kind === "void" ? "appr-mark-remove" : "appr-mark-free"
  }`;
  return (
    <span className={cls} aria-hidden>
      {kind === "comp" && <Icon name="gift" size={size === "sm" ? 11 : size === "lg" ? 18 : 16} />}
    </span>
  );
}
