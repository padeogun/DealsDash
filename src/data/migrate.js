import { doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import * as repo from "./repo.js";
import { seedDefaultBuyBoxIfNeeded } from "./seedDefaults.js";
import { migrateV2Deal, migrateV2Settings, migrationSummary } from "../lib/migrations/v2.js";

/**
 * Idempotent boot-time migration. Runs two passes:
 *
 * Pass 1 — Schema v2 (appData/main → per-entity subcollections). Skipped when
 *   settings/app.schemaVersion === 2. Never deletes or modifies the legacy doc.
 *
 * Pass 2 — Default buy box seed. Skipped when buyBoxes collection is non-empty.
 *   Reads any legacy strategyProfile / thresholds from settings to pre-populate.
 *
 * Pass 3 — Appraisal v2 schema fields (schemaVersion 2 → 3). Skipped when
 *   settings/app.schemaVersion >= 3. Adds deal.v2 block to every deal and
 *   settings.appraisal block to settings. Idempotent: already-migrated docs
 *   are returned unchanged by migrateV2Deal / migrateV2Settings.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {(msg: string) => void} [onProgress]
 */
export async function runMigrationIfNeeded(db, uid, onProgress) {
  // ── Pass 1: schema v2 ───────────────────────────────────────────────────────
  const settingsSnap = await getDoc(repo.settingsDocRef(db, uid));
  const settingsData = settingsSnap.exists() ? settingsSnap.data() : null;
  const alreadyV2 = (settingsData?.schemaVersion || 0) >= 2;

  if (!alreadyV2) {
    const legacyRef = doc(db, "users", uid, "appData", "main");
    const legacySnap = await getDoc(legacyRef);

    if (!legacySnap.exists()) {
      // Fresh install — stamp the schema version; continue to buy-box seed below
      await repo.saveSettings(db, uid, { schemaVersion: 2, migratedAt: Date.now() });
      await repo.savePlanner(db, uid, {});
    } else {
      const data = legacySnap.data();
      const before = {
        deals:      (data.deals      || []).length,
        leads:      (data.leads      || []).length,
        ledger:     (data.ledger     || []).length,
        contacts:   (data.contacts   || []).length,
        properties: (data.properties || []).length,
      };

      onProgress?.(
        `Migrating data — ${before.deals} deal${before.deals !== 1 ? "s" : ""}, ` +
        `${before.leads} lead${before.leads !== 1 ? "s" : ""}, ` +
        `${before.contacts} contact${before.contacts !== 1 ? "s" : ""}…`
      );

      const allOps = [
        ...(data.deals      || []).map(e => ({ ref: repo.dealDocRef    (db, uid, e.id), data: e })),
        ...(data.leads      || []).map(e => ({ ref: repo.leadDocRef    (db, uid, e.id), data: e })),
        ...(data.ledger     || []).map(e => ({ ref: repo.ledgerDocRef  (db, uid, e.id), data: e })),
        ...(data.contacts   || []).map(e => ({ ref: repo.contactDocRef (db, uid, e.id), data: e })),
        ...(data.properties || []).map(e => ({ ref: repo.propertyDocRef(db, uid, e.id), data: e })),
      ];

      for (let i = 0; i < allOps.length; i += 499) {
        const batch = writeBatch(db);
        for (const op of allOps.slice(i, i + 499)) batch.set(op.ref, op.data);
        await batch.commit();
      }

      const { planning, ...settingsWithoutPlanning } = data.settings || {};
      await repo.saveSettings(db, uid, {
        ...settingsWithoutPlanning,
        schemaVersion: 2,
        migratedAt: Date.now(),
      });
      await repo.savePlanner(db, uid, planning || {});

      const [dealsSnap, leadsSnap, ledgerSnap, contactsSnap, propertiesSnap] = await Promise.all([
        getDocs(repo.dealsColRef     (db, uid)),
        getDocs(repo.leadsColRef     (db, uid)),
        getDocs(repo.ledgerColRef    (db, uid)),
        getDocs(repo.contactsColRef  (db, uid)),
        getDocs(repo.propertiesColRef(db, uid)),
      ]);

      const after = {
        deals:      dealsSnap.size,
        leads:      leadsSnap.size,
        ledger:     ledgerSnap.size,
        contacts:   contactsSnap.size,
        properties: propertiesSnap.size,
      };

      const mismatches = Object.keys(before).filter(k => after[k] !== before[k]);
      if (mismatches.length > 0) {
        const detail = mismatches.map(k => `${k}: expected ${before[k]}, got ${after[k]}`).join("; ");
        throw new Error(
          `[DealsDash] Migration count mismatch — ${detail}. ` +
          `Legacy document preserved; no data was deleted.`
        );
      }

      console.log("[DealsDash] Migration v2 complete. Deals migrated:", before?.deals?.length ?? "unknown");
    }
  }

  // ── Pass 2: default buy box seed (idempotent — skipped if any box exists) ──
  // Re-read settings after v2 migration in case they were just written above
  const latestSettingsSnap = await getDoc(repo.settingsDocRef(db, uid));
  const latestSettings = latestSettingsSnap.exists() ? latestSettingsSnap.data() : {};
  await seedDefaultBuyBoxIfNeeded(db, uid, latestSettings);

  // ── Pass 3: appraisal v2 schema fields (schemaVersion 2 → 3) ─────────────
  const needsAppraisalV2 = (latestSettings?.schemaVersion || 1) < 3;
  if (needsAppraisalV2) {
    onProgress?.("Adding appraisal v2 fields to deals…");

    // Migrate settings — adds appraisal block with illustrative defaults
    const migratedSettings = migrateV2Settings(latestSettings);
    await repo.saveSettings(db, uid, { ...migratedSettings, schemaVersion: 3, migratedV3At: Date.now() });

    // Migrate all deals — adds v2 block, pre-fills from v1 fields where unambiguous
    const dealsSnap = await getDocs(repo.dealsColRef(db, uid));
    const deals = dealsSnap.docs.map(d => d.data());
    const migratedDeals = deals.map(migrateV2Deal);

    for (let i = 0; i < migratedDeals.length; i += 499) {
      const batch = writeBatch(db);
      migratedDeals.slice(i, i + 499).forEach(deal =>
        batch.set(repo.dealDocRef(db, uid, deal.id), deal)
      );
      await batch.commit();
    }

    const summary = migrationSummary(migratedDeals);
    console.log(
      `[DealsDash] Migration v3 complete. ${summary.total} deal(s). ` +
      `Pre-filled: valuation=${summary.prefilled.valuation}, ` +
      `costLines=${summary.prefilled.costLines}, ` +
      `rent=${summary.prefilled.rent}.`
    );
  }
}
