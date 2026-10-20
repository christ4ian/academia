// src/sync.js — Firestore subcollection sync (users/{uid}/{tasks|activities|notes|competitions}/{id})
// Last-write-wins per item using `updatedAt`, tombstone `deleted: true`, first-time upload prompt

import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { getFirebase } from './firebase.js';
import { db, save, registerSyncAdapter, migrateDB } from './store.js';

const COLLECTIONS = ['tasks', 'activities', 'notes', 'competitions'];

let activeUid = null;
let unsubscribers = [];
let onRemoteUpdateCallback = null;
let askFirstUploadCallback = null;

export function registerSyncCallbacks({ onRemoteUpdate, askFirstUpload }) {
  onRemoteUpdateCallback = onRemoteUpdate;
  askFirstUploadCallback = askFirstUpload;
}

export function stopSync() {
  for (const unsub of unsubscribers) {
    try {
      unsub();
    } catch (_) {}
  }
  unsubscribers = [];
  activeUid = null;
}

// Pure merge helper (also exported for unit tests)
export function mergeCollectionLWW(localItems, remoteDocs) {
  const byId = new Map();
  for (const item of localItems || []) {
    if (item && item.id && !item.deleted) {
      byId.set(item.id, { ...item, updatedAt: Number(item.updatedAt) || 0 });
    }
  }
  const toPushToRemote = [];
  let changedLocal = false;

  const seenRemote = new Set();
  for (const r of remoteDocs || []) {
    if (!r || !r.id) continue;
    seenRemote.add(r.id);
    const rTime = Number(r.updatedAt) || 0;
    const local = byId.get(r.id);
    const lTime = Number(local?.updatedAt) || 0;

    if (r.deleted) {
      if (local && rTime >= lTime) {
        byId.delete(r.id);
        changedLocal = true;
      } else if (local && lTime > rTime) {
        toPushToRemote.push(local);
      }
      continue;
    }

    if (!local || rTime > lTime) {
      const cleaned = { ...r };
      delete cleaned.deleted;
      byId.set(r.id, cleaned);
      changedLocal = true;
    } else if (lTime > rTime) {
      toPushToRemote.push(local);
    }
  }

  for (const [id, local] of byId.entries()) {
    if (!seenRemote.has(id)) {
      toPushToRemote.push(local);
    }
  }

  return {
    merged: [...byId.values()],
    toPushToRemote,
    changedLocal,
  };
}

async function pushItem(colName, item) {
  if (!activeUid) return;
  const { firestore } = getFirebase();
  if (!firestore || !item?.id) return;
  try {
    const ref = doc(firestore, 'users', activeUid, colName, item.id);
    await setDoc(ref, { ...item, deleted: false, updatedAt: Number(item.updatedAt) || Date.now() });
  } catch (err) {
    console.warn(`Sync pushItem (${colName}/${item.id}) error:`, err);
  }
}

async function deleteItem(colName, id) {
  if (!activeUid || !id) return;
  const { firestore } = getFirebase();
  if (!firestore) return;
  try {
    const ref = doc(firestore, 'users', activeUid, colName, id);
    await setDoc(ref, { id, deleted: true, updatedAt: Date.now() });
  } catch (err) {
    console.warn(`Sync deleteItem (${colName}/${id}) error:`, err);
  }
}

