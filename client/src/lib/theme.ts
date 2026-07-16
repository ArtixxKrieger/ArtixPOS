const STORAGE_KEY = "theme";
const TRANSITION_CLASS = "theme-transitioning";
const TRANSITION_DURATION = 200;

export type ThemeMode = "light" | "dark" | "system";

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return "system";
}

export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.add(TRANSITION_CLASS);

  // Force a synchronous reflow so the browser registers the transition class
  // before toggling dark — without this both changes land in the same paint
  // frame and colours snap instead of fading.
  void document.documentElement.offsetHeight;

  if (mode === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, mode);
  }

  const isDark = resolveIsDark(mode);
  document.documentElement.classList.toggle("dark", isDark);

  setTimeout(() => {
    document.documentElement.classList.remove(TRANSITION_CLASS);
  }, TRANSITION_DURATION);
}

export function syncTheme(): void {
  const mode = getStoredTheme();
  const isDark = resolveIsDark(mode);
  document.documentElement.classList.toggle("dark", isDark);
}

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
