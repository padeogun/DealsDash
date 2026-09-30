# App.jsx edits — Viewing survey integration
Eleven `str_replace` edits, each matching exactly once in the App.jsx you uploaded (3,581 lines). Applied in order to a copy and verified to parse; the patched file and a unified diff are included in the zip.
Prerequisites: unzip `vixiv-design-system-v1.0` to `src/design-system/` and `dealsdash-survey-module-v1.0` to `src/modules/survey/` (the module imports `../../design-system/react/index.jsx`).

## 1. 1a firestore import

**old_str**
```jsx
import { getFirestore, doc, getDoc, setDoc, connectFirestoreEmulator } from "firebase/firestore";
```
**new_str**
```jsx
import { getFirestore, doc, getDoc, setDoc, connectFirestoreEmulator, enableIndexedDbPersistence } from "firebase/firestore";
```

## 2. 1b survey module imports

**old_str**
```jsx
import { getStorage, ref, uploadBytes, deleteObject, connectStorageEmulator } from "firebase/storage";
```
**new_str**
```jsx
import { getStorage, ref, uploadBytes, deleteObject, connectStorageEmulator } from "firebase/storage";
import SurveyModule from "./modules/survey/SurveyModule.jsx";
import { defaultRates } from "./modules/survey/data/rates.js";
import { mergeRefurbItems } from "./modules/survey/lib/applyToDeal.js";
```

## 3. 2 offline persistence

**old_str**
```jsx
  window.__testStorage = storage;
}

```
**new_str**
```jsx
  window.__testStorage = storage;
} else if (typeof window !== "undefined") {
  // Viewings happen in empty houses with no signal: queue writes locally and sync when back online.
  // Rejects harmlessly in a second open tab or an unsupported browser.
  enableIndexedDbPersistence(db).catch(() => {});
}

```

## 4. 3 DEFAULT_SETTINGS.surveyRates

**old_str**
```jsx
strategyProfile: DEFAULT_STRATEGY_PROFILE };
```
**new_str**
```jsx
strategyProfile: DEFAULT_STRATEGY_PROFILE, surveyRates: null };
```

## 5. 4 newDeal survey fields

**old_str**
```jsx
    areaIntelligence: null,
    epcCheck: null,
  };
}

function exampleDeal
```
**new_str**
```jsx
    areaIntelligence: null,
    epcCheck: null,
    listingType: "other", // "auction" | "agent" | "d2v" | "trader" | "other" — carried from the lead; the viewing survey reads it
    survey: null,         // viewing survey state (src/modules/survey) — lives on the deal, single-document model
    surveyApplied: null,  // { at, total, lines, unconfirmed, needsEpc } — stamped by "Apply to deal"
  };
}

function exampleDeal
```

## 6. 5 DEAL_TABS

**old_str**
```jsx
"AI review", "Legal pack"];
```
**new_str**
```jsx
"AI review", "Legal pack", "Viewing survey"];
```

## 7. 6 DealDetailView props

**old_str**
```jsx
function DealDetailView({ deal, onChange, onDelete, onBack, thresholds, onMoveToRental, alreadyLinkedProperty, ownerUid }) {
```
**new_str**
```jsx
function DealDetailView({ deal, onChange, onDelete, onBack, thresholds, onMoveToRental, alreadyLinkedProperty, ownerUid, surveyRates, onSurveyRatesChange }) {
```

## 8. 7 applySurveyToDeal

**old_str**
```jsx
  const base = useMemo(() => appraiseDeal(enrichDeal(deal)), [deal]);
  const baseVerdict
```
**new_str**
```jsx
  // Viewing survey → deal. Survey-owned refurb lines replace their previous versions; manual
  // trades survive (mergeRefurbItems). If the max bid isn't locked it is re-solved on the
  // patched deal so the survey's live bar shows a figure that reflects the new works.
  function applySurveyToDeal(patch) {
    const next = { ...deal, ...patch, refurbItems: mergeRefurbItems(deal.refurbItems, patch.refurbItems) };
    const out = { ...patch, refurbItems: next.refurbItems };
    if (!deal.maxBidLocked) {
      const result = solveMaxBid(next, Number(targetProfitInput) || 0);
      const entry = { at: Date.now(), from: deal.maxBid, to: result.maxBid, reason: `Re-solved after viewing survey (${patch.refurbItems.length} lines, ${fmtGBP(patch.surveyApplied.total)})`, action: "solve" };
      Object.assign(out, { maxBid: result.maxBid, maxBidGdvLow: result.gdvLow, maxBidSolveNote: result.note, maxBidLog: [...(deal.maxBidLog || []), entry] });
    }
    onChange(out);
  }

  const base = useMemo(() => appraiseDeal(enrichDeal(deal)), [deal]);
  const baseVerdict
```

