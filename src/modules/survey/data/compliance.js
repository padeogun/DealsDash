/* Compliance & due-diligence checks. applies: which strategies/routes show the item. */
export const COMPLIANCE = [
  { id: "eicr", label: "Satisfactory EICR dated within 5 years", applies: ["brrr"] },
  { id: "gas", label: "Gas Safety Record in date (or no gas)", applies: ["brrr"] },
  { id: "epc", label: "EPC band E or better (target C for future-proofing)", applies: ["brrr", "flip"] },
  { id: "alarms", label: "Smoke alarm every storey + CO alarm at each fixed appliance", applies: ["brrr"] },
  { id: "licensing", label: "Selective / additional licensing area checked (Rochdale, Oldham schemes)", applies: ["brrr"] },
  { id: "article4", label: "Article 4 HMO direction checked (Oldham from Jan 2026)", applies: ["brrr"] },
  { id: "hhsrs", label: "No Category 1 HHSRS hazards after works", applies: ["brrr"] },
  { id: "legionella", label: "Legionella risk assessment planned", applies: ["brrr"] },
  { id: "fensa", label: "FENSA/CERTASS certificates for existing replacement windows", applies: ["flip", "brrr"] },
  { id: "buildregs", label: "Building Regs completion certificates for previous works", applies: ["flip", "brrr"] },
  { id: "planning", label: "Planning history / conservation area / listed status checked", applies: ["flip", "brrr"] },
  { id: "asbestos", label: "Asbestos refurbishment survey commissioned (pre-2000 build)", applies: ["flip", "brrr"] },
  { id: "title", label: "Title checked: freehold, covenants, rights of way, flying freehold", applies: ["flip", "brrr"] },
  { id: "flood", label: "Flood risk and mining/subsidence searches reviewed", applies: ["flip", "brrr"] },
  { id: "legalpack", label: "Auction legal pack reviewed (special conditions, seller's fees, arrears)", applies: ["auction"] },
  { id: "tenants", label: "Vacant possession confirmed / existing tenancy terms reviewed", applies: ["flip", "brrr"] },
  { id: "salespack", label: "Sales-pack readiness (Home Buying & Selling Reform — verify requirements)", applies: ["flip"] },
];
export const COMPLIANCE_STATES = [["yes", "Satisfied"], ["verify", "Verify at viewing"], ["no", "Needs action"], ["unknown", "Not yet checked"]];
