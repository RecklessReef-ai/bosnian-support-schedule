"use client";

import { useHydrated } from "./use-hydrated";

/**
 * The viewer's IANA timezone, or null while the server still owns the markup.
 *
 * Every component that renders a time needs this same answer, and needs it to be
 * the *same* answer — a heading grouped in one zone above rows formatted in
 * another would misfile fixtures around midnight.
 */
export function useViewerTimeZone(): string | null {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
