import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Home, Building2, Wallet, TrendingUp, ShieldAlert, Plus, Trash2, Pencil, X,
  ChevronLeft, AlertTriangle, CheckCircle2, XCircle, SlidersHorizontal,
  RotateCcw, Info, MapPin, LogOut, Sparkles, Radar, ExternalLink, RefreshCw,
  ArrowRightCircle, ShieldCheck, Users, Phone, Mail, Star, KeyRound, FileWarning,
  Banknote, Calendar, ClipboardCheck, FileText, Upload, BookMarked, RefreshCcw, CreditCard,
  GripVertical, Layers, ChevronRight, FileDown, Bell, Map, BookOpen, Settings2,
} from "lucide-react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SOURCING_STAGES, TERMINAL_STAGES, STAGE_COLORS, LEAD_STATUS_TO_STAGE, GATED_STAGES } from "./lib/pipeline.js";
import {
  evaluateDecision, resolveRules, buildBriefSnapshot,
  buildRiskRegister, buildOpenQuestions, legalPackRedFlags,
} from "./lib/decision.js";
import {
  calcFundingModeBridge, calcFundingModeCash, calcFundingModeMortgage,
  calcIcr, calcFundUsage, calcSdltAudit,
} from "./lib/funding.js";
import { round2 } from "./lib/utils.js";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator } from "firebase/auth";
import { getFirestore, onSnapshot, connectFirestoreEmulator, enableIndexedDbPersistence } from "firebase/firestore";
import * as repo from "./data/repo.js";
import { runMigrationIfNeeded } from "./data/migrate.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, ref, uploadBytes, deleteObject, connectStorageEmulator } from "firebase/storage";
import SurveyModule from "./modules/survey/SurveyModule.jsx";
import { defaultRates } from "./modules/survey/data/rates.js";
import { mergeRefurbItems } from "./modules/survey/lib/applyToDeal.js";
import { Badge as VxBadge } from "./components/Badge.jsx";
import { emptyV2Block, DEFAULT_APPRAISAL_SETTINGS, migrateV2Deal } from "./lib/migrations/v2.js";
import WorkspaceView from "./components/WorkspaceView.jsx";
import ScreenerView from "./components/ScreenerView.jsx";
import UserGuideView from "./components/UserGuideView.jsx";
import AppraisalV2Tab from "./components/AppraisalV2Tab.jsx";
import AuctionAssessmentV2 from "./components/AuctionAssessmentV2.jsx";
import ProgrammeView from "./components/ProgrammeView.jsx";
import { recycling, capitalCost } from "./lib/appraisal/capital.js";
import { calcFunnelMonth, calcFunnelRolling, sortStandingOffers, calcPaceIndicator, isFollowUpDue } from "./lib/appraisal/funnel.js";

/* =================================================================================
   FIREBASE — Google Sign-In gated to one account, Firestore for cross-device sync
   ================================================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyA623ygCcbNmeBSDJz6rYpZNwFaJBHPg6w",
  authDomain: "dealsdash.firebaseapp.com",
  projectId: "dealsdash",
  storageBucket: "dealsdash.firebasestorage.app",
  messagingSenderId: "664281270106",
  appId: "1:664281270106:web:57a71460cf463112c11563",
  measurementId: "G-BB8ZCQL5VZ",
};

// ALLOWED_EMAIL — also defined in functions/index.js:11 and firestore.rules:7 — update all three together.
const ALLOWED_EMAIL = "paul.a.adeogun@gmail.com";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functionsInstance = getFunctions(firebaseApp);
const storage = getStorage(firebaseApp);

// Test-only hook: stripped from production bundle by esbuild dead-code elimination
// (build:js passes --define:process.env.NODE_ENV='"production"').
if (process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("useEmulator") === "1") {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functionsInstance, "localhost", 5001);
  connectStorageEmulator(storage, "localhost", 9199);
  window.__testAuth = auth;
  window.__testDb = db;
  window.__testFunctions = functionsInstance;
  window.__testStorage = storage;
} else if (typeof window !== "undefined") {
  // Viewings happen in empty houses with no signal: queue writes locally and sync when back online.
  // Rejects harmlessly in a second open tab or an unsupported browser.
  enableIndexedDbPersistence(db).catch(() => {});
}


/* =================================================================================
   CALCULATION ENGINE — unit-tested separately against the Excel calculator's
   worked example (14/14 tests passing) before being pasted in here unchanged.
   ================================================================================= */

// Returns a disclaimer string when the deal is outside England/NI, or null when SDLT applies.
function sdltJurisdictionNote(country) {
  if (!country || country === "England" || country === "Northern Ireland") return null;
  if (country === "Scotland") return "Scotland uses Land and Buildings Transaction Tax (LBTT) — use the Revenue Scotland calculator for the correct figure.";
  if (country === "Wales") return "Wales uses Land Transaction Tax (LTT) — use the Welsh Revenue Authority calculator for the correct figure.";
  return `Stamp duty rules vary for ${country} — confirm with your solicitor.`;
}

function calcRefurbTotal(items, contingencyPct) {
  const subtotal = (items || []).reduce((sum, it) => sum + ((Number(it.low) || 0) + (Number(it.high) || 0)) / 2, 0);
  const contingency = subtotal * (Number(contingencyPct) || 0);
  return { subtotal: round2(subtotal), contingency: round2(contingency), total: round2(subtotal + contingency) };
}

function calcBridge({ amount, monthlyRate, termMonths, arrangementPct, exitPct }) {
  amount = Number(amount) || 0;
  monthlyRate = Number(monthlyRate) || 0;
  termMonths = Math.max(0, Number(termMonths) || 0);
  const interest = amount * (Math.pow(1 + monthlyRate, termMonths) - 1);
  const arrangementFee = amount * (Number(arrangementPct) || 0);
  const exitFee = amount * (Number(exitPct) || 0);
  return { interest: round2(interest), arrangementFee: round2(arrangementFee), exitFee: round2(exitFee), total: round2(interest + arrangementFee + exitFee) };
}

function sumFees(fees) { return fees ? Object.values(fees).reduce((s, v) => s + (Number(v) || 0), 0) : 0; }

function calcFunding(deal) {
  const price = Number(deal.price) || 0;
  const sdlt = calcSdltAudit(price, deal.additionalProperty !== false).value;
  const feesTotal = sumFees(deal.fees);
  const buyersPremium = round2(price * (Number(deal.buyersPremiumPct) || 0));
  const refurb = calcRefurbTotal(deal.refurbItems, deal.contingencyPct);
  const fundsRequired = price + sdlt + feesTotal + buyersPremium + refurb.total;
  const ownCash = Number(deal.ownCash) || 0;
  const maxBridge = price * (Number(deal.bridgeLTV) || 0);
  const bridgeNeeded = Math.max(0, fundsRequired - ownCash);
  const bridgeDrawn = Math.min(bridgeNeeded, maxBridge);
  const shortfall = round2(fundsRequired - ownCash - bridgeDrawn);
  return { sdlt, feesTotal, buyersPremium, refurb, fundsRequired: round2(fundsRequired), maxBridge: round2(maxBridge), bridgeDrawn: round2(bridgeDrawn), shortfall };
}

function calcTimeline(phases) {
  const weeks = (phases || []).reduce((s, p) => s + (Number(p.weeks) || 0), 0);
  return { weeks, months: weeks > 0 ? Math.ceil(weeks / 4.33) : 0 };
}

function calcHolding(deal, months, bridgeTotal) {
  const monthly = Number(deal.holdingMonthly) || 0;
  const exBridge = round2(monthly * months);
  return { exBridge, total: round2(exBridge + bridgeTotal) };
}

function calcGDV(deal) {
  if (deal.gdvOverride && Number(deal.gdvOverride) > 0) return round2(Number(deal.gdvOverride));
  return round2((Number(deal.floorArea) || 0) * (Number(deal.avgPsf) || 0) * (1 + (Number(deal.conditionAdj) || 0)));
}

function calcSelling(gdv, eaPct, solicitor, epc) {
  return round2(gdv * (Number(eaPct) || 0) + (Number(solicitor) || 0) + (Number(epc) || 0));
}

// Full deal appraisal: builds every financial metric shown across the deal tabs.
// Called on every render — no caching — so always reflects the latest inputs.
// totalCost = price + SDLT + fees + refurb + holding (ex-bridge) + bridge + selling costs.
// netProfit = GDV − totalCost.
// roi = netProfit / ownCash (return on own cash deployed).
// annualisedRoi = roi × (12 / timeline.months) — normalises for deal duration.
// noi = net operating income for BRRR (rent after voids, management, maintenance, insurance).
// cashLeftIn = money not recovered after BTL refinance (BRRR quality metric; 0 is ideal).
function appraiseDeal(deal) {
  const funding = calcFunding(deal);
  const timeline = calcTimeline(deal.phases);
  const bridge = calcBridge({ amount: funding.bridgeDrawn, monthlyRate: deal.bridgeMonthlyRate, termMonths: timeline.months, arrangementPct: deal.arrangementPct, exitPct: deal.exitPct });
  const holding = calcHolding(deal, timeline.months, bridge.total);
  const gdv = calcGDV(deal);
  const sellingCosts = calcSelling(gdv, deal.eaPct, deal.solicitorSale, deal.epc);
  const totalCost = round2((Number(deal.price) || 0) + funding.sdlt + funding.feesTotal + funding.refurb.total + holding.exBridge + bridge.total + sellingCosts);
  const netProfit = round2(gdv - totalCost);
  const ownCash = Number(deal.ownCash) || 0;
  const roi = ownCash > 0 ? netProfit / ownCash : 0;
  const annualisedRoi = timeline.months > 0 ? roi * (12 / timeline.months) : 0;

  const rent = Number(deal.monthlyRent) || 0;
  const annualRent = rent * 12;
  const grossYield = gdv > 0 ? annualRent / gdv : 0;
  const voidPct = Number(deal.voidPct) || 0;
  const receivedRent = annualRent * (1 - voidPct);
  const mgmtFee = receivedRent * (Number(deal.mgmtPct) || 0);
  const maintCost = annualRent * (Number(deal.maintPct) || 0);
  const noi = receivedRent - mgmtFee - maintCost - (Number(deal.llInsurance) || 0);
  const btlBalance = gdv * (Number(deal.btlLtv) || 0);
  const btlInterest = btlBalance * (Number(deal.btlRate) || 0);
  const netCashFlowAnnual = round2(noi - btlInterest);
  const netCashFlowMonthly = round2(netCashFlowAnnual / 12);
  const cashLeftIn = Math.max(0, round2(totalCost - btlBalance));
  const cashOnCash = cashLeftIn > 0 ? netCashFlowAnnual / cashLeftIn : 0;

  return { gdv, funding, timeline, bridge, holding, sellingCosts, totalCost, netProfit, roi, annualisedRoi, grossYield, noi: round2(noi), netCashFlowAnnual, netCashFlowMonthly, cashLeftIn, cashOnCash };
}

/* =================================================================================
   MAXIMUM BID SOLVER — inverts the appraisal engine: what's the highest purchase
   price at which profit still hits target, given SDLT and bridge interest both
   move with price so this can't be solved by simple subtraction.

   "GDV low" isn't a field that existed anywhere in the schema before this — the
   brief assumed one. Rather than add a second, disconnected GDV estimate, this
   derives it from the comp percentile distribution already built for Section
   3.11 (25th-percentile £/sq ft × floor area) — a real, evidence-based conservative
   figure, not an arbitrary haircut off the main GDV. Falls back to the standard
   GDV if there aren't enough comps to build a distribution, or if a manual GDV
   override is set (an override is already a deliberate single figure — there's
   no separate "low" version of a number the user typed in directly).
   ================================================================================= */
// Conservative GDV used exclusively by the max bid solver.
// Uses 25th-percentile £/sq ft from the comp distribution (the low end of the market range)
// rather than the average, giving a more conservative ceiling for the maximum bid.
// If a manual GDV override is set, that figure is already deliberate — no separate "low" applies.
function calcGDVLow(deal) {
  if (deal.gdvOverride && Number(deal.gdvOverride) > 0) return round2(Number(deal.gdvOverride));
  const dist = compPsfDistribution(deal.comps);
  if (dist && Number(deal.floorArea) > 0) {
    return round2(Number(deal.floorArea) * dist.p25 * (1 + (Number(deal.conditionAdj) || 0)));
  }
  return calcGDV(deal);
}

// Bisection on purchase price. Profit decreases monotonically as price rises
// (GDV held fixed at gdvLow, cost side keeps climbing), so bisection converges
// cleanly — verified directly with a unit test using known inputs, not just
// assumed to behave.
function solveMaxBid(deal, targetProfit, opts = {}) {
  const tol = opts.tol || 100;
  const maxIter = opts.maxIter || 40;
  const gdvLow = calcGDVLow(deal);
  const hi0 = opts.hi != null ? opts.hi : gdvLow;
  const bufferPct = Number(deal.bidBufferPct) ?? 0.02;

  function profitAt(price) {
    const testDeal = enrichDeal({ ...deal, price, gdvOverride: gdvLow });
    return appraiseDeal(testDeal).netProfit;
  }

  let lo = 0, hi = hi0, iterations = 0;
  const profitAtLo = profitAt(lo);
  const profitAtHi = profitAt(hi);

  if (profitAtHi >= targetProfit) {
    const ceiling = round2(hi);
    const safeBid = round2(ceiling * (1 - bufferPct));
    return { maxBid: ceiling, safeBid, bufferPct, profitAtMaxBid: profitAtHi, gdvLow, iterations: 0, note: "Even at the full conservative GDV as purchase price, target profit is still met." };
  }
  if (profitAtLo < targetProfit) {
    return { maxBid: 0, safeBid: 0, bufferPct, profitAtMaxBid: profitAtLo, gdvLow, iterations: 0, note: "Target profit isn't achievable at any purchase price — costs alone exceed it." };
  }

  while (hi - lo > tol && iterations < maxIter) {
    const mid = (lo + hi) / 2;
    if (profitAt(mid) >= targetProfit) lo = mid; else hi = mid;
    iterations++;
  }
  const ceiling = round2(lo);
  const safeBid = round2(ceiling * (1 - bufferPct));
  return { maxBid: ceiling, safeBid, bufferPct, profitAtMaxBid: profitAt(lo), gdvLow, iterations, note: null };
}

function calcRiskScore(factors) {
  const totalWeight = (factors || []).reduce((s, f) => s + (Number(f.weight) || 0), 0);
  const weighted = (factors || []).reduce((s, f) => s + (Number(f.weight) || 0) * (Number(f.score) || 0), 0);
  const score = totalWeight > 0 ? weighted / totalWeight : 0;
  let rating = "HIGH RISK";
  if (score >= 4) rating = "LOW RISK"; else if (score >= 3) rating = "MEDIUM RISK";
  return { score: round2(score), rating };
}

// Quick deal-list verdict (PROCEED / CAUTION / REJECT) based on six checks against thresholds.
// Different from the Decision Brief's BUY/WATCH/PASS — this simpler version is used on
// the deals list and Dashboard summary cards.
// 0 fails → PROCEED; 1–2 fails → CAUTION; 3+ fails → REJECT.
function verdictForDeal(deal, appraisal, thresholds) {
  const risk = calcRiskScore(deal.riskFactors);
  const checks = [
    { label: "Net profit", value: appraisal.netProfit, target: thresholds.minNetProfit, fmt: "gbp", pass: appraisal.netProfit >= thresholds.minNetProfit },
    { label: "ROI on cash", value: appraisal.roi, target: thresholds.minRoi, fmt: "pct", pass: appraisal.roi >= thresholds.minRoi },
    { label: "Annualised ROI", value: appraisal.annualisedRoi, target: thresholds.minAnnualRoi, fmt: "pct", pass: appraisal.annualisedRoi >= thresholds.minAnnualRoi },
    { label: "Area risk score", value: risk.score, target: thresholds.minRiskScore, fmt: "num", pass: risk.score >= thresholds.minRiskScore },
    { label: "Funding shortfall", value: appraisal.funding.shortfall, target: 0, fmt: "gbp", pass: appraisal.funding.shortfall <= 0 },
    { label: "Owner-occupier demand", value: deal.occupierDemand, target: "Y", fmt: "text", pass: (deal.occupierDemand || "Y").toUpperCase() === "Y" },
  ];
  const fails = checks.filter((c) => !c.pass).length;
  let verdict = "PROCEED";
  if (fails >= 3) verdict = "REJECT"; else if (fails >= 1) verdict = "CAUTION";
  return { checks, fails, verdict, risk };
}

const ACTIVE_STATUSES = ["Under Offer", "Refurbishment", "Marketing"];

// Aggregates all deals and the capital ledger into the portfolio-level health metrics
// displayed on the Dashboard and Risk Exposure tabs.
// Active statuses: Under Offer, Refurbishment, Marketing.
// Sold deals contribute realised profit to the capital base but not committed cash.
function portfolioSummary(deals, ledger, settings) {
  const appraised = deals.map((d) => ({ deal: d, a: appraiseDeal(enrichDeal(d)) }));
  const active = appraised.filter(({ deal }) => ACTIVE_STATUSES.includes(deal.status));
  const sold = appraised.filter(({ deal }) => deal.status === "Sold");

  const capitalContributed = (ledger || []).reduce((s, e) => s + (e.direction === "in" ? Number(e.amount) || 0 : -(Number(e.amount) || 0)), 0);
  const realizedProfit = sold.reduce((s, { a }) => s + a.netProfit, 0);
  const committedCash = active.reduce((s, { deal }) => s + (Number(deal.ownCash) || 0), 0);
  const totalCapitalBase = round2(capitalContributed + realizedProfit);
  const freeCash = round2(totalCapitalBase - committedCash);
  const bridgeDebtOutstanding = active.reduce((s, { a }) => s + a.funding.bridgeDrawn, 0);

  const monthlyBurn = Number(settings.monthlyBurn) || 0;
  const runwayMonths = monthlyBurn > 0 ? round2(freeCash / monthlyBurn) : Infinity;

  const weightedRoiNumerator = active.reduce((s, { a, deal }) => s + a.annualisedRoi * (Number(deal.ownCash) || 0), 0);
  const portfolioAnnualisedRoi = committedCash > 0 ? weightedRoiNumerator / committedCash : 0;

  const byTown = {};
  active.forEach(({ deal }) => { const t = deal.town || "Unspecified"; byTown[t] = (byTown[t] || 0) + (Number(deal.ownCash) || 0); });
  let maxTownShare = 0, maxTownName = null;
  Object.entries(byTown).forEach(([town, amt]) => { const share = committedCash > 0 ? amt / committedCash : 0; if (share > maxTownShare) { maxTownShare = share; maxTownName = town; } });

  const leverageRatio = totalCapitalBase > 0 ? bridgeDebtOutstanding / totalCapitalBase : 0;
  const exposureRatio = totalCapitalBase > 0 ? committedCash / totalCapitalBase : 0;

  const alerts = [];
  active.forEach(({ deal, a }) => {
    if (a.funding.shortfall > 0) alerts.push({ type: "shortfall", deal: deal.name, detail: `${fmtGBP(a.funding.shortfall)} unfunded on "${deal.name}"` });
    const risk = calcRiskScore(deal.riskFactors);
    if (risk.rating === "HIGH RISK") alerts.push({ type: "risk", deal: deal.name, detail: `"${deal.name}" is High Risk (score ${risk.score.toFixed(2)})` });
  });
  if (runwayMonths !== Infinity && runwayMonths < 0) alerts.push({ type: "runway", deal: null, detail: `Free cash is negative (${fmtGBP(freeCash)}) — more capital is committed to deals than you've logged as contributed` });
  else if (runwayMonths !== Infinity && runwayMonths < 3) alerts.push({ type: "runway", deal: null, detail: `Only ${runwayMonths.toFixed(1)} months of cash runway at current burn rate` });
  if (maxTownShare > 0.6 && maxTownName) alerts.push({ type: "concentration", deal: null, detail: `${Math.round(maxTownShare * 100)}% of committed capital is in ${maxTownName}` });
  if (leverageRatio > 0.7) alerts.push({ type: "leverage", deal: null, detail: `Bridge debt is ${Math.round(leverageRatio * 100)}% of total capital base` });

  return { active, sold, capitalContributed: round2(capitalContributed), realizedProfit: round2(realizedProfit), totalCapitalBase, committedCash: round2(committedCash), freeCash, bridgeDebtOutstanding: round2(bridgeDebtOutstanding), runwayMonths, portfolioAnnualisedRoi: round2(portfolioAnnualisedRoi), maxTownShare: round2(maxTownShare), maxTownName, leverageRatio: round2(leverageRatio), exposureRatio: round2(exposureRatio), alerts, appraised };
}

function runBusinessSimulation({ startingCapital, avgCashPerDeal, avgDurationMonths, avgNetProfitPerDeal, maxConcurrentDeals, targetMonthlyIncome, months }) {
  months = months || 60;
  let cash = Number(startingCapital) || 0;
  let active = [];
  const completedByMonth = new Array(months + 1).fill(0);
  const timeline = [];
  let achievedMonth = null;
  let cumulativeProfit = 0;

  for (let m = 1; m <= months; m++) {
    while (cash >= avgCashPerDeal && active.length < maxConcurrentDeals && avgCashPerDeal > 0) {
      cash -= avgCashPerDeal;
      active.push({ monthsRemaining: avgDurationMonths, cashUsed: avgCashPerDeal });
    }
    const stillActive = [];
    for (const proj of active) {
      const remaining = proj.monthsRemaining - 1;
      if (remaining <= 0) { cash += proj.cashUsed + avgNetProfitPerDeal; completedByMonth[m] += avgNetProfitPerDeal; cumulativeProfit += avgNetProfitPerDeal; }
      else stillActive.push({ ...proj, monthsRemaining: remaining });
    }
    active = stillActive;

    const windowStart = Math.max(1, m - 11);
    let trailing = 0;
    for (let k = windowStart; k <= m; k++) trailing += completedByMonth[k];
    const denom = Math.min(m, 12);
    const monthlyIncomeRunRate = trailing / denom;

    if (achievedMonth === null && monthlyIncomeRunRate >= targetMonthlyIncome) achievedMonth = m;
    timeline.push({ month: m, cash: round2(cash), activeDeals: active.length, monthlyIncomeRunRate: round2(monthlyIncomeRunRate), cumulativeProfit: round2(cumulativeProfit) });
  }
  return { timeline, achievedMonth };
}

/* =================================================================================
   APP-LAYER HELPERS (deal schema, enrichment, formatting)
   ================================================================================= */

function uid() { return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2); }

function avgPsfFromComps(comps) {
  const valid = (comps || []).filter((c) => Number(c.price) > 0 && Number(c.floorArea) > 0);
  if (!valid.length) return 0;
  return valid.reduce((s, c) => s + Number(c.price) / Number(c.floorArea), 0) / valid.length;
}

// Percentile spread of comp £/sq ft — a single average hides how skewed the
// comp set is; this shows where the subject property's implied price sits
// within the actual observed range, not just against one blended number.
function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function compPsfDistribution(comps) {
  const valid = (comps || []).filter((c) => Number(c.price) > 0 && Number(c.floorArea) > 0);
  const psfValues = valid.map((c) => Number(c.price) / Number(c.floorArea)).sort((a, b) => a - b);
  if (!psfValues.length) return null;
  return {
    min: psfValues[0],
    p25: percentile(psfValues, 0.25),
    median: percentile(psfValues, 0.5),
    p75: percentile(psfValues, 0.75),
    max: psfValues[psfValues.length - 1],
    count: psfValues.length,
  };
}

// Where does a given £/sq ft figure fall within the comp spread, expressed as
// a position between the 25th and 75th percentile (0 = at p25, 1 = at p75,
// negative/>1 = outside that middle band). Purely descriptive, not a verdict.
function psfPercentileLabel(psf, dist) {
  if (!dist || !psf) return null;
  if (psf <= dist.min) return "at or below the lowest comp";
  if (psf >= dist.max) return "at or above the highest comp";
  if (psf < dist.p25) return "in the bottom quartile";
  if (psf < dist.median) return "between the 25th percentile and the median";
  if (psf < dist.p75) return "between the median and the 75th percentile";
  return "in the top quartile";
}

