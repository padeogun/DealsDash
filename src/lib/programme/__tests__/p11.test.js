// P11 Golden tests — written FIRST (RULE 6).
// All cases must FAIL before implementation exists.
// Do NOT change expected values to make tests pass — fix the implementation.
//
// Holiday fixture = exactly the Holidays tab of VIXIV_Flip_Programme_Template.xlsx,
// including trade shutdown days 29–31 Dec 2026 and 29–31 Dec 2027.

import { describe, it, expect } from 'vitest';
import { schedule } from '../schedule.js';
import { TEMPLATE } from '../template.js';
import { checkCrewClash } from '../pipeline.js';
import { addWorkdays, networkdays } from '../calendar.js';

// ── Holiday fixture ────────────────────────────────────────────────────────────
const HOLIDAYS = [
  // 2026 Christmas / shutdown
  '2026-12-25', '2026-12-28',
  '2026-12-29', '2026-12-30', '2026-12-31', // trade shutdown
  // 2027
  '2027-01-01',
  '2027-03-26', '2027-03-29', // Good Friday, Easter Monday
  '2027-05-03', '2027-05-31', // Early May BH, Spring BH
  '2027-08-30',               // Summer BH
  // 2027 Christmas / shutdown
  '2027-12-27', '2027-12-28',
  '2027-12-29', '2027-12-30', '2027-12-31', // trade shutdown
  // 2028
  '2028-01-03',
  '2028-04-14', '2028-04-17',
  '2028-05-01', '2028-05-29',
  '2028-08-28',
  '2028-12-25', '2028-12-26',
];

// ── Shared default inputs ──────────────────────────────────────────────────────
const DEFAULTS = {
  auctionCompletionDays: 28,
  agentExchangeToCompletion: 10,
  agentSaleToAgreement: 30,
  saleExchangeToCompletion: 10,
  retentionReleaseLag: 60,
  contingencyPct: 0.15,
  winterDryingExtra: 3,
};

// Deal 1 scope
const SCOPE_D1 = {
  pre2000: true, structural: false, dampTimber: true, roofExternal: false,
  windowsDoors: false, rewire: true, heatingBoiler: true, kitchen: true, bathroom: true,
};

// Deal 2 scope (same as D1 but windows = true)
const SCOPE_D2 = { ...SCOPE_D1, windowsDoors: true };

const D1_INPUTS = { ...DEFAULTS, route: 'auction', dealSecured: '2026-12-10', scope: SCOPE_D1 };
const D2_INPUTS = { ...DEFAULTS, route: 'agent',   dealSecured: '2027-02-01', scope: SCOPE_D2 };

// ── Helper ─────────────────────────────────────────────────────────────────────
function act(result, id) {
  return result.activities.find(a => a.id === id);
}

