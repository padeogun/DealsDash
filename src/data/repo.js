import {
  collection, doc, query, orderBy, limit,
  getDocs, setDoc, deleteDoc, writeBatch,
} from "firebase/firestore";

// ── Path refs ──────────────────────────────────────────────────────────────

export const settingsDocRef   = (db, uid) => doc(db, "users", uid, "settings", "app");
export const plannerDocRef    = (db, uid) => doc(db, "users", uid, "planner", "main");

export const dealsColRef      = (db, uid) => collection(db, "users", uid, "deals");
export const dealDocRef       = (db, uid, id) => doc(db, "users", uid, "deals", id);

export const leadsColRef      = (db, uid) => collection(db, "users", uid, "leads");
export const leadDocRef       = (db, uid, id) => doc(db, "users", uid, "leads", id);

export const ledgerColRef     = (db, uid) => collection(db, "users", uid, "ledger");
export const ledgerDocRef     = (db, uid, id) => doc(db, "users", uid, "ledger", id);

export const contactsColRef   = (db, uid) => collection(db, "users", uid, "contacts");
export const contactDocRef    = (db, uid, id) => doc(db, "users", uid, "contacts", id);

export const propertiesColRef = (db, uid) => collection(db, "users", uid, "properties");
export const propertyDocRef   = (db, uid, id) => doc(db, "users", uid, "properties", id);

// ── CRUD ───────────────────────────────────────────────────────────────────

export const saveDeal         = (db, uid, deal)     => setDoc(dealDocRef(db, uid, deal.id), deal);
export const deleteDeal       = (db, uid, id)       => deleteDoc(dealDocRef(db, uid, id));

export const saveLead         = (db, uid, lead)     => setDoc(leadDocRef(db, uid, lead.id), lead);
export const deleteLead       = (db, uid, id)       => deleteDoc(leadDocRef(db, uid, id));

export const saveLedgerEntry  = (db, uid, entry)    => setDoc(ledgerDocRef(db, uid, entry.id), entry);
export const deleteLedgerEntry = (db, uid, id)      => deleteDoc(ledgerDocRef(db, uid, id));

export const saveContact      = (db, uid, contact)  => setDoc(contactDocRef(db, uid, contact.id), contact);
export const deleteContact    = (db, uid, id)       => deleteDoc(contactDocRef(db, uid, id));

export const saveProperty     = (db, uid, property) => setDoc(propertyDocRef(db, uid, property.id), property);
export const deleteProperty   = (db, uid, id)       => deleteDoc(propertyDocRef(db, uid, id));

export const saveSettings     = (db, uid, settings) => setDoc(settingsDocRef(db, uid), settings);
export const savePlanner      = (db, uid, planner)  => setDoc(plannerDocRef(db, uid), planner);

export const buyBoxesColRef   = (db, uid) => collection(db, "users", uid, "buyBoxes");
export const buyBoxDocRef     = (db, uid, id) => doc(db, "users", uid, "buyBoxes", id);
export const saveBuyBox       = (db, uid, box)  => setDoc(buyBoxDocRef(db, uid, box.id), box);
export const deleteBuyBox     = (db, uid, id)   => deleteDoc(buyBoxDocRef(db, uid, id));

// Decision briefs — subcollection under each deal.
// Covered by the existing wildcard Firestore rule: match /users/{userId}/{document=**}
export const briefsColRef     = (db, uid, dealId) => collection(db, "users", uid, "deals", dealId, "briefs");
export const briefDocRef      = (db, uid, dealId, briefId) => doc(db, "users", uid, "deals", dealId, "briefs", briefId);
export const saveBrief        = (db, uid, dealId, brief) => setDoc(briefDocRef(db, uid, dealId, brief.id), brief);

// marketStats is a root collection (not per-user) — intentional single-user exception to the
// subcollection pattern. Written by the refreshMarketStats Cloud Function, read by the client.
// Do not move under users/{uid}/ without a data migration.
export const marketStatsColRef  = (db) => collection(db, "marketStats");
export const marketStatsDocRef  = (db, district) => doc(db, "marketStats", district);

// Notifications — recent 50 desc; covered by the existing wildcard Firestore rule.
export const notificationsColRef  = (db, uid) => collection(db, "users", uid, "notifications");
export const notificationDocRef   = (db, uid, id) => doc(db, "users", uid, "notifications", id);
export const notificationsQueryRef = (db, uid) =>
  query(notificationsColRef(db, uid), orderBy("createdAt", "desc"), limit(50));
export const saveNotification     = (db, uid, n) => setDoc(notificationDocRef(db, uid, n.id), n);
export const markNotificationRead = (db, uid, id, ts) =>
  setDoc(notificationDocRef(db, uid, id), { readAt: ts }, { merge: true });

export async function markAllNotificationsRead(db, uid, ids, ts) {
  for (let i = 0; i < ids.length; i += 499) {
    const batch = writeBatch(db);
    ids.slice(i, i + 499).forEach(id =>
      batch.set(notificationDocRef(db, uid, id), { readAt: ts }, { merge: true })
    );
    await batch.commit();
  }
}

// Deletes all entity documents for a user across every collection.
// Does NOT touch settings/app or planner/main — callers reset those separately.
export async function deleteAllForUser(db, uid) {
  const colRefs = [
    dealsColRef(db, uid),
    leadsColRef(db, uid),
    ledgerColRef(db, uid),
    contactsColRef(db, uid),
    propertiesColRef(db, uid),
  ];
  const snapshots = await Promise.all(colRefs.map(getDocs));
  const allDocs = snapshots.flatMap(s => s.docs);
  // writeBatch is capped at 500 ops; split if needed
  for (let i = 0; i < allDocs.length; i += 499) {
    const batch = writeBatch(db);
    allDocs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
