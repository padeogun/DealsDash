import React, { useState, useEffect, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ArrowRightCircle, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Segmented, NumberField, Note, Stat, Table, Button, formatGBP } from "../design-system/react/index.jsx";

/* ── Default weights ─────────────────────────────────────────────────── */
const DEFAULT_WEIGHTS = {
  flip: { yield: 0, rentGrowth: 0, growth12: 6, growth60: 3, liquidity: 6, flipEvidence: 8, flipUplift: 6 },
  brrr: { yield: 10, rentGrowth: 4, growth12: 3, growth60: 5, liquidity: 5, flipEvidence: 0, flipUplift: 0 },
};

const FACTOR_META = [
  { key: "yield",        label: "Gross yield",          higherBetter: true },
  { key: "rentGrowth",   label: "Rent growth (12m)",    higherBetter: true },
  { key: "growth12",     label: "Price momentum (12m)", higherBetter: true },
  { key: "growth60",     label: "5-year growth",        higherBetter: true },
  { key: "liquidity",    label: "Liquidity (sales)",    higherBetter: true },
  { key: "flipEvidence", label: "Flip evidence",        higherBetter: true },
  { key: "flipUplift",   label: "Flip uplift",          higherBetter: true },
];

const NATION_LABELS = { E: "England", W: "Wales", S: "Scotland", N: "N. Ireland" };

/* ── Helpers ─────────────────────────────────────────────────────────── */
function codeToNationKey(code) {
  if (!code) return "E";
  const p = code[0].toUpperCase();
  return p in NATION_LABELS ? p : "E";
}

function buildFlipIndex(districts) {
  const map = {};
  for (const d of (districts || [])) {
    const la = d.la_code;
    if (!map[la]) map[la] = { flips: 0, sales: 0, uplifts: [] };
    map[la].flips += (d.flips || 0);
    map[la].sales += (d.sales || 0);
    if ((d.flips || 0) > 0 && d.flip_uplift_pct != null) {
      map[la].uplifts.push(d.flip_uplift_pct);
    }
  }
  const result = {};
  for (const [la, { flips, sales, uplifts }] of Object.entries(map)) {
    const sorted = [...uplifts].sort((a, b) => a - b);
    result[la] = {
      rate: sales > 0 ? flips / sales : null,
      uplift: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    };
  }
  return result;
}

function pickValues(area, ptype, flipIndex) {
  const fi = flipIndex[area.code] || {};
  const best = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
  const minNN = (...vs) => { const v = vs.filter(x => x != null); return v.length ? Math.min(...v) : null; };

  if (ptype === "T") return {
    price: area.priceT ?? area.priceAll,
    yield: area.yieldT,
    growth12: area.growth12T,
    growth60: area.growth60T,
    rentGrowth: area.rentGrowth12,
    liquidity: area.sales12m,
    flipEvidence: fi.rate ?? null,
    flipUplift: fi.uplift ?? null,
  };
  if (ptype === "S") return {
    price: area.priceS ?? area.priceAll,
    yield: area.yieldS,
    growth12: area.growth12S,
    growth60: area.growth60T,
    rentGrowth: area.rentGrowth12,
    liquidity: area.sales12m,
    flipEvidence: fi.rate ?? null,
    flipUplift: fi.uplift ?? null,
  };
  // "B" — both: pick better quality metric, cheaper price for filter
  return {
    price: minNN(area.priceT, area.priceS) ?? area.priceAll,
    yield: best(area.yieldT, area.yieldS),
    growth12: best(area.growth12T, area.growth12S),
    growth60: area.growth60T,
    rentGrowth: area.rentGrowth12,
    liquidity: area.sales12m,
    flipEvidence: fi.rate ?? null,
    flipUplift: fi.uplift ?? null,
  };
}

function pctRank(v, sorted) {
  // sorted: ascending array of non-null values
  let below = 0;
  for (const x of sorted) { if (x < v) below++; else break; }
  return (below / sorted.length) * 100;
}

