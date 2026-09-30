# Migrating DealsDash to the VIXIV Design System

DealsDash today: Tailwind v3 (compiled via `tailwind.config.js` + `src/tailwind-input.css`), slate/teal palette, `ui-sans-serif` system font, lucide-react icons, a fixed vertical sidebar with inline width styles, and an error boundary. Body background `#f5f5f4` set in `public/index.html`.

## Phase 1 — tokens (no visual regression risk, ~1 hour)
1. Copy `vixiv-design-system/` into `src/design-system/`.
2. In `src/tailwind-input.css`, add above `@tailwind base;`:
   ```css
   @import "./design-system/tokens/tokens.css";
   @import "./design-system/css/vixiv.css";
   ```
3. In `tailwind.config.js`: `presets: [require("./src/design-system/tokens/tailwind.preset.js")]`.
4. In `public/index.html` replace the inline body style with:
   ```html
   <html lang="en" data-theme="auto">
   <body class="vx-root">
   ```
   and remove `background:#f5f5f4; font-family: ui-sans-serif…`.
5. Rebuild (`update-dealsdash.bat` — keep all four targets: hosting, firestore:rules, storage, functions). Nothing should look different yet except the default font.

## Phase 2 — palette swap (mechanical find-and-replace)
| Current class | Replace with |
|---|---|
| `bg-slate-900`, `bg-slate-800` (sidebar/header) | `bg-vx-header` |
| `text-slate-400`, `text-slate-500` | `text-vx-muted` |
| `text-slate-100`, `text-white` on dark surfaces | `text-[color:var(--vx-header-fg)]` |
| `border-teal-500`, `borderColor: "#14b8a6"` | `border-brick` / `var(--vx-brand-brick)` |
| `bg-teal-*` buttons | `vx-btn` or `bg-navy text-white` |
| `bg-white` cards | `bg-vx-bg` |
| `bg-slate-50 / bg-gray-100` panels | `bg-vx-surface` |
| `border-gray-200 / border-slate-200` | `border-vx-divider` |
| `text-slate-900 / text-gray-900` | `text-vx-text` |
| `rounded-lg`, `rounded-xl`, `shadow-md` on cards | `rounded` (4px), drop shadow; prefer `vx-item` rules over cards |
| slider `accent` inline style `#14b8a6` | `var(--vx-brand-brick)` |

## Phase 3 — component adoption (module by module)
Order by traffic: Sourcing Pipeline → Deal Appraisal → Capital & Cash → Business Planner → Rental → Legal pack.
- Sidebar → `<Tabs vertical>` (`vx-sidenav`); mobile → `<Tabs>` horizontal. Keep lucide icons at 16px before the label.
- Number inputs → `NumberField`; select-one choices with ≤5 options → `Segmented` (replaces `<select>` on mobile).
- KPI tiles → `Stat` (`big` for the headline figure).
- Regulatory / assumption callouts → `Note` (default brick edge; `caution` for unvalidated figures; `positive` for satisfied checks).
- Appraisal tables → `Table` with `numeric` columns right-aligned and a `total` row.
- Deal Appraisal and Business Planner screens: add `LiveBar` showing max bid / capital required as inputs change.

## Phase 4 — dark mode
Tokens handle it. Add `<ThemeToggle />` to Settings. QA each module in both themes against `demo/index.html`; anything still hard-coded to a slate/teal hex will stand out immediately.

## Phase 5 — Refurb Survey integration
The Refurb Survey component already emits `vx`-compatible structure; when it is imported as a DealsDash module its `survey`, `lines` and `finance` objects map to the Deal Appraisal fields (refurb cost, contingency, fees, max bid). Keep it on the shared design system so the two screens look like one product.

## Done when
- `grep -R "slate-\|teal-\|#14b8a6\|#f5f5f4" src/` returns nothing.
- Playwright E2E suite passes in light and dark (`page.emulateMedia({ colorScheme })`).
- Print of an appraisal matches the Refurb Survey report layout.
