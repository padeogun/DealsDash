// 54-activity flip programme template.
// Transcribed from VIXIV_Flip_Programme_Template.xlsx (Guide / Deal 1 / Deal 2 tabs).
// templateVersion must be bumped whenever activity IDs, durations or logic change.
//
// Field reference:
//   id           — unique activity ID, e.g. "A1"
//   phase        — phase letter: A–H
//   phaseName    — full phase label
//   name         — activity name
//   owner        — responsible party
//   route        — "both" | "auction" | "agent" — which purchase route this applies to
//   scopeSwitch  — null | one of the scope-switch keys; activity is skipped when
//                  inputs.scope[scopeSwitch] is false
//   hold         — true = hold point (go/no-go decision required before proceeding)
//   durAuction   — base duration in working days for auction route
//   durAgent     — base duration in working days for agent route
//   contingency  — true = apply contingency % (ceil rounding) to the base duration
//   preds        — [{id, type:'FS'|'SS'}] — finish-to-start or start-to-start links
//   lag          — WD lag added after the predecessor constraint
//   completionActivity — A12 only; scheduler computes date from route-specific rules
//   durParam     — H3 only; scheduler overrides dur from inputs[durParam]
//   lagParam     — H7/H8; scheduler overrides lag from inputs[lagParam]
//   lagOffset    — combined with lagParam: lag = inputs[lagParam] + lagOffset
//   note         — guidance from the workbook

export const templateVersion = 1;