function enrichDeal(deal) {
  const avgPsf = avgPsfFromComps(deal.comps);
  const holdingMonthly = Object.values(deal.holdingBreakdown || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  return { ...deal, avgPsf, holdingMonthly };
}

function fmtGBP(n) { if (n == null || isNaN(n)) return "£0"; const sign = n < 0 ? "-" : ""; return sign + "£" + Math.round(Math.abs(n)).toLocaleString("en-GB"); }
function fmtPct(n, dp = 1) { if (n == null || isNaN(n)) return "0%"; return (n * 100).toFixed(dp) + "%"; }
function fmtNum(n, dp = 2) { if (n == null || isNaN(n)) return "0"; return Number(n).toFixed(dp); }

const STATUS_OPTIONS = ["Prospecting", "Under Offer", "Refurbishment", "Marketing", "Sold", "Let / Held (BRRR)", "Rejected"];
const REFURB_TRADES = ["Structural / roofing", "Rewire / electrics", "Plumbing & heating", "Damp / roofline", "Kitchen", "Bathroom", "Windows & doors", "Plastering & flooring", "Decorating", "Externals, skips & scaffolding", "Fees (building control, party wall, survey)"];
const DEFAULT_PHASES = [{ name: "Offer to exchange", weeks: 3 }, { name: "Exchange to completion", weeks: 1 }, { name: "Refurbishment", weeks: 10 }, { name: "Marketing period", weeks: 8 }, { name: "Sale agreed to completion", weeks: 6 }];
const DEFAULT_RISK_FACTORS = [
  { label: "Crime rate vs borough/national average", weight: 0.20, score: 3 },
  { label: "% social/council housing on street", weight: 0.15, score: 3 },
  { label: "Average household income vs local average", weight: 0.15, score: 3 },
  { label: "Population/demographic growth trend", weight: 0.10, score: 3 },
  { label: "Owner-occupier demand strength", weight: 0.20, score: 3 },
  { label: "Liquidity — days on market", weight: 0.10, score: 3 },
  { label: "Flood risk", weight: 0.05, score: 3 },
  { label: "School catchment quality", weight: 0.05, score: 3 },
];
const DEFAULT_THRESHOLDS = { minNetProfit: 25000, minRoi: 0.20, minAnnualRoi: 0.25, minRiskScore: 3.0 };
const DEFAULT_STRATEGY_PROFILE = {
  postcodeAreas: [],
  postcodeDistricts: [],
  assetTypes: ["Terrace", "Semi"],
  tenure: ["freehold"],
  conditionPref: "needs_work",
  maxGuide: 150000,
  minProfitAbs: 25000,
  minProfitPctOfGDV: 0.15,
  contingencyPct: 0.15,
  targetYieldPct: 0.07,
  updatedAt: null, updatedBy: null,
};
const NOTIFICATION_DEFAULTS = {
  enabled: true,
  emailAddress: ALLOWED_EMAIL,
  maxCards: 5,
  summaryOnly: false,
  triggers: {
    auctionApproaching: true,
    gatesIncomplete: true,
    closingToday: true,
    outcomeDue: true,
    listingChanged: false,
    legalPackReady: true,
    staleDeal: true,
    placeholderAssumptions: true,
    lenderReportDue: false,
  },
};
const DEFAULT_SETTINGS = { monthlyBurn: 1800, targetMonthlyIncome: 30000, planning: { avgCashPerDeal: 30000, avgDurationMonths: 7, avgNetProfitPerDeal: 20000, maxConcurrentDeals: 3 }, surveyRates: null, lenderFundSize: 50000, lenderFundRatePct: 0.08, notifications: NOTIFICATION_DEFAULTS, appraisal: { viewingTargetPerMonth: 20 } };

function newDeal() {
  return {
    id: uid(), name: "New deal", address: "", town: "", postcode: "", propertyType: "Terrace", bedrooms: 3,
    floorArea: 0, condition: 3, status: "Prospecting", occupierDemand: "Y", daysOnMarket: 0,
    comps: [{ address: "", price: 0, date: "", floorArea: 0 }, { address: "", price: 0, date: "", floorArea: 0 }, { address: "", price: 0, date: "", floorArea: 0 }],
    conditionAdj: 0, gdvOverride: 0, price: 0, additionalProperty: true,
    fees: { solicitor: 1400, searches: 350, survey: 600, broker: 1200, valuation: 450, landReg: 270, other: 200 },
    ownCash: 0, bridgeLTV: 0.75, bridgeMonthlyRate: 0.0085, arrangementPct: 0.02, exitPct: 0.01,
    refurbItems: REFURB_TRADES.map((t) => ({ name: t, low: 0, high: 0 })), contingencyPct: 0.15,
    phases: DEFAULT_PHASES.map((p) => ({ ...p })), holdingBreakdown: { ctax: 0, insurance: 0, utilities: 0, other: 0 },
    eaPct: 0.012, solicitorSale: 900, epc: 120, monthlyRent: 0, voidPct: 0.05, mgmtPct: 0.10, maintPct: 0.08,
    llInsurance: 250, btlLtv: 0.75, btlRate: 0.065, riskFactors: DEFAULT_RISK_FACTORS.map((r) => ({ ...r })),
    notes: "", createdAt: Date.now(), legalPackDocuments: [],
    completionDays: 28, // feeds the bridge term where a lead's legal pack specifies a shorter/longer completion window
    fundingMode: "bridge", interestMode: "retained", bridgeLoanBasis: "purchase",
    btlProductFeePct: 0.01, fundAllocation: null,
    pipelineStage: "Purchased",
    buyersPremiumPct: 0,    // auction buyer's premium as % of hammer price (e.g. 0.03 = 3%)
    bidBufferPct: 0.02,     // safety margin below the ceiling bid (e.g. 0.02 = 2%)
    maxBid: null, maxBidSafe: null, maxBidLocked: false, maxBidLog: [], maxBidSolveNote: null, maxBidGdvLow: null,
    areaIntelligence: null,
    epcCheck: null,
    listingType: "other", // "auction" | "agent" | "d2v" | "trader" | "other" — carried from the lead; the viewing survey reads it
    survey: null,         // viewing survey state (src/modules/survey) — lives on the deal, single-document model
    surveyApplied: null,  // { at, total, lines, unconfirmed, needsEpc } — stamped by "Apply to deal"
    v2: emptyV2Block(),   // appraisal v2 fields — all costs null until user enters them (RULE 7)
  };
}

// Pre-fills a new deal from the default buy box assumptions and records the
// snapshot so per-deal overrides can be detected later.
function newDealFromBuyBox(buyBox) {
  const base = newDeal();
  if (!buyBox) return base;
  const a = buyBox.assumptions || {};
  const v = key => a[key]?.value;

  const worksWeeks     = v("worksMonths")    != null ? Math.round(v("worksMonths")    * 4.33) : null;
  const marketingWeeks = v("marketingMonths") != null ? Math.round(v("marketingMonths") * 4.33) : null;

  const snapshotValues = {};
  Object.keys(a).forEach(k => { if (a[k]?.value !== undefined) snapshotValues[k] = a[k].value; });

  return {
    ...base,
    fees: {
      ...base.fees,
      solicitor: v("legalFeesBuy")   ?? base.fees.solicitor,
      searches:  v("searchesFee")    ?? base.fees.searches,
      survey:    v("surveyFee")      ?? base.fees.survey,
      broker:    v("brokerFee")      ?? base.fees.broker,
      valuation: v("valuationFee")   ?? base.fees.valuation,
      landReg:   v("landRegFee")     ?? base.fees.landReg,
    },
    bridgeLTV:        v("bridgeLtvPct")         ?? base.bridgeLTV,
    bridgeMonthlyRate:v("bridgeMonthlyRatePct") ?? base.bridgeMonthlyRate,
    arrangementPct:   v("bridgeArrangementPct") ?? base.arrangementPct,
    exitPct:          v("bridgeExitPct")        ?? base.exitPct,
    contingencyPct:   v("refurbContingencyPct") ?? base.contingencyPct,
    phases: base.phases.map(p => {
      if (p.name === "Refurbishment"   && worksWeeks     != null) return { ...p, weeks: worksWeeks };
      if (p.name === "Marketing period"&& marketingWeeks != null) return { ...p, weeks: marketingWeeks };
      return { ...p };
    }),
    eaPct:        v("eaPct")           ?? base.eaPct,
    solicitorSale:v("legalFeesSell")   ?? base.solicitorSale,
    epc:          v("epcCost")         ?? base.epc,
    voidPct:      v("voidPct")         ?? base.voidPct,
    mgmtPct:      v("managementPct")   ?? base.mgmtPct,
    maintPct:     v("maintenancePct")  ?? base.maintPct,
    llInsurance:  v("llInsuranceAnnual") ?? base.llInsurance,
    btlLtv:          v("refiLtvPct")          ?? base.btlLtv,
    btlRate:         v("mortgageRatePct")     ?? base.btlRate,
    btlProductFeePct:v("mortgageProductFeePct") ?? base.btlProductFeePct,
    buyBoxId:     buyBox.id,
    assumptionSnapshot: { snapshotAt: Date.now(), values: snapshotValues },
  };
}

function exampleDeal() {
  const d = newDeal();
  return {
    ...d, name: "14 Sample Terrace (example)", address: "14 Sample Terrace", town: "Your Town", postcode: "AB1 2CD",
    propertyType: "Terrace", bedrooms: 3, floorArea: 850, condition: 2, status: "Refurbishment", occupierDemand: "Y", daysOnMarket: 35,
    comps: [
      { address: "12 Example Street", price: 145000, date: "2026-05-01", floorArea: 840 },
      { address: "34 Sample Road", price: 148000, date: "2026-06-15", floorArea: 860 },
      { address: "8 Test Avenue", price: 140000, date: "2026-04-10", floorArea: 830 },
    ],
    price: 90000, ownCash: 55000,
    refurbItems: [
      { name: "Structural / roofing", low: 1500, high: 2500 }, { name: "Rewire / electrics", low: 2500, high: 3500 },
      { name: "Plumbing & heating", low: 2200, high: 3200 }, { name: "Damp / roofline", low: 600, high: 1200 },
      { name: "Kitchen", low: 3500, high: 5000 }, { name: "Bathroom", low: 2500, high: 3500 },
      { name: "Windows & doors", low: 2000, high: 3000 }, { name: "Plastering & flooring", low: 2600, high: 3500 },
      { name: "Decorating", low: 1200, high: 1800 }, { name: "Externals, skips & scaffolding", low: 800, high: 1400 },
      { name: "Fees (building control, party wall, survey)", low: 300, high: 400 },
    ],
    holdingBreakdown: { ctax: 150, insurance: 40, utilities: 60, other: 43 },
    monthlyRent: 750,
    riskFactors: [
      { label: "Crime rate vs borough/national average", weight: 0.20, score: 4 },
      { label: "% social/council housing on street", weight: 0.15, score: 3 },
      { label: "Average household income vs local average", weight: 0.15, score: 4 },
      { label: "Population/demographic growth trend", weight: 0.10, score: 3 },
      { label: "Owner-occupier demand strength", weight: 0.20, score: 4 },
      { label: "Liquidity — days on market", weight: 0.10, score: 4 },
      { label: "Flood risk", weight: 0.05, score: 4 },
      { label: "School catchment quality", weight: 0.05, score: 3 },
    ],
  };
}

/* =================================================================================
   SMALL UI PRIMITIVES
   ================================================================================= */

function Card({ children, className = "" }) {
  return <div className={`bg-vx-bg border border-vx-divider rounded p-4 ${className}`}>{children}</div>;
}

function KPI({ label, value, sub, tone = "default" }) {
  const toneClass = { default: "text-vx-text", good: "text-vx-positive", bad: "text-vx-negative", warn: "text-vx-caution" }[tone];
  return (
    <div className="bg-vx-bg border border-vx-divider rounded p-4">
      <div className="text-xs uppercase tracking-wide text-vx-muted font-medium">{label}</div>
      <div className={`font-mono text-2xl font-semibold mt-1 tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-vx-muted mt-1">{sub}</div>}
    </div>
  );
}

function Badge({ children, tone = "default" }) {
  const map = { default: "bg-vx-surface-2 text-vx-text", good: "bg-vx-surface text-vx-positive", bad: "bg-vx-surface text-vx-negative", warn: "bg-vx-surface text-vx-caution", info: "bg-vx-surface text-vx-accent-strong" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${map[tone]}`}>{children}</span>;
}

function verdictTone(v) { return v === "PROCEED" ? "good" : v === "CAUTION" ? "warn" : "bad"; }

function NumField({ label, value, onChange, prefix = "£", step = 1, min = 0, testId, disabled = false }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <div className={`flex items-center border border-vx-border rounded overflow-hidden bg-vx-bg focus-within:ring-2 focus-within:ring-vx-accent ${disabled ? "opacity-50" : ""}`}>
        {prefix && <span className="px-2 text-vx-muted text-sm font-mono">{prefix}</span>}
        <input
          data-testid={testId}
          type="number" step={step} min={min} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={`w-full py-1.5 pr-2 text-sm font-mono outline-none tabular-nums${!prefix ? " pl-2" : ""}`}
        />
      </div>
    </label>
  );
}

function PctField({ label, value, onChange, step = 0.5, testId }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <div className="flex items-center border border-vx-border rounded overflow-hidden bg-vx-bg focus-within:ring-2 focus-within:ring-vx-accent">
        <input
          data-testid={testId}
          type="number" step={step} value={round2((Number(value) || 0) * 100)}
          onChange={(e) => onChange((e.target.value === "" ? 0 : Number(e.target.value)) / 100)}
          className="w-full py-1.5 pl-2 text-sm font-mono outline-none tabular-nums"
        />
        <span className="px-2 text-vx-muted text-sm">%</span>
      </div>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, testId }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <input
        data-testid={testId}
        type="text" value={value || ""} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-1.5 px-2 text-sm border border-vx-border rounded outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <select
        data-testid={testId}
        value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full py-1.5 px-2 text-sm border border-vx-border rounded outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

// A row of toggleable chips for multi-select fields (property type, acquisition
// type, towns). `selected` is an array of currently-chosen values.
function ChipMultiSelect({ label, options, selected, onToggle, testIdPrefix, labels }) {
  return (
    <div>
      {label && <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isOn = selected.includes(opt);
          return (
            <button
              type="button"
              key={opt}
              data-testid={testIdPrefix ? `${testIdPrefix}-${opt}` : undefined}
              onClick={() => onToggle(opt)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${isOn ? "bg-navy text-white border-vx-accent" : "bg-vx-bg text-vx-muted border-vx-border hover:bg-vx-surface"}`}
            >
              {(labels && labels[opt]) || opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Free-text tag entry — type a value, press Enter or click Add, get a removable
// chip. Used for postcode areas/districts, which aren't a fixed option set.
function StrategyTagField({ label, values, onAdd, onRemove, testId }) {
  const [draft, setDraft] = useState("");
  function commit() { if (draft.trim()) { onAdd(draft); setDraft(""); } }
  return (
    <div>
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <div className="flex gap-2 mb-1.5">
        <input
          data-testid={testId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="Type and press Enter"
          className="flex-1 text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent"
        />
        <button type="button" onClick={commit} className="text-xs font-medium text-vx-accent border border-vx-accent rounded px-3 hover:bg-vx-surface">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(values || []).map((v) => (
          <span key={v} data-testid={testId ? `${testId}-chip-${v}` : undefined} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-vx-surface text-vx-accent-strong">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="hover:text-vx-negative"><X size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function SimSlider({ label, value, min, max, step, onChange, format, testId }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-vx-muted">{label}</span>
        <span className="text-sm font-mono font-semibold text-vx-accent tabular-nums">{format(value)}</span>
      </div>
      <input data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--vx-brand-brick)" }} />
    </div>
  );
}

function SectionTitle({ children, icon: Icon, tone = "teal" }) {
  const toneClass = tone === "rose" ? "text-vx-negative" : "text-vx-accent";
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-vx-divider">
      {Icon && <Icon size={16} className={toneClass} />}
      <h3 className="font-serif text-base font-semibold text-vx-text">{children}</h3>
    </div>
  );
}

function DeltaArrow({ base, sim, higherIsBetter = true }) {
  if (sim === base || Math.abs(sim - base) < 0.0001) return <span className="text-vx-muted text-xs">–</span>;
  const better = higherIsBetter ? sim > base : sim < base;
  return <span className={`text-xs font-semibold ${better ? "text-vx-positive" : "text-vx-negative"}`}>{sim > base ? "▲" : "▼"}</span>;
}

/* =================================================================================
   CHARTS
   ================================================================================= */

const PIE_COLORS = ["#1B2A4A", "#C1533C", "#4A5670", "#A6412E", "#8A99B8", "#7A2F20", "#C7D0DE", "#3D4F73"];

function PortfolioAllocationChart({ active }) {
  const data = active.map(({ deal }) => ({ name: deal.name, value: Number(deal.ownCash) || 0 }));
  if (!data.length || data.every((d) => d.value === 0)) return <EmptyChart label="No committed capital yet" />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => fmtGBP(v)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DealReturnsBarChart({ active }) {
  const data = active.map(({ deal, a }) => ({ name: deal.name.length > 14 ? deal.name.slice(0, 14) + "…" : deal.name, annualisedRoi: round2(a.annualisedRoi * 100) }));
  if (!data.length) return <EmptyChart label="No active deals yet" />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78716c" }} />
        <YAxis tick={{ fontSize: 11, fill: "#78716c" }} unit="%" />
        <Tooltip formatter={(v) => v + "%"} />
        <Bar dataKey="annualisedRoi" fill="var(--vx-brand-brick)" radius={[4, 4, 0, 0]} name="Annualised ROI" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BusinessSimChart({ timeline, target }) {
  if (!timeline.length) return <EmptyChart label="Adjust assumptions to run the simulation" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={timeline} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#78716c" }} label={{ value: "Month", position: "insideBottom", offset: -4, fontSize: 11, fill: "#78716c" }} />
        <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => "£" + Math.round(v / 1000) + "k"} />
        <Tooltip formatter={(v) => fmtGBP(v)} labelFormatter={(m) => `Month ${m}`} />
        <ReferenceLine y={target} stroke="#b45309" strokeDasharray="4 4" label={{ value: "Target", position: "right", fontSize: 11, fill: "#b45309" }} />
        <Line type="monotone" dataKey="monthlyIncomeRunRate" stroke="var(--vx-brand-brick)" strokeWidth={2} dot={false} name="Monthly income run-rate" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }) {
  return <div className="h-[220px] flex items-center justify-center text-sm text-vx-muted border border-dashed border-vx-divider rounded">{label}</div>;
}

/* =================================================================================
   VIEWS
   ================================================================================= */

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener("change", handler); else mql.addListener(handler);
    return () => { if (mql.removeEventListener) mql.removeEventListener("change", handler); else mql.removeListener(handler); };
  }, [query]);
  return matches;
}

function Sidebar({ tab, setTab, onNav, isDesktop, user, notifUnreadCount = 0 }) {
  const items = [
    { id: "dashboard",      label: "Dashboard",        icon: Home },
    { id: "workspace",      label: "Workspace",         icon: Map },
    { id: "sourcing",       label: "Pipeline",          icon: Layers },
    { id: "deals",          label: "Deals",             icon: Building2 },
    { id: "playbooks",      label: "Playbooks",         icon: BookMarked },
    { id: "capital",        label: "Capital & cash",    icon: Wallet },
    { id: "planner",        label: "Business planner",  icon: TrendingUp },
    { id: "risk",           label: "Risk exposure",     icon: ShieldAlert },
    { id: "contacts",       label: "Contacts",          icon: Users },
    { id: "properties",     label: "Properties",        icon: KeyRound },
    { id: "screener",       label: "Area Screener",     icon: Radar },
    { id: "notifications",  label: "Notifications",     icon: Bell },
    { id: "settings",       label: "Settings",          icon: Settings2 },
    { id: "guide",          label: "User Guide",        icon: BookOpen },
  ];
  return (
    <nav
      style={{ display: "flex", flexDirection: isDesktop ? "column" : "row", width: isDesktop ? 224 : "100%", minWidth: isDesktop ? 224 : 0, flexShrink: 0, overflowY: isDesktop ? "auto" : "visible", overflowX: isDesktop ? "hidden" : "auto" }}
      className="bg-vx-header text-[color:var(--vx-header-fg)]"
    >
      <div style={{ padding: 16, flexShrink: 0 }}>
        <div className="font-serif text-lg font-semibold leading-tight whitespace-nowrap">DealsDash</div>
        {isDesktop && <div className="text-xs text-[color:var(--vx-header-muted)] whitespace-nowrap">Deal &amp; cash flow control</div>}
      </div>
      <div style={{ display: "flex", flexDirection: isDesktop ? "column" : "row", flex: 1 }}>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id} data-testid={`nav-${id}`}
            onClick={() => { setTab(id); onNav && onNav(); }}
            style={{
              borderLeftWidth: isDesktop ? 4 : 0, borderBottomWidth: isDesktop ? 0 : 3,
              borderStyle: "solid", borderColor: tab === id ? "var(--vx-brand-brick)" : "transparent", flexShrink: 0,
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors text-left ${tab === id ? "bg-white/5 text-[color:var(--vx-header-fg)]" : "text-[color:var(--vx-header-muted)] hover:text-[color:var(--vx-header-fg)] hover:bg-white/5"}`}
          >
            <Icon size={16} /><span>{label}</span>
            {id === "notifications" && notifUnreadCount > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[18px] text-center leading-5">
                {notifUnreadCount > 99 ? "99+" : notifUnreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {isDesktop && user && (
        <div style={{ padding: 16, flexShrink: 0 }} className="border-t border-[color:var(--vx-header-rule)]">
          <div className="text-xs text-[color:var(--vx-header-muted)] truncate mb-2">{user.email}</div>
          <button data-testid="sign-out" onClick={() => signOut(auth)} className="flex items-center gap-1.5 text-xs text-[color:var(--vx-header-muted)] hover:text-[color:var(--vx-header-fg)]">
            <LogOut size={13} />Sign out
          </button>
        </div>
      )}
    </nav>
  );
}

function AlertsList({ alerts, compact = false }) {
  if (!alerts.length) return <div className="text-sm text-vx-muted flex items-center gap-2"><CheckCircle2 size={16} className="text-vx-positive" />No alerts — portfolio looks healthy.</div>;
  const iconFor = { shortfall: AlertTriangle, risk: ShieldAlert, runway: Wallet, concentration: MapPin, leverage: TrendingUp };
  return (
    <ul className="space-y-2">
      {(compact ? alerts.slice(0, 4) : alerts).map((a, i) => {
        const Icon = iconFor[a.type] || AlertTriangle;
        return (
          <li key={i} className="flex items-start gap-2 text-sm bg-amber-50 text-vx-caution border border-amber-200 rounded px-3 py-2">
            <Icon size={15} className="mt-0.5 shrink-0" />
            <span>{a.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DashboardView({ deals, ledger, properties, settings, thresholds, goToDeals, goToRisk, goToProperties }) {
  const summary = useMemo(() => portfolioSummary(deals, ledger, settings), [deals, ledger, settings]);
  const propertyAlerts = useMemo(() => portfolioComplianceAlerts(properties), [properties]);
  const combinedAlerts = useMemo(() => [...summary.alerts, ...propertyAlerts], [summary.alerts, propertyAlerts]);
  const complianceIssueCount = propertyAlerts.filter((a) => a.type === "overdue" || a.type === "expiring").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">Business health</h1>
        <p className="text-sm text-vx-muted mt-1">Live position across every deal, held rental, and the capital behind it.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <KPI label="Total capital base" value={fmtGBP(summary.totalCapitalBase)} />
        <KPI label="Free cash" value={fmtGBP(summary.freeCash)} tone={summary.freeCash < 0 ? "bad" : "default"} />
        <KPI label="Committed to deals" value={fmtGBP(summary.committedCash)} />
        <KPI label="Cash runway" value={summary.runwayMonths === Infinity ? "∞" : summary.runwayMonths < 0 ? "Cash negative" : `${summary.runwayMonths.toFixed(1)} mo`} tone={summary.runwayMonths !== Infinity && summary.runwayMonths < 3 ? "bad" : "default"} />
        <KPI label="Portfolio annualised ROI" value={fmtPct(summary.portfolioAnnualisedRoi)} tone={summary.portfolioAnnualisedRoi >= 0.25 ? "good" : "default"} />
        <KPI label="Active deals" value={summary.active.length} sub={`${summary.sold.length} sold`} />
        <KPI label="Rental portfolio" value={properties.length} sub={complianceIssueCount > 0 ? `${complianceIssueCount} compliance issue${complianceIssueCount === 1 ? "" : "s"}` : "compliance clean"} tone={complianceIssueCount > 0 ? "bad" : "default"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={Wallet}>Capital allocation by deal</SectionTitle>
          <PortfolioAllocationChart active={summary.active} />
        </Card>
        <Card>
          <SectionTitle icon={TrendingUp}>Annualised ROI by active deal</SectionTitle>
          <DealReturnsBarChart active={summary.active} />
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-vx-divider">
          <div className="flex items-center gap-2"><ShieldAlert size={16} className="text-vx-accent" /><h3 className="font-serif text-base font-semibold text-vx-text">Alerts</h3></div>
          <button onClick={goToRisk} className="text-xs text-vx-accent font-medium hover:underline">View risk detail →</button>
        </div>
        <AlertsList alerts={combinedAlerts} compact />
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-vx-divider">
          <div className="flex items-center gap-2"><Building2 size={16} className="text-vx-accent" /><h3 className="font-serif text-base font-semibold text-vx-text">Deals</h3></div>
          <button onClick={goToDeals} className="text-xs text-vx-accent font-medium hover:underline">Manage deals →</button>
        </div>
        {deals.length === 0 ? <div className="text-sm text-vx-muted">No deals yet.</div> : (
          <div className="space-y-1">
            {deals.slice(0, 5).map((d) => {
              const a = appraiseDeal(enrichDeal(d));
              const v = verdictForDeal(d, a, thresholds || DEFAULT_THRESHOLDS);
              return (
                <div key={d.id} className="flex items-center justify-between text-sm py-1.5 border-b border-vx-divider last:border-0">
                  <span className="text-vx-text">{d.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-vx-muted tabular-nums">{fmtGBP(a.netProfit)}</span>
                    <Badge tone={verdictTone(v.verdict)}>{v.verdict}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-vx-divider">
          <div className="flex items-center gap-2"><KeyRound size={16} className="text-vx-accent" /><h3 className="font-serif text-base font-semibold text-vx-text">Rental portfolio</h3></div>
          <button onClick={goToProperties} className="text-xs text-vx-accent font-medium hover:underline">Manage properties →</button>
        </div>
        {properties.length === 0 ? <div className="text-sm text-vx-muted">No properties under management yet.</div> : (
          <div className="space-y-1">
            {properties.slice(0, 5).map((p) => {
              const readiness = calcRefinanceReadiness(p, deals.find((d) => d.id === p.dealId));
              return (
                <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-vx-divider last:border-0">
                  <span className="text-vx-text">{p.address || "Untitled property"}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-vx-muted tabular-nums">{p.status}</span>
                    <Badge tone={readiness.verdict === "READY" ? "good" : readiness.verdict === "ALMOST READY" ? "warn" : "bad"}>{readiness.verdict}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function DealsListView({ deals, thresholds, onSelect, onAdd, onAddExample, onDelete, marketStats }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-vx-text">Deals</h1>
          <p className="text-sm text-vx-muted mt-1">Every deal you've appraised, live or rejected.</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="add-deal" onClick={onAdd} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded hover:bg-navy/90"><Plus size={16} />New deal</button>
        </div>
      </div>

      {deals.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-vx-muted mb-4">No deals yet.</p>
          <div className="flex justify-center gap-2">
            <button onClick={onAdd} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90">Add your first deal</button>
            <button data-testid="load-example" onClick={onAddExample} className="border border-vx-border text-sm font-medium px-4 py-2 rounded hover:bg-vx-surface">Load example deal</button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {deals.map((d) => {
            const a = appraiseDeal(enrichDeal(d));
            const v = verdictForDeal(d, a, thresholds || DEFAULT_THRESHOLDS);
            const district = d.postcode ? d.postcode.trim().split(" ")[0].toUpperCase() : null;
            const districtStats = district && marketStats ? marketStats[district] : null;
            return (
              <Card key={d.id} className="hover:border-vx-accent transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <button data-testid={`deal-${d.id}`} onClick={() => onSelect(d.id)} className="text-left flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif font-semibold text-vx-text">{d.name || "Untitled deal"}</span>
                      <Badge>{d.status}</Badge>
                      <Badge tone={verdictTone(v.verdict)}>{v.verdict}</Badge>
                      {d.areaIntelligence && d.areaIntelligence.imd && <ImdPill imd={d.areaIntelligence.imd} />}
                      {districtStats && <PriceMomentumPill stats={districtStats} propertyType={d.propertyType} />}
                    </div>
                    <div className="text-xs text-vx-muted mt-1">{d.address}{d.town ? `, ${d.town}` : ""}</div>
                    <div className="flex gap-5 mt-2 text-sm font-mono tabular-nums">
                      <span>Price {fmtGBP(d.price)}</span>
                      <span className={a.netProfit >= 0 ? "text-vx-positive" : "text-vx-negative"}>Profit {fmtGBP(a.netProfit)}</span>
                      <span>ROI {fmtPct(a.roi)}</span>
                      <span>Ann. ROI {fmtPct(a.annualisedRoi)}</span>
                    </div>
                  </button>
                  <button data-testid={`delete-${d.id}`} onClick={() => onDelete(d.id)} className="text-vx-muted hover:text-vx-negative p-1"><Trash2 size={16} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =================================================================================
   FUNDING PLANNER — three-mode cash-flow model with ICR, fund usage, audit trail
   ================================================================================= */

function FpCostTable({ lines }) {
  if (!lines || lines.length === 0) return null;
  return (
    <table className="w-full text-sm border-collapse">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className={`border-b border-vx-divider last:border-0 ${l.isTotal ? "font-semibold bg-vx-surface" : ""}`}>
            <td className="py-1.5 pl-1 text-vx-muted">{l.label}</td>
            <td className="text-right py-1.5 pr-1 font-mono tabular-nums text-vx-text">
              {l.value < 0 ? <span className="text-vx-positive">{fmtGBP(Math.abs(l.value))} (loan)</span> : fmtGBP(l.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FpAuditLine({ label, value, sub, bold, tone }) {
  const toneClass = { good: "text-vx-positive", bad: "text-vx-negative", warn: "text-vx-caution" }[tone] || "text-vx-text";
  return (
    <div className="flex justify-between items-baseline gap-2 text-sm">
      <span className="text-vx-muted">{label}{sub && <span className="opacity-60 ml-1 text-xs italic">— {sub}</span>}</span>
      <span className={`font-mono tabular-nums shrink-0 ${bold ? "font-semibold" : ""} ${toneClass}`}>{fmtGBP(value)}</span>
    </div>
  );
}

function FundingPlannerView({ deal, onChange, settings, defaultBuyBox }) {
  const activeMode = deal.fundingMode || "bridge";
  function setMode(m) { onChange({ fundingMode: m }); }

  const enriched = useMemo(() => enrichDeal(deal), [deal]);
  const timeline  = useMemo(() => calcTimeline(deal.phases), [deal.phases]);
  const refurb    = useMemo(() => calcRefurbTotal(deal.refurbItems, deal.contingencyPct), [deal.refurbItems, deal.contingencyPct]);
  const feesTotal = useMemo(() => sumFees(deal.fees), [deal.fees]);
  const gdv       = useMemo(() => calcGDV(enriched), [enriched]);
  const holdingCosts = enriched.holdingMonthly * timeline.months;

  // ICR params from buy box (read-only here; edit in Playbooks)
  const bbA = defaultBuyBox?.assumptions || {};
  const icrStressRate = bbA.icrStressRatePct?.value ?? 0.055;
  const icrThreshold  = bbA.icrThresholdPct?.value  ?? 1.25;

  // Revolving fund settings
  const fundSize = Number(settings?.lenderFundSize)   || 50000;
  const fundRate = Number(settings?.lenderFundRatePct) || 0.08;
  const fundDays = Math.round(timeline.months * 30.44);

  const cashResult = useMemo(() => calcFundingModeCash({
    price: deal.price, additionalProperty: deal.additionalProperty !== false,
    feesTotal, refurbTotal: refurb.total, holdingCosts,
  }), [deal.price, deal.additionalProperty, feesTotal, refurb.total, holdingCosts]);

  const bridgeResult = useMemo(() => calcFundingModeBridge({
    price: deal.price, additionalProperty: deal.additionalProperty !== false,
    feesTotal, refurbTotal: refurb.total, holdingCosts,
    bridgeLtvPct: deal.bridgeLTV, bridgeLoanBasis: deal.bridgeLoanBasis || "purchase", valuationOverride: 0,
    monthlyRate: deal.bridgeMonthlyRate, termMonths: timeline.months,
    arrangementPct: deal.arrangementPct, exitPct: deal.exitPct,
    interestMode: deal.interestMode || "retained",
    eaPct: deal.eaPct, solicitorSale: deal.solicitorSale, epc: deal.epc,
    gdv, refiLtvPct: deal.btlLtv,
    mortgageProductFeePct: deal.btlProductFeePct ?? 0.01,
  }), [deal.price, deal.additionalProperty, feesTotal, refurb.total, holdingCosts,
       deal.bridgeLTV, deal.bridgeLoanBasis, deal.bridgeMonthlyRate, timeline.months,
       deal.arrangementPct, deal.exitPct, deal.interestMode,
       deal.eaPct, deal.solicitorSale, deal.epc, gdv, deal.btlLtv, deal.btlProductFeePct]);

  const mortgageResult = useMemo(() => calcFundingModeMortgage({
    price: deal.price, additionalProperty: deal.additionalProperty !== false,
    feesTotal, refurbTotal: refurb.total, ltv: deal.btlLtv,
  }), [deal.price, deal.additionalProperty, feesTotal, refurb.total, deal.btlLtv]);

  const annualRent = (Number(deal.monthlyRent) || 0) * 12;
  const icrLoan = activeMode === "mortgage"
    ? (mortgageResult?.loan?.value || 0)
    : (bridgeResult?.brrr?.refiLoan?.value || 0);
  const icr = useMemo(() => calcIcr(annualRent, icrLoan, icrStressRate, icrThreshold),
    [annualRent, icrLoan, icrStressRate, icrThreshold]);

  const activeCashIn = activeMode === "cash"    ? (cashResult?.total?.value || 0)
                     : activeMode === "mortgage" ? (mortgageResult?.cashIn?.value || 0)
                     : (bridgeResult?.cashIn?.value || 0);
  const fundAlloc = deal.fundAllocation ?? Math.min(activeCashIn, fundSize);
  const fundUsage = useMemo(() => calcFundUsage(fundAlloc, fundDays, fundRate),
    [fundAlloc, fundDays, fundRate]);

  const activeSdlt = activeMode === "cash" ? cashResult?.sdlt
                   : activeMode === "bridge" ? bridgeResult?.sdlt
                   : mortgageResult?.sdlt;

  const SegBtn = ({ mode, label, active, onClick }) => (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-r last:border-r-0 border-vx-divider transition-colors
        ${active ? "bg-navy text-white" : "bg-vx-bg text-vx-muted hover:text-vx-text"}`}
    >{label}</button>
  );

  return (
    <div className="space-y-4">

      {/* Headline strip */}
      <Card>
        <div className="flex flex-wrap gap-4 items-start">
          <KPI label="Cash required" value={fmtGBP(activeCashIn)} />
          {activeMode === "bridge" && bridgeResult && (
            <>
              <KPI
                label="Flip profit"
                value={fmtGBP(bridgeResult.flip.profit.value)}
                tone={bridgeResult.flip.profit.value > 0 ? "good" : "bad"}
              />
              {bridgeResult.brrr.cashReleased
                ? <KPI label="BRRR exit" value="Cash released ↩" tone="good" />
                : <KPI
                    label="Money left in"
                    value={fmtGBP(bridgeResult.brrr.moneyLeftIn.value)}
                    tone={bridgeResult.brrr.moneyLeftIn.value === 0 ? "warn" : "default"}
                  />
              }
              {bridgeResult.brrr.moneyLeftIn.value === 0 && !bridgeResult.brrr.cashReleased && (
                <span className="self-center text-xs bg-navy text-white rounded px-2 py-0.5">No money left in</span>
              )}
            </>
          )}
          {(activeMode === "bridge" || activeMode === "mortgage") && icr.icr && (
            <KPI
              label="ICR"
              value={`${icr.icr.value.toFixed(2)}×`}
              tone={icr.pass ? "good" : "bad"}
            />
          )}
          <KPI label="Fund days" value={`${fundDays}d`} tone={fundUsage.termOverrun ? "warn" : "default"} />
        </div>
      </Card>

      {/* Mode selector + mode-specific detail */}
      <Card className="space-y-4">
        <SectionTitle icon={CreditCard}>Funding mode</SectionTitle>

        <div className="flex rounded border border-vx-divider overflow-hidden w-fit">
          <SegBtn mode="cash"     label="Cash purchase" active={activeMode === "cash"}     onClick={() => setMode("cash")} />
          <SegBtn mode="bridge"   label="Bridging"      active={activeMode === "bridge"}   onClick={() => setMode("bridge")} />
          <SegBtn mode="mortgage" label="BTL mortgage"  active={activeMode === "mortgage"} onClick={() => setMode("mortgage")} />
        </div>

        {/* ── Cash ── */}
        {activeMode === "cash" && cashResult && (
          <div className="space-y-3">
            <FpCostTable lines={cashResult.lines} />
            <p className="text-xs text-vx-caution">Figures are pre-filled from the deal; confirm all fees with your professional advisers.</p>
          </div>
        )}

        {/* ── Bridge ── */}
        {activeMode === "bridge" && bridgeResult && (
          <div className="space-y-4">
            {/* Toggles */}
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs font-medium text-vx-muted mb-1">Interest mode</p>
                <div className="flex rounded border border-vx-divider overflow-hidden w-fit">
                  {[["retained", "Retained (rolled up)"], ["serviced", "Serviced (monthly)"]].map(([m, lbl]) => (
                    <button key={m} onClick={() => onChange({ interestMode: m })}
                      className={`px-3 py-1.5 text-sm border-r last:border-r-0 border-vx-divider ${(deal.interestMode || "retained") === m ? "bg-navy text-white" : "bg-vx-bg text-vx-muted hover:text-vx-text"}`}
                    >{lbl}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-vx-muted mb-1">LTV basis</p>
                <div className="flex rounded border border-vx-divider overflow-hidden w-fit">
                  {[["purchase", "% of purchase"], ["valuation", "% of valuation"]].map(([m, lbl]) => (
                    <button key={m} onClick={() => onChange({ bridgeLoanBasis: m })}
                      className={`px-3 py-1.5 text-sm border-r last:border-r-0 border-vx-divider ${(deal.bridgeLoanBasis || "purchase") === m ? "bg-navy text-white" : "bg-vx-bg text-vx-muted hover:text-vx-text"}`}
                    >{lbl}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Flip vs BRRR side-by-side */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-vx-surface rounded p-3 space-y-1">
                <p className="text-sm font-semibold text-vx-text mb-2">Flip exit</p>
                <FpAuditLine label="GDV"             value={gdv} />
                <FpAuditLine label="Selling costs"   value={bridgeResult.flip.sellingCosts.value}   sub={bridgeResult.flip.sellingCosts.formula} />
                <FpAuditLine label="Net sale"         value={bridgeResult.flip.netSale.value}        bold />
                <div className="border-t border-vx-divider pt-1 mt-1" />
                <FpAuditLine label="Cash in"          value={bridgeResult.cashIn.value} />
                <FpAuditLine label="Bridge redemption" value={bridgeResult.bridgeRedemption.value} />
                <FpAuditLine label="Profit"           value={bridgeResult.flip.profit.value}        bold tone={bridgeResult.flip.profit.value >= 0 ? "good" : "bad"} />
              </div>
              <div className="bg-vx-surface rounded p-3 space-y-1">
                <p className="text-sm font-semibold text-vx-text mb-2">BRRR exit</p>
                <FpAuditLine label="GDV"              value={gdv} />
                <FpAuditLine label="Refi loan"        value={bridgeResult.brrr.refiLoan.value}      sub={bridgeResult.brrr.refiLoan.formula} />
                <FpAuditLine label="Bridge redemption" value={bridgeResult.bridgeRedemption.value} />
                <FpAuditLine label="Product fee"      value={bridgeResult.brrr.mortgageProductFee.value} sub={bridgeResult.brrr.mortgageProductFee.formula} />
                <div className="border-t border-vx-divider pt-1 mt-1" />
                {bridgeResult.brrr.cashReleased
                  ? <div className="text-sm font-semibold text-vx-positive">Cash released ↩</div>
                  : <FpAuditLine label="Money left in" value={bridgeResult.brrr.moneyLeftIn.value} bold tone={bridgeResult.brrr.moneyLeftIn.value === 0 ? "warn" : "good"} />
                }
                <div className="mt-2">
                  <PctField label="Mortgage product fee %" value={deal.btlProductFeePct ?? 0.01} onChange={(v) => onChange({ btlProductFeePct: v })} step={0.1} />
                </div>
              </div>
            </div>

            {/* Full cost build-up */}
            <SectionTitle>Cash-in build-up</SectionTitle>
            <FpCostTable lines={bridgeResult.lines} />

            {/* Interest detail */}
            <div className="bg-vx-surface rounded px-3 py-2 text-xs space-y-0.5">
              <span className="font-medium text-vx-text">Bridge interest detail</span>
              {(deal.interestMode || "retained") === "retained" ? (
                <p className="text-vx-muted">{bridgeResult.interest.total.formula} = <b>{fmtGBP(bridgeResult.interest.total.value)}</b> — rolled into redemption, not counted in cash in.</p>
              ) : (
                <p className="text-vx-muted">{bridgeResult.interest.monthly.formula} = <b>{fmtGBP(bridgeResult.interest.monthly.value)}/mo</b>; {bridgeResult.interest.total.formula} = <b>{fmtGBP(bridgeResult.interest.total.value)}</b> paid from cash in.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Mortgage ── */}
        {activeMode === "mortgage" && mortgageResult && (
          <div className="space-y-3">
            <FpCostTable lines={mortgageResult.lines} />
          </div>
        )}
      </Card>

      {/* ICR stress test */}
      {(activeMode === "bridge" || activeMode === "mortgage") && (
        <Card className="space-y-3">
          <SectionTitle>ICR stress test</SectionTitle>
          {annualRent > 0 && icrLoan > 0 ? (
            <>
              <div className="flex flex-wrap gap-4">
                <KPI
                  label={`ICR (${(icrThreshold * 100).toFixed(0)}% threshold)`}
                  value={icr.icr ? `${icr.icr.value.toFixed(2)}×` : "—"}
                  tone={icr.pass ? "good" : "bad"}
                />
                <KPI label="Max loan at threshold" value={icr.maxLoanAtThreshold ? fmtGBP(icr.maxLoanAtThreshold.value) : "—"} />
                <KPI label="Max loan at 145% ref" value={icr.maxLoanAt145 ? fmtGBP(icr.maxLoanAt145.value) : "—"} />
              </div>
              {!icr.pass && (
                <div className="flex items-start gap-2 text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  <XCircle size={13} className="mt-0.5 shrink-0" />
                  <span>ICR fails at {(icrThreshold * 100).toFixed(0)}% threshold. Max supportable refi loan at this rent is <b>{fmtGBP(icr.maxLoanAtThreshold?.value || 0)}</b> — actual loan is <b>{fmtGBP(icrLoan)}</b>.</span>
                </div>
              )}
              <div className="text-xs text-vx-muted font-mono bg-vx-surface rounded px-2 py-1">{icr.icr?.formula}</div>
              <div className="grid md:grid-cols-2 gap-3 text-xs text-vx-muted">
                <div>ICR stress rate: <b>{fmtPct(icrStressRate)}</b></div>
                <div>ICR threshold: <b>{icrThreshold}×</b></div>
              </div>
              <p className="text-xs text-vx-muted">Edit ICR stress rate and threshold in the Playbooks tab (buy box assumptions).</p>
              <p className="text-xs text-vx-caution">{icr.disclaimer}</p>
            </>
          ) : (
            <p className="text-sm text-vx-muted">Enter monthly rent (Returns &amp; rental tab) and a loan is needed to calculate ICR.</p>
          )}
        </Card>
      )}

      {/* SDLT breakdown */}
      <Card className="space-y-3">
        <SectionTitle>SDLT breakdown</SectionTitle>
        {activeSdlt?.bands?.length > 0 ? (
          <>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-vx-muted border-b border-vx-divider">
                  <th className="py-1 font-medium">Band</th>
                  <th className="py-1 text-right font-medium">Rate</th>
                  <th className="py-1 text-right font-medium">Taxable</th>
                  <th className="py-1 text-right font-medium">Tax</th>
                </tr>
              </thead>
              <tbody>
                {activeSdlt.bands.map((b, i) => (
                  <tr key={i} className="border-b border-vx-divider last:border-0">
                    <td className="py-1">{fmtGBP(b.lo)} – {b.hi ? fmtGBP(b.hi) : "above"}</td>
                    <td className="py-1 text-right">{(b.rate * 100).toFixed(0)}%</td>
                    <td className="py-1 text-right font-mono">{fmtGBP(b.taxable)}</td>
                    <td className="py-1 text-right font-mono">{fmtGBP(b.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={3} className="pt-1 text-right text-vx-muted">Total SDLT</td>
                  <td className="pt-1 text-right font-mono">{fmtGBP(activeSdlt.value)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-vx-caution">{activeSdlt.disclaimer}</p>
          </>
        ) : (
          <p className="text-sm text-vx-muted">Enter a purchase price to see the SDLT breakdown.</p>
        )}
      </Card>

      {/* VIXIV revolving fund */}
      <Card className="space-y-3">
        <SectionTitle icon={Banknote}>VIXIV revolving fund usage</SectionTitle>
        <div className="grid md:grid-cols-3 gap-3">
          <NumField label="Fund allocation (£)" value={deal.fundAllocation ?? activeCashIn} onChange={(v) => onChange({ fundAllocation: v === activeCashIn ? null : v })} testId="fund-alloc" />
          <div className="text-sm font-mono flex items-end pb-1.5 text-vx-muted">Fund size: <b className="ml-1 text-vx-text">{fmtGBP(fundSize)}</b></div>
          <div className="text-sm font-mono flex items-end pb-1.5 text-vx-muted">Rate: <b className="ml-1 text-vx-text">{fmtPct(fundRate)}</b></div>
        </div>
        <div className="flex flex-wrap gap-4 bg-vx-surface rounded px-3 py-2 text-sm font-mono">
          <span>Allocation: <b>{fmtGBP(fundAlloc)}</b></span>
          <span>Days tied up: <b>{fundDays}</b></span>
          <span>Fund cost: <b>{fmtGBP(fundUsage.cost.value)}</b></span>
        </div>
        {fundUsage.extensionOverrun && (
          <div className="flex items-start gap-2 text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>Expected hold ({fundDays} days) exceeds the 12-month term plus the 3-month extension ({fundUsage.fundTermDays + fundUsage.fundExtensionDays} days). Discuss renewal terms with your lender.</span>
          </div>
        )}
        {fundUsage.termOverrun && !fundUsage.extensionOverrun && (
          <div className="flex items-start gap-2 text-xs text-vx-caution bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>Expected hold ({fundDays} days) exceeds the 12-month fund term. A 3-month extension may be available — confirm with your lender.</span>
          </div>
        )}
        <p className="text-xs text-vx-muted">Fund size and rate are set in Capital &amp; cash → Settings. Allocation defaults to cash required, capped at fund size. Formula: {fundUsage.cost.formula}.</p>
      </Card>

    </div>
  );
}

const DEAL_TABS = ["Property", "Appraisal", "Finance", "Returns", "Progress", "Decision", "Legal"];

function _DealHeadlineStrip({ deal, base, verdict, defaultBuyBox }) {
  const isBrrr = deal.fundingMode === "mortgage";
  const decisiveLabel = isBrrr ? "Money left in" : "Net profit";
  const decisiveValue = isBrrr ? base.cashLeftIn : base.netProfit;
  const decisivePositive = isBrrr ? decisiveValue <= 0 : decisiveValue >= 0;

  const verdictVariant = { PROCEED: "positive", CAUTION: "caution", REJECT: "risk" }[verdict.verdict] || "neutral";

  const badges = [];

  // Buy box match (objective gate checks only)
  if (defaultBuyBox && defaultBuyBox.filters) {
    const gate = applyDeterministicGate(deal, defaultBuyBox.filters);
    const allNull = gate.areaKnown === null && gate.assetTypeFits === null && gate.tenureFits === null;
    if (!allNull) {
      const fits = gate.areaKnown !== false && gate.assetTypeFits !== false && gate.tenureFits !== false;
      badges.push({ label: fits ? "Fits buy box" : "Outside buy box", variant: fits ? "positive" : "risk" });
    }
  }

  // Funding shortfall
  if (base.funding.shortfall > 0) {
    badges.push({ label: `Funding gap ${fmtGBP(base.funding.shortfall)}`, variant: "risk" });
  }

  // BRRR: no money left in (full recycled capital = positive)
  if (isBrrr && base.cashLeftIn <= 0) {
    badges.push({ label: "No money left in", variant: "positive" });
  }

  // EPC band
  if (deal.epcCheck && deal.epcCheck.rating) {
    const r = deal.epcCheck.rating.toUpperCase();
    badges.push({ label: `EPC ${r}`, variant: "ABC".includes(r) ? "positive" : "FG".includes(r) ? "risk" : "neutral" });
  }

  // Flood risk
  const fl = deal.areaIntelligence && deal.areaIntelligence.flood;
  if (fl && !fl.error && fl.areaCount > 0) {
    badges.push({ label: `Flood areas: ${fl.areaCount}`, variant: "caution" });
  }

  // IMD decile
  if (deal.areaIntelligence && deal.areaIntelligence.imd && !deal.areaIntelligence.imd.notAvailable) {
    const { decile } = deal.areaIntelligence.imd;
    badges.push({ label: `IMD ${decile}/10`, variant: decile <= 3 ? "risk" : decile <= 7 ? "caution" : "neutral" });
  }

  const shown = badges.slice(0, 4);
  const overflow = badges.length - shown.length;

  return (
    <div className="bg-vx-surface border border-vx-border rounded-lg px-4 py-3 flex flex-wrap items-center gap-4">
      <div className="shrink-0">
        <div className="text-xs text-vx-muted leading-tight">{decisiveLabel}</div>
        <div className={`text-xl font-mono font-bold tabular-nums leading-tight mt-0.5 ${decisivePositive ? "text-vx-positive" : "text-vx-negative"}`}>{fmtGBP(decisiveValue)}</div>
      </div>
      <div className="shrink-0">
        <div className="text-xs text-vx-muted leading-tight">Cash in</div>
        <div className="text-xl font-mono font-bold tabular-nums leading-tight mt-0.5 text-vx-text">{fmtGBP(Number(deal.ownCash) || 0)}</div>
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5 items-center">
        <VxBadge variant={verdictVariant} size="md">{verdict.verdict}</VxBadge>
        {shown.map((b, i) => <VxBadge key={i} variant={b.variant}>{b.label}</VxBadge>)}
        {overflow > 0 && <VxBadge variant="neutral">+{overflow}</VxBadge>}
      </div>
    </div>
  );
}

const ATTRIBUTION_SOURCES = [
  "HM Land Registry (Price Paid Data)",
  "DLUHC EPC Register",
  "Environment Agency (flood risk areas)",
  "Police.uk (crime data)",
  "MHCLG Indices of Multiple Deprivation",
  "postcodes.io / ONS (postcodes, geographies)",
];

function _AttributionFooter() {
  return (
    <footer className="mt-10 pt-4 border-t border-vx-divider text-xs text-vx-muted">
      <div className="font-medium text-vx-text mb-1">Data sources</div>
      <div className="mb-1">{ATTRIBUTION_SOURCES.join(" · ")}</div>
      <div>Contains public sector information licensed under the Open Government Licence v3.0.</div>
    </footer>
  );
}

function DealDetailView({ deal, onChange, onDelete, onBack, thresholds, defaultBuyBox, buyBox = null, settings, onMoveToRental, alreadyLinkedProperty, ownerUid, surveyRates, onSurveyRatesChange, marketStats }) {
  const [subTab, setSubTab] = useState(DEAL_TABS[0]);
  const [sim, setSim] = useState(null); // simulation overlay, transient
  const [programmeData, setProgrammeData] = useState(null); // { keyDates, flags } from ProgrammeView
  const [hpiLoading, setHpiLoading] = useState(false);
  const [hpiError, setHpiError] = useState(null);
  const [hpiData, setHpiData] = useState(null);
  const [targetProfitInput, setTargetProfitInput] = useState(thresholds && thresholds.minNetProfit ? thresholds.minNetProfit : 25000);
  const [lockConfirm, setLockConfirm] = useState(null); // { delta, priorLocked } when a higher re-lock needs explicit confirmation

  // Buy box snapshot helpers
  const snap = deal.assumptionSnapshot?.values || null;
  function overrideMark(assumptionKey, currentValue) {
    if (!snap || snap[assumptionKey] === undefined) return null;
    if (Math.abs(Number(snap[assumptionKey]) - Number(currentValue)) < 0.000001) return null;
    return (
      <span className="text-xs text-vx-caution italic ml-0.5" title={`Buy box default: ${snap[assumptionKey]}`}>overridden</span>
    );
  }
  const buyBoxUpdated = defaultBuyBox && deal.assumptionSnapshot &&
    defaultBuyBox.updatedAt > deal.assumptionSnapshot.snapshotAt;
  function reapplyBuyBox() {
    if (!defaultBuyBox) return;
    const a = defaultBuyBox.assumptions || {};
    const v = key => a[key]?.value;
    const ww = v("worksMonths") != null ? Math.round(v("worksMonths") * 4.33) : null;
    const mw = v("marketingMonths") != null ? Math.round(v("marketingMonths") * 4.33) : null;
    const newSnap = {};
    Object.keys(a).forEach(k => { if (a[k]?.value !== undefined) newSnap[k] = a[k].value; });
    onChange({
      fees: { ...deal.fees,
        solicitor: v("legalFeesBuy")   ?? deal.fees.solicitor,
        searches:  v("searchesFee")    ?? deal.fees.searches,
        survey:    v("surveyFee")      ?? deal.fees.survey,
        broker:    v("brokerFee")      ?? deal.fees.broker,
        valuation: v("valuationFee")   ?? deal.fees.valuation,
        landReg:   v("landRegFee")     ?? deal.fees.landReg,
      },
      bridgeLTV:        v("bridgeLtvPct")         ?? deal.bridgeLTV,
      bridgeMonthlyRate:v("bridgeMonthlyRatePct") ?? deal.bridgeMonthlyRate,
      arrangementPct:   v("bridgeArrangementPct") ?? deal.arrangementPct,
      exitPct:          v("bridgeExitPct")        ?? deal.exitPct,
      contingencyPct:   v("refurbContingencyPct") ?? deal.contingencyPct,
      phases: deal.phases.map(p => {
        if (p.name === "Refurbishment"    && ww != null) return { ...p, weeks: ww };
        if (p.name === "Marketing period" && mw != null) return { ...p, weeks: mw };
        return p;
      }),
      eaPct:        v("eaPct")           ?? deal.eaPct,
      solicitorSale:v("legalFeesSell")   ?? deal.solicitorSale,
      epc:          v("epcCost")         ?? deal.epc,
      voidPct:      v("voidPct")         ?? deal.voidPct,
      mgmtPct:      v("managementPct")   ?? deal.mgmtPct,
      maintPct:     v("maintenancePct")  ?? deal.maintPct,
      llInsurance:  v("llInsuranceAnnual") ?? deal.llInsurance,
      btlLtv:       v("refiLtvPct")      ?? deal.btlLtv,
      btlRate:      v("mortgageRatePct") ?? deal.btlRate,
      buyBoxId: defaultBuyBox.id,
      assumptionSnapshot: { snapshotAt: Date.now(), values: newSnap },
    });
  }

  async function checkMarketTrend() {
    setHpiLoading(true);
    setHpiError(null);
    try {
      const result = await fetchUKHPITrend(deal.town, 24);
      if (!result) setHpiError(`No UK House Price Index data found for "${deal.town}" — it may need the exact council name (e.g. "Kirklees" rather than "Huddersfield") or the town might not be covered.`);
      else setHpiData(result);
    } catch (e) {
      setHpiError(e.message);
    }
    setHpiLoading(false);
  }

  function runSolveMaxBid() {
    const result = solveMaxBid(deal, Number(targetProfitInput) || 0);
    const entry = { at: Date.now(), from: deal.maxBid, to: result.maxBid, reason: "Solved", action: "solve" };
    onChange({ maxBid: result.maxBid, maxBidSafe: result.safeBid, maxBidGdvLow: result.gdvLow, maxBidSolveNote: result.note, maxBidLog: [...(deal.maxBidLog || []), entry] });
  }

  function lastLockedMaxBid() {
    const lockEntries = (deal.maxBidLog || []).filter((e) => e.action === "lock" || e.action === "lock-confirmed");
    return lockEntries.length ? lockEntries[lockEntries.length - 1].to : null;
  }

  function doLock(action, reason) {
    const entry = { at: Date.now(), from: deal.maxBid, to: deal.maxBid, reason, action };
    onChange({ maxBidLocked: true, maxBidLog: [...(deal.maxBidLog || []), entry] });
    setLockConfirm(null);
  }

  function attemptLock() {
    const prior = lastLockedMaxBid();
    if (prior != null && Number(deal.maxBid) > prior) {
      setLockConfirm({ delta: round2(Number(deal.maxBid) - prior), priorLocked: prior });
      return; // blocked — a plain Lock click never silently accepts an increase
    }
    doLock("lock", "Locked");
  }

  function confirmHigherLock() {
    doLock("lock-confirmed", `Confirmed higher than previous locked figure of ${fmtGBP(lockConfirm.priorLocked)}`);
  }

  function unlockMaxBid() {
    const entry = { at: Date.now(), from: deal.maxBid, to: deal.maxBid, reason: "Unlocked for re-solve", action: "unlock" };
    onChange({ maxBidLocked: false, maxBidLog: [...(deal.maxBidLog || []), entry] });
  }

  // Legal pack fees add to whatever's already in fees.other (per the brief:
  // "added to existing default, not replacing") — a deal might have other
  // acquisition costs already entered manually alongside what the pack found.
  function applyLegalPackFeesToDeal(review) {
    const { buyerPremiumTotal, otherReimbursementsTotal } = legalPackFeesBreakdown(review.additionalFees);
    const patch = { fees: { ...deal.fees, other: round2((Number(deal.fees.other) || 0) + buyerPremiumTotal + otherReimbursementsTotal) } };
    if (review.completion && Number(review.completion.completionDays) > 0) patch.completionDays = Number(review.completion.completionDays);
    onChange(patch);
  }

  // Viewing survey → deal. Survey-owned refurb lines replace their previous versions; manual
  // trades survive (mergeRefurbItems). If the max bid isn't locked it is re-solved on the
  // patched deal so the survey's live bar shows a figure that reflects the new works.
  function applySurveyToDeal(patch) {
    const next = { ...deal, ...patch, refurbItems: mergeRefurbItems(deal.refurbItems, patch.refurbItems) };
    const out = { ...patch, refurbItems: next.refurbItems };
    if (!deal.maxBidLocked) {
      const result = solveMaxBid(next, Number(targetProfitInput) || 0);
      const entry = { at: Date.now(), from: deal.maxBid, to: result.maxBid, reason: `Re-solved after viewing survey (${patch.refurbItems.length} lines, ${fmtGBP(patch.surveyApplied.total)})`, action: "solve" };
      Object.assign(out, { maxBid: result.maxBid, maxBidSafe: result.safeBid, maxBidGdvLow: result.gdvLow, maxBidSolveNote: result.note, maxBidLog: [...(deal.maxBidLog || []), entry] });
    }
    onChange(out);
  }

  const base = useMemo(() => appraiseDeal(enrichDeal(deal)), [deal]);
  const baseVerdict = useMemo(() => verdictForDeal(deal, base, thresholds), [deal, base, thresholds]);

  const simDeal = useMemo(() => {
    if (!sim) return null;
    const scaledRefurb = deal.refurbItems.map((it) => ({ ...it, low: it.low * sim.refurbMult, high: it.high * sim.refurbMult }));
    return { ...deal, price: sim.price, ownCash: sim.ownCash, gdvOverride: sim.gdvOverride, bridgeMonthlyRate: sim.bridgeRate, refurbItems: scaledRefurb, phases: [{ name: "Adjusted duration", weeks: sim.weeks }] };
  }, [deal, sim]);
  const simAppraisal = useMemo(() => (simDeal ? appraiseDeal(enrichDeal(simDeal)) : null), [simDeal]);
  const simVerdict = useMemo(() => (simDeal && simAppraisal ? verdictForDeal(simDeal, simAppraisal, thresholds) : null), [simDeal, simAppraisal, thresholds]);

  function initSim() {
    setSim({
      price: deal.price, ownCash: deal.ownCash, gdvOverride: base.gdv, bridgeRate: deal.bridgeMonthlyRate,
      refurbMult: 1, weeks: calcTimeline(deal.phases).weeks,
    });
  }
  function applySim() {
    if (!sim || !simDeal) return;
    onChange({ price: sim.price, ownCash: sim.ownCash, gdvOverride: sim.gdvOverride, bridgeMonthlyRate: sim.bridgeRate, refurbItems: simDeal.refurbItems, phases: simDeal.phases });
    setSim(null);
  }

  function set(field, value) { onChange({ [field]: value }); }
  function setNested(field, idx, key, value) {
    const arr = [...deal[field]];
    arr[idx] = { ...arr[idx], [key]: value };
    onChange({ [field]: arr });
  }
  function setObj(field, key, value) { onChange({ [field]: { ...deal[field], [key]: value } }); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-vx-muted hover:text-vx-text"><ChevronLeft size={16} />All deals</button>
        <button data-testid="delete-deal-detail" onClick={() => onDelete(deal.id)} className="flex items-center gap-1 text-sm text-vx-negative hover:text-vx-negative"><Trash2 size={14} />Delete deal</button>
      </div>

      {buyBoxUpdated && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm">
          <RefreshCcw size={15} className="mt-0.5 text-vx-caution shrink-0" />
          <div className="flex-1">
            <span className="font-medium text-vx-caution">Buy box updated since this appraisal was created.</span>
            <span className="text-vx-muted ml-1">Re-apply to use the latest assumptions.</span>
          </div>
          <button onClick={reapplyBuyBox} className="text-xs font-medium text-vx-accent hover:underline whitespace-nowrap">Re-apply</button>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <input data-testid="deal-name-input" value={deal.name} onChange={(e) => set("name", e.target.value)} className="font-serif text-2xl font-semibold text-vx-text bg-transparent outline-none border-b border-transparent focus:border-vx-accent w-full" />
          {deal.maxBid != null && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <div data-testid="deal-maxbid-header" className="flex items-center gap-1.5 bg-vx-accent/10 border border-vx-accent/30 rounded-md px-2.5 py-1">
                <span className="text-xs font-medium text-vx-accent-strong uppercase tracking-wide">Bid limit</span>
                <span className="text-lg font-mono font-bold text-vx-accent-strong">{fmtGBP(deal.maxBidSafe ?? deal.maxBid)}</span>
                {deal.maxBidSafe != null && deal.maxBidSafe !== deal.maxBid && (
                  <span className="text-xs text-vx-muted">ceiling {fmtGBP(deal.maxBid)}</span>
                )}
              </div>
              {deal.maxBidLocked && <Badge tone="info">locked</Badge>}
              <span className="text-xs text-vx-muted">guide {fmtGBP(deal.price)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={verdictTone(baseVerdict.verdict)}>{baseVerdict.verdict}</Badge>
          <SelectField label="" value={deal.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} testId="deal-status" />
        </div>
      </div>

      <_DealHeadlineStrip deal={deal} base={base} verdict={baseVerdict} defaultBuyBox={defaultBuyBox} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Net profit" value={fmtGBP(base.netProfit)} tone={base.netProfit >= 0 ? "good" : "bad"} />
        <KPI label="ROI on cash" value={fmtPct(base.roi)} />
        <KPI label="Annualised ROI" value={fmtPct(base.annualisedRoi)} />
        <KPI label="Funding shortfall" value={fmtGBP(base.funding.shortfall)} tone={base.funding.shortfall > 0 ? "bad" : "good"} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-vx-divider">
        {DEAL_TABS.map((t) => (
          <button key={t} data-testid={`subtab-${t}`} onClick={() => setSubTab(t)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${subTab === t ? "border-vx-accent text-vx-accent-strong" : "border-transparent text-vx-muted hover:text-vx-text"}`}>{t}</button>
        ))}
      </div>

      {subTab === "Property" && (
        <Card className="space-y-4">
          <SectionTitle>Subject property</SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <TextField label="Address" value={deal.address} onChange={(v) => set("address", v)} testId="deal-address" />
            <TextField label="Town" value={deal.town} onChange={(v) => set("town", v)} testId="deal-town" />
            <TextField label="Postcode" value={deal.postcode} onChange={(v) => set("postcode", v)} testId="deal-postcode" />
            <SelectField label="Property type" value={deal.propertyType} onChange={(v) => set("propertyType", v)} options={["Terrace", "Semi", "Detached", "Flat"]} />
            <NumField label="Bedrooms" value={deal.bedrooms} onChange={(v) => set("bedrooms", v)} prefix="" />
            <NumField label="Floor area (sq ft)" value={deal.floorArea} onChange={(v) => set("floorArea", v)} prefix="" testId="deal-floorarea" />
            <NumField label="Condition (1 derelict – 5 habitable)" value={deal.condition} onChange={(v) => set("condition", v)} prefix="" />
            <NumField label="Days on market (comps avg)" value={deal.daysOnMarket} onChange={(v) => set("daysOnMarket", v)} prefix="" />
            <SelectField label="Owner-occupier demand confirmed?" value={deal.occupierDemand} onChange={(v) => set("occupierDemand", v)} options={["Y", "N"]} testId="deal-occdemand" />
          </div>

          <SectionTitle>Comparable sold prices</SectionTitle>
          <div className="space-y-2">
            {deal.comps.map((c, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                <TextField label="Address" value={c.address} onChange={(v) => setNested("comps", i, "address", v)} />
                <NumField label="Sold price" value={c.price} onChange={(v) => setNested("comps", i, "price", v)} testId={i === 0 ? "comp0-price" : undefined} />
                <TextField label="Sold date" value={c.date} onChange={(v) => setNested("comps", i, "date", v)} placeholder="YYYY-MM-DD" />
                <NumField label="Floor area (sq ft)" value={c.floorArea} onChange={(v) => setNested("comps", i, "floorArea", v)} prefix="" testId={i === 0 ? "comp0-area" : undefined} />
              </div>
            ))}
          </div>
          <div className="text-sm text-vx-muted font-mono">Average £/sq ft: <b>{fmtGBP(avgPsfFromComps(deal.comps))}</b></div>
          <div className="grid md:grid-cols-2 gap-3">
            <PctField label="Condition/finish adjustment" value={deal.conditionAdj} onChange={(v) => set("conditionAdj", v)} />
            <NumField label="GDV manual override (0 = use comps estimate)" value={deal.gdvOverride} onChange={(v) => set("gdvOverride", v)} />
          </div>
          {(() => {
            const dist = compPsfDistribution(deal.comps);
            if (!dist) return null;
            const subjectPsf = deal.floorArea > 0 ? base.gdv / deal.floorArea : 0;
            return (
              <div className="bg-vx-surface rounded px-3 py-3 space-y-2">
                <div className="text-xs font-medium text-vx-muted">£/sq ft spread across {dist.count} comp{dist.count === 1 ? "" : "s"} (not just the average — one outlier can badly skew a mean)</div>
                <div className="flex items-center gap-3 text-xs font-mono text-vx-muted flex-wrap">
                  <span>Min {fmtGBP(dist.min)}</span>
                  <span>25th {fmtGBP(dist.p25)}</span>
                  <span className="font-semibold text-vx-text">Median {fmtGBP(dist.median)}</span>
                  <span>75th {fmtGBP(dist.p75)}</span>
                  <span>Max {fmtGBP(dist.max)}</span>
                </div>
                {subjectPsf > 0 && (
                  <div className="text-xs text-vx-accent-strong">Your estimated GDV implies ~{fmtGBP(subjectPsf)}/sq ft — {psfPercentileLabel(subjectPsf, dist)}.</div>
                )}
              </div>
            );
          })()}

          <SectionTitle icon={TrendingUp}>Council-level market trend (UK House Price Index)</SectionTitle>
          <p className="text-xs text-vx-muted">Macro context alongside the comps above — is {deal.town || "this area"}'s market rising, flat, or falling, independent of any one street's sold prices.</p>
          <button data-testid="check-market-trend" onClick={checkMarketTrend} disabled={hpiLoading || !deal.town} className="flex items-center gap-1.5 text-sm font-medium text-vx-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
            <RefreshCw size={14} />{hpiLoading ? "Checking UKHPI…" : "Check local market trend"}
          </button>
          {!deal.town && <div className="text-xs text-vx-muted">Add a town above first.</div>}
          {hpiError && <div data-testid="hpi-error" className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-3 py-2">{hpiError}</div>}
          {hpiData && (
            <div data-testid="hpi-result" className="space-y-2">
              <div className="flex flex-wrap gap-4 text-sm font-mono bg-vx-surface text-vx-accent-strong rounded px-3 py-2">
                <span>Council average: <b>{fmtGBP(hpiData.latest.avgPrice)}</b></span>
                {hpiData.latest.changeMonth != null && <span>Month-on-month: <b className={hpiData.latest.changeMonth >= 0 ? "text-vx-positive" : "text-vx-negative"}>{hpiData.latest.changeMonth >= 0 ? "+" : ""}{hpiData.latest.changeMonth}%</b></span>}
                {hpiData.latest.changeYear != null && <span>Year-on-year: <b className={hpiData.latest.changeYear >= 0 ? "text-vx-positive" : "text-vx-negative"}>{hpiData.latest.changeYear >= 0 ? "+" : ""}{hpiData.latest.changeYear}%</b></span>}
              </div>
              {hpiData.points.length > 2 && (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={hpiData.points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#78716c" }} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#78716c" }} tickFormatter={(v) => "£" + Math.round(v / 1000) + "k"} width={58} />
                    <Tooltip formatter={(v) => fmtGBP(v)} />
                    <Line type="monotone" dataKey="avgPrice" stroke="var(--vx-brand-brick)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          <div className="text-sm font-mono bg-vx-surface text-vx-accent-strong rounded px-3 py-2 inline-block">Estimated GDV: <b>{fmtGBP(base.gdv)}</b></div>
        </Card>
      )}

      {subTab === "Finance" && (
        <Card className="space-y-4">
          <SectionTitle>Purchase</SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <NumField label="Purchase price" value={deal.price} onChange={(v) => set("price", v)} testId="deal-price" />
            <SelectField label="Additional property (surcharge)?" value={deal.additionalProperty ? "Y" : "N"} onChange={(v) => set("additionalProperty", v === "Y")} options={["Y", "N"]} />
            <div className="text-sm font-mono flex items-end pb-1.5 text-vx-text">SDLT: <b className="ml-1">{fmtGBP(base.funding.sdlt)}</b></div>
          </div>
          <SectionTitle>Acquisition fees</SectionTitle>
          <div className="grid md:grid-cols-4 gap-3">
            <div><NumField label="Solicitor" value={deal.fees.solicitor} onChange={(v) => setObj("fees", "solicitor", v)} />{overrideMark("legalFeesBuy", deal.fees.solicitor)}</div>
            <div><NumField label="Searches" value={deal.fees.searches} onChange={(v) => setObj("fees", "searches", v)} />{overrideMark("searchesFee", deal.fees.searches)}</div>
            <div><NumField label="Survey" value={deal.fees.survey} onChange={(v) => setObj("fees", "survey", v)} />{overrideMark("surveyFee", deal.fees.survey)}</div>
            <div><NumField label="Broker" value={deal.fees.broker} onChange={(v) => setObj("fees", "broker", v)} />{overrideMark("brokerFee", deal.fees.broker)}</div>
            <div><NumField label="Valuation" value={deal.fees.valuation} onChange={(v) => setObj("fees", "valuation", v)} />{overrideMark("valuationFee", deal.fees.valuation)}</div>
            <div><NumField label="Land Registry" value={deal.fees.landReg} onChange={(v) => setObj("fees", "landReg", v)} />{overrideMark("landRegFee", deal.fees.landReg)}</div>
            <NumField label="Other" value={deal.fees.other} onChange={(v) => setObj("fees", "other", v)} testId="deal-fees-other" />
          </div>
          <SectionTitle>Funding mix</SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <NumField label="Own cash available" value={deal.ownCash} onChange={(v) => set("ownCash", v)} testId="deal-owncash" />
            <div><PctField label="Bridge LTV (% of price)" value={deal.bridgeLTV} onChange={(v) => set("bridgeLTV", v)} />{overrideMark("bridgeLtvPct", deal.bridgeLTV)}</div>
            <div><PctField label="Bridge monthly interest rate" value={deal.bridgeMonthlyRate} onChange={(v) => set("bridgeMonthlyRate", v)} step={0.05} />{overrideMark("bridgeMonthlyRatePct", deal.bridgeMonthlyRate)}</div>
            <div><PctField label="Arrangement fee %" value={deal.arrangementPct} onChange={(v) => set("arrangementPct", v)} />{overrideMark("bridgeArrangementPct", deal.arrangementPct)}</div>
            <div><PctField label="Exit fee %" value={deal.exitPct} onChange={(v) => set("exitPct", v)} />{overrideMark("bridgeExitPct", deal.exitPct)}</div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-mono bg-vx-surface rounded px-3 py-2">
            <span>Funds required: <b>{fmtGBP(base.funding.fundsRequired)}</b></span>
            <span>Bridge drawn: <b>{fmtGBP(base.funding.bridgeDrawn)}</b></span>
            <span className={base.funding.shortfall > 0 ? "text-vx-negative" : "text-vx-positive"}>Shortfall: <b>{fmtGBP(base.funding.shortfall)}</b></span>
            <span>Bridge cost (interest+fees): <b>{fmtGBP(base.bridge.total)}</b></span>
          </div>
          <p className="text-xs text-vx-muted">Bridge interest is calculated on a compound retained basis (interest rolled into the loan each month).</p>
        </Card>
      )}

      {subTab === "Finance" && (
        <FundingPlannerView deal={deal} onChange={onChange} settings={settings} defaultBuyBox={defaultBuyBox} />
      )}

      {subTab === "Progress" && (
        <div className="space-y-4">
          {/* Programme section — key dates, list and Gantt views */}
          <ProgrammeView
            deal={deal}
            ownerUid={ownerUid}
            db={db}
            onProgrammeReady={setProgrammeData}
          />
          {/* Existing project phases & holding costs — unchanged */}
          <Card className="space-y-3">
            <SectionTitle>Project phases (manual timeline)</SectionTitle>
            <div className="space-y-2">
              {deal.phases.map((p, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 items-end">
                  <TextField label={i === 0 ? "Phase" : ""} value={p.name} onChange={(v) => setNested("phases", i, "name", v)} />
                  <NumField label={i === 0 ? "Weeks" : ""} value={p.weeks} onChange={(v) => setNested("phases", i, "weeks", v)} prefix="" />
                </div>
              ))}
            </div>
            <div className="text-sm font-mono bg-vx-surface rounded px-3 py-2 inline-block">Total: <b>{base.timeline.weeks} weeks ≈ {base.timeline.months} months</b></div>
            <SectionTitle>Holding costs (£/month)</SectionTitle>
            <div className="grid md:grid-cols-4 gap-3">
              <NumField label="Council tax (empty/void)" value={deal.holdingBreakdown.ctax} onChange={(v) => setObj("holdingBreakdown", "ctax", v)} />
              <NumField label="Insurance" value={deal.holdingBreakdown.insurance} onChange={(v) => setObj("holdingBreakdown", "insurance", v)} />
              <NumField label="Utilities" value={deal.holdingBreakdown.utilities} onChange={(v) => setObj("holdingBreakdown", "utilities", v)} />
              <NumField label="Other" value={deal.holdingBreakdown.other} onChange={(v) => setObj("holdingBreakdown", "other", v)} />
            </div>
            <div className="text-sm font-mono bg-vx-surface rounded px-3 py-2 inline-block">Total holding cost (excl. bridge): <b>{fmtGBP(base.holding.exBridge)}</b> · incl. bridge: <b>{fmtGBP(base.holding.total)}</b></div>
          </Card>
        </div>
      )}

      {subTab === "Returns" && (
        <Card className="space-y-4">
          <SectionTitle>Selling costs</SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <div><PctField label="Estate agent fee %" value={deal.eaPct} onChange={(v) => set("eaPct", v)} />{overrideMark("eaPct", deal.eaPct)}</div>
            <div><NumField label="Solicitor (sale)" value={deal.solicitorSale} onChange={(v) => set("solicitorSale", v)} />{overrideMark("legalFeesSell", deal.solicitorSale)}</div>
            <div><NumField label="EPC / compliance" value={deal.epc} onChange={(v) => set("epc", v)} />{overrideMark("epcCost", deal.epc)}</div>
          </div>
          <div className="text-sm font-mono bg-vx-surface rounded px-3 py-2 inline-block">Total selling costs: <b>{fmtGBP(base.sellingCosts)}</b></div>

          <SectionTitle>BRR / flip result</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm font-mono">
            <div>GDV<br /><b className="text-base">{fmtGBP(base.gdv)}</b></div>
            <div>Total all-in cost<br /><b className="text-base">{fmtGBP(base.totalCost)}</b></div>
            <div>Net profit<br /><b className={`text-base ${base.netProfit >= 0 ? "text-vx-positive" : "text-vx-negative"}`}>{fmtGBP(base.netProfit)}</b></div>
            <div>Annualised ROI<br /><b className="text-base">{fmtPct(base.annualisedRoi)}</b></div>
          </div>

          <SectionTitle>Buy-to-let hold — alternative exit</SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <NumField label="Estimated monthly rent" value={deal.monthlyRent} onChange={(v) => set("monthlyRent", v)} testId="deal-rent" />
            <div><PctField label="Void allowance %" value={deal.voidPct} onChange={(v) => set("voidPct", v)} />{overrideMark("voidPct", deal.voidPct)}</div>
            <div><PctField label="Management fee %" value={deal.mgmtPct} onChange={(v) => set("mgmtPct", v)} />{overrideMark("managementPct", deal.mgmtPct)}</div>
            <div><PctField label="Maintenance %" value={deal.maintPct} onChange={(v) => set("maintPct", v)} />{overrideMark("maintenancePct", deal.maintPct)}</div>
            <div><NumField label="Landlord insurance (£/yr)" value={deal.llInsurance} onChange={(v) => set("llInsurance", v)} />{overrideMark("llInsuranceAnnual", deal.llInsurance)}</div>
            <div><PctField label="BTL mortgage LTV" value={deal.btlLtv} onChange={(v) => set("btlLtv", v)} />{overrideMark("refiLtvPct", deal.btlLtv)}</div>
            <div><PctField label="BTL mortgage rate" value={deal.btlRate} onChange={(v) => set("btlRate", v)} step={0.1} />{overrideMark("mortgageRatePct", deal.btlRate)}</div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-mono bg-vx-surface rounded px-3 py-2">
            <span>Gross yield: <b>{fmtPct(base.grossYield)}</b></span>
            <span>Net monthly cash flow: <b>{fmtGBP(base.netCashFlowMonthly)}</b></span>
            <span>Cash-on-cash return: <b>{fmtPct(base.cashOnCash)}</b></span>
          </div>

          <SectionTitle icon={KeyRound}>Holding as a rental (BRRR)</SectionTitle>
          {alreadyLinkedProperty ? (
            <div className="flex items-center gap-2 text-sm bg-vx-surface text-vx-accent-strong border border-vx-divider rounded px-3 py-2">
              <CheckCircle2 size={15} />Already moved to rental management as "{alreadyLinkedProperty.address || "this property"}" — manage tenancy, compliance, and rent ledger from the Properties tab.
            </div>
          ) : (
            <>
              <p className="text-sm text-vx-muted">If you're keeping this one rather than selling, move it into post-purchase management — this creates a linked property with compliance tracking, a tenancy record, a rent ledger, and a BRRR refinance-readiness view, and marks this deal as "Let / Held (BRRR)".</p>
              <button data-testid="move-to-rental" onClick={onMoveToRental} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90">
                <KeyRound size={14} />Move to rental management
              </button>
            </>
          )}
        </Card>
      )}

      {subTab === "Returns" && (
        <>
          <AreaIntelligencePanel postcode={deal.postcode} cached={deal.areaIntelligence} onChange={(r) => onChange({ areaIntelligence: r })} epcCached={deal.epcCheck} onEpcChange={(r) => onChange({ epcCheck: r })} marketStats={marketStats} propertyType={deal.propertyType} construction={deal.construction} onConstructionChange={(r) => onChange({ construction: r })} />
          <Card className="space-y-3">
            <SectionTitle>Area risk scoring</SectionTitle>
            <div className="space-y-2">
              {deal.riskFactors.map((f, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 items-center">
                  <span className="col-span-3 text-sm text-vx-text">{f.label}</span>
                  <PctField label="" value={f.weight} onChange={(v) => setNested("riskFactors", i, "weight", v)} />
                  <NumField label="" value={f.score} onChange={(v) => setNested("riskFactors", i, "score", Math.max(1, Math.min(5, v)))} prefix="" step={1} />
                </div>
              ))}
            </div>
            <div className="text-sm font-mono bg-vx-surface rounded px-3 py-2 inline-block">
              Weighted score: <b>{fmtNum(baseVerdict.risk.score)}</b> / 5 — <Badge tone={baseVerdict.risk.rating === "LOW RISK" ? "good" : baseVerdict.risk.rating === "MEDIUM RISK" ? "warn" : "bad"}>{baseVerdict.risk.rating}</Badge>
            </div>
            <SectionTitle>Go / no-go checks</SectionTitle>
            <div className="space-y-1.5">
              {baseVerdict.checks.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-vx-divider last:border-0">
                  <span className="flex items-center gap-2">{c.pass ? <CheckCircle2 size={15} className="text-vx-positive" /> : <XCircle size={15} className="text-vx-negative" />}{c.label}</span>
                  <span className="font-mono text-vx-muted tabular-nums">{c.fmt === "gbp" ? fmtGBP(c.value) : c.fmt === "pct" ? fmtPct(c.value) : c.fmt === "num" ? fmtNum(c.value) : c.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {subTab === "Decision" && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle icon={SlidersHorizontal}>What-if simulation</SectionTitle>
          </div>
          {!sim ? (
            <div className="text-center py-8">
              <p className="text-sm text-vx-muted mb-3">Adjust price, GDV, refurb spend, duration, and bridge rate live — nothing is saved until you apply it.</p>
              <button data-testid="start-sim" onClick={initSim} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90">Start simulation</button>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                <SimSlider testId="sim-price" label="Purchase price" value={sim.price} min={0} max={Math.max(deal.price * 2, 200000)} step={500} onChange={(v) => setSim({ ...sim, price: v })} format={fmtGBP} />
                <SimSlider testId="sim-gdv" label="Estimated GDV / sale price" value={sim.gdvOverride} min={0} max={Math.max(base.gdv * 1.6, 200000)} step={500} onChange={(v) => setSim({ ...sim, gdvOverride: v })} format={fmtGBP} />
                <SimSlider testId="sim-refurb" label="Refurb budget adjustment" value={sim.refurbMult} min={0.5} max={1.5} step={0.05} onChange={(v) => setSim({ ...sim, refurbMult: v })} format={(v) => Math.round(v * 100) + "%"} />
                <SimSlider testId="sim-owncash" label="Own cash committed" value={sim.ownCash} min={0} max={Math.max(deal.ownCash * 2, 100000)} step={500} onChange={(v) => setSim({ ...sim, ownCash: v })} format={fmtGBP} />
                <SimSlider testId="sim-weeks" label="Project duration" value={sim.weeks} min={4} max={80} step={1} onChange={(v) => setSim({ ...sim, weeks: v })} format={(v) => v + " wks"} />
                <SimSlider testId="sim-rate" label="Bridge monthly rate" value={sim.bridgeRate} min={0.002} max={0.02} step={0.0005} onChange={(v) => setSim({ ...sim, bridgeRate: v })} format={(v) => (v * 100).toFixed(2) + "%"} />
              </div>

              <div className="border border-vx-divider rounded overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="bg-vx-surface text-vx-muted text-xs uppercase">
                    <tr><th className="text-left px-3 py-2 font-medium">Metric</th><th className="text-right px-3 py-2 font-medium">Base</th><th className="text-right px-3 py-2 font-medium">Simulated</th><th className="px-2 py-2"></th></tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    <tr className="border-t border-vx-divider"><td className="px-3 py-2">Net profit</td><td className="text-right px-3 py-2">{fmtGBP(base.netProfit)}</td><td data-testid="sim-out-profit" className="text-right px-3 py-2 font-semibold">{fmtGBP(simAppraisal.netProfit)}</td><td className="px-2"><DeltaArrow base={base.netProfit} sim={simAppraisal.netProfit} /></td></tr>
                    <tr className="border-t border-vx-divider"><td className="px-3 py-2">ROI on cash</td><td className="text-right px-3 py-2">{fmtPct(base.roi)}</td><td data-testid="sim-out-roi" className="text-right px-3 py-2 font-semibold">{fmtPct(simAppraisal.roi)}</td><td className="px-2"><DeltaArrow base={base.roi} sim={simAppraisal.roi} /></td></tr>
                    <tr className="border-t border-vx-divider"><td className="px-3 py-2">Annualised ROI</td><td className="text-right px-3 py-2">{fmtPct(base.annualisedRoi)}</td><td data-testid="sim-out-annroi" className="text-right px-3 py-2 font-semibold">{fmtPct(simAppraisal.annualisedRoi)}</td><td className="px-2"><DeltaArrow base={base.annualisedRoi} sim={simAppraisal.annualisedRoi} /></td></tr>
                    <tr className="border-t border-vx-divider"><td className="px-3 py-2">Funding shortfall</td><td className="text-right px-3 py-2">{fmtGBP(base.funding.shortfall)}</td><td className="text-right px-3 py-2 font-semibold">{fmtGBP(simAppraisal.funding.shortfall)}</td><td className="px-2"><DeltaArrow base={base.funding.shortfall} sim={simAppraisal.funding.shortfall} higherIsBetter={false} /></td></tr>
                    <tr className="border-t border-vx-divider"><td className="px-3 py-2">Verdict</td><td className="text-right px-3 py-2"><Badge tone={verdictTone(baseVerdict.verdict)}>{baseVerdict.verdict}</Badge></td><td data-testid="sim-out-verdict" className="text-right px-3 py-2"><Badge tone={verdictTone(simVerdict.verdict)}>{simVerdict.verdict}</Badge></td><td></td></tr>
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button data-testid="apply-sim" onClick={applySim} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90">Apply to deal</button>
                <button onClick={() => setSim(null)} className="flex items-center gap-1 border border-vx-border text-sm font-medium px-4 py-2 rounded hover:bg-vx-surface"><RotateCcw size={14} />Discard</button>
              </div>
            </>
          )}
        </Card>
      )}

      {subTab === "Decision" && <AiReviewPanel deal={deal} metrics={base} />}

      {subTab === "Legal" && (
        <LegalPackSection
          documents={deal.legalPackDocuments}
          onChange={(docs) => onChange({ legalPackDocuments: docs })}
          entityType="deal"
          entityId={deal.id}
          ownerUid={ownerUid}
          onApplyFees={applyLegalPackFeesToDeal}
        />
      )}

      {subTab === "Progress" && (
        <SurveyModule
          deal={deal}
          rates={surveyRates || defaultRates()}
          maxBid={deal.maxBid ?? null}
          onChange={(survey) => onChange({ survey })}
          onRatesChange={onSurveyRatesChange}
          onApply={applySurveyToDeal}
        />
      )}

      {subTab === "Decision" && (
        <DecisionBriefView deal={deal} defaultBuyBox={defaultBuyBox} ownerUid={ownerUid} />
      )}

      {subTab === "Appraisal" && (
        <AppraisalV2Tab deal={deal} onChange={onChange} settings={settings} buyBox={buyBox} programmeData={programmeData} />
      )}

      <Card>
        <SectionTitle>Notes</SectionTitle>
        <textarea value={deal.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className="w-full text-sm border border-vx-border rounded p-2 outline-none focus:ring-2 focus:ring-vx-accent" placeholder="Anything else worth remembering about this deal…" />
      </Card>
    </div>
  );
}

/* =================================================================================
   DECISION BRIEF — one-page BUY / WATCH / PASS recommendation with audit trail.
   Storage: users/{uid}/deals/{dealId}/briefs/{briefId} (input snapshot only).
   PDF via window.print() using @media print CSS in tailwind-input.css.
   ================================================================================= */

function _fmtAuditValue(val) {
  if (val?.unit === "gbp")    return fmtGBP(val.value || 0);
  if (val?.unit === "pct")    return `${((val.value || 0) * 100).toFixed(1)}%`;
  if (val?.unit === "months") return `${val.value || 0} months`;
  if (val?.unit === "ratio")  return (val.value || 0).toFixed(2);
  return String(val?.value ?? "—");
}

const VERDICT_STYLE = {
  BUY:  { header: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-600 text-white", text: "text-emerald-800" },
  WATCH:{ header: "bg-amber-50 border-amber-200",     badge: "bg-amber-500 text-white",   text: "text-amber-800"   },
  PASS: { header: "bg-rose-50 border-rose-200",       badge: "bg-rose-600 text-white",    text: "text-rose-800"    },
};

function BriefStatCell({ label, value, illustrative }) {
  return (
    <div className="bg-vx-surface rounded p-2.5">
      <div className="text-xs text-vx-muted">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${illustrative ? "italic text-vx-muted" : "text-vx-text"}`}>
        {value}{illustrative ? " †" : ""}
      </div>
    </div>
  );
}

function BriefTableRow({ label, value, illustrative }) {
  return (
    <tr className="border-b border-vx-divider last:border-0">
      <td className="py-1.5 text-vx-muted pr-4 text-sm">{label}</td>
      <td className={`py-1.5 text-right text-sm font-medium ${illustrative ? "italic text-vx-muted" : "text-vx-text"}`}>
        {value}{illustrative ? " †" : ""}
      </td>
    </tr>
  );
}

function RiskRatingBadge({ rating }) {
  const cls = { High: "bg-rose-100 text-rose-700", Med: "bg-amber-100 text-amber-700", Low: "bg-emerald-100 text-emerald-700" };
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${cls[rating] || "bg-gray-100 text-gray-600"}`}>{rating}</span>;
}

function BriefPreview({ brief, deal }) {
  const [showAudit, setShowAudit] = useState(false);
  const vc = VERDICT_STYLE[brief.verdict] || VERDICT_STYLE.WATCH;
  const hasIllustrative = brief.openQuestions.some(q => q.isIllustrative) ||
    Object.values(brief.stats).some(v => v?.isIllustrative);

  return (
    <div id="brief-print-root" className="bg-vx-bg rounded-lg border border-vx-divider overflow-hidden">

      {/* 1. Header */}
      <div className={`${vc.header} border-b px-6 py-4`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-vx-muted font-medium">VIXIV LTD — Decision Brief</div>
            <h2 className="text-lg font-bold text-vx-text mt-0.5">{deal.address || deal.name || "Unnamed deal"}</h2>
            <div className="text-xs text-vx-muted mt-1">
              {new Date(brief.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              {" · "}v{brief.version}
            </div>
          </div>
          <div className={`${vc.badge} text-2xl font-black px-6 py-2 rounded-lg leading-tight`}>{brief.verdict}</div>
        </div>
        {brief.reasons.length > 0 && (
          <div className="mt-3 space-y-1">
            {brief.reasons.map((r, i) => (
              <div key={i} className={`text-sm ${vc.text} flex items-center gap-1.5`}>
                <span className="font-bold select-none">—</span>{r}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-4 space-y-5 text-sm">

        {/* 2. Headline numbers */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vx-muted mb-2">Headline numbers</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <BriefStatCell label="Purchase price"    value={_fmtAuditValue(brief.stats.price)}         illustrative={brief.stats.price.isIllustrative} />
            <BriefStatCell label="GDV"               value={_fmtAuditValue(brief.stats.gdv)}           illustrative={brief.stats.gdv.isIllustrative} />
            <BriefStatCell label="Net profit"        value={_fmtAuditValue(brief.stats.netProfit)}     illustrative={brief.stats.netProfit.isIllustrative} />
            <BriefStatCell label="Profit on cost"    value={_fmtAuditValue(brief.stats.profitOnCost)}  illustrative={brief.stats.profitOnCost.isIllustrative} />
            <BriefStatCell label="Total cost"        value={_fmtAuditValue(brief.stats.totalCost)}     illustrative={brief.stats.totalCost.isIllustrative} />
            <BriefStatCell label="Cash in"           value={_fmtAuditValue(brief.stats.cashIn)}        illustrative={brief.stats.cashIn.isIllustrative} />
            <BriefStatCell label="Cash left in (BRRR)" value={brief.stats.cashLeftIn.value > 0 ? _fmtAuditValue(brief.stats.cashLeftIn) : "—"} illustrative={brief.stats.cashLeftIn.isIllustrative} />
            <BriefStatCell label="Timeline"          value={_fmtAuditValue(brief.stats.timelineMonths)} illustrative={brief.stats.timelineMonths.isIllustrative} />
          </div>
        </section>

        {/* 3. Valuation */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vx-muted mb-2">Valuation</h3>
          <table className="w-full border-collapse">
            <tbody>
              <BriefTableRow label="Guide / asking" value={_fmtAuditValue(brief.valuation.guidePrice)} illustrative={brief.valuation.guidePrice.isIllustrative} />
              <BriefTableRow label="Recommended bid" value={brief.valuation.maxBidSafe?.value ? _fmtAuditValue(brief.valuation.maxBidSafe) : (brief.valuation.maxBid.value ? _fmtAuditValue(brief.valuation.maxBid) : "Not solved †")} illustrative={!brief.valuation.maxBid.value} />
              <BriefTableRow label="Ceiling (before buffer)" value={brief.valuation.maxBid.value ? _fmtAuditValue(brief.valuation.maxBid) : "—"} illustrative={!brief.valuation.maxBid.value} />
              <BriefTableRow label="GDV" value={_fmtAuditValue(brief.valuation.gdv)} illustrative={brief.valuation.gdv.isIllustrative} />
              <BriefTableRow
                label="Comparables"
                value={brief.valuation.compsCount > 0
                  ? `${brief.valuation.compsCount} comp${brief.valuation.compsCount > 1 ? "s" : ""}${brief.valuation.compsDateRange ? ` · ${brief.valuation.compsDateRange.from}–${brief.valuation.compsDateRange.to}` : ""}`
                  : "None entered †"}
                illustrative={brief.valuation.compsCount === 0}
              />
            </tbody>
          </table>
        </section>

        {/* 4. Funding */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vx-muted mb-2">
            Funding <span className="normal-case font-normal">({brief.funding.mode})</span>
          </h3>
          {brief.funding.icr ? (
            <div className="flex items-center gap-2">
              <span className="text-vx-muted">ICR:</span>
              <span className={`font-semibold ${brief.funding.icrPass ? "text-emerald-700" : "text-rose-700"}`}>
                {brief.funding.icr.value?.toFixed(2) ?? "—"}
              </span>
              <span className="text-vx-muted text-xs">{brief.funding.icrPass ? "✓ passes threshold" : "✗ fails threshold"}</span>
            </div>
          ) : (
            <p className="text-vx-muted text-xs">ICR not applicable — no rental income entered, or cash purchase.</p>
          )}
        </section>

        {/* 5. Risk register */}
        {brief.riskRegister.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-vx-muted mb-2">Risk register</h3>
            <div className="space-y-2">
              {brief.riskRegister.map((r, i) => (
                <div key={i} className="flex items-start gap-2 border-b border-vx-divider last:border-0 pb-2">
                  <RiskRatingBadge rating={r.rating} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-vx-text">{r.risk}</div>
                    <div className="text-vx-muted text-xs">{r.detail}</div>
                    <div className="text-xs text-vx-muted mt-0.5"><span className="font-medium">Mitigation:</span> {r.mitigation}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. Open questions */}
        {brief.openQuestions.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-vx-muted mb-2">Open questions</h3>
            <ul className="space-y-1.5">
              {brief.openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  {q.isIllustrative && <span className="text-amber-500 font-bold shrink-0 mt-0.5" title="Illustrative — unverified figure">†</span>}
                  <span className="text-vx-text text-sm">{q.question}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 7. Footer */}
        <footer className="border-t border-vx-divider pt-3 space-y-1">
          <p className="text-xs text-vx-muted">Illustrative analysis for internal decision-making only. Not financial or legal advice. Verify all figures independently before committing to any transaction.</p>
          {hasIllustrative && <p className="text-xs text-vx-muted">† Illustrative figure — unverified or estimated; do not rely on without verification.</p>}
        </footer>

        {/* Audit appendix (print-hidden, expand on demand) */}
        <div className="no-print">
          <button
            onClick={() => setShowAudit(a => !a)}
            className="text-xs text-vx-accent hover:underline flex items-center gap-1"
          >
            <ChevronRight size={12} className={`transition-transform duration-150 ${showAudit ? "rotate-90" : ""}`} />
            {showAudit ? "Hide" : "Show"} audit appendix
          </button>
          {showAudit && (
            <div className="mt-2 border border-vx-divider rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-vx-surface">
                  <tr>
                    <th className="text-left px-3 py-2 text-vx-muted font-medium">Figure</th>
                    <th className="text-right px-3 py-2 text-vx-muted font-medium">Value</th>
                    <th className="text-left px-3 py-2 text-vx-muted font-medium">Source</th>
                    <th className="text-left px-3 py-2 text-vx-muted font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(brief.stats).map(([k, v]) => (
                    <tr key={k} className="border-b border-vx-divider last:border-0">
                      <td className="px-3 py-1.5 text-vx-text capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-vx-muted">{_fmtAuditValue(v)}{v?.isIllustrative ? " †" : ""}</td>
                      <td className="px-3 py-1.5 text-vx-muted">{v?.source || "—"}</td>
                      <td className="px-3 py-1.5 text-vx-muted">{v?.sourceRef || "—"}</td>
                    </tr>
                  ))}
                  {brief.funding.icr && (
                    <tr className="border-b border-vx-divider last:border-0">
                      <td className="px-3 py-1.5 text-vx-text">ICR</td>
                      <td className="px-3 py-1.5 text-right font-mono text-vx-muted">{_fmtAuditValue(brief.funding.icr)}</td>
                      <td className="px-3 py-1.5 text-vx-muted">{brief.funding.icr.source}</td>
                      <td className="px-3 py-1.5 text-vx-muted">{brief.funding.icr.sourceRef}</td>
                    </tr>
                  )}
                  {[
                    ["Guide price",           brief.valuation.guidePrice],
                    ["Recommended bid",       brief.valuation.maxBidSafe],
                    ["Ceiling (max bid)",     brief.valuation.maxBid],
                    ["GDV (valuation)",       brief.valuation.gdv],
                  ].map(([label, v]) => v ? (
                    <tr key={label} className="border-b border-vx-divider last:border-0">
                      <td className="px-3 py-1.5 text-vx-text">{label}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-vx-muted">{_fmtAuditValue(v)}{v?.isIllustrative ? " †" : ""}</td>
                      <td className="px-3 py-1.5 text-vx-muted">{v?.source || "—"}</td>
                      <td className="px-3 py-1.5 text-vx-muted">{v?.sourceRef || "—"}</td>
                    </tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionBriefView({ deal, defaultBuyBox, ownerUid }) {
  const [briefs, setBriefs] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!ownerUid || !deal.id) return;
    const colRef = repo.briefsColRef(db, ownerUid, deal.id);
    const unsub = onSnapshot(colRef, snap => {
      const loaded = snap.docs.map(d => d.data()).sort((a, b) => b.generatedAt - a.generatedAt);
      setBriefs(loaded);
      if (!selectedId && loaded.length > 0) setSelectedId(loaded[0].id);
    });
    return unsub;
  }, [ownerUid, deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const enriched     = enrichDeal(deal);
      const appraisal    = appraiseDeal(enriched);
      const timeline     = calcTimeline(deal.phases);
      const refurb       = calcRefurbTotal(deal.refurbItems, deal.contingencyPct);
      const feesTotal    = sumFees(deal.fees);
      const gdv          = calcGDV(enriched);
      const holdingCosts = enriched.holdingMonthly * timeline.months;

      const bbA          = defaultBuyBox?.assumptions || {};
      const icrStressRate = bbA.icrStressRatePct?.value ?? 0.055;
      const icrThreshold  = bbA.icrThresholdPct?.value  ?? 1.25;

      const bridgeResult = calcFundingModeBridge({
        price: deal.price, additionalProperty: deal.additionalProperty !== false,
        feesTotal, refurbTotal: refurb.total, holdingCosts,
        bridgeLtvPct: deal.bridgeLTV, bridgeLoanBasis: deal.bridgeLoanBasis || "purchase", valuationOverride: 0,
        monthlyRate: deal.bridgeMonthlyRate, termMonths: timeline.months,
        arrangementPct: deal.arrangementPct, exitPct: deal.exitPct,
        interestMode: deal.interestMode || "retained",
        eaPct: deal.eaPct, solicitorSale: deal.solicitorSale, epc: deal.epc,
        gdv, refiLtvPct: deal.btlLtv, mortgageProductFeePct: deal.btlProductFeePct ?? 0.01,
      });

      const icrLoan   = bridgeResult?.brrr?.refiLoan?.value || 0;
      const annualRent = (Number(deal.monthlyRent) || 0) * 12;
      const icrResult  = calcIcr(annualRent, icrLoan, icrStressRate, icrThreshold);

      const buyBoxFilters = defaultBuyBox?.filters;
      const buyBoxGate    = buyBoxFilters
        ? applyDeterministicGate({ ...deal, guidePrice: deal.price }, buyBoxFilters)
        : null;

      const snapshot = buildBriefSnapshot({
        deal,
        appraisal,
        icrResult: (icrLoan > 0 && annualRent > 0) ? icrResult : null,
        fundingBrrr: bridgeResult?.brrr || null,
        triage: null,
        buyBox: defaultBuyBox,
        buyBoxGate,
        version: briefs.length + 1,
      });
      snapshot.id = uid();

      repo.saveBrief(db, ownerUid, deal.id, snapshot)
        .then(() => setSelectedId(snapshot.id))
        .catch(e => setGenError(e.message || "Failed to save brief"))
        .finally(() => setGenerating(false));
    } catch (e) {
      setGenError(e.message || "Failed to generate brief");
      setGenerating(false);
    }
  }

  const selectedBrief = briefs.find(b => b.id === selectedId);
  const verdictColors = { BUY: "text-emerald-700 bg-emerald-50", WATCH: "text-amber-700 bg-amber-50", PASS: "text-rose-700 bg-rose-50" };

  return (
    <div className="space-y-4">

      {/* Controls bar */}
      <Card className="no-print">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <SectionTitle icon={FileText}>Decision Brief</SectionTitle>
            <p className="text-xs text-vx-muted mt-1">
              BUY / WATCH / PASS recommendation with full audit trail. Each generation saves a versioned snapshot.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {selectedBrief && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 border border-vx-border text-sm px-3 py-2 rounded hover:bg-vx-surface"
              >
                <FileDown size={14} />Download PDF
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 bg-vx-accent text-white text-sm px-4 py-2 rounded hover:bg-vx-accent-strong disabled:opacity-50"
            >
              <Sparkles size={14} />{generating ? "Generating…" : "Generate brief"}
            </button>
          </div>
        </div>
        {genError && (
          <div className="mt-2 text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-3 py-2">{genError}</div>
        )}
      </Card>

      {/* Brief history */}
      {briefs.length > 1 && (
        <Card className="no-print">
          <div className="text-xs text-vx-muted mb-2 font-medium">Brief history</div>
          <div className="flex flex-wrap gap-2">
            {briefs.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`text-xs px-2.5 py-1.5 rounded border flex items-center gap-1.5 ${selectedId === b.id ? "border-vx-accent" : "border-vx-divider text-vx-muted hover:border-vx-border"}`}
              >
                v{b.version}
                <span className="text-vx-muted">{new Date(b.generatedAt).toLocaleDateString()}</span>
                <span className={`font-bold text-xs px-1 rounded ${verdictColors[b.verdict] || ""}`}>{b.verdict}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Preview */}
      {selectedBrief
        ? <BriefPreview brief={selectedBrief} deal={deal} />
        : (
          <Card>
            <div className="text-sm text-vx-muted py-10 text-center">
              No brief generated yet. Click "Generate brief" to create one.
            </div>
          </Card>
        )
      }
    </div>
  );
}

function AiReviewPanel({ deal, metrics }) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);

  async function runReview() {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functionsInstance, "reviewDeal");
      const res = await fn({ deal, metrics });
      setReview(res.data.review);
    } catch (e) {
      const code = e && e.code;
      if (code === "functions/permission-denied") setError("This account isn't authorized to use AI review.");
      else if (code === "functions/unavailable") setError("Couldn't reach the AI review service — check your connection and try again.");
      else setError((e && e.message) || "Something went wrong generating the review.");
    }
    setLoading(false);
  }

  return (
    <Card className="space-y-3">
      <SectionTitle icon={Sparkles}>AI review</SectionTitle>
      <p className="text-sm text-vx-muted">
        Asks Claude to sanity-check your comps and assumptions, and draft a short summary you could send to a JV partner or lender.
      </p>
      <button
        data-testid="run-ai-review"
        onClick={runReview}
        disabled={loading}
        className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90 disabled:opacity-60"
      >
        <Sparkles size={14} />
        {loading ? "Reviewing…" : review ? "Run again" : "Get AI review"}
      </button>
      {error && (
        <div data-testid="ai-review-error" className="flex items-center gap-2 bg-rose-50 text-vx-negative border border-rose-200 rounded px-3 py-2 text-sm">
          <AlertTriangle size={15} />{error}
        </div>
      )}
      {review && (
        <div data-testid="ai-review-output" className="text-sm text-vx-text whitespace-pre-wrap bg-vx-surface border border-vx-divider rounded p-3 leading-relaxed">
          {review}
        </div>
      )}
    </Card>
  );
}

/* =================================================================================
   SETTINGS VIEW
   ================================================================================= */

function SettingsView({ settings, onSettingsChange }) {
  const appr = settings?.appraisal || DEFAULT_APPRAISAL_SETTINGS;
  function setAppr(patch) {
    onSettingsChange({ ...settings, appraisal: { ...appr, ...patch } });
  }
  function setReserves(patch) {
    setAppr({ reserves: { ...(appr.reserves || {}), ...patch } });
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">Settings</h1>
        <p className="text-sm text-vx-muted mt-1">Global defaults for appraisal calculations. All values tagged Illustrative — verify against your lender terms before bidding. Each can be overridden per-deal in the Appraisal v2 tab.</p>
      </div>

      <Card>
        <SectionTitle icon={SlidersHorizontal}>Appraisal defaults</SectionTitle>
        <div className="grid md:grid-cols-2 gap-3 mt-2">
          <PctField label="Flip profit target %" value={appr.profitPctDefault} onChange={(v) => setAppr({ profitPctDefault: v })} step={0.5} />
          <NumField label="BRRR: accepted cash left in (£)" value={appr.acceptedLeftInDefault} onChange={(v) => setAppr({ acceptedLeftInDefault: v })} />
          <NumField label="ICR threshold (ratio, e.g. 1.25)" value={appr.icr} onChange={(v) => setAppr({ icr: v })} step={0.05} />
          <PctField label="ICR stress rate %" value={appr.icrStressRate} onChange={(v) => setAppr({ icrStressRate: v })} step={0.1} />
          <NumField label="Min net monthly cash flow (£)" value={appr.minNetMonthly} onChange={(v) => setAppr({ minNetMonthly: v })} />
          <PctField label="Min break-even headroom %" value={appr.minHeadroomPct} onChange={(v) => setAppr({ minHeadroomPct: v })} step={0.5} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Rental reserves (% of monthly rent)</SectionTitle>
        <div className="grid md:grid-cols-3 gap-3 mt-2">
          <PctField label="Void allowance %" value={appr.reserves?.voids} onChange={(v) => setReserves({ voids: v })} />
          <PctField label="Management fee %" value={appr.reserves?.mgmt} onChange={(v) => setReserves({ mgmt: v })} />
          <PctField label="Maintenance %" value={appr.reserves?.maint} onChange={(v) => setReserves({ maint: v })} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Sourcing</SectionTitle>
        <div className="max-w-xs mt-2">
          <NumField label="Monthly viewing target" value={appr.viewingTargetPerMonth ?? 20} onChange={(v) => setAppr({ viewingTargetPerMonth: v })} prefix="" />
        </div>
      </Card>

      <div className="text-xs text-vx-muted border border-vx-divider rounded p-3 space-y-1">
        <p><strong>Monthly burn rate &amp; revolving fund</strong> — in <strong>Capital &amp; cash</strong>.</p>
        <p><strong>Strategy profile, buy boxes &amp; per-deal assumption overrides</strong> — in <strong>Playbooks</strong>.</p>
      </div>
    </div>
  );
}

function CapitalCashFlowView({ ledger, setLedger, settings, setSettings, deals, onResetAll }) {
  const [form, setForm] = useState({ date: "", source: "", amount: 0, direction: "in" });
  const summary = useMemo(() => portfolioSummary(deals, ledger, settings), [deals, ledger, settings]);

  function addEntry() {
    if (!form.amount) return;
    setLedger([...ledger, { id: uid(), ...form }]);
    setForm({ date: "", source: "", amount: 0, direction: "in" });
  }
  function deleteEntry(id) { setLedger(ledger.filter((e) => e.id !== id)); }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">Capital &amp; cash flow</h1>
        <p className="text-sm text-vx-muted mt-1">Track money into and out of the business, and your monthly overheads.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Capital contributed" value={fmtGBP(summary.capitalContributed)} />
        <KPI label="Realized profit (sold deals)" value={fmtGBP(summary.realizedProfit)} tone="good" />
        <KPI label="Committed to active deals" value={fmtGBP(summary.committedCash)} />
        <KPI label="Free cash" value={fmtGBP(summary.freeCash)} tone={summary.freeCash < 0 ? "bad" : "default"} />
      </div>

      <Card>
        <SectionTitle icon={Wallet}>Monthly overheads / personal drawings</SectionTitle>
        <div className="max-w-xs">
          <NumField label="Monthly burn rate (£)" value={settings.monthlyBurn} onChange={(v) => setSettings({ ...settings, monthlyBurn: v })} testId="monthly-burn" />
        </div>
        <p className="text-xs text-vx-muted mt-2">Used to compute your cash runway on the Dashboard — how many months your free cash covers at this burn rate.</p>
      </Card>

      <Card>
        <SectionTitle icon={Banknote}>VIXIV revolving lender fund</SectionTitle>
        <div className="grid md:grid-cols-2 gap-3 max-w-sm">
          <NumField label="Fund size (£)" value={settings.lenderFundSize ?? 50000} onChange={(v) => setSettings({ ...settings, lenderFundSize: v })} testId="lender-fund-size" />
          <PctField label="Annual rate %" value={settings.lenderFundRatePct ?? 0.08} onChange={(v) => setSettings({ ...settings, lenderFundRatePct: v })} step={0.5} testId="lender-fund-rate" />
        </div>
        <p className="text-xs text-vx-muted mt-2">Used in the Funding Planner on each deal to calculate the cost of drawing from the revolving fund (allocation × rate × days ÷ 365).</p>
      </Card>

      <Card>
        <SectionTitle>Capital ledger</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end mb-3">
          <TextField label="Date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} placeholder="YYYY-MM-DD" />
          <TextField label="Source / description" value={form.source} onChange={(v) => setForm({ ...form, source: v })} placeholder="e.g. Own savings" />
          <NumField label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} testId="ledger-amount" />
          <SelectField label="Direction" value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={["in", "out"]} />
          <button data-testid="add-ledger-entry" onClick={addEntry} className="flex items-center justify-center gap-1 bg-navy text-white text-sm font-medium px-3 py-2 rounded hover:bg-navy/90"><Plus size={16} />Add</button>
        </div>
        {ledger.length === 0 ? <div className="text-sm text-vx-muted">No entries yet — log your starting capital to begin.</div> : (
          <div className="divide-y divide-stone-100">
            {ledger.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                <div><span className="text-vx-text">{e.source || "—"}</span> <span className="text-vx-muted text-xs">{e.date}</span></div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono tabular-nums ${e.direction === "in" ? "text-vx-positive" : "text-vx-negative"}`}>{e.direction === "in" ? "+" : "-"}{fmtGBP(e.amount)}</span>
                  <button onClick={() => deleteEntry(e.id)} className="text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-rose-200">
        <SectionTitle icon={AlertTriangle} tone="rose">Danger zone</SectionTitle>
        <p className="text-xs text-vx-muted mb-3">Clears every deal, lead, contact, property, and ledger entry. Buy boxes and strategy settings are kept. Cannot be undone.</p>
        <button data-testid="reset-all" onClick={onResetAll} className="text-sm font-medium text-vx-negative border border-rose-300 px-3 py-1.5 rounded hover:bg-rose-50">Clear all data</button>
      </Card>
    </div>
  );
}

/* =================================================================================
   PLAYBOOKS — BUY BOX MANAGER
   ================================================================================= */

const ASSUMPTION_GROUPS = [
  { label: "Acquisition fees",  keys: ["legalFeesBuy","searchesFee","surveyFee","brokerFee","valuationFee","landRegFee"] },
  { label: "Bridging",          keys: ["bridgeLtvPct","bridgeMonthlyRatePct","bridgeArrangementPct","bridgeExitPct","bridgeTermMonths"] },
  { label: "Refurb",            keys: ["refurbContingencyPct","worksMonths","marketingMonths"] },
  { label: "Selling",           keys: ["eaPct","legalFeesSell","epcCost"] },
  { label: "BTL / BRRR",        keys: ["voidPct","managementPct","maintenancePct","llInsuranceAnnual","refiLtvPct","mortgageRatePct","mortgageProductFeePct","icrStressRatePct","icrThresholdPct"] },
];

const THRESHOLD_KEYS = ["targetProfitMinGBP","targetProfitOnCostPct","targetNetYieldPct","minRoi","minAnnualRoi","minRiskScore","maxMoneyLeftInGBP"];

const ASSUMPTION_LABELS = {
  legalFeesBuy: "Legal fees (purchase)", searchesFee: "Search fees", surveyFee: "Survey fee",
  brokerFee: "Broker fee", valuationFee: "Lender valuation", landRegFee: "Land Registry fee",
  bridgeLtvPct: "Bridge LTV %", bridgeMonthlyRatePct: "Bridge monthly rate %",
  bridgeArrangementPct: "Arrangement fee %", bridgeExitPct: "Exit fee %", bridgeTermMonths: "Bridge term (months)",
  refurbContingencyPct: "Refurb contingency %", worksMonths: "Works duration (months)", marketingMonths: "Marketing period (months)",
  eaPct: "Estate agent fee %", legalFeesSell: "Legal fees (sale)", epcCost: "EPC / compliance £",
  voidPct: "Void allowance %", managementPct: "Management fee %", maintenancePct: "Maintenance %",
  llInsuranceAnnual: "Landlord insurance (£/yr)", refiLtvPct: "Refinance LTV %", mortgageRatePct: "Mortgage rate %",
  mortgageProductFeePct: "Mortgage product fee % (placeholder)", icrStressRatePct: "ICR stress rate % (placeholder)",
  icrThresholdPct: "ICR threshold ratio (placeholder)",
  targetProfitMinGBP: "Min net profit (£)", targetProfitOnCostPct: "Min profit % of GDV",
  targetNetYieldPct: "Target net yield % (BRRR)", minRoi: "Min ROI on cash %",
  minAnnualRoi: "Min annualised ROI %", minRiskScore: "Min area risk score", maxMoneyLeftInGBP: "Max cash left in deal (£)",
};

function AssumptionRow({ assumptionKey, assObj, onUpdate }) {
  if (!assObj) return null;
  const isGbp = assObj.unit === "£" || assObj.unit === "£/yr";
  const isPct = assObj.unit.includes("%");
  return (
    <div className="py-2 border-b border-vx-divider last:border-0 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-sm text-vx-text">{ASSUMPTION_LABELS[assumptionKey] || assumptionKey}</span>
        <div className="w-24 shrink-0">
          {isGbp
            ? <NumField label="" value={assObj.value} onChange={v => onUpdate({ ...assObj, value: v })} />
            : <NumField label="" value={assObj.value} onChange={v => onUpdate({ ...assObj, value: v })} prefix="" step={isPct ? 0.01 : 0.1} />
          }
        </div>
        <span className="text-xs text-vx-muted shrink-0 w-6">{assObj.unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={assObj.source || ""}
          onChange={e => onUpdate({ ...assObj, source: e.target.value })}
          placeholder="Source / notes"
          className="flex-1 min-w-0 text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent"
        />
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {assObj.isIllustrative ? (
            <button onClick={() => onUpdate({ ...assObj, isIllustrative: false, lastVerified: Date.now() })}
              className="text-xs text-vx-accent hover:underline whitespace-nowrap">Mark verified</button>
          ) : (
            <span className="text-xs text-vx-positive flex items-center gap-1 whitespace-nowrap">
              <CheckCircle2 size={11} />
              {assObj.lastVerified ? new Date(assObj.lastVerified).toLocaleDateString("en-GB") : "Verified"}
            </span>
          )}
          {assObj.isIllustrative && <Badge tone="warn">illustrative</Badge>}
        </div>
      </div>
    </div>
  );
}

function BuyBoxFiltersEditor({ box, onUpdate }) {
  function setFilter(field, value) {
    onUpdate({ ...box, filters: { ...box.filters, [field]: value }, updatedAt: Date.now() });
  }
  function toggleList(field, value) {
    const list = box.filters[field] || [];
    setFilter(field, list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  }
  function addTag(field, value) {
    const v = value.trim().toUpperCase();
    if (!v) return;
    const list = box.filters[field] || [];
    if (!list.includes(v)) setFilter(field, [...list, v]);
  }
  function removeTag(field, value) { setFilter(field, (box.filters[field] || []).filter(v => v !== value)); }

  return (
    <Card className="space-y-4">
      <SectionTitle>Filters</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <StrategyTagField label="Postcode areas (e.g. OL, M, SK)" values={box.filters.postcodeAreas || []} onAdd={v => addTag("postcodeAreas", v)} onRemove={v => removeTag("postcodeAreas", v)} />
        <StrategyTagField label="Postcode districts — finer grain (e.g. OL16)" values={box.filters.postcodeDistricts || []} onAdd={v => addTag("postcodeDistricts", v)} onRemove={v => removeTag("postcodeDistricts", v)} />
      </div>
      <ChipMultiSelect label="Property types" options={PROPERTY_TYPE_OPTIONS} selected={box.filters.propertyTypes || []} onToggle={v => toggleList("propertyTypes", v)} />
      <ChipMultiSelect label="Tenure" options={["freehold", "leasehold"]} selected={box.filters.tenure || []} onToggle={v => toggleList("tenure", v)} />
      <div className="grid md:grid-cols-3 gap-3">
        <SelectField label="Condition preference" value={box.filters.conditionPref || "any"} onChange={v => setFilter("conditionPref", v)} options={["needs_work","any","finished"]} />
        <NumField label="Min price (£)" value={box.filters.priceMin || 0} onChange={v => setFilter("priceMin", v)} />
        <NumField label="Max price (£)" value={box.filters.priceMax || 0} onChange={v => setFilter("priceMax", v)} />
        <NumField label="Min bedrooms" value={box.filters.bedroomsMin || 0} onChange={v => setFilter("bedroomsMin", v)} prefix="" />
        <NumField label="Min lease years" value={box.filters.leaseYearsMin || 90} onChange={v => setFilter("leaseYearsMin", v)} prefix="" />
      </div>
    </Card>
  );
}

function BuyBoxAssumptionsEditor({ box, onUpdate }) {
  function updateAssumption(key, updated) {
    onUpdate({ ...box, assumptions: { ...box.assumptions, [key]: updated }, updatedAt: Date.now() });
  }
  return (
    <Card>
      <SectionTitle>Assumptions</SectionTitle>
      <p className="text-xs text-vx-muted mb-3">These flow into every new deal created from this buy box. Mark each verified when you've confirmed the figure with a broker, agent, or solicitor.</p>
      {ASSUMPTION_GROUPS.map(group => (
        <div key={group.label} className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-vx-muted mb-1">{group.label}</div>
          {group.keys.map(k => (
            <AssumptionRow key={k} assumptionKey={k} assObj={box.assumptions?.[k]} onUpdate={updated => updateAssumption(k, updated)} />
          ))}
        </div>
      ))}
    </Card>
  );
}

function BuyBoxThresholdsEditor({ box, onUpdate }) {
  function updateAssumption(key, updated) {
    onUpdate({ ...box, assumptions: { ...box.assumptions, [key]: updated }, updatedAt: Date.now() });
  }
  return (
    <Card>
      <SectionTitle>Decision thresholds</SectionTitle>
      <p className="text-xs text-vx-muted mb-3">Applied automatically to every deal verdict. These replace the old go/no-go settings.</p>
      {THRESHOLD_KEYS.map(k => (
        <AssumptionRow key={k} assumptionKey={k} assObj={box.assumptions?.[k]} onUpdate={updated => updateAssumption(k, updated)} />
      ))}
    </Card>
  );
}

function PlaybooksView({ buyBoxes, onBuyBoxesChange, onBuyBoxFiltersChange, leads, deals }) {
  const [selectedId, setSelectedId] = useState(() => buyBoxes[0]?.id || null);
  const [activeSection, setActiveSection] = useState("filters");

  const selectedBox = buyBoxes.find(b => b.id === selectedId) || null;

  function createNew() {
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "bb-" + Date.now();
    const box = {
      id, name: "New buy box", strategy: "hybrid", isDefault: false,
      filters: { postcodeAreas: [], postcodeDistricts: [], propertyTypes: [], tenure: [], conditionPref: "any", priceMin: 0, priceMax: 0, bedroomsMin: 0, leaseYearsMin: 90, epcMin: null, excludeArticle4: false, maxFloodZone: 1 },
      assumptions: {},
      updatedAt: Date.now(),
    };
    onBuyBoxesChange([...buyBoxes, box]);
    setSelectedId(id);
  }

  function duplicate(box) {
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "bb-" + Date.now();
    const copy = { ...box, id, name: box.name + " (copy)", isDefault: false, updatedAt: Date.now() };
    onBuyBoxesChange([...buyBoxes, copy]);
    setSelectedId(id);
  }

  function remove(id) {
    if (!window.confirm("Delete this buy box?")) return;
    onBuyBoxesChange(buyBoxes.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(buyBoxes.find(b => b.id !== id)?.id || null);
  }

  function setDefault(id) {
    onBuyBoxesChange(buyBoxes.map(b => ({ ...b, isDefault: b.id === id })));
  }

  function updateBox(updatedBox) {
    if (activeSection === "filters") {
      onBuyBoxFiltersChange(updatedBox);
    } else {
      onBuyBoxesChange(buyBoxes.map(b => b.id === updatedBox.id ? updatedBox : b));
    }
  }

  const matchCount = useMemo(() => {
    if (!selectedBox) return { leads: 0, deals: 0 };
    const f = selectedBox.filters || {};
    const passes = item => {
      const g = applyDeterministicGate(item, f);
      return g.areaKnown !== false && g.assetTypeFits !== false && g.guideSensible !== false;
    };
    return { leads: leads.filter(passes).length, deals: deals.filter(passes).length };
  }, [selectedBox, leads, deals]);

  const unverifiedCount = selectedBox
    ? Object.values(selectedBox.assumptions || {}).filter(a => a.isIllustrative).length
    : 0;

  const sections = ["filters", "assumptions", "thresholds"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-vx-text">Playbooks</h1>
          <p className="text-sm text-vx-muted mt-1">Buy boxes bundle filters, assumption defaults and decision thresholds — set once, flow into every appraisal.</p>
        </div>
        <button onClick={createNew} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded hover:bg-navy/90">
          <Plus size={16} />New buy box
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {buyBoxes.length === 0 && (
            <Card className="text-center py-8 text-sm text-vx-muted">No buy boxes yet.</Card>
          )}
          {buyBoxes.map(box => (
            <Card key={box.id} className={`${selectedId === box.id ? "border-vx-accent" : ""} transition-colors`}>
              <button onClick={() => setSelectedId(box.id)} className="w-full text-left mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-serif font-semibold text-vx-text text-sm">{box.name}</span>
                  {box.isDefault && <Badge tone="info">Default</Badge>}
                  <Badge>{box.strategy}</Badge>
                </div>
                {box.updatedAt && <div className="text-xs text-vx-muted mt-0.5">Updated {new Date(box.updatedAt).toLocaleDateString("en-GB")}</div>}
              </button>
              <div className="flex items-center gap-3 flex-wrap">
                {!box.isDefault && <button onClick={() => setDefault(box.id)} className="text-xs text-vx-accent hover:underline">Set default</button>}
                <button onClick={() => duplicate(box)} className="text-xs text-vx-muted hover:underline">Duplicate</button>
                {!box.isDefault && <button onClick={() => remove(box.id)} className="text-xs text-vx-negative hover:underline">Delete</button>}
              </div>
            </Card>
          ))}
        </div>

        {selectedBox ? (
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <div className="grid md:grid-cols-2 gap-3">
                <TextField label="Name" value={selectedBox.name} onChange={v => updateBox({ ...selectedBox, name: v, updatedAt: Date.now() })} />
                <SelectField label="Strategy" value={selectedBox.strategy || "hybrid"} onChange={v => updateBox({ ...selectedBox, strategy: v, updatedAt: Date.now() })} options={["flip","brrr","hybrid"]} />
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-sm text-vx-muted">Matches: <b>{matchCount.leads}</b> lead{matchCount.leads !== 1 ? "s" : ""}, <b>{matchCount.deals}</b> deal{matchCount.deals !== 1 ? "s" : ""}</span>
                {unverifiedCount > 0 && <Badge tone="warn">{unverifiedCount} assumption{unverifiedCount !== 1 ? "s" : ""} unverified</Badge>}
              </div>
            </Card>

            <div className="flex gap-2">
              {sections.map(s => (
                <button key={s} onClick={() => setActiveSection(s)}
                  className={`px-3 py-1.5 text-sm font-medium rounded capitalize ${activeSection === s ? "bg-navy text-white" : "border border-vx-border hover:bg-vx-surface"}`}>
                  {s}
                </button>
              ))}
            </div>

            {activeSection === "filters"     && <BuyBoxFiltersEditor     box={selectedBox} onUpdate={updateBox} />}
            {activeSection === "assumptions" && <BuyBoxAssumptionsEditor box={selectedBox} onUpdate={box => onBuyBoxesChange(buyBoxes.map(b => b.id === box.id ? box : b))} />}
            {activeSection === "thresholds"  && <BuyBoxThresholdsEditor  box={selectedBox} onUpdate={box => onBuyBoxesChange(buyBoxes.map(b => b.id === box.id ? box : b))} />}
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center text-sm text-vx-muted py-16">
            Select a buy box or create one.
          </div>
        )}
      </div>
    </div>
  );
}

function BusinessPlannerView({ settings, setSettings, deals, ledger }) {
  const summary = useMemo(() => portfolioSummary(deals, ledger, settings), [deals, ledger, settings]);
  const [p, setP] = useState(() => ({ startingCapital: Math.max(0, summary.freeCash), ...settings.planning, targetMonthlyIncome: settings.targetMonthlyIncome }));

  const result = useMemo(() => runBusinessSimulation({
    startingCapital: p.startingCapital, avgCashPerDeal: p.avgCashPerDeal, avgDurationMonths: p.avgDurationMonths,
    avgNetProfitPerDeal: p.avgNetProfitPerDeal, maxConcurrentDeals: p.maxConcurrentDeals, targetMonthlyIncome: p.targetMonthlyIncome, months: 60,
  }), [p]);

  function update(field, value) {
    const next = { ...p, [field]: value };
    setP(next);
    setSettings({ ...settings, targetMonthlyIncome: next.targetMonthlyIncome, planning: { avgCashPerDeal: next.avgCashPerDeal, avgDurationMonths: next.avgDurationMonths, avgNetProfitPerDeal: next.avgNetProfitPerDeal, maxConcurrentDeals: next.maxConcurrentDeals } });
  }

  const dealsPerYear = p.avgDurationMonths > 0 ? round2(p.maxConcurrentDeals * (12 / p.avgDurationMonths)) : 0;
  const steadyAnnualProfit = round2(dealsPerYear * p.avgNetProfitPerDeal);
  const capitalForCapacity = round2(p.avgCashPerDeal * p.maxConcurrentDeals);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">Business planning simulator</h1>
        <p className="text-sm text-vx-muted mt-1">Model how capital, concurrency, and deal speed compound toward your income target.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Deals per year at capacity" value={fmtNum(dealsPerYear, 1)} />
        <KPI label="Steady-state annual profit" value={fmtGBP(steadyAnnualProfit)} />
        <KPI label="Capital needed for full capacity" value={fmtGBP(capitalForCapacity)} />
        <KPI label="Months to reach target" value={result.achievedMonth ? result.achievedMonth : "60+"} tone={result.achievedMonth ? "good" : "warn"} sub={result.achievedMonth ? `≈ ${(result.achievedMonth / 12).toFixed(1)} years` : "Not reached in 60 months"} />
      </div>

      <Card>
        <SectionTitle icon={SlidersHorizontal}>Assumptions</SectionTitle>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          <SimSlider testId="plan-capital" label="Starting capital" value={p.startingCapital} min={0} max={300000} step={1000} onChange={(v) => update("startingCapital", v)} format={fmtGBP} />
          <SimSlider testId="plan-cashperdeal" label="Average own cash per deal" value={p.avgCashPerDeal} min={5000} max={100000} step={1000} onChange={(v) => update("avgCashPerDeal", v)} format={fmtGBP} />
          <SimSlider testId="plan-duration" label="Average deal duration" value={p.avgDurationMonths} min={3} max={18} step={1} onChange={(v) => update("avgDurationMonths", v)} format={(v) => v + " months"} />
          <SimSlider testId="plan-profit" label="Average net profit per deal" value={p.avgNetProfitPerDeal} min={5000} max={80000} step={1000} onChange={(v) => update("avgNetProfitPerDeal", v)} format={fmtGBP} />
          <SimSlider testId="plan-concurrent" label="Max concurrent deals" value={p.maxConcurrentDeals} min={1} max={8} step={1} onChange={(v) => update("maxConcurrentDeals", v)} format={(v) => v} />
          <SimSlider testId="plan-target" label="Target monthly income" value={p.targetMonthlyIncome} min={2000} max={50000} step={500} onChange={(v) => update("targetMonthlyIncome", v)} format={fmtGBP} />
        </div>
      </Card>

      <Card>
        <SectionTitle icon={TrendingUp}>Projected monthly income run-rate</SectionTitle>
        <BusinessSimChart timeline={result.timeline} target={p.targetMonthlyIncome} />
        <p className="text-xs text-vx-muted mt-2">Trailing 12-month profit ÷ 12, recomputed each month as deals complete and capital recycles into new projects, capped at your concurrency limit.</p>
      </Card>

      {/* ── Private capital pool tracker (P04) ─────────────────────────── */}
      <PrivateCapitalTracker deals={deals} settings={settings} setSettings={setSettings} />
    </div>
  );
}

/** P04 — private capital pool recycling tracker. Shows deployed/idle per deal, turns, overruns. */
function PrivateCapitalTracker({ deals, settings, setSettings }) {
  const poolCfg = useMemo(() => ({
    pool:                  Number(settings?.lenderFundSize)         || 50000,
    ratePct:               Number(settings?.lenderFundRatePct)      || 0.08,
    termMonths:            Number(settings?.capitalTermMonths)       || 12,
    extensionCapMonths:    Number(settings?.capitalExtensionMonths)  || 3,
  }), [settings]);

  // Build allocation list from deals with v2.capitalAllocated set
  const allocations = useMemo(() =>
    (deals || [])
      .filter(d => d.v2?.capitalAllocated > 0)
      .map(d => ({
        id:           d.id,
        dealName:     d.name || d.address || d.id,
        allocated:    Number(d.v2.capitalAllocated),
        deployedAt:   d.v2.capitalDeployedAt   || null,
        expectedReturn: d.v2.capitalExpectedReturnAt || null,
        returnedAt:   d.v2.capitalReturnedAt   || null,
      })),
  [deals]);

  const recycleResult = useMemo(() =>
    recycling(poolCfg.pool, allocations.map(a => ({
      id: a.id, allocated: a.allocated,
      deployedAt: a.deployedAt, returnedAt: a.returnedAt,
    })), { termMonths: poolCfg.termMonths, extensionMonths: poolCfg.extensionCapMonths }),
  [poolCfg, allocations]);

  // Cumulative interest across active allocations (deployed, not yet returned)
  const accruedInterest = useMemo(() => {
    const now = Date.now();
    return allocations
      .filter(a => a.deployedAt && !a.returnedAt)
      .reduce((sum, a) => {
        const ms = now - new Date(a.deployedAt).getTime();
        const months = ms / (1000 * 60 * 60 * 24 * 30.4375);
        return sum + capitalCost(a.allocated, months, poolCfg.ratePct).cost;
      }, 0);
  }, [allocations, poolCfg.ratePct]);

  return (
    <Card>
      <SectionTitle>Private capital pool</SectionTitle>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPI label="Pool size" value={fmtGBP(poolCfg.pool)} />
        <KPI label="Deployed" value={fmtGBP(recycleResult.deployed)}
          tone={recycleResult.deployed > 0 ? "default" : "default"} />
        <KPI label="Idle" value={fmtGBP(recycleResult.idle)}
          tone={recycleResult.idle >= 0 ? "good" : "bad"} />
        <KPI label="Turns / year" value={recycleResult.turnsPerYear > 0 ? recycleResult.turnsPerYear.toFixed(1) + "×" : "—"}
          tone={recycleResult.turnsPerYear >= 2 ? "good" : "default"} />
      </div>

      {recycleResult.overrunCount > 0 && (
        <div className="mb-3 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          ⚠ {recycleResult.overrunCount} allocation{recycleResult.overrunCount !== 1 ? "s" : ""} overrun the {poolCfg.termMonths + poolCfg.extensionCapMonths}-month limit.
        </div>
      )}

      {accruedInterest > 0 && (
        <p className="text-xs text-vx-muted mb-3">
          Cumulative interest accrued on active allocations: <strong className="font-mono">{fmtGBP(round2(accruedInterest))}</strong>
          {" "}at {(poolCfg.ratePct * 100).toFixed(1)}% p.a. simple. <span className="italic">Illustrative — verify with fund manager.</span>
        </p>
      )}

      {allocations.length === 0 ? (
        <p className="text-xs text-vx-muted">No capital allocated to deals yet. Add allocations via the &ldquo;Appraisal v2&rdquo; tab on each deal.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-vx-muted border-b border-vx-divider">
                <th className="text-left py-1 pr-3 font-medium">Deal</th>
                <th className="text-right py-1 pr-3 font-medium">Allocated</th>
                <th className="text-right py-1 pr-3 font-medium">Deployed</th>
                <th className="text-right py-1 pr-3 font-medium">Expected return</th>
                <th className="text-right py-1 pr-3 font-medium">Interest cost</th>
                <th className="text-right py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map(a => {
                const now = Date.now();
                const deployedMs = a.deployedAt ? now - new Date(a.deployedAt).getTime() : 0;
                const monthsHeld = deployedMs / (1000 * 60 * 60 * 24 * 30.4375);
                const interest = a.deployedAt
                  ? capitalCost(a.allocated, monthsHeld, poolCfg.ratePct).cost
                  : 0;
                const isOverrun = !a.returnedAt && monthsHeld > poolCfg.termMonths + poolCfg.extensionCapMonths;
                const isExpired = !a.returnedAt && a.expectedReturn && new Date(a.expectedReturn) < new Date();
                const status    = a.returnedAt ? "returned" : isOverrun ? "overrun" : isExpired ? "overdue" : "active";
                const statusColour = { returned: "text-vx-positive", overrun: "text-vx-negative", overdue: "text-vx-caution", active: "text-vx-muted" }[status];
                return (
                  <tr key={a.id} className="border-b border-vx-divider last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-vx-text truncate max-w-[160px]">{a.dealName}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{fmtGBP(a.allocated)}</td>
                    <td className="py-1.5 pr-3 text-right">{a.deployedAt || "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{a.expectedReturn || "—"}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{fmtGBP(round2(interest))}</td>
                    <td className={`py-1.5 text-right font-medium capitalize ${statusColour}`}>{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumField label="Pool size (£)" value={settings.lenderFundSize ?? 50000}
          onChange={(v) => setSettings({ ...settings, lenderFundSize: v })} testId="lender-fund-size" />
        <PctField label="Annual rate %" value={settings.lenderFundRatePct ?? 0.08}
          onChange={(v) => setSettings({ ...settings, lenderFundRatePct: v })} step={0.5} testId="lender-fund-rate" />
      </div>
      <p className="text-xs text-vx-muted mt-2 italic">Projection — illustrative, depends on deal exits.</p>
    </Card>
  );
}

function RiskView({ deals, ledger, settings }) {
  const summary = useMemo(() => portfolioSummary(deals, ledger, settings), [deals, ledger, settings]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-vx-text">Risk exposure</h1>
        <p className="text-sm text-vx-muted mt-1">Leverage, concentration, and area risk across the live portfolio.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Leverage (bridge debt / capital)" value={fmtPct(summary.leverageRatio)} tone={summary.leverageRatio > 0.7 ? "bad" : "default"} />
        <KPI label="Capital exposure (committed / total)" value={fmtPct(summary.exposureRatio)} tone={summary.exposureRatio > 0.8 ? "warn" : "default"} />
        <KPI label="Largest town concentration" value={summary.maxTownName ? `${fmtPct(summary.maxTownShare, 0)}` : "—"} sub={summary.maxTownName || "No active deals"} tone={summary.maxTownShare > 0.6 ? "warn" : "default"} />
        <KPI label="Bridge debt outstanding" value={fmtGBP(summary.bridgeDebtOutstanding)} />
      </div>

      <Card>
        <SectionTitle icon={ShieldAlert}>Active alerts</SectionTitle>
        <AlertsList alerts={summary.alerts} />
      </Card>

      <Card>
        <SectionTitle>Deal-by-deal risk</SectionTitle>
        {summary.active.length === 0 ? <div className="text-sm text-vx-muted">No active deals.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-vx-muted text-xs uppercase">
                <tr><th className="text-left py-2 px-3">Deal</th><th className="text-left py-2 px-3">Town</th><th className="text-right py-2 px-3">Risk score</th><th className="text-right py-2 px-3">Rating</th><th className="text-right py-2 px-3">Bridge drawn</th><th className="text-right py-2 px-3">Shortfall</th></tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {summary.active.map(({ deal, a }) => {
                  const risk = calcRiskScore(deal.riskFactors);
                  return (
                    <tr key={deal.id} className="border-t border-vx-divider">
                      <td className="py-2 px-3 font-sans">{deal.name}</td>
                      <td className="py-2 px-3 font-sans">{deal.town || "—"}</td>
                      <td className="text-right py-2 px-3">{fmtNum(risk.score)}</td>
                      <td className="text-right py-2 px-3"><Badge tone={risk.rating === "LOW RISK" ? "good" : risk.rating === "MEDIUM RISK" ? "warn" : "bad"}>{risk.rating}</Badge></td>
                      <td className="text-right py-2 px-3">{fmtGBP(a.funding.bridgeDrawn)}</td>
                      <td className={`text-right py-2 px-3 ${a.funding.shortfall > 0 ? "text-vx-negative" : ""}`}>{fmtGBP(a.funding.shortfall)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* =================================================================================
   SOURCING PIPELINE — leads found via research or auction alerts, before they
   become a deal. Adapted from a design scoped in an earlier session against the
   original artifact-storage build; reworked here to match the real Firestore
   persistence pattern (single per-user document, no separate collection or
   security rules needed) and the primitives actually in scope in this file.
   ================================================================================= */

const LEAD_STATUSES = ["new", "watchlist", "under_offer", "rejected", "promoted"];

// "unsold_check" is never stored in lead.status — it's a derived display state
// (same pattern as isStale()), computed from listingType + auctionDate + status,
// so it can't drift out of sync and never silently overwrites a status the user
// set deliberately. It's shown as a badge and is filterable, but the underlying
// status dropdown only ever offers the five real, user-settable values above.
const LEAD_FILTER_STATUSES = [...LEAD_STATUSES, "unsold_check"];

function effectiveLeadStatus(lead) {
  if (lead.listingType === "auction" && lead.auctionDate && lead.status !== "promoted" && lead.status !== "rejected") {
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (new Date(lead.auctionDate) < today) return "unsold_check";
  }
  return lead.status;
}

const LISTING_TYPES = ["auction", "agent", "d2v", "trader", "other"];
const LISTING_TYPE_LABELS = { auction: "Auction", agent: "Estate agent", d2v: "Direct to vendor", trader: "Trader/wholesaler", other: "Other" };
const SELLER_TYPES = ["unknown", "receiver", "probate", "ha_council", "landlord_exit", "trader", "forced_speed"];
const SELLER_TYPE_LABELS = { unknown: "Unknown", receiver: "Receiver", probate: "Probate", ha_council: "HA / Council", landlord_exit: "Landlord exiting", trader: "Trader", forced_speed: "Forced — needs speed" };
const AUCTION_FORMATS = ["in_room", "online", "hybrid"];
const LEAD_SIGNALS = ["late_entry", "no_viewings", "late_pack", "reduced", "prior_withdrawn", "prior_unsold"];
const SIGNAL_LABELS = { late_entry: "Late entry to market", no_viewings: "No viewings booked", late_pack: "Late legal pack", reduced: "Price reduced", prior_withdrawn: "Previously withdrawn", prior_unsold: "Previously unsold at auction" };

// Q1–Q3 and the two explicit deal-killers (liquid12m, areaStrong) gate the lead —
// any "no" fails it outright. Q4–Q6 are informational only: they affect whether
// the result reads as complete, but a "no" there alone never fails a lead.
// The Decision Brief's evaluateDecision() mirrors these gating rules on the deal side.
const TRIAGE_QUESTIONS = [
  { key: "areaKnown", label: "Do you know this area well?", gating: true, failText: "Area not known well enough" },
  { key: "assetTypeFits", label: "Does the asset type fit your strategy?", gating: true, failText: "Asset type does not fit" },
  { key: "conditionAddsValue", label: "Does the condition add value on refurb?", gating: true, failText: "Condition doesn't add value on refurb" },
  { key: "sellerMotivated", label: "Is the seller genuinely motivated?", gating: false, failText: "Seller doesn't appear motivated" },
  { key: "guideSensible", label: "Is the guide price sensible?", gating: false, failText: "Guide price isn't sensible" },
  { key: "valueAddClear", label: "Is the value-add clear?", gating: false, failText: "Value-add isn't clear" },
  { key: "liquid12m", label: "Can you sell within 12 months, or refinance within 6?", gating: true, failText: "Not liquid enough — can't sell in 12 months or refinance in 6" },
  { key: "areaStrong", label: "Is the area strong on value, volume, and demand?", gating: true, failText: "Area isn't strong enough on value, volume, or demand" },
];

function newTriage() {
  return {
    areaKnown: null, assetTypeFits: null, conditionAddsValue: null, sellerMotivated: null,
    guideSensible: null, valueAddClear: null, liquid12m: null, areaStrong: null,
    result: "incomplete", failReason: null, scoredAt: null, scoredBy: "user",
  };
}

function computeTriageResult(triage) {
  const failedQ = TRIAGE_QUESTIONS.find((q) => q.gating && triage[q.key] === false);
  if (failedQ) return { result: "fail", failReason: failedQ.failText };
  const anyUnanswered = TRIAGE_QUESTIONS.some((q) => triage[q.key] === null);
  if (anyUnanswered) return { result: "incomplete", failReason: null };
  return { result: "pass", failReason: null };
}

/* =================================================================================
   STRATEGY PROFILE — DETERMINISTIC GATE. Objective, checkable-from-data facts
   only: postcode area/district, asset type, guide price. Deliberately narrower
   than the full 8-question triage — condition, seller motivation, liquidity,
   and area strength are all judgment calls a rule can't make, and stay with the
   user or the AI research pass, never silently overridden here.

   This exact logic is duplicated in functions/index.js for the AI research pass
   server-side gate (the brief explicitly allows duplication over a shared module,
   given this app's single-file client / separate-file Cloud Function split) —
   keep both in sync if either changes.
   ================================================================================= */
// Accepts a buy box `filters` object. Checks only objective, data-derivable facts
// INTENTIONAL DUPLICATION — mirrors applyDeterministicGate() in functions/index.js.
// If you change gate rules here, update functions/index.js too.
// TODO: extract gate DEFINITIONS to a shared JSON constant loaded by both sides.
function applyDeterministicGate(lead, filters) {
  if (!filters) return { areaKnown: null, assetTypeFits: null, guideSensible: null, tenureFits: null, reasons: [] };
  const reasons = [];

  let areaKnown = null;
  const hasAreaConstraint = (filters.postcodeAreas || []).length > 0 || (filters.postcodeDistricts || []).length > 0;
  if (hasAreaConstraint && lead.postcode) {
    const outward = lead.postcode.trim().toUpperCase().split(/\s+/)[0];
    const areaLetters = (outward.match(/^[A-Z]+/) || [""])[0];
    const districts = (filters.postcodeDistricts || []).map(d => d.toUpperCase());
    const areas = (filters.postcodeAreas || []).map(a => a.toUpperCase());
    areaKnown = districts.includes(outward) || areas.includes(areaLetters);
    if (!areaKnown) reasons.push(`Postcode ${outward || lead.postcode} is outside your buy box areas`);
  }

  // propertyTypes is the buy box field; assetTypes is the legacy name — support both
  const typeList = filters.propertyTypes || filters.assetTypes || [];
  let assetTypeFits = null;
  if (typeList.length > 0 && lead.propertyType) {
    assetTypeFits = typeList.includes(lead.propertyType);
    if (!assetTypeFits) reasons.push(`${lead.propertyType} isn't in your buy box property types`);
  }

  let tenureFits = null;
  if ((filters.tenure || []).length > 0 && lead.tenure) {
    tenureFits = filters.tenure.includes(lead.tenure);
    if (!tenureFits) reasons.push(`${lead.tenure} tenure isn't in your buy box`);
  }

  // priceMax replaces maxGuide; support both
  const ceiling = filters.priceMax || filters.maxGuide || 0;
  let guideSensible = null;
  if (ceiling > 0 && Number(lead.guidePrice) > 0) {
    guideSensible = Number(lead.guidePrice) <= ceiling;
    if (!guideSensible) reasons.push(`Guide price ${fmtGBP(lead.guidePrice)} exceeds buy box max of ${fmtGBP(ceiling)}`);
  }

  return { areaKnown, assetTypeFits, tenureFits, guideSensible, reasons };
}

// Applied only to leads currently at status "new" — never touches anything the
// user has manually advanced further, matching the confirmed gate-on-profile-
// change behaviour. Q5 (guide price) gets recorded but never auto-rejects on
// its own, matching the brief's own write rule (Q1–Q3 only) — a price outside
// budget is worth seeing, not an automatic kill on its own.
function rescoreLeadAgainstFilters(lead, filters) {
  const gate = applyDeterministicGate(lead, filters);
  const triage = lead.triage || newTriage();
  const nextTriage = { ...triage };
  if (gate.areaKnown !== null) nextTriage.areaKnown = gate.areaKnown;
  if (gate.assetTypeFits !== null) nextTriage.assetTypeFits = gate.assetTypeFits;
  if (gate.guideSensible !== null) nextTriage.guideSensible = gate.guideSensible;

  const { result, failReason } = computeTriageResult(nextTriage);
  const gateFailsQ1to3 = nextTriage.areaKnown === false || nextTriage.assetTypeFits === false || nextTriage.conditionAddsValue === false;

  return {
    ...lead,
    triage: { ...nextTriage, result, failReason: gate.reasons.length ? gate.reasons[0] : failReason, scoredAt: Date.now(), scoredBy: "gate" },
    status: gateFailsQ1to3 ? "rejected" : lead.status,
  };
}

const REGION_TOWNS = {
  "North West England": ["Manchester", "Rochdale", "Oldham", "Bolton", "Bury", "Salford", "Stockport", "Wigan", "Preston", "Blackburn", "Blackpool", "Burnley", "Liverpool", "Warrington"],
  "Yorkshire and the Humber": ["Leeds", "Bradford", "Huddersfield", "Halifax", "Wakefield", "Sheffield", "York", "Doncaster", "Rotherham", "Barnsley", "Hull"],
  "East Midlands": ["Nottingham", "Leicester", "Derby", "Lincoln", "Northampton"],
  "West Midlands": ["Birmingham", "Coventry", "Wolverhampton", "Stoke-on-Trent", "Walsall"],
  "North East England": ["Newcastle upon Tyne", "Sunderland", "Middlesbrough", "Durham"],
  "East of England": ["Norwich", "Cambridge", "Ipswich", "Luton"],
  "South East England": ["Reading", "Oxford", "Brighton", "Southampton", "Milton Keynes"],
  "South West England": ["Bristol", "Plymouth", "Exeter", "Gloucester"],
  "Greater London": ["London"],
  "Scotland": ["Glasgow", "Edinburgh", "Aberdeen", "Dundee", "Inverness", "Perth", "Stirling", "Paisley", "Ayr"],
  "Wales": ["Cardiff", "Swansea", "Newport", "Wrexham", "Bridgend", "Rhondda", "Pontypridd", "Barry"],
  "Northern Ireland": ["Belfast", "Derry/Londonderry", "Lisburn", "Newry", "Armagh", "Antrim", "Ballymena"],
};
const PROPERTY_TYPE_OPTIONS = ["Terrace", "Semi", "Detached", "Flat"];
const ACQUISITION_TYPE_OPTIONS = ["Sale", "Auction"];

const TRADE_TYPES = [
  "General builder", "Structural / groundworks", "Roofing", "Rewire / electrics", "Plumbing & heating",
  "Damp proofing / roofline", "Plastering", "Kitchen fitting", "Bathroom fitting", "Windows & doors",
  "Flooring", "Decorating", "Scaffolding", "Skip hire / waste clearance", "Landscaping / externals", "Other trade",
];
const PROFESSIONAL_TYPES = [
  "Solicitor / conveyancer", "Mortgage / bridging broker", "Accountant", "Surveyor", "Insurance broker",
  "Letting agent", "Estate agent", "Architect", "Structural engineer", "Party wall surveyor", "Other professional",
];
const CONTACT_CATEGORIES = ["Trade", "Professional"];
const CONTACT_STATUSES = ["Preferred", "Active", "Untested", "Avoid"];

function newContact() {
  return {
    id: uid(),
    name: "",
    company: "",
    category: "Trade",
    type: TRADE_TYPES[0],
    phone: "",
    email: "",
    areaCovered: "",
    rate: "",
    rating: 0,
    status: "Untested",
    notes: "",
    dateAdded: Date.now(),
  };
}

/* =================================================================================
   RENTAL PROPERTY MANAGEMENT — post-purchase compliance calendar, tenancy & manual
   rent ledger, and BRRR refinance-readiness tracker. Scoped deliberately around the
   differentiated layer (compliance state + BRRR cycle) rather than rebuilding rent
   collection / Open Banking reconciliation / MTD bookkeeping, which are commodity
   infrastructure better served by dedicated tools — this stays complementary to those,
   not a replacement for them.
   ================================================================================= */

const COMPLIANCE_TYPES = [
  "Gas Safety Certificate", "EICR (Electrical)", "EPC Certificate", "HMO Licence",
  "Deposit Protection", "PRS Registration", "Right to Rent Check", "Other",
];
const RENT_ENTRY_STATUSES = ["Paid", "Late", "Partial", "Missed"];
const EPC_RATINGS = ["A", "B", "C", "D", "E", "F", "G", "Unknown"];
const PROPERTY_STATUSES = ["Vacant", "Let", "Notice Given", "Voided"];
const DEPOSIT_SCHEMES = ["TDS", "DPS", "mydeposits", "Other / not yet protected"];

// 60-day warning window before something lapses — matches how bridging/legal
// deadlines are usually flagged in the rest of the app.
const COMPLIANCE_WARNING_DAYS = 60;

function newProperty() {
  return {
    id: uid(),
    address: "", postcode: "", town: "", propertyType: "Terrace",
    dealId: null,
    status: "Vacant",
    epcRating: "Unknown",
    currentValuation: 0,
    tenancy: {
      tenantName: "", tenancyStartDate: "", monthlyRent: 0,
      depositAmount: 0, depositScheme: "", depositProtectedDate: "",
      prescribedInfoServed: false, rraInfoSheetIssued: false,
    },
    rentLedger: [],
    compliance: [],
    notes: "",
    dateAdded: Date.now(),
    areaIntelligence: null,
    epcCheck: null,
  };
}

function propertyFromDeal(deal) {
  const p = newProperty();
  return {
    ...p,
    address: deal.address || deal.name || "",
    postcode: deal.postcode || "",
    town: deal.town || "",
    propertyType: deal.propertyType || "Terrace",
    dealId: deal.id,
    currentValuation: calcGDV(enrichDeal(deal)) || 0,
  };
}

function complianceItemStatus(expiryDate) {
  if (!expiryDate) return "Unknown";
  const d = new Date(expiryDate);
  if (isNaN(d.getTime())) return "Unknown";
  const today = new Date(new Date().toISOString().slice(0, 10));
  const daysLeft = Math.round((d - today) / 86400000);
  if (daysLeft < 0) return "Overdue";
  if (daysLeft <= COMPLIANCE_WARNING_DAYS) return "Expiring Soon";
  return "Valid";
}

function calcRentSummary(property) {
  const ledger = property.rentLedger || [];
  const totalDue = ledger.reduce((s, e) => s + (Number(e.amountDue) || 0), 0);
  const totalReceived = ledger.reduce((s, e) => s + (Number(e.amountReceived) || 0), 0);
  const arrears = round2(Math.max(0, totalDue - totalReceived));
  const sorted = [...ledger].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  let seasoningMonths = 0;
  for (const e of sorted) {
    if (e.status === "Paid") seasoningMonths++;
    else break;
  }
  const recentMissed = sorted.slice(0, 6).some((e) => e.status === "Missed");
  return { totalDue: round2(totalDue), totalReceived: round2(totalReceived), arrears, seasoningMonths, recentMissed, entryCount: ledger.length };
}

function calcRefinanceReadiness(property, linkedDeal) {
  const rent = calcRentSummary(property);
  const complianceIssues = (property.compliance || []).filter((c) => complianceItemStatus(c.expiryDate) !== "Valid");
  const epcOk = ["A", "B", "C"].includes(property.epcRating);
  const depositProtected = !!(property.tenancy && property.tenancy.depositProtectedDate);
  const checks = [
    { label: "At least 3 months' clean rent ledger (seasoning)", pass: rent.seasoningMonths >= 3 },
    { label: "No missed payments in the last 6 entries", pass: !rent.recentMissed },
    { label: "All compliance items valid (none overdue or expiring soon)", pass: complianceIssues.length === 0 },
    { label: "EPC rating C or better (2030 minimum-C requirement)", pass: epcOk },
    { label: "Deposit protected with a government-approved scheme", pass: depositProtected },
  ];
  const fails = checks.filter((c) => !c.pass).length;
  const verdict = fails === 0 ? "READY" : fails <= 1 ? "ALMOST READY" : "NOT READY";
  const currentValuation = Number(property.currentValuation) || (linkedDeal ? calcGDV(enrichDeal(linkedDeal)) : 0);
  return { checks, fails, verdict, currentValuation, rent, complianceIssues, epcOk };
}

function portfolioComplianceAlerts(properties) {
  const alerts = [];
  properties.forEach((p) => {
    (p.compliance || []).forEach((c) => {
      const status = complianceItemStatus(c.expiryDate);
      if (status === "Overdue") alerts.push({ type: "overdue", property: p.address || "Untitled property", detail: `${c.type} is overdue on ${p.address || "an untitled property"}` });
      else if (status === "Expiring Soon") alerts.push({ type: "expiring", property: p.address || "Untitled property", detail: `${c.type} expires within ${COMPLIANCE_WARNING_DAYS} days on ${p.address || "an untitled property"}` });
    });
    const rent = calcRentSummary(p);
    if (rent.arrears > 0) alerts.push({ type: "arrears", property: p.address || "Untitled property", detail: `${fmtGBP(rent.arrears)} in arrears on ${p.address || "an untitled property"}` });
  });
  return alerts;
}

function newLead() {
  return {
    id: uid(),
    address: "",
    postcode: "",
    propertyType: "Terrace",
    bedrooms: 0,
    availabilityConfirmed: false,
    source: "",
    sourceUrl: "",
    guidePrice: 0,
    auctionDate: "",
    status: "new",
    comparables: [], // [{ label, value }] — free-text, matches the research report's pattern
    estRefurb: 0,
    estLegalFinance: 0,
    estResaleLow: 0,
    estResaleHigh: 0,
    riskNotes: "",
    dateAdded: Date.now(),
    lastVerified: null,
    legalPackDocuments: [],
    statusCheck: null, // { status, detail, method, checkedAt } — set by "Re-check status"
    listingType: "other",
    sellerType: "unknown",
    signals: [],
    auctionHouse: "",
    lotNumber: "",
    auctionFormat: "in_room",
    buyerPremium: 0,
    sellerFeeReimbursements: 0,
    completionDays: 28,
    priorAuctionHistory: "",
    triage: newTriage(),
    areaIntelligence: null,
    epcCheck: null,
    construction: null, // P06: { confirmedType, frontage, notes, streetConstructionMix, streetFrontageMix, streetGoodAvoidEnd, streetNotes }
    viewings: [],       // P07: [{ id, date, type, agentId, offerMade, offerAmount, outcome, followUpDate, notes }]
    pipelineStage: "Watching",
    auctionV2: null,
  };
}

// Staleness: a lead not re-verified in 21 days is flagged, since guide prices,
// auction dates, and comparables all go out of date.
const STALE_DAYS = 21;
function isStale(lead) {
  const ref = lead.lastVerified || lead.dateAdded;
  return (Date.now() - ref) / (1000 * 60 * 60 * 24) > STALE_DAYS;
}

// Lead -> Deal field mapping. SDLT, bridge interest, and every other derived
// figure recompute fresh through the real appraisal engine — nothing here is
// carried over as if it were already calculated.
function leadToDealPartial(lead) {
  const midResale = lead.estResaleLow && lead.estResaleHigh
    ? Math.round((Number(lead.estResaleLow) + Number(lead.estResaleHigh)) / 2)
    : Number(lead.estResaleLow) || Number(lead.estResaleHigh) || 0;

  const compNotes = (lead.comparables || [])
    .map((c) => `${c.label}: ${c.value}`)
    .join("\n");

  // Buyer's premium and seller's fee reimbursements are real cash costs on top
  // of the hammer price — added to the fees line, not silently dropped.
  const auctionFeesTotal = (Number(lead.buyerPremium) || 0) + (Number(lead.sellerFeeReimbursements) || 0);

  const triageNote = lead.triage && lead.triage.result !== "incomplete"
    ? `Triage: ${lead.triage.result}${lead.triage.failReason ? ` (${lead.triage.failReason})` : ""}.`
    : null;
  const sellerNote = lead.sellerType && lead.sellerType !== "unknown" ? `Seller type: ${SELLER_TYPE_LABELS[lead.sellerType] || lead.sellerType}.` : null;
  const signalsNote = (lead.signals || []).length ? `Signals: ${lead.signals.map((s) => SIGNAL_LABELS[s] || s).join(", ")}.` : null;

  return {
    name: lead.address || "Promoted lead",
    address: lead.address,
    postcode: lead.postcode,
    town: (lead.postcode || "").split(" ")[0] || "",
    propertyType: lead.propertyType,
    price: Number(lead.guidePrice) || 0,
    gdvOverride: midResale,
    // Carry through the raw resale range so migrateV2Deal can set proper worst/mid/best
    estResaleLow:  Number(lead.estResaleLow)  || 0,
    estResaleHigh: Number(lead.estResaleHigh) || 0,
    fees: { solicitor: 1400, searches: 350, survey: 600, broker: 1200, valuation: 450, landReg: 270, other: (Number(lead.estLegalFinance) || 200) + auctionFeesTotal },
    refurbItems: [{ name: "Estimated refurb (from lead — replace with trade-by-trade)", low: Number(lead.estRefurb) || 0, high: Number(lead.estRefurb) || 0 }],
    completionDays: Number(lead.completionDays) || 28,
    listingType: lead.listingType || "other",
    notes: [`Promoted from sourcing pipeline (${lead.source || "unknown source"}).`, sellerNote, signalsNote, triageNote, lead.riskNotes, compNotes].filter(Boolean).join("\n\n"),
  };
}

// Land Registry Price Paid Data — free, official, no key required. The SPARQL
// endpoint's CORS headers explicitly allow cross-origin requests (verified
// directly against the live endpoint). If it ever fails — endpoint downtime,
// a network hiccup, a policy change — this surfaces a clear error rather than
// silently returning nothing, since trustworthy comparables are the whole point.
async function fetchLandRegistryComparables(postcode) {
  const outcode = (postcode || "").trim().split(" ")[0];
  if (!outcode) return [];
  const query = `
    PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
    PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
    SELECT ?paon ?street ?town ?postcode ?amount ?date WHERE {
      ?transx lrppi:pricePaid ?amount ;
              lrppi:transactionDate ?date ;
              lrppi:propertyAddress ?addr .
      ?addr lrcommon:postcode ?postcode ;
            lrcommon:town ?town .
      OPTIONAL { ?addr lrcommon:paon ?paon }
      OPTIONAL { ?addr lrcommon:street ?street }
      FILTER(STRSTARTS(STR(?postcode), "${outcode}"))
    } ORDER BY DESC(?date) LIMIT 15`;
  const url = "https://landregistry.data.gov.uk/landregistry/query?output=json&query=" + encodeURIComponent(query);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Could not reach Land Registry — verify manually via gov.uk Price Paid Data search, or check your network settings.");
  }
  if (!res.ok) throw new Error(`Land Registry request failed (${res.status}) — verify manually via gov.uk Price Paid Data search.`);
  const json = await res.json();
  const rows = (json && json.results && json.results.bindings) || [];
  return rows.map((r) => ({
    label: [r.paon && r.paon.value, r.street && r.street.value].filter(Boolean).join(" ") || (r.town && r.town.value) || "Sold comparable",
    value: `£${Number((r.amount && r.amount.value) || 0).toLocaleString("en-GB")} (${((r.date && r.date.value) || "").slice(0, 10)})`,
  }));
}

// Town -> UKHPI region slug. Most towns are their own local authority district
// and slugify cleanly (e.g. "Rochdale" -> "rochdale"), but several aren't —
// Huddersfield/Halifax sit inside Kirklees/Calderdale, some cities go by
// "City of X", others merged into unitary authorities after 2021 reorganisation.
// Every slug below (including the fallback naive-slugify path) was checked
// directly against the live endpoint before shipping, not assumed.
const UKHPI_REGION_OVERRIDES = {
  "Blackburn": "blackburn-with-darwen",
  "Huddersfield": "kirklees",
  "Halifax": "calderdale",
  "Hull": "city-of-kingston-upon-hull",
  "Nottingham": "city-of-nottingham",
  "Derby": "city-of-derby",
  "Northampton": "west-northamptonshire",
  "Durham": "county-durham",
  "Brighton": "brighton-and-hove",
  "Bristol": "city-of-bristol",
  "Plymouth": "city-of-plymouth",
};

function ukhpiSlugFor(town) {
  if (!town) return null;
  if (UKHPI_REGION_OVERRIDES[town]) return UKHPI_REGION_OVERRIDES[town];
  return town.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Council-level UK House Price Index trend — macro context alongside the
// micro (postcode/street) comps above. Returns null rather than throwing on
// "town not found", since an unmapped or misspelled town is a data-coverage
// gap, not an error worth blocking the rest of the deal on.
async function fetchUKHPITrend(town, months) {
  const slug = ukhpiSlugFor(town);
  if (!slug) return null;
  months = months || 24;
  const query = `
    PREFIX ukhpi: <http://landregistry.data.gov.uk/def/ukhpi/>
    SELECT ?refMonth ?avgPrice ?changeMonth ?changeYear WHERE {
      ?item ukhpi:refRegion <http://landregistry.data.gov.uk/id/region/${slug}> ;
            ukhpi:refMonth ?refMonth ;
            ukhpi:averagePrice ?avgPrice .
      OPTIONAL { ?item ukhpi:percentageChange ?changeMonth }
      OPTIONAL { ?item ukhpi:percentageAnnualChange ?changeYear }
    } ORDER BY DESC(?refMonth) LIMIT ${months}`;
  const url = "https://landregistry.data.gov.uk/landregistry/query?output=json&query=" + encodeURIComponent(query);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Could not reach the UK House Price Index service — check your network settings.");
  }
  if (!res.ok) throw new Error(`UKHPI request failed (${res.status}).`);
  const json = await res.json();
  const rows = (json && json.results && json.results.bindings) || [];
  if (!rows.length) return null;
  const points = rows.map((r) => ({
    month: (r.refMonth && r.refMonth.value) || "",
    avgPrice: Number((r.avgPrice && r.avgPrice.value) || 0),
    changeMonth: r.changeMonth ? Number(r.changeMonth.value) : null,
    changeYear: r.changeYear ? Number(r.changeYear.value) : null,
  })).sort((a, b) => a.month.localeCompare(b.month));
  return { slug, points, latest: points[points.length - 1] };
}

/* =================================================================================
   AREA INTELLIGENCE — real crime and flood risk data for a postcode, sitting
   alongside (never overwriting) the existing manual 1-5 risk factor scores on
   Deals and Properties. All three data sources are free, public, no API key,
   and confirmed via direct testing to allow cross-origin browser requests —
   same verification standard as the Land Registry and UKHPI integrations.
   Prompted by reviewing a Docuwise postcode intelligence report and checking
   which of its data sources are genuinely replicable with open UK data.
   ================================================================================= */

async function lookupPostcode(postcode) {
  const clean = (postcode || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) throw new Error("No postcode to look up.");
  let res;
  try {
    res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  } catch (e) {
    throw new Error("Could not reach the postcode lookup service — check your network settings.");
  }
  if (!res.ok) throw new Error(`Could not find "${postcode}" — check it's a valid postcode.`);
  const json = await res.json();
  if (!json.result) throw new Error(`Could not find "${postcode}" — check it's a valid postcode.`);
  return json.result;
}

async function fetchCrimeSummary(lat, lng) {
  // Deliberately no ?date= param — Police.uk's data typically lags 2-3 months
  // behind the current date, and requesting the current month returns nothing.
  // Omitting the param gets the latest month that actually has data, which we
  // report back explicitly so this never looks like it's showing "right now".
  const res = await fetch(`https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error(`Crime data request failed (${res.status}).`);
  const crimes = await res.json();
  const month = crimes.length ? crimes[0].month : null;
  const byCategory = {};
  crimes.forEach((c) => { byCategory[c.category] = (byCategory[c.category] || 0) + 1; });
  // Array of {category, count} objects, not [key, value] tuples — Firestore
  // rejects arrays nested directly inside arrays, and a tuple array is exactly
  // that. Found and fixed via a real setDoc() failure during testing.
  const sorted = Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  return { total: crimes.length, month, byCategory: sorted };
}

async function fetchFloodRisk(lat, lng) {
  const res = await fetch(`https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${lat}&long=${lng}&dist=3`);
  if (!res.ok) throw new Error(`Flood risk request failed (${res.status}).`);
  const json = await res.json();
  const items = (json && json.items) || [];
  return { areaCount: items.length, areas: items.slice(0, 5).map((a) => ({ label: a.label || a.description || "Flood risk area", riverOrSea: a.riverOrSea || "" })) };
}

const FLOOD_PROVIDERS = {
  Wales: "Natural Resources Wales (naturalresources.wales)",
  Scotland: "SEPA (sepa.org.uk/environment/water/flooding)",
  "Northern Ireland": "Rivers Agency (daera-ni.gov.uk)",
};

async function fetchAreaIntelligence(postcode) {
  const pc = await lookupPostcode(postcode);
  const country = pc.country || "England";

  // Crime: Police.uk covers England, Wales, and parts of NI/Scotland
  const crime = await fetchCrimeSummary(pc.latitude, pc.longitude).catch((e) => ({ error: e.message }));

  // Flood: Environment Agency covers England only — surface a disclaimer for other nations
  let flood;
  if (country !== "England") {
    const provider = FLOOD_PROVIDERS[country];
    flood = {
      notAvailable: true,
      reason: provider
        ? `EA flood data covers England only. Check ${provider} for ${country}.`
        : `EA flood data covers England only (${country}).`,
    };
  } else {
    flood = await fetchFloodRisk(pc.latitude, pc.longitude).catch((e) => ({ error: e.message }));
  }

  // IMD: English Indices of Multiple Deprivation — England only
  let imd = null;
  if (country === "England" && pc.index_of_multiple_deprivation != null) {
    const rank = pc.index_of_multiple_deprivation;
    imd = { rank, decile: Math.ceil(rank * 10 / 32844), lsoa: pc.codes && pc.codes.lsoa, lsoaName: pc.lsoa, release: 2019 };
  } else if (country !== "England") {
    const imdNames = { Wales: "WIMD", Scotland: "SIMD", "Northern Ireland": "NIMDM" };
    imd = { notAvailable: true, reason: `English IMD covers England only. ${imdNames[country] || "Local deprivation data"} applies for ${country}.` };
  }

  const district = pc.outcode || (pc.postcode || "").split(" ")[0];
  return { postcode: pc.postcode, adminDistrict: pc.admin_district, country, district, lat: pc.latitude, lng: pc.longitude, crime, flood, imd, checkedAt: Date.now() };
}

function ImdPill({ imd }) {
  if (!imd) return null;
  if (imd.notAvailable) return <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-vx-surface text-vx-muted" title={imd.reason}>IMD N/A</span>;
  const { decile } = imd;
  const cls = decile <= 3 ? "bg-vx-surface-negative text-vx-negative" : decile <= 7 ? "bg-vx-surface-caution text-vx-caution" : "bg-vx-surface-positive text-vx-positive";
  const tip = `IMD decile ${decile}/10 · LSOA: ${imd.lsoaName || imd.lsoa || "?"} · 2019 release`;
  return <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cls}`} title={tip}>IMD {decile}</span>;
}

function PriceMomentumPill({ stats, propertyType }) {
  if (!stats || !propertyType) return null;
  const bt = stats.byType && stats.byType[propertyType];
  if (!bt || bt.medianLast12m == null) return null;
  const { medianLast12m, yoyChangePct, transactionsLast12m } = bt;
  const lowVol = transactionsLast12m < 10;
  const sign = yoyChangePct >= 0 ? "+" : "";
  const cls = lowVol ? "bg-vx-surface-caution text-vx-caution" : yoyChangePct >= 0 ? "bg-vx-surface-positive text-vx-positive" : "bg-vx-surface-negative text-vx-negative";
  const tip = `${stats.district} ${propertyType}: median £${Math.round(medianLast12m).toLocaleString("en-GB")} (last 12m, ${transactionsLast12m} sales)${lowVol ? " — low volume, treat with caution" : ""}`;
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cls}`} title={tip}>
      {stats.district} {propertyType.toLowerCase()} £{(medianLast12m / 1000).toFixed(0)}k
      {yoyChangePct != null && <> {sign}{(yoyChangePct * 100).toFixed(1)}% YoY</>}
      {lowVol && " ⚠"}
    </span>
  );
}

function _AreaIntelMomentumSection({ postcode, cached, marketStats, propertyType }) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState(null);
  const district = (cached && cached.district) || (postcode ? postcode.trim().split(" ")[0].toUpperCase() : null);
  const districtStats = district && marketStats ? marketStats[district] : null;
  const bt = districtStats && propertyType ? districtStats.byType && districtStats.byType[propertyType] : null;

  async function refresh() {
    if (!district) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fn = httpsCallable(functionsInstance, "refreshMarketStats", { timeout: 125000 });
      await fn({ district });
    } catch (e) {
      const code = e && e.code;
      let msg = (e && e.message) || "Refresh failed.";
      if (code === "functions/permission-denied") msg = "This account isn't authorized to use this feature.";
      else if (code === "functions/not-found") msg = `No Price Paid records found for district ${district} — check the district is correct.`;
      setRefreshError(msg);
    }
    setRefreshing(false);
  }

  return (
    <div className="pt-2 border-t border-vx-divider">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <div className="font-medium text-vx-text text-xs">Price momentum — Land Registry sold prices</div>
        <button onClick={refresh} disabled={refreshing || !district} className="flex items-center gap-1 text-xs font-medium text-vx-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
          <RefreshCw size={12} />{refreshing ? "Refreshing…" : districtStats ? `Refresh ${district}` : `Load ${district || "…"}`}
        </button>
      </div>
      {refreshError && <div className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1 mb-1">{refreshError}</div>}
      {!districtStats && !refreshing && (
        <p className="text-xs text-vx-muted">No data yet for {district || "this district"}. Click "Load" to fetch from Land Registry.</p>
      )}
      {districtStats && (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap gap-2 items-center">
            {["Terrace", "Semi", "Detached", "Flat"].map((t) => (
              districtStats.byType[t] && districtStats.byType[t].medianLast12m != null && (
                <PriceMomentumPill key={t} stats={districtStats} propertyType={t} />
              )
            ))}
          </div>
          {bt && bt.sparkline && bt.sparkline.length > 1 && (
            <div>
              <div className="text-vx-muted mb-1">{district} {propertyType} — annual median (£k)</div>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={bt.sparkline} margin={{ top: 2, right: 4, left: 0, bottom: 2 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => [`£${Math.round(v).toLocaleString("en-GB")}`, "Median"]} labelFormatter={(l) => `${l}`} />
                  <Line type="monotone" dataKey="median" stroke="var(--vx-accent, #C1533C)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {bt && bt.transactionsLast12m < 10 && (
            <div className="flex items-center gap-1 text-vx-caution text-xs"><AlertTriangle size={11} />Fewer than 10 sales in the last 12 months for {propertyType} in {district} — treat medians with caution.</div>
          )}
          <div className="text-vx-muted text-xs">Updated {new Date(districtStats.updatedAt).toLocaleDateString("en-GB")} · {districtStats.attribution}</div>
        </div>
      )}
    </div>
  );
}

function AreaIntelligencePanel({ postcode, cached, onChange, epcCached, onEpcChange, marketStats, propertyType, construction, onConstructionChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [epcLoading, setEpcLoading] = useState(false);
  const [epcError, setEpcError] = useState(null);

  async function check() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAreaIntelligence(postcode);
      onChange(result);
    } catch (e) {
      setError(e.message || "Could not fetch area data.");
    }
    setLoading(false);
  }

  async function checkEpc() {
    setEpcLoading(true);
    setEpcError(null);
    try {
      const fn = httpsCallable(functionsInstance, "checkEpcRegister", { timeout: 25000 });
      const res = await fn({ postcode });
      onEpcChange(res.data);
    } catch (e) {
      const code = e && e.code;
      let msg = (e && e.message) || "Could not check the EPC register.";
      if (code === "functions/permission-denied") msg = "This account isn't authorized to use this feature.";
      setEpcError(msg);
    }
    setEpcLoading(false);
  }

  return (
    <Card className="space-y-2">
      <SectionTitle icon={ShieldAlert}>Area intelligence — crime & flood risk</SectionTitle>
      <p className="text-xs text-vx-muted">Real data from Police.uk and the Environment Agency — context for your own risk score above, not a replacement for it.</p>
      <button data-testid="check-area-intel" onClick={check} disabled={loading || !postcode} className="flex items-center gap-1.5 text-sm font-medium text-vx-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed w-fit">
        <RefreshCw size={14} />{loading ? "Checking…" : "Check crime & flood data"}
      </button>
      {!postcode && <div className="text-xs text-vx-muted">Add a postcode first.</div>}
      {error && <div data-testid="area-intel-error" className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1.5">{error}</div>}
      {cached && (
        <div data-testid="area-intel-result" className="grid md:grid-cols-2 gap-3 text-xs">
          <div className="bg-vx-surface rounded p-2">
            <div className="font-medium text-vx-text">Crime ({cached.crime.month || "latest available month"})</div>
            {cached.crime.error ? (
              <div className="text-vx-negative mt-1">{cached.crime.error}</div>
            ) : (
              <>
                <div className="mt-1">{cached.crime.total} recorded incidents within ~1 mile</div>
                <ul className="list-disc list-inside mt-1 text-vx-muted">
                  {cached.crime.byCategory.slice(0, 5).map((c) => <li key={c.category}>{c.category.replace(/-/g, " ")}: {c.count}</li>)}
                </ul>
              </>
            )}
          </div>
          <div className="bg-vx-surface rounded p-2">
            <div className="font-medium text-vx-text">Flood risk areas nearby</div>
            {cached.flood.error ? (
              <div className="text-vx-negative mt-1">{cached.flood.error}</div>
            ) : cached.flood.areaCount === 0 ? (
              <div className="mt-1">No mapped flood risk areas found within ~3km.</div>
            ) : (
              <ul className="list-disc list-inside mt-1 text-vx-muted">
                {cached.flood.areas.map((a, i) => <li key={i}>{a.label}{a.riverOrSea ? ` (${a.riverOrSea})` : ""}</li>)}
              </ul>
            )}
          </div>
          <div className="text-vx-muted md:col-span-2">Checked {new Date(cached.checkedAt).toLocaleString("en-GB")} for {cached.postcode}{cached.adminDistrict ? ` (${cached.adminDistrict})` : ""}</div>
        </div>
      )}

      {/* IMD section — shown when area intelligence has been checked */}
      {cached && (
        <div className="pt-2 border-t border-vx-divider">
          <div className="font-medium text-vx-text text-xs mb-1">Deprivation — Index of Multiple Deprivation</div>
          {cached.imd ? (
            cached.imd.notAvailable ? (
              <p className="text-xs text-vx-muted">{cached.imd.reason}</p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <ImdPill imd={cached.imd} />
                  <span className="text-xs text-vx-muted">Decile {cached.imd.decile}/10 · rank {cached.imd.rank?.toLocaleString("en-GB")}/32,844 LSOAs · 2019 release</span>
                </div>
                <p className="text-xs text-vx-muted">LSOA: {cached.imd.lsoaName || cached.imd.lsoa || "unknown"}. Decile 1 = most deprived 10% of England; decile 10 = least deprived. Low decile areas can offer strong value-add opportunity but may affect buyer pool and mortgage availability.</p>
              </div>
            )
          ) : (
            <p className="text-xs text-vx-muted">Re-check area data to include IMD — postcodes.io now returns deprivation rank.</p>
          )}
        </div>
      )}

      {/* Price momentum section */}
      <_AreaIntelMomentumSection postcode={postcode} cached={cached} marketStats={marketStats} propertyType={propertyType} />

      <div className="pt-2 border-t border-vx-divider">
        <div className="font-medium text-vx-text text-xs mb-1">EPC register</div>
        <p className="text-xs text-vx-muted mb-1.5">Real registered domestic EPCs for this postcode, from MHCLG — cross-check against a manually entered rating, don't assume it's exhaustive (not every property has a registered certificate).</p>
        <button data-testid="check-epc" onClick={checkEpc} disabled={epcLoading || !postcode} className="flex items-center gap-1.5 text-sm font-medium text-vx-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed w-fit">
          <RefreshCw size={14} />{epcLoading ? "Checking…" : "Check EPC register"}
        </button>
        {epcError && <div data-testid="epc-error" className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1.5 mt-1.5">{epcError}</div>}
        {epcCached && (
          <div data-testid="epc-result" className="text-xs mt-1.5">
            {epcCached.properties.length === 0 ? (
              <div className="text-vx-muted">No registered domestic EPCs found for this postcode.</div>
            ) : (
              <ul className="space-y-1">
                {epcCached.properties.map((p, i) => (
                  <li key={i} className="flex items-center justify-between bg-vx-surface rounded px-2 py-1">
                    <span className="text-vx-text">{p.address}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone={["A", "B", "C"].includes(p.band) ? "good" : ["D", "E"].includes(p.band) ? "warn" : "bad"}>{p.band}</Badge>
                      <span className="text-vx-muted">{p.registrationDate}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-vx-muted mt-1">Checked {new Date(epcCached.checkedAt).toLocaleString("en-GB")} for {epcCached.postcode} — most recent certificate per property shown{epcCached.totalCertificatesFound > epcCached.properties.length ? ` (${epcCached.totalCertificatesFound} total certificates on record, including history)` : ""}.</div>
            {/* EPC search returns band + date only — walls/construction data requires the individual certificate endpoint */}
            <p className="text-xs text-vx-muted mt-1.5">Construction type is not available in the EPC postcode search. Confirm in person using the section below.</p>
          </div>
        )}
      </div>

      {/* Manual construction confirmation — P06 */}
      {onConstructionChange && (
        <div className="pt-2 border-t border-vx-divider">
          <div className="font-medium text-vx-text text-xs mb-1">Construction — manual confirmation</div>
          <p className="text-xs text-vx-muted mb-2">Confirm after viewing. Lenders and insurers treat non-standard construction differently — affects mortgage availability and refurb scope.</p>
          <div className="grid md:grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs text-vx-muted mb-0.5">Construction type confirmed</label>
              <select
                value={(construction || {}).confirmedType || ""}
                onChange={(e) => onConstructionChange({ ...(construction || {}), confirmedType: e.target.value })}
                className="w-full text-xs border border-vx-border rounded px-2 py-1 bg-vx-bg outline-none focus:ring-2 focus:ring-vx-accent"
              >
                <option value="">Not assessed</option>
                <option value="standard">Standard (brick / stone)</option>
                <option value="non-standard">Non-standard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-vx-muted mb-0.5">Frontage description</label>
              <input
                type="text"
                placeholder="e.g. Pebbledash, painted brick, render…"
                value={(construction || {}).frontage || ""}
                onChange={(e) => onConstructionChange({ ...(construction || {}), frontage: e.target.value })}
                className="w-full text-xs border border-vx-border rounded px-2 py-1 bg-vx-bg outline-none focus:ring-2 focus:ring-vx-accent"
              />
            </div>
          </div>
          {(construction || {}).confirmedType === "non-standard" && (
            <div className="flex items-start gap-1.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5 mb-2">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <span><span className="font-semibold">Non-standard confirmed.</span> Check mortgage lender criteria, specialist insurer, and whether refurb scope changes. Flag to solicitor.</span>
            </div>
          )}
          <div>
            <label className="block text-xs text-vx-muted mb-0.5">Notes</label>
            <textarea
              rows={2}
              placeholder="Any additional observations…"
              value={(construction || {}).notes || ""}
              onChange={(e) => onConstructionChange({ ...(construction || {}), notes: e.target.value })}
              className="w-full text-xs border border-vx-border rounded px-2 py-1 bg-vx-bg outline-none focus:ring-2 focus:ring-vx-accent"
            />
          </div>
        </div>
      )}

      {/* Street notes — P06 */}
      {onConstructionChange && (
        <div className="pt-2 border-t border-vx-divider">
          <div className="font-medium text-vx-text text-xs mb-1">Street notes</div>
          <p className="text-xs text-vx-muted mb-1.5">Light observations for the street / postcode sector — useful for future deals in the same area.</p>
          <div className="space-y-1.5">
            {[
              ["streetConstructionMix", "Construction mix on street"],
              ["streetFrontageMix", "Frontage mix"],
              ["streetGoodAvoidEnd", "Good / avoid which end?"],
              ["streetNotes", "Other street notes"],
            ].map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs text-vx-muted mb-0.5">{label}</label>
                <input
                  type="text"
                  value={(construction || {})[field] || ""}
                  onChange={(e) => onConstructionChange({ ...(construction || {}), [field]: e.target.value })}
                  className="w-full text-xs border border-vx-border rounded px-2 py-1 bg-vx-bg outline-none focus:ring-2 focus:ring-vx-accent"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* =================================================================================
   PIPELINE — kanban, gate dialog, auction outcome prompt
   ================================================================================= */

function effectivePipelineStage(lead) {
  if (lead.pipelineStage) return lead.pipelineStage;
  if (lead.status === "promoted") return "Won";
  return LEAD_STATUS_TO_STAGE[lead.status] || "Watching";
}

function StageGateDialog({ toStage, failures, incomplete, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-vx-bg rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-vx-caution flex-shrink-0" />
          <h3 className="font-serif font-semibold text-vx-text">DD Gate — advancing to {toStage}</h3>
        </div>
        {failures.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded p-3 space-y-1">
            <p className="text-xs font-semibold text-vx-negative mb-1">Failed gating questions:</p>
            {failures.map((f, i) => (
              <div key={i} className="flex items-center gap-1 text-xs text-vx-negative">
                <XCircle size={11} className="flex-shrink-0" />{f}
              </div>
            ))}
          </div>
        )}
        {incomplete.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
            <p className="text-xs font-semibold text-vx-caution mb-1">Unanswered gating questions:</p>
            {incomplete.map((q, i) => (
              <div key={i} className="flex items-center gap-1 text-xs text-vx-caution">
                <AlertTriangle size={11} className="flex-shrink-0" />{q}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-vx-muted">This gate is advisory — you can still advance the lead. Incomplete triage items stay on the card.</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 text-sm py-2 rounded border border-vx-border text-vx-muted hover:bg-vx-surface">Cancel</button>
          <button onClick={onConfirm} className="flex-1 text-sm py-2 rounded bg-navy text-white hover:bg-navy/90">Advance anyway</button>
        </div>
      </div>
    </div>
  );
}

function AuctionOutcomeBanner({ leads, onMoveToWon, onMoveToLost, onMoveToWithdrawn }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = leads.filter((l) =>
    effectivePipelineStage(l) === "Bid Submitted" &&
    l.listingType === "auction" &&
    l.auctionDate && l.auctionDate < today &&
    l.status !== "promoted" && l.status !== "rejected"
  );
  if (overdue.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-vx-caution">
        <AlertTriangle size={14} className="flex-shrink-0" />
        {overdue.length} auction{overdue.length !== 1 ? "s" : ""} past their date — record the outcome
      </div>
      <div className="space-y-1.5">
        {overdue.map((l) => (
          <div key={l.id} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-vx-text">{l.address || "Untitled"} · {l.auctionDate}</span>
            <button onClick={() => onMoveToWon(l.id)} className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Won</button>
            <button onClick={() => onMoveToLost(l.id)} className="text-xs px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700">Lost</button>
            <button onClick={() => onMoveToWithdrawn(l.id)} className="text-xs px-2 py-0.5 rounded bg-gray-400 text-white hover:bg-gray-500">Withdrawn</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanLeadCard({ lead, isOpen, onOpen, onClose, onPromote, onDelete, onVerify, verifying, verifyError, ownerUid, onChange, marketStats }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const daysOld = Math.floor((Date.now() - (lead.dateAdded || Date.now())) / 86400000);
  const triage = computeTriageResult(lead.triage || newTriage());
  const stage = effectivePipelineStage(lead);

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, position: "relative", zIndex: 999 } : undefined}
      className={`bg-vx-bg border border-vx-divider rounded select-none transition-opacity ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1 p-2">
        <button
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 text-vx-muted hover:text-vx-text cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        >
          <GripVertical size={13} />
        </button>
        <button className="flex-1 min-w-0 text-left" onClick={isOpen ? onClose : onOpen}>
          <div className="text-xs font-medium text-vx-text truncate leading-tight">{lead.address || "Untitled lead"}</div>
          <div className="text-xs text-vx-muted font-mono mt-0.5">{fmtGBP(lead.guidePrice)}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {triage.result === "pass" && <span className="text-xs text-vx-positive">✓ DD</span>}
            {triage.result === "fail" && <span className="text-xs text-vx-negative">✗ DD</span>}
            {lead.auctionDate && <span className="text-xs text-vx-muted">{lead.auctionDate.slice(5)}</span>}
            <span className="text-xs text-vx-muted opacity-60">{daysOld}d</span>
            {lead.areaIntelligence && lead.areaIntelligence.imd && <ImdPill imd={lead.areaIntelligence.imd} />}
          </div>
        </button>
      </div>
      {stage === "Won" && lead.status !== "promoted" && onPromote && !isOpen && (
        <div className="px-2 pb-2">
          <button onClick={onPromote} className="w-full text-xs bg-navy text-white rounded py-1 hover:bg-navy/90 flex items-center justify-center gap-1">
            <ArrowRightCircle size={12} />Create deal
          </button>
        </div>
      )}
      {isOpen && !isDragging && (
        <div className="border-t border-vx-divider">
          <LeadCard
            lead={lead}
            onChange={onChange}
            onDelete={onDelete}
            onVerify={onVerify}
            verifying={verifying}
            verifyError={verifyError}
            onPromote={onPromote}
            stale={isStale(lead)}
            ownerUid={ownerUid}
            marketStats={marketStats}
            defaultOpen
          />
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ stage, leads, openLeadId, onOpenLead, onPromote, onDelete, onVerify, verifyingId, verifyError, ownerUid, onChange, marketStats }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const colors = STAGE_COLORS[stage] || STAGE_COLORS["Watching"];
  return (
    <div className="flex-shrink-0 w-52">
      <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${colors.bg}`}>
        <span className={`text-xs font-semibold ${colors.text}`}>{stage}</span>
        <span className={`text-xs font-mono opacity-70 ${colors.text}`}>{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-28 p-2 rounded-b-lg border border-t-0 space-y-2 transition-colors ${isOver ? "bg-blue-50 border-vx-accent" : "bg-vx-surface-2 border-vx-divider"}`}
      >
        {leads.map((lead) => (
          <KanbanLeadCard
            key={lead.id}
            lead={lead}
            isOpen={openLeadId === lead.id}
            onOpen={() => onOpenLead(lead.id)}
            onClose={() => onOpenLead(null)}
            onPromote={onPromote ? () => onPromote(lead) : null}
            onDelete={() => onDelete(lead.id)}
            onVerify={() => onVerify(lead)}
            verifying={verifyingId === lead.id}
            verifyError={verifyError && verifyError.id === lead.id ? verifyError.message : null}
            ownerUid={ownerUid}
            onChange={(p) => onChange(lead.id, p)}
            marketStats={marketStats}
          />
        ))}
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-10 text-xs text-vx-muted opacity-40">Drop here</div>
        )}
      </div>
    </div>
  );
}

function PipelineKanban({ leads, onMoveLead, openLeadId, onOpenLead, onPromote, onDelete, onVerify, verifyingId, verifyError, ownerUid, onChange, marketStats }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  const visibleLeads = leads.filter((l) => l.status !== "promoted" || l.pipelineStage);
  const liveLeads = visibleLeads.filter((l) => SOURCING_STAGES.includes(effectivePipelineStage(l)));
  const terminalLeads = visibleLeads.filter((l) => TERMINAL_STAGES.includes(effectivePipelineStage(l)));

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={({ active, over }) => { setActiveId(null); if (over && over.id !== active.id) onMoveLead(active.id, over.id); }}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
          {SOURCING_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={liveLeads.filter((l) => effectivePipelineStage(l) === stage)}
              openLeadId={openLeadId}
              onOpenLead={onOpenLead}
              onPromote={onPromote}
              onDelete={onDelete}
              onVerify={onVerify}
              verifyingId={verifyingId}
              verifyError={verifyError}
              ownerUid={ownerUid}
              onChange={onChange}
              marketStats={marketStats}
            />
          ))}
        </div>
        <DragOverlay>
          {activeLead && (
            <div className="bg-vx-bg border border-vx-accent shadow-lg rounded p-2 w-52 opacity-90 cursor-grabbing">
              <div className="text-xs font-medium text-vx-text truncate">{activeLead.address || "Untitled"}</div>
              <div className="text-xs text-vx-muted font-mono">{fmtGBP(activeLead.guidePrice)}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {terminalLeads.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-xs font-medium text-vx-muted hover:text-vx-text flex items-center gap-1.5 w-fit">
            <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
            {terminalLeads.length} closed lead{terminalLeads.length !== 1 ? "s" : ""} (Lost / Withdrawn)
          </summary>
          <div className="mt-3 flex gap-3 overflow-x-auto">
            {TERMINAL_STAGES.map((stage) => {
              const stageLeads = terminalLeads.filter((l) => effectivePipelineStage(l) === stage);
              if (stageLeads.length === 0) return null;
              return (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  leads={stageLeads}
                  openLeadId={openLeadId}
                  onOpenLead={onOpenLead}
                  onPromote={null}
                  onDelete={onDelete}
                  onVerify={() => {}}
                  verifyingId={null}
                  verifyError={null}
                  ownerUid={ownerUid}
                  onChange={onChange}
                  marketStats={marketStats}
                />
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

/* ─── FunnelView ──────────────────────────────────────────────────── P07 ─── */
function FunnelView({ leads, settings, onSettingsChange }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthly   = calcFunnelMonth(leads, thisMonth);
  const rolling   = calcFunnelRolling(leads, 3);
  const pace      = calcPaceIndicator(leads, 3);
  const standing  = sortStandingOffers(leads);

  const target = Number(settings?.appraisal?.viewingTargetPerMonth) || 20;
  const [editTarget, setEditTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState(String(target));
  const pct = Math.min(100, Math.round((monthly.viewings / target) * 100));

  function saveTarget() {
    const n = parseInt(targetDraft, 10);
    if (n > 0 && onSettingsChange) {
      onSettingsChange({ ...settings, appraisal: { ...(settings?.appraisal || {}), viewingTargetPerMonth: n } });
    }
    setEditTarget(false);
  }

  function FunnelBar({ label, n, d, rate }) {
    const pctVal = Math.min(100, Math.round(rate * 100));
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-vx-muted">
          <span>{label}</span>
          <span className="font-mono text-vx-text font-semibold">{n}/{d} ({pctVal}%)</span>
        </div>
        <div className="h-1.5 bg-vx-surface rounded-full overflow-hidden">
          <div className="h-full bg-vx-accent-strong rounded-full" style={{ width: `${pctVal}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-vx-muted">This month's viewings</span>
          <div className="flex items-center gap-2">
            {editTarget ? (
              <>
                <input type="number" min="1" max="999" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTarget()}
                  className="w-16 text-xs border border-vx-border rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-vx-accent" />
                <button onClick={saveTarget} className="text-xs text-vx-accent font-medium hover:underline">Save</button>
                <button onClick={() => setEditTarget(false)} className="text-xs text-vx-muted hover:text-vx-text">Cancel</button>
              </>
            ) : (
              <>
                <span className="text-xs text-vx-muted">Target: <span className="font-semibold text-vx-text">{target}</span></span>
                <button onClick={() => { setTargetDraft(String(target)); setEditTarget(true); }} className="text-xs text-vx-accent hover:underline">Edit</button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-end gap-3 mb-2">
          <span className="text-3xl font-mono font-bold text-vx-text">{monthly.viewings}</span>
          <span className="text-sm text-vx-muted mb-1">of {target} ({pct}%)</span>
        </div>
        <div className="h-2.5 bg-vx-surface rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-vx-positive" : pct >= 70 ? "bg-vx-accent-strong" : "bg-vx-caution"}`} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <div className="text-xs font-medium text-vx-muted mb-3">This month</div>
          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            {[["Viewings", monthly.viewings], ["Offers", monthly.offers], ["Accepted", monthly.accepted]].map(([lbl, val]) => (
              <div key={lbl}>
                <div className="text-2xl font-mono font-bold text-vx-text">{val}</div>
                <div className="text-xs text-vx-muted">{lbl}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <FunnelBar label="Offer rate (offers ÷ viewings)" n={monthly.offers} d={monthly.viewings} rate={monthly.offerRate} />
            <FunnelBar label="Accept rate (accepted ÷ offers)" n={monthly.accepted} d={monthly.offers} rate={monthly.acceptRate} />
          </div>
        </Card>

        <Card>
          <div className="text-xs font-medium text-vx-muted mb-3">Rolling 3 months</div>
          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            {[["Viewings", rolling.viewings], ["Offers", rolling.offers], ["Accepted", rolling.accepted]].map(([lbl, val]) => (
              <div key={lbl}>
                <div className="text-2xl font-mono font-bold text-vx-text">{val}</div>
                <div className="text-xs text-vx-muted">{lbl}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <FunnelBar label="Offer rate" n={rolling.offers} d={rolling.viewings} rate={rolling.offerRate} />
            <FunnelBar label="Accept rate" n={rolling.accepted} d={rolling.offers} rate={rolling.acceptRate} />
          </div>
          {pace && (
            <div className="mt-3 pt-3 border-t border-vx-divider text-xs text-vx-muted">
              Pace: ~<span className="font-semibold text-vx-text">{pace.perYear}</span> deal{pace.perYear !== 1 ? "s" : ""}/year at current rate
              <span className="ml-1 text-vx-muted/70">— Illustrative only</span>
            </div>
          )}
        </Card>
      </div>

      {standing.length > 0 && (
        <Card>
          <div className="text-xs font-medium text-vx-muted mb-3">Standing offers ({standing.length})</div>
          <div className="space-y-2">
            {standing.map(({ lead, viewing }, idx) => {
              const due = isFollowUpDue(viewing);
              return (
                <div key={viewing.id || idx} className={`flex items-center justify-between gap-3 rounded p-2 text-sm ${due ? "bg-amber-50 border border-amber-200" : "bg-vx-surface"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-vx-text truncate">{lead.address || "Untitled lead"}</div>
                    {viewing.offerAmount ? <div className="text-xs text-vx-muted">Offer: {fmtGBP(viewing.offerAmount)}</div> : null}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {viewing.followUpDate
                      ? <div className={`text-xs font-medium ${due ? "text-vx-caution" : "text-vx-muted"}`}>{due ? "Follow-up due " : "Follow-up "}{viewing.followUpDate}</div>
                      : <div className="text-xs text-vx-muted">No follow-up date</div>}
                    {viewing.notes && <div className="text-xs text-vx-muted truncate max-w-[180px]">{viewing.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {standing.length === 0 && <div className="text-center py-4 text-vx-muted text-sm">No standing offers right now.</div>}
    </div>
  );
}

/* ─── AgentsView ──────────────────────────────────────────────────── P07 ─── */
function AgentsView({ leads, agents, setAgents }) {
  const [form, setForm] = useState(null);

  function agentStats(agentId) {
    let viewings = 0, offers = 0, accepted = 0, lastDate = null;
    for (const lead of leads) {
      for (const v of (lead.viewings || [])) {
        if (v.agentId !== agentId) continue;
        viewings++;
        if (v.offerMade) offers++;
        if (v.outcome === "accepted") accepted++;
        if (v.date && (!lastDate || v.date > lastDate)) lastDate = v.date;
      }
    }
    const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000) : null;
    return { viewings, offers, accepted, lastDate, daysSince };
  }

  function saveForm() {
    if (!form?.name?.trim()) return;
    const isNew = !form.id;
    const agent = isNew ? { ...form, id: uid(), createdAt: Date.now() } : { ...form };
    setAgents(isNew ? [...agents, agent] : agents.map((a) => (a.id === agent.id ? agent : a)));
    setForm(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-vx-muted">{agents.length} agent{agents.length !== 1 ? "s" : ""} tracked</span>
        <button onClick={() => setForm({ name: "", phone: "", email: "", area: "", notes: "" })} className="flex items-center gap-1 text-xs font-medium bg-navy text-white px-2.5 py-1.5 rounded hover:bg-navy/90">
          <Plus size={13} />Add agent
        </button>
      </div>

      {form !== null && (
        <Card>
          <div className="text-xs font-medium text-vx-muted mb-3">{form.id ? "Edit agent" : "New agent"}</div>
          <div className="grid md:grid-cols-2 gap-3">
            <TextField label="Name *" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Sarah Jones — Better Buy Properties" />
            <TextField label="Phone" value={form.phone || ""} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+44 7700 900000" />
            <TextField label="Email" value={form.email || ""} onChange={(v) => setForm({ ...form, email: v })} placeholder="agent@example.com" />
            <TextField label="Area / patch" value={form.area || ""} onChange={(v) => setForm({ ...form, area: v })} placeholder="e.g. OL1, OL4, Oldham" />
            <div className="md:col-span-2">
              <TextField label="Notes" value={form.notes || ""} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Specialism, relationship, referral source…" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveForm} disabled={!form.name?.trim()} className="text-xs font-medium bg-navy text-white px-3 py-1.5 rounded hover:bg-navy/90 disabled:opacity-40">Save</button>
            <button onClick={() => setForm(null)} className="text-xs font-medium text-vx-muted hover:text-vx-text px-3 py-1.5">Cancel</button>
          </div>
        </Card>
      )}

      {agents.length === 0 && form === null && (
        <div className="text-center py-6 text-vx-muted text-sm">No agents yet. Add the estate agents and sourcing contacts who feed you viewings.</div>
      )}

      <div className="grid gap-3">
        {agents.map((agent) => {
          const stats = agentStats(agent.id);
          const stale = stats.daysSince !== null && stats.daysSince > 30;
          return (
            <Card key={agent.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-serif font-semibold text-vx-text">{agent.name}</span>
                    {stale && <Badge tone="warn">No contact {stats.daysSince}d</Badge>}
                  </div>
                  <div className="text-xs text-vx-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {agent.phone && <span className="flex items-center gap-1"><Phone size={11} />{agent.phone}</span>}
                    {agent.email && <span className="flex items-center gap-1"><Mail size={11} />{agent.email}</span>}
                    {agent.area && <span className="flex items-center gap-1"><MapPin size={11} />{agent.area}</span>}
                  </div>
                  {agent.notes && <div className="text-xs text-vx-muted mt-1">{agent.notes}</div>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setForm({ ...agent })} className="text-vx-muted hover:text-vx-text p-1"><Pencil size={14} /></button>
                  <button onClick={() => setAgents(agents.filter((a) => a.id !== agent.id))} className="text-vx-muted hover:text-vx-negative p-1"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-vx-divider flex items-center gap-5">
                {[["Viewings", stats.viewings], ["Offers", stats.offers], ["Accepted", stats.accepted]].map(([lbl, val]) => (
                  <div key={lbl} className="text-center">
                    <div className="font-mono font-bold text-vx-text">{val}</div>
                    <div className="text-xs text-vx-muted">{lbl}</div>
                  </div>
                ))}
                <div className="ml-auto text-right">
                  {stats.lastDate
                    ? <div className={`text-xs ${stale ? "text-vx-caution font-medium" : "text-vx-muted"}`}>Last activity {stats.lastDate} ({stats.daysSince}d ago)</div>
                    : <div className="text-xs text-vx-muted">No viewings yet</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SourcingView({ leads, setLeads, onPromote, ownerUid, buyBoxFilters, marketStats, targetAreas = [], onClearTargetAreas, agents = [], setAgents, settings, onSettingsChange }) {
  const [filter, setFilter] = useState("all");
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [region, setRegion] = useState("");
  const [towns, setTowns] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([...PROPERTY_TYPE_OPTIONS]);
  const [acquisitionTypes, setAcquisitionTypes] = useState([...ACQUISITION_TYPE_OPTIONS]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(150000);
  const [bedsMin, setBedsMin] = useState(2);
  const [bedsMax, setBedsMax] = useState(3);
  const [notes, setNotes] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState(null);
  const [researchNote, setResearchNote] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [expandedKanbanLeadId, setExpandedKanbanLeadId] = useState(null);
  const [gateDialog, setGateDialog] = useState(null);

  const visible = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => effectiveLeadStatus(l) === filter)),
    [leads, filter]
  );

  function addLead() { setLeads([newLead(), ...leads]); }
  function updateLead(id, partial) { setLeads(leads.map((l) => (l.id === id ? { ...l, ...partial } : l))); }
  function deleteLead(id) { setLeads(leads.filter((l) => l.id !== id)); }

  function toggleIn(arr, setArr, value) {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  }

  function changeRegion(nextRegion) {
    setRegion(nextRegion);
    setTowns([]); // town list is region-specific; clear rather than carry over mismatched towns
  }

  async function verifyComparables(lead) {
    setVerifyingId(lead.id);
    setVerifyError(null);
    try {
      const comps = await fetchLandRegistryComparables(lead.postcode);
      updateLead(lead.id, { comparables: comps, lastVerified: Date.now() });
    } catch (e) {
      setVerifyError({ id: lead.id, message: e.message });
    } finally {
      setVerifyingId(null);
    }
  }

  const briefIncomplete = towns.length === 0 || propertyTypes.length === 0 || acquisitionTypes.length === 0;

  async function runResearchPass() {
    if (briefIncomplete) return;
    setResearching(true);
    setResearchError(null);
    setResearchNote(null);
    const brief = { region, towns, propertyTypes, acquisitionTypes, priceMin: Number(priceMin) || 0, priceMax: Number(priceMax) || 0, bedsMin: Number(bedsMin) || 0, bedsMax: Number(bedsMax) || 0, notes };
    try {
      const fn = httpsCallable(functionsInstance, "researchLeads", { timeout: 170000 });
      // Map buy box filters to the shape the Cloud Function expects
      const strategyProfileForCF = buyBoxFilters ? {
        postcodeAreas:    buyBoxFilters.postcodeAreas    || [],
        postcodeDistricts:buyBoxFilters.postcodeDistricts|| [],
        assetTypes:       buyBoxFilters.propertyTypes    || [],
        maxGuide:         buyBoxFilters.priceMax         || 0,
      } : null;
      const res = await fn({ brief, strategyProfile: strategyProfileForCF });
      const found = res.data.leads || [];
      const newLeads = found.map((partial) => ({ ...newLead(), ...partial, status: partial.status || "new" }));
      const rejectedCount = newLeads.filter((l) => l.status === "rejected").length;
      setLeads([...newLeads, ...leads]);
      setResearchNote(
        found.length === 0
          ? `No leads found matching that brief (used ${res.data.searchesUsed || 0} searches) — try widening the price/bed range or selecting more towns.`
          : `Added ${found.length} lead${found.length === 1 ? "" : "s"}${rejectedCount ? ` (${rejectedCount} auto-rejected against your strategy profile — still visible, filter by "rejected" to review)` : ""} — worth verifying each one before promoting (used ${res.data.searchesUsed || 0} searches).`
      );
    } catch (e) {
      const code = e && e.code;
      if (code === "functions/permission-denied") setResearchError("This account isn't authorized to use AI research.");
      else if (code === "functions/unavailable") setResearchError("Couldn't reach the AI research service — check your connection and try again.");
      else if (code === "functions/deadline-exceeded") setResearchError("That brief took longer than the 3-minute limit — try selecting fewer towns and running it again.");
      else setResearchError((e && e.message) || "Something went wrong running the research pass.");
    }
    setResearching(false);
  }

  function promote(lead) {
    onPromote(leadToDealPartial(lead));
    updateLead(lead.id, { status: "promoted", pipelineStage: "Won" });
  }

  function moveLead(leadId, toStage) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (GATED_STAGES.has(toStage)) {
      const t = lead.triage || newTriage();
      const failures = TRIAGE_QUESTIONS.filter((q) => q.gating && t[q.key] === false).map((q) => q.failText);
      const incomplete = TRIAGE_QUESTIONS.filter((q) => q.gating && t[q.key] === null).map((q) => q.label);
      if (failures.length > 0 || incomplete.length > 0) {
        setGateDialog({ leadId, toStage, failures, incomplete });
        return;
      }
    }
    updateLead(leadId, { pipelineStage: toStage });
  }

  const staleCount = leads.filter((l) => l.status !== "promoted" && l.status !== "rejected" && isStale(l)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-vx-text">Pipeline</h1>
          <p className="text-sm text-vx-muted mt-1">Track leads from first sighting to exit — drag cards between stages or use list view.</p>
        </div>
        <button data-testid="add-lead" onClick={addLead} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded hover:bg-navy/90">
          <Plus size={16} />New lead
        </button>
      </div>

      {targetAreas.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-vx-muted uppercase tracking-wide">Target areas from Screener:</span>
            {targetAreas.map(a => (
              <span key={a.code} className="inline-flex items-center gap-1 bg-vx-surface border border-vx-border rounded-full px-2.5 py-0.5 text-xs font-medium text-vx-text">
                {a.name}
              </span>
            ))}
            <button onClick={onClearTargetAreas} className="ml-auto text-xs text-vx-muted hover:text-vx-danger cursor-pointer bg-transparent border-0">Clear all</button>
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <SectionTitle icon={Sparkles}>AI research pass</SectionTitle>
        <p className="text-sm text-vx-muted">
          Searches the live web for real leads matching this brief and adds them straight to the pipeline as status "new" — each run costs a small amount in API usage. Complex briefs (many towns) can take a minute or two — it's genuinely searching, not stuck.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <SelectField label="Region" value={region} onChange={changeRegion} options={Object.keys(REGION_TOWNS)} testId="research-region" />
          <div className="md:col-span-2">
            <ChipMultiSelect label={`Locations within ${region || "selected region"}`} options={REGION_TOWNS[region] || []} selected={towns} onToggle={(t) => toggleIn(towns, setTowns, t)} testIdPrefix="research-town" />
          </div>
        </div>

        <ChipMultiSelect label="Property types" options={PROPERTY_TYPE_OPTIONS} selected={propertyTypes} onToggle={(t) => toggleIn(propertyTypes, setPropertyTypes, t)} testIdPrefix="research-ptype" />
        <ChipMultiSelect label="Acquisition type" options={ACQUISITION_TYPE_OPTIONS} selected={acquisitionTypes} onToggle={(t) => toggleIn(acquisitionTypes, setAcquisitionTypes, t)} testIdPrefix="research-acqtype" />

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-medium text-vx-muted mb-1">Price range (£)</span>
            <div className="flex items-center gap-2">
              <input data-testid="research-price-min" type="number" min={0} step={5000} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="No min" className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
              <span className="text-vx-muted">–</span>
              <input data-testid="research-price-max" type="number" min={0} step={5000} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="No max" className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
            </div>
          </div>
          <div>
            <span className="block text-xs font-medium text-vx-muted mb-1">Bedrooms</span>
            <div className="flex items-center gap-2">
              <input data-testid="research-beds-min" type="number" min={0} value={bedsMin} onChange={(e) => setBedsMin(e.target.value)} placeholder="No min" className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
              <span className="text-vx-muted">–</span>
              <input data-testid="research-beds-max" type="number" min={0} value={bedsMax} onChange={(e) => setBedsMax(e.target.value)} placeholder="No max" className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
            </div>
          </div>
        </div>

        <TextField label="Anything else? (optional)" value={notes} onChange={setNotes} placeholder="e.g. prefer probate sales, chain-free only, near a train station" testId="research-notes" />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            data-testid="run-research"
            onClick={runResearchPass}
            disabled={researching || briefIncomplete}
            className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90 disabled:opacity-60"
          >
            <Sparkles size={14} />{researching ? "Researching…" : "Run research pass"}
          </button>
          {briefIncomplete && !researching && (
            <span className="text-xs text-vx-muted">Pick at least one town, property type, and acquisition type to run a search.</span>
          )}
        </div>

        {researchError && (
          <div data-testid="research-error" className="flex items-center gap-2 bg-rose-50 text-vx-negative border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertTriangle size={15} />{researchError}
          </div>
        )}
        {researchNote && (
          <div data-testid="research-note" className="flex items-center gap-2 bg-vx-surface text-vx-accent-strong border border-vx-divider rounded px-3 py-2 text-sm">
            <Info size={15} />{researchNote}
          </div>
        )}
      </Card>

      {staleCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 text-vx-caution border border-amber-200 rounded px-3 py-2 text-sm">
          <RefreshCw size={15} />{staleCount} lead{staleCount === 1 ? "" : "s"} haven't been re-verified in over {STALE_DAYS} days — guide prices and auction dates may be out of date.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-vx-surface-2 border border-vx-divider rounded p-0.5">
          {["list", "kanban", "funnel", "agents"].map((m) => (
            <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 text-xs rounded font-medium transition-colors capitalize ${viewMode === m ? "bg-vx-bg shadow-sm text-vx-text" : "text-vx-muted hover:text-vx-text"}`}>{m}</button>
          ))}
        </div>
        {viewMode === "list" && (
          <div className="flex gap-1.5 flex-wrap">
            {["all", ...LEAD_FILTER_STATUSES].map((s) => (
              <button
                key={s} data-testid={`lead-filter-${s}`}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === s ? "bg-navy text-white border-navy" : "bg-vx-bg text-vx-muted border-vx-border hover:bg-vx-surface"}`}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === "kanban" && (
        <AuctionOutcomeBanner
          leads={leads}
          onMoveToWon={(id) => moveLead(id, "Won")}
          onMoveToLost={(id) => moveLead(id, "Lost")}
          onMoveToWithdrawn={(id) => moveLead(id, "Withdrawn")}
        />
      )}

      {viewMode === "list" && (
        <>
          {visible.length === 0 ? (
            <Card className="text-center py-10 text-vx-muted text-sm">
              No leads {filter !== "all" ? `with status "${filter}"` : "yet"}. Add one manually, or populate this list from an AI research pass.
            </Card>
          ) : (
            <div className="grid gap-3">
              {visible.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onChange={(p) => updateLead(lead.id, p)}
                  onDelete={() => deleteLead(lead.id)}
                  onVerify={() => verifyComparables(lead)}
                  verifying={verifyingId === lead.id}
                  verifyError={verifyError && verifyError.id === lead.id ? verifyError.message : null}
                  onPromote={() => promote(lead)}
                  stale={isStale(lead)}
                  ownerUid={ownerUid}
                  marketStats={marketStats}
                  agents={agents}
                />
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === "kanban" && (
        <PipelineKanban
          leads={leads}
          onMoveLead={moveLead}
          openLeadId={expandedKanbanLeadId}
          onOpenLead={(id) => setExpandedKanbanLeadId(id === expandedKanbanLeadId ? null : id)}
          onPromote={promote}
          onDelete={deleteLead}
          onVerify={verifyComparables}
          verifyingId={verifyingId}
          verifyError={verifyError}
          ownerUid={ownerUid}
          onChange={updateLead}
          marketStats={marketStats}
        />
      )}

      {viewMode === "funnel" && (
        <FunnelView
          leads={leads}
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      )}

      {viewMode === "agents" && (
        <AgentsView
          leads={leads}
          agents={agents}
          setAgents={setAgents}
        />
      )}

      {gateDialog && (
        <StageGateDialog
          toStage={gateDialog.toStage}
          failures={gateDialog.failures}
          incomplete={gateDialog.incomplete}
          onConfirm={() => { updateLead(gateDialog.leadId, { pipelineStage: gateDialog.toStage }); setGateDialog(null); }}
          onCancel={() => setGateDialog(null)}
        />
      )}
    </div>
  );
}

/* =================================================================================
   LEGAL PACK REVIEW — an automated triage aid, never a verdict. Attached to
   either a Lead or a Deal. The disclaimer is permanent and cannot be hidden —
   see the note at the top of LegalPackSection's render for why that's a hard
   requirement here, not a copy choice.
   ================================================================================= */

const URGENCY_ORDER = ["Raise with solicitor before bidding", "Worth asking about", "Informational"];
const URGENCY_TONE = { "Raise with solicitor before bidding": "bad", "Worth asking about": "warn", "Informational": "default" };

function fmtBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

// VAT-inclusive breakdown of a legal pack review's extracted fees, split into
// "buyer's premium" (its own field on both Lead and Deal) and everything else
// (seller legal reimbursement, rental reimbursement, other) bucketed together.
function legalPackFeesBreakdown(fees) {
  if (!fees) return { buyerPremiumTotal: 0, otherReimbursementsTotal: 0 };
  const withVat = (amount, vat) => (Number(amount) || 0) * (vat ? 1.2 : 1);
  const buyerPremiumTotal = round2(withVat(fees.buyerPremium, fees.buyerPremiumVatApplied));
  const otherReimbursementsTotal = round2(
    withVat(fees.sellerLegalReimbursement, fees.sellerLegalReimbursementVatApplied) +
    withVat(fees.rentalReimbursement, fees.rentalReimbursementVatApplied) +
    (fees.otherFees || []).reduce((s, f) => s + withVat(f.amount, f.vatApplied), 0)
  );
  return { buyerPremiumTotal, otherReimbursementsTotal };
}

async function uploadLegalPackFile(ownerUid, entityType, entityId, file) {
  const docId = uid();
  const storagePath = `users/${ownerUid}/legalPacks/${entityType}/${entityId}/${docId}-${file.name}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: "application/pdf" });
  return { id: docId, filename: file.name, sizeBytes: file.size, storagePath, uploadedAt: Date.now(), status: "uploaded", errorMessage: "", review: null };
}

async function deleteLegalPackFile(storagePath) {
  if (!storagePath) return;
  try { await deleteObject(ref(storage, storagePath)); } catch (e) { /* already gone or never uploaded — fine either way */ }
}

function LegalPackSection({ documents, onChange, entityType, entityId, ownerUid, onApplyFees }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  const docs = documents || [];

  async function handleFiles(fileList) {
    setUploadError(null);
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const nonPdf = files.filter((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"));
    if (nonPdf.length) { setUploadError(`${nonPdf[0].name} isn't a PDF — only PDF files are supported.`); return; }
    const oversized = files.filter((f) => f.size > 40 * 1024 * 1024);
    if (oversized.length) { setUploadError(`${oversized[0].name} is over the 40MB limit — split it before uploading.`); return; }
    setUploading(true);
    try {
      const newDocs = [];
      for (const f of files) newDocs.push(await uploadLegalPackFile(ownerUid, entityType, entityId, f));
      onChange([...newDocs, ...docs]);
    } catch (e) {
      setUploadError(e.message || "Upload failed — check your connection and try again.");
    }
    setUploading(false);
  }

  async function analyze(docItem) {
    setAnalyzingId(docItem.id);
    onChange(docs.map((d) => (d.id === docItem.id ? { ...d, status: "analyzing", errorMessage: "" } : d)));
    try {
      const fn = httpsCallable(functionsInstance, "reviewLegalPack", { timeout: 290000 });
      const res = await fn({ storagePath: docItem.storagePath });
      onChange(docs.map((d) => (d.id === docItem.id ? { ...d, status: "reviewed", review: res.data } : d)));
    } catch (e) {
      const msg = (e && e.message) || "Analysis failed — try again, or check the Firebase Functions logs if it keeps happening.";
      onChange(docs.map((d) => (d.id === docItem.id ? { ...d, status: "error", errorMessage: msg } : d)));
    }
    setAnalyzingId(null);
  }

  async function removeDoc(docItem) {
    await deleteLegalPackFile(docItem.storagePath);
    onChange(docs.filter((d) => d.id !== docItem.id));
  }

  return (
    <Card className="space-y-3">
      <SectionTitle icon={FileWarning}>Legal pack review</SectionTitle>
      {/* This disclaimer is deliberately always visible, never dismissible, and never
          replaced by a pass/fail badge — an automated miss here has real legal and
          financial consequences, unlike a missed data-quality flag elsewhere in the app. */}
      <div className="flex items-start gap-2 bg-amber-50 text-vx-caution border border-amber-200 rounded px-3 py-2 text-xs">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>Automated triage only, not legal advice. This flags things worth asking a solicitor about — it does not tell you a pack is safe to bid on or exchange on, and it can miss things, especially handwritten notes or poor scans. Always get a solicitor's review before committing.</span>
      </div>

      <label className="flex items-center gap-1.5 text-sm font-medium text-vx-accent hover:underline cursor-pointer w-fit">
        <Upload size={14} />{uploading ? "Uploading…" : "Upload legal pack (PDF, multiple allowed)"}
        <input data-testid="legalpack-upload" type="file" accept="application/pdf" multiple className="hidden" disabled={uploading} onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {uploadError && <div data-testid="legalpack-upload-error" className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-3 py-2">{uploadError}</div>}

      {docs.length === 0 ? (
        <div className="text-sm text-vx-muted py-2">No legal pack documents uploaded yet.</div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="border border-vx-divider rounded p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={15} className="text-vx-muted" />
                  <span className="font-medium text-vx-text">{d.filename}</span>
                  <span className="text-xs text-vx-muted">{fmtBytes(d.sizeBytes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={{ uploaded: "default", analyzing: "info", reviewed: "good", error: "bad" }[d.status] || "default"}>{d.status}</Badge>
                  {d.status !== "analyzing" && (
                    <button data-testid={`legalpack-analyze-${d.id}`} onClick={() => analyze(d)} disabled={analyzingId === d.id} className="text-xs font-medium text-vx-accent hover:underline disabled:opacity-40">
                      {d.status === "reviewed" ? "Re-analyze" : "Analyze"}
                    </button>
                  )}
                  <button data-testid={`legalpack-delete-${d.id}`} onClick={() => removeDoc(d)} className="text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button>
                </div>
              </div>

              {d.status === "analyzing" && <div className="text-xs text-vx-muted">Reading the pack — large or multi-chunk packs can take a couple of minutes.</div>}
              {d.status === "error" && <div data-testid={`legalpack-error-${d.id}`} className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1.5">{d.errorMessage}</div>}

              {d.status === "reviewed" && d.review && (
                <div data-testid={`legalpack-result-${d.id}`} className="space-y-2">
                  <div className="text-xs text-vx-muted">{d.review.totalPages} page{d.review.totalPages === 1 ? "" : "s"}{d.review.chunksProcessed > 1 ? ` · processed in ${d.review.chunksProcessed} chunks` : ""}</div>
                  {d.review.tenureSummary && <div className="text-xs bg-vx-surface rounded px-2 py-1.5"><b>Tenure:</b> {d.review.tenureSummary}</div>}
                  {(d.review.flags || []).length === 0 ? (
                    <div className="text-xs text-vx-muted">No specific flags raised on this pass — this is not confirmation the pack is clear, only that nothing matched the categories checked. A solicitor review is still the real check.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {[...d.review.flags].sort((a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency)).map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs border-b border-vx-divider last:border-0 py-1.5">
                          <Badge tone={URGENCY_TONE[f.urgency] || "default"}>{f.urgency}</Badge>
                          <div className="flex-1">
                            <span className="font-medium text-vx-text">{f.category}</span>{f.pageHint ? <span className="text-vx-muted"> · {f.pageHint}</span> : null}
                            <div className="text-vx-muted">{f.summary}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(d.review.unreadableSections || []).length > 0 && (
                    <div className="text-xs bg-amber-50 text-vx-caution border border-amber-200 rounded px-2 py-1.5">
                      <b>Couldn't confidently read:</b> {d.review.unreadableSections.join("; ")}
                    </div>
                  )}

                  {d.review.additionalFees && (Number(d.review.additionalFees.total) > 0) && (
                    <div data-testid={`legalpack-fees-${d.id}`} className="text-xs bg-vx-surface rounded px-2 py-1.5 space-y-1">
                      <div className="font-medium text-vx-accent-strong">Additional fees found: <span className="font-mono">{fmtGBP(d.review.additionalFees.total)}</span> {d.review.additionalFees.feesParsedByFallback && <span className="text-vx-caution">(partly best-effort parsed from flag text — double-check)</span>}</div>
                      <ul className="text-vx-muted list-disc list-inside">
                        {d.review.additionalFees.buyerPremium > 0 && <li>Buyer's premium: {fmtGBP(d.review.additionalFees.buyerPremium)}{d.review.additionalFees.buyerPremiumVatApplied ? " +VAT" : ""}</li>}
                        {d.review.additionalFees.sellerLegalReimbursement > 0 && <li>Seller's legal reimbursement: {fmtGBP(d.review.additionalFees.sellerLegalReimbursement)}{d.review.additionalFees.sellerLegalReimbursementVatApplied ? " +VAT" : ""}</li>}
                        {d.review.additionalFees.rentalReimbursement > 0 && <li>Rental reimbursement: {fmtGBP(d.review.additionalFees.rentalReimbursement)}{d.review.additionalFees.rentalReimbursementVatApplied ? " +VAT" : ""}</li>}
                        {(d.review.additionalFees.otherFees || []).map((f, i) => <li key={i}>{f.label}: {fmtGBP(f.amount)}{f.vatApplied ? " +VAT" : ""}</li>)}
                      </ul>
                      {onApplyFees && (
                        <button data-testid={`legalpack-apply-fees-${d.id}`} onClick={() => onApplyFees(d.review)} className="text-vx-accent underline font-medium">
                          Apply to {entityType === "lead" ? "this lead" : "this deal"}
                        </button>
                      )}
                    </div>
                  )}

                  {d.review.completion && (Number(d.review.completion.completionDays) > 0 || d.review.completion.deadlineDate) && (
                    <div className="text-xs bg-vx-surface rounded px-2 py-1.5">
                      <b>Completion:</b> {d.review.completion.completionDays > 0 ? `${d.review.completion.completionDays} days from exchange` : ""}{d.review.completion.deadlineDate ? ` · deadline ${d.review.completion.deadlineDate}` : ""}
                      {d.review.completion.conditionsNote && <div className="text-vx-muted mt-0.5">{d.review.completion.conditionsNote}</div>}
                    </div>
                  )}

                  {(d.review.missingItems || []).length > 0 && (
                    <div data-testid={`legalpack-missing-${d.id}`} className="text-xs bg-rose-50 text-vx-negative border border-rose-200 rounded px-2 py-1.5">
                      <b>No evidence found of:</b> {d.review.missingItems.join(", ")} — worth asking whether these exist and simply weren't included, or are genuinely missing.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TriStateToggle({ value, onChange, testIdPrefix }) {
  const options = [{ v: true, label: "Yes" }, { v: false, label: "No" }, { v: null, label: "Unknown" }];
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.v)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o.label.toLowerCase()}` : undefined}
          onClick={() => onChange(o.v)}
          className={`px-2 py-0.5 rounded text-xs font-medium border ${value === o.v ? (o.v === true ? "bg-vx-positive text-white border-vx-positive" : o.v === false ? "bg-vx-negative text-white border-vx-negative" : "bg-vx-muted text-white border-vx-border") : "bg-vx-bg text-vx-muted border-vx-border hover:bg-vx-surface"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TriageBlock({ lead, onChange }) {
  const triage = lead.triage || newTriage();

  function setAnswer(key, value) {
    const next = { ...triage, [key]: value, scoredBy: "user" };
    const { result, failReason } = computeTriageResult(next);
    const updatedTriage = { ...next, result, failReason, scoredAt: Date.now() };
    // Single combined update — calling onChange twice here would silently drop
    // one of the two changes, since both would compute from the same stale
    // `leads` closure in the parent (the exact bug caught once already in the
    // Contacts category-switch handler).
    const patch = { triage: updatedTriage };
    if (result === "fail" && lead.status === "new") patch.status = "rejected";
    else if (result !== "fail" && triage.result === "fail" && lead.status === "rejected") patch.status = "new";
    onChange(patch);
  }

  const resultTone = { pass: "good", fail: "bad", incomplete: "default" }[triage.result] || "default";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-vx-muted">Strategy triage</span>
        <Badge tone={resultTone}><span data-testid={`triage-result-${lead.id}`}>{triage.result}</span></Badge>
      </div>
      {triage.result === "fail" && triage.failReason && (
        <div data-testid={`triage-fail-reason-${lead.id}`} className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1.5">{triage.failReason}</div>
      )}
      <div className="space-y-1.5">
        {TRIAGE_QUESTIONS.map((q) => (
          <div key={q.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-vx-muted flex-1">{q.label}{q.gating && <span className="text-vx-muted"> (gating)</span>}</span>
            <TriStateToggle value={triage[q.key]} onChange={(v) => setAnswer(q.key, v)} testIdPrefix={`triage-${q.key}-${lead.id}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead, onChange, onDelete, onVerify, verifying, verifyError, onPromote, stale, ownerUid, marketStats, agents = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusCheckError, setStatusCheckError] = useState(null);

  function set(field, value) { onChange({ [field]: value }); }
  function setComp(idx, key, value) {
    const arr = [...lead.comparables];
    arr[idx] = { ...arr[idx], [key]: value };
    onChange({ comparables: arr });
  }
  function addComp() { onChange({ comparables: [...lead.comparables, { label: "", value: "" }] }); }
  function removeComp(idx) { onChange({ comparables: lead.comparables.filter((_, i) => i !== idx) }); }

  function addViewing() {
    const v = { id: uid(), date: new Date().toISOString().slice(0, 10), type: "in_person", agentId: "", offerMade: false, offerAmount: null, outcome: "none", followUpDate: "", notes: "" };
    onChange({ viewings: [...(lead.viewings || []), v] });
  }
  function setViewing(idx, patch) {
    const arr = (lead.viewings || []).map((v, i) => i === idx ? { ...v, ...patch } : v);
    onChange({ viewings: arr });
  }
  function removeViewing(idx) { onChange({ viewings: (lead.viewings || []).filter((_, i) => i !== idx) }); }

  async function recheckStatus() {
    setCheckingStatus(true);
    setStatusCheckError(null);
    try {
      const fn = httpsCallable(functionsInstance, "recheckLeadStatus", { timeout: 55000 });
      const res = await fn({ sourceUrl: lead.sourceUrl, address: lead.address });
      onChange({ statusCheck: res.data });
    } catch (e) {
      const code = e && e.code;
      let msg = (e && e.message) || "Status check failed — try again.";
      if (code === "functions/permission-denied") msg = "This account isn't authorized to use this feature.";
      else if (code === "functions/unavailable") msg = "Couldn't reach the status-check service — check your connection and try again.";
      setStatusCheckError(msg);
    }
    setCheckingStatus(false);
  }

  // Legal pack review's extracted fees are the authoritative, freshly-read
  // figures — replace whatever placeholder values were here before, rather
  // than accumulate across re-analyses (unlike the deal-level version, which
  // adds on top since a deal may have other manually-entered costs already).
  function applyLegalPackFeesToLead(review) {
    const { buyerPremiumTotal, otherReimbursementsTotal } = legalPackFeesBreakdown(review.additionalFees);
    const patch = { buyerPremium: buyerPremiumTotal, sellerFeeReimbursements: otherReimbursementsTotal };
    if (review.completion && Number(review.completion.completionDays) > 0) patch.completionDays = Number(review.completion.completionDays);
    onChange(patch);
  }

  const statusTone = { new: "info", watchlist: "default", under_offer: "warn", rejected: "bad", promoted: "good" }[lead.status] || "default";
  const listingStatusTone = { still_live: "good", likely_gone: "bad", could_not_determine: "default" }[lead.statusCheck && lead.statusCheck.status] || null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <button data-testid={`lead-${lead.id}`} onClick={() => setOpen(!open)} className="text-left flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif font-semibold text-vx-text">{lead.address || "Untitled lead"}</span>
            <Badge tone={statusTone}>{lead.status.replace("_", " ")}</Badge>
            {effectiveLeadStatus(lead) === "unsold_check" && <Badge tone="info">unsold — check</Badge>}
            {stale && lead.status !== "promoted" && lead.status !== "rejected" && <Badge tone="warn">stale</Badge>}
            {listingStatusTone && lead.statusCheck.status !== "still_live" && <Badge tone={listingStatusTone}>{lead.statusCheck.status.replace(/_/g, " ")}</Badge>}
            {lead.areaIntelligence && lead.areaIntelligence.imd && <ImdPill imd={lead.areaIntelligence.imd} />}
            {lead.construction && lead.construction.confirmedType === "non-standard" && <Badge tone="bad">Non-std construction</Badge>}
          </div>
          <div className="text-xs text-vx-muted mt-1 flex items-center gap-1"><MapPin size={12} />{lead.postcode || "No postcode"} · {lead.propertyType} · {lead.source || "No source"}</div>
          <div className="flex gap-5 mt-2 text-sm font-mono tabular-nums">
            <span>Guide {fmtGBP(lead.guidePrice)}</span>
            {(lead.estResaleLow || lead.estResaleHigh) ? <span>Resale {fmtGBP(lead.estResaleLow)}–{fmtGBP(lead.estResaleHigh)}</span> : null}
            {lead.auctionDate && <span>Auction {lead.auctionDate}</span>}
          </div>
        </button>
        <div className="flex items-center gap-2">
          {lead.status !== "promoted" && (
            <button data-testid={`promote-${lead.id}`} onClick={onPromote} className="flex items-center gap-1 text-xs font-medium bg-navy text-white px-2.5 py-1.5 rounded hover:bg-navy/90">
              <ArrowRightCircle size={14} />Promote to deal
            </button>
          )}
          <button data-testid={`delete-lead-${lead.id}`} onClick={onDelete} className="text-vx-muted hover:text-vx-negative p-1"><Trash2 size={16} /></button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-vx-divider space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <TextField label="Address" value={lead.address} onChange={(v) => set("address", v)} testId={`lead-address-${lead.id}`} />
            <TextField label="Postcode" value={lead.postcode} onChange={(v) => set("postcode", v)} placeholder="e.g. OL1 4RL, G1 1AA, CF10 1EP" testId={`lead-postcode-${lead.id}`} />
            <SelectField label="Property type" value={lead.propertyType} onChange={(v) => set("propertyType", v)} options={["Terrace", "Semi", "Detached", "Flat"]} />
            <NumField label="Bedrooms" value={lead.bedrooms || 0} onChange={(v) => set("bedrooms", v)} prefix="" />
            <SelectField label="Listing type" value={lead.listingType} onChange={(v) => set("listingType", v)} options={LISTING_TYPES} testId={`lead-listingtype-${lead.id}`} />
            <SelectField label="Seller type" value={lead.sellerType} onChange={(v) => set("sellerType", v)} options={SELLER_TYPES} />
            <TextField label="Source" value={lead.source} onChange={(v) => set("source", v)} placeholder="e.g. EIG Property Auctions" />
            <TextField label="Source URL" value={lead.sourceUrl} onChange={(v) => set("sourceUrl", v)} placeholder="https://…" />
            <TextField label="Auction date" value={lead.auctionDate} onChange={(v) => set("auctionDate", v)} placeholder="YYYY-MM-DD" />
            <SelectField label="Status" value={lead.status} onChange={(v) => set("status", v)} options={LEAD_STATUSES} testId={`lead-status-${lead.id}`} />
            <NumField label="Guide price" value={lead.guidePrice} onChange={(v) => set("guidePrice", v)} testId={`lead-guideprice-${lead.id}`} />
            <NumField label="Est. refurb" value={lead.estRefurb} onChange={(v) => set("estRefurb", v)} />
            <NumField label="Est. legal & finance" value={lead.estLegalFinance} onChange={(v) => set("estLegalFinance", v)} />
            <NumField label="Est. resale — low" value={lead.estResaleLow} onChange={(v) => set("estResaleLow", v)} />
            <NumField label="Est. resale — high" value={lead.estResaleHigh} onChange={(v) => set("estResaleHigh", v)} />
          </div>

          <ChipMultiSelect label="Signals" options={LEAD_SIGNALS} selected={lead.signals || []} labels={SIGNAL_LABELS} onToggle={(s) => set("signals", (lead.signals || []).includes(s) ? lead.signals.filter((x) => x !== s) : [...(lead.signals || []), s])} testIdPrefix={`lead-signal-${lead.id}`} />

          {lead.listingType === "auction" && (
            <div className="grid md:grid-cols-3 gap-3 bg-vx-surface rounded p-3" data-testid={`auction-fields-${lead.id}`}>
              <TextField label="Auction house" value={lead.auctionHouse} onChange={(v) => set("auctionHouse", v)} />
              <TextField label="Lot number" value={lead.lotNumber} onChange={(v) => set("lotNumber", v)} />
              <SelectField label="Format" value={lead.auctionFormat} onChange={(v) => set("auctionFormat", v)} options={AUCTION_FORMATS} />
              <NumField label="Buyer's premium" value={lead.buyerPremium} onChange={(v) => set("buyerPremium", v)} testId={`lead-buyerpremium-${lead.id}`} />
              <NumField label="Seller fee reimbursements" value={lead.sellerFeeReimbursements} onChange={(v) => set("sellerFeeReimbursements", v)} />
              <NumField label="Completion (days)" value={lead.completionDays} onChange={(v) => set("completionDays", v)} prefix="" />
              <div className="md:col-span-3">
                <TextField label="Prior auction history" value={lead.priorAuctionHistory} onChange={(v) => set("priorAuctionHistory", v)} placeholder="e.g. withdrawn March 2026, unsold at £70k reserve" />
              </div>
            </div>
          )}

          <TriageBlock lead={lead} onChange={onChange} />

          {lead.listingType === "auction" && (
            <AuctionAssessmentV2 lead={lead} onChange={onChange} />
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-vx-muted">Listing status</span>
              <button data-testid={`recheck-status-${lead.id}`} onClick={recheckStatus} disabled={checkingStatus || (!lead.sourceUrl && !lead.address)} className="flex items-center gap-1 text-xs font-medium text-vx-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
                <RefreshCw size={13} />{checkingStatus ? "Checking…" : "Re-check still live"}
              </button>
            </div>
            {!lead.sourceUrl && !lead.address && <div className="text-xs text-vx-muted mb-2">Add a source URL or address first.</div>}
            {statusCheckError && <div data-testid={`status-check-error-${lead.id}`} className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1.5 mb-2">{statusCheckError}</div>}
            {lead.statusCheck && (
              <div data-testid={`status-check-result-${lead.id}`} className={`text-xs rounded px-2 py-1.5 mb-2 ${listingStatusTone === "bad" ? "bg-rose-50 text-vx-negative border border-rose-200" : listingStatusTone === "good" ? "bg-emerald-50 text-vx-positive border border-emerald-200" : "bg-vx-surface text-vx-muted border border-vx-divider"}`}>
                <div className="font-medium">{lead.statusCheck.status.replace(/_/g, " ")}</div>
                <div>{lead.statusCheck.detail}</div>
                <div className="text-vx-muted mt-1">Checked {new Date(lead.statusCheck.checkedAt).toLocaleDateString("en-GB")} · {lead.statusCheck.method === "direct_fetch" ? "read the listing page directly" : "fresh web search (page couldn't be read directly)"}</div>
              </div>
            )}
          </div>

          <AreaIntelligencePanel postcode={lead.postcode} cached={lead.areaIntelligence} onChange={(r) => onChange({ areaIntelligence: r })} epcCached={lead.epcCheck} onEpcChange={(r) => onChange({ epcCheck: r })} marketStats={marketStats} propertyType={lead.propertyType} construction={lead.construction} onConstructionChange={(r) => onChange({ construction: r })} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-vx-muted">Comparables</span>
              <button data-testid={`verify-${lead.id}`} onClick={onVerify} disabled={verifying || !lead.postcode} className="flex items-center gap-1 text-xs font-medium text-vx-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
                <ShieldCheck size={13} />{verifying ? "Checking Land Registry…" : "Verify via Land Registry"}
              </button>
            </div>
            {verifyError && <div data-testid={`verify-error-${lead.id}`} className="text-xs text-vx-negative bg-rose-50 border border-rose-200 rounded px-2 py-1.5 mb-2">{verifyError}</div>}
            {lead.lastVerified && <div className="text-xs text-vx-muted mb-2">Last verified {new Date(lead.lastVerified).toLocaleDateString("en-GB")}</div>}
            <div className="space-y-1.5">
              {lead.comparables.map((c, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                  <input value={c.label} onChange={(e) => setComp(i, "label", e.target.value)} placeholder="Label" className="col-span-2 text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
                  <input value={c.value} onChange={(e) => setComp(i, "value", e.target.value)} placeholder="Value" className="col-span-2 text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
                  <button onClick={() => removeComp(i)} className="text-vx-muted hover:text-vx-negative justify-self-end"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={addComp} className="flex items-center gap-1 text-xs text-vx-accent font-medium hover:underline mt-2"><Plus size={12} />Add comparable manually</button>
          </div>

          {/* Viewing log — P07 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-vx-muted">Viewings ({(lead.viewings || []).length})</span>
              <button onClick={addViewing} className="flex items-center gap-1 text-xs font-medium text-vx-accent hover:underline"><Plus size={12} />Log viewing</button>
            </div>
            {(lead.viewings || []).length === 0 && (
              <div className="text-xs text-vx-muted py-2">No viewings logged yet.</div>
            )}
            <div className="space-y-3">
              {(lead.viewings || []).map((v, idx) => {
                const due = isFollowUpDue(v);
                return (
                  <div key={v.id || idx} className={`rounded border p-3 space-y-2 text-sm ${due ? "border-amber-300 bg-amber-50" : "border-vx-border bg-vx-surface"}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs text-vx-muted mb-0.5">Date</label>
                        <input type="date" value={v.date || ""} onChange={(e) => setViewing(idx, { date: e.target.value })} className="w-full text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg" />
                      </div>
                      <div>
                        <label className="block text-xs text-vx-muted mb-0.5">Type</label>
                        <select value={v.type || "in_person"} onChange={(e) => setViewing(idx, { type: e.target.value })} className="w-full text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg">
                          <option value="in_person">In person</option>
                          <option value="virtual">Virtual</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-vx-muted mb-0.5">Agent</label>
                        <select value={v.agentId || ""} onChange={(e) => setViewing(idx, { agentId: e.target.value })} className="w-full text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg">
                          <option value="">— none —</option>
                          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-vx-muted mb-0.5">Outcome</label>
                        <select value={v.outcome || "none"} onChange={(e) => setViewing(idx, { outcome: e.target.value })} className="w-full text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg">
                          <option value="none">No decision</option>
                          <option value="standing">Standing offer</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="withdrawn">Withdrawn</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={!!v.offerMade} onChange={(e) => setViewing(idx, { offerMade: e.target.checked, offerAmount: e.target.checked ? v.offerAmount : null })} className="w-3.5 h-3.5" />
                        Offer made
                      </label>
                      {v.offerMade && (
                        <div>
                          <label className="block text-xs text-vx-muted mb-0.5">Offer amount</label>
                          <input type="number" min="0" step="1000" value={v.offerAmount ?? ""} onChange={(e) => setViewing(idx, { offerAmount: e.target.value === "" ? null : Number(e.target.value) })} placeholder="£" className="w-full text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg" />
                        </div>
                      )}
                      {v.outcome === "standing" && (
                        <div className={v.offerMade ? "md:col-start-3" : "md:col-start-2"}>
                          <label className="block text-xs text-vx-muted mb-0.5">Follow-up date {due && <span className="text-vx-caution font-semibold">· Due!</span>}</label>
                          <input type="date" value={v.followUpDate || ""} onChange={(e) => setViewing(idx, { followUpDate: e.target.value })} className="w-full text-xs border border-vx-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg" />
                        </div>
                      )}
                      <div className="md:col-start-4 flex justify-end">
                        <button onClick={() => removeViewing(idx)} className="text-vx-muted hover:text-vx-negative p-1"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div>
                      <input type="text" value={v.notes || ""} onChange={(e) => setViewing(idx, { notes: e.target.value })} placeholder="Notes (outcome detail, vendor reaction, condition flags…)" className="w-full text-xs border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-vx-accent bg-vx-bg" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-vx-muted mb-1">Risk notes</span>
            <textarea value={lead.riskNotes} onChange={(e) => set("riskNotes", e.target.value)} rows={2} className="w-full text-sm border border-vx-border rounded p-2 outline-none focus:ring-2 focus:ring-vx-accent" placeholder="Auction guide can rise at hammer; confirm comps within 1 mile…" />
          </label>

          {lead.sourceUrl && /^https?:\/\//.test(lead.sourceUrl) && (
            <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-vx-accent hover:underline">
              <ExternalLink size={12} />Open source listing
            </a>
          )}

          <LegalPackSection
            documents={lead.legalPackDocuments}
            onChange={(docs) => onChange({ legalPackDocuments: docs })}
            entityType="lead"
            entityId={lead.id}
            ownerUid={ownerUid}
            onApplyFees={applyLegalPackFeesToLead}
          />
        </div>
      )}
    </Card>
  );
}

/* =================================================================================
   CONTACTS DIRECTORY — trade contractors and professional services (solicitor,
   broker, accountant, surveyor, etc.), kept alongside everything else in the same
   per-user Firestore document.
   ================================================================================= */

function StarRating({ value, onChange, testIdPrefix }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          data-testid={testIdPrefix ? `${testIdPrefix}-${n}` : undefined}
          onClick={() => onChange(n === value ? 0 : n)}
          className="p-0.5"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star size={16} className={n <= value ? "fill-amber-400 text-vx-caution" : "text-vx-muted"} />
        </button>
      ))}
    </div>
  );
}

function ContactsView({ contacts, setContacts }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  function addContact() { setContacts([newContact(), ...contacts]); }
  function updateContact(id, partial) { setContacts(contacts.map((c) => (c.id === id ? { ...c, ...partial } : c))); }
  function deleteContact(id) { setContacts(contacts.filter((c) => c.id !== id)); }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q && !(`${c.name} ${c.company} ${c.type}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [contacts, categoryFilter, statusFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-vx-text">Contacts</h1>
          <p className="text-sm text-vx-muted mt-1">Your trade contractors and professional services, in one place.</p>
        </div>
        <button data-testid="add-contact" onClick={addContact} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded hover:bg-navy/90">
          <Plus size={16} />New contact
        </button>
      </div>

      <Card className="space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <TextField label="Search" value={search} onChange={setSearch} placeholder="Name, company, or trade…" testId="contact-search" />
          <SelectField label="Category" value={categoryFilter} onChange={setCategoryFilter} options={["all", ...CONTACT_CATEGORIES]} testId="contact-filter-category" />
          <SelectField label="Status" value={statusFilter} onChange={setStatusFilter} options={["all", ...CONTACT_STATUSES]} testId="contact-filter-status" />
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card className="text-center py-10 text-vx-muted text-sm">
          {contacts.length === 0 ? "No contacts yet. Add your solicitor, broker, and trades as you work with them." : "No contacts match this filter."}
        </Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((c) => (
            <ContactCard key={c.id} contact={c} onChange={(p) => updateContact(c.id, p)} onDelete={() => deleteContact(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactCard({ contact, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  function set(field, value) { onChange({ [field]: value }); }

  const statusTone = { Preferred: "good", Active: "info", Untested: "default", Avoid: "bad" }[contact.status] || "default";
  const typeOptions = contact.category === "Trade" ? TRADE_TYPES : PROFESSIONAL_TYPES;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <button data-testid={`contact-${contact.id}`} onClick={() => setOpen(!open)} className="text-left flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif font-semibold text-vx-text">{contact.name || "Unnamed contact"}</span>
            <Badge tone={statusTone}>{contact.status}</Badge>
          </div>
          <div className="text-xs text-vx-muted mt-1">{contact.type}{contact.company ? ` · ${contact.company}` : ""}{contact.areaCovered ? ` · ${contact.areaCovered}` : ""}</div>
          <div className="flex items-center gap-4 mt-2 text-sm">
            {contact.phone && <span className="flex items-center gap-1 text-vx-muted"><Phone size={13} />{contact.phone}</span>}
            {contact.rating > 0 && <StarRating value={contact.rating} onChange={() => {}} />}
          </div>
        </button>
        <button data-testid={`delete-contact-${contact.id}`} onClick={onDelete} className="text-vx-muted hover:text-vx-negative p-1"><Trash2 size={16} /></button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-vx-divider space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <TextField label="Name" value={contact.name} onChange={(v) => set("name", v)} testId={`contact-name-${contact.id}`} />
            <TextField label="Company" value={contact.company} onChange={(v) => set("company", v)} />
            <SelectField
              label="Category"
              value={contact.category}
              onChange={(v) => onChange({ category: v, type: v === "Trade" ? TRADE_TYPES[0] : PROFESSIONAL_TYPES[0] })}
              options={CONTACT_CATEGORIES}
              testId={`contact-category-${contact.id}`}
            />
            <SelectField label="Type" value={contact.type} onChange={(v) => set("type", v)} options={typeOptions} testId={`contact-type-${contact.id}`} />
            <TextField label="Phone" value={contact.phone} onChange={(v) => set("phone", v)} testId={`contact-phone-${contact.id}`} />
            <TextField label="Email" value={contact.email} onChange={(v) => set("email", v)} />
            <TextField label="Area covered" value={contact.areaCovered} onChange={(v) => set("areaCovered", v)} placeholder="e.g. Rochdale, Edinburgh, Cardiff — town, city or region" />
            <TextField label="Rate" value={contact.rate} onChange={(v) => set("rate", v)} placeholder="e.g. £180/day, £45/hr" />
            <SelectField label="Status" value={contact.status} onChange={(v) => set("status", v)} options={CONTACT_STATUSES} testId={`contact-status-${contact.id}`} />
          </div>
          <div>
            <span className="block text-xs font-medium text-vx-muted mb-1">Rating</span>
            <StarRating value={contact.rating} onChange={(v) => set("rating", v)} testIdPrefix={`contact-rating-${contact.id}`} />
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-vx-muted mb-1">Notes</span>
            <textarea value={contact.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full text-sm border border-vx-border rounded p-2 outline-none focus:ring-2 focus:ring-vx-accent" placeholder="e.g. used on 14 Sample Terrace, good work, slow to invoice" />
          </label>
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-xs text-vx-accent hover:underline">
              <Mail size={12} />{contact.email}
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

/* =================================================================================
   PROPERTIES — list, detail, and sub-views (Overview, Tenancy, Compliance,
   Rent Ledger, Refinance Readiness)
   ================================================================================= */

function complianceTone(status) {
  return { Valid: "good", "Expiring Soon": "warn", Overdue: "bad", Unknown: "default" }[status] || "default";
}

function PropertiesListView({ properties, deals, onSelect, onAdd, onDelete }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const visible = statusFilter === "all" ? properties : properties.filter((p) => p.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-vx-text">Properties</h1>
          <p className="text-sm text-vx-muted mt-1">Post-purchase management — compliance, tenancy, rent ledger, and refinance readiness.</p>
        </div>
        <button data-testid="add-property" onClick={onAdd} className="flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded hover:bg-navy/90">
          <Plus size={16} />New property
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {["all", ...PROPERTY_STATUSES].map((s) => (
          <button
            key={s} data-testid={`property-filter-${s}`}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${statusFilter === s ? "bg-navy text-white border-navy" : "bg-vx-bg text-vx-muted border-vx-border hover:bg-vx-surface"}`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="text-center py-10 text-vx-muted text-sm">
          {properties.length === 0
            ? "No properties yet. Add one directly, or move a deal here once you decide to hold it as a rental (Deals \u2192 Returns & rental \u2192 Move to rental management)."
            : "No properties match this filter."}
        </Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((p) => {
            const linkedDeal = deals.find((d) => d.id === p.dealId);
            const readiness = calcRefinanceReadiness(p, linkedDeal);
            const rent = readiness.rent;
            return (
              <Card key={p.id} className="hover:border-vx-accent transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <button data-testid={`property-${p.id}`} onClick={() => onSelect(p.id)} className="text-left flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif font-semibold text-vx-text">{p.address || "Untitled property"}</span>
                      <Badge>{p.status}</Badge>
                      {p.dealId && <Badge tone="info">linked deal</Badge>}
                      {readiness.complianceIssues.length > 0 && <Badge tone="bad">{readiness.complianceIssues.length} compliance issue{readiness.complianceIssues.length === 1 ? "" : "s"}</Badge>}
                    </div>
                    <div className="text-xs text-vx-muted mt-1">{p.town}{p.postcode ? `, ${p.postcode}` : ""} · {p.propertyType} · EPC {p.epcRating}</div>
                    <div className="flex gap-5 mt-2 text-sm font-mono tabular-nums">
                      <span>Rent {fmtGBP(p.tenancy.monthlyRent)}/mo</span>
                      {rent.arrears > 0 && <span className="text-vx-negative">Arrears {fmtGBP(rent.arrears)}</span>}
                      <span>Seasoning {rent.seasoningMonths} mo</span>
                    </div>
                  </button>
                  <button data-testid={`delete-property-${p.id}`} onClick={() => onDelete(p.id)} className="text-vx-muted hover:text-vx-negative p-1"><Trash2 size={16} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PROPERTY_TABS = ["Overview", "Tenancy", "Compliance", "Rent Ledger", "Refinance Readiness"];

function PropertyDetailView({ property, linkedDeal, onChange, onDelete, onBack }) {
  const [subTab, setSubTab] = useState(PROPERTY_TABS[0]);
  function set(field, value) { onChange({ [field]: value }); }
  function setTenancy(field, value) { onChange({ tenancy: { ...property.tenancy, [field]: value } }); }

  const readiness = useMemo(() => calcRefinanceReadiness(property, linkedDeal), [property, linkedDeal]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-vx-muted hover:text-vx-text"><ChevronLeft size={16} />All properties</button>
        <button data-testid="delete-property-detail" onClick={() => onDelete(property.id)} className="flex items-center gap-1 text-sm text-vx-negative hover:text-vx-negative"><Trash2 size={14} />Delete property</button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <input data-testid="property-address-input" value={property.address} onChange={(e) => set("address", e.target.value)} placeholder="Address" className="font-serif text-2xl font-semibold text-vx-text bg-transparent outline-none border-b border-transparent focus:border-vx-accent w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={readiness.verdict === "READY" ? "good" : readiness.verdict === "ALMOST READY" ? "warn" : "bad"}>{readiness.verdict}</Badge>
          <SelectField label="" value={property.status} onChange={(v) => set("status", v)} options={PROPERTY_STATUSES} testId="property-status" />
        </div>
      </div>
      {linkedDeal && <div className="text-xs text-vx-muted flex items-center gap-1"><Building2 size={12} />Linked to deal: {linkedDeal.name}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Monthly rent" value={fmtGBP(property.tenancy.monthlyRent)} />
        <KPI label="Arrears" value={fmtGBP(readiness.rent.arrears)} tone={readiness.rent.arrears > 0 ? "bad" : "good"} />
        <KPI label="Rent seasoning" value={`${readiness.rent.seasoningMonths} mo`} />
        <KPI label="Compliance issues" value={readiness.complianceIssues.length} tone={readiness.complianceIssues.length > 0 ? "bad" : "good"} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-vx-divider">
        {PROPERTY_TABS.map((t) => (
          <button key={t} data-testid={`property-subtab-${t}`} onClick={() => setSubTab(t)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${subTab === t ? "border-vx-accent text-vx-accent-strong" : "border-transparent text-vx-muted hover:text-vx-text"}`}>{t}</button>
        ))}
      </div>

      {subTab === "Overview" && (
        <>
          <Card className="space-y-4">
            <SectionTitle>Property details</SectionTitle>
            <div className="grid md:grid-cols-3 gap-3">
              <TextField label="Town" value={property.town} onChange={(v) => set("town", v)} />
              <TextField label="Postcode" value={property.postcode} onChange={(v) => set("postcode", v)} />
              <SelectField label="Property type" value={property.propertyType} onChange={(v) => set("propertyType", v)} options={["Terrace", "Semi", "Detached", "Flat"]} />
              <SelectField label="EPC rating" value={property.epcRating} onChange={(v) => set("epcRating", v)} options={EPC_RATINGS} testId="property-epc" />
              <NumField label="Current valuation (manual, or blank to use linked deal's GDV)" value={property.currentValuation} onChange={(v) => set("currentValuation", v)} testId="property-valuation" />
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-vx-muted mb-1">Notes</span>
              <textarea value={property.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className="w-full text-sm border border-vx-border rounded p-2 outline-none focus:ring-2 focus:ring-vx-accent" />
            </label>
          </Card>
          <AreaIntelligencePanel postcode={property.postcode} cached={property.areaIntelligence} onChange={(r) => onChange({ areaIntelligence: r })} epcCached={property.epcCheck} onEpcChange={(r) => onChange({ epcCheck: r })} marketStats={{}} propertyType={property.propertyType} />
        </>
      )}

      {subTab === "Tenancy" && (
        <Card className="space-y-4">
          <SectionTitle icon={KeyRound}>Tenancy (periodic — Renters' Rights Act)</SectionTitle>
          <p className="text-xs text-vx-muted">All tenancies are periodic from day one under the RRA — no fixed-term expiry to track, tenants can leave on 2 months' notice at any time.</p>
          <div className="grid md:grid-cols-3 gap-3">
            <TextField label="Tenant name" value={property.tenancy.tenantName} onChange={(v) => setTenancy("tenantName", v)} testId="tenancy-name" />
            <TextField label="Tenancy start date" value={property.tenancy.tenancyStartDate} onChange={(v) => setTenancy("tenancyStartDate", v)} placeholder="YYYY-MM-DD" testId="tenancy-start" />
            <NumField label="Monthly rent" value={property.tenancy.monthlyRent} onChange={(v) => setTenancy("monthlyRent", v)} testId="tenancy-rent" />
            <NumField label="Deposit amount" value={property.tenancy.depositAmount} onChange={(v) => setTenancy("depositAmount", v)} />
            <SelectField label="Deposit scheme" value={property.tenancy.depositScheme || DEPOSIT_SCHEMES[3]} onChange={(v) => setTenancy("depositScheme", v)} options={DEPOSIT_SCHEMES} />
            <TextField label="Deposit protected date" value={property.tenancy.depositProtectedDate} onChange={(v) => setTenancy("depositProtectedDate", v)} placeholder="YYYY-MM-DD (must be within 30 days)" testId="tenancy-deposit-date" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!property.tenancy.prescribedInfoServed} onChange={(e) => setTenancy("prescribedInfoServed", e.target.checked)} />
              Prescribed information served to tenant
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!property.tenancy.rraInfoSheetIssued} onChange={(e) => setTenancy("rraInfoSheetIssued", e.target.checked)} data-testid="tenancy-rra-sheet" />
              Renters' Rights Act Information Sheet issued <span className="text-vx-muted">(required by 31 May 2026 for existing tenancies — penalty up to £7,000 if missed)</span>
            </label>
          </div>
        </Card>
      )}

      {subTab === "Compliance" && <ComplianceTab property={property} onChange={onChange} />}
      {subTab === "Rent Ledger" && <RentLedgerTab property={property} onChange={onChange} />}

      {subTab === "Refinance Readiness" && (
        <Card className="space-y-4">
          <SectionTitle icon={Banknote}>BRRR refinance readiness</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KPI label="Current valuation" value={fmtGBP(readiness.currentValuation)} sub={linkedDeal && !property.currentValuation ? "from linked deal's GDV" : undefined} />
            <KPI label="Rent seasoning" value={`${readiness.rent.seasoningMonths} months`} />
            <KPI label="Verdict" value={readiness.verdict} tone={readiness.verdict === "READY" ? "good" : readiness.verdict === "ALMOST READY" ? "warn" : "bad"} />
          </div>
          <div className="space-y-1.5">
            {readiness.checks.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-vx-divider last:border-0">
                <span className="flex items-center gap-2">{c.pass ? <CheckCircle2 size={15} className="text-vx-positive" /> : <XCircle size={15} className="text-vx-negative" />}{c.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ComplianceTab({ property, onChange }) {
  const items = property.compliance || [];
  function addItem() { onChange({ compliance: [{ id: uid(), type: COMPLIANCE_TYPES[0], expiryDate: "", notes: "" }, ...items] }); }
  function updateItem(id, partial) { onChange({ compliance: items.map((it) => (it.id === id ? { ...it, ...partial } : it)) }); }
  function removeItem(id) { onChange({ compliance: items.filter((it) => it.id !== id) }); }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={ClipboardCheck}>Compliance items</SectionTitle>
      </div>
      <p className="text-xs text-vx-muted">Gas Safety and EICR are recurring (annual / 5-yearly) — add a fresh item with the new expiry date each time you renew, rather than editing the old one, so the history stays intact.</p>
      <button data-testid="add-compliance" onClick={addItem} className="flex items-center gap-1 text-sm text-vx-accent font-medium hover:underline"><Plus size={14} />Add compliance item</button>
      {items.length === 0 ? (
        <div className="text-sm text-vx-muted py-4 text-center">No compliance items tracked yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const status = complianceItemStatus(it.expiryDate);
            return (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center border border-vx-divider rounded p-2">
                <div className="col-span-3">
                  <select data-testid={`compliance-type-${it.id}`} value={it.type} onChange={(e) => updateItem(it.id, { type: e.target.value })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg">
                    {COMPLIANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <input data-testid={`compliance-expiry-${it.id}`} type="text" placeholder="YYYY-MM-DD" value={it.expiryDate} onChange={(e) => updateItem(it.id, { expiryDate: e.target.value })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
                </div>
                <div className="col-span-4">
                  <input type="text" placeholder="Notes" value={it.notes} onChange={(e) => updateItem(it.id, { notes: e.target.value })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" />
                </div>
                <div className="col-span-1"><Badge tone={complianceTone(status)}>{status}</Badge></div>
                <div className="col-span-1 flex justify-end"><button onClick={() => removeItem(it.id)} className="text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button></div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RentLedgerTab({ property, onChange }) {
  const ledger = property.rentLedger || [];
  const summary = calcRentSummary(property);
  function addEntry() { onChange({ rentLedger: [{ id: uid(), date: "", amountDue: property.tenancy.monthlyRent || 0, amountReceived: 0, status: "Paid", notes: "" }, ...ledger] }); }
  function updateEntry(id, partial) { onChange({ rentLedger: ledger.map((e) => (e.id === id ? { ...e, ...partial } : e)) }); }
  function removeEntry(id) { onChange({ rentLedger: ledger.filter((e) => e.id !== id) }); }

  return (
    <Card className="space-y-3">
      <SectionTitle icon={Calendar}>Rent ledger (manual)</SectionTitle>
      <p className="text-xs text-vx-muted">A manual record, not bank-reconciled — this is the evidence trail courts now expect for a Section 8 case, so keep it current even if you also use a rent-collection tool day to day.</p>
      <div className="flex flex-wrap gap-4 text-sm font-mono bg-vx-surface rounded px-3 py-2">
        <span>Total due: <b>{fmtGBP(summary.totalDue)}</b></span>
        <span>Total received: <b>{fmtGBP(summary.totalReceived)}</b></span>
        <span className={summary.arrears > 0 ? "text-vx-negative" : "text-vx-positive"}>Arrears: <b>{fmtGBP(summary.arrears)}</b></span>
        <span>Seasoning: <b>{summary.seasoningMonths} months</b></span>
      </div>
      <button data-testid="add-rent-entry" onClick={addEntry} className="flex items-center gap-1 text-sm text-vx-accent font-medium hover:underline"><Plus size={14} />Add rent entry</button>
      {ledger.length === 0 ? (
        <div className="text-sm text-vx-muted py-4 text-center">No rent entries yet.</div>
      ) : (
        <div className="space-y-2">
          {ledger.map((e) => (
            <div key={e.id} className="grid grid-cols-12 gap-2 items-center border border-vx-divider rounded p-2">
              <div className="col-span-2"><input data-testid={`rent-date-${e.id}`} type="text" placeholder="YYYY-MM-DD" value={e.date} onChange={(ev) => updateEntry(e.id, { date: ev.target.value })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" /></div>
              <div className="col-span-2"><input type="number" placeholder="Due" value={e.amountDue} onChange={(ev) => updateEntry(e.id, { amountDue: Number(ev.target.value) || 0 })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" /></div>
              <div className="col-span-2"><input data-testid={`rent-received-${e.id}`} type="number" placeholder="Received" value={e.amountReceived} onChange={(ev) => updateEntry(e.id, { amountReceived: Number(ev.target.value) || 0 })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" /></div>
              <div className="col-span-2">
                <select data-testid={`rent-status-${e.id}`} value={e.status} onChange={(ev) => updateEntry(e.id, { status: ev.target.value })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg">
                  {RENT_ENTRY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-3"><input type="text" placeholder="Notes" value={e.notes} onChange={(ev) => updateEntry(e.id, { notes: ev.target.value })} className="w-full text-sm border border-vx-border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-vx-accent" /></div>
              <div className="col-span-1 flex justify-end"><button onClick={() => removeEntry(e.id)} className="text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button></div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LoadingScreen({ label }) {
  return <div className="flex items-center justify-center text-vx-muted text-sm" style={{ minHeight: "100vh" }}>{label || "Loading your deals…"}</div>;
}

function StorageWarning({ message }) {
  return (
    <div className="flex items-center gap-2 bg-amber-50 text-vx-caution border border-amber-200 rounded px-3 py-2 text-sm mb-4">
      <Info size={15} /> {message || "Couldn't reach your database — changes may not be saved."}
    </div>
  );
}

function SignInScreen() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function handleSignIn() {
    setError(null); setBusy(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { setError(e.message || "Sign-in failed."); }
    setBusy(false);
  }
  return (
    <div className="flex items-center justify-center bg-vx-surface-2" style={{ minHeight: "100vh" }}>
      <div className="text-center max-w-xs">
        <div className="font-serif text-2xl font-semibold text-vx-text mb-1">DealsDash</div>
        <p className="text-sm text-vx-muted mb-5">Sign in with Google to view your deals and cash flow.</p>
        <button onClick={handleSignIn} disabled={busy} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy/90 disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && <p className="text-xs text-vx-negative mt-3">{error}</p>}
      </div>
    </div>
  );
}

function UnauthorizedScreen({ email }) {
  return (
    <div className="flex items-center justify-center bg-vx-surface-2" style={{ minHeight: "100vh" }}>
      <div className="text-center max-w-xs">
        <div className="font-serif text-2xl font-semibold text-vx-text mb-1">DealsDash</div>
        <p className="text-sm text-vx-muted mb-1">{email} isn't authorized to use this app.</p>
        <p className="text-xs text-vx-muted mb-5">This instance is locked to a single account.</p>
        <button onClick={() => signOut(auth)} className="border border-vx-border text-sm font-medium px-4 py-2 rounded hover:bg-vx-surface">Sign out</button>
      </div>
    </div>
  );
}

function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <LoadingScreen label="Checking sign-in…" />;
  if (!user) return <SignInScreen />;
  if ((user.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) return <UnauthorizedScreen email={user.email} />;
  return children(user);
}

/* =================================================================================
   NOTIFICATIONS
   ================================================================================= */

const _NOTIF_ICON_MAP = {
  auctionApproaching_7d: Calendar,
  auctionApproaching_1d: Calendar,
  closingToday:           Calendar,
  outcomeDue:             AlertTriangle,
  gatesIncomplete:        ClipboardCheck,
  legalPackReady:         FileText,
  staleDeal:              RefreshCcw,
  placeholderAssumptions: AlertTriangle,
  lenderReportDue:        Banknote,
  listingChanged:         RefreshCw,
};

const _TRIGGER_LABELS = {
  auctionApproaching:     "Auction approaching (7d digest / 1d instant)",
  gatesIncomplete:        "Triage gates incomplete (instant)",
  closingToday:           "Closing today (digest)",
  outcomeDue:             "Outcome due after auction (digest)",
  listingChanged:         "Listing changed (instant)",
  legalPackReady:         "Legal pack reviewed (instant)",
  staleDeal:              "Stale deal — no update 14d (digest)",
  placeholderAssumptions: "Placeholder assumptions still in place (digest)",
  lenderReportDue:        "Lender report due (digest)",
};

function _NotifCard({ notif, onMarkRead, onGoToDeal, onGoToLead }) {
  const isUnread = !notif.readAt;
  const Icon = _NOTIF_ICON_MAP[notif.type] || Bell;
  const when = notif.createdAt ? (() => {
    const d = new Date(notif.createdAt);
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday
      ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  })() : "";
  return (
    <div
      role="button" tabIndex={0}
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-vx-surface-2 ${isUnread ? "bg-blue-50 border-blue-200" : "bg-vx-surface border-vx-border"}`}
      onClick={() => {
        onMarkRead(notif.id);
        if (notif.entityType === "deal" && notif.entityId) onGoToDeal(notif.entityId);
        else if (notif.entityType === "lead" && notif.entityId) onGoToLead(notif.entityId);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
    >
      <div className={`mt-0.5 shrink-0 ${isUnread ? "text-blue-600" : "text-vx-muted"}`}><Icon size={16} /></div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${isUnread ? "font-semibold text-vx-text" : "font-medium text-vx-muted"}`}>{notif.title}</div>
        <div className="text-xs text-vx-muted mt-0.5 truncate">{notif.body}</div>
      </div>
      <div className="text-xs text-vx-muted whitespace-nowrap shrink-0 ml-2">{when}</div>
    </div>
  );
}

function _NotifSettingsCard({ settings, onChange }) {
  const notif = settings.notifications || NOTIFICATION_DEFAULTS;
  const set = (key, val) => onChange({ ...settings, notifications: { ...notif, [key]: val } });
  const setTrigger = (key, val) => onChange({ ...settings, notifications: { ...notif, triggers: { ...notif.triggers, [key]: val } } });
  return (
    <div className="bg-vx-surface border border-vx-border rounded-lg p-5 space-y-4">
      <h2 className="font-semibold text-sm text-vx-text">Notification settings</h2>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm text-vx-text">Enable notifications</span>
        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={notif.enabled !== false} onChange={e => set("enabled", e.target.checked)} />
      </label>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm text-vx-text">Summary-only mode <span className="text-xs text-vx-muted">(no deal cards in email)</span></span>
        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!notif.summaryOnly} onChange={e => set("summaryOnly", e.target.checked)} />
      </label>
      <div>
        <div className="text-xs font-medium text-vx-muted uppercase tracking-wide mb-2">Trigger types</div>
        <div className="space-y-2">
          {Object.entries(_TRIGGER_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0"
                checked={notif.triggers?.[key] !== false}
                onChange={e => setTrigger(key, e.target.checked)} />
              <span className="text-sm text-vx-text leading-snug">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="text-xs text-vx-muted pt-2 border-t border-vx-divider space-y-1">
        <div>Digest sent daily at 07:00 London time · Emails to {notif.emailAddress || ALLOWED_EMAIL}</div>
        <div>Requires Firebase "Trigger Email from Firestore" extension — see <code className="bg-vx-surface-2 px-1 rounded">docs/estately-spike-findings.md</code> setup section.</div>
      </div>
    </div>
  );
}

function NotificationsView({ notifications, onMarkRead, onMarkAllRead, settings, onSettingsChange, onGoToDeal, onGoToLead }) {
  const unread = notifications.filter(n => !n.readAt);
  const todayStr = new Date().toDateString();
  const todayNotifs = notifications.filter(n => new Date(n.createdAt).toDateString() === todayStr);
  const earlierNotifs = notifications.filter(n => new Date(n.createdAt).toDateString() !== todayStr);
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-vx-text">Notifications</h1>
          <p className="text-sm text-vx-muted mt-1">{unread.length > 0 ? `${unread.length} unread` : "All caught up"}</p>
        </div>
        {unread.length > 0 && (
          <button onClick={onMarkAllRead} className="text-sm text-blue-600 hover:underline font-medium">Mark all read</button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-vx-surface border border-vx-border rounded-lg p-8 text-center">
          <Bell size={28} className="mx-auto mb-3 text-vx-muted opacity-40" />
          <p className="text-sm text-vx-muted">No notifications yet. They'll appear here when deals need your attention.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {todayNotifs.length > 0 && (
            <section>
              <div className="text-xs font-medium text-vx-muted uppercase tracking-wide mb-2">Today</div>
              <div className="space-y-2">
                {todayNotifs.map(n => <_NotifCard key={n.id} notif={n} onMarkRead={onMarkRead} onGoToDeal={onGoToDeal} onGoToLead={onGoToLead} />)}
              </div>
            </section>
          )}
          {earlierNotifs.length > 0 && (
            <section>
              <div className="text-xs font-medium text-vx-muted uppercase tracking-wide mb-2">Earlier</div>
              <div className="space-y-2">
                {earlierNotifs.map(n => <_NotifCard key={n.id} notif={n} onMarkRead={onMarkRead} onGoToDeal={onGoToDeal} onGoToLead={onGoToLead} />)}
              </div>
            </section>
          )}
        </div>
      )}

      <_NotifSettingsCard settings={settings} onChange={onSettingsChange} />
    </div>
  );
}

/* =================================================================================
   APP ROOT
   ================================================================================= */

function AppInner({ user }) {
  const [deals, setDeals] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [leads, setLeads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [buyBoxes, setBuyBoxes] = useState([]);
  const [agents, setAgents] = useState([]);
  const [marketStats, setMarketStats] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [migrateNote, setMigrateNote] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  // Screener → Sourcing target areas (session-only, not persisted)
  const [targetAreas, setTargetAreas] = useState([]);
  function addTargetAreas(areas) {
    setTargetAreas(prev => {
      const existing = new Set(prev.map(a => a.code));
      return [...prev, ...areas.filter(a => !existing.has(a.code))];
    });
  }

  // Stale-closure refs so debounced callbacks always read the latest entity
  const dealsStateRef = useRef([]);
  const propertiesStateRef = useRef([]);
  useEffect(() => { dealsStateRef.current = deals; }, [deals]);
  useEffect(() => { propertiesStateRef.current = properties; }, [properties]);

  // Per-entity debounce timers for typing-heavy detail form fields
  const dealTimers = useRef({});
  const propertyTimers = useRef({});

  // ── Migration + onSnapshot subscriptions ──────────────────────────────────
  useEffect(() => {
    let unsubs = [];
    let cancelled = false;
    let dealsReady = false, leadsReady = false, ledgerReady = false,
        contactsReady = false, propertiesReady = false, agentsReady = false,
        settingsReady = false, plannerReady = false, buyBoxesReady = false;
    let latestSettingsData = null;
    let latestPlannerData = null;

    function mergeAndSetSettings() {
      if (latestSettingsData === null || latestPlannerData === null) return;
      setSettings({
        ...DEFAULT_SETTINGS,
        ...latestSettingsData,
        planning: { ...DEFAULT_SETTINGS.planning, ...latestPlannerData },
      });
    }

    function checkAllReady() {
      if (dealsReady && leadsReady && ledgerReady && contactsReady &&
          propertiesReady && agentsReady && settingsReady && plannerReady && buyBoxesReady) {
        setLoaded(true);
        setMigrateNote(null);
      }
    }

    (async () => {
      try {
        await runMigrationIfNeeded(db, user.uid, msg => { if (!cancelled) setMigrateNote(msg); });
      } catch (e) {
        console.error("[DealsDash] Migration failed:", e);
        if (!cancelled) { setStorageOk(false); setLoaded(true); }
        return;
      }
      if (cancelled) return;

      const errHandler = e => { console.error(e); setStorageOk(false); };

      unsubs.push(onSnapshot(repo.dealsColRef(db, user.uid), snap => {
        if (cancelled) return;
        setDeals(snap.docs.map(d => d.data()));
        if (!dealsReady) { dealsReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.leadsColRef(db, user.uid), snap => {
        if (cancelled) return;
        setLeads(snap.docs.map(d => d.data()));
        if (!leadsReady) { leadsReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.ledgerColRef(db, user.uid), snap => {
        if (cancelled) return;
        setLedger(snap.docs.map(d => d.data()));
        if (!ledgerReady) { ledgerReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.contactsColRef(db, user.uid), snap => {
        if (cancelled) return;
        setContacts(snap.docs.map(d => d.data()));
        if (!contactsReady) { contactsReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.propertiesColRef(db, user.uid), snap => {
        if (cancelled) return;
        setProperties(snap.docs.map(d => d.data()));
        if (!propertiesReady) { propertiesReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.settingsDocRef(db, user.uid), snap => {
        if (cancelled) return;
        latestSettingsData = snap.exists() ? snap.data() : {};
        mergeAndSetSettings();
        if (!settingsReady) { settingsReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.plannerDocRef(db, user.uid), snap => {
        if (cancelled) return;
        latestPlannerData = snap.exists() ? snap.data() : {};
        mergeAndSetSettings();
        if (!plannerReady) { plannerReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.buyBoxesColRef(db, user.uid), snap => {
        if (cancelled) return;
        setBuyBoxes(snap.docs.map(d => d.data()));
        if (!buyBoxesReady) { buyBoxesReady = true; checkAllReady(); }
      }, errHandler));

      unsubs.push(onSnapshot(repo.agentsColRef(db, user.uid), snap => {
        if (cancelled) return;
        setAgents(snap.docs.map(d => d.data()));
        if (!agentsReady) { agentsReady = true; checkAllReady(); }
      }, errHandler));

      // Market stats — shared collection, not user-scoped; does not gate app load
      unsubs.push(onSnapshot(repo.marketStatsColRef(db), snap => {
        if (cancelled) return;
        const map = {};
        snap.docs.forEach(d => { map[d.id] = d.data(); });
        setMarketStats(map);
      }, e => console.warn("[DealsDash] marketStats subscription error:", e)));

      // Notifications — recent 50 desc; does not gate app load
      unsubs.push(onSnapshot(repo.notificationsQueryRef(db, user.uid), snap => {
        if (cancelled) return;
        setNotifications(snap.docs.map(d => d.data()));
      }, e => console.warn("[DealsDash] notifications subscription error:", e)));
    })();

    return () => {
      cancelled = true;
      unsubs.forEach(u => u());
    };
  }, [user.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Default buy box + derived thresholds ──────────────────────────────────
  const defaultBuyBox = buyBoxes.find(b => b.isDefault) || buyBoxes[0] || null;
  const effectiveThresholds = useMemo(() => {
    const a = defaultBuyBox?.assumptions || {};
    return {
      minNetProfit: a.targetProfitMinGBP?.value  ?? DEFAULT_THRESHOLDS.minNetProfit,
      minRoi:       a.minRoi?.value              ?? DEFAULT_THRESHOLDS.minRoi,
      minAnnualRoi: a.minAnnualRoi?.value        ?? DEFAULT_THRESHOLDS.minAnnualRoi,
      minRiskScore: a.minRiskScore?.value        ?? DEFAULT_THRESHOLDS.minRiskScore,
    };
  }, [defaultBuyBox]);

  // ── Settings helper — splits unified state into settings/app + planner/main ──
  function applySettings(newSettings) {
    const { planning, ...rest } = newSettings;
    setSettings(newSettings);
    repo.saveSettings(db, user.uid, rest).catch(() => setStorageOk(false));
    repo.savePlanner(db, user.uid, planning || {}).catch(() => setStorageOk(false));
  }

  // ── Notification helpers ───────────────────────────────────────────────────
  function markNotificationRead(id) {
    repo.markNotificationRead(db, user.uid, id, Date.now()).catch(() => {});
  }
  function markAllNotificationsRead() {
    const unread = notifications.filter(n => !n.readAt);
    if (!unread.length) return;
    repo.markAllNotificationsRead(db, user.uid, unread.map(n => n.id), Date.now()).catch(() => {});
  }

  // ── Collection sync helpers (diff old vs new, upsert additions/updates, delete removals) ──
  function syncLeads(newLeads, prevLeads) {
    const currentIds = new Set(newLeads.map(l => l.id));
    newLeads.forEach(l => repo.saveLead(db, user.uid, l).catch(() => setStorageOk(false)));
    prevLeads.filter(l => !currentIds.has(l.id))
      .forEach(l => repo.deleteLead(db, user.uid, l.id).catch(() => setStorageOk(false)));
    setLeads(newLeads);
  }

  function syncAgents(newAgents, prevAgents) {
    const currentIds = new Set(newAgents.map(a => a.id));
    newAgents.forEach(a => repo.saveAgent(db, user.uid, a).catch(() => setStorageOk(false)));
    prevAgents.filter(a => !currentIds.has(a.id))
      .forEach(a => repo.deleteAgent(db, user.uid, a.id).catch(() => setStorageOk(false)));
    setAgents(newAgents);
  }

  function syncLedger(newLedger, prevLedger) {
    const currentIds = new Set(newLedger.map(e => e.id));
    newLedger.forEach(e => repo.saveLedgerEntry(db, user.uid, e).catch(() => setStorageOk(false)));
    prevLedger.filter(e => !currentIds.has(e.id))
      .forEach(e => repo.deleteLedgerEntry(db, user.uid, e.id).catch(() => setStorageOk(false)));
    setLedger(newLedger);
  }

  function syncContacts(newContacts, prevContacts) {
    const currentIds = new Set(newContacts.map(c => c.id));
    newContacts.forEach(c => repo.saveContact(db, user.uid, c).catch(() => setStorageOk(false)));
    prevContacts.filter(c => !currentIds.has(c.id))
      .forEach(c => repo.deleteContact(db, user.uid, c.id).catch(() => setStorageOk(false)));
    setContacts(newContacts);
  }

  function syncBuyBoxes(newBoxes, prevBoxes) {
    const currentIds = new Set(newBoxes.map(b => b.id));
    newBoxes.forEach(b => repo.saveBuyBox(db, user.uid, b).catch(() => setStorageOk(false)));
    prevBoxes.filter(b => !currentIds.has(b.id))
      .forEach(b => repo.deleteBuyBox(db, user.uid, b.id).catch(() => setStorageOk(false)));
    setBuyBoxes(newBoxes);
  }

  // ── Mutation functions ─────────────────────────────────────────────────────
  function addDeal() {
    const d = newDealFromBuyBox(defaultBuyBox);
    setDeals([d, ...deals]);
    setSelectedId(d.id);
    setTab("deals");
    repo.saveDeal(db, user.uid, d).catch(() => setStorageOk(false));
  }
  function addExampleDeal() {
    const d = exampleDeal();
    setDeals([d, ...deals]);
    setSelectedId(d.id);
    setTab("deals");
    repo.saveDeal(db, user.uid, d).catch(() => setStorageOk(false));
  }
  function updateDeal(id, partial) {
    setDeals(deals.map(d => d.id === id ? { ...d, ...partial } : d));
    clearTimeout(dealTimers.current[id]);
    dealTimers.current[id] = setTimeout(() => {
      const deal = dealsStateRef.current.find(d => d.id === id);
      if (deal) repo.saveDeal(db, user.uid, deal).catch(() => setStorageOk(false));
    }, 500);
  }
  function deleteDeal(id) {
    setDeals(deals.filter(d => d.id !== id));
    repo.deleteDeal(db, user.uid, id).catch(() => setStorageOk(false));
    if (selectedId === id) setSelectedId(null);
  }
  function promoteLeadToDeal(dealPartial) {
    const base = { ...newDealFromBuyBox(defaultBuyBox), ...dealPartial };
    // Strip the empty v2 block so migrateV2Deal runs the full v1→v2 pre-fill,
    // using estResaleLow/High (proper worst/mid/best), refurbItems, bridgeLTV, btlLtv.
    const { v2: _empty, ...baseWithoutV2 } = base;
    const d = migrateV2Deal(baseWithoutV2);
    setDeals([d, ...deals]);
    setSelectedId(d.id);
    setTab("deals");
    repo.saveDeal(db, user.uid, d).catch(() => setStorageOk(false));
  }
  function addProperty() {
    const p = newProperty();
    setProperties([p, ...properties]);
    setSelectedPropertyId(p.id);
    setTab("properties");
    repo.saveProperty(db, user.uid, p).catch(() => setStorageOk(false));
  }
  function updateProperty(id, partial) {
    setProperties(properties.map(p => p.id === id ? { ...p, ...partial } : p));
    clearTimeout(propertyTimers.current[id]);
    propertyTimers.current[id] = setTimeout(() => {
      const property = propertiesStateRef.current.find(p => p.id === id);
      if (property) repo.saveProperty(db, user.uid, property).catch(() => setStorageOk(false));
    }, 500);
  }
  function deleteProperty(id) {
    setProperties(properties.filter(p => p.id !== id));
    repo.deleteProperty(db, user.uid, id).catch(() => setStorageOk(false));
    if (selectedPropertyId === id) setSelectedPropertyId(null);
  }
  function moveDealToRentalManagement(deal) {
    const p = propertyFromDeal(deal);
    setProperties([p, ...properties]);
    repo.saveProperty(db, user.uid, p).catch(() => setStorageOk(false));
    updateDeal(deal.id, { status: "Let / Held (BRRR)" });
    setSelectedId(null);
    setSelectedPropertyId(p.id);
    setTab("properties");
  }
  function saveBuyBoxFilters(updatedBox) {
    const newBoxes = buyBoxes.map(b => b.id === updatedBox.id ? updatedBox : b);
    syncBuyBoxes(newBoxes, buyBoxes);
    // Re-score every lead still at status "new" against the updated buy box filters
    if (updatedBox.isDefault || !buyBoxes.find(b => b.isDefault)) {
      const updatedLeads = leads.map(l =>
        l.status === "new" ? rescoreLeadAgainstFilters(l, updatedBox.filters) : l
      );
      syncLeads(updatedLeads, leads);
    }
  }
  function resetAll() {
    if (!window.confirm("Clear every deal, lead, contact, property, and ledger entry? Buy boxes are kept. This cannot be undone.")) return;
    setDeals([]); setLedger([]); setLeads([]); setContacts([]); setProperties([]);
    setSettings(DEFAULT_SETTINGS); setSelectedId(null); setSelectedPropertyId(null);
    const { planning, ...rest } = DEFAULT_SETTINGS;
    repo.deleteAllForUser(db, user.uid)
      .then(() => Promise.all([
        repo.saveSettings(db, user.uid, { ...rest, schemaVersion: 2, migratedAt: Date.now() }),
        repo.savePlanner(db, user.uid, planning || {}),
      ]))
      .catch(() => setStorageOk(false));
  }

  const selectedDeal = deals.find((d) => d.id === selectedId);
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  if (!loaded) return <LoadingScreen label={migrateNote || "Loading…"} />;

  return (
    <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", height: isDesktop ? "100vh" : "auto", minHeight: isDesktop ? 0 : "100vh", overflow: isDesktop ? "hidden" : "visible" }} className="bg-vx-surface-2 font-sans text-vx-text">
      <Sidebar tab={tab} setTab={(t) => { setTab(t); if (t !== "deals") setSelectedId(null); if (t !== "properties") setSelectedPropertyId(null); }} isDesktop={isDesktop} user={user} notifUnreadCount={notifications.filter(n => !n.readAt).length} />
      {tab === "workspace" ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          <WorkspaceView
            leads={leads} deals={deals} buyBoxes={buyBoxes} settings={settings}
            db={db} uid={user.uid}
            onGoToDeal={(id) => { setTab("deals"); setSelectedId(id); }}
            onGoToLead={() => setTab("sourcing")}
          />
        </div>
      ) : (
        <main className="flex-1 overflow-x-hidden" style={{ padding: isDesktop ? 24 : 14, overflowY: isDesktop ? "auto" : "visible" }}>
          {!storageOk && <StorageWarning />}
          {tab === "dashboard" && <DashboardView deals={deals} ledger={ledger} properties={properties} settings={settings} thresholds={effectiveThresholds} goToDeals={() => setTab("deals")} goToRisk={() => setTab("risk")} goToProperties={() => setTab("properties")} />}
          {tab === "sourcing" && <SourcingView leads={leads} setLeads={(newLeads) => syncLeads(newLeads, leads)} onPromote={promoteLeadToDeal} ownerUid={user.uid} buyBoxFilters={defaultBuyBox?.filters || null} marketStats={marketStats} targetAreas={targetAreas} onClearTargetAreas={() => setTargetAreas([])} agents={agents} setAgents={(newAgents) => syncAgents(newAgents, agents)} settings={settings} onSettingsChange={applySettings} />}
          {tab === "screener" && <ScreenerView settings={settings} onSettingsChange={applySettings} onAddTargetAreas={addTargetAreas} />}
          {tab === "deals" && !selectedDeal && <DealsListView deals={deals} thresholds={effectiveThresholds} onSelect={setSelectedId} onAdd={addDeal} onAddExample={addExampleDeal} onDelete={deleteDeal} marketStats={marketStats} />}
          {tab === "deals" && selectedDeal && <DealDetailView deal={selectedDeal} onChange={(p) => updateDeal(selectedDeal.id, p)} onDelete={deleteDeal} onBack={() => setSelectedId(null)} thresholds={effectiveThresholds} defaultBuyBox={defaultBuyBox} buyBox={buyBoxes.find(b => b.id === selectedDeal.buyBoxId) || defaultBuyBox} settings={settings} onMoveToRental={() => moveDealToRentalManagement(selectedDeal)} alreadyLinkedProperty={properties.find((p) => p.dealId === selectedDeal.id)} ownerUid={user.uid} surveyRates={settings.surveyRates} onSurveyRatesChange={(surveyRates) => applySettings({ ...settings, surveyRates })} marketStats={marketStats} />}
          {tab === "playbooks" && <PlaybooksView buyBoxes={buyBoxes} onBuyBoxesChange={(newBoxes) => syncBuyBoxes(newBoxes, buyBoxes)} onBuyBoxFiltersChange={saveBuyBoxFilters} leads={leads} deals={deals} />}
          {tab === "capital" && <CapitalCashFlowView ledger={ledger} setLedger={(newLedger) => syncLedger(newLedger, ledger)} settings={settings} setSettings={applySettings} deals={deals} onResetAll={resetAll} />}
          {tab === "planner" && <BusinessPlannerView settings={settings} setSettings={applySettings} deals={deals} ledger={ledger} />}
          {tab === "risk" && <RiskView deals={deals} ledger={ledger} settings={settings} />}
          {tab === "contacts" && <ContactsView contacts={contacts} setContacts={(newContacts) => syncContacts(newContacts, contacts)} />}
          {tab === "properties" && !selectedProperty && <PropertiesListView properties={properties} deals={deals} onSelect={setSelectedPropertyId} onAdd={addProperty} onDelete={deleteProperty} />}
          {tab === "properties" && selectedProperty && <PropertyDetailView property={selectedProperty} linkedDeal={deals.find((d) => d.id === selectedProperty.dealId)} onChange={(p) => updateProperty(selectedProperty.id, p)} onDelete={deleteProperty} onBack={() => setSelectedPropertyId(null)} />}
          {tab === "notifications" && <NotificationsView notifications={notifications} onMarkRead={markNotificationRead} onMarkAllRead={markAllNotificationsRead} settings={settings} onSettingsChange={applySettings} onGoToDeal={(id) => { setTab("deals"); setSelectedId(id); }} onGoToLead={() => setTab("sourcing")} />}
          {tab === "settings" && <SettingsView settings={settings} onSettingsChange={applySettings} />}
          {tab === "guide" && <UserGuideView />}
          <_AttributionFooter />
        </main>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("App crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "ui-monospace, monospace", background: "#fff1f2", color: "#881337", border: "1px solid #fecdd3", borderRadius: 12, whiteSpace: "pre-wrap", fontSize: 13 }}>
          <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Something went wrong rendering the app.</div>
          <div style={{ marginBottom: 8 }}>{String(this.state.error && this.state.error.message)}</div>
          <div style={{ opacity: 0.8 }}>{this.state.error && this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>{(user) => <AppInner user={user} />}</AuthGate>
    </ErrorBoundary>
  );
}

