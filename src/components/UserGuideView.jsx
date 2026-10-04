/**
 * UserGuideView — in-app reference guide.
 *
 * Explains every screen, tab, form field, flag, badge, and calculated indicator
 * so a user (or a new team member) can understand exactly what each number means,
 * how it was produced, and what "good" looks like.
 *
 * Rendering is pure JSX — no external data dependencies — so this can be loaded
 * at any point in the app lifecycle, including before deals are created.
 */

import React, { useState } from "react";
import {
  BookOpen, ChevronRight, ChevronDown, Home, Layers, Building2, BookMarked,
  Wallet, TrendingUp, ShieldAlert, Users, KeyRound, Radar, Bell, Map,
  CheckCircle2, XCircle, AlertTriangle, Info, Banknote, FileText, Star,
} from "lucide-react";

/* ── Shared section primitives ─────────────────────────────────────────── */

/** Collapsible heading for each guide chapter. */
function Section({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-vx-divider rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-vx-surface hover:bg-vx-surface-2 text-left"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-vx-accent shrink-0" />}
          <span className="font-serif font-semibold text-vx-text">{title}</span>
        </div>
        {open ? <ChevronDown size={16} className="text-vx-muted shrink-0" /> : <ChevronRight size={16} className="text-vx-muted shrink-0" />}
      </button>
      {open && <div className="px-5 py-4 space-y-4 text-sm text-vx-text leading-relaxed bg-vx-bg">{children}</div>}
    </div>
  );
}

/** Highlighted callout block with tone variants. */
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

