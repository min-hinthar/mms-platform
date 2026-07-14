// K3b — the client-side localStorage bridge for the merge token. The server actions (mint/redeem) live in
// ./merge.ts; this only stashes the minted token across the sign-in redirect and reads it back on /account.
// All wrapped in try/catch: private-mode / storage-disabled just means the merge doesn't happen — this
// device's Stars stay where they are (never lost, only not-yet-moved), so a storage failure is silent.
const KEY = "mms.merge_token";

export function stashMergeToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable — the merge simply won't run; Stars stay put */
  }
}

export function readMergeToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearMergeToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
