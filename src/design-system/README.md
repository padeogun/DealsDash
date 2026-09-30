# VIXIV Design System v1.0

The single UX/UI standard for every VIXIV LTD asset: DealsDash, Gauge, Refurb Survey, the corporate website and future VLI tooling.

## What's in the box

| Path | Purpose |
|---|---|
| `tokens/tokens.css` | Design tokens as CSS custom properties. Light default, dark via `[data-theme="dark"]`, OS-follow via `[data-theme="auto"]`. |
| `tokens/tokens.json` | Same tokens in W3C DTCG format (Figma Tokens Studio / Style Dictionary). |
| `tokens/tailwind.preset.js` | Tailwind v3 preset mapping tokens to utilities (`bg-vx-surface`, `text-brick`, `font-head` …). |
| `css/vixiv.css` | Framework-agnostic component classes (`vx-*`). Works with plain HTML, React, or beside Tailwind. |
| `react/index.jsx` | React components with no dependencies: `ThemeProvider`, `Header`, `Tabs`, `Field`, `NumberField`, `Segmented`, `Button`, `Note`, `Stat`, `Item`, `Table`, `LiveBar`, `Grid`, `Page`. |
| `demo/index.html` | Component sheet — open in a browser, toggle light/dark, use as the visual regression reference. |
| `MIGRATION_DEALSDASH.md` | Step-by-step for moving DealsDash onto the system. |
| `VIXIV_Design_Standard.docx` | The written standard (principles, tokens, components, patterns, accessibility, governance). |

## Install

Copy the folder into the repo (`/src/design-system`) or publish as a private npm package `@vixiv/design-system`.

```js
// main.jsx (Vite / CRA)
import "./design-system/tokens/tokens.css";
import "./design-system/css/vixiv.css";
import { ThemeProvider } from "./design-system/react";

root.render(<ThemeProvider initial="auto"><App /></ThemeProvider>);
```

With Tailwind:

```js
// tailwind.config.js
module.exports = {
  presets: [require("./src/design-system/tokens/tailwind.preset.js")],
  content: ["./src/**/*.{js,jsx}", "./index.html"],
};
```

## Rules in one screen

1. **Colour comes from tokens only.** Never hard-code a hex in a component. Brand hexes (`--vx-brand-*`) are constant; semantic tokens (`--vx-bg`, `--vx-text`, `--vx-accent` …) swap with theme.
2. **Two typefaces, fixed roles.** Cambria for headings, display numbers and stat values; Calibri for everything else. Never bold Cambria headings — weight comes from size.
3. **Brick is a signal, not decoration.** It marks the selected tab, the edge of a note, the live bar, section headings and negative outcomes. It is never a background for text blocks.
4. **One radius (4px), one pill (999px), one accent rule (3px).**
5. **Lists use top rules, not cards.** Items are separated by 1px dividers; only stats and notes sit on the ice surface.
6. **The live number pattern.** When a screen drives a single decision figure, pin it in a `LiveBar` so it updates as inputs change.
7. **Sentence case everywhere.** No all-caps labels, no eyebrow labels, no numbered markers unless the content is a sequence.
8. **Every actionable thing is a `<button>` with a visible focus ring; minimum 40px tall on touch surfaces.**
9. **Print is a first-class theme.** Headers, nav and live bars hide; surfaces keep ice via `print-color-adjust`.
10. **Copy says what happens.** "Save survey", not "Submit". Status text confirms with the same verb: "Saved".

## Versioning

Semantic versioning. Token additions are minor; token renames or removals are major and require a migration note. Changelog lives in `CHANGELOG.md`.
