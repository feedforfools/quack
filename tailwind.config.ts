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
        // Surface palette — dark-first.
        bg: {
          DEFAULT: "#0b0b0b", // page background
          raised: "#161616", // cards, modals
          sunken: "#070707", // insets, code, input wells
        },
        // Foreground / text.
        fg: {
          DEFAULT: "#f5f5f4", // primary text — ~14:1 on bg.DEFAULT
          muted: "#a8a29e", // secondary text — ~6.5:1 on bg.DEFAULT
          subtle: "#78716c", // tertiary / disabled — ~4.6:1 on bg.DEFAULT
        },
        // Warm yellow accent — the duck-bill cue.
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
          DEFAULT: "#27272a",
          strong: "#3f3f46",
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
