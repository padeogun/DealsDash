/**
 * VIXIV Design System — Tailwind v3 preset.
 * Usage (tailwind.config.js):
 *   module.exports = { presets: [require("./vixiv-design-system/tokens/tailwind.preset.js")], content: [...] }
 * Then import tokens/tokens.css before Tailwind's base layer.
 * Colours reference CSS variables so dark mode works via [data-theme] — no `dark:` variants needed.
 */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy:  "#1B2A4A",
        brick: { DEFAULT: "#C1533C", strong: "#A6412E" },
        ice:   "#E7ECF3",
        vx: {
          bg: "var(--vx-bg)",
          surface: "var(--vx-surface)",
          "surface-2": "var(--vx-surface-2)",
          header: "var(--vx-header-bg)",
          text: "var(--vx-text)",
          muted: "var(--vx-text-muted)",
          accent: "var(--vx-accent)",
          "accent-strong": "var(--vx-accent-strong)",
          border: "var(--vx-border)",
          divider: "var(--vx-divider)",
          positive: "var(--vx-positive)",
          caution: "var(--vx-caution)",
          negative: "var(--vx-negative)",
          info: "var(--vx-info)",
          "surface-positive": "var(--vx-surface-positive)",
          "surface-caution":  "var(--vx-surface-caution)",
          "surface-negative": "var(--vx-surface-negative)",
          "surface-info":     "var(--vx-surface-info)",
        },
      },
      fontFamily: {
        head: ["Cambria", "Hoefler Text", "Georgia", "Times New Roman", "serif"],
        body: ["Calibri", "Segoe UI", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        sans: ["Calibri", "Segoe UI", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Cambria", "Hoefler Text", "Georgia", "serif"],
      },
      fontSize: {
        xs: ["12px", "1.4"], sm: ["13px", "1.4"], md: ["14px", "1.45"], base: ["16px", "1.45"],
        lg: ["17px", "1.2"], xl: ["20px", "1.15"], "2xl": ["24px", "1.1"], "3xl": ["26px", "1"],
      },
      borderRadius: { DEFAULT: "4px", sm: "4px", pill: "999px" },
      borderWidth: { accent: "3px" },
      maxWidth: { content: "820px" },
      boxShadow: { bar: "var(--vx-shadow-bar)", pop: "var(--vx-shadow-pop)" },
      transitionDuration: { DEFAULT: "120ms" },
    },
  },
};
