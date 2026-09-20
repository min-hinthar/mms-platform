import { EntrySkeleton } from "@/components/staff/EntrySkeleton";

/** signin-1 — the lock screen's OWN skeleton: the same card the PIN form renders into. */
export default function LockLoading() {
  return <EntrySkeleton what="what.lock" />;
}
