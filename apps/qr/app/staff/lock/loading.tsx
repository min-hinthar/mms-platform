import { EntrySkeleton } from "@/components/staff/EntrySkeleton";

/** signin-1 — the lock screen's OWN skeleton, in the PIN form's shape. */
export default function LockLoading() {
  return <EntrySkeleton what="what.lock" form="lock" />;
}
