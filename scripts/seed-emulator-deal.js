// Seed a test deal into the Firestore emulator.
// Run with: node scripts/seed-emulator-deal.js
// Requires the emulator to be running on localhost:8080.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const KEY_PATH = resolve("C:/Users/paula/Documents/fbk/dealsdash-firebase-adminsdk-fbsvc-ee70e767d7.json");
const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));

initializeApp({ credential: cert(serviceAccount), projectId: "dealsdash" });
const db = getFirestore();

const UID = "test-user-p02";

const testDeal = {
  id: "test-deal-v2-001",
  name: "14 Appraisal Test Street",
  address: "14 Appraisal Test Street",
  town: "Rochdale",
  postcode: "OL11 1AA",
  propertyType: "Terrace",
  bedrooms: 3,
  floorArea: 82,
  condition: 3,
  status: "Prospecting",
  gdvOverride: 115000,
  price: 68000,
  additionalProperty: true,
  bridgeLTV: 0.75,
  bridgeMonthlyRate: 0.0085,
  arrangementPct: 0.02,
  exitPct: 0.01,
  fundingMode: "bridge",
  interestMode: "retained",
  btlLtv: 0.75,
  btlRate: 0.065,
  monthlyRent: 650,
  refurbItems: [
    { name: "Kitchen",    low: 4000, high: 6000 },
    { name: "Bathroom",   low: 2500, high: 3500 },
    { name: "Decorating", low: 1500, high: 2500 },
    { name: "Boiler",     low: 2000, high: 3000 },
  ],
  comps: [
    { address: "12 Appraisal Test St", price: 108000, date: "2026-08-01", floorArea: 78 },
    { address: "18 Appraisal Test St", price: 118000, date: "2026-07-15", floorArea: 85 },
  ],
  fees: { solicitor: 1400, searches: 350, survey: 600, broker: 1200, valuation: 450, landReg: 270, other: 200 },
  notes: "P02 emulator test deal — created by seed-emulator-deal.js",
  createdAt: Date.now(),
  schemaVersion: 2,
  // ── v2 block ──────────────────────────────────────────────────────────────
  v2: {
    valuation: {
      best: 118000, mid: 115000, worst: 108000,
      basis: "worst",
      comparables: [
        { address: "12 Appraisal Test St", price: 108000, date: "2026-08-01", type: "Terrace", source: "manual" },
        { address: "18 Appraisal Test St", price: 118000, date: "2026-07-15", type: "Terrace", source: "manual" },
      ],
      singlePoint: false,
    },
    costLines: [
      { key: "kitchen",    label: "Kitchen",    amount: 5000,  basis: "estimate", source: "trade quote" },
      { key: "bathroom",   label: "Bathroom",   amount: 3000,  basis: "estimate", source: "trade quote" },
      { key: "decorating", label: "Decorating", amount: 2000,  basis: "estimate", source: "trade quote" },
      { key: "boiler",     label: "Boiler",     amount: null,  basis: "quote",    source: null },  // awaiting quote — RULE 7
    ],
    funding: {
      sources: [{
        type: "bridge",
        ltvPct: 0.75,
        monthlyRate: 0.0085,
        termMonths: null,
        arrangementPct: 0.02,
        exitPct: 0.01,
        interestMode: "retained",
        exitFeeTiming: "redemption",
      }],
    },
    refinance:  { ltv: 0.75, lenderRoute: null, refiFees: null, acceptedLeftIn: null },
    rent:       { monthly: 650, evidence: [] },
    profitPct:        null,
    acceptedLeftIn:   null,
    icr:              null,
    minNetMonthly:    null,
    minHeadroomPct:   null,
    reserves:         null,
    bridgeInterestMode: null,
    results:        null,
    walkaway:       null,
    computedAt:     null,
    engineVersion:  1,
  },
};

// Write settings (schemaVersion 3) + the test deal
const settingsRef = db.collection("users").doc(UID).collection("settings").doc("app");
const dealRef     = db.collection("users").doc(UID).collection("deals").doc(testDeal.id);

await settingsRef.set({
  schemaVersion: 3,
  migratedV3At: Date.now(),
  monthlyBurn: 1800,
  targetMonthlyIncome: 30000,
  appraisal: {
    profitPctDefault: 0.15,
    acceptedLeftInDefault: 0,
    icr: 1.25,
    icrStressRate: 0.055,
    minNetMonthly: 150,
    minHeadroomPct: 0.05,
    reserves: { mgmt: 0.10, maint: 0.08, voids: 0.04 },
    showV1Comparison: true,
  },
});

await dealRef.set(testDeal);

console.log("✓ Settings written: users/" + UID + "/settings/app  (schemaVersion: 3)");
console.log("✓ Deal written:     users/" + UID + "/deals/" + testDeal.id);
console.log("");
console.log("Open the Emulator UI to verify:");
console.log("  http://127.0.0.1:4000/firestore/default/data/users/" + UID + "/deals/" + testDeal.id);
console.log("");
console.log("Key things to check in the deal document:");
console.log("  • v2.valuation.worst = 108000  (worst of three comps)");
console.log("  • v2.costLines[3].amount = null (boiler — awaiting quote, RULE 7)");
console.log("  • v2.funding.sources[0].type = 'bridge'");
console.log("  • v2.refinance.ltv = 0.75");
console.log("  • v2.rent.monthly = 650");
console.log("  • All v1 fields (gdvOverride, refurbItems, etc.) still present (RULE 14)");
