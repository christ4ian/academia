// src/firebase.js — Firebase initialization (Web + Capacitor Android)

import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Web & Android configuration extracted from project academia-chr1zx
export const firebaseConfig = {
  apiKey: 'AIzaSyBMBJSlr6IPwNNXJAHna8PLVyz-zPsNwbc',
  authDomain: 'academia-chr1zx.firebaseapp.com',
  projectId: 'academia-chr1zx',
  storageBucket: 'academia-chr1zx.firebasestorage.app',
  messagingSenderId: '394244652949',
  appId: '1:394244652949:android:566474ef8da3f23159809c',
  webClientId: '394244652949-1vrsm0dt85kr897nuuln5b7tmthjk4hc.apps.googleusercontent.com',
};

let app = null;
let auth = null;
let firestore = null;

export function getFirebase() {
  if (typeof window === 'undefined') {
    return { app: null, auth: null, firestore: null };
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    try {
      auth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      });
    } catch (_) {
      auth = getAuth(app);
    }
    try {
      firestore = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch (_) {
      firestore = getFirestore(app);
    }
  }
  return { app, auth, firestore };
}

export function isNativeCapacitor() {
  if (typeof window === 'undefined') return false;
  const Cap = window.Capacitor;
  if (!Cap) return false;
  if (typeof Cap.isNativePlatform === 'function') return Cap.isNativePlatform();
  return Boolean(Cap.getPlatform && Cap.getPlatform() !== 'web');
}