function computeScores(filteredAreas, strategy, ptype, flipIndex, weights) {
  // Rank is relative to the visible (filtered) set
  const factorArrays = {};
  for (const { key } of FACTOR_META) {
    factorArrays[key] = filteredAreas
      .filter(a => !(strategy === "brrr" && a.rentSource === null))
      .map(a => pickValues(a, ptype, flipIndex)[key])
      .filter(v => v != null)
      .sort((a, b) => a - b);
  }

  return filteredAreas.map(area => {
    const vals = pickValues(area, ptype, flipIndex);
    const niNoScore = strategy === "brrr" && area.rentSource === null;
    if (niNoScore) return { area, vals, score: null, partial: false };

    let wSum = 0, wTotal = 0, missing = 0;
    for (const { key, higherBetter } of FACTOR_META) {
      const w = weights[key] ?? 0;
      if (w === 0) continue;
      const v = vals[key];
      const sorted = factorArrays[key];
      if (v == null || sorted.length === 0) { missing++; continue; }
      let rank = pctRank(v, sorted);
      if (!higherBetter) rank = 100 - rank;
      wSum += w * rank;
      wTotal += w;
    }
    return {
      area,
      vals,
      score: wTotal > 0 ? Math.round(wSum / wTotal) : null,
      partial: missing > 0,
    };
  });
}

/* ── Sub-components ──────────────────────────────────────────────────── */
function SortTh({ label, field, sortKey, sortDir, onSort, numeric }) {
  const active = sortKey === field;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={numeric ? "n" : ""}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(field)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        <Icon size={11} style={{ opacity: active ? 1 : 0.35, flexShrink: 0 }} />
      </span>
    </th>
  );
}

