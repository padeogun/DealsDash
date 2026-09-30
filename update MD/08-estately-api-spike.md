# 08 — Estately API Spike (investigation only — no feature build)

## Goal
Decide whether DealsDash should **pull auction lot data from the Estately API** instead of building any auction indexing. Produce a findings report. **Do not build UI or persist data** until the owner approves the report.

## Questions to answer
1. **Terms:** Read estately.uk API terms and pricing pages. Is use inside a private, single-user tool permitted free for own investing? What changes if DealsDash later becomes a paid product (commercial licence)? Quote the relevant clauses (short) with URLs.
2. **Coverage:** Which auction houses are covered? Do they include the owner's North West sources? List North West lots currently available (Rochdale, Oldham, Tameside, Greater Manchester).
3. **Data:** Which fields exist per lot (address, postcode, guide, auction date, images, relist history, legal pack links, Estately analysis)? Rate limits? Webhooks for buy-box matches?
4. **Auth and security:** How are keys issued? Plan to store as Firebase Secret `ESTATELY_API_KEY`, called only from a Cloud Function proxy (same pattern as the EPC proxy).
5. **Legal pack comparison:** For one real lot with a public legal pack, compare Estately's legal pack risk check with DealsDash's Legal Pack Review: what each catches, what each misses, and whether DealsDash's fee extraction into the appraisal remains the differentiator.

## Method
- Curl-test endpoints with a real key (owner provides); save raw sample responses in a sandbox folder excluded from the build.
- No scraping of Estately or auction-house web pages.

## Deliverable
`docs/estately-spike-findings.md` containing: answers to the five questions, a recommendation (integrate / don't / revisit), a proposed minimal integration (e.g. "Import lot into pipeline Watching stage" + scheduled pull of buy-box matches) with effort estimate and confidence, and risks (dependency on a free third party, terms change, coverage gaps).

## Acceptance criteria
- Terms verified from source, with URLs and retrieval date.
- Real sample response captured.
- Clear go/no-go recommendation for the owner.