## 9. 8 mount SurveyModule

**old_str**
```jsx
          onApplyFees={applyLegalPackFeesToDeal}
        />
      )}

      <Card>
        <SectionTitle>Notes</SectionTitle>
```
**new_str**
```jsx
          onApplyFees={applyLegalPackFeesToDeal}
        />
      )}

      {subTab === "Viewing survey" && (
        <SurveyModule
          deal={deal}
          rates={surveyRates || defaultRates()}
          maxBid={deal.maxBid ?? null}
          onChange={(survey) => onChange({ survey })}
          onRatesChange={onSurveyRatesChange}
          onApply={applySurveyToDeal}
        />
      )}

      <Card>
        <SectionTitle>Notes</SectionTitle>
```

## 10. 9 leadToDealPartial.listingType

**old_str**
```jsx
    completionDays: Number(lead.completionDays) || 28,
    notes: [`Promoted from sourcing pipeline
```
**new_str**
```jsx
    completionDays: Number(lead.completionDays) || 28,
    listingType: lead.listingType || "other",
    notes: [`Promoted from sourcing pipeline
```

## 11. 10 App mount props

**old_str**
```jsx
alreadyLinkedProperty={properties.find((p) => p.dealId === selectedDeal.id)} ownerUid={user.uid} />}
```
**new_str**
```jsx
alreadyLinkedProperty={properties.find((p) => p.dealId === selectedDeal.id)} ownerUid={user.uid} surveyRates={settings.surveyRates} onSurveyRatesChange={(surveyRates) => setSettings({ ...settings, surveyRates })} />}
```

## After the edits

- `public/index.html`: add `data-theme="auto"` to `<html>` and `class="vx-root"` to `<body>`; import `./design-system/tokens/tokens.css` and `./design-system/css/vixiv.css` at the top of `src/tailwind-input.css` (above `@tailwind base`). Both are already partly in place if the earlier design-system pass added them — check before duplicating.
- Add `node src/modules/survey/survey.test.mjs` to `update-dealsdash.bat` before the build step (8 tests).
- No Cloud Function, rules or Storage changes. `firestore.rules` are unaffected: the survey lives inside the existing `users/{uid}/appData/main` document.

## What the survey reads from the deal (already populated by existing code)

| Deal field | Set by | Used for |
|---|---|---|
| `address, town, postcode, propertyType, bedrooms, floorArea (sq ft), price` | Promote / manual | Property tab (floor area converted to m²) |
| `listingType` | Promote (edit 9) | Auction vs market route, legal-pack compliance item |
| `epcCheck.properties[]` | EPC Register check | Address-matched band → compliance; descriptive fields (if the Cloud Function returns them) → expected states for windows, loft, cavity walls, heating |
| `areaIntelligence.flood` | Area Intelligence | Flood compliance item |
| `legalPackDocuments[].review.flags[]` / `tenureSummary` | Legal Pack Review | Tenancy, title, planning, FENSA, EICR, gas → *Verify at viewing*; knotweed / asbestos / structural → pre-filled items |

## What Apply to deal writes

`refurbItems[]` (survey lines with `surveyItemId`, merged with manual trades), `contingencyPct` as a fraction, `floorArea` in sq ft, `bedrooms`, `propertyType`, `condition` 1–5 derived from the works, `surveyApplied`, `surveyCompliance`, and — if the max bid isn't locked — a fresh `maxBid` with a log entry.

## Playwright spec to add (emulator)

1. Create deal with `epcCheck.properties[0]["windows-description"] = "Single glazed"` and a legal-pack flag on occupation.
2. Open `subtab-Viewing survey` → Verify tab lists the occupation flag; External → Windows shows *Expected from EPC* with Confirm.
3. Confirm; Internal → Kitchen → Replace; enter quote 5000.
4. Click Apply to deal → assert `refurbItems` contains `surveyItemId: "kitchen"` with `low: 5000, high: 5000`, `contingencyPct === 0.15`, and `maxBid` differs from before.
5. Reload → survey state and applied figures persist.