function NationChip({ code, active, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(code)}
      style={{
        padding: "4px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer",
        border: "1px solid",
        borderColor: active ? "var(--vx-accent)" : "var(--vx-border)",
        background: active ? "var(--vx-accent)" : "transparent",
        color: active ? "#fff" : "var(--vx-text-muted)",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {NATION_LABELS[code]}
    </button>
  );
}

/* ── Format helpers ──────────────────────────────────────────────────── */
function fmtGrowth(v) {
  if (v == null) return "—";
  const pct = (v * 100).toFixed(1);
  return (v >= 0 ? "+" : "") + pct + "%";
}
function fmtYield(v) {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}
function fmtRate(v) {
  if (v == null) return "—";
  return (v * 100).toFixed(1) + "%";
}
function fmtInt(v) {
  if (v == null) return "—";
  return Math.round(v).toLocaleString("en-GB");
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function ScreenerView({ settings, onSettingsChange, onAddTargetAreas }) {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState(new Set());
  const [drillCode, setDrillCode] = useState(null);

  // Read/write screener prefs from the shared settings object
  const sc = settings?.screener || {};
  const strategy     = sc.strategy     || "brrr";
  const ptype        = sc.ptype        || "T";
  const maxPrice     = sc.maxPrice     || "";
  const nations      = sc.nations      || { E: true, W: true, S: true, N: true };
  const flipWeights  = sc.flipWeights  || { ...DEFAULT_WEIGHTS.flip };
  const brrrWeights  = sc.brrrWeights  || { ...DEFAULT_WEIGHTS.brrr };
  const curWeights   = strategy === "flip" ? flipWeights : brrrWeights;

  function updateScreener(patch) {
    onSettingsChange({ ...settings, screener: { ...sc, ...patch } });
  }

  function setWeight(factor, rawVal) {
    const v = Math.max(0, Math.min(10, Number(rawVal) || 0));
    if (strategy === "flip") {
      updateScreener({ flipWeights: { ...flipWeights, [factor]: v } });
    } else {
      updateScreener({ brrrWeights: { ...brrrWeights, [factor]: v } });
    }
  }

  function onSort(field) {
    if (sortKey === field) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(field); setSortDir(field === "name" || field === "nation" ? "asc" : "desc"); }
  }

  function toggleSelect(code) {
    setSelected(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  function toggleAll(codes) {
    setSelected(s =>
      codes.every(c => s.has(c))
        ? new Set([...s].filter(c => !codes.includes(c)))
        : new Set([...s, ...codes])
    );
  }

  // Load screener.json once
  useEffect(() => {
    fetch("/data/screener.json")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setLoadErr(e.message));
  }, []);

  const flipIndex = useMemo(() => (data ? buildFlipIndex(data.districts) : {}), [data]);

  // Filter → score
  const scored = useMemo(() => {
    if (!data) return [];
    const maxP = Number(maxPrice) || Infinity;
    const filtered = data.areas.filter(area => {
      if (!nations[codeToNationKey(area.code)]) return false;
      const p = pickValues(area, ptype, flipIndex).price;
      if (p != null && p > maxP) return false;
      return true;
    });
    return computeScores(filtered, strategy, ptype, flipIndex, curWeights);
  }, [data, strategy, ptype, maxPrice, nations, flipIndex, curWeights]);

  // Assign rank numbers (by score desc) then sort for display
  const ranked = useMemo(() => {
    const withScore = [...scored].filter(r => r.score != null).sort((a, b) => b.score - a.score);
    const rankMap = new Map(withScore.map((r, i) => [r.area.code, i + 1]));

    return [...scored].sort((a, b) => {
      let av, bv;
      if (sortKey === "score" || sortKey === "rank") { av = a.score; bv = b.score; }
      else if (sortKey === "name")          { av = a.area.name; bv = b.area.name; }
      else if (sortKey === "nation")        { av = codeToNationKey(a.area.code); bv = codeToNationKey(b.area.code); }
      else if (sortKey === "price")         { av = a.vals.price; bv = b.vals.price; }
      else if (sortKey === "yield")         { av = a.vals.yield; bv = b.vals.yield; }
      else if (sortKey === "growth12")      { av = a.vals.growth12; bv = b.vals.growth12; }
      else if (sortKey === "liquidity")     { av = a.vals.liquidity; bv = b.vals.liquidity; }
      else if (sortKey === "flipEvidence")  { av = a.vals.flipEvidence; bv = b.vals.flipEvidence; }
      else { av = null; bv = null; }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    }).map(r => ({ ...r, rank: rankMap.get(r.area.code) ?? null }));
  }, [scored, sortKey, sortDir]);

  const visibleCodes = useMemo(() => ranked.map(r => r.area.code), [ranked]);
  const topScore = useMemo(() => {
    const scores = scored.filter(r => r.score != null).map(r => r.score);
    return scores.length ? Math.max(...scores) : null;
  }, [scored]);

  // Drill-down data
  const drillArea = useMemo(() => drillCode && data ? data.areas.find(a => a.code === drillCode) : null, [drillCode, data]);
  const drillDistricts = useMemo(() => {
    if (!drillCode || !data) return [];
    return data.districts
      .filter(d => d.la_code === drillCode)
      .sort((a, b) => a.outcode.localeCompare(b.outcode) || a.ptype.localeCompare(b.ptype));
  }, [drillCode, data]);

  function handleSendToSourcing() {
    const areas = ranked
      .filter(r => selected.has(r.area.code))
      .map(r => ({ code: r.area.code, name: r.area.name, nation: NATION_LABELS[codeToNationKey(r.area.code)] }));
    if (areas.length) onAddTargetAreas(areas);
    setSelected(new Set());
  }

  if (loadErr) return <Note tone="warn">Failed to load screener data: {loadErr}</Note>;
  if (!data)   return <div style={{ padding: 32, color: "var(--vx-text-muted)", textAlign: "center" }}>Loading screener data…</div>;

  const meta = data.meta || {};
  const hasNiInView = ranked.some(r => codeToNationKey(r.area.code) === "N");

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={labelStyle}>Strategy</div>
          <Segmented
            value={strategy}
            onChange={s => updateScreener({ strategy: s })}
            options={[["flip", "Flip"], ["brrr", "BRRR"]]}
          />
        </div>
        <div>
          <div style={labelStyle}>Property type</div>
          <Segmented
            value={ptype}
            onChange={p => updateScreener({ ptype: p })}
            options={[["T", "Terraced"], ["S", "Semi"], ["B", "Both"]]}
          />
        </div>
        <div style={{ width: 180 }}>
          <NumberField
            label="Max entry price (£)"
            value={maxPrice}
            onChange={v => updateScreener({ maxPrice: v })}
            placeholder="No limit"
            right
          />
        </div>
        <div>
          <div style={labelStyle}>Nations</div>
          <div style={{ display: "flex", gap: 4 }}>
            {Object.keys(NATION_LABELS).map(k => (
              <NationChip
                key={k}
                code={k}
                active={!!nations[k]}
                onToggle={k => updateScreener({ nations: { ...nations, [k]: !nations[k] } })}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWeightsOpen(o => !o)}
          style={ghostBtnStyle}
        >
          <SlidersHorizontal size={14} />
          {weightsOpen ? "Hide weights" : "Weights"}
        </button>
      </div>

      {/* Weights panel */}
      {weightsOpen && (
        <div className="vx-note" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{strategy === "flip" ? "Flip" : "BRRR"} weights</span>
              <span style={{ fontSize: 12, color: "var(--vx-text-muted)", marginLeft: 8 }}>
                0–10 each. These are starting-point defaults and have not been validated.
              </span>
            </div>
            <button type="button" onClick={() => updateScreener(strategy === "flip" ? { flipWeights: { ...DEFAULT_WEIGHTS.flip } } : { brrrWeights: { ...DEFAULT_WEIGHTS.brrr } })} style={ghostBtnStyle}>
              <RotateCcw size={12} /> Reset
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {FACTOR_META.map(({ key, label }) => (
              <div key={key} style={{ width: 150 }}>
                <NumberField
                  label={label}
                  value={curWeights[key] ?? 0}
                  onChange={v => setWeight(key, v)}
                  min={0} max={10} step={1}
                  right
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--vx-text-muted)" }}>
            Distance factor is hidden — council centroids not yet added (open item #1 in screener brief).
          </div>
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "8px 12px", background: "var(--vx-surface)", borderRadius: 8, border: "1px solid var(--vx-accent)" }}>
          <span style={{ fontSize: 13 }}>{selected.size} area{selected.size !== 1 ? "s" : ""} selected</span>
          <button
            type="button"
            onClick={handleSendToSourcing}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, background: "var(--vx-accent)", color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            <ArrowRightCircle size={14} /> Send to Sourcing
          </button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "var(--vx-text-muted)" }}>
            Clear
          </button>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat label="Areas shown" value={ranked.length} />
        <Stat label="Strategy" value={strategy === "flip" ? "Flip" : "BRRR"} />
        {topScore != null && <Stat label="Top score" value={topScore} />}
      </div>

      {/* Main table */}
      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <table className="vx-table vx-table--zebra" style={{ minWidth: 880 }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={visibleCodes.length > 0 && visibleCodes.every(c => selected.has(c))}
                  onChange={() => toggleAll(visibleCodes)}
                  aria-label="Select all visible areas"
                />
              </th>
              <SortTh label="#"          field="rank"         sortKey={sortKey} sortDir={sortDir} onSort={f => onSort("score")} numeric />
              <SortTh label="Council"    field="name"         sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Nation"     field="nation"       sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Score"      field="score"        sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric />
              <SortTh label="Price"      field="price"        sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric />
              <SortTh label="Yield"      field="yield"        sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric />
              <SortTh label="12m growth" field="growth12"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric />
              <SortTh label="Sales 12m"  field="liquidity"    sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric />
              <SortTh label="Flip rate"  field="flipEvidence" sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric />
              <th aria-label="Flags"></th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", color: "var(--vx-text-muted)", padding: "32px 0" }}>
                  No areas match the current filters.
                </td>
              </tr>
            )}
            {ranked.map(({ area, vals, score, partial, rank }) => {
              const nationKey = codeToNationKey(area.code);
              const niNoBrrr = strategy === "brrr" && area.rentSource === null;
              const isSelected = selected.has(area.code);
              const isDrilled = drillCode === area.code;
              return (
                <React.Fragment key={area.code}>
                  <tr
                    style={{
                      background: isSelected ? "color-mix(in srgb, var(--vx-accent) 8%, transparent)" : undefined,
                      borderBottom: isDrilled ? "none" : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(area.code)}
                        aria-label={`Select ${area.name}`}
                      />
                    </td>
                    <td className="n" style={{ color: "var(--vx-text-muted)", fontSize: 12 }}>{rank ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setDrillCode(isDrilled ? null : area.code)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 500, color: "var(--vx-accent)", padding: 0, fontSize: "inherit", textAlign: "left" }}
                      >
                        {area.name}
                      </button>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--vx-text-muted)" }}>{NATION_LABELS[nationKey] || nationKey}</td>
                    <td className="n" style={{ fontWeight: 600 }}>
                      {niNoBrrr
                        ? <span title="NI: no BRRR score (no PIPR rents)" style={{ color: "var(--vx-text-muted)", fontSize: 12 }}>No BRRR†</span>
                        : (score ?? "—")}
                    </td>
                    <td className="n">{vals.price != null ? formatGBP(vals.price) : "—"}</td>
                    <td className="n">{fmtYield(vals.yield)}</td>
                    <td className="n" style={{ color: vals.growth12 != null ? (vals.growth12 >= 0 ? "var(--vx-success)" : "var(--vx-danger)") : undefined }}>
                      {fmtGrowth(vals.growth12)}
                    </td>
                    <td className="n">{fmtInt(vals.liquidity)}</td>
                    <td className="n">{fmtRate(vals.flipEvidence)}</td>
                    <td>
                      {partial && (
                        <span style={{ background: "var(--vx-warn, #f59e0b)", color: "#fff", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                          partial
                        </span>
                      )}
                    </td>
                  </tr>
                  {isDrilled && (
                    <tr>
                      <td colSpan={11} style={{ padding: 0, background: "var(--vx-surface)" }}>
                        <div style={{ padding: "12px 16px 16px", borderBottom: "2px solid var(--vx-accent)" }}>
                          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>{area.name} — district breakdown</div>
                          {nationKey === "S" && <Note tone="info">Scotland: district-level Price Paid data is not included in this build. Drill-down is available for England and Wales only.</Note>}
                          {nationKey === "N" && <Note tone="info">Northern Ireland: Land Registry Price Paid data does not cover NI. Drill-down is available for England and Wales only.</Note>}
                          {["E", "W"].includes(nationKey) && drillDistricts.length === 0 && <Note tone="warn">No district data found for this council in the current build.</Note>}
                          {["E", "W"].includes(nationKey) && drillDistricts.length > 0 && (
                            /* maxWidth: 100vw constrains to viewport on mobile so the table overflows and scrolls */
                            <div style={{ overflowX: "auto", maxWidth: "calc(100vw - 32px)" }}>
                              <table className="vx-table vx-table--zebra" style={{ minWidth: 480 }}>
                                <thead>
                                  <tr>
                                    <th>Outcode</th>
                                    <th>Type</th>
                                    <th className="n">Median price</th>
                                    <th className="n">Sales</th>
                                    <th className="n">Flips</th>
                                    <th className="n">Median uplift</th>
                                    <th className="n">Median gain</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {drillDistricts.map((d, i) => (
                                    <tr key={i}>
                                      <td>{d.outcode}</td>
                                      <td>{d.ptype === "T" ? "Terraced" : d.ptype === "S" ? "Semi" : d.ptype}</td>
                                      <td className="n">{d.median_price != null ? formatGBP(d.median_price) : "—"}</td>
                                      <td className="n">{fmtInt(d.sales)}</td>
                                      <td className="n">{fmtInt(d.flips)}</td>
                                      <td className="n">{d.flip_uplift_pct != null ? "+" + (d.flip_uplift_pct * 100).toFixed(1) + "%" : "—"}</td>
                                      <td className="n">{d.flip_gain_gbp != null ? formatGBP(d.flip_gain_gbp) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* NI footnote */}
      {strategy === "brrr" && hasNiInView && (
        <Note tone="info" style={{ marginBottom: 16, fontSize: 13 }}>
          † Northern Ireland: PIPR does not publish NI rents, so BRRR scoring is unavailable for NI areas.
          Switch to Flip strategy to score NI councils.
        </Note>
      )}


      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--vx-border)", paddingTop: 12, marginTop: 8, fontSize: 12, color: "var(--vx-text-muted)" }}>
        {meta.notes && meta.notes.length > 0 && (
          <ul style={{ margin: "0 0 8px", paddingLeft: 16 }}>
            {meta.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 16px", marginBottom: 4 }}>
          {meta.hpiThrough  && <span>HPI through {meta.hpiThrough}</span>}
          {meta.piprThrough && <span>PIPR through {meta.piprThrough}</span>}
          {meta.ppdThrough  && <span>Price Paid through {meta.ppdThrough}</span>}
          {meta.built       && <span>Built {meta.built}</span>}
        </div>
        <div>
          Contains HM Land Registry data © Crown copyright and database right 2024. Licensed under the{" "}
          <a
            href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--vx-accent)" }}
          >
            Open Government Licence v3.0
          </a>
          . Contains ONS (PIPR) and UK HPI data — Crown copyright, OGL v3.0.
        </div>
      </div>
    </div>
  );
}

/* ── Style constants ─────────────────────────────────────────────────── */
const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--vx-text-muted)",
};

const ghostBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid var(--vx-border)",
  background: "transparent",
  color: "var(--vx-text)",
};
