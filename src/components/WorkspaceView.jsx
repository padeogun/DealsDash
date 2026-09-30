import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import {
  SlidersHorizontal, List, Map, X, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Layers, Clock, ExternalLink,
  RotateCcw, Search, MapPin,
} from "lucide-react";
import { evaluateDecision } from "../lib/decision.js";
import { SOURCING_STAGES, DEAL_STAGES, STAGE_COLORS } from "../lib/pipeline.js";
import { Badge as VxBadge } from "./Badge.jsx";
import * as repo from "../data/repo.js";
import { setDoc } from "firebase/firestore";

/* ── Leaflet icon fix for bundlers ─────────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const CLUSTER_THRESHOLD = 100;

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const SAT_URL  = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

/* ── Marker icons by recommendation ────────────────────────────────────────── */
const REC_COLORS = { BUY: "#059669", WATCH: "#d97706", PASS: "#dc2626", UNSCORED: "#64748b" };

function makeIcon(rec, isDeal = false) {
  const color = REC_COLORS[rec] || REC_COLORS.UNSCORED;
  const stroke = isDeal ? "2.5" : "1.5";
  const inner = isDeal ? `<rect x="8" y="8" width="8" height="8" rx="1" fill="white"/>` : `<circle cx="12" cy="12" r="4" fill="white"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="${stroke}"/>${inner}</svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36],
  });
}

/* ── URL filter state helpers ───────────────────────────────────────────────── */
const ARRAY_KEYS = new Set(["stages", "recs", "types", "beds", "districts", "imds"]);

function readFilterState() {
  const p = new URLSearchParams(window.location.search);
  const f = {};
  for (const [k, v] of p.entries()) {
    if (ARRAY_KEYS.has(k)) {
      f[k] = f[k] ? [...f[k], v] : [v];
    } else {
      f[k] = v;
    }
  }
  return f;
}

function writeFilterState(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) { v.forEach(item => p.append(k, item)); }
    else { p.set(k, v); }
  }
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function postcodeDistrict(postcode) {
  if (!postcode) return "";
  const m = String(postcode).trim().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*/i);
  return m ? m[1].toUpperCase() : String(postcode).split(" ")[0].toUpperCase();
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.round(diff / 86400000);
}

function recLabel(rec) {
  if (rec === "BUY") return "BUY";
  if (rec === "WATCH") return "WATCH";
  if (rec === "PASS") return "PASS";
  return "Unscored";
}

function recBadgeClass(rec) {
  if (rec === "BUY")   return "bg-vx-surface-positive text-vx-positive border border-vx-surface-positive";
  if (rec === "WATCH") return "bg-vx-surface-caution text-vx-caution border border-vx-surface-caution";
  if (rec === "PASS")  return "bg-vx-surface-negative text-vx-negative border border-vx-surface-negative";
  return "bg-vx-surface-2 text-vx-muted border border-vx-divider";
}

function stageColor(stage) {
  return STAGE_COLORS[stage] || { bg: "bg-slate-100", text: "text-slate-600" };
}

function fmt(n) { return n ? `£${Number(n).toLocaleString("en-GB")}` : "—"; }

/* ── Geocoding via postcodes.io batch ───────────────────────────────────────── */
async function batchGeocode(postcodes) {
  if (!postcodes.length) return {};
  const unique = [...new Set(postcodes.filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  const results = {};
  for (const chunk of chunks) {
    try {
      const r = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: chunk }),
      });
      const json = await r.json();
      if (json.result) {
        for (const item of json.result) {
          if (item.result) results[item.query] = { lat: item.result.latitude, lng: item.result.longitude };
        }
      }
    } catch (e) { console.warn("[Workspace] geocode batch failed", e); }
  }
  return results;
}

/* ── Map pan helper ─────────────────────────────────────────────────────────── */
function MapPanner({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.panTo(target, { animate: true });
  }, [target, map]);
  return null;
}

/* ── Filter rail ─────────────────────────────────────────────────────────────── */
function FilterGroup({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-vx-divider">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-vx-text uppercase tracking-wide hover:bg-vx-surface-2 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {title}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && <div className="px-3 pb-3 space-y-1">{children}</div>}
    </div>
  );
}

function CheckItem({ label, count, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group py-0.5">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="rounded border-vx-divider text-vx-brand-brick focus:ring-vx-brand-brick" />
      <span className="text-sm text-vx-text flex-1">{label}</span>
      {count != null && <span className="text-xs text-vx-muted">{count}</span>}
    </label>
  );
}

function FilterRail({ items, filters, setFilters, buyBoxes, isOpen, onClose, isDesktop }) {
  const allStages = useMemo(() => {
    const s = new Set();
    items.forEach(i => { if (i.pipelineStage) s.add(i.pipelineStage); });
    return [...SOURCING_STAGES, ...DEAL_STAGES].filter(st => s.has(st));
  }, [items]);

  const allTypes = useMemo(() => [...new Set(items.map(i => i.propertyType).filter(Boolean))].sort(), [items]);
  const allBeds  = useMemo(() => [...new Set(items.map(i => i.bedrooms).filter(v => v > 0))].sort((a,b)=>a-b), [items]);
  const allDistricts = useMemo(() => [...new Set(items.map(i => postcodeDistrict(i.postcode)).filter(Boolean))].sort(), [items]);
  const allImds  = useMemo(() => [...new Set(items.map(i => i._imd).filter(v => v != null))].sort((a,b)=>a-b), [items]);
  const hasLegal = useMemo(() => items.some(i => i._entityType === "deal" && i.legalPackReview), [items]);
  const hasAuction = useMemo(() => items.some(i => i._entityType === "lead" && i.auctionDate), [items]);

  const countFor = useCallback((key, val, extra = {}) => {
    return items.filter(i => {
      if (key === "stage") return i.pipelineStage === val;
      if (key === "rec")   return i._rec === val;
      if (key === "type")  return i.propertyType === val;
      if (key === "beds")  return String(i.bedrooms) === String(val);
      if (key === "dist")  return postcodeDistrict(i.postcode) === val;
      if (key === "imd")   return String(i._imd) === String(val);
      return true;
    }).length;
  }, [items]);

  const toggle = (key, val) => {
    const arr = filters[key] || [];
    const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
    setFilters({ ...filters, [key]: next });
  };

  const container = `bg-vx-surface text-vx-text overflow-y-auto flex flex-col ${
    isDesktop
      ? "w-64 min-w-[256px] flex-shrink-0 border-r border-vx-divider"
      : "fixed inset-x-0 bottom-0 z-[1000] max-h-[80vh] rounded-t-xl shadow-xl"
  }`;

  if (!isDesktop && !isOpen) return null;

  return (
    <div className={container} style={isDesktop ? {} : { zIndex: 1000 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-vx-divider sticky top-0 bg-vx-surface z-10">
        <span className="text-sm font-semibold text-vx-text flex items-center gap-1.5">
          <SlidersHorizontal size={14} />Filters
        </span>
        <div className="flex items-center gap-2">
          {Object.values(filters).some(v => Array.isArray(v) ? v.length : v) && (
            <button onClick={() => setFilters({})} className="text-xs text-vx-brand-brick hover:underline flex items-center gap-0.5">
              <RotateCcw size={11} />Clear all
            </button>
          )}
          {!isDesktop && <button onClick={onClose}><X size={16} className="text-vx-muted" /></button>}
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Buy Box */}
        {buyBoxes.length > 0 && (
          <FilterGroup title="Buy box">
            <select
              value={filters.buyBox || ""}
              onChange={e => setFilters({ ...filters, buyBox: e.target.value || undefined })}
              className="w-full text-sm border border-vx-divider rounded px-2 py-1 bg-vx-surface text-vx-text focus:ring-1 focus:ring-vx-brand-brick"
            >
              <option value="">All buy boxes</option>
              {buyBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FilterGroup>
        )}

        {/* Timing & Money */}
        <FilterGroup title="Timing & money">
          <div className="space-y-1.5">
            {allStages.map(st => (
              <CheckItem key={st} label={st} count={countFor("stage", st)}
                checked={(filters.stages || []).includes(st)} onChange={() => toggle("stages", st)} />
            ))}
            {hasAuction && (
              <div className="pt-1.5">
                <div className="text-xs font-medium text-vx-muted mb-1">Auction window</div>
                {[
                  { v: "today", label: "Today" },
                  { v: "7d", label: "Within 7 days" },
                  { v: "over7d", label: "Over 7 days" },
                  { v: "awaiting", label: "Awaiting outcome" },
                ].map(({ v, label }) => (
                  <CheckItem key={v} label={label}
                    checked={(filters.aucwin || []).includes(v)} onChange={() => toggle("aucwin", v)} />
                ))}
              </div>
            )}
            <div className="pt-1.5 grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-xs text-vx-muted block mb-0.5">Min price</label>
                <input type="number" placeholder="£0" value={filters.priceMin || ""}
                  onChange={e => setFilters({ ...filters, priceMin: e.target.value || undefined })}
                  className="w-full text-xs border border-vx-divider rounded px-2 py-1 bg-vx-surface text-vx-text" />
              </div>
              <div>
                <label className="text-xs text-vx-muted block mb-0.5">Max price</label>
                <input type="number" placeholder="Any" value={filters.priceMax || ""}
                  onChange={e => setFilters({ ...filters, priceMax: e.target.value || undefined })}
                  className="w-full text-xs border border-vx-divider rounded px-2 py-1 bg-vx-surface text-vx-text" />
              </div>
            </div>
          </div>
        </FilterGroup>

        {/* Quality gates */}
        <FilterGroup title="Quality gates">
          {["BUY", "WATCH", "PASS", "UNSCORED"].map(r => (
            <CheckItem key={r} label={recLabel(r)} count={countFor("rec", r)}
              checked={(filters.recs || []).includes(r)} onChange={() => toggle("recs", r)} />
          ))}
        </FilterGroup>

        {/* Property shape */}
        {(allTypes.length > 0 || allBeds.length > 0) && (
          <FilterGroup title="Property shape">
            {allTypes.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-medium text-vx-muted mb-1">Type</div>
                {allTypes.map(t => (
                  <CheckItem key={t} label={t} count={countFor("type", t)}
                    checked={(filters.types || []).includes(t)} onChange={() => toggle("types", t)} />
                ))}
              </div>
            )}
            {allBeds.length > 0 && (
              <div>
                <div className="text-xs font-medium text-vx-muted mb-1">Bedrooms</div>
                {allBeds.map(b => (
                  <CheckItem key={b} label={`${b} bed${b === 1 ? "" : "s"}`} count={countFor("beds", b)}
                    checked={(filters.beds || []).includes(String(b))} onChange={() => toggle("beds", String(b))} />
                ))}
              </div>
            )}
          </FilterGroup>
        )}

        {/* Location & risk */}
        {(allDistricts.length > 0 || allImds.length > 0) && (
          <FilterGroup title="Location & risk" defaultOpen={false}>
            {allDistricts.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-medium text-vx-muted mb-1">Postcode district</div>
                {allDistricts.map(d => (
                  <CheckItem key={d} label={d} count={countFor("dist", d)}
                    checked={(filters.districts || []).includes(d)} onChange={() => toggle("districts", d)} />
                ))}
              </div>
            )}
            {allImds.length > 0 && (
              <div>
                <div className="text-xs font-medium text-vx-muted mb-1">IMD decile (1=most deprived)</div>
                {allImds.map(i => (
                  <CheckItem key={i} label={`Decile ${i}`} count={countFor("imd", i)}
                    checked={(filters.imds || []).includes(String(i))} onChange={() => toggle("imds", String(i))} />
                ))}
              </div>
            )}
          </FilterGroup>
        )}

        {/* Legal */}
        {hasLegal && (
          <FilterGroup title="Legal" defaultOpen={false}>
            <CheckItem label="Pack reviewed" count={items.filter(i => i._entityType === "deal" && i.legalPackReview?.reviewedAt).length}
              checked={filters.legalReviewed === "yes"} onChange={v => setFilters({ ...filters, legalReviewed: v ? "yes" : undefined })} />
            <CheckItem label="Has red flags" count={items.filter(i => i._entityType === "deal" && (i.legalPackReview?.flags?.length > 0)).length}
              checked={filters.hasFlags === "yes"} onChange={v => setFilters({ ...filters, hasFlags: v ? "yes" : undefined })} />
          </FilterGroup>
        )}
      </div>
    </div>
  );
}

/* ── List card ───────────────────────────────────────────────────────────────── */
function WorkspaceCard({ item, hovered, onHover, onOpen }) {
  const auctionDays = item._entityType === "lead" ? daysUntil(item.auctionDate) : null;
  const hasWarning  = (item._entityType === "deal" && item.legalPackReview?.flags?.length > 0) ||
                      (item._entityType === "lead" && item.triage && Object.values(item.triage).some(v => v === false));
  const sc = stageColor(item.pipelineStage);

  return (
    <div
      data-itemid={item.id}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(item)}
      className={`border rounded-lg p-3 cursor-pointer transition-all ${
        hovered === item.id
          ? "border-vx-brand-brick bg-vx-surface shadow-sm"
          : "border-vx-divider bg-vx-surface hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
            {item.pipelineStage}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${recBadgeClass(item._rec)}`}>
            {recLabel(item._rec)}
          </span>
          {item._entityType === "deal" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-medium">Deal</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasWarning && <AlertTriangle size={13} className="text-amber-500" />}
          <button onClick={e => { e.stopPropagation(); onOpen(item); }}
            className="text-vx-muted hover:text-vx-brand-brick transition-colors">
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      <div className="text-sm font-semibold text-vx-text leading-snug mb-0.5 truncate">
        {item.bedrooms > 0 ? `${item.bedrooms}-bed ` : ""}
        {item.propertyType || "Property"}, {postcodeDistrict(item.postcode)}
      </div>
      <div className="text-xs text-vx-muted truncate mb-2">{item.address || item.postcode}</div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <div className="text-vx-muted">
          {item._entityType === "deal" ? "Purchase" : "Guide"}&nbsp;
          <span className="text-vx-text font-medium">{fmt(item._price)}</span>
        </div>
        {item._maxBid && (
          <div className="text-vx-muted">
            Max bid&nbsp;<span className="text-vx-text font-medium">{fmt(item._maxBid)}</span>
          </div>
        )}
        {item._profit != null && (
          <div className="text-vx-muted">
            Est profit&nbsp;<span className={`font-medium ${item._profit >= 0 ? "text-vx-positive" : "text-rose-600"}`}>
              {fmt(item._profit)}
            </span>
          </div>
        )}
        {item._imd && (
          <div className="text-vx-muted">
            IMD&nbsp;<span className="text-vx-text font-medium">D{item._imd}</span>
          </div>
        )}
      </div>

      {auctionDays != null && (
        <div className={`mt-2 text-[10px] font-medium flex items-center gap-1 ${
          auctionDays <= 1 ? "text-rose-600" : auctionDays <= 7 ? "text-amber-600" : "text-vx-muted"
        }`}>
          <Clock size={10} />
          {auctionDays < 0 ? "Auction passed" : auctionDays === 0 ? "Auction today!" : `Auction in ${auctionDays} day${auctionDays === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
}

/* ── Sort options ────────────────────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { v: "best",     label: "Best deal" },
  { v: "auction",  label: "Auction soonest" },
  { v: "newest",   label: "Newest" },
  { v: "price",    label: "Price low–high" },
  { v: "stage",    label: "Days in stage" },
];

const REC_ORDER = { BUY: 0, WATCH: 1, PASS: 2, UNSCORED: 3 };

function sortItems(items, sort) {
  const copy = [...items];
  if (sort === "best") {
    copy.sort((a, b) => {
      const ro = (REC_ORDER[a._rec] ?? 3) - (REC_ORDER[b._rec] ?? 3);
      if (ro !== 0) return ro;
      return (b._profit ?? -Infinity) - (a._profit ?? -Infinity);
    });
  } else if (sort === "auction") {
    copy.sort((a, b) => {
      const da = a.auctionDate ? new Date(a.auctionDate).getTime() : Infinity;
      const db2 = b.auctionDate ? new Date(b.auctionDate).getTime() : Infinity;
      return da - db2;
    });
  } else if (sort === "newest") {
    copy.sort((a, b) => (b.dateAdded || b.createdAt || 0) - (a.dateAdded || a.createdAt || 0));
  } else if (sort === "price") {
    copy.sort((a, b) => (a._price || 0) - (b._price || 0));
  } else if (sort === "stage") {
    copy.sort((a, b) => {
      const sa = a._stageEnteredAt || a.updatedAt || 0;
      const sb = b._stageEnteredAt || b.updatedAt || 0;
      return sa - sb;
    });
  }
  return copy;
}

/* ── Main WorkspaceView ──────────────────────────────────────────────────────── */
export default function WorkspaceView({ leads, deals, buyBoxes, settings, db, uid, onGoToDeal, onGoToLead }) {
  const [geoCache, setGeoCache]       = useState({});
  const [geocoding, setGeocoding]     = useState(false);
  const [filters, setFiltersRaw]      = useState(() => readFilterState());
  const [sort, setSort]               = useState("best");
  const [satellite, setSatellite]     = useState(false);
  const [hovered, setHovered]         = useState(null);
  const [mapTarget, setMapTarget]     = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [mobileView, setMobileView]   = useState("list"); // "list" | "map"
  const [search, setSearch]           = useState("");
  const listRef = useRef(null);

  const setFilters = useCallback((f) => {
    setFiltersRaw(f);
    writeFilterState(f);
  }, []);

  /* ── Build enriched items ───────────────────────────────────────────────── */
  const rawItems = useMemo(() => {
    const enrichLead = (lead) => {
      const rec = (lead.triage && lead.recommendation) ? lead.recommendation
        : lead.triage ? (Object.values(lead.triage).every(v => v === true) ? "BUY" : Object.values(lead.triage).some(v => v === false) ? "PASS" : "UNSCORED")
        : "UNSCORED";
      return {
        ...lead,
        _entityType: "lead",
        _rec: rec,
        _price: lead.guidePrice || 0,
        _maxBid: null,
        _profit: lead.estResaleHigh && lead.guidePrice ? (lead.estResaleHigh - lead.guidePrice - (lead.estRefurb || 0)) : null,
        _imd: lead.areaIntelligence?.imd?.decile ?? null,
      };
    };

    const enrichDeal = (deal) => {
      let rec = "UNSCORED";
      try {
        const r = evaluateDecision(deal, null, settings?.thresholds);
        rec = r?.recommendation || "UNSCORED";
      } catch (_) {}
      const profit = deal.estResaleHigh && deal.price ? (deal.estResaleHigh - deal.price - (deal.fees?.refurb || 0)) : null;
      return {
        ...deal,
        _entityType: "deal",
        _rec: rec,
        _price: deal.price || 0,
        _maxBid: deal.maxBid || null,
        _profit: profit,
        _imd: deal.areaIntelligence?.imd?.decile ?? null,
      };
    };

    return [
      ...leads.map(enrichLead),
      ...deals.map(enrichDeal),
    ];
  }, [leads, deals, settings]);

  /* ── Geocoding ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const needsGeo = rawItems.filter(item => {
      const cached = geoCache[item.postcode];
      return !cached && !item.lat && item.postcode;
    });
    if (!needsGeo.length) return;

    const uniquePostcodes = [...new Set(needsGeo.map(i => i.postcode))];
    setGeocoding(true);
    batchGeocode(uniquePostcodes).then(results => {
      setGeoCache(prev => ({ ...prev, ...results }));
      setGeocoding(false);

      // Persist lat/lng onto Firestore documents
      needsGeo.forEach(item => {
        const geo = results[item.postcode];
        if (!geo) return;
        const ref = item._entityType === "lead"
          ? repo.leadDocRef(db, uid, item.id)
          : repo.dealDocRef(db, uid, item.id);
        setDoc(ref, { lat: geo.lat, lng: geo.lng }, { merge: true }).catch(() => {});
      });
    });
  }, [rawItems, db, uid]);

  /* ── Enrich with coords ─────────────────────────────────────────────────── */
  const items = useMemo(() => rawItems.map(item => {
    const lat = item.lat ?? geoCache[item.postcode]?.lat;
    const lng = item.lng ?? geoCache[item.postcode]?.lng;
    return { ...item, lat, lng };
  }), [rawItems, geoCache]);

  /* ── Apply filters ──────────────────────────────────────────────────────── */
  const filteredItems = useMemo(() => {
    let out = items;

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(i =>
        (i.address || "").toLowerCase().includes(q) ||
        (i.postcode || "").toLowerCase().includes(q) ||
        (i.id || "").toLowerCase().includes(q) ||
        (i.name || "").toLowerCase().includes(q)
      );
    }

    // Buy box
    if (filters.buyBox) {
      const box = buyBoxes.find(b => b.id === filters.buyBox);
      if (box?.filters) {
        const bf = box.filters;
        out = out.filter(i => {
          if (bf.minBeds && i.bedrooms < bf.minBeds) return false;
          if (bf.maxBeds && i.bedrooms > bf.maxBeds) return false;
          if (bf.propertyTypes?.length && !bf.propertyTypes.includes(i.propertyType)) return false;
          if (bf.maxPrice && i._price > bf.maxPrice) return false;
          return true;
        });
      }
    }

    // Stages
    if (filters.stages?.length) out = out.filter(i => filters.stages.includes(i.pipelineStage));

    // Auction window
    if (filters.aucwin?.length) {
      out = out.filter(i => {
        if (i._entityType !== "lead") return true; // deals pass through
        const d = daysUntil(i.auctionDate);
        if (d == null) return filters.aucwin.includes("awaiting");
        if (filters.aucwin.includes("today") && d === 0) return true;
        if (filters.aucwin.includes("7d") && d > 0 && d <= 7) return true;
        if (filters.aucwin.includes("over7d") && d > 7) return true;
        return false;
      });
    }

    // Price range
    if (filters.priceMin) out = out.filter(i => i._price >= Number(filters.priceMin));
    if (filters.priceMax) out = out.filter(i => i._price <= Number(filters.priceMax));

    // Recommendation
    if (filters.recs?.length) out = out.filter(i => filters.recs.includes(i._rec));

    // Type
    if (filters.types?.length) out = out.filter(i => filters.types.includes(i.propertyType));

    // Beds
    if (filters.beds?.length) out = out.filter(i => filters.beds.includes(String(i.bedrooms)));

    // Districts
    if (filters.districts?.length) out = out.filter(i => filters.districts.includes(postcodeDistrict(i.postcode)));

    // IMD
    if (filters.imds?.length) out = out.filter(i => filters.imds.includes(String(i._imd)));

    // Legal
    if (filters.legalReviewed === "yes") out = out.filter(i => i._entityType === "deal" && i.legalPackReview?.reviewedAt);
    if (filters.hasFlags === "yes") out = out.filter(i => i._entityType === "deal" && i.legalPackReview?.flags?.length > 0);

    return out;
  }, [items, filters, search, buyBoxes]);

  const sortedItems = useMemo(() => sortItems(filteredItems, sort), [filteredItems, sort]);
  const mappableItems = useMemo(() => sortedItems.filter(i => i.lat && i.lng), [sortedItems]);
  const useCluster = mappableItems.length > CLUSTER_THRESHOLD;

  /* ── Hover: scroll list card into view + pan map ─────────────────────────── */
  const handleHover = useCallback((id) => {
    setHovered(id);
    if (id) {
      const item = items.find(i => i.id === id);
      if (item?.lat && item?.lng) setMapTarget([item.lat, item.lng]);
      if (listRef.current) {
        const el = listRef.current.querySelector(`[data-itemid="${id}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [items]);

  const handleOpen = useCallback((item) => {
    if (item._entityType === "deal") onGoToDeal(item.id);
    else onGoToLead(item.id);
  }, [onGoToDeal, onGoToLead]);

  const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

  /* ── Map markers ─────────────────────────────────────────────────────────── */
  const markerElements = mappableItems.map(item => (
    <Marker key={item.id} position={[item.lat, item.lng]}
      icon={makeIcon(item._rec, item._entityType === "deal")}
      eventHandlers={{ mouseover: () => handleHover(item.id), mouseout: () => handleHover(null) }}
    >
      <Popup>
        <div style={{ minWidth: 180 }}>
          <div className="font-semibold text-sm mb-0.5 leading-snug">
            {item.bedrooms > 0 ? `${item.bedrooms}-bed ` : ""}{item.propertyType || "Property"}
          </div>
          <div className="text-xs text-vx-muted mb-1">{item.address || item.postcode}</div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${recBadgeClass(item._rec)}`}>{recLabel(item._rec)}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${stageColor(item.pipelineStage).bg} ${stageColor(item.pipelineStage).text}`}>
              {item.pipelineStage}
            </span>
          </div>
          <div className="text-xs space-y-0.5">
            <div>{item._entityType === "deal" ? "Purchase" : "Guide"}: <strong>{fmt(item._price)}</strong></div>
            {item._maxBid && <div>Max bid: <strong>{fmt(item._maxBid)}</strong></div>}
          </div>
          <button onClick={() => handleOpen(item)}
            className="mt-2 w-full text-xs bg-vx-brand-brick text-white rounded px-2 py-1 hover:opacity-90 transition-opacity">
            Open
          </button>
        </div>
      </Popup>
    </Marker>
  ));

  const mapCenter = mappableItems.length > 0
    ? [mappableItems[0].lat, mappableItems[0].lng]
    : [53.5, -1.5]; // centre of northern England, sensible default for UK property

  /* ── Toolbar ─────────────────────────────────────────────────────────────── */
  const toolbar = (
    <div className="flex items-center gap-2 px-3 py-2 bg-vx-surface border-b border-vx-divider flex-shrink-0">
      <div className="relative flex-1 max-w-xs">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-vx-muted pointer-events-none" />
        <input
          type="text" placeholder="Address, postcode or ID…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm pl-7 pr-3 py-1.5 border border-vx-divider rounded bg-vx-surface text-vx-text placeholder:text-vx-muted focus:outline-none focus:ring-1 focus:ring-vx-brand-brick"
        />
      </div>
      <span className="text-xs text-vx-muted whitespace-nowrap hidden sm:block">
        {filteredItems.length} / {items.length}
      </span>
      {!isDesktop && (
        <button onClick={() => setShowFilters(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-vx-divider rounded hover:bg-vx-surface-2 text-vx-text">
          <SlidersHorizontal size={13} />Filters
          {Object.values(filters).some(v => Array.isArray(v) ? v.length : v) && (
            <span className="bg-vx-brand-brick text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {Object.values(filters).reduce((n, v) => n + (Array.isArray(v) ? v.length : (v ? 1 : 0)), 0)}
            </span>
          )}
        </button>
      )}
      <button
        onClick={() => setSatellite(s => !s)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded transition-colors ${satellite ? "bg-slate-800 text-white border-slate-700" : "border-vx-divider text-vx-text hover:bg-vx-surface-2"}`}
        title={satellite ? "Switch to street map" : "Switch to satellite"}
      >
        {satellite ? <Map size={13} /> : <Layers size={13} />}
        <span className="hidden sm:inline">{satellite ? "Street" : "Satellite"}</span>
      </button>
      {geocoding && (
        <span className="text-xs text-vx-muted animate-pulse whitespace-nowrap hidden sm:block">Geocoding…</span>
      )}
    </div>
  );

  /* ── Desktop layout ─────────────────────────────────────────────────────── */
  if (isDesktop) {
    return (
      <div className="flex flex-col h-full" style={{ height: "calc(100vh - 0px)" }}>
        {toolbar}
        <div className="flex flex-1 overflow-hidden">
          <FilterRail items={items} filters={filters} setFilters={setFilters}
            buyBoxes={buyBoxes} isOpen={true} onClose={() => {}} isDesktop={true} />

          {/* Map */}
          <div className="flex-1 relative z-0">
            <MapContainer center={mapCenter} zoom={10} style={{ height: "100%", width: "100%" }}
              className="z-0">
              <TileLayer url={satellite ? SAT_URL : OSM_URL} attribution={satellite ? SAT_ATTR : OSM_ATTR} />
              {mapTarget && <MapPanner target={mapTarget} />}
              {useCluster ? (
                <MarkerClusterGroup chunkedLoading>{markerElements}</MarkerClusterGroup>
              ) : markerElements}
            </MapContainer>
            {mappableItems.length === 0 && !geocoding && items.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 pointer-events-none z-10">
                <div className="text-sm text-vx-muted text-center">
                  <MapPin size={24} className="mx-auto mb-1 opacity-40" />
                  Geocoding postcodes… or no results match filters
                </div>
              </div>
            )}
          </div>

          {/* List */}
          <div className="w-80 min-w-[320px] flex flex-col border-l border-vx-divider bg-vx-surface overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-vx-divider flex-shrink-0">
              <span className="text-sm font-semibold text-vx-text">
                {filteredItems.length === items.length
                  ? `${items.length} item${items.length === 1 ? "" : "s"}`
                  : `${filteredItems.length} of ${items.length}`}
              </span>
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="text-xs border border-vx-divider rounded px-1.5 py-1 bg-vx-surface text-vx-text focus:ring-1 focus:ring-vx-brand-brick">
                {SORT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-2">
              {sortedItems.length === 0 ? (
                <div className="text-center text-vx-muted text-sm py-8">
                  <CheckCircle2 size={20} className="mx-auto mb-2 opacity-40" />
                  No items match filters
                </div>
              ) : sortedItems.map(item => (
                <WorkspaceCard key={item.id} item={item} hovered={hovered}
                  onHover={handleHover} onOpen={handleOpen} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Mobile layout ──────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      {toolbar}

      <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
        <button onClick={() => setMobileView("list")}
          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${mobileView === "list" ? "bg-vx-brand-brick text-white" : "bg-vx-surface-2 text-vx-text"}`}>
          <List size={12} />List
        </button>
        <button onClick={() => setMobileView("map")}
          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${mobileView === "map" ? "bg-vx-brand-brick text-white" : "bg-vx-surface-2 text-vx-text"}`}>
          <Map size={12} />Map
        </button>
      </div>

      {mobileView === "list" ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-vx-muted">{filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""}</span>
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="text-xs border border-vx-divider rounded px-1.5 py-1 bg-vx-surface text-vx-text">
              {SORT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          {sortedItems.map(item => (
            <WorkspaceCard key={item.id} item={item} hovered={hovered}
              onHover={handleHover} onOpen={handleOpen} />
          ))}
          {sortedItems.length === 0 && (
            <div className="text-center text-vx-muted text-sm py-8">No items match filters</div>
          )}
        </div>
      ) : (
        <div className="flex-1 relative">
          <MapContainer center={mapCenter} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer url={satellite ? SAT_URL : OSM_URL} attribution={satellite ? SAT_ATTR : OSM_ATTR} />
            {useCluster ? (
              <MarkerClusterGroup chunkedLoading>{markerElements}</MarkerClusterGroup>
            ) : markerElements}
          </MapContainer>
        </div>
      )}

      {/* Bottom sheet filter */}
      <FilterRail items={items} filters={filters} setFilters={setFilters}
        buyBoxes={buyBoxes} isOpen={showFilters} onClose={() => setShowFilters(false)} isDesktop={false} />
      {showFilters && (
        <div className="fixed inset-0 bg-black/30 z-[999]" onClick={() => setShowFilters(false)} />
      )}
    </div>
  );
}
