#!/usr/bin/env node
// Verifies IMD data extraction from postcodes.io for a set of test postcodes.
// Usage:
//   node scripts/build-imd.js               — runs default test set
//   node scripts/build-imd.js "OL11 1BH"    — checks a single postcode

const TEST_POSTCODES = ["OL11 1BH", "OL12 0LA", "OL16 1AB", "OL1 1QA", "OL2 5AB", "SK15 1AB"];
const TOTAL_LSOAS = 32844; // England 2019 IMD total LSOA count

const targets = process.argv.slice(2).length ? process.argv.slice(2) : TEST_POSTCODES;

async function checkPostcode(postcode) {
  const clean = postcode.replace(/\s+/g, "").toUpperCase();
  let res;
  try {
    res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  } catch (e) {
    console.error(`  ${postcode}: network error — ${e.message}`);
    return;
  }
  if (!res.ok) {
    console.log(`  ${postcode}: NOT FOUND (${res.status})`);
    return;
  }
  const json = await res.json();
  const pc = json.result;
  if (!pc) { console.log(`  ${postcode}: no result`); return; }

  if (pc.country !== "England") {
    console.log(`  ${postcode}: country="${pc.country}" — IMD not available`);
    return;
  }
  const rank = pc.index_of_multiple_deprivation;
  if (rank == null) {
    console.log(`  ${postcode}: England but index_of_multiple_deprivation missing from response`);
    return;
  }
  const decile = Math.ceil(rank * 10 / TOTAL_LSOAS);
  const label = decile <= 3 ? "most deprived" : decile <= 7 ? "mid" : "least deprived";
  console.log(`  ${postcode}: rank=${rank}/${TOTAL_LSOAS}  decile=${decile}/10 (${label})  LSOA="${pc.lsoa || "?"}"`);
}

(async () => {
  console.log("IMD verification via postcodes.io");
  console.log(`Decile formula: Math.ceil(rank * 10 / ${TOTAL_LSOAS})  (1=most deprived, 10=least)\n`);
  for (const pc of targets) {
    await checkPostcode(pc);
  }
})();
