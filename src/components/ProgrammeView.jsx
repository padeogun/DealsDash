// Programme section — lives at the top of the Progress tab.
// Loads/saves to users/{uid}/deals/{dealId}/programme/main.
// The deal document itself is never modified.
// RULE 14: additive schema only (schemaVersion / templateVersion bumped here).

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { onSnapshot } from "firebase/firestore";
import { ChevronDown, ChevronRight, AlertTriangle, Info, Calendar, Layers, Flag } from "lucide-react";
import { Segmented, Note, Button } from "../design-system/react/index.jsx";
import { TEMPLATE, templateVersion } from "../lib/programme/template.js";
import { schedule } from "../lib/programme/schedule.js";
import { networkdays } from "../lib/programme/calendar.js";
import { getBankHolidays } from "../lib/programme/bankHolidays.js";
import * as repo from "../data/repo.js";

// ── Constants ────────────────────────────────────────────────────────────────
const LS_VIEW_KEY = "dealsdash_programme_view_v1";
const SCHEMA_VERSION = 1;

const PHASE_COLOURS = {
  A: "#6366f1", B: "#0ea5e9", C: "#f59e0b",
  D: "#10b981", E: "#8b5cf6", F: "#ec4899",
  G: "#14b8a6", H: "#f97316",
};

const SCOPE_LABELS = {
  pre2000:      "Pre-2000 property",
  structural:   "Structural works",
  dampTimber:   "Damp / timber treatment",
  roofExternal: "Roof & external repairs",
  windowsDoors: "Windows & doors",
  rewire:       "Full rewire",
  heatingBoiler:"Heating / new boiler",
  kitchen:      "New kitchen",
  bathroom:     "New bathroom",
};

const DEFAULT_INPUTS = {
  route:                    "auction",
  dealSecured:              "",
  contingencyPct:           0.15,
  winterDryingExtra:        3,
  auctionCompletionDays:    28,
  agentExchangeToCompletion:10,
  agentSaleToAgreement:     30,
  saleExchangeToCompletion: 10,
  retentionReleaseLag:      60,
};

const DEFAULT_SCOPE = {
  pre2000: false, structural: false, dampTimber: false,
  roofExternal: false, windowsDoors: false, rewire: false,
  heatingBoiler: false, kitchen: false, bathroom: false,
};

// ── Formatting ────────────────────────────────────────────────────────────────
const fmtDate   = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtGBP    = (n) => n == null ? "—" : "£" + Math.round(n).toLocaleString("en-GB");
const todayISO  = () => new Date().toISOString().slice(0, 10);

