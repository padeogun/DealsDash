/* ============================================================
   VIXIV Refurb Survey — native DealsDash module
   Renders inside the Deal view. Owns: property inputs, walkthrough
   answers, compliance, rates. Does NOT own finance: the deal's max bid
   comes in as a prop from the DealsDash appraisal engine.

   Props
     deal        the deal object (deal.survey holds this module's state)
     rates       settings.surveyRates map (benchmarks + overrides)
     maxBid      number | null — from DealsDash solver, recomputed on apply
     onChange    (survey) => void   persist survey into deal.survey
     onApply     (patch)  => void   merge surveyToDealPatch() into the deal
     onRatesChange (rates) => void  persist settings.surveyRates
   ============================================================ */
import React, { useMemo, useState } from "react";
import { CHECKLIST, NONE } from "./data/checklist.js";
import { RATE_DEFAULTS, defaultRates } from "./data/rates.js";
import { COMPLIANCE, COMPLIANCE_STATES } from "./data/compliance.js";
import { priceSurvey } from "./lib/costing.js";
import { prefillFromDeal } from "./lib/prefill.js";
import { surveyToDealPatch } from "./lib/applyToDeal.js";
import { Tabs, Field, NumberField, Grid, Segmented, Button, Note, Stat, Item, Table, LiveBar, H2, H3, Muted, Status, EmptyState, formatGBP as fmt } from "../../design-system/react/index.jsx";

const TYPE_OPTS = [["terraced", "Mid-terrace"], ["endTerrace", "End-terrace"], ["semi", "Semi"], ["detached", "Detached"], ["flat", "Flat"]];
const AGE_OPTS = [["pre1919", "Pre-1919"], ["1919_44", "1919–44"], ["1945_64", "1945–64"], ["1965_80", "1965–80"], ["post1980", "Post-1980"]];
const SOURCE_LABEL = { epc: "from EPC", legalpack: "from legal pack", desk: "from desk assessment" };

