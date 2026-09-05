"use client";

import { useSyncExternalStore } from "react";

// The `data-theme` attribute on <html> is the source of truth — the inline
// script in layout.tsx sets it before paint, so reading it here avoids both a
// wrong-icon flash and a hydration mismatch.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function isDark() {
  const saved = document.documentElement.getAttribute("data-theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Persists an explicit light/dark choice; defaults to following the OS until set.
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const theme = dark ? "light" : "dark";
    // Writing the attribute re-renders us via the MutationObserver above.
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("bih-schedule-theme", theme);
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line bg-card"
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7" fill="currentColor" />
          <circle cx="12.5" cy="6.5" r="6" className="fill-card" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="9" y1="0.5" x2="9" y2="2.5" />
            <line x1="9" y1="15.5" x2="9" y2="17.5" />
            <line x1="0.5" y1="9" x2="2.5" y2="9" />
            <line x1="15.5" y1="9" x2="17.5" y2="9" />
            <line x1="3" y1="3" x2="4.4" y2="4.4" />
            <line x1="13.6" y1="13.6" x2="15" y2="15" />
            <line x1="3" y1="15" x2="4.4" y2="13.6" />
            <line x1="13.6" y1="4.4" x2="15" y2="3" />
          </g>
        </svg>
      )}
    </button>
  );
}
