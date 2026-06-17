/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--color-background) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        overlay: "rgb(var(--color-overlay) / <alpha-value>)",
        surface: {
          950: "rgb(var(--color-surface-950) / <alpha-value>)",
          900: "rgb(var(--color-surface-900) / <alpha-value>)",
          850: "rgb(var(--color-surface-850) / <alpha-value>)",
          800: "rgb(var(--color-surface-800) / <alpha-value>)",
          700: "rgb(var(--color-surface-700) / <alpha-value>)"
        },
        line: "rgb(var(--color-line) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          foreground: "rgb(var(--color-accent-foreground) / <alpha-value>)"
        },
        control: {
          DEFAULT: "rgb(var(--color-control) / <alpha-value>)",
          hover: "rgb(var(--color-control-hover) / <alpha-value>)",
          active: "rgb(var(--color-control-active) / <alpha-value>)"
        },
        selection: {
          DEFAULT: "rgb(var(--color-selection) / <alpha-value>)",
          hover: "rgb(var(--color-selection-hover) / <alpha-value>)",
          foreground: "rgb(var(--color-selection-foreground) / <alpha-value>)"
        },
        zinc: {
          50: "rgb(var(--color-zinc-50) / <alpha-value>)",
          100: "rgb(var(--color-zinc-100) / <alpha-value>)",
          200: "rgb(var(--color-zinc-200) / <alpha-value>)",
          300: "rgb(var(--color-zinc-300) / <alpha-value>)",
          400: "rgb(var(--color-zinc-400) / <alpha-value>)",
          500: "rgb(var(--color-zinc-500) / <alpha-value>)",
          600: "rgb(var(--color-zinc-600) / <alpha-value>)",
          700: "rgb(var(--color-zinc-700) / <alpha-value>)",
          800: "rgb(var(--color-zinc-800) / <alpha-value>)",
          900: "rgb(var(--color-zinc-900) / <alpha-value>)"
        }
      },
      borderRadius: {
        ui: "8px"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["SFMono-Regular", "ui-monospace", "Menlo", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};