// ── Small UI helpers ─────────────────────────────────────────────────────────
function PCard({ children, className = "" }) {
  return <div className={`bg-vx-bg border border-vx-divider rounded p-4 ${className}`}>{children}</div>;
}
function PLabel({ children }) {
  return <div className="text-xs font-medium text-vx-muted mb-1">{children}</div>;
}
function PToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none min-h-[44px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-vx-accent" />
      <span className="text-sm text-vx-text">{label}</span>
    </label>
  );
}
function StatusChip({ applies, hold, durationUsed }) {
  if (!applies) return <span className="text-xs px-2 py-0.5 rounded bg-vx-surface text-vx-muted">N/A</span>;
  if (hold) return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">HOLD</span>;
  return <span className="text-xs px-2 py-0.5 rounded bg-vx-surface text-vx-text">{durationUsed === 0 ? "Milestone" : `${durationUsed} WD`}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProgrammeView({ deal, ownerUid, db, onProgrammeReady }) {
  const dealId = deal.id;

  // Persisted view preference
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(LS_VIEW_KEY) || (window.innerWidth >= 640 ? "gantt" : "list"); } catch { return "list"; }
  });
  function switchView(v) {
    setView(v);
    try { localStorage.setItem(LS_VIEW_KEY, v); } catch {}
  }

  // Firestore state
  const [progDoc, setProgDoc] = useState(null);        // null = not loaded yet
  const [docExists, setDocExists] = useState(false);   // false = no doc in Firestore
  const [saving, setSaving] = useState(false);

  // Bank holidays
  const [bhData, setBhData] = useState({ holidays: [], source: "fallback" });

  // UI state
  const [inputsOpen, setInputsOpen] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const saveTimer = useRef(null);

  // Load bank holidays once on mount
  useEffect(() => {
    getBankHolidays().then(setBhData);
  }, []);

  // Subscribe to Firestore programme doc
  useEffect(() => {
    if (!ownerUid || !dealId) return;
    const ref = repo.programmeDocRef(db, ownerUid, dealId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setDocExists(true);
        setProgDoc(snap.data());
      } else {
        setDocExists(false);
        setProgDoc(null);
      }
    });
    return unsub;
  }, [ownerUid, dealId, db]);

  // Save helper — always writes the full doc (single-doc subcollection)
  const persist = useCallback((data) => {
    if (!ownerUid || !dealId) return;
    setSaving(true);
    repo.saveProgramme(db, ownerUid, dealId, data).finally(() => setSaving(false));
  }, [ownerUid, dealId, db]);

  // Debounced auto-save
  function scheduleAutoSave(data) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(data), 800);
  }

  // Create initial programme document
  function createProgramme() {
    const initial = {
      schemaVersion: SCHEMA_VERSION,
      templateVersion,
      inputs: { ...DEFAULT_INPUTS },
      scope: { ...DEFAULT_SCOPE },
      overrides: {},
      status: {},
      actuals: {},
      customNonWorkdays: [],
      updatedAt: Date.now(),
    };
    persist(initial);
  }

  // Patch inputs
  function patchInputs(patch) {
    if (!progDoc) return;
    const updated = { ...progDoc, inputs: { ...progDoc.inputs, ...patch }, updatedAt: Date.now() };
    setProgDoc(updated);
    scheduleAutoSave(updated);
  }

  // Patch scope
  function patchScope(key, val) {
    if (!progDoc) return;
    const updated = { ...progDoc, scope: { ...progDoc.scope, [key]: val }, updatedAt: Date.now() };
    setProgDoc(updated);
    scheduleAutoSave(updated);
  }

  // Set actual finish for an activity
  function setActualFinish(actId, finish) {
    if (!progDoc) return;
    const actuals = { ...(progDoc.actuals || {}), [actId]: { finish } };
    const updated = { ...progDoc, actuals, updatedAt: Date.now() };
    setProgDoc(updated);
    scheduleAutoSave(updated);
  }

  // Combine holidays: bank holidays + programme custom + settings custom
  const holidays = useMemo(() => {
    const custom = progDoc?.customNonWorkdays || [];
    return [...new Set([...bhData.holidays, ...custom])].sort();
  }, [bhData.holidays, progDoc?.customNonWorkdays]);

  // Run scheduler
  const result = useMemo(() => {
    if (!progDoc) return null;
    const inputs = { ...progDoc.inputs, scope: progDoc.scope };
    return schedule(TEMPLATE, inputs, holidays, progDoc.actuals || {});
  }, [progDoc, holidays]);

  // Notify parent of key dates (for appraisal link)
  useEffect(() => {
    if (result?.status === "complete" && onProgrammeReady) {
      onProgrammeReady({ keyDates: result.keyDates, flags: result.flags });
    }
  }, [result, onProgrammeReady]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (progDoc === null && ownerUid) {
    // Still loading from Firestore
    if (!docExists && progDoc === null) {
      return (
        <PCard>
          <div className="text-sm font-semibold text-vx-text mb-1">Deal programme</div>
          <p className="text-sm text-vx-muted mb-3">Generate a 54-activity schedule from deal secured to sale completed. Dates update automatically as you mark progress.</p>
          <Button variant="primary" size="sm" onClick={createProgramme}>Create programme</Button>
        </PCard>
      );
    }
    return <PCard><div className="text-sm text-vx-muted">Loading programme…</div></PCard>;
  }

  // ── No doc yet ──────────────────────────────────────────────────────────────
  if (!docExists || !progDoc) {
    return (
      <PCard>
        <div className="text-sm font-semibold text-vx-text mb-1">Deal programme</div>
        <p className="text-sm text-vx-muted mb-3">Generate a 54-activity schedule from deal secured to sale completed. Dates update automatically as you mark progress.</p>
        <Button variant="primary" size="sm" onClick={createProgramme}>Create programme</Button>
      </PCard>
    );
  }

  const { inputs, scope, actuals } = progDoc;
  const isComplete = result?.status === "complete";
  const kd = result?.keyDates;
  const flags = result?.flags || {};
  const activities = result?.activities || [];

  // ── Key dates card ──────────────────────────────────────────────────────────
  function KeyDatesCard() {
    if (!isComplete) return null;
    const today = todayISO();
    const ownedDays = kd.completion && kd.saleCompleted
      ? Math.max(0, Math.round((new Date(kd.saleCompleted + "T00:00:00Z") - new Date(kd.completion + "T00:00:00Z")) / 86400000) / 30.4375)
      : null;
    return (
      <PCard className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-vx-text flex items-center gap-1.5"><Calendar size={14} />Key dates</div>
          {bhData.source === "fallback" && (
            <span className="text-xs text-vx-caution border border-vx-caution rounded px-1.5 py-0.5 flex items-center gap-1">
              <Info size={10} />Holiday data: verify at gov.uk/bank-holidays
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {[
            { label: "Completion",   value: fmtDate(kd.completion) },
            { label: "Works start",  value: fmtDate(kd.worksStart) },
            { label: "PC",           value: fmtDate(kd.pc) },
            { label: "Listed",       value: fmtDate(kd.listed) },
            { label: "Sale agreed",  value: fmtDate(kd.saleAgreed) },
            { label: "Sale complete",value: fmtDate(kd.saleCompleted) },
            { label: "Build",        value: `${kd.buildDuration} WD` },
            { label: "Months owned", value: ownedDays != null ? `${ownedDays.toFixed(1)} mo` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-vx-surface rounded p-2.5">
              <div className="text-xs text-vx-muted">{label}</div>
              <div className="text-sm font-semibold font-mono tabular-nums mt-0.5">{value}</div>
            </div>
          ))}
        </div>
        {/* Flags */}
        {(flags.financeLate || flags.winterExternal || flags.slowMonthListing) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {flags.financeLate && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle size={11} />Finance late — lender legals finish after completion
              </span>
            )}
            {flags.winterExternal && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                <Flag size={11} />Winter drying (+{inputs.winterDryingExtra} WD applied)
              </span>
            )}
            {flags.slowMonthListing && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                <Flag size={11} />Slow listing month — allow extra marketing time
              </span>
            )}
          </div>
        )}
      </PCard>
    );
  }

  // ── Inputs panel ─────────────────────────────────────────────────────────────
  function InputsPanel() {
    return (
      <PCard className="mb-4">
        <button
          onClick={() => setInputsOpen(!inputsOpen)}
          className="w-full flex items-center justify-between text-sm font-semibold text-vx-text"
        >
          <span className="flex items-center gap-1.5"><Layers size={14} />Programme inputs</span>
          <span className="flex items-center gap-2 text-xs text-vx-muted font-normal">
            {saving && "Saving…"}
            {inputsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {inputsOpen && (
          <div className="mt-4 space-y-5">
            {/* Route + secured date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <PLabel>Purchase route <span className="text-vx-caution">— illustrative, verify</span></PLabel>
                <Segmented
                  value={inputs.route}
                  onChange={(v) => patchInputs({ route: v })}
                  options={[["auction", "Auction"], ["agent", "Estate agent"]]}
                />
              </div>
              <div>
                <PLabel>Deal secured date</PLabel>
                <input
                  type="date"
                  value={inputs.dealSecured || ""}
                  onChange={(e) => patchInputs({ dealSecured: e.target.value })}
                  className="vx-input w-full text-sm"
                />
              </div>
            </div>

            {/* Scope switches */}
            <div>
              <PLabel>Scope — check all that apply to this property <span className="text-vx-caution">— illustrative, verify</span></PLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                {Object.entries(SCOPE_LABELS).map(([key, label]) => (
                  <PToggle key={key} label={label} checked={!!scope[key]} onChange={(v) => patchScope(key, v)} />
                ))}
              </div>
            </div>

            {/* Programme assumptions */}
            <div>
              <PLabel>Schedule assumptions <span className="text-vx-caution">— illustrative, verify</span></PLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[
                  { label: "Contingency %",          field: "contingencyPct",            scale: 100,  unit: "%" },
                  { label: "Winter drying (WD)",      field: "winterDryingExtra",         scale: 1,    unit: "WD" },
                  { label: "Auction completion (cal days)", field: "auctionCompletionDays", scale: 1, unit: "days" },
                  { label: "Exchange→completion (WD)",field: "agentExchangeToCompletion", scale: 1,    unit: "WD" },
                  { label: "Sale agreed (WD)",         field: "agentSaleToAgreement",      scale: 1,    unit: "WD" },
                  { label: "Sale exchange→compl (WD)", field: "saleExchangeToCompletion",  scale: 1,    unit: "WD" },
                  { label: "Retention release (WD)",   field: "retentionReleaseLag",       scale: 1,    unit: "WD" },
                ].map(({ label, field, scale }) => (
                  <label key={field} className="block">
                    <span className="block text-xs text-vx-muted mb-1">{label}</span>
                    <input
                      type="number" step={field === "contingencyPct" ? 1 : 1}
                      value={Math.round((inputs[field] ?? DEFAULT_INPUTS[field]) * scale)}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value) / scale;
                        patchInputs({ [field]: v });
                      }}
                      className="vx-input w-full text-sm font-mono text-right"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </PCard>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  function ListView() {
    if (!isComplete) {
      return (
        <PCard>
          <Note tone="warn">Enter a deal secured date in Programme inputs to generate the schedule.</Note>
        </PCard>
      );
    }

    const phases = [...new Set(TEMPLATE.map(d => d.phase))];
    const byPhase = {};
    for (const p of phases) byPhase[p] = activities.filter(a => {
      const def = TEMPLATE.find(t => t.id === a.id);
      return def.phase === p;
    });

    function togglePhase(p) {
      setCollapsedPhases(prev => {
        const next = new Set(prev);
        next.has(p) ? next.delete(p) : next.add(p);
        return next;
      });
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-end mb-1">
          <button onClick={() => setShowSkipped(!showSkipped)}
            className="text-xs text-vx-accent underline underline-offset-2">
            {showSkipped ? "Hide skipped" : "Show skipped"}
          </button>
        </div>
        {phases.map(phase => {
          const phaseDef = TEMPLATE.find(t => t.phase === phase);
          const phaseActs = byPhase[phase];
          const visible = showSkipped ? phaseActs : phaseActs.filter(a => a.applies);
          if (visible.length === 0) return null;
          const collapsed = collapsedPhases.has(phase);
          const colour = PHASE_COLOURS[phase] || "#6b7280";

          return (
            <div key={phase} className="border border-vx-divider rounded overflow-hidden">
              <button
                onClick={() => togglePhase(phase)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-vx-surface text-sm font-semibold text-vx-text"
                style={{ borderLeft: `4px solid ${colour}` }}
              >
                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {phaseDef.phaseName}
                <span className="ml-auto text-xs font-normal text-vx-muted">{visible.length} activities</span>
              </button>
              {!collapsed && (
                <div className="divide-y divide-vx-divider">
                  {visible.map(a => {
                    const def = TEMPLATE.find(t => t.id === a.id);
                    const actual = actuals?.[a.id];
                    return (
                      <div
                        key={a.id}
                        className={`px-3 py-2.5 flex flex-wrap items-start gap-x-4 gap-y-1 ${def.hold ? "bg-amber-50/40" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-vx-text">{def.name}</div>
                          {a.applies && (
                            <div className="text-xs text-vx-muted mt-0.5 font-mono">
                              {fmtDate(a.start)} – {fmtDate(a.finish)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusChip applies={a.applies} hold={def.hold} durationUsed={a.durationUsed} />
                          {a.applies && (
                            <label className="text-xs text-vx-muted flex items-center gap-1 min-h-[44px]">
                              <input
                                type="date"
                                value={actual?.finish || ""}
                                max={todayISO()}
                                onChange={(e) => setActualFinish(a.id, e.target.value || undefined)}
                                className="text-xs border border-vx-border rounded px-1 py-0.5 bg-vx-bg"
                              />
                              <span>actual</span>
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Gantt view ────────────────────────────────────────────────────────────────
  function GanttView() {
    if (!isComplete) return null;

    const today = todayISO();
    const allStarts  = activities.filter(a => a.applies && a.start).map(a => a.start);
    const allFinishes= activities.filter(a => a.applies && a.finish && a.finish >= a.start).map(a => a.finish);
    if (!allStarts.length) return null;

    const programStart = allStarts.reduce((a, b) => a < b ? a : b);
    const programEnd   = allFinishes.reduce((a, b) => a > b ? a : b);

    const t0 = new Date(programStart + "T00:00:00Z").getTime();
    const tEnd = new Date(programEnd  + "T00:00:00Z").getTime();
    const totalDays = Math.ceil((tEnd - t0) / 86400000) + 1;

    const PX_PER_DAY = 10;
    const ROW_H = 28;
    const LABEL_W = 160;
    const totalW = totalDays * PX_PER_DAY;

    // Week tick marks
    const ticks = [];
    let d = new Date(t0);
    while (d.getTime() <= tEnd) {
      ticks.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 7);
    }

    const todayOffset = Math.round((new Date(today + "T00:00:00Z").getTime() - t0) / 86400000) * PX_PER_DAY;

    const phases = [...new Set(TEMPLATE.map(d => d.phase))];

    return (
      <div className="border border-vx-divider rounded overflow-hidden">
        {/* Header row: sticky label column + scrollable week ticks */}
        <div className="flex" style={{ borderBottom: "1px solid var(--vx-divider)" }}>
          <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }}
            className="bg-vx-surface px-2 py-1 text-xs font-medium text-vx-muted sticky left-0 z-10">
            Activity
          </div>
          <div className="overflow-x-auto flex-1" style={{ position: "relative" }}>
            <div style={{ width: totalW, height: 24, position: "relative" }} className="bg-vx-surface">
              {ticks.map((tick, i) => {
                const left = ((new Date(tick + "T00:00:00Z").getTime() - t0) / 86400000) * PX_PER_DAY;
                return (
                  <div key={i} style={{ position: "absolute", left, top: 0, height: "100%", borderLeft: "1px solid var(--vx-divider)" }}>
                    <span className="text-xs text-vx-muted pl-0.5 whitespace-nowrap" style={{ fontSize: 9 }}>
                      {tick.slice(5)}
                    </span>
                  </div>
                );
              })}
              {/* Today line in header */}
              {todayOffset >= 0 && todayOffset <= totalW && (
                <div style={{ position: "absolute", left: todayOffset, top: 0, bottom: 0, borderLeft: "2px solid #ef4444", zIndex: 2 }} />
              )}
            </div>
          </div>
        </div>

        {/* Activity rows */}
        <div style={{ overflowX: "auto" }}>
          {phases.map(phase => {
            const phaseActs = activities.filter(a => {
              const def = TEMPLATE.find(t => t.id === a.id);
              return def.phase === phase && (showSkipped ? true : a.applies);
            });
            if (!phaseActs.length) return null;
            const phaseDef = TEMPLATE.find(t => t.phase === phase);
            const colour = PHASE_COLOURS[phase] || "#6b7280";

            return (
              <React.Fragment key={phase}>
                {/* Phase header */}
                <div className="flex bg-vx-surface" style={{ borderBottom: "1px solid var(--vx-divider)", borderLeft: `4px solid ${colour}` }}>
                  <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }}
                    className="px-2 py-1 text-xs font-semibold text-vx-text sticky left-0 bg-vx-surface z-10">
                    {phaseDef.phaseName}
                  </div>
                  <div style={{ width: totalW, minWidth: totalW, height: 20 }} />
                </div>
                {/* Activity rows */}
                {phaseActs.map(a => {
                  const def = TEMPLATE.find(t => t.id === a.id);
                  if (!a.applies) return null;

                  const left0 = Math.round((new Date(a.start  + "T00:00:00Z").getTime() - t0) / 86400000) * PX_PER_DAY;
                  const left1 = Math.round((new Date(a.finish + "T00:00:00Z").getTime() - t0) / 86400000) * PX_PER_DAY + PX_PER_DAY;
                  const barW = Math.max(a.durationUsed === 0 ? 6 : left1 - left0, 4);

                  return (
                    <div key={a.id} className="flex items-center" style={{ height: ROW_H, borderBottom: "1px solid var(--vx-divider)" }}>
                      <div
                        title={def.name}
                        style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }}
                        className="px-2 text-xs text-vx-text truncate sticky left-0 bg-vx-bg z-10 h-full flex items-center"
                      >
                        {def.name}
                      </div>
                      <div style={{ width: totalW, minWidth: totalW, height: "100%", position: "relative" }}>
                        {/* Today line */}
                        {todayOffset >= 0 && todayOffset <= totalW && (
                          <div style={{ position: "absolute", left: todayOffset, top: 0, bottom: 0, borderLeft: "1px dashed #ef4444", zIndex: 2, opacity: 0.5 }} />
                        )}
                        {/* Activity bar */}
                        <div
                          style={{
                            position: "absolute",
                            left: left0,
                            width: barW,
                            top: 5,
                            height: a.durationUsed === 0 ? 14 : ROW_H - 10,
                            backgroundColor: colour,
                            borderRadius: a.durationUsed === 0 ? "50%" : 3,
                            opacity: def.hold ? 1 : 0.85,
                            border: def.hold ? "2px solid #f59e0b" : "none",
                          }}
                          title={`${def.name}\n${fmtDate(a.start)} – ${fmtDate(a.finish)} (${a.durationUsed} WD)`}
                        />
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <KeyDatesCard />
      <InputsPanel />
      {isComplete && (
        <div className="flex items-center justify-between mb-3">
          <Segmented
            value={view}
            onChange={switchView}
            options={[["list", "List"], ["gantt", "Gantt"]]}
            aria-label="Programme view"
          />
          <span className="text-xs text-vx-muted">{activities.filter(a => a.applies).length} activities</span>
        </div>
      )}
      {view === "list" ? <ListView /> : <GanttView />}
      {result?.status === "incomplete" && result.missing?.includes("dealSecured") && (
        <Note tone="warn" style={{ marginTop: 8 }}>Enter a deal secured date in Programme inputs to generate the schedule.</Note>
      )}
    </div>
  );
}
