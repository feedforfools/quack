import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
}

/**
 * Global theme store — all consumers share the same `isDark` value so any
 * component that reads it re-renders when the toggle fires.
 *
 * Side-effects (DOM class, localStorage, meta tag) are applied inside the
 * action to keep them co-located with the state change.
 */
export const useTheme = create<ThemeState>((set, get) => ({
  isDark: document.documentElement.classList.contains("dark"),

  toggleTheme() {
    const next = !get().isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const metaTheme = getComputedStyle(
        document.documentElement,
      ).getPropertyValue("--color-meta-theme");
      meta.setAttribute("content", metaTheme.trim());
    }
    set({ isDark: next });
  },
}));
