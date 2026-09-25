import { PadSkeleton } from "@/components/staff/PadSkeleton";

/**
 * Phase 2c · pad — the order pad's instant skeleton for the same-table hop (the table page's
 * "+ Add items"). A register mint lands on a NEW `[id]`, whose boundary is `[id]/loading.tsx` — that
 * one chooses this same skeleton by the path.
 */
export default function PadLoading() {
  return (
    <main className="staff-main pad-main">
      <PadSkeleton />
    </main>
  );
}
