/* ============================================================
   VIXIV Design System — React components  v1.0
   import "vixiv-design-system/tokens/tokens.css";
   import "vixiv-design-system/css/vixiv.css";
   import { ThemeProvider, Header, Tabs, Field, NumberField, Grid,
            Segmented, Button, Note, Stat, Table, LiveBar, Item,
            useTheme, formatGBP } from "vixiv-design-system/react";
   All components are plain function components with no external deps.
   ============================================================ */
import React, { createContext, useContext, useEffect, useState } from "react";

/* ---------- utilities ---------- */
export const formatGBP = (n, dp = 0) =>
  "£" + (Math.round((+n || 0) * 10 ** dp) / 10 ** dp).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const formatPct = (x, dp = 1) => ((+x || 0) * 100).toFixed(dp) + "%";
const cx = (...a) => a.filter(Boolean).join(" ");

/* ---------- theme ---------- */
const ThemeCtx = createContext({ theme: "light", setTheme: () => {} });
export function ThemeProvider({ initial = "auto", children }) {
  const [theme, setTheme] = useState(initial);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  return <ThemeCtx.Provider value={{ theme, setTheme }}><div className="vx-root">{children}</div></ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <Segmented value={theme} onChange={setTheme} options={[["light", "Light"], ["auto", "Auto"], ["dark", "Dark"]]} aria-label="Colour theme" />;
}

/* ---------- layout ---------- */
export function Page({ withBar, children, className }) { return <main className={cx("vx-page", withBar && "vx-page--with-bar", className)}>{children}</main>; }
export function Grid({ two, children, style }) { return <div className={cx("vx-grid", two && "vx-grid--2")} style={style}>{children}</div>; }
export function Header({ title, subtitle, actions, children }) {
  return (
    <header className="vx-header vx-no-print">
      <div className="vx-row vx-row--between" style={{ alignItems: "baseline", gap: 12 }}>
        <div><div className="vx-header__title">{title}</div>{subtitle && <div className="vx-header__sub">{subtitle}</div>}</div>
        {actions && <div className="vx-row">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
export function Tabs({ tabs, value, onChange, vertical }) {
  return (
    <nav role="tablist" className={vertical ? "vx-sidenav" : "vx-tabs"}>
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" className="vx-tab" aria-selected={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </nav>
  );
}

/* ---------- typography ---------- */
export const H2 = ({ children, ...p }) => <h2 className="vx-h2" {...p}>{children}</h2>;
export const H3 = ({ children, ...p }) => <h3 className="vx-h3" {...p}>{children}</h3>;
export const Muted = ({ children, small }) => <p className={cx("vx-muted", small && "vx-small")} style={{ margin: "0 0 12px" }}>{children}</p>;

/* ---------- forms ---------- */
export function Field({ label, error, children }) {
  return <label className="vx-field"><span className="vx-field__label">{label}</span>{children}{error && <div className="vx-field__error">{error}</div>}</label>;
}
export function Input({ className, ...p }) { return <input className={cx("vx-input", className)} {...p} />; }
export function NumberField({ label, value, onChange, right, error, ...p }) {
  return (
    <Field label={label} error={error}>
      <input className={cx("vx-input", right && "vx-input--right")} type="number" inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} {...p} />
    </Field>
  );
}
export function Segmented({ value, onChange, options, ...p }) {
  return (
    <div className="vx-seg" role="group" {...p}>
      {options.map(([k, label]) => <button key={k} type="button" className="vx-seg__opt" aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}
export function Button({ variant, size, children, ...p }) {
  return <button className={cx("vx-btn", variant && `vx-btn--${variant}`, size === "sm" && "vx-btn--sm")} {...p}>{children}</button>;
}

/* ---------- content ---------- */
export function Note({ tone, children, style }) { return <div className={cx("vx-note", tone && `vx-note--${tone}`)} style={style}>{children}</div>; }
export function Stat({ label, value, big, tone }) {
  return <div className={cx("vx-stat", big && "vx-stat--big")}><div className="vx-stat__label">{label}</div><div className={cx("vx-stat__value", tone && `vx-${tone}`)}>{value}</div></div>;
}
export function Item({ title, value, guide, children }) {
  return (
    <div className="vx-item">
      <div className="vx-row vx-row--between"><div className="vx-item__title">{title}</div>{value != null && <div className="vx-item__value">{value}</div>}</div>
      {guide && <div className="vx-item__guide">{guide}</div>}
      {children}
    </div>
  );
}
/* rows: [{cells:[...], numeric:[false,true], total:bool}] */
export function Table({ head, rows, zebra }) {
  return (
    <table className={cx("vx-table", zebra && "vx-table--zebra")}>
      {head && <thead><tr>{head.map((h, i) => <th key={i} className={typeof h === "object" && h.numeric ? "n" : ""}>{typeof h === "object" ? h.label : h}</th>)}</tr></thead>}
      <tbody>{rows.map((r, i) => (
        <tr key={i} className={r.total ? "total" : ""}>{r.cells.map((c, j) => <td key={j} className={r.numeric?.[j] ? "n" : ""} style={r.tone?.[j] ? { color: `var(--vx-${r.tone[j]})` } : undefined}>{c}</td>)}</tr>
      ))}</tbody>
    </table>
  );
}
export function LiveBar({ left, label, value, tone }) {
  return (
    <div className="vx-livebar vx-no-print" role="status" aria-live="polite">
      <div className="vx-caption">{left}</div>
      <div style={{ textAlign: "right" }}>
        <div className="vx-caption">{label}</div>
        <div className={cx("vx-livebar__number", tone && `vx-${tone}`)}>{value}</div>
      </div>
    </div>
  );
}
export function EmptyState({ children }) { return <p className="vx-empty">{children}</p>; }
export function Status({ children }) { return children ? <div className="vx-status vx-no-print" role="status">{children}</div> : null; }