/** Compact table for indicator / flag references. */
function FlagTable({ rows }) {
  return (
    <table className="w-full text-xs border-collapse">
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
            <td className="py-1.5 pr-3 font-mono font-semibold text-vx-accent whitespace-nowrap">{flag}</td>
            <td className="py-1.5 pr-3 text-vx-text">{meaning}</td>
            <td className="py-1.5 text-vx-muted">{good}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Two-column definition list for field explanations. */
function FieldList({ items }) {
  return (
    <dl className="space-y-2">
      {items.map(([term, def], i) => (
        <div key={i} className="grid grid-cols-[160px_1fr] gap-2 text-xs">
          <dt className="font-semibold text-vx-text leading-snug pt-0.5">{term}</dt>
          <dd className="text-vx-muted leading-snug">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GUIDE SECTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function OverviewSection() {
  return (
    <Section title="What is DealsDash?" icon={BookOpen} defaultOpen>
      <p>
        DealsDash is a deal-appraisal and portfolio-management platform for UK property investors
        running a flipping or BRRR (Buy–Refurbish–Refinance–Rent) strategy. Everything syncs in
        real time through Firestore so your numbers are the same on every device.
      </p>

      <p className="font-semibold text-vx-text">Core workflow in four steps:</p>
      <ol className="list-decimal list-inside space-y-1 text-vx-muted">
        <li><span className="text-vx-text font-medium">Screen</span> — use Area Screener to rank 300+ UK councils by yield, growth, and flip evidence</li>
        <li><span className="text-vx-text font-medium">Source</span> — track leads in the Pipeline, run triage questions, review legal packs</li>
        <li><span className="text-vx-text font-medium">Appraise</span> — open a Deal, fill in the twelve tabs, read the Decision Brief</li>
        <li><span className="text-vx-text font-medium">Manage</span> — move completed deals to the rental portfolio, track compliance and BRRR readiness</li>
      </ol>

      <Callout tone="info">
        <span><strong>Sign-in:</strong> The app is locked to a single Google account. Sign in with Google on the login screen. All data lives in your private Firestore sub-tree; no other user can access it.</span>
      </Callout>

      <p className="font-semibold text-vx-text">Navigation (left sidebar / bottom bar on mobile):</p>
      <FieldList items={[
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
    </Section>
  );
}

function DashboardSection() {
  return (
    <Section title="Dashboard" icon={Home}>
      <p>
        The Dashboard shows the live health of your entire business. Every figure re-calculates
        whenever you update a deal — nothing here is cached.
      </p>

      <p className="font-semibold text-vx-text">KPI strip (top row):</p>
      <FlagTable rows={[
        ["Total capital base",        "Capital contributed + realised profit from sold deals",                                              "Growing each quarter"],
        ["Free cash",                 "Capital base minus cash committed to live deals",                                                    "Positive; red if negative (over-committed)"],
        ["Committed to deals",        "Sum of ownCash across all active deals",                                                             "Should not exceed capital base"],
        ["Cash runway",               "Free cash ÷ monthly burn rate. '∞' when burn rate is zero",                                         "≥ 6 months; red if < 3 months"],
        ["Portfolio annualised ROI",  "Weighted average annualised ROI, weighted by cash deployed per deal",                                "≥ 25% (green); unlabelled otherwise"],
        ["Active deals",              "Deals in Under Offer, Refurbishment, or Marketing status",                                           "Matched to your concurrency target"],
        ["Rental portfolio",          "Properties under management. Sub-label shows compliance issues",                                     "Zero compliance issues (green badge)"],
      ]} />

      <p className="font-semibold text-vx-text">Charts:</p>
      <FieldList items={[
        ["Capital allocation pie",  "Donut of ownCash per active deal. Shows concentration at a glance."],
        ["Annualised ROI bar",      "Bar per active deal, showing annualised ROI%. Helps identify underperformers."],
      ]} />

      <p className="font-semibold text-vx-text">Alerts panel:</p>
      <FlagTable rows={[
        ["Funding shortfall",   "A deal's required funds exceed own cash + bridge available",        "No shortfall alerts"],
        ["High risk deal",      "A deal's weighted risk score < 3.0",                               "No risk alerts"],
        ["Cash runway < 3 mo",  "Free cash / monthly burn is critically low",                       "≥ 3 months free runway"],
        ["Geographic concentration", "One town holds > 60% of committed capital",                   "< 60% in any one town"],
        ["Leverage > 70%",      "Bridge debt / total capital exceeds 70%",                          "< 70% leverage ratio"],
        ["Compliance overdue",  "A rental property has an expired compliance document",             "All documents valid"],
      ]} />

      <Callout tone="good">
        A healthy dashboard shows: positive free cash, ≥ 25% portfolio ROI, no red alerts, and
        no compliance issues. That is the benchmark to aim for.
      </Callout>
    </Section>
  );
}

function WorkspaceSection() {
  return (
    <Section title="Workspace (Map)" icon={Map}>
      <p>
        The Workspace is a spatial view of your sourcing activity. Every lead and deal with a
        valid postcode is plotted on an interactive map. Use it during sourcing to understand
        geographic concentration and to cross-reference leads with area intelligence.
      </p>
      <FieldList items={[
        ["Filter rail",          "Left panel lets you filter by status, deal stage, and area to focus the map."],
        ["Satellite toggle",     "Switch between road and satellite view — useful for assessing street quality."],
        ["Pin click",            "Opens a mini-card for the lead/deal with key stats and a link to the full record."],
        ["URL-persisted filters","Map filters are saved in the URL so you can share or bookmark a filtered view."],
      ]} />
      <Callout tone="info">
        Postcodes are geocoded via postcodes.io. If a pin doesn't appear, check that the postcode
        field is filled in on the lead or deal.
      </Callout>
    </Section>
  );
}

function PipelineSection() {
  return (
    <Section title="Pipeline (Sourcing)" icon={Layers}>
      <p>
        The Pipeline is a Kanban board for leads — properties that are on your radar but haven't
        yet been turned into a full appraisal. Use it to capture everything you're watching, score
        it quickly, and either reject or promote to a Deal.
      </p>

      <p className="font-semibold text-vx-text">Lead statuses:</p>
      <FlagTable rows={[
        ["New",           "Just logged; automated gate check will run against your buy box",          "Move to Watchlist or reject within 48h"],
        ["Watchlist",     "Worth watching; monitoring for price changes or new info",                  "Continue researching; set auction date"],
        ["Under offer",   "You've bid or made an offer",                                               "Triage complete, legal pack reviewed"],
        ["Promoted",      "Converted to a full Deal appraisal",                                        "Terminal — no further action in Pipeline"],
        ["Rejected",      "Doesn't meet criteria — auto-set when buy box gate fails",                  "Terminal — document why in notes"],
        ["Unsold check",  "(Derived, not stored) Auction date passed without a status update",         "Re-verify outcome and update status"],
      ]} />

      <p className="font-semibold text-vx-text">Auction signals (flags that appear on a lead card):</p>
      <FlagTable rows={[
        ["Late entry",          "Property entered auction catalogue recently",                         "Combined with low comparables = opportunity"],
        ["No viewings",         "No viewings booked — less competition likely",                        "Verify with auction house"],
        ["Late legal pack",     "Pack released after standard deadline",                               "Allow extra time for solicitor review"],
        ["Price reduced",       "Guide price has been lowered",                                        "Re-run max bid solver against new guide"],
        ["Previously withdrawn","Withdrawn from a previous sale or auction",                           "Investigate why — chain falls, lender issue?"],
        ["Previously unsold",   "Failed to sell at auction before",                                    "Original reserve was too high; guide may be lower now"],
      ]} />

      <p className="font-semibold text-vx-text">Triage questions (8-question gate):</p>
      <p className="text-vx-muted">
        The triage checklist is the first structured filter before you spend time on a full appraisal.
        Questions 1–3 and 7–8 (marked gating) are deal-killers — a single 'No' auto-rejects the lead.
        Questions 4–6 are informational and affect completeness only.
      </p>
      <FlagTable rows={[
        ["Area known? (gating)",             "Do you know this area well enough to be confident in your GDV and demand estimate?",     "Yes"],
        ["Asset type fits? (gating)",         "Does the property type match your buy box?",                                            "Yes"],
        ["Condition adds value? (gating)",    "Will refurbishment genuinely improve the property's value and saleability?",            "Yes"],
        ["Seller motivated? (info)",          "Is there evidence of a genuine vendor (probate, speed, financial distress)?",           "Yes"],
        ["Guide price sensible? (info)",      "Is the guide or asking price realistic given comparable evidence?",                    "Yes"],
        ["Value-add clear? (info)",           "Can you clearly articulate the specific improvement driving the upside?",               "Yes"],
        ["Can sell in 12m / refi in 6m? (gating)", "Liquidity constraint — needed for BRRR timing and bridge term alignment",       "Yes"],
        ["Area strong on V, V, D? (gating)", "Value, Volume, and Demand — key area strength test",                                    "Yes"],
      ]} />

      <Callout tone="warn">
        A triage result of <strong>Fail</strong> means at least one gating question was answered No.
        A result of <strong>Incomplete</strong> means unanswered questions remain. Only <strong>Pass</strong>
        (all eight answered Yes) allows a BUY recommendation on the Decision Brief.
      </Callout>

      <p className="font-semibold text-vx-text">IMD & momentum pills (on lead/deal cards in the list):</p>
      <FlagTable rows={[
        ["IMD n/10 (green)",    "Index of Multiple Deprivation decile 8–10 — affluent or average area",             "Decile 8, 9, or 10"],
        ["IMD n/10 (amber)",    "Decile 4–7 — mid-deprivation",                                                     "Monitor demand carefully"],
        ["IMD n/10 (red)",      "Decile 1–3 — most deprived 30% of LSOAs",                                         "High scrutiny; confirm exit demand explicitly"],
        ["↑ x.x% (green)",      "Positive 12-month price momentum in the postcode district",                        "Positive momentum"],
        ["↓ x.x% (red)",        "Negative 12-month price momentum",                                                 "Caution — reconsider GDV estimate"],
      ]} />

      <p className="font-semibold text-vx-text">Promote to Deal:</p>
      <p className="text-vx-muted">
        When a lead passes triage and you want a full appraisal, click "Promote to deal". This creates
        a new Deal pre-filled from the lead's address, property type, postcode, guide price, and any
        legal pack documents — saving you from re-entering data.
      </p>
    </Section>
  );
}

function DealsSection() {
  return (
    <Section title="Deals — list view" icon={Building2}>
      <p>
        The Deals list shows every appraisal you've created. Click any row to open the full twelve-tab
        detail view. Each card shows the key financials and the deal verdict.
      </p>

      <p className="font-semibold text-vx-text">Deal verdict badges:</p>
      <FlagTable rows={[
        ["PROCEED (green)",  "Net profit, ROI, annual ROI, risk score, and funding all pass your thresholds",  "Aim for all active deals to reach PROCEED"],
        ["CAUTION (amber)",  "1–2 checks fail — worth reviewing but not an auto-reject",                       "Identify the failing checks; address or accept"],
        ["REJECT (red)",     "3 or more checks fail",                                                         "Only proceed if you have strong mitigating evidence"],
      ]} />

      <Callout tone="info">
        Verdict thresholds come from your default Buy Box (Playbooks tab). If you haven't set one,
        the app defaults are: net profit ≥ £25k, ROI ≥ 20%, annualised ROI ≥ 25%, risk score ≥ 3.0.
      </Callout>
    </Section>
  );
}

function DealDetailSection() {
  return (
    <Section title="Deal detail — all twelve tabs" icon={Building2}>

      {/* Tab 1 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 1 — Property &amp; comps</p>
        <p className="text-vx-muted">
          The foundation tab. Fill this in first — the GDV calculation and all downstream numbers
          depend on what's here.
        </p>
        <FieldList items={[
          ["Address / postcode",      "Full address and postcode. Postcode triggers IMD lookup and price momentum pill."],
          ["Property type",           "Terrace, Semi, Detached, or Flat. Used in buy box gate check."],
          ["Bedrooms / floor area",   "Bedrooms is informational. Floor area (sq ft) is the key GDV driver — get it from the EPC or rightmove listing."],
          ["Condition (1–5)",         "1 = very poor, 5 = ready to let. Higher condition suppresses the value-add rationale."],
          ["Condition adjustment %",  "Applies a + or - % multiplier to the GDV. Use for properties above/below average condition for the street."],
          ["Days on market",          "Visible on the headline strip; long DOM suggests motivated seller or overpriced guide."],
          ["GDV override",            "Lock the GDV to your own figure. When blank, GDV is calculated as avg £/sqft (from comps) × floor area × condition adjustment."],
          ["Comparables (3 rows)",    "Recent sold prices from Rightmove/Zoopla or Land Registry. Enter address, price, date, and floor area. The app derives £/sq ft and shows where your property sits in the distribution."],
          ["Owner-occupier demand",   "Set to Y (yes) if the street has strong owner-occupier demand. N triggers a failing check on the verdict."],
        ]} />
        <Callout tone="good">
          Three or more comparables with floor area filled in unlocks the P25/median/P75 £/sq ft
          distribution panel — a much stronger GDV anchor than a single average. That's the "good"
          state for this tab.
        </Callout>
      </div>

      {/* Tab 2 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 2 — Purchase &amp; funding</p>
        <FieldList items={[
          ["Purchase price",          "Your intended bid or agreed price. The entire cost stack and profit figure move with this."],
          ["Additional property?",    "Toggle on if this is not your only property — activates the additional-property SDLT surcharge bands (effective 31 Oct 2024)."],
          ["Own cash (£)",            "How much of your own money goes into this deal on day one. ROI = net profit ÷ own cash."],
          ["Bridge LTV %",            "Percentage of purchase price the bridge lender will fund. Typically 70–75%."],
          ["Bridge monthly rate %",   "Monthly interest rate (e.g. 0.85% = 0.0085). Most bridging is 0.7–1.0%/month."],
          ["Arrangement fee %",       "Bridge lender's upfront arrangement fee. Typically 1.5–2%."],
          ["Exit fee %",              "Bridge lender's exit fee on redemption. Typically 1%."],
          ["Acquisition fees",        "Solicitor, searches, survey, broker, valuation, Land Reg, other. Pre-populated from buy box assumptions."],
          ["Guide price",             "Auction guide or asking price. Used in the max bid solver and Decision Brief valuation section."],
        ]} />
        <Callout tone="info">
          SDLT is auto-calculated for England (using the correct surcharge or standard bands depending
          on the Additional property? toggle). Scotland uses LBTT; Wales uses LTT — the app shows a
          warning to use the respective revenue authority's calculator.
        </Callout>
      </div>

      {/* Tab 3 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 3 — Funding Planner</p>
        <p className="text-vx-muted">
          A three-mode deep-dive into your cash requirements and exits. Choose the mode that matches
          your intended strategy for this deal.
        </p>
        <FieldList items={[
          ["Cash purchase",       "Full own-cash acquisition. Calculates total cash-in = price + SDLT + fees + refurb + holding costs."],
          ["Bridging (flip/BRRR)","Most common mode. Shows cash-in, bridge redemption, flip profit, and BRRR money-left-in side by side."],
          ["BTL mortgage",        "Direct buy-to-let without a bridge. Deposit + SDLT + fees + refurb."],
        ]} />
        <p className="font-semibold text-vx-text">Bridging mode key outputs:</p>
        <FlagTable rows={[
          ["Cash in",             "Own cash required on completion day (purchase − bridge + SDLT + fees + refurb + arrangement ± interest if serviced)",  "Matches your available own cash"],
          ["Flip profit",         "Net sale proceeds − bridge redemption − cash in",                                                                      "Positive; ideally ≥ £25k"],
          ["Money left in",       "BRRR exit: own cash not recovered after refinancing. Zero = full recycling",                                            "As close to zero as possible"],
          ["Cash released ↩",    "Refi loan exceeds bridge redemption + cash in — you actually pull cash OUT",                                            "Excellent — only achievable with strong rental income and high GDV"],
          ["ICR",                 "Interest Coverage Ratio: annual rent ÷ (refi loan × stress rate). Lenders typically require ≥ 1.25–1.45×",             "≥ 1.25× (threshold set in buy box)"],
          ["Fund days",           "Estimated days the VIXIV revolving fund allocation is tied up, derived from your timeline",                             "Within 365-day fund term"],
        ]} />
        <p className="font-semibold text-vx-text">Interest mode toggle:</p>
        <FieldList items={[
          ["Retained (rolled up)", "Interest compounds and is added to the bridge redemption. No monthly cash outflow — the standard approach for flips."],
          ["Serviced (monthly)",   "Interest paid monthly from own cash. Lower redemption but higher upfront cash requirement."],
        ]} />
        <p className="font-semibold text-vx-text">SDLT breakdown section:</p>
        <p className="text-vx-muted">
          Shows the tax payable per band with rates and amounts. The disclaimer confirms which rate
          table applies and its effective date. Always verify with HMRC before exchange.
        </p>
        <p className="font-semibold text-vx-text">VIXIV revolving fund section:</p>
        <p className="text-vx-muted">
          If your deal uses capital from the VIXIV revolving fund, enter or confirm the allocation.
          The fund has a 12-month term and a 3-month extension. Warnings fire if your deal timeline
          exceeds these limits.
        </p>
      </div>

      {/* Tab 4 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 4 — Refurb</p>
        <FieldList items={[
          ["Trade line items",    "Pre-populated with eleven standard trades. Enter a low and high quote for each trade you'll use. Unused trades stay at zero."],
          ["Contingency %",       "Added on top of the mid-point total. 15% is the buy box default. Never go below 10% for a major refurb."],
          ["Refurb total",        "Mid-point of all trades plus contingency. This is what flows into the appraisal engine."],
        ]} />
        <Callout tone="good">
          A well-filled refurb tab has actual builder quotes (not guesses) with low/high ranges, and
          a contingency of ≥ 15%. If any line is zero for a trade you definitely need, the Decision
          Brief will flag "Refurb cost not estimated" as a medium risk.
        </Callout>
      </div>

      {/* Tab 5 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 5 — Timeline &amp; holding</p>
        <p className="text-vx-muted">
          The timeline drives your bridge term, holding cost total, and annualised ROI. It is split
          into five default phases — adjust the weeks per phase to match your realistic programme.
        </p>
        <FieldList items={[
          ["Offer to exchange",         "Solicitor conveyancing period. Typically 3–5 weeks."],
          ["Exchange to completion",    "Short gap between contracts exchanged and funds transferred. Typically 1–2 weeks."],
          ["Refurbishment",             "Works programme. Derived from buy box 'Works months' assumption if set."],
          ["Marketing period",          "Time on market before sale agreed. Derived from buy box 'Marketing months' if set."],
          ["Sale agreed to completion", "Second conveyancing period. Typically 4–8 weeks."],
          ["Holding costs (monthly)",   "Council tax, insurance, utilities, other. Enter monthly amounts; total is multiplied by the timeline in months."],
        ]} />
        <Callout tone="warn">
          Bridge interest accrues for the full timeline in months. A 1-week overrun on a £200k bridge
          at 0.85%/month costs roughly £392 extra. Keep the timeline tight and revisit it after the
          viewing survey.
        </Callout>
      </div>

      {/* Tab 6 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 6 — Returns &amp; rental</p>
        <p className="text-vx-muted">
          For BRRR deals, rental income drives the ICR test and net cash flow. For flips, these
          figures are informational — they show what you'd earn if you held rather than sold.
        </p>
        <FieldList items={[
          ["Monthly rent (£)",      "Market rent after refurb, confirmed by a letting agent ideally."],
          ["Void allowance %",      "Percentage of year without a tenant. 5% = ~3 weeks/year."],
          ["Management fee %",      "Letting agent fee on collected rent. Typically 8–12%."],
          ["Maintenance %",         "Annual maintenance budget as % of gross rent. 8% is conservative."],
          ["Landlord insurance (£/yr)", "Annual building and landlord liability insurance."],
          ["BTL LTV %",             "Refinance LTV. Most BTL lenders go to 75%."],
          ["BTL mortgage rate %",   "Indicative annual rate for the refinance product."],
        ]} />
        <FlagTable rows={[
          ["Gross yield",         "Annual rent ÷ GDV × 100%",                                         "≥ 6–7% for a strong BRRR deal"],
          ["Net cash flow/month", "NOI − annual mortgage payment ÷ 12. NOI = rent − voids − mgmt − maintenance − insurance", "Positive; ideally ≥ £200/month after all deductions"],
          ["Cash-on-cash return", "Annual net cash flow ÷ cash left in after refi",                    "> 10% annually on recycled capital"],
        ]} />
      </div>

      {/* Tab 7 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 7 — Risk</p>
        <p className="text-vx-muted">
          An eight-factor weighted scorecard that produces a single risk rating for the deal.
          Each factor is scored 1–5 and given a weight. The composite is a weighted average.
        </p>
        <FlagTable rows={[
          ["Score ≥ 4.0 → LOW RISK",    "Weighted average of all eight factors ≥ 4.0",         "Target for active deals"],
          ["Score 3.0–3.9 → MEDIUM RISK","Acceptable but monitor named factors",                "Acceptable at 3.0+ minimum"],
          ["Score < 3.0 → HIGH RISK",   "At least one major factor is very weak",               "Triggers an alert on the Dashboard"],
        ]} />
        <FieldList items={[
          ["Crime rate (20%)",                 "Score 5 = very low crime vs national average. Source: police.uk."],
          ["% social housing (15%)",           "Score 5 = minimal social housing on the street. High % suppresses owner-occupier demand."],
          ["Average household income (15%)",   "Score 5 = well above local average."],
          ["Population growth trend (10%)",    "Score 5 = growing population / strong in-migration."],
          ["Owner-occupier demand (20%)",      "Score 5 = strong evidence of owner-occupiers buying on the street. Highest weight — most predictive of exit speed."],
          ["Liquidity — days on market (10%)", "Score 5 = properties sell in < 30 days. Score 1 = > 120 days on market."],
          ["Flood risk (5%)",                  "Score 5 = no flood risk zones within 3km. Pulled automatically from Environment Agency data if Area Intelligence has run."],
          ["School catchment (5%)",            "Score 5 = outstanding Ofsted rating in catchment. Proxy for family demand."],
        ]} />
        <Callout tone="info">
          The risk score gates the Verdict: the default minimum is 3.0. You can override this in
          Playbooks → Thresholds.
        </Callout>
      </div>

      {/* Tab 8 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 8 — Simulate</p>
        <p className="text-vx-muted">
          A what-if overlay. Adjust price, GDV, bridge rate, refurb multiplier, and duration using
          sliders. The right column shows how each output changes vs the live appraisal — delta
          arrows indicate whether the change is better (▲ green) or worse (▼ red).
        </p>
        <p className="text-vx-muted">
          Use it to stress-test your bid, answer "what happens if the refurb runs 20% over?" or
          "what if GDV comes in 5% lower than expected?". Changes here are not saved — they are
          session-only.
        </p>
      </div>

      {/* Tab 9 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 9 — AI review</p>
        <p className="text-vx-muted">
          Triggers a Cloud Function that runs an AI-assisted research pass. It populates:
        </p>
        <ul className="list-disc list-inside text-vx-muted space-y-1">
          <li>Area Intelligence (IMD decile, flood risk, EPC lookup)</li>
          <li>Comparable sales from Land Registry Price Paid</li>
          <li>Buy box gate check against your default Playbook</li>
          <li>Risk factor pre-fills based on crime, census, and market data</li>
        </ul>
        <Callout tone="warn">
          AI research passes use real external APIs (postcodes.io, EA flood map, EPC register).
          Results are illustrative where the underlying data source is incomplete. Always cross-check
          with direct market observation before bidding.
        </Callout>
      </div>

      {/* Tab 10 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 10 — Legal pack</p>
        <p className="text-vx-muted">
          Upload legal pack documents (title register, lease, planning, searches, etc.) and run
          AI-assisted review. Each document can be flagged with issues by urgency:
        </p>
        <FlagTable rows={[
          ["Raise with solicitor before bidding", "A red flag that blocks a BUY verdict on the Decision Brief until resolved",     "Zero pre-bid flags"],
          ["Raise with solicitor post-purchase",  "Worth noting but does not block the decision",                                  "Review before exchange"],
          ["Informational",                       "Context only; no action required",                                              "No concern"],
        ]} />
        <p className="text-vx-muted">
          Buyer premium, other seller fee reimbursements, and the completion period are extracted
          from the pack and can be applied to the deal (updates fees.other and completionDays).
        </p>
      </div>

      {/* Tab 11 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 11 — Viewing survey</p>
        <p className="text-vx-muted">
          A structured checklist for recording observations during a physical viewing. Covers
          structural, damp, electrical, plumbing, kitchen, bathroom, windows, and exterior.
        </p>
        <FieldList items={[
          ["Survey items",      "Tick/note what you find. Severity levels (minor/moderate/major) feed into cost estimates."],
          ["Apply to deal",     "Stamps the surveyed refurb costs onto the Deal's refurb tab — merging survey lines with any manually entered trades."],
          ["Max bid re-solve",  "If the max bid isn't locked, it re-solves automatically after 'Apply to deal' to reflect the updated cost stack."],
        ]} />
        <Callout tone="good">
          Best practice: complete the viewing survey for every property you physically inspect, then
          immediately click "Apply to deal" so the appraisal reflects real observations rather than
          assumptions.
        </Callout>
      </div>

      {/* Tab 12 */}
      <div className="space-y-2">
        <p className="font-semibold text-vx-text border-b border-vx-divider pb-1">Tab 12 — Decision Brief</p>
        <p className="text-vx-muted">
          The one-page investment committee document. It consolidates all appraisal inputs into a
          BUY / WATCH / PASS recommendation with supporting evidence. Print to PDF via the browser.
        </p>
        <p className="font-semibold text-vx-text">Three-tier verdict logic:</p>
        <FlagTable rows={[
          ["PASS (hard fail)", "Any of: gating Q answered No; unresolved legal pack red flag; outside buy box on area/type/tenure; profit on cost < minimum; ICR fails and deal uses debt", "No PASS conditions present"],
          ["BUY (all green)",  "All PASS conditions clear; net profit ≥ minimum; money left in ≤ maximum (BRRR); all triage Qs answered", "What you're aiming for"],
          ["WATCH",            "No PASS conditions but one or more WATCH conditions (e.g. net profit just below minimum, unanswered triage Qs)", "Resolve the named watch condition"],
        ]} />
        <p className="font-semibold text-vx-text">Max bid solver:</p>
        <p className="text-vx-muted">
          The max bid solver bisects backward from your target profit: given a conservative GDV
          (derived from the 25th-percentile comparable), it finds the highest purchase price at
          which profit still meets your minimum. Use it to set a hard ceiling before the auction
          room.
        </p>
        <FieldList items={[
          ["Solve",     "Runs the bisection. Updates the max bid field."],
          ["Lock",      "Freezes the figure. A locked max bid prevents it being silently overridden. Confirm any increase above a previously locked figure."],
          ["Unlock",    "Reopens for a new solve — log entry records the unlock reason."],
        ]} />
        <Callout tone="risk">
          If the max bid solver returns £0, your target profit is not achievable at any purchase
          price given current GDV and cost assumptions — re-examine GDV, reduce refurb, or lower
          the profit target before bidding.
        </Callout>
        <p className="font-semibold text-vx-text">Risk register &amp; open questions:</p>
        <p className="text-vx-muted">
          Auto-generated from deal data. Red flags from the legal pack, EPC F/G, flood zones,
          missing refurb estimates, and unapplied survey results all appear here with
          mitigations. Resolve each before signing contracts.
        </p>
      </div>
    </Section>
  );
}

function PlaybooksSection() {
  return (
    <Section title="Playbooks (Buy Box)" icon={BookMarked}>
      <p>
        A Playbook (buy box) defines your investment criteria. You can have multiple buy boxes —
        one for flips, one for BRRR, one for a specific town — but only one is "default" at a time.
        The default buy box gates incoming leads automatically and pre-fills new deals.
      </p>

      <p className="font-semibold text-vx-text">Three sub-tabs:</p>
      <FieldList items={[
        ["Filters",       "Objective, data-checkable criteria: postcode areas/districts, property types, tenure, max guide price. These auto-reject new leads that fail them."],
        ["Assumptions",   "Financial defaults pre-filled into every new deal: bridge rates, fees, LTVs, timeline months, ICR stress rate, etc."],
        ["Thresholds",    "Decision Brief pass/fail thresholds: min net profit (£), min ROI%, min annualised ROI%, min risk score, profit-on-cost %."],
      ]} />

      <p className="font-semibold text-vx-text">Assumption snapshot on deals:</p>
      <p className="text-vx-muted">
        When a deal is created from a buy box, the assumption values are snapshotted. If you later
        update the buy box, a "Buy box updated" banner appears on the deal. Click "Reapply" to pull
        in the new defaults — only fields that match the buy box are updated; manual deal-level
        overrides are marked with a small "overridden" label.
      </p>

      <Callout tone="good">
        Treat your buy box as a living document — review it after every deal. If you consistently
        override the same assumption (e.g. bridge rate), update the buy box default so new deals
        start with the correct figure.
      </Callout>
    </Section>
  );
}

function CapitalSection() {
  return (
    <Section title="Capital &amp; Cash Flow" icon={Wallet}>
      <p>
        The Capital tab tracks the money flowing in and out of your business. Every entry in the
        ledger feeds the Dashboard's "Total capital base" and "Free cash" KPIs.
      </p>

      <p className="font-semibold text-vx-text">Capital ledger:</p>
      <FieldList items={[
        ["Direction: In",   "Capital you've added to the business (own savings, investor contribution)."],
        ["Direction: Out",  "Capital withdrawn (distributions, personal drawings)."],
        ["Total capital base", "Sum of all 'in' entries minus all 'out' entries, plus realised profit from sold deals."],
        ["Free cash",       "Capital base minus committed cash (own cash across active deals). If negative, you've over-committed."],
      ]} />

      <p className="font-semibold text-vx-text">Settings (gear icon):</p>
      <FieldList items={[
        ["Monthly burn (£)",          "Your fixed monthly overhead (personal living costs, company expenses). Drives the 'cash runway' KPI."],
        ["Lender fund size (£)",      "Total size of the VIXIV revolving credit facility."],
        ["Lender fund rate % p.a.",   "Annual interest rate on the revolving fund. Divided into a daily cost per deal."],
      ]} />

      <Callout tone="info">
        Realized profit from sold deals is added to the capital base automatically — you don't need
        to log it manually. It flows from the Deal's status being set to "Sold".
      </Callout>
    </Section>
  );
}

function PlannerSection() {
  return (
    <Section title="Business Planner" icon={TrendingUp}>
      <p>
        A Monte Carlo-style cash recycling simulation. It models how quickly your capital can
        compound toward a target monthly income over 60 months, given deal speed and concurrent
        deal capacity.
      </p>
      <FieldList items={[
        ["Starting capital",        "Free cash at today's date (auto-populated but editable)."],
        ["Avg own cash per deal",   "Your average cash-in per deal."],
        ["Avg deal duration",       "Average months from purchase to cash recycled."],
        ["Avg net profit per deal", "Average profit after all costs per deal."],
        ["Max concurrent deals",    "How many deals can run simultaneously with available capital."],
        ["Target monthly income",   "Your income goal. The chart shows when monthly run-rate first crosses this line."],
      ]} />
      <FlagTable rows={[
        ["Deals/year at capacity",     "Max concurrent × (12 ÷ avg duration)",                  "Higher is better — but realistic"],
        ["Steady-state annual profit", "Deals/year × avg profit/deal",                           "Should exceed your annual income target"],
        ["Capital for full capacity",  "Max concurrent × avg cash per deal",                    "Must be ≤ total capital base"],
        ["Months to target",           "First month where trailing 12-month income run-rate ≥ target. '60+' if not reached", "The shorter the better"],
      ]} />
    </Section>
  );
}

function RiskSection() {
  return (
    <Section title="Risk Exposure" icon={ShieldAlert}>
      <p>
        A portfolio-level risk view. Individual deal risk scores live on the deal's Risk tab;
        this view aggregates them and adds structural portfolio metrics.
      </p>
      <FlagTable rows={[
        ["Leverage ratio",         "Bridge debt outstanding ÷ total capital base. > 70% triggers an amber alert",             "< 70%"],
        ["Capital exposure",       "Committed capital ÷ total capital base. > 80% triggers amber",                           "< 80%"],
        ["Largest town concentration", "% of committed capital in a single town. > 60% triggers an amber alert",             "< 60%"],
        ["Bridge debt outstanding", "Sum of drawn bridge loans across active deals",                                         "Tracked, no hard threshold"],
      ]} />
    </Section>
  );
}

function ContactsSection() {
  return (
    <Section title="Contacts" icon={Users}>
      <p>
        A trade and professional directory. Two categories: Trade (builders, electricians, etc.)
        and Professional (solicitors, brokers, agents, etc.).
      </p>
      <FieldList items={[
        ["Status: Preferred", "Your go-to for this trade/role. Filter to preferred contacts when quoting."],
        ["Status: Active",    "Currently using; relationship in good standing."],
        ["Status: Untested",  "New contact — no completed work yet."],
        ["Status: Avoid",     "Do not use again. Add notes explaining why."],
        ["Rating (stars)",    "1–5 star rating for personal reference."],
        ["Area covered",      "Towns or postcodes the contact works in — useful for area-specific searches."],
        ["Rate",              "Day rate, quote or contract reference. Free text."],
      ]} />
    </Section>
  );
}

function PropertiesSection() {
  return (
    <Section title="Properties (Rental Portfolio)" icon={KeyRound}>
      <p>
        After a BRRR deal completes you can promote it to the Properties tab — the rental portfolio
        and compliance management section. Each property has four sub-tabs.
      </p>

      <p className="font-semibold text-vx-text">Sub-tabs:</p>
      <FieldList items={[
        ["Overview / tenancy",  "Tenant name, start date, monthly rent, deposit protection details."],
        ["Compliance",          "Mandatory certificates: Gas Safety, EICR, EPC, HMO licence, deposit protection, PRS registration. Enter expiry date for each."],
        ["Rent ledger",         "Manual rent log. Each entry records date, amount due, amount received, and status (Paid/Late/Partial/Missed)."],
        ["BRRR readiness",      "Five-point refinance checklist. READY = all five pass."],
      ]} />

      <p className="font-semibold text-vx-text">Compliance item statuses:</p>
      <FlagTable rows={[
        ["Valid (green)",        "Expiry date > 60 days away",                                       "All items Valid before tenancy start"],
        ["Expiring Soon (amber)","Expiry date within 60 days",                                       "Book renewal immediately"],
        ["Overdue (red)",        "Expiry date has passed — legal risk",                              "Resolve immediately — this is a compliance failure"],
        ["Unknown",              "No expiry date entered",                                            "Enter an expiry date"],
      ]} />

      <p className="font-semibold text-vx-text">BRRR refinance readiness checks:</p>
      <FlagTable rows={[
        ["3+ months clean rent ledger", "Lenders want to see seasoning — consistent on-time payments",       "Pass"],
        ["No missed payments (last 6)", "Recent payment history",                                            "Pass"],
        ["All compliance items Valid",  "Lenders and surveyors check certificates exist",                    "Pass"],
        ["EPC C or better",             "The government's 2030 minimum; many lenders require this now",      "Pass"],
        ["Deposit protected",           "Mandatory within 30 days of receipt; required for any possession claim", "Pass"],
      ]} />
      <FlagTable rows={[
        ["READY",        "All five checks pass",                "Target state before instructing a mortgage broker"],
        ["ALMOST READY", "Only one check failing",              "Resolve the one failing check"],
        ["NOT READY",    "Two or more checks failing",          "Work through each failing check methodically"],
      ]} />
    </Section>
  );
}

function ScreenerSection() {
  return (
    <Section title="Area Screener" icon={Radar}>
      <p>
        The Area Screener ranks 300+ UK local authority council areas against your strategy.
        Data sources: HM Land Registry HPI, Land Registry Price Paid, ONS PIPR (private rents).
      </p>

      <p className="font-semibold text-vx-text">Controls:</p>
      <FieldList items={[
        ["Strategy: Flip / BRRR",  "Switches the scoring weight set. Flip weights momentum and flip evidence; BRRR weights yield and rent growth."],
        ["Property type: T / S / B","Terraced, Semi, or Both. Scores are computed on the relevant sub-dataset."],
        ["Max entry price (£)",    "Filters out areas where the median price for your property type exceeds your ceiling."],
        ["Nations",                "Toggle England, Wales, Scotland, Northern Ireland. NI has no PIPR rent data — BRRR scores unavailable for NI."],
        ["Weights panel",          "Adjust per-factor weights 0–10. Flip and BRRR have separate weight sets, both resettable to defaults."],
      ]} />

      <p className="font-semibold text-vx-text">Score column:</p>
      <p className="text-vx-muted">
        The score is a percentile rank (0–100) of each area relative to all visible areas,
        weighted by your current weight set. An area scored 90 means it ranks in the top 10% of
        visible areas for your factors. Scores are relative — they move when you change filters.
      </p>

      <p className="font-semibold text-vx-text">Column definitions:</p>
      <FlagTable rows={[
        ["Score",        "Weighted percentile rank (0–100); higher = better overall fit",                      "> 70 is strong"],
        ["Price",        "Median sold price for your property type in the last 12 months",                      "Within your max entry price"],
        ["Yield",        "Gross rental yield = annual rent ÷ price",                                            "> 6% for BRRR; yield less important for flips"],
        ["12m growth",   "House price change over the past 12 months",                                          "Positive (green)"],
        ["Sales 12m",    "Number of transactions in the area in the last 12 months — a proxy for liquidity",    "> 50 sales for meaningful liquidity"],
        ["Flip rate",    "Proportion of sales that are flips (bought and resold within 12 months)",              "> 5% flip rate indicates active investor market"],
        ["Partial flag", "Some factor data is missing — score is computed on available factors only",           "No partial flags"],
      ]} />

      <p className="font-semibold text-vx-text">Drill-down panel (click any council name):</p>
      <p className="text-vx-muted">
        Expands a sub-table of individual outcode districts (e.g. LS1, LS2…) with median price,
        sales count, flip count, median uplift %, and median gain £. Use this to find the specific
        pocket within a council that best matches your entry price.
      </p>

      <p className="font-semibold text-vx-text">Send to Sourcing:</p>
      <p className="text-vx-muted">
        Tick areas and click "Send to Sourcing" to add them as target areas in the Pipeline.
        This is a session-only transfer — it adds the selected councils to the Pipeline filter
        so you can concentrate sourcing activity on your highest-scored areas.
      </p>

      <Callout tone="warn">
        Screener scores are a starting point — they rank areas relative to each other, not against
        an absolute standard. Always ground-truth a high-scoring area with a physical visit, agent
        conversations, and comparable evidence before committing capital.
      </Callout>
    </Section>
  );
}

function NotificationsSection() {
  return (
    <Section title="Notifications" icon={Bell}>
      <p>
        Notifications appear in the Bell tab and are also emailed daily (digest) or instantly
        depending on the trigger type. The red badge on the Bell icon shows unread count.
      </p>
      <FlagTable rows={[
        ["Auction approaching 7d / 1d",  "Digest (7 days) and instant (1 day) before an auction date on any active lead",       "Review legal pack and max bid before auction day"],
        ["Closing today",                "Digest when an auction date equals today",                                               "Final review; confirm you're ready to bid"],
        ["Outcome due",                  "Digest after auction date passes without a status update",                               "Record outcome (won/lost/unsold) to clear the flag"],
        ["Triage gates incomplete",      "Instant alert when a new lead is created with unanswered gating questions",             "Answer all eight triage questions promptly"],
        ["Legal pack reviewed",          "Instant when an AI review completes on a legal pack document",                          "Check for any pre-bid red flags"],
        ["Stale deal — no update 14d",   "Digest when a deal hasn't been edited in 14 days",                                      "Update status or add a note to confirm it's still live"],
        ["Placeholder assumptions",      "Digest when buy box assumptions are still at default values",                           "Set real figures in Playbooks → Assumptions"],
      ]} />

      <Callout tone="info">
        Notifications require the Firebase "Trigger Email from Firestore" extension to be installed
        in the Firebase project for email delivery. In-app delivery works without it.
      </Callout>
    </Section>
  );
}

function FlagsReferenceSection() {
  return (
    <Section title="All flags &amp; indicators quick reference" icon={Star}>
      <p className="text-vx-muted text-xs mb-3">
        This section summarises every badge, colour, and check used across the app in one place.
      </p>

      <p className="font-semibold text-vx-text mb-1">Verdict badges (deals list &amp; deal header):</p>
      <FlagTable rows={[
        ["PROCEED (green)",     "≤ 0 checks fail across: profit, ROI, annual ROI, risk score, funding, occupier demand",    "All six checks pass"],
        ["CAUTION (amber)",     "1–2 checks fail",                                                                           "Identify and address the failing checks"],
        ["REJECT (red)",        "3+ checks fail",                                                                            "Major rework needed before bidding"],
        ["BUY (Decision Brief)","All PASS and BUY conditions met (stricter than PROCEED)",                                   "Decision Brief threshold"],
        ["WATCH",               "No PASS conditions, but not all BUY conditions met",                                        "Resolve named watch condition"],
        ["PASS",                "At least one hard fail (gating Q, legal flag, buy box, ICR, profit-on-cost)",               "Resolve before progressing"],
      ]} />

      <p className="font-semibold text-vx-text mb-1 mt-3">Funding &amp; financial indicators:</p>
      <FlagTable rows={[
        ["Funding gap £x (red)",     "deal requires more cash than own cash + bridge combined",                  "No gap — own cash covers after bridge"],
        ["Fits buy box (green)",     "Postcode area, property type, and tenure all match the default buy box",   "Green badge present"],
        ["Outside buy box (red)",    "At least one deterministic filter fails",                                   "Review lead against your strategy"],
        ["No money left in (green)", "BRRR refi fully recovers own cash (money left in = 0)",                   "Full capital recycling achieved"],
        ["Cash released ↩ (green)", "Refi loan exceeds all costs — net equity extracted",                        "Exceeds BRRR target"],
        ["ICR x.xx× (green/red)",   "Interest coverage ratio. Green ≥ threshold (typically 1.25×)",             "≥ 1.25× (lender minimum); ≥ 1.45× (reference)"],
      ]} />

      <p className="font-semibold text-vx-text mb-1 mt-3">Area intelligence indicators:</p>
      <FlagTable rows={[
        ["EPC A–C (green)",    "Good energy rating — no regulatory risk for lettings",                           "EPC C or better for rental properties"],
        ["EPC D–E (neutral)",  "Acceptable but D may need upgrade before 2030",                                  "Plan EPC improvement works"],
        ["EPC F–G (red)",      "Below minimum letting standard — risk of rental restriction",                    "Budget for energy improvement before bidding"],
        ["IMD 1–3/10 (red)",   "Most deprived 30% of LSOAs — potential demand risk",                            "Decile 8–10 for lower exit risk"],
        ["Flood areas: N (amber)", "N Environment Agency flood zones within 3km",                                "0 flood areas; ≥ 3 is high risk"],
      ]} />

      <p className="font-semibold text-vx-text mb-1 mt-3">Compliance (rental properties):</p>
      <FlagTable rows={[
        ["Valid (green)",        "Expiry date > 60 days away",                        "All items Valid"],
        ["Expiring Soon (amber)","Expires within 60 days",                            "Renew immediately"],
        ["Overdue (red)",        "Expiry date passed",                                "Legal failure — resolve same day"],
      ]} />

      <p className="font-semibold text-vx-text mb-1 mt-3">Screener flags:</p>
      <FlagTable rows={[
        ["partial (amber chip)", "Some factor data missing; score uses available factors only", "No partial flags in your target area"],
        ["No BRRR† (NI)",        "Northern Ireland has no PIPR rent data — BRRR scoring unavailable", "Use Flip strategy for NI"],
      ]} />
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function UserGuideView() {
  return (
    <div className="space-y-3 max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">User Guide</h1>
        <p className="text-sm text-vx-muted mt-1">
          Click any section to expand it. Every screen, tab, field, and indicator is explained below.
        </p>
      </div>

      <OverviewSection />
      <DashboardSection />
      <WorkspaceSection />
      <PipelineSection />
      <DealsSection />
      <DealDetailSection />
      <PlaybooksSection />
      <CapitalSection />
      <PlannerSection />
      <RiskSection />
      <ContactsSection />
      <PropertiesSection />
      <ScreenerSection />
      <NotificationsSection />
      <FlagsReferenceSection />

      <footer className="pt-4 border-t border-vx-divider text-xs text-vx-muted">
        DealsDash User Guide · VIXIV LTD · Figures and thresholds are illustrative defaults.
        Always verify financial calculations with your solicitor, broker, and accountant before
        exchanging contracts.
      </footer>
    </div>
  );
}
