/**
 * Export users/{uid}/appData/main (legacy) AND all v2 subcollections
 * to a timestamped JSON file in backups/.
 *
 * Usage (run from repo root):
 *   node scripts/backup-firestore.js
 *
 * Prerequisites:
 *   npm install -g firebase-tools   (if not already installed)
 *   firebase login                  (once)
 *
 * The script uses the Firebase Admin SDK via the firebase-admin package.
 * It reads GOOGLE_APPLICATION_CREDENTIALS from the environment, OR falls
 * back to Application Default Credentials (ADC) if you ran `firebase login`.
 *
 * Output: backups/appData-main-YYYYMMDD-HHmm.json
 * The backups/ folder is in .gitignore — files are never committed.
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const PROJECT_ID = "dealsdash";
const ALLOWED_EMAIL = "paul.a.adeogun@gmail.com";

async function main() {
  // Initialise Admin SDK (uses ADC / GOOGLE_APPLICATION_CREDENTIALS)
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID });
  }
  const db = getFirestore();

  // Look up the UID for the allowed email
  const { getAuth } = require("firebase-admin/auth");
  let uid;
  try {
    const user = await getAuth().getUserByEmail(ALLOWED_EMAIL);
    uid = user.uid;
  } catch (e) {
    console.error("Could not find user for", ALLOWED_EMAIL, e.message);
    process.exit(1);
  }
  console.log("Found uid:", uid);

  const backup = { exportedAt: new Date().toISOString(), uid, schemaVersion: null, collections: {} };

  // ── Read settings (includes schemaVersion) ──────────────────────────────────
  const settingsSnap = await db.doc(`users/${uid}/settings/app`).get();
  backup.schemaVersion = settingsSnap.exists ? (settingsSnap.data().schemaVersion || 1) : 1;
  backup.collections.settings = settingsSnap.exists ? settingsSnap.data() : null;

  // ── Read planner ─────────────────────────────────────────────────────────────
  const plannerSnap = await db.doc(`users/${uid}/planner/main`).get();
  backup.collections.planner = plannerSnap.exists ? plannerSnap.data() : null;

  // ── Read v2 subcollections ───────────────────────────────────────────────────
  const subcollections = ["deals", "leads", "ledger", "contacts", "properties", "buyBoxes", "notifications"];
  for (const col of subcollections) {
    const snap = await db.collection(`users/${uid}/${col}`).get();
    backup.collections[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    console.log(`  ${col}: ${snap.size} documents`);
  }

  // ── Read decision briefs (sub-subcollection under each deal) ─────────────────
  const deals = backup.collections.deals || [];
  for (const deal of deals) {
    const briefsSnap = await db.collection(`users/${uid}/deals/${deal.id}/briefs`).get();
    deal._briefs = briefsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // ── Read legacy appData/main (if it still exists) ────────────────────────────
  const legacySnap = await db.doc(`users/${uid}/appData/main`).get();
  backup.legacy = legacySnap.exists ? legacySnap.data() : null;
  console.log("  legacy appData/main:", legacySnap.exists ? "found" : "not present");

  // ── Write to backups/ ────────────────────────────────────────────────────────
  const backupsDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (c) => c === "T" ? "-" : c);
  const filename = `appData-main-${ts}.json`;
  const outPath = path.join(backupsDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(backup, null, 2), "utf8");

  const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\nBackup written: backups/${filename} (${sizeKb} KB)`);
  console.log("IMPORTANT: The 1 MiB Firestore document limit is per document, not per export.");
  console.log("Check the 'deals' array size to estimate per-deal document growth.");
}

main().catch((e) => { console.error(e); process.exit(1); });