export const TEMPLATE = [
  // ── A  Purchase & DD ──────────────────────────────────────────────────────
  {
    id: 'A1', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Deal secured (auction: hammer falls = exchange; agent: offer accepted)',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [], lag: 0,
    note: 'Day 0. Everything else is driven from the secured date.',
  },
  {
    id: 'A2', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Buildings insurance (unoccupied cover) in force',
    owner: 'Paul / broker', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 1, durAgent: 1, contingency: false,
    preds: [{ id: 'A1', type: 'SS' }], lag: 0,
    note: 'Risk passes to buyer at hammer (auction) or exchange (agent). Must be live from Day 0.',
  },
  {
    id: 'A3', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Pay 10% deposit + buyer\'s premium / auction fees',
    owner: 'Paul', route: 'auction', scopeSwitch: null, hold: false,
    durAuction: 1, durAgent: 0, contingency: false,
    preds: [{ id: 'A1', type: 'SS' }], lag: 0,
    note: 'Paid on the day. Funds must be ready before bidding.',
  },
  {
    id: 'A4', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Instruct solicitor; legal pack / memorandum of sale to solicitor and lender',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: false,
    preds: [{ id: 'A1', type: 'SS' }], lag: 0,
    note: '',
  },
  {
    id: 'A5', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Bridging valuation instructed and inspection done',
    owner: 'Broker / lender', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 5, durAgent: 5, contingency: false,
    preds: [{ id: 'A4', type: 'SS' }], lag: 1,
    note: 'Ideally have a DIP before the auction.',
  },
  {
    id: 'A6', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Bridging underwriting and formal loan offer',
    owner: 'Lender', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 5, durAgent: 5, contingency: false,
    preds: [{ id: 'A5', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'A7', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Searches and enquiries raised and answered',
    owner: 'Solicitor', route: 'agent', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 25, contingency: false,
    preds: [{ id: 'A4', type: 'FS' }], lag: 0,
    note: 'Auction route: done BEFORE bidding (see DD Checklist).',
  },
  {
    id: 'A8', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Independent survey + builder walk-round for quote',
    owner: 'Surveyor / builder', route: 'agent', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 10, contingency: false,
    preds: [{ id: 'A4', type: 'SS' }], lag: 2,
    note: '',
  },
  {
    id: 'A9', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Review title, searches and survey: renegotiate or withdraw',
    owner: 'Paul + mentor', route: 'agent', scopeSwitch: null, hold: true,
    durAuction: 0, durAgent: 3, contingency: false,
    preds: [{ id: 'A7', type: 'FS' }, { id: 'A8', type: 'FS' }], lag: 0,
    note: 'Re-run DealsDash appraisal with real costs. Walk away if it fails.',
  },
  {
    id: 'A10', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Exchange contracts (deposit paid)',
    owner: 'Solicitor', route: 'agent', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [{ id: 'A9', type: 'FS' }, { id: 'A6', type: 'FS' }], lag: 0,
    note: 'Legally committed from here.',
  },
  {
    id: 'A11', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'Lender\'s legal work, report on title, funds requested',
    owner: 'Solicitors', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 5, durAgent: 5, contingency: false,
    preds: [{ id: 'A6', type: 'FS' }, { id: 'A10', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'A12', phase: 'A', phaseName: 'A Purchase & DD',
    name: 'PURCHASE COMPLETION: keys released',
    owner: 'Solicitor', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    // Predecessors used only for agent route; auction date is computed from secured + 28 cal days.
    // completionActivity = true triggers special scheduling logic in schedule.js.
    preds: [{ id: 'A10', type: 'FS' }, { id: 'A11', type: 'FS' }], lag: 0,
    completionActivity: true,
    note: 'Auction: fixed by contract (28 cal days). Agent: max(exchange + C9 WD, lender legals + 1 WD).',
  },

  // ── B  Pre-start ──────────────────────────────────────────────────────────
  {
    id: 'B1', phase: 'B', phaseName: 'B Pre-start',
    name: 'Builder schedule of works and measured scope',
    owner: 'Builder', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: false,
    preds: [{ id: 'A1', type: 'FS' }, { id: 'A8', type: 'FS' }], lag: 0,
    note: 'Auction: arrange access via auctioneer / pre-bid viewing scope.',
  },
  {
    id: 'B2', phase: 'B', phaseName: 'B Pre-start',
    name: 'Fixed-price quote(s) received; mentor review',
    owner: 'Builder / mentor', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 5, durAgent: 5, contingency: false,
    preds: [{ id: 'B1', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'B3', phase: 'B', phaseName: 'B Pre-start',
    name: 'Sign contract: scope, stage payments, 5% retention; check insurance, verify CIS',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: true,
    durAuction: 2, durAgent: 2, contingency: false,
    preds: [{ id: 'B2', type: 'FS' }], lag: 0,
    note: 'HOLD: go/no-go. No signed scope + price = no start.',
  },
  {
    id: 'B4', phase: 'B', phaseName: 'B Pre-start',
    name: 'Order long-lead items (kitchen, boiler, windows)',
    owner: 'Paul / builder', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 1, durAgent: 1, contingency: false,
    preds: [{ id: 'B3', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'B5', phase: 'B', phaseName: 'B Pre-start',
    name: 'Long-lead delivery window',
    owner: 'Suppliers', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 15, durAgent: 15, contingency: false,
    preds: [{ id: 'B4', type: 'FS' }], lag: 0,
    note: 'Typical 3 weeks; windows can be 4–6. Edit to supplier quote.',
  },
  {
    id: 'B6', phase: 'B', phaseName: 'B Pre-start',
    name: 'Asbestos refurbishment survey',
    owner: 'Surveyor', route: 'both', scopeSwitch: 'pre2000', hold: false,
    durAuction: 5, durAgent: 5, contingency: false,
    preds: [{ id: 'A12', type: 'FS' }], lag: 0,
    note: 'Before any intrusive work on a pre-2000 property (HSE guidance).',
  },
  {
    id: 'B7', phase: 'B', phaseName: 'B Pre-start',
    name: 'Utilities and meter readings, council tax, change locks, skip, start photos',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 1, durAgent: 1, contingency: false,
    preds: [{ id: 'A12', type: 'FS' }], lag: 0,
    note: '',
  },

  // ── C  Strip-out & structure ──────────────────────────────────────────────
  {
    id: 'C1', phase: 'C', phaseName: 'C Strip-out & structure',
    name: 'Strip-out: kitchen, bathroom, flooring, blown plaster',
    owner: 'Builder', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 4, durAgent: 4, contingency: true,
    preds: [{ id: 'B7', type: 'FS' }, { id: 'B6', type: 'FS' }, { id: 'B3', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'C2', phase: 'C', phaseName: 'C Strip-out & structure',
    name: 'Opening-up inspection; update costs in DealsDash',
    owner: 'Paul + builder', route: 'both', scopeSwitch: null, hold: true,
    durAuction: 1, durAgent: 1, contingency: false,
    preds: [{ id: 'C1', type: 'FS' }], lag: 0,
    note: 'HOLD: go/no-go. Hidden defects show here. Re-check profit vs target.',
  },
  {
    id: 'C3', phase: 'C', phaseName: 'C Strip-out & structure',
    name: 'Structural works (engineer design + Building Control notice)',
    owner: 'Builder / engineer', route: 'both', scopeSwitch: 'structural', hold: false,
    durAuction: 5, durAgent: 5, contingency: true,
    preds: [{ id: 'C2', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'C4', phase: 'C', phaseName: 'C Strip-out & structure',
    name: 'Damp-proofing / timber treatment',
    owner: 'Specialist', route: 'both', scopeSwitch: 'dampTimber', hold: false,
    durAuction: 3, durAgent: 3, contingency: true,
    preds: [{ id: 'C2', type: 'FS' }], lag: 0,
    note: 'Get the guarantee for the sale pack.',
  },
  {
    id: 'C5', phase: 'C', phaseName: 'C Strip-out & structure',
    name: 'Roof and external repairs (roof, gutters, pointing, render)',
    owner: 'Roofer / builder', route: 'both', scopeSwitch: 'roofExternal', hold: false,
    durAuction: 8, durAgent: 8, contingency: true,
    preds: [{ id: 'C2', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'C6', phase: 'C', phaseName: 'C Strip-out & structure',
    name: 'Windows and external doors fitted',
    owner: 'Installer', route: 'both', scopeSwitch: 'windowsDoors', hold: false,
    durAuction: 3, durAgent: 3, contingency: true,
    preds: [{ id: 'C2', type: 'FS' }, { id: 'B5', type: 'FS' }], lag: 0,
    note: 'Keep FENSA certificate.',
  },

  // ── D  First fix ──────────────────────────────────────────────────────────
  {
    id: 'D1', phase: 'D', phaseName: 'D First fix',
    name: 'Electrical first fix (rewire)',
    owner: 'Electrician', route: 'both', scopeSwitch: 'rewire', hold: false,
    durAuction: 4, durAgent: 4, contingency: true,
    preds: [{ id: 'C3', type: 'FS' }, { id: 'C4', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'D2', phase: 'D', phaseName: 'D First fix',
    name: 'Plumbing and heating first fix',
    owner: 'Plumber', route: 'both', scopeSwitch: 'heatingBoiler', hold: false,
    durAuction: 4, durAgent: 4, contingency: true,
    // lag = 1: starts 1 WD after D1 to share the site
    preds: [{ id: 'C3', type: 'FS' }, { id: 'C4', type: 'FS' }], lag: 1,
    note: 'Starts 1 WD after electrics to share the site.',
  },
  {
    id: 'D3', phase: 'D', phaseName: 'D First fix',
    name: 'Joinery first fix (stud walls, linings)',
    owner: 'Carpenter', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: true,
    preds: [{ id: 'C3', type: 'FS' }, { id: 'C4', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'D4', phase: 'D', phaseName: 'D First fix',
    name: 'First-fix check before boarding (electrician / Building Control if notifiable)',
    owner: 'Builder', route: 'both', scopeSwitch: null, hold: true,
    durAuction: 1, durAgent: 1, contingency: false,
    preds: [{ id: 'D1', type: 'FS' }, { id: 'D2', type: 'FS' }, { id: 'D3', type: 'FS' }], lag: 0,
    note: 'HOLD: go/no-go. Photograph every wall before boarding.',
  },

  // ── E  Plaster ────────────────────────────────────────────────────────────
  {
    id: 'E1', phase: 'E', phaseName: 'E Plaster',
    name: 'Board, plaster and skim',
    owner: 'Plasterer', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 6, durAgent: 6, contingency: true,
    preds: [{ id: 'D4', type: 'FS' }, { id: 'C5', type: 'FS' }, { id: 'C6', type: 'FS' }], lag: 0,
    note: 'Roof watertight and windows in first.',
  },
  {
    id: 'E2', phase: 'E', phaseName: 'E Plaster',
    name: 'Drying out (winter allowance added automatically Nov–Feb)',
    owner: '—', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 5, durAgent: 5, contingency: false,
    // winterDrying = true signals the scheduler to add inputs.winterDryingExtra WD when
    // E2.start falls in Nov–Feb.
    winterDrying: true,
    preds: [{ id: 'E1', type: 'FS' }], lag: 0,
    note: 'Heat + dehumidifiers. Painting too early = cracking and bloom.',
  },
  {
    id: 'E3', phase: 'E', phaseName: 'E Plaster',
    name: 'Mist coat',
    owner: 'Decorator', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: true,
    preds: [{ id: 'E2', type: 'FS' }], lag: 0,
    note: '',
  },

  // ── F  Second fix & finish ─────────────────────────────────────────────────
  {
    id: 'F1', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Kitchen fit',
    owner: 'Kitchen fitter', route: 'both', scopeSwitch: 'kitchen', hold: false,
    durAuction: 4, durAgent: 4, contingency: true,
    preds: [{ id: 'E3', type: 'FS' }, { id: 'B5', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F2', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Bathroom fit and tiling',
    owner: 'Plumber / tiler', route: 'both', scopeSwitch: 'bathroom', hold: false,
    durAuction: 5, durAgent: 5, contingency: true,
    preds: [{ id: 'E3', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F3', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Electrical second fix and testing',
    owner: 'Electrician', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: true,
    preds: [{ id: 'F1', type: 'FS' }, { id: 'F2', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F4', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Plumbing / heating second fix; boiler commissioned',
    owner: 'Plumber / Gas Safe', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: true,
    preds: [{ id: 'F1', type: 'FS' }, { id: 'F2', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F5', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Joinery second fix (doors, skirting, architrave)',
    owner: 'Carpenter', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: true,
    preds: [{ id: 'E3', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F6', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Decoration',
    owner: 'Decorator', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 6, durAgent: 6, contingency: true,
    preds: [{ id: 'F3', type: 'FS' }, { id: 'F4', type: 'FS' }, { id: 'F5', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F7', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Flooring',
    owner: 'Flooring fitter', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: true,
    preds: [{ id: 'F6', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'F8', phase: 'F', phaseName: 'F Second fix & finish',
    name: 'Kerb appeal: front door, paint, garden tidy',
    owner: 'Builder', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: true,
    preds: [{ id: 'F6', type: 'FS' }], lag: 0,
    note: 'Training rule: £1 of refurb should add £3 of value.',
  },

  // ── G  Sign-off ───────────────────────────────────────────────────────────
  {
    id: 'G1', phase: 'G', phaseName: 'G Sign-off',
    name: 'Certificates: EIC (Part P), Gas Safe / Building Regs, FENSA, Building Control completion',
    owner: 'Trades', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: false,
    preds: [{ id: 'F3', type: 'FS' }, { id: 'F4', type: 'FS' }], lag: 0,
    note: 'Buyer\'s solicitor will ask for every one. No certs = delayed exchange.',
  },
  {
    id: 'G2', phase: 'G', phaseName: 'G Sign-off',
    name: 'Snagging walk-round and fixes',
    owner: 'Paul + builder', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: false,
    preds: [{ id: 'F7', type: 'FS' }, { id: 'F8', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'G3', phase: 'G', phaseName: 'G Sign-off',
    name: 'PRACTICAL COMPLETION: stage payment (5% retention held)',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: true,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [{ id: 'G2', type: 'FS' }], lag: 0,
    note: 'HOLD: go/no-go. Sign off only when the snag list is clear.',
  },
  {
    id: 'G4', phase: 'G', phaseName: 'G Sign-off',
    name: 'EPC commissioned',
    owner: 'Assessor', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: false,
    preds: [{ id: 'G2', type: 'FS' }], lag: 0,
    note: 'Must be commissioned before marketing.',
  },
  {
    id: 'G5', phase: 'G', phaseName: 'G Sign-off',
    name: 'Deep clean, staging, photos and floorplan',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: false,
    preds: [{ id: 'G2', type: 'FS' }], lag: 0,
    note: '',
  },

  // ── H  Sale & close-out ───────────────────────────────────────────────────
  {
    id: 'H1', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Three agent valuations; instruct agent',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 3, durAgent: 3, contingency: false,
    // SS: book during snagging, overlapping G2
    preds: [{ id: 'G2', type: 'SS' }], lag: 0,
    note: 'Book during snagging.',
  },
  {
    id: 'H2', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'LISTED on portals',
    owner: 'Agent', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [{ id: 'H1', type: 'FS' }, { id: 'G4', type: 'FS' }, { id: 'G5', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'H3', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Viewings → sale agreed',
    owner: 'Agent', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 30, durAgent: 30, contingency: false,
    // durParam: scheduler overrides dur with inputs.agentSaleToAgreement
    durParam: 'agentSaleToAgreement',
    preds: [{ id: 'H2', type: 'FS' }], lag: 0,
    note: 'Duration set in deal inputs (default 30 WD).',
  },
  {
    id: 'H4', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Memorandum of sale; buyer\'s mortgage valuation',
    owner: 'Agent / buyer', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 10, durAgent: 10, contingency: false,
    preds: [{ id: 'H3', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'H5', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Buyer\'s searches, enquiries and survey; supply certificates',
    owner: 'Solicitors', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 40, durAgent: 40, contingency: false,
    preds: [{ id: 'H3', type: 'FS' }], lag: 0,
    note: 'Chase weekly. Typical sale-agreed → completion: 12–16 weeks.',
  },
  {
    id: 'H6', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Exchange contracts on sale',
    owner: 'Solicitors', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [{ id: 'H4', type: 'FS' }, { id: 'H5', type: 'FS' }, { id: 'G1', type: 'FS' }], lag: 0,
    note: '',
  },
  {
    id: 'H7', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'SALE COMPLETION: bridge redeemed',
    owner: 'Solicitor', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [{ id: 'H6', type: 'FS' }],
    // lag = saleExchangeToCompletion − 1 (default 9, i.e. 10 WD from exchange)
    // lagParam + lagOffset: scheduler computes lag = inputs[lagParam] + lagOffset
    lag: 9, lagParam: 'saleExchangeToCompletion', lagOffset: -1,
    note: 'Lag = sale exchange-to-completion WD − 1 (lands that many WD after exchange).',
  },
  {
    id: 'H8', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Retention released (end of defects period)',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 0, durAgent: 0, contingency: false,
    preds: [{ id: 'G3', type: 'FS' }],
    // lag = retentionReleaseLag (default 60 WD ≈ 3 months after PC)
    lag: 60, lagParam: 'retentionReleaseLag', lagOffset: 0,
    note: 'Lag 60 WD ≈ 3 months after practical completion.',
  },
  {
    id: 'H9', phase: 'H', phaseName: 'H Sale & close-out',
    name: 'Close-out: final P&L vs appraisal in DealsDash; lessons learned',
    owner: 'Paul', route: 'both', scopeSwitch: null, hold: false,
    durAuction: 2, durAgent: 2, contingency: false,
    preds: [{ id: 'H7', type: 'FS' }], lag: 0,
    note: 'Feed actual durations back into this template.',
  },
];
