import { EntrySkeleton } from "@/components/staff/EntrySkeleton";

/** signin-1 — the sign-in screen's OWN skeleton (its geometry, not the floor's). */
export default function LoginLoading() {
  return <EntrySkeleton what="what.console" />;
}
