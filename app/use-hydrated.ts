"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during SSR and the hydration pass, true afterwards. Kickoff times render
 * in the viewer's timezone, which the server can't know, so time-dependent output
 * must wait for the client to avoid a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
