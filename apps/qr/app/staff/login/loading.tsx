import { EntrySkeleton } from "@/components/staff/EntrySkeleton";

/** signin-1 — the sign-in screen's OWN skeleton, in the form's first shape (the email step). */
export default function LoginLoading() {
  return <EntrySkeleton what="what.console" form="login" />;
}