async function pushSettings(settings) {
  if (!activeUid) return;
  const { firestore } = getFirebase();
  if (!firestore) return;
  try {
    const ref = doc(firestore, 'users', activeUid);
    await setDoc(
      ref,
      {
        settings: {
          types: settings?.types || {},
          updatedAt: Number(settings?.updatedAt) || Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Sync pushSettings error:', err);
  }
}

async function pushAll(fullDb) {
  if (!activeUid) return;
  const { firestore } = getFirebase();
  if (!firestore) return;
  try {
    const batch = writeBatch(firestore);
    const userRef = doc(firestore, 'users', activeUid);
    batch.set(
      userRef,
      {
        settings: {
          types: fullDb.settings?.types || {},
          updatedAt: Number(fullDb.settings?.updatedAt) || Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    for (const colName of COLLECTIONS) {
      for (const item of fullDb[colName] || []) {
        if (!item?.id) continue;
        const ref = doc(firestore, 'users', activeUid, colName, item.id);
        batch.set(ref, { ...item, deleted: false, updatedAt: Number(item.updatedAt) || Date.now() });
      }
    }
    await batch.commit();
  } catch (err) {
    console.warn('Sync pushAll error:', err);
  }
}

export async function startSyncForUser(user) {
  stopSync();
  if (!user?.uid) return;
  const { firestore } = getFirebase();
  if (!firestore) return;

  activeUid = user.uid;

  // Initial check: is Firestore completely empty for this user while device has data?
  try {
    const userRef = doc(firestore, 'users', activeUid);
    const userSnap = await getDoc(userRef);
    const remoteSnapshots = await Promise.all(
      COLLECTIONS.map((c) => getDocs(collection(firestore, 'users', activeUid, c)))
    );
    const remoteTotalCount = remoteSnapshots.reduce((acc, snap) => acc + snap.size, 0);
    const localTotalCount = COLLECTIONS.reduce((acc, c) => acc + (db[c]?.length || 0), 0);

    const migKey = `academia_migrated_${activeUid}`;
    const alreadyMigrated =
      typeof localStorage !== 'undefined' && localStorage.getItem(migKey) === '1';

    if (!userSnap.exists() && remoteTotalCount === 0 && localTotalCount > 0 && !alreadyMigrated) {
      let shouldUpload = true;
      if (askFirstUploadCallback) {
        shouldUpload = await askFirstUploadCallback();
      }
      if (typeof localStorage !== 'undefined') localStorage.setItem(migKey, '1');
      if (shouldUpload) {
        await pushAll(db);
      } else {
        // User declined uploading demo/local data -> start clean for this account
        db.tasks = [];
        db.activities = [];
        db.notes = [];
        db.competitions = [];
        save({ skipSync: true });
        if (onRemoteUpdateCallback) onRemoteUpdateCallback();
      }
    } else {
      if (typeof localStorage !== 'undefined') localStorage.setItem(migKey, '1');
      // Merge existing remote & local items per collection using LWW
      for (let i = 0; i < COLLECTIONS.length; i++) {
        const colName = COLLECTIONS[i];
        const remoteDocs = remoteSnapshots[i].docs.map((d) => ({ id: d.id, ...d.data() }));
        const { merged, toPushToRemote, changedLocal } = mergeCollectionLWW(db[colName], remoteDocs);
        if (changedLocal) {
          db[colName] = merged;
        }
        for (const item of toPushToRemote) {
          void pushItem(colName, item);
        }
      }
      if (userSnap.exists()) {
        const uData = userSnap.data();
        const rSetTime = Number(uData?.settings?.updatedAt) || 0;
        const lSetTime = Number(db.settings?.updatedAt) || 0;
        if (uData?.settings?.types && rSetTime > lSetTime) {
          db.settings = { ...db.settings, ...uData.settings };
          const migrated = migrateDB(db);
          db.settings = migrated.settings;
        } else if (lSetTime > rSetTime) {
          void pushSettings(db.settings);
        }
      } else {
        void pushSettings(db.settings);
      }
      save({ skipSync: true });
      if (onRemoteUpdateCallback) onRemoteUpdateCallback();
    }
  } catch (err) {
    console.warn('Initial sync merge warning (offline or rules):', err);
  }

  // Subscribe to real-time updates on user profile/settings
  const userRef = doc(firestore, 'users', activeUid);
  unsubscribers.push(
    onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const rTime = Number(data?.settings?.updatedAt) || 0;
        const lTime = Number(db.settings?.updatedAt) || 0;
        if (data?.settings?.types && rTime > lTime) {
          db.settings = { ...db.settings, ...data.settings };
          const migrated = migrateDB(db);
          db.settings = migrated.settings;
          save({ skipSync: true });
          if (onRemoteUpdateCallback) onRemoteUpdateCallback();
        }
      },
      (err) => console.warn('User doc snapshot warning:', err)
    )
  );

  // Subscribe to each subcollection
  for (const colName of COLLECTIONS) {
    const colRef = collection(firestore, 'users', activeUid, colName);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        let changed = false;
        const map = new Map((db[colName] || []).map((x) => [x.id, x]));

        for (const change of snap.docChanges()) {
          const rDoc = { id: change.doc.id, ...change.doc.data() };
          const rTime = Number(rDoc.updatedAt) || 0;
          const local = map.get(rDoc.id);
          const lTime = Number(local?.updatedAt) || 0;

          if (change.type === 'removed' || rDoc.deleted) {
            if (local && rTime >= lTime) {
              map.delete(rDoc.id);
              changed = true;
            }
          } else {
            if (!local || rTime > lTime) {
              const cleaned = { ...rDoc };
              delete cleaned.deleted;
              map.set(rDoc.id, cleaned);
              changed = true;
            }
          }
        }

        if (changed) {
          db[colName] = [...map.values()];
          const migrated = migrateDB(db);
          db[colName] = migrated[colName];
          save({ skipSync: true });
          if (onRemoteUpdateCallback) onRemoteUpdateCallback();
        }
      },
      (err) => console.warn(`Snapshot (${colName}) warning:`, err)
    );
    unsubscribers.push(unsub);
  }
}

registerSyncAdapter({
  pushItem,
  deleteItem,
  pushSettings,
  pushAll,
});

