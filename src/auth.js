// src/auth.js — Firebase Authentication (Google + Email/Password + Login Gate)

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { getFirebase, isNativeCapacitor } from './firebase.js';

let currentUser = null;
let authReady = false;
const listeners = new Set();

export function mapAuthError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || '');
  switch (code) {
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/user-disabled':
      return 'Akun ini telah dinonaktifkan.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email atau kata sandi salah. Periksa kembali atau daftar akun baru.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan masuk.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu pendek (minimal 6 karakter).';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login dibatalkan.';
    case 'auth/network-request-failed':
      return 'Gagal terhubung ke jaringan. Periksa koneksi internetmu.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.';
    case 'auth/operation-not-allowed':
      return 'Metode login ini belum diaktifkan di Firebase Console (Authentication -> Sign-in method).';
    default:
      if (msg.toLowerCase().includes('cancel')) return 'Login dibatalkan.';
      return msg || 'Terjadi kesalahan saat autentikasi.';
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function isAuthReady() {
  return authReady;
}

export function onAuthChange(cb) {
  listeners.add(cb);
  if (authReady) cb(currentUser);
  return () => listeners.delete(cb);
}

function notifyAuthChange() {
  for (const cb of listeners) {
    try {
      cb(currentUser);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  }
}

export function initAuth() {
  const { auth } = getFirebase();
  if (!auth) {
    authReady = true;
    notifyAuthChange();
    return;
  }

  // Handle redirect result if web used signInWithRedirect fallback
  getRedirectResult(auth).catch((err) => {
    console.warn('Redirect sign-in warning:', err);
  });

  onAuthStateChanged(auth, (user) => {
    currentUser = user || null;
    authReady = true;
    notifyAuthChange();
  });
}

export async function loginWithGoogle() {
  const { auth } = getFirebase();
  if (!auth) throw new Error('Firebase belum siap.');

  if (isNativeCapacitor()) {
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result?.credential?.idToken;
    const accessToken = result?.credential?.accessToken;
    if (!idToken && !accessToken) {
      throw new Error('Token Google tidak ditemukan dari perangkat.');
    }
    const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
    const userCred = await signInWithCredential(auth, credential);
    return userCred.user;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const userCred = await signInWithPopup(auth, provider);
    return userCred.user;
  } catch (err) {
    if (
      err?.code === 'auth/popup-blocked' ||
      err?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function loginWithEmail(email, password) {
  const { auth } = getFirebase();
  if (!auth) throw new Error('Firebase belum siap.');
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !password) {
    throw new Error('Isi email dan kata sandi terlebih dahulu.');
  }
  const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return userCred.user;
}

export async function registerWithEmail(email, password, displayName = '') {
  const { auth } = getFirebase();
  if (!auth) throw new Error('Firebase belum siap.');
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !password) {
    throw new Error('Isi email dan kata sandi terlebih dahulu.');
  }
  if (password.length < 6) {
    throw new Error('Kata sandi minimal 6 karakter.');
  }
  const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  if (displayName && userCred.user) {
    try {
      await updateProfile(userCred.user, { displayName: displayName.trim() });
    } catch (_) {}
  }
  return userCred.user;
}

export async function resetPassword(email) {
  const { auth } = getFirebase();
  if (!auth) throw new Error('Firebase belum siap.');
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) {
    throw new Error('Masukkan alamat email terlebih dahulu di kolom email.');
  }
  await sendPasswordResetEmail(auth, cleanEmail);
}

export async function logoutUser() {
  const { auth } = getFirebase();
  if (isNativeCapacitor()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch (_) {}
  }
  if (auth) {
    await signOut(auth);
  }
}

