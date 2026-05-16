import type { Config } from "tailwindcss";

/**
 * Tailwind theme tokens for Quack.
 *
 * Design intent (per _DESCRIPTION.md):
 * - Mobile-first; tap targets ≥ 44×44 CSS px.
 * - Dark-mode default; warm yellow as the primary accent (the "quack" duck-bill cue).
 * - WCAG 2.1 AA contrast on text against the dark base (≥ 4.5:1).
 *
 * Token names are intentionally semantic (`bg`, `surface`, `accent`) rather than
 * raw colour names so feature code never reaches for a hex value directly.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Default to dark mode regardless of system preference; opt-in light mode is post-MVP.
  // Using `class` strategy with `dark` toggled at <html> by app/main bootstrap.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surface palette — CSS variables allow light/dark switching.
        bg: {
          DEFAULT: "rgb(var(--color-bg) / <alpha-value>)",
          raised: "rgb(var(--color-bg-raised) / <alpha-value>)",
          sunken: "rgb(var(--color-bg-sunken) / <alpha-value>)",
        },
        // Foreground / text.
        fg: {
          DEFAULT: "rgb(var(--color-fg) / <alpha-value>)",
          muted: "rgb(var(--color-fg-muted) / <alpha-value>)",
          subtle: "rgb(var(--color-fg-subtle) / <alpha-value>)",
        },
        // Warm yellow accent — the duck-bill cue (same in both themes).
        accent: {
          DEFAULT: "#facc15", // primary accent (yellow-400)
          hover: "#fde047", // hover/focus lift
          ink: "#1c1917", // text colour on accent fills (≥ 12:1 on accent)
        },
        // Semantic states.
        danger: {
          DEFAULT: "#ef4444",
          ink: "#fef2f2",
        },
        success: {
          DEFAULT: "#22c55e",
          ink: "#052e16",
        },
        // Borders / dividers.
        border: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          strong: "rgb(var(--color-border-strong) / <alpha-value>)",
        },
      },
      // Minimum tap target enforcement helper. Use as `min-h-tap min-w-tap`.
      spacing: {
        tap: "44px",
      },
      borderRadius: {
        // Slightly softer than default — feels friendlier on a phone.
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
