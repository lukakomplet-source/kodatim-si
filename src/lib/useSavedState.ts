"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screen state that survives leaving the page, closing the tab, or switching
 * device.
 *
 * Saved on the server against the user rather than in the browser, so work
 * started on a phone continues at a desk. Nothing here expires or self-clears;
 * `clearSavedState` is the only way state goes away, and that is wired to an
 * explicit button.
 *
 * Deliberately two hooks rather than one state container: the screens already
 * own their state, so a container would have to mirror it back and forth
 * through effects. Restoring once and saving on change needs neither.
 */

const SAVE_DELAY_MS = 800;

/**
 * Loads the saved value once and hands it to `apply`.
 *
 * Returns whether a previous session was found, so the UI can say "carrying on
 * where you left off" instead of silently repopulating and looking like a bug.
 */
export function useRestoreOnce<T>(key: string, apply: (value: T) => void): { restored: boolean; loaded: boolean } {
  const [restored, setRestored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Kept in a ref so a fresh closure each render doesn't re-run the fetch.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/ui-state?key=${encodeURIComponent(key)}`);
        const json = await res.json();
        if (!cancelled && json?.value != null) {
          applyRef.current(json.value as T);
          setRestored(true);
        }
      } catch {
        // Start empty rather than block the screen on a storage hiccup.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { restored, loaded };
}

/**
 * Saves `value` whenever it changes, on a debounce.
 *
 * Also flushes when the page is hidden: a phone backgrounding a tab often never
 * runs another timer, so a pending debounce would be lost exactly when it
 * matters most. `enabled` should be false until the restore has finished, or
 * the empty initial state would overwrite what was saved.
 */
export function useAutoSave(key: string, value: unknown, enabled: boolean): void {
  const latest = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    latest.current = value;
    if (!enabled) return;
    // The first pass after enabling is the restored value itself — saving it
    // back would be a pointless write.
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void save(key, latest.current).then(() => {
        dirty.current = false;
      });
    }, SAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value, enabled]);

  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      if (timer.current) clearTimeout(timer.current);
      const body = JSON.stringify({ key, value: latest.current });
      // sendBeacon survives the page going away; fetch would be cancelled.
      const sent = navigator.sendBeacon?.(
        "/api/admin/ui-state",
        new Blob([body], { type: "application/json" })
      );
      if (!sent) void save(key, latest.current);
      dirty.current = false;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key]);
}

async function save(key: string, value: unknown): Promise<void> {
  try {
    await fetch("/api/admin/ui-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
      keepalive: true,
    });
  } catch {
    // Offline or mid-navigation. The next change tries again — a lost save is
    // not worth an error banner.
  }
}

/** Forgets a screen's saved work. Only ever called from an explicit button. */
export async function clearSavedState(key: string): Promise<void> {
  try {
    await fetch(`/api/admin/ui-state?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  } catch {
    // Nothing useful to do; the button already reset the screen.
  }
}