export default function SurveyModule({ deal, rates: ratesProp, maxBid, onChange, onApply, onRatesChange }) {
  const rates = ratesProp || defaultRates();
  const survey = deal.survey || prefillFromDeal(deal);
  const [tab, setTab] = useState(survey.verify?.length ? "verify" : "property");
  const [status, setStatus] = useState("");

  const update = (patch) => onChange({ ...survey, ...patch, updatedAt: Date.now() });
  const setProp = (k, v) => update({ property: { ...survey.property, [k]: v } });
  const setAns = (id, patch) => update({ answers: { ...survey.answers, [id]: { ...(survey.answers?.[id] || {}), ...patch } } });
  const setComp = (id, v) => update({ compliance: { ...survey.compliance, [id]: v } });

  const priced = useMemo(() => priceSurvey(survey.property, survey.answers, rates), [survey.property, survey.answers, rates]);
  const contingency = Math.round(priced.total * (+survey.contingencyPct || 0) / 100);
  const price = +deal.price || 0;
  const margin = maxBid != null ? maxBid - price : null;
  const verdict = maxBid == null ? "Apply to deal for max bid" : margin >= 0 ? "Proceed" : margin > -0.05 * maxBid ? "Negotiate" : "Walk away";
  const tone = verdict === "Proceed" ? "positive" : verdict === "Negotiate" ? "caution" : maxBid == null ? undefined : "negative";
  const provisional = priced.unconfirmed > 0;

  const apply = () => { onApply(surveyToDealPatch({ ...survey, ratesSnapshot: rates }, rates)); update({ ratesSnapshot: rates, appliedAt: Date.now() }); setStatus("Applied to deal — " + priced.lines.length + " lines, " + fmt(priced.total)); };
  const confirmAll = (zone) => {
    const next = { ...survey.answers };
    for (const s of CHECKLIST.filter((x) => x.zone === zone)) for (const it of s.items) if (next[it.id] && next[it.id].confirmed === false) next[it.id] = { ...next[it.id], confirmed: true };
    update({ answers: next });
  };

  const TABS = [survey.verify?.length && ["verify", `Verify (${survey.verify.length})`], ["property", "Property"], ["external", "External"], ["internal", "Internal"], ["compliance", "Compliance"], ["rates", "Rates"], ["report", "Report"]].filter(Boolean);
  const visibleCompliance = COMPLIANCE.filter((c) => c.applies.includes(survey.strategy) || (survey.route === "auction" && c.applies.includes("auction")));

  return (
    <div className="vx-page vx-page--with-bar" style={{ padding: 0 }}>
      <div className="vx-header" style={{ borderRadius: "var(--vx-radius-sm)" }}>
        <div className="vx-row vx-row--between" style={{ alignItems: "baseline" }}>
          <div><div className="vx-header__title">Viewing survey</div><div className="vx-header__sub">{survey.property.address || deal.name}</div></div>
          <Button variant="accent" size="sm" onClick={apply} disabled={!priced.lines.length}>Apply to deal</Button>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>
      <div style={{ padding: "var(--vx-space-4) 0" }}>
        <Status>{status}</Status>

        {tab === "verify" && (
          <section>
            <H2>Verify at viewing</H2>
            <Muted small>Items flagged by the desk assessment and legal pack. Check these first, then work through the walkthroughs.</Muted>
            {survey.verify.map((v, i) => <Item key={i} title={v} />)}
            <Note>Pre-filled answers in the walkthroughs are marked with their source and need your tap to confirm. Totals stay provisional until every pre-filled item is confirmed.</Note>
          </section>
        )}

        {tab === "property" && (
          <section>
            <H2>Property</H2>
            <Field label="Address"><input className="vx-input" value={survey.property.address} onChange={(e) => setProp("address", e.target.value)} /></Field>
            <Field label="Strategy"><Segmented value={survey.strategy} onChange={(v) => update({ strategy: v })} options={[["flip", "Flip (resell)"], ["brrr", "BRRR (refinance & let)"]]} /></Field>
            <Field label="Route"><Segmented value={survey.route} onChange={(v) => update({ route: v })} options={[["market", "Open market"], ["auction", "Auction"]]} /></Field>
            <Field label="Type"><Segmented value={survey.property.type} onChange={(v) => setProp("type", v)} options={TYPE_OPTS} /></Field>
            <Field label="Age band"><Segmented value={survey.property.age} onChange={(v) => setProp("age", v)} options={AGE_OPTS} /></Field>
            <Grid>
              <NumberField label="Floor area (m²)" value={survey.property.area} onChange={(v) => setProp("area", v)} />
              <NumberField label="Storeys" value={survey.property.storeys} onChange={(v) => setProp("storeys", v)} />
              <NumberField label="Bedrooms" value={survey.property.beds} onChange={(v) => setProp("beds", v)} />
              <NumberField label="Bathrooms" value={survey.property.baths} onChange={(v) => setProp("baths", v)} />
              <NumberField label="Kitchen (m²)" value={survey.property.kitchenSize} onChange={(v) => setProp("kitchenSize", v)} />
              <NumberField label="Windows (count)" value={survey.property.windows} onChange={(v) => setProp("windows", v)} />
              <NumberField label="Frontage (m, optional)" value={survey.property.frontage} onChange={(v) => setProp("frontage", v)} />
              <NumberField label="Contingency % of refurb" value={survey.contingencyPct} onChange={(v) => update({ contingencyPct: v })} />
            </Grid>
            <Note tone="caution">Derived for costing: roof {priced.g.roofArea.toFixed(0)} m², exposed wall {priced.g.extWallArea.toFixed(0)} m², plaster {priced.g.plasterArea.toFixed(0)} m², DPC run {priced.g.dpcLength.toFixed(1)} m. Estimated — enter frontage to tighten.</Note>
          </section>
        )}

        {(tab === "external" || tab === "internal") && (
          <section>
            <div className="vx-row vx-row--between"><H2>{tab === "external" ? "External walkthrough" : "Internal walkthrough"}</H2>{priced.unconfirmed > 0 && <Button variant="ghost" size="sm" onClick={() => confirmAll(tab)}>Confirm all pre-filled</Button>}</div>
            {CHECKLIST.filter((s) => s.zone === tab).map((sec) => (
              <div key={sec.title}>
                <H3>{sec.title}</H3>
                {sec.items.map((it) => {
                  const a = survey.answers?.[it.id] || {};
                  const act = it.actions.find((x) => x.id === a.action) || NONE;
                  const line = priced.lines.find((l) => l.id === it.id);
                  const regText = it.reg[survey.strategy === "flip" ? "resale" : "rental"];
                  const unconfirmed = a.confirmed === false;
                  return (
                    <Item key={it.id} title={it.label} value={line ? fmt(line.cost) : null} guide={it.guide}>
                      {unconfirmed && <Note tone="caution" style={{ marginTop: 0, marginBottom: 8 }}>Expected {SOURCE_LABEL[a.source] || "from prefill"}{a.note ? ` — ${a.note}` : ""}. <button className="vx-btn vx-btn--sm" style={{ marginLeft: 8 }} onClick={() => setAns(it.id, { confirmed: true })}>Confirm</button></Note>}
                      <Segmented value={a.action || "none"} onChange={(v) => setAns(it.id, { action: v, confirmed: true, source: "site" })} options={it.actions.map((x) => [x.id, x.label])} />
                      {act.id !== "none" && (
                        <Grid style={{ marginTop: 8 }}>
                          {act.qtyLabel && <NumberField label={act.qtyLabel} value={a.qty ?? ""} onChange={(v) => setAns(it.id, { qty: v })} />}
                          <NumberField label={`Quote £ (benchmark ${fmt(line?.calc)})`} value={a.override ?? ""} onChange={(v) => setAns(it.id, { override: v })} />
                          <Field label="Note"><input className="vx-input" value={a.note || ""} onChange={(e) => setAns(it.id, { note: e.target.value })} /></Field>
                        </Grid>
                      )}
                      {regText && regText !== "—" && <Note>{survey.strategy === "flip" ? "Resale: " : "Rental: "}{regText}</Note>}
                    </Item>
                  );
                })}
              </div>
            ))}
          </section>
        )}

        {tab === "compliance" && (
          <section>
            <H2>Compliance & due diligence</H2>
            <Muted small>Baseline for {survey.strategy === "flip" ? "resale" : "letting"}{survey.route === "auction" ? " via auction" : ""}. Verify each against current guidance before exchange.</Muted>
            {visibleCompliance.map((c) => (
              <Item key={c.id} title={c.label}><Segmented value={survey.compliance?.[c.id] || "unknown"} onChange={(v) => setComp(c.id, v)} options={COMPLIANCE_STATES} /></Item>
            ))}
          </section>
        )}

        {tab === "rates" && (
          <section>
            <H2>Rates</H2>
            <Muted small>Benchmarks are illustrative and unvalidated. Your rates apply to every survey; each applied survey keeps a snapshot of the rates it used.</Muted>
            <Table head={["Item", { label: "Benchmark", numeric: true }, { label: "Your rate £", numeric: true }]}
              rows={RATE_DEFAULTS.map(([k, l, b, u]) => ({ numeric: [false, true, true], cells: [<span key="l">{l}<div className="vx-caption">{u}</div></span>, fmt(b),
                <input key="i" className="vx-input vx-input--right" type="number" inputMode="decimal" value={rates[k]} style={{ width: 100, fontWeight: rates[k] !== b ? 700 : 400 }} onChange={(e) => onRatesChange({ ...rates, [k]: +e.target.value })} />] }))} />
            <div style={{ marginTop: 12 }}><Button variant="ghost" onClick={() => onRatesChange(defaultRates())}>Reset to benchmarks</Button></div>
          </section>
        )}

        {tab === "report" && (
          <section>
            <div className="vx-report-head"><div className="vx-h1">Viewing survey</div><div className="vx-small">{survey.property.address} · {new Date().toLocaleDateString("en-GB")} · VIXIV LTD</div></div>
            <Grid two>
              <Stat label={provisional ? "Maximum bid (provisional)" : "Maximum bid"} value={maxBid != null ? fmt(maxBid) : "—"} big />
              <Stat label="Decision" value={verdict} tone={tone} big />
              <Stat label={survey.route === "auction" ? "Guide price" : "Asking price"} value={fmt(price)} />
              <Stat label="Refurbishment" value={fmt(priced.total)} />
              <Stat label={`Contingency ${survey.contingencyPct}%`} value={fmt(contingency)} />
              <Stat label="Unconfirmed items" value={String(priced.unconfirmed)} tone={priced.unconfirmed ? "caution" : "positive"} />
            </Grid>
            <H3>Schedule of works</H3>
            {priced.lines.length === 0 ? <EmptyState>No work items selected yet — complete the external and internal walkthroughs.</EmptyState> : (
              <Table head={["Item", "Work", { label: "Cost", numeric: true }]} rows={[
                ...priced.lines.map((l) => ({ numeric: [false, false, true], cells: [<span key="a">{l.label}<div className="vx-caption">{l.section}{l.note ? " · " + l.note : ""}</div></span>, <span key="b">{l.action}{l.quoted && <div className="vx-caption">quoted (benchmark {fmt(l.calc)})</div>}{!l.confirmed && <div className="vx-caption vx-caution">unconfirmed</div>}</span>, fmt(l.cost)] })),
                { total: true, numeric: [false, false, true], cells: ["Refurbishment total", "", fmt(priced.total)] },
                { numeric: [false, false, true], cells: [`Contingency ${survey.contingencyPct}%`, "", fmt(contingency)] },
              ]} />
            )}
            <H3>Regulatory baseline — {survey.strategy === "flip" ? "resale" : "letting"}</H3>
            <Table rows={visibleCompliance.map((c) => { const v = survey.compliance?.[c.id] || "unknown"; const lbl = COMPLIANCE_STATES.find(([k]) => k === v)?.[1]; return { numeric: [false, true], tone: [null, v === "yes" ? "positive" : v === "no" ? "negative" : v === "verify" ? "caution" : null], cells: [c.label, lbl] }; })} />
            <p className="vx-caption" style={{ marginTop: 12 }}>Benchmark rates and derived geometry are illustrative and unvalidated; quoted lines are marked. Max bid is computed by the DealsDash appraisal engine from the applied refurbishment figures, fees, SDLT and finance on the deal.</p>
            <div className="vx-row vx-no-print" style={{ marginTop: 12 }}><Button onClick={() => window.print()}>Print / save as PDF</Button><Button variant="accent" onClick={apply} disabled={!priced.lines.length}>Apply to deal</Button></div>
          </section>
        )}
      </div>
      <LiveBar left={<>Refurb {fmt(priced.total)} + {survey.contingencyPct}%{provisional ? ` · ${priced.unconfirmed} unconfirmed` : ""}<br />vs {survey.route === "auction" ? "guide" : "asking"} {fmt(price)}</>} label={maxBid == null ? "Max bid (apply to deal)" : provisional ? "Max bid (provisional)" : "Maximum bid"} value={maxBid != null ? fmt(maxBid) : "—"} tone={tone} />
    </div>
  );
}
