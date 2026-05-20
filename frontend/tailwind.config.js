/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#080808",
          900: "#0b0b0c",
          850: "#111113",
          800: "#17171a",
          700: "#1f1f23"
        },
        line: "#242426",
        muted: "#8a8a90",
        accent: "#5e6ad2"
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
