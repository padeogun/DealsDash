/**
 * UserGuideView — searchable in-app reference guide.
 *
 * Features:
 * - Live search that filters and auto-expands matching sections
 * - Matched text highlighted in yellow
 * - Inline SVG mockups for each major screen
 * - Full-width layout (no artificial right-side whitespace)
 */

import React, { useState, useMemo } from "react";
import {
  BookOpen, ChevronRight, ChevronDown, Home, Layers, Building2, BookMarked,
  Wallet, TrendingUp, ShieldAlert, Users, KeyRound, Radar, Bell, Map,
  CheckCircle2, XCircle, AlertTriangle, Info, Star, Search, X,
} from "lucide-react";

/* ── Text highlight helper ─────────────────────────────────────────────── */

/**
 * Wraps each occurrence of `query` in `text` with a yellow <mark> span.
 * Returns the text unchanged if query is empty.
 */
function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

/* ── Section component ─────────────────────────────────────────────────── */

/**
 * Collapsible section. `forceOpen` overrides local state when a search is active.
 * `searchTerms` is a plain lowercase string of keywords used for section-level matching.
 */
function Section({ title, icon: Icon, children, defaultOpen = false, forceOpen, searchTerms = "", query }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen !== undefined ? forceOpen : open;

  return (
    <div className="border border-vx-divider rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-vx-surface hover:bg-vx-surface-2 text-left"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-vx-accent shrink-0" />}
          <span className="font-serif font-semibold text-vx-text">
            <Highlight text={title} query={query} />
          </span>
        </div>
        {isOpen ? <ChevronDown size={16} className="text-vx-muted shrink-0" /> : <ChevronRight size={16} className="text-vx-muted shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-5 py-4 space-y-4 text-sm text-vx-text leading-relaxed bg-vx-bg">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Shared layout primitives ──────────────────────────────────────────── */

function Callout({ tone = "info", children }) {
  const styles = {
    info:  "bg-blue-50  border-blue-200  text-blue-900",
    good:  "bg-green-50 border-green-200 text-green-900",
    warn:  "bg-amber-50 border-amber-200 text-amber-900",
    risk:  "bg-rose-50  border-rose-200  text-rose-900",
  };
  const icons = {
    info:  <Info size={14} className="shrink-0 mt-0.5" />,
    good:  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />,
    warn:  <AlertTriangle size={14} className="shrink-0 mt-0.5" />,
    risk:  <XCircle size={14} className="shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex gap-2 rounded border px-3 py-2 text-xs ${styles[tone]}`}>
      {icons[tone]}{children}
    </div>
  );
}

function FlagTable({ rows, query }) {
  return (
    <table className="w-full text-xs border-collapse">
      <colgroup>
        <col style={{ width: "28%" }} />
        <col style={{ width: "48%" }} />
        <col style={{ width: "24%" }} />
      </colgroup>
      <thead>
        <tr className="border-b border-vx-divider text-left text-vx-muted">
          <th className="py-1.5 pr-3 font-medium">Indicator / badge</th>
          <th className="py-1.5 pr-3 font-medium">Meaning</th>
          <th className="py-1.5 font-medium">Good looks like</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([flag, meaning, good], i) => (
          <tr key={i} className="border-b border-vx-divider last:border-0 align-top">
            <td className="py-1.5 pr-3 font-mono font-semibold text-vx-accent">
              <Highlight text={flag} query={query} />
            </td>
            <td className="py-1.5 pr-3 text-vx-text"><Highlight text={meaning} query={query} /></td>
            <td className="py-1.5 text-vx-muted"><Highlight text={good} query={query} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FieldList({ items, query }) {
  return (
    <dl className="space-y-2">
      {items.map(([term, def], i) => (
        <div key={i} className="grid grid-cols-[180px_1fr] gap-2 text-xs">
          <dt className="font-semibold text-vx-text leading-snug pt-0.5">
            <Highlight text={term} query={query} />
          </dt>
          <dd className="text-vx-muted leading-snug"><Highlight text={def} query={query} /></dd>
        </div>
      ))}
    </dl>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SVG MOCKUPS — compact visual representations of each major screen.
   These use neutral colours so they render cleanly on both light and dark themes.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dashboard KPI strip + alert panel mockup */
function DashboardMockup() {
  return (
    <svg viewBox="0 0 700 200" className="w-full rounded border border-vx-divider" style={{ maxHeight: 200, background: "#f8f7f5" }}>
      {/* KPI boxes */}
      {[
        ["Total capital base", "£185,400", "#1B2A4A", "#fff"],
        ["Free cash", "£42,100", "#15803d", "#fff"],
        ["Committed", "£55,000", "#1B2A4A", "#fff"],
        ["Cash runway", "14.2 mo", "#1B2A4A", "#fff"],
        ["Portfolio ROI", "31.4%", "#15803d", "#fff"],
        ["Active deals", "3", "#1B2A4A", "#fff"],
        ["Rental", "2", "#1B2A4A", "#fff"],
      ].map(([label, value, bg, fg], i) => (
        <g key={i} transform={`translate(${6 + i * 98}, 10)`}>
          <rect width="92" height="56" rx="6" fill={bg} />
          <text x="8" y="18" fontSize="7" fill="rgba(255,255,255,0.65)" fontFamily="sans-serif">{label}</text>
          <text x="8" y="40" fontSize="14" fontWeight="700" fill={fg} fontFamily="monospace">{value}</text>
        </g>
      ))}
      {/* Charts row label */}
      <text x="8" y="86" fontSize="8" fill="#78716c" fontFamily="sans-serif" fontWeight="600">Capital allocation</text>
      <text x="360" y="86" fontSize="8" fill="#78716c" fontFamily="sans-serif" fontWeight="600">Annualised ROI by deal</text>
      {/* Pie placeholder */}
      <circle cx="160" cy="135" r="38" fill="#e7e5e4" />
      <path d="M160,135 L160,97 A38,38 0 0,1 197,152 Z" fill="#1B2A4A" />
      <path d="M160,135 L197,152 A38,38 0 0,1 122,163 Z" fill="#C1533C" />
      <path d="M160,135 L122,163 A38,38 0 0,1 160,97 Z" fill="#4A5670" />
      <circle cx="160" cy="135" r="20" fill="#f8f7f5" />
      {/* Bar chart placeholder */}
      {[55, 38, 72, 31].map((h, i) => (
        <rect key={i} x={370 + i * 72} y={170 - h} width="40" height={h} rx="3" fill="#C1533C" />
      ))}
      {["Deal A", "Deal B", "Deal C", "Deal D"].map((lbl, i) => (
        <text key={i} x={390 + i * 72} y="185" fontSize="7" textAnchor="middle" fill="#78716c" fontFamily="sans-serif">{lbl}</text>
      ))}
      {/* Alerts row */}
      <rect x="8" y="170" width="300" height="22" rx="4" fill="#fef3c7" stroke="#fcd34d" strokeWidth="0.5" />
      <text x="18" y="185" fontSize="8" fill="#92400e" fontFamily="sans-serif">⚠ Bridge debt is 71% of total capital base</text>
    </svg>
  );
}

/** Deal list card mockup */
function DealListMockup() {
  return (
    <svg viewBox="0 0 700 140" className="w-full rounded border border-vx-divider" style={{ maxHeight: 140, background: "#f8f7f5" }}>
      {[
        ["14 Sample Terrace", "Refurbishment", "PROCEED", "#15803d", "£32,400", "28.4%"],
        ["7 Oak Street",      "Under Offer",   "CAUTION",  "#b45309", "£18,100", "19.1%"],
        ["22 Mill Lane",      "Prospecting",   "REJECT",   "#b91c1c", "−£4,200",  "—"],
      ].map(([name, status, verdict, vc, profit, roi], i) => (
        <g key={i} transform={`translate(0, ${i * 44})`}>
          <rect x="8" y="4" width="684" height="36" rx="6" fill="#fff" stroke="#e7e5e4" strokeWidth="1" />
          <text x="20" y="20" fontSize="10" fontWeight="600" fill="#1B2A4A" fontFamily="sans-serif">{name}</text>
          {/* Status pill */}
          <rect x="20" y="24" width={status.length * 5.8 + 8} height="12" rx="6" fill="#e7e5e4" />
          <text x={20 + 4} y="33" fontSize="7.5" fill="#57534e" fontFamily="sans-serif">{status}</text>
          {/* Verdict pill */}
          <rect x={20 + status.length * 5.8 + 14} y="24" width={verdict.length * 5.8 + 8} height="12" rx="6" fill={vc} fillOpacity="0.15" />
          <text x={20 + status.length * 5.8 + 18} y="33" fontSize="7.5" fontWeight="700" fill={vc} fontFamily="sans-serif">{verdict}</text>
          {/* Financials */}
          <text x="480" y="20" fontSize="9" fill="#1B2A4A" fontFamily="monospace">Profit {profit}</text>
          <text x="600" y="20" fontSize="9" fill="#1B2A4A" fontFamily="monospace">Ann. ROI {roi}</text>
        </g>
      ))}
    </svg>
  );
}

/** Decision Brief verdict mockup */
function DecisionBriefMockup() {
  return (
    <svg viewBox="0 0 700 180" className="w-full rounded border border-vx-divider" style={{ maxHeight: 180, background: "#f8f7f5" }}>
      {/* Header bar */}
      <rect x="8" y="8" width="684" height="42" rx="6" fill="#1B2A4A" />
      <text x="24" y="26" fontSize="11" fontWeight="700" fill="#fff" fontFamily="sans-serif">Decision Brief — 14 Sample Terrace</text>
      <text x="24" y="40" fontSize="8" fill="rgba(255,255,255,0.6)" fontFamily="sans-serif">Generated 04 Oct 2026 · Funding mode: Bridging</text>
      {/* BUY badge */}
      <rect x="590" y="14" width="46" height="26" rx="5" fill="#15803d" />
      <text x="613" y="31" fontSize="11" fontWeight="800" fill="#fff" fontFamily="sans-serif" textAnchor="middle">BUY</text>
      {/* Stats row */}
      {[
        ["Price", "£90,000"],
        ["GDV", "£145,000"],
        ["Net profit", "£32,400"],
        ["Profit/cost", "22.3%"],
        ["Cash in", "£55,000"],
        ["ICR", "1.42×"],
      ].map(([lbl, val], i) => (
        <g key={i} transform={`translate(${8 + i * 114}, 58)`}>
          <rect width="108" height="38" rx="5" fill="#fff" stroke="#e7e5e4" strokeWidth="0.8" />
          <text x="8" y="14" fontSize="7" fill="#78716c" fontFamily="sans-serif">{lbl}</text>
          <text x="8" y="30" fontSize="11" fontWeight="700" fill="#1B2A4A" fontFamily="monospace">{val}</text>
        </g>
      ))}
      {/* Risk register preview */}
      <text x="16" y="115" fontSize="8" fontWeight="600" fill="#78716c" fontFamily="sans-serif">RISK REGISTER</text>
      <rect x="8" y="120" width="340" height="16" rx="3" fill="#fef3c7" stroke="#fcd34d" strokeWidth="0.5" />
      <text x="16" y="131" fontSize="7.5" fill="#92400e" fontFamily="sans-serif">Med — Refurb cost not estimated — Get builder quotes before bidding</text>
      <rect x="356" y="120" width="336" height="16" rx="3" fill="#f0fdf4" stroke="#86efac" strokeWidth="0.5" />
      <text x="364" y="131" fontSize="7.5" fill="#15803d" fontFamily="sans-serif">Low — EPC D — Within lettable range; plan C upgrade by 2030</text>
      {/* Max bid */}
      <rect x="8" y="144" width="684" height="26" rx="5" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="0.8" />
      <text x="20" y="160" fontSize="8" fill="#1e40af" fontFamily="sans-serif">Max bid (locked): £96,500 · Solved at 25th-percentile GDV £138,000 · Target profit £25,000</text>
    </svg>
  );
}

/** Pipeline triage checklist mockup */
function PipelineMockup() {
  return (
    <svg viewBox="0 0 700 200" className="w-full rounded border border-vx-divider" style={{ maxHeight: 200, background: "#f8f7f5" }}>
      {/* Lead card */}
      <rect x="8" y="8" width="300" height="80" rx="6" fill="#fff" stroke="#e7e5e4" strokeWidth="1" />
      <text x="20" y="26" fontSize="10" fontWeight="600" fill="#1B2A4A" fontFamily="sans-serif">22 Victoria Road, Bradford</text>
      <rect x="20" y="30" width="36" height="12" rx="6" fill="#1B2A4A" />
      <text x="24" y="39.5" fontSize="7" fill="#fff" fontFamily="sans-serif">Auction</text>
      <rect x="60" y="30" width="50" height="12" rx="6" fill="#fef3c7" stroke="#fcd34d" strokeWidth="0.5" />
      <text x="64" y="39.5" fontSize="7" fill="#92400e" fontFamily="sans-serif">Late entry</text>
      <rect x="115" y="30" width="56" height="12" rx="6" fill="#fef3c7" stroke="#fcd34d" strokeWidth="0.5" />
      <text x="119" y="39.5" fontSize="7" fill="#92400e" fontFamily="sans-serif">No viewings</text>
      <text x="20" y="58" fontSize="8" fill="#57534e" fontFamily="sans-serif">Guide: £85,000 · Terrace · 3 bed · BD3</text>
      <text x="20" y="72" fontSize="8" fill="#57534e" fontFamily="sans-serif">Auction: 15 Nov 2026 · AML Auctions</text>
      {/* IMD pill */}
      <rect x="220" y="56" width="36" height="12" rx="6" fill="#f0fdf4" stroke="#86efac" strokeWidth="0.5" />
      <text x="224" y="65" fontSize="7" fill="#15803d" fontFamily="sans-serif">IMD 7/10</text>
      {/* Triage panel */}
      <rect x="320" y="8" width="372" height="184" rx="6" fill="#fff" stroke="#e7e5e4" strokeWidth="1" />
      <text x="334" y="26" fontSize="9" fontWeight="600" fill="#1B2A4A" fontFamily="sans-serif">Bid Ready Gate</text>
      {[
        ["Do you know this area well?",            true,  true],
        ["Does the asset type fit your strategy?", true,  true],
        ["Does the condition add value?",          true,  true],
        ["Is the seller genuinely motivated?",     false, true],
        ["Is the guide price sensible?",           false, false],
        ["Is the value-add clear?",                true,  true],
        ["Can you sell in 12m / refi in 6m?",      true,  true],
        ["Is the area strong on V, V, D?",          true,  true],
      ].map(([q, answered, yes], i) => (
        <g key={i} transform={`translate(334, ${36 + i * 18})`}>
          <text x="0" y="10" fontSize="7.5" fill="#44403c" fontFamily="sans-serif">{q}</text>
          {answered ? (
            <>
              <rect x="256" y="1" width="22" height="12" rx="3" fill={yes ? "#dcfce7" : "#fee2e2"} />
              <text x="265" y="10.5" fontSize="7.5" fontWeight="700" fill={yes ? "#15803d" : "#b91c1c"} textAnchor="middle" fontFamily="sans-serif">{yes ? "Y" : "N"}</text>
              <rect x="282" y="1" width="22" height="12" rx="3" fill="#f5f5f4" />
            </>
          ) : (
            <>
              <rect x="256" y="1" width="22" height="12" rx="3" fill="#f5f5f4" />
              <rect x="282" y="1" width="22" height="12" rx="3" fill="#f5f5f4" />
            </>
          )}
        </g>
      ))}
      {/* Result badge */}
      <rect x="334" y="183" width="60" height="0" /> {/* spacer */}
      <rect x="556" y="172" width="120" height="14" rx="4" fill="#dcfce7" stroke="#86efac" strokeWidth="0.5" />
      <text x="616" y="181.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#15803d" fontFamily="sans-serif">Triage: PASS</text>
    </svg>
  );
}

/** Area Screener table mockup */
function ScreenerMockup() {
  return (
    <svg viewBox="0 0 700 190" className="w-full rounded border border-vx-divider" style={{ maxHeight: 190, background: "#f8f7f5" }}>
      {/* Controls bar */}
      <rect x="8" y="8" width="684" height="28" rx="5" fill="#fff" stroke="#e7e5e4" strokeWidth="0.8" />
      <rect x="16" y="14" width="72" height="16" rx="4" fill="#1B2A4A" />
      <text x="52" y="24" textAnchor="middle" fontSize="8" fill="#fff" fontFamily="sans-serif">BRRR</text>
      <rect x="94" y="14" width="56" height="16" rx="4" fill="#e7e5e4" />
      <text x="122" y="24" textAnchor="middle" fontSize="8" fill="#57534e" fontFamily="sans-serif">Flip</text>
      <rect x="160" y="14" width="60" height="16" rx="4" fill="#1B2A4A" />
      <text x="190" y="24" textAnchor="middle" fontSize="8" fill="#fff" fontFamily="sans-serif">Terraced</text>
      <rect x="228" y="14" width="56" height="16" rx="4" fill="#e7e5e4" />
      <text x="256" y="24" textAnchor="middle" fontSize="8" fill="#57534e" fontFamily="sans-serif">Semi</text>
      <text x="300" y="24" fontSize="8" fill="#78716c" fontFamily="sans-serif">Max price: £150,000</text>
      <rect x="560" y="14" width="120" height="16" rx="4" fill="#f5f5f4" stroke="#e7e5e4" strokeWidth="0.5" />
      <text x="620" y="24" textAnchor="middle" fontSize="8" fill="#57534e" fontFamily="sans-serif">⚙ Weights</text>
      {/* Table header */}
      <rect x="8" y="44" width="684" height="18" rx="3" fill="#f5f5f4" />
      {["#", "Council", "Nation", "Score", "Price", "Yield", "12m growth", "Sales 12m", "Flip rate"].map((h, i) => (
        <text key={i} x={[18, 46, 148, 224, 280, 350, 420, 506, 596][i]} y="56.5" fontSize="7.5" fontWeight="600" fill="#78716c" fontFamily="sans-serif">{h}</text>
      ))}
      {/* Rows */}
      {[
        ["1", "Bradford",    "England", "87", "£128k", "7.2%", "+4.1%", "2,840", "6.8%"],
        ["2", "Rochdale",    "England", "83", "£115k", "7.8%", "+3.6%", "1,920", "7.1%"],
        ["3", "Burnley",     "England", "79", "£98k",  "8.4%", "+2.9%", "1,340", "8.2%"],
        ["4", "Rotherham",   "England", "75", "£121k", "6.9%", "+3.2%", "2,110", "5.9%"],
        ["5", "Stoke-on-T.", "England", "71", "£132k", "6.5%", "+2.1%", "2,680", "5.4%"],
      ].map(([rank, name, nation, score, price, yld, g12, sales, flip], i) => (
        <g key={i} transform={`translate(0, ${i * 22})`}>
          <rect x="8" y="64" width="684" height="20" rx="2" fill={i % 2 === 0 ? "#fff" : "#fafaf9"} />
          <text x="18" y="77" fontSize="8" fill="#a8a29e" fontFamily="monospace">{rank}</text>
          <text x="46" y="77" fontSize="8.5" fontWeight="500" fill="#1B2A4A" fontFamily="sans-serif" style={{ cursor: "pointer", fill: "#1B2A4A", textDecoration: "underline" }}>{name}</text>
          <text x="148" y="77" fontSize="8" fill="#78716c" fontFamily="sans-serif">{nation}</text>
          <text x="224" y="77" fontSize="9" fontWeight="700" fill="#1B2A4A" fontFamily="monospace">{score}</text>
          <text x="280" y="77" fontSize="8" fill="#44403c" fontFamily="monospace">{price}</text>
          <text x="350" y="77" fontSize="8" fill="#44403c" fontFamily="monospace">{yld}</text>
          <text x="420" y="77" fontSize="8" fill={parseFloat(g12) >= 0 ? "#15803d" : "#b91c1c"} fontFamily="monospace">{g12}</text>
          <text x="506" y="77" fontSize="8" fill="#44403c" fontFamily="monospace">{sales}</text>
          <text x="596" y="77" fontSize="8" fill="#44403c" fontFamily="monospace">{flip}</text>
        </g>
      ))}
    </svg>
  );
}

/** Funding Planner bridge mode mockup */
function FundingPlannerMockup() {
  return (
    <svg viewBox="0 0 700 190" className="w-full rounded border border-vx-divider" style={{ maxHeight: 190, background: "#f8f7f5" }}>
      {/* Headline KPIs */}
      {[
        ["Cash required", "£55,000", "#1B2A4A"],
        ["Flip profit",   "£32,400", "#15803d"],
        ["Money left in", "£0",      "#1B2A4A"],
        ["ICR",           "1.42×",   "#15803d"],
        ["Fund days",     "195d",    "#1B2A4A"],
      ].map(([lbl, val, col], i) => (
        <g key={i} transform={`translate(${8 + i * 137}, 8)`}>
          <rect width="130" height="42" rx="5" fill="#fff" stroke="#e7e5e4" strokeWidth="0.8" />
          <text x="10" y="16" fontSize="7" fill="#78716c" fontFamily="sans-serif">{lbl}</text>
          <text x="10" y="32" fontSize="13" fontWeight="700" fill={col} fontFamily="monospace">{val}</text>
        </g>
      ))}
      {/* Mode tabs */}
      <rect x="8" y="60" width="684" height="22" rx="4" fill="#e7e5e4" />
      <rect x="8" y="60" width="160" height="22" rx="4" fill="#1B2A4A" />
      <text x="88" y="74.5" textAnchor="middle" fontSize="8.5" fill="#fff" fontFamily="sans-serif" fontWeight="600">Bridging</text>
      <text x="250" y="74.5" textAnchor="middle" fontSize="8.5" fill="#78716c" fontFamily="sans-serif">Cash purchase</text>
      <text x="410" y="74.5" textAnchor="middle" fontSize="8.5" fill="#78716c" fontFamily="sans-serif">BTL mortgage</text>
      {/* Flip vs BRRR columns */}
      <rect x="8" y="90" width="338" height="92" rx="5" fill="#fff" stroke="#e7e5e4" strokeWidth="0.8" />
      <text x="18" y="106" fontSize="8.5" fontWeight="600" fill="#1B2A4A" fontFamily="sans-serif">Flip exit</text>
      {[
        ["GDV",              "£145,000"],
        ["Selling costs",    "£2,720"],
        ["Net sale",         "£142,280"],
        ["Cash in",          "£55,000"],
        ["Bridge redemption","£55,880"],
        ["Profit",           "£32,400"],
      ].map(([lbl, val], i) => (
        <g key={i} transform={`translate(0, ${i * 12})`}>
          <text x="18" y="118" fontSize="7.5" fill="#78716c" fontFamily="sans-serif">{lbl}</text>
          <text x="320" y="118" textAnchor="end" fontSize="7.5" fill={lbl === "Profit" ? "#15803d" : "#1B2A4A"} fontFamily="monospace" fontWeight={lbl === "Profit" ? "700" : "400"}>{val}</text>
        </g>
      ))}
      <rect x="354" y="90" width="338" height="92" rx="5" fill="#fff" stroke="#e7e5e4" strokeWidth="0.8" />
      <text x="364" y="106" fontSize="8.5" fontWeight="600" fill="#1B2A4A" fontFamily="sans-serif">BRRR exit</text>
      {[
        ["GDV",              "£145,000"],
        ["Refi loan (75%)",  "£108,750"],
        ["Bridge redemption","£55,880"],
        ["Product fee",      "£1,088"],
        ["Money left in",    "£0"],
      ].map(([lbl, val], i) => (
        <g key={i} transform={`translate(346, ${i * 12})`}>
          <text x="18" y="118" fontSize="7.5" fill="#78716c" fontFamily="sans-serif">{lbl}</text>
          <text x="320" y="118" textAnchor="end" fontSize="7.5" fill={lbl === "Money left in" ? "#15803d" : "#1B2A4A"} fontFamily="monospace" fontWeight={lbl === "Money left in" ? "700" : "400"}>{val}</text>
        </g>
      ))}
      {/* No money left in badge */}
      <rect x="558" y="154" width="130" height="14" rx="4" fill="#dcfce7" stroke="#86efac" strokeWidth="0.5" />
      <text x="623" y="163.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#15803d" fontFamily="sans-serif">No money left in ✓</text>
    </svg>
  );
}

/** BRRR refinance readiness mockup */
function BrrrReadinessMockup() {
  return (
    <svg viewBox="0 0 700 140" className="w-full rounded border border-vx-divider" style={{ maxHeight: 140, background: "#f8f7f5" }}>
      <rect x="8" y="8" width="684" height="124" rx="6" fill="#fff" stroke="#e7e5e4" strokeWidth="1" />
      <text x="20" y="26" fontSize="9" fontWeight="600" fill="#1B2A4A" fontFamily="sans-serif">Refinance Readiness — 14 Sample Terrace</text>
      {/* Verdict badge */}
      <rect x="580" y="14" width="100" height="20" rx="5" fill="#dcfce7" stroke="#86efac" strokeWidth="0.8" />
      <text x="630" y="27" textAnchor="middle" fontSize="9" fontWeight="700" fill="#15803d" fontFamily="sans-serif">READY ✓</text>
      {[
        [true,  "At least 3 months' clean rent ledger (seasoning)"],
        [true,  "No missed payments in the last 6 entries"],
        [true,  "All compliance items valid"],
        [true,  "EPC rating C or better"],
        [false, "Deposit protected with a government-approved scheme"],
      ].map(([pass, label], i) => (
        <g key={i} transform={`translate(20, ${36 + i * 18})`}>
          <circle cx="7" cy="7" r="7" fill={pass ? "#dcfce7" : "#fee2e2"} />
          <text x="7" y="10.5" textAnchor="middle" fontSize="8" fill={pass ? "#15803d" : "#b91c1c"} fontFamily="sans-serif">{pass ? "✓" : "✗"}</text>
          <text x="20" y="11" fontSize="8" fill={pass ? "#44403c" : "#b91c1c"} fontFamily="sans-serif">{label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Compliance calendar mockup */
function ComplianceMockup() {
  return (
    <svg viewBox="0 0 700 130" className="w-full rounded border border-vx-divider" style={{ maxHeight: 130, background: "#f8f7f5" }}>
      <rect x="8" y="8" width="684" height="20" rx="3" fill="#f5f5f4" />
      {["Document", "Expiry date", "Status", ""].map((h, i) => (
        <text key={i} x={[20, 220, 380, 540][i]} y="21.5" fontSize="7.5" fontWeight="600" fill="#78716c" fontFamily="sans-serif">{h}</text>
      ))}
      {[
        ["Gas Safety Certificate",  "01 Mar 2027", "Valid",          "#15803d", "#f0fdf4", "#86efac"],
        ["EICR (Electrical)",       "14 Jan 2025", "Overdue",        "#b91c1c", "#fee2e2", "#fca5a5"],
        ["EPC Certificate",         "06 Nov 2025", "Expiring Soon",  "#b45309", "#fef3c7", "#fcd34d"],
        ["Deposit Protection",      "22 Sep 2026", "Valid",          "#15803d", "#f0fdf4", "#86efac"],
        ["HMO Licence",             "—",           "Unknown",        "#78716c", "#f5f5f4", "#e7e5e4"],
      ].map(([doc, date, status, tc, bg, border], i) => (
        <g key={i} transform={`translate(0, ${i * 19})`}>
          <rect x="8" y="30" width="684" height="17" rx="2" fill={i % 2 === 0 ? "#fff" : "#fafaf9"} />
          <text x="20" y="41.5" fontSize="8" fill="#44403c" fontFamily="sans-serif">{doc}</text>
          <text x="220" y="41.5" fontSize="8" fill="#44403c" fontFamily="monospace">{date}</text>
          <rect x="370" y="32" width={status.length * 5.8 + 8} height="13" rx="5" fill={bg} stroke={border} strokeWidth="0.5" />
          <text x={374} y="41.5" fontSize="7.5" fontWeight="600" fill={tc} fontFamily="sans-serif">{status}</text>
        </g>
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION DATA — `terms` is the flat search index for each section.
   ═══════════════════════════════════════════════════════════════════════════ */

const SECTIONS = [
  {
    id: "overview",
    title: "What is DealsDash?",
    icon: BookOpen,
    terms: "overview introduction workflow sign in login google account firestore sync navigation sidebar dashboard workspace pipeline deals playbooks capital planner risk contacts properties screener notifications",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Home,
    terms: "dashboard kpi total capital base free cash committed runway portfolio roi active deals rental compliance alerts leverage concentration shortfall funding gap risk high chart allocation annualised",
  },
  {
    id: "workspace",
    title: "Workspace (Map)",
    icon: Map,
    terms: "workspace map satellite geocoding postcode filter url pin lead deal geographic concentration",
  },
  {
    id: "pipeline",
    title: "Pipeline (Sourcing)",
    icon: Layers,
    terms: "pipeline sourcing lead triage auction signal new watchlist under offer promoted rejected unsold check late entry no viewings late pack reduced withdrawn prior unsold imd deprivation momentum promote deal gating question area known asset type condition liquid seller motivated guide price value add",
  },
  {
    id: "deals",
    title: "Deals — list view",
    icon: Building2,
    terms: "deals list proceed caution reject verdict badge threshold net profit roi annualised buy box default",
  },
  {
    id: "dealdetail",
    title: "Deal detail — all twelve tabs",
    icon: Building2,
    terms: "deal detail tabs property comps comparables floor area gdv condition adjustment purchase funding price sdlt stamp duty additional property own cash bridge ltv monthly rate arrangement exit fee funding planner cash bridge bridging brrr mortgage icr interest coverage retained serviced flip profit money left in cash released refurb refurbishment trades contingency timeline holding phases weeks months returns rental yield void management maintenance insurance btl remortgage refi risk score weighted factors crime social housing income population demand liquidity flood school simulate what if max bid decision brief buy watch pass legal pack red flag viewing survey apply survey epc compliance",
  },
  {
    id: "playbooks",
    title: "Playbooks (Buy Box)",
    icon: BookMarked,
    terms: "playbooks buy box filters assumptions thresholds postcode area district property type tenure max guide price bridge rate fees ltv icr stress rate profit on cost net profit roi risk score snapshot reapply override",
  },
  {
    id: "capital",
    title: "Capital & Cash Flow",
    icon: Wallet,
    terms: "capital cash flow ledger contribution direction in out total capital base free cash runway monthly burn lender fund size revolving rate settings",
  },
  {
    id: "planner",
    title: "Business Planner",
    icon: TrendingUp,
    terms: "business planner simulation 60 months income target monthly capital starting cash per deal duration profit concurrent deals run rate chart",
  },
  {
    id: "risk",
    title: "Risk Exposure",
    icon: ShieldAlert,
    terms: "risk exposure leverage bridge debt concentration capital exposure town portfolio alerts",
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: Users,
    terms: "contacts trade professional preferred active untested avoid status rating area covered rate solicitor broker agent builder electrician plumber",
  },
  {
    id: "properties",
    title: "Properties (Rental Portfolio)",
    icon: KeyRound,
    terms: "properties rental portfolio compliance gas safety eicr epc hmo deposit protection prs right to rent tenancy tenant rent ledger paid late partial missed arrears seasoning brrr readiness ready almost ready not ready refinance refi",
  },
  {
    id: "screener",
    title: "Area Screener",
    icon: Radar,
    terms: "area screener score rank council local authority flip brrr terraced semi price yield 12m growth sales liquidity flip rate flip evidence uplift drill down outcode district weight nation england wales scotland northern ireland partial no brrr send sourcing",
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Bell,
    terms: "notifications bell inbox unread auction approaching closing today outcome due triage gates incomplete legal pack stale deal placeholder assumptions email digest instant firebase extension",
  },
  {
    id: "flags",
    title: "All flags & indicators quick reference",
    icon: Star,
    terms: "flags indicators badges proceed caution reject buy watch pass funding gap fits buy box outside buy box no money left in cash released icr epc imd imdd flood areas compliance valid expiring overdue partial no brrr ni",
  },
];

/* ─── Section content renderers ─────────────────────────────────────────── */

function OverviewContent({ query }) {
  return (
    <>
      <p>DealsDash is a deal-appraisal and portfolio-management platform for UK property investors running a flipping or BRRR (Buy–Refurbish–Refinance–Rent) strategy. Everything syncs in real time through Firestore so your numbers are the same on every device.</p>
      <p className="font-semibold text-vx-text">Core workflow in four steps:</p>
      <ol className="list-decimal list-inside space-y-1 text-vx-muted">
        <li><span className="text-vx-text font-medium">Screen</span> — use Area Screener to rank 300+ UK councils by yield, growth, and flip evidence</li>
        <li><span className="text-vx-text font-medium">Source</span> — track leads in the Pipeline, run triage questions, review legal packs</li>
        <li><span className="text-vx-text font-medium">Appraise</span> — open a Deal, fill in the twelve tabs, read the Decision Brief</li>
        <li><span className="text-vx-text font-medium">Manage</span> — move completed deals to the rental portfolio, track compliance and BRRR readiness</li>
      </ol>
      <Callout tone="info">
        <span><strong>Sign-in:</strong> The app is locked to a single Google account. All data lives in your private Firestore sub-tree — no other user can access it.</span>
      </Callout>
      <FieldList query={query} items={[
        ["Dashboard",       "Live portfolio health — KPIs, charts, alerts"],
        ["Workspace",       "Map view of all leads and deals with filter rail"],
        ["Pipeline",        "Lead inbox — auction and off-market sourcing"],
        ["Deals",           "Full deal appraisals"],
        ["Playbooks",       "Buy box: your investment criteria and financial assumptions"],
        ["Capital & cash",  "Capital ledger, cash runway, revolving fund settings"],
        ["Business planner","60-month income simulation"],
        ["Risk exposure",   "Portfolio-level leverage, concentration, and alert summary"],
        ["Contacts",        "Trade and professional directory"],
        ["Properties",      "Rental portfolio and BRRR readiness tracker"],
        ["Area Screener",   "Data-driven council scoring tool"],
        ["Notifications",   "In-app alert inbox"],
      ]} />
    </>
  );
}

function DashboardContent({ query }) {
  return (
    <>
      <p>The Dashboard shows the live health of your entire business. Every figure re-calculates whenever you update a deal — nothing here is cached.</p>
      <DashboardMockup />
      <p className="font-semibold text-vx-text">KPI strip (top row):</p>
      <FlagTable query={query} rows={[
        ["Total capital base",        "Capital contributed + realised profit from sold deals",                                              "Growing each quarter"],
        ["Free cash",                 "Capital base minus cash committed to live deals",                                                    "Positive; red if negative (over-committed)"],
        ["Committed to deals",        "Sum of own cash across all active deals",                                                            "Should not exceed capital base"],
        ["Cash runway",               "Free cash ÷ monthly burn rate. '∞' when burn rate is zero",                                         "≥ 6 months; red if < 3 months"],
        ["Portfolio annualised ROI",  "Weighted average annualised ROI, weighted by cash deployed per deal",                                "≥ 25% (shown in green)"],
        ["Active deals",              "Deals in Under Offer, Refurbishment, or Marketing status",                                           "Matched to your concurrency target"],
        ["Rental portfolio",          "Properties under management; sub-label shows compliance issues",                                     "Zero compliance issues"],
      ]} />
      <p className="font-semibold text-vx-text">Alert types:</p>
      <FlagTable query={query} rows={[
        ["Funding shortfall",        "A deal's required funds exceed own cash + bridge available",        "No shortfall alerts"],
        ["High risk deal",           "A deal's weighted risk score < 3.0",                               "No risk alerts"],
        ["Cash runway < 3 months",   "Free cash / monthly burn is critically low",                       "≥ 3 months free runway"],
        ["Geographic concentration", "One town holds > 60% of committed capital",                        "< 60% in any one town"],
        ["Leverage > 70%",           "Bridge debt / total capital exceeds 70%",                          "< 70% leverage ratio"],
        ["Compliance overdue",       "A rental property has an expired compliance document",             "All documents valid"],
      ]} />
      <Callout tone="good">
        A healthy dashboard shows: positive free cash, ≥ 25% portfolio ROI, no red alerts, and no compliance issues — that is the benchmark to aim for.
      </Callout>
    </>
  );
}

function WorkspaceContent({ query }) {
  return (
    <>
      <p>The Workspace is a spatial view of your sourcing activity. Every lead and deal with a valid postcode is plotted on an interactive map.</p>
      <FieldList query={query} items={[
        ["Filter rail",          "Left panel — filter by status, deal stage, and area to focus the map."],
        ["Satellite toggle",     "Switch between road and satellite view — useful for assessing street quality."],
        ["Pin click",            "Opens a mini-card for the lead/deal with key stats and a link to the full record."],
        ["URL-persisted filters","Map filters are saved in the URL so you can share or bookmark a filtered view."],
      ]} />
      <Callout tone="info">Postcodes are geocoded via postcodes.io. If a pin doesn't appear, check that the postcode field is filled in on the lead or deal.</Callout>
    </>
  );
}

function PipelineContent({ query }) {
  return (
    <>
      <p>The Pipeline is a Kanban board for leads — properties on your radar before they become a full appraisal.</p>
      <PipelineMockup />
      <p className="font-semibold text-vx-text">Lead statuses:</p>
      <FlagTable query={query} rows={[
        ["New",          "Just logged; automated gate check runs against your buy box",        "Move to Watchlist or reject within 48h"],
        ["Watchlist",    "Worth watching; monitoring for price changes or new info",           "Continue researching; set auction date"],
        ["Under offer",  "You've bid or made an offer",                                        "Triage complete, legal pack reviewed"],
        ["Promoted",     "Converted to a full Deal appraisal",                                 "Terminal — no further action in Pipeline"],
        ["Rejected",     "Doesn't meet criteria — auto-set when buy box gate fails",           "Terminal — document why in notes"],
        ["Unsold check", "(Derived) Auction date passed without a status update",              "Re-verify outcome and update status"],
      ]} />
      <p className="font-semibold text-vx-text">Auction signals:</p>
      <FlagTable query={query} rows={[
        ["Late entry",          "Property entered auction catalogue recently",                  "Combined with low comparables = opportunity"],
        ["No viewings",         "No viewings booked — less competition likely",                 "Verify with auction house"],
        ["Late legal pack",     "Pack released after standard deadline",                        "Allow extra time for solicitor review"],
        ["Price reduced",       "Guide price has been lowered",                                 "Re-run max bid solver against new guide"],
        ["Previously withdrawn","Withdrawn from a previous sale or auction",                    "Investigate why — chain falls, lender issue?"],
        ["Previously unsold",   "Failed to sell at auction before",                             "Original reserve may have been too high"],
      ]} />
      <p className="font-semibold text-vx-text">Triage gate (8 questions):</p>
      <FlagTable query={query} rows={[
        ["Area known? (gating)",              "Do you know this area well enough to be confident in GDV and demand?",   "Yes"],
        ["Asset type fits? (gating)",          "Does the property type match your buy box?",                            "Yes"],
        ["Condition adds value? (gating)",     "Will refurb genuinely improve value and saleability?",                  "Yes"],
        ["Seller motivated? (informational)",  "Evidence of a genuine vendor (probate, speed, financial distress)?",   "Yes"],
        ["Guide price sensible? (info)",       "Is the guide realistic given comparable evidence?",                    "Yes"],
        ["Value-add clear? (info)",            "Can you clearly articulate the specific improvement driving upside?",   "Yes"],
        ["Can sell/refi in time? (gating)",    "Liquidity constraint — needed for BRRR timing and bridge term",        "Yes"],
        ["Area strong on V, V, D? (gating)",  "Value, Volume, Demand — key area strength test",                        "Yes"],
      ]} />
      <Callout tone="warn">Any single 'No' on a <strong>gating</strong> question auto-rejects the lead and forces PASS on the Decision Brief. Questions 4–6 are informational — a 'No' there alone does not reject.</Callout>
    </>
  );
}

function DealsContent({ query }) {
  return (
    <>
      <p>The Deals list shows every appraisal. Each card shows the key financials and the deal verdict.</p>
      <DealListMockup />
      <p className="font-semibold text-vx-text">Verdict badges:</p>
      <FlagTable query={query} rows={[
        ["PROCEED (green)","Net profit, ROI, annual ROI, risk score, funding, and owner-occupier demand all pass thresholds",  "Aim for all active deals"],
        ["CAUTION (amber)","1–2 checks fail",                                                                                   "Identify the failing checks; address or accept"],
        ["REJECT (red)",   "3 or more checks fail",                                                                             "Only proceed with strong mitigating evidence"],
      ]} />
      <Callout tone="info">Thresholds come from your default Buy Box (Playbooks). Defaults: net profit ≥ £25k, ROI ≥ 20%, annualised ROI ≥ 25%, risk score ≥ 3.0.</Callout>
    </>
  );
}

function DealDetailContent({ query }) {
  return (
    <>
      <p>Each deal has twelve tabs. Fill them left to right for a complete appraisal.</p>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 1 — Property &amp; comps</p>
        <FieldList query={query} items={[
          ["Address / postcode",     "Full address and postcode. Postcode triggers IMD lookup and price momentum pill."],
          ["Property type",          "Terrace, Semi, Detached, or Flat. Used in buy box gate check."],
          ["Floor area (sq ft)",     "The key GDV driver — get it from the EPC or Rightmove listing."],
          ["Condition (1–5)",        "1 = very poor, 5 = ready to let. Higher condition suppresses value-add rationale."],
          ["Condition adj %",        "± % multiplier applied to the GDV. Use for properties above/below average condition."],
          ["GDV override",           "Lock GDV to your own figure. When blank, GDV = avg £/sq ft (from comps) × floor area × condition adj."],
          ["Comparables",            "3+ recent sold prices with address, price, date, and floor area. Unlocks the P25/median/P75 £/sq ft distribution."],
          ["Owner-occupier demand",  "Y/N. N triggers a failing check on the verdict."],
        ]} />
        <Callout tone="good">Three or more comparables with floor area filled in unlocks the percentile £/sq ft distribution — a much stronger GDV anchor than a single average.</Callout>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 2 — Purchase &amp; funding</p>
        <FieldList query={query} items={[
          ["Purchase price",         "Your intended bid. The entire cost stack moves with this."],
          ["Additional property?",   "Toggle on if not your only property — activates the additional SDLT surcharge bands (effective 31 Oct 2024)."],
          ["Own cash (£)",           "Your own money on day one. ROI = net profit ÷ own cash."],
          ["Bridge LTV %",           "Percentage of purchase price the bridge lender funds. Typically 70–75%."],
          ["Bridge monthly rate %",  "Monthly interest rate (e.g. 0.85% = 0.0085). Most bridging is 0.7–1.0%/month."],
          ["Arrangement fee %",      "Bridge lender's upfront fee. Typically 1.5–2%."],
          ["Exit fee %",             "Bridge lender's exit fee on redemption. Typically 1%."],
          ["Acquisition fees",       "Solicitor, searches, survey, broker, valuation, Land Reg, other. Pre-filled from buy box."],
        ]} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 3 — Funding Planner</p>
        <FundingPlannerMockup />
        <FlagTable query={query} rows={[
          ["Cash in",            "Own cash required on completion day (price − bridge + SDLT + fees + refurb + arrangement ± interest)",  "Matches your available own cash"],
          ["Flip profit",        "Net sale proceeds − bridge redemption − cash in",                                                       "Positive; ideally ≥ £25k"],
          ["Money left in",      "BRRR exit: own cash not recovered after refi. Zero = full capital recycling",                           "As close to zero as possible"],
          ["Cash released ↩",   "Refi loan exceeds all costs — you pull cash OUT on exit",                                                "Excellent result"],
          ["ICR",                "Annual rent ÷ (refi loan × stress rate). Most lenders require ≥ 1.25–1.45×",                           "≥ 1.25× (set threshold in Playbooks)"],
          ["Fund days",          "Days the VIXIV revolving fund allocation is tied up",                                                   "Within 365-day fund term"],
        ]} />
        <FieldList query={query} items={[
          ["Retained interest",  "Rolls up into bridge redemption — no monthly cash outflow. Standard for most UK bridges."],
          ["Serviced interest",  "Paid monthly from own cash — lower redemption but higher day-one cash requirement."],
        ]} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 4 — Refurb</p>
        <FieldList query={query} items={[
          ["Trade line items",  "Eleven standard trades. Enter low and high quote for each trade you'll use; unused stay at zero."],
          ["Contingency %",     "Added on top of the mid-point total. 15% is the buy box default — never below 10% for a major refurb."],
          ["Refurb total",      "Mid-point of all trades plus contingency. Flows directly into the appraisal engine."],
        ]} />
        <Callout tone="good">A well-filled refurb tab has actual builder quotes with low/high ranges and ≥ 15% contingency. Zero refurb total triggers a Decision Brief risk flag.</Callout>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 5 — Timeline &amp; holding</p>
        <FieldList query={query} items={[
          ["Offer to exchange",       "Conveyancing period. Typically 3–5 weeks."],
          ["Exchange to completion",  "Typically 1–2 weeks."],
          ["Refurbishment",           "Works programme. Derived from buy box 'Works months' if set."],
          ["Marketing period",        "Derived from buy box 'Marketing months' if set."],
          ["Sale to completion",      "Second conveyancing. Typically 4–8 weeks."],
          ["Holding costs monthly",   "Council tax, insurance, utilities, other — multiplied by timeline months."],
        ]} />
        <Callout tone="warn">Bridge interest accrues for the full timeline. A 1-week overrun on a £200k bridge at 0.85%/month costs ~£392 extra.</Callout>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 6 — Returns &amp; rental</p>
        <FlagTable query={query} rows={[
          ["Gross yield",         "Annual rent ÷ GDV × 100%",                                          "≥ 6–7% for a strong BRRR deal"],
          ["Net cash flow/month", "NOI − annual mortgage payment ÷ 12",                                 "Positive; ideally ≥ £200/month after all deductions"],
          ["Cash-on-cash return", "Annual net cash flow ÷ cash left in after refi",                     "> 10% annually on recycled capital"],
        ]} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 7 — Risk</p>
        <FlagTable query={query} rows={[
          ["Score ≥ 4.0 → LOW RISK",    "Weighted average of all eight factors ≥ 4.0",          "Target for all active deals"],
          ["Score 3.0–3.9 → MED RISK",  "Acceptable but monitor the named weak factors",         "Acceptable at 3.0+ minimum"],
          ["Score < 3.0 → HIGH RISK",   "At least one major factor is very weak",                "Triggers a Dashboard alert"],
        ]} />
        <FieldList query={query} items={[
          ["Crime rate (20% weight)",           "Score 5 = very low crime vs national average."],
          ["% social housing (15%)",            "Score 5 = minimal social housing on the street."],
          ["Average household income (15%)",    "Score 5 = well above local average."],
          ["Population growth trend (10%)",     "Score 5 = growing population / strong in-migration."],
          ["Owner-occupier demand (20%)",       "Score 5 = strong evidence of owner-occupiers buying on the street. Highest weight — most predictive of exit speed."],
          ["Liquidity — days on market (10%)",  "Score 5 = properties sell in < 30 days."],
          ["Flood risk (5%)",                   "Score 5 = no flood risk zones within 3km."],
          ["School catchment quality (5%)",     "Score 5 = outstanding Ofsted rating in catchment."],
        ]} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 8 — Simulate</p>
        <p className="text-vx-muted">What-if overlay. Adjust price, GDV, bridge rate, refurb multiplier, and duration using sliders. Delta arrows show whether each change is better (▲ green) or worse (▼ red) vs the live deal. Changes are session-only — not saved.</p>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 9 — AI review</p>
        <p className="text-vx-muted">Triggers a Cloud Function that populates: Area Intelligence (IMD decile, flood risk, EPC lookup), comparable sales from Land Registry Price Paid, buy box gate check, and risk factor pre-fills.</p>
        <Callout tone="warn">Results are illustrative where the underlying data source is incomplete. Always cross-check with direct market observation before bidding.</Callout>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 10 — Legal pack</p>
        <FlagTable query={query} rows={[
          ["Pre-bid red flag",      "Blocks a BUY verdict on the Decision Brief until resolved",       "Zero pre-bid flags"],
          ["Post-purchase flag",    "Worth noting but does not block the decision",                    "Review before exchange"],
          ["Informational",         "Context only; no action required",                               "No concern"],
        ]} />
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 11 — Viewing survey</p>
        <FieldList query={query} items={[
          ["Survey items",   "Tick/note what you find. Severity levels feed into cost estimates."],
          ["Apply to deal",  "Stamps surveyed refurb costs onto the Refurb tab — merging survey lines with manually entered trades."],
          ["Max bid re-solve","If max bid isn't locked, it re-solves automatically after 'Apply to deal'."],
        ]} />
        <Callout tone="good">Best practice: complete the viewing survey for every property you physically inspect, then immediately click "Apply to deal".</Callout>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 12 — Decision Brief</p>
        <DecisionBriefMockup />
        <FlagTable query={query} rows={[
          ["PASS",  "Any of: gating Q answered No; unresolved legal pack red flag; outside buy box; profit on cost < minimum; ICR fails with debt strategy",  "No PASS conditions present"],
          ["BUY",   "All PASS conditions clear; net profit ≥ minimum; money left in ≤ maximum; all triage Qs answered",                                       "The target outcome"],
          ["WATCH", "No PASS conditions but a soft condition unmet (e.g. net profit just below minimum)",                                                      "Resolve the named condition"],
        ]} />
        <FieldList query={query} items={[
          ["Max bid solver",  "Bisects backward from your target profit to find the highest bid price at which profit still meets your minimum. Uses 25th-percentile GDV (conservative)."],
          ["Lock",            "Freezes the max bid figure. Requires explicit confirmation before a higher re-lock is accepted."],
          ["Risk register",   "Auto-generated from deal data: legal pack flags, EPC F/G, flood zones, missing refurb estimates."],
        ]} />
        <Callout tone="risk">If the max bid solver returns £0, your target profit is unachievable at any price — re-examine GDV, reduce refurb, or lower the profit target before bidding.</Callout>
      </div>
    </>
  );
}

function PlaybooksContent({ query }) {
  return (
    <>
      <p>A Playbook (buy box) defines your investment criteria. The default buy box gates incoming leads automatically and pre-fills new deals.</p>
      <FieldList query={query} items={[
        ["Filters",       "Objective criteria: postcode areas/districts, property types, tenure, max guide price. Auto-reject new leads that fail."],
        ["Assumptions",   "Financial defaults: bridge rates, fees, LTVs, timeline months, ICR stress rate, etc. Pre-filled into every new deal."],
        ["Thresholds",    "Decision Brief pass/fail thresholds: min net profit (£), min ROI %, min annualised ROI %, min risk score, profit-on-cost %."],
      ]} />
      <Callout tone="good">Review your buy box after every deal. If you consistently override the same assumption, update the buy box default so new deals start with the correct figure.</Callout>
    </>
  );
}

function CapitalContent({ query }) {
  return (
    <>
      <p>The Capital tab tracks money flowing in and out of your business. Every ledger entry feeds the Dashboard's "Total capital base" and "Free cash" KPIs.</p>
      <FieldList query={query} items={[
        ["Direction: In",      "Capital you've added to the business (own savings, investor contribution)."],
        ["Direction: Out",     "Capital withdrawn (distributions, personal drawings)."],
        ["Total capital base", "Sum of all 'in' minus all 'out' entries, plus realised profit from sold deals."],
        ["Free cash",          "Capital base minus committed cash. If negative, you've over-committed."],
        ["Monthly burn (£)",   "Fixed monthly overhead. Drives the 'cash runway' KPI on the Dashboard."],
        ["Lender fund size",   "Total size of the VIXIV revolving credit facility."],
        ["Lender fund rate",   "Annual interest rate on the revolving fund."],
      ]} />
    </>
  );
}

function PlannerContent({ query }) {
  return (
    <>
      <p>A cash recycling simulation — models how quickly your capital compounds toward a target monthly income over 60 months.</p>
      <FlagTable query={query} rows={[
        ["Deals/year at capacity",     "Max concurrent × (12 ÷ avg duration)",              "Higher is better — but must be realistic"],
        ["Steady-state annual profit", "Deals/year × avg profit/deal",                      "Should exceed your annual income target"],
        ["Capital for full capacity",  "Max concurrent × avg cash per deal",                "Must be ≤ total capital base"],
        ["Months to target",           "First month where trailing 12-month income run-rate ≥ target. '60+' if not reached", "The shorter the better"],
      ]} />
    </>
  );
}

function RiskContent({ query }) {
  return (
    <>
      <p>Portfolio-level risk view. Aggregates deal risk scores and adds structural metrics.</p>
      <FlagTable query={query} rows={[
        ["Leverage ratio",          "Bridge debt outstanding ÷ total capital base. > 70% triggers amber alert",  "< 70%"],
        ["Capital exposure",        "Committed capital ÷ total capital base. > 80% triggers amber",             "< 80%"],
        ["Largest town concentration","% of committed capital in a single town. > 60% triggers amber",         "< 60%"],
        ["Bridge debt outstanding", "Sum of drawn bridge loans across active deals",                            "Tracked, no hard threshold"],
      ]} />
    </>
  );
}

function ContactsContent({ query }) {
  return (
    <>
      <p>Trade and professional directory — two categories, four statuses.</p>
      <FlagTable query={query} rows={[
        ["Preferred",  "Your go-to for this trade/role",                  "Filter to preferred contacts when quoting"],
        ["Active",     "Currently using; relationship in good standing",  ""],
        ["Untested",   "New contact — no completed work yet",             "Aim to test before you need them urgently"],
        ["Avoid",      "Do not use again — add notes explaining why",     "Zero 'Avoid' contacts in rotation"],
      ]} />
    </>
  );
}

function PropertiesContent({ query }) {
  return (
    <>
      <p>After a BRRR deal completes, promote it to Properties — the rental portfolio and compliance management section.</p>
      <ComplianceMockup />
      <p className="font-semibold text-vx-text">Compliance item statuses:</p>
      <FlagTable query={query} rows={[
        ["Valid (green)",        "Expiry date > 60 days away",              "All items Valid before tenancy start"],
        ["Expiring Soon (amber)","Expires within 60 days",                  "Book renewal immediately"],
        ["Overdue (red)",        "Expiry date has passed — legal risk",     "Resolve immediately"],
        ["Unknown",              "No expiry date entered",                  "Enter an expiry date"],
      ]} />
      <BrrrReadinessMockup />
      <p className="font-semibold text-vx-text">BRRR refinance readiness:</p>
      <FlagTable query={query} rows={[
        ["3+ months clean rent ledger", "Lenders require rent seasoning",                 "Pass"],
        ["No missed payments (last 6)", "Recent payment history",                         "Pass"],
        ["All compliance items Valid",  "Lenders and surveyors check certificates exist", "Pass"],
        ["EPC C or better",             "Government 2030 minimum; many lenders require it now", "Pass"],
        ["Deposit protected",           "Mandatory within 30 days of receipt",            "Pass"],
      ]} />
      <FlagTable query={query} rows={[
        ["READY",        "All five checks pass",              "Target state before instructing a mortgage broker"],
        ["ALMOST READY", "Only one check failing",            "Resolve the one failing check"],
        ["NOT READY",    "Two or more checks failing",        "Work through each failing check methodically"],
      ]} />
    </>
  );
}

function ScreenerContent({ query }) {
  return (
    <>
      <p>Ranks 300+ UK local authority councils against your strategy. Data: HM Land Registry HPI, Price Paid, ONS PIPR.</p>
      <ScreenerMockup />
      <p className="font-semibold text-vx-text">Column definitions:</p>
      <FlagTable query={query} rows={[
        ["Score",        "Weighted percentile rank 0–100 vs visible areas — higher = better fit",    "> 70 is strong"],
        ["Price",        "Median sold price for your property type in the last 12 months",           "Within your max entry price"],
        ["Yield",        "Gross rental yield = annual rent ÷ price",                                 "> 6% for BRRR"],
        ["12m growth",   "House price change over the past 12 months",                               "Positive (shown in green)"],
        ["Sales 12m",    "Transactions in the last 12 months — proxy for liquidity",                 "> 50 sales for meaningful liquidity"],
        ["Flip rate",    "Proportion of sales that are flips (bought and resold within 12 months)",  "> 5% indicates active investor market"],
        ["partial flag", "Some factor data missing — score computed on available factors only",      "No partial flags in your target areas"],
      ]} />
      <FieldList query={query} items={[
        ["Strategy toggle",  "Flip weights momentum and flip evidence; BRRR weights yield and rent growth. Separate weight sets."],
        ["Drill-down",       "Click any council name to expand outcode-level data (median price, sales, flip count, uplift)."],
        ["Send to Sourcing", "Tick areas and click to add them as target areas in the Pipeline."],
      ]} />
      <Callout tone="warn">Screener scores rank areas relative to each other, not against an absolute standard. Always ground-truth with a physical visit before committing capital.</Callout>
    </>
  );
}

function NotificationsContent({ query }) {
  return (
    <>
      <p>Notifications appear in the Bell tab and are also emailed daily (digest) or instantly depending on the trigger type.</p>
      <FlagTable query={query} rows={[
        ["Auction approaching 7d / 1d",  "Digest (7 days) and instant (1 day) before an auction date",       "Review legal pack and max bid before auction day"],
        ["Closing today",                "Digest when an auction date equals today",                           "Final review; confirm you're ready to bid"],
        ["Outcome due",                  "Digest after auction date passes without a status update",           "Record outcome to clear the flag"],
        ["Triage gates incomplete",      "Instant when a new lead has unanswered gating questions",           "Answer all eight triage questions promptly"],
        ["Legal pack reviewed",          "Instant when an AI review completes on a legal pack document",      "Check for any pre-bid red flags"],
        ["Stale deal — no update 14d",   "Digest when a deal hasn't been edited in 14 days",                  "Update status or add a note"],
        ["Placeholder assumptions",      "Digest when buy box assumptions are still at default values",       "Set real figures in Playbooks → Assumptions"],
      ]} />
    </>
  );
}

function FlagsContent({ query }) {
  return (
    <>
      <p className="font-semibold text-vx-text">Verdict badges:</p>
      <FlagTable query={query} rows={[
        ["PROCEED (green)",    "≤ 0 checks fail across: profit, ROI, annual ROI, risk score, funding, occupier demand",   "All six checks pass"],
        ["CAUTION (amber)",    "1–2 checks fail",                                                                          "Identify and address the failing checks"],
        ["REJECT (red)",       "3+ checks fail",                                                                           "Major rework needed before bidding"],
        ["BUY (Brief)",        "All PASS and BUY conditions met (stricter than PROCEED)",                                  "Decision Brief target"],
        ["WATCH",              "No PASS conditions, but not all BUY conditions met",                                       "Resolve named watch condition"],
        ["PASS",               "At least one hard fail (gating Q, legal flag, buy box, ICR, profit-on-cost)",              "Resolve before progressing"],
      ]} />
      <p className="font-semibold text-vx-text mt-3">Financial indicators:</p>
      <FlagTable query={query} rows={[
        ["Funding gap £x (red)",     "Deal requires more cash than own cash + bridge combined",                   "No gap"],
        ["Fits buy box (green)",     "Postcode, property type, and tenure all match the default buy box",         "Green badge present"],
        ["Outside buy box (red)",    "At least one deterministic filter fails",                                    "Review lead against your strategy"],
        ["No money left in (green)", "BRRR refi fully recovers own cash",                                         "Full capital recycling"],
        ["Cash released ↩ (green)", "Refi loan exceeds all costs — net equity extracted",                         "Exceeds BRRR target"],
        ["ICR x.xx× (green/red)",   "Green ≥ threshold (typically 1.25×). Red = refinance at risk",              "≥ 1.25× (lender minimum)"],
      ]} />
      <p className="font-semibold text-vx-text mt-3">Area intelligence:</p>
      <FlagTable query={query} rows={[
        ["EPC A–C (green)",     "Good energy rating — no regulatory risk",                             "EPC C or better for rental properties"],
        ["EPC D–E (neutral)",   "Acceptable; D may need upgrade before 2030",                          "Plan improvement works"],
        ["EPC F–G (red)",       "Below minimum letting standard — rental restriction risk",             "Budget for energy improvement before bidding"],
        ["IMD 1–3/10 (red)",    "Most deprived 30% of LSOAs — potential demand risk",                  "Decile 8–10 for lower exit risk"],
        ["Flood areas: N (amber)","N Environment Agency flood zones within 3km",                        "0 flood areas"],
      ]} />
      <p className="font-semibold text-vx-text mt-3">Compliance:</p>
      <FlagTable query={query} rows={[
        ["Valid (green)",        "Expiry > 60 days away",                 "All items Valid"],
        ["Expiring Soon (amber)","Expires within 60 days",               "Renew immediately"],
        ["Overdue (red)",        "Expiry date passed — legal failure",   "Resolve same day"],
      ]} />
    </>
  );
}

const CONTENT_MAP = {
  overview:      OverviewContent,
  dashboard:     DashboardContent,
  workspace:     WorkspaceContent,
  pipeline:      PipelineContent,
  deals:         DealsContent,
  dealdetail:    DealDetailContent,
  playbooks:     PlaybooksContent,
  capital:       CapitalContent,
  planner:       PlannerContent,
  risk:          RiskContent,
  contacts:      ContactsContent,
  properties:    PropertiesContent,
  screener:      ScreenerContent,
  notifications: NotificationsContent,
  flags:         FlagsContent,
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function UserGuideView() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  // Determine which sections match the current query (case-insensitive substring match).
  // A section matches if the query appears in its title or in its `terms` index string.
  const matchSet = useMemo(() => {
    if (!trimmed) return null; // null = no filter active
    return new Set(
      SECTIONS
        .filter(s =>
          s.title.toLowerCase().includes(trimmed) ||
          s.terms.includes(trimmed)
        )
        .map(s => s.id)
    );
  }, [trimmed]);

  const matchCount = matchSet ? matchSet.size : SECTIONS.length;

  return (
    <div className="space-y-3">
      {/* Page header */}
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">User Guide</h1>
        <p className="text-sm text-vx-muted mt-1">
          Everything you need to understand every screen, tab, field, flag, and indicator in DealsDash.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-vx-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the guide… (e.g. ICR, max bid, triage, EPC, SDLT)"
          className="w-full pl-9 pr-9 py-2 text-sm border border-vx-border rounded-lg outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-vx-muted hover:text-vx-text"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Match count / no-results feedback */}
      {trimmed && (
        <p className="text-xs text-vx-muted">
          {matchCount === 0
            ? `No sections match "${query}" — try a different term.`
            : `${matchCount} section${matchCount !== 1 ? "s" : ""} matching "${query}"`}
        </p>
      )}

      {/* Section list */}
      <div className="space-y-2">
        {SECTIONS.map(({ id, title, icon, terms }) => {
          const ContentComponent = CONTENT_MAP[id];
          const isMatch = matchSet ? matchSet.has(id) : true;
          // Don't render sections that don't match when a query is active
          if (!isMatch) return null;
          return (
            <Section
              key={id}
              title={title}
              icon={icon}
              defaultOpen={id === "overview"}
              forceOpen={trimmed ? true : undefined}
              query={trimmed}
              searchTerms={terms}
            >
              <ContentComponent query={trimmed} />
            </Section>
          );
        })}
      </div>

      <footer className="pt-4 border-t border-vx-divider text-xs text-vx-muted">
        DealsDash User Guide · VIXIV LTD · Figures and thresholds are illustrative defaults.
        Always verify financial calculations with your solicitor, broker, and accountant before exchanging contracts.
      </footer>
    </div>
  );
}