// ══════════════════════════════════════════════════════════════════════════════
// Case 1 — Deal 1 (auction) key dates
// ══════════════════════════════════════════════════════════════════════════════
describe('Deal 1 (auction) golden key dates', () => {
  const r = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);

  it('status is complete', () => {
    expect(r.status).toBe('complete');
  });

  it('completion = 2027-01-07', () => {
    expect(r.keyDates.completion).toBe('2027-01-07');
  });

  it('worksStart = 2027-01-15', () => {
    expect(r.keyDates.worksStart).toBe('2027-01-15');
  });

  it('pc = 2027-04-08', () => {
    expect(r.keyDates.pc).toBe('2027-04-08');
  });

  it('listed = 2027-04-13', () => {
    expect(r.keyDates.listed).toBe('2027-04-13');
  });

  it('saleAgreed = 2027-05-26', () => {
    expect(r.keyDates.saleAgreed).toBe('2027-05-26');
  });

  it('saleCompleted = 2027-08-06', () => {
    expect(r.keyDates.saleCompleted).toBe('2027-08-06');
  });

  it('buildDuration = 58 WD', () => {
    expect(r.keyDates.buildDuration).toBe(58);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 2 — Deal 1 finance flag
// ══════════════════════════════════════════════════════════════════════════════
describe('Deal 1 finance flag', () => {
  const r = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);

  it('A11 finishes 2027-01-08', () => {
    expect(act(r, 'A11').finish).toBe('2027-01-08');
  });

  it('A12 completion is 2027-01-07', () => {
    expect(act(r, 'A12').finish).toBe('2027-01-07');
  });

  it('financeLate flag is true', () => {
    expect(r.flags.financeLate).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 3 — Deal 2 (estate agent) golden key dates
// ══════════════════════════════════════════════════════════════════════════════
describe('Deal 2 (estate agent) golden key dates', () => {
  const r = schedule(TEMPLATE, D2_INPUTS, HOLIDAYS);

  it('status is complete', () => {
    expect(r.status).toBe('complete');
  });

  it('completion = 2027-03-31', () => {
    expect(r.keyDates.completion).toBe('2027-03-31');
  });

  it('worksStart = 2027-04-08', () => {
    expect(r.keyDates.worksStart).toBe('2027-04-08');
  });

  it('pc = 2027-06-25', () => {
    expect(r.keyDates.pc).toBe('2027-06-25');
  });

  it('listed = 2027-06-30', () => {
    expect(r.keyDates.listed).toBe('2027-06-30');
  });

  it('saleAgreed = 2027-08-11', () => {
    expect(r.keyDates.saleAgreed).toBe('2027-08-11');
  });

  it('saleCompleted = 2027-10-22', () => {
    expect(r.keyDates.saleCompleted).toBe('2027-10-22');
  });

  it('buildDuration = 55 WD', () => {
    expect(r.keyDates.buildDuration).toBe(55);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 4 — Winter drying
// ══════════════════════════════════════════════════════════════════════════════
describe('Winter drying', () => {
  it('Deal 1 E2 durationUsed = 8 WD (5 base + 3 winter)', () => {
    const r = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);
    expect(act(r, 'E2').durationUsed).toBe(8);
  });

  it('Deal 1 E2 winterExternal flag is set', () => {
    const r = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);
    expect(r.flags.winterExternal).toBe(true);
  });

  it('Deal 2 E2 durationUsed = 5 WD (starts May, not winter)', () => {
    const r = schedule(TEMPLATE, D2_INPUTS, HOLIDAYS);
    expect(act(r, 'E2').durationUsed).toBe(5);
  });

  it('Deal 2 winterExternal flag is false', () => {
    const r = schedule(TEMPLATE, D2_INPUTS, HOLIDAYS);
    expect(r.flags.winterExternal).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 5 — Skipped pass-through (C3 structural = N)
// ══════════════════════════════════════════════════════════════════════════════
describe('Skipped pass-through (C3 structural=N)', () => {
  const r = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);

  it('C3 start = 2027-01-25', () => {
    expect(act(r, 'C3').start).toBe('2027-01-25');
  });

  it('C3 finish = 2027-01-22 (before start — not applicable pattern)', () => {
    expect(act(r, 'C3').finish).toBe('2027-01-22');
  });

  it('C3 durationUsed = 0', () => {
    expect(act(r, 'C3').durationUsed).toBe(0);
  });

  it('D3 still starts 2027-01-29 (driven by C4, not C3)', () => {
    expect(act(r, 'D3').start).toBe('2027-01-29');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 6 — Pipeline crew check
// ══════════════════════════════════════════════════════════════════════════════
describe('Pipeline crew check — Deal 1 + Deal 2', () => {
  it('no crew clash (Deal 2 worksStart = Deal 1 PC, strict inequality)', () => {
    const r1 = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);
    const r2 = schedule(TEMPLATE, D2_INPUTS, HOLIDAYS);
    const result = checkCrewClash([
      { worksStart: r1.keyDates.worksStart, pc: r1.keyDates.pc },
      { worksStart: r2.keyDates.worksStart, pc: r2.keyDates.pc },
    ]);
    expect(result.clash).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 7 — Actuals reschedule
// ══════════════════════════════════════════════════════════════════════════════
describe('Actuals reschedule — C1 finishes 2 WD late', () => {
  // C1 planned finish for Deal 1 = 2027-01-21
  // 2 WD late = addWorkdays('2027-01-21', 2, HOLIDAYS) = 2027-01-25
  const C1_LATE = addWorkdays('2027-01-21', 2, HOLIDAYS);
  const rBaseline = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS);
  const rActual   = schedule(TEMPLATE, D1_INPUTS, HOLIDAYS, { C1: { finish: C1_LATE } });

  it('baseline C1 finish = 2027-01-21', () => {
    expect(act(rBaseline, 'C1').finish).toBe('2027-01-21');
  });

  it('actual C1 finish is 2 WD after baseline', () => {
    expect(C1_LATE).toBe('2027-01-25');
  });

  it('PC moves exactly 2 WD later', () => {
    const expectedPc = addWorkdays(rBaseline.keyDates.pc, 2, HOLIDAYS);
    expect(rActual.keyDates.pc).toBe(expectedPc);
  });

  it('variance = +2 WD', () => {
    // networkdays from day after baseline PC to actual PC = 2
    const variance = networkdays(
      addWorkdays(rBaseline.keyDates.pc, 1, HOLIDAYS),
      rActual.keyDates.pc,
      HOLIDAYS,
    );
    expect(variance).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Case 8 — Bad input: missing secured date
// ══════════════════════════════════════════════════════════════════════════════
describe('Bad input — secured date missing', () => {
  const r = schedule(TEMPLATE, { route: 'auction', scope: SCOPE_D1 }, HOLIDAYS);

  it('status is incomplete', () => {
    expect(r.status).toBe('incomplete');
  });

  it('missing contains dealSecured', () => {
    expect(r.missing).toContain('dealSecured');
  });

  it('no dates generated (activities is undefined or empty)', () => {
    expect(r.activities).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property tests
// ══════════════════════════════════════════════════════════════════════════════
describe('Property tests', () => {
  // Random scope combinations — FS predecessors always finish before successor starts
  const scopeCombos = [
    { pre2000: true,  structural: true,  dampTimber: false, roofExternal: true,  windowsDoors: false, rewire: true,  heatingBoiler: false, kitchen: true,  bathroom: false },
    { pre2000: false, structural: false, dampTimber: true,  roofExternal: false, windowsDoors: true,  rewire: false, heatingBoiler: true,  kitchen: false, bathroom: true  },
    { pre2000: true,  structural: false, dampTimber: false, roofExternal: false, windowsDoors: false, rewire: false, heatingBoiler: false, kitchen: false, bathroom: false },
  ];

  for (const scope of scopeCombos) {
    it(`no FS start earlier than predecessor finish (scope=${JSON.stringify(scope)})`, () => {
      const r = schedule(TEMPLATE, { ...DEFAULTS, route: 'auction', dealSecured: '2027-03-01', scope }, HOLIDAYS);
      if (r.status !== 'complete') return; // skip incomplete
      const byId = Object.fromEntries(r.activities.map(a => [a.id, a]));
      for (const act of r.activities) {
        const def = TEMPLATE.find(t => t.id === act.id);
        for (const pred of def.preds) {
          const p = byId[pred.id];
          if (!p) continue;
          if (pred.type === 'FS') {
            // No FS successor starts before its predecessor finishes (weak: start >= pred.finish)
            expect(act.start < p.finish).toBe(false);
            // start must be strictly after pred finish (for applicable activities)
            if (act.applies && p.applies) {
              expect(act.start > p.finish).toBe(true);
            }
          }
          if (pred.type === 'SS') {
            if (act.applies && p.applies) {
              expect(act.start >= p.start).toBe(true);
            }
          }
        }
      }
    });
  }

  it('skipped activities contribute 0 WD to path duration', () => {
    const r = schedule(TEMPLATE, { ...DEFAULTS, route: 'auction', dealSecured: '2027-01-04', scope: { ...SCOPE_D1, structural: true } }, HOLIDAYS);
    if (r.status !== 'complete') return;
    const r2 = schedule(TEMPLATE, { ...DEFAULTS, route: 'auction', dealSecured: '2027-01-04', scope: { ...SCOPE_D1, structural: false } }, HOLIDAYS);
    if (r2.status !== 'complete') return;
    // D3 (joinery first fix) is on the critical path whether structural Y or N
    // With structural=N, C3 is skipped; D3 should start on the same day as when driven by C4 only
    const c3y = r.activities.find(a => a.id === 'C3');
    const c3n = r2.activities.find(a => a.id === 'C3');
    expect(c3y.applies).toBe(true);
    expect(c3n.applies).toBe(false);
    expect(c3n.durationUsed).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Integration test
// ══════════════════════════════════════════════════════════════════════════════
describe('Integration — 1 WD shift propagates to sale completion', () => {
  it('shifting secured by 1 WD shifts saleCompleted by 1 WD (no holiday crossed)', () => {
    // Use a date range with no holidays between the two schedules
    const r1 = schedule(TEMPLATE, { ...DEFAULTS, route: 'auction', dealSecured: '2027-06-01', scope: SCOPE_D1 }, HOLIDAYS);
    const r2 = schedule(TEMPLATE, { ...DEFAULTS, route: 'auction', dealSecured: addWorkdays('2027-06-01', 1, HOLIDAYS), scope: SCOPE_D1 }, HOLIDAYS);
    if (r1.status !== 'complete' || r2.status !== 'complete') return;
    expect(r2.keyDates.saleCompleted).toBe(
      addWorkdays(r1.keyDates.saleCompleted, 1, HOLIDAYS),
    );
  });
});
