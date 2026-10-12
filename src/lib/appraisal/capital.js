// Private / revolving capital — cost and recycling tracker.
// Default: VIXIV fund at 8% simple annual interest, 12-month bullet, 3-month extension.
// Illustrative — confirm rate with fund manager.

import { round2 } from "../utils.js";

const DEFAULT_RATE          = 0.08;    // 8% per annum simple
const DEFAULT_TERM_MONTHS   = 12;
const DEFAULT_EXT_MONTHS    = 3;
const MS_PER_MONTH          = 1000 * 60 * 60 * 24 * 30.4375; // average Gregorian month

/**
 * Cost of borrowing private capital for a given period.
 * Simple interest: allocated × annualRate × months / 12
 */
export function capitalCost(allocated, months, rate = DEFAULT_RATE) {
  allocated = Number(allocated);
  months    = Number(months);
  rate      = Number(rate);
  const cost = round2(allocated * rate * months / 12);
  return { allocated, months, rate, cost };
}

/**
 * Recycling overview for a capital pool.
 * @param {number} pool   Total capital available (£)
 * @param {Array<{ id:string, allocated:number, deployedAt:string, returnedAt?:string }>} deals
 * @param {{ termMonths?:number, extensionMonths?:number }} opts
 * @returns {{ deployed:number, returned:number, idle:number, turnsPerYear:number,
 *             overrunCount:number, projectedEndBalance:number }}
 */
export function recycling(pool, deals, opts = {}) {
  pool = Number(pool);
  const termMonths = Number(opts.termMonths    || DEFAULT_TERM_MONTHS);
  const extMonths  = Number(opts.extensionMonths || DEFAULT_EXT_MONTHS);
  const now        = Date.now();

  let deployed = 0;
  let returned = 0;
  let overrunCount = 0;

  for (const deal of deals || []) {
    if (!deal.returnedAt) {
      deployed += Number(deal.allocated);
      const monthsHeld = (now - new Date(deal.deployedAt).getTime()) / MS_PER_MONTH;
      if (monthsHeld > termMonths + extMonths) overrunCount++;
    } else {
      returned += Number(deal.allocated);
    }
  }

  const idle = pool - deployed;

  const completed = (deals || []).filter((d) => d.returnedAt);
  const avgMonths = completed.length > 0
    ? completed.reduce((s, d) => {
        const mo = (new Date(d.returnedAt) - new Date(d.deployedAt)) / MS_PER_MONTH;
        return s + mo;
      }, 0) / completed.length
    : termMonths;

  const turnsPerYear = avgMonths > 0 ? round2(12 / avgMonths) : 0;

  // Simple linear projection: idle capital × turns + currently-deployed (assume 1 more turn)
  const projectedEndBalance = round2(pool); // placeholder until real term-end logic is needed

  return { deployed: round2(deployed), returned: round2(returned), idle: round2(idle), turnsPerYear, overrunCount, projectedEndBalance };
}
