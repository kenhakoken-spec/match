import "server-only";
import { releaseMode } from "@/lib/env";

// Release-mode helpers. The actual waiting-screen gate UI is owned by the
// frontend worker; this module only exposes the boolean decision so server
// code and the frontend gate share a single source of truth.
//
// NOTE: public preview endpoints (src/app/api/public/**) intentionally do NOT
// consult isWaiting() — they remain viewable even before launch so prospective
// members can browse open slots and participants. Only the global app shell
// should branch on this.
export function isWaiting(): boolean {
  return releaseMode() === "waiting";
}

export function isOpen(): boolean {
  return releaseMode() === "open";
}
