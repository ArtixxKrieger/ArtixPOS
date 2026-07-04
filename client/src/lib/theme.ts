/**
 * Theme management — light / dark / system.
 *
 * Smooth transitions are applied by adding the `.theme-transitioning` class
 * to <html> before the theme change; it's removed after the CSS transition
 * completes (150 ms + 50 ms buffer = 200 ms).
 */

const STORAGE_KEY = "theme";
const TRANSITION_CLASS = "theme-transitioning";
const TRANSITION_DURATION = 200;

export type ThemeMode = "light" | "dark" | "system";

/** Read the stored preference (defaults to "system"). */
export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return "system";
}

/** Resolve the effective (actual) dark/light state. */
export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply the theme mode and persist to localStorage. */
export function applyTheme(mode: ThemeMode): void {
  // 1. Add the transition class so CSS transitions are active
  document.documentElement.classList.add(TRANSITION_CLASS);

  // 2. Force a synchronous style reflow so the browser registers the new class
  //    BEFORE the dark class is toggled.  Without this, the browser batches
  //    both class changes into the same paint frame and the transition never
  //    fires — colours snap instead of fading.
  void document.documentElement.offsetHeight;

  // 3. Persist
  if (mode === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, mode);
  }

  // 4. Toggle the `dark` class — the CSS transition handles the smooth fade
  const isDark = resolveIsDark(mode);
  document.documentElement.classList.toggle("dark", isDark);

  // 5. Remove the transition class after the animation completes so normal
  //    interactions (hover, focus) are not slowed down by transitions.
  setTimeout(() => {
    document.documentElement.classList.remove(TRANSITION_CLASS);
  }, TRANSITION_DURATION);
}

/** Sync the root class with the current stored preference (called once at boot). */
export function syncTheme(): void {
  const mode = getStoredTheme();
  const isDark = resolveIsDark(mode);
  document.documentElement.classList.toggle("dark", isDark);
}

/**
 * Watch the OS-level colour-scheme media query and re-apply the theme when
 * it changes (only meaningful in "system" mode).  Returns an unsubscribe fn.
 */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    const mode = getStoredTheme();
    if (mode === "system") {
      applyTheme("system");
    }
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
