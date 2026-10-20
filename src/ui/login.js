// src/ui/login.js — Login gate UI (Google + Email/Password + Forgot Password)

import { icon, esc } from './icons.js';
import {
  loginWithGoogle,
  loginWithEmail,
  registerWithEmail,
  resetPassword,
  mapAuthError,
} from '../auth.js';
import { toast } from './picker.js';

let authMode = 'login'; // 'login' | 'register'
let authBusy = false;

export function renderLoginGate() {
  const wrap = document.getElementById('login-gate');
  if (!wrap) return;
  const isReg = authMode === 'register';

  wrap.innerHTML = `<div class="login-card">
    <div class="login-brand">
      <span class="brand-icon">a.</span>
      <span class="brand-title">academia.</span>
    </div>
    <h1 class="login-title">${isReg ? 'Buat akun <em>baru.</em>' : 'Selamat datang <em>kembali.</em>'}</h1>
    <p class="login-sub">Masuk untuk menyinkronkan tugas, jadwal harian, catatan, dan tahapan lombamu di semua perangkat.</p>

    <button type="button" class="google-btn" id="btn-google-login">
      ${icon('google', 'sm')}
      <span>Masuk dengan Google</span>
    </button>

    <div class="login-sep"><span>atau dengan email</span></div>

    <form id="auth-email-form" autocomplete="on">
      ${
        isReg
          ? `<div class="field"><label for="auth-name">Nama panggilan (opsional)</label><input id="auth-name" name="displayName" type="text" placeholder="Nama kamu" maxlength="60"></div>`
          : ''
      }
      <div class="field">
        <label for="auth-email">Email</label>
        <input id="auth-email" name="email" type="email" placeholder="nama@email.com" required autocomplete="email">
      </div>
      <div class="field">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <label for="auth-password">Kata sandi</label>
          ${
            !isReg
              ? `<button type="button" class="text-link" id="btn-forgot-pw" style="padding:0;font-size:11.5px">Lupa kata sandi?</button>`
              : ''
          }
        </div>
        <input id="auth-password" name="password" type="password" placeholder="Minimal 6 karakter" required minlength="6" autocomplete="${
          isReg ? 'new-password' : 'current-password'
        }">
      </div>

      <div id="auth-feedback" class="auth-feedback hidden" role="alert"></div>

      <button type="submit" class="primary login-submit" id="btn-email-submit">
        ${isReg ? 'Daftar & Masuk' : 'Masuk'}
      </button>
    </form>

    <div class="login-switch">
      <span>${isReg ? 'Sudah punya akun?' : 'Belum punya akun?'}</span>
      <button type="button" class="text-link" id="btn-toggle-auth-mode">${
        isReg ? 'Masuk di sini' : 'Daftar sekarang'
      }</button>
    </div>
  </div>`;
}

function setAuthError(msg, isInfo = false) {
  const el = document.getElementById('auth-feedback');
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('info', isInfo);
  el.textContent = msg;
}

function setAuthLoading(busy) {
  authBusy = busy;
  const gBtn = document.getElementById('btn-google-login');
  const sBtn = document.getElementById('btn-email-submit');
  if (gBtn) gBtn.disabled = busy;
  if (sBtn) sBtn.disabled = busy;
}

export function initLoginEvents() {
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#btn-toggle-auth-mode')) {
      authMode = authMode === 'login' ? 'register' : 'login';
      renderLoginGate();
      return;
    }
    if (t.closest('#btn-google-login')) {
      if (authBusy) return;
      setAuthError('');
      setAuthLoading(true);
      try {
        await loginWithGoogle();
        toast('Berhasil masuk dengan Google.');
      } catch (err) {
        setAuthError(mapAuthError(err));
      } finally {
        setAuthLoading(false);
      }
      return;
    }
    if (t.closest('#btn-forgot-pw')) {
      if (authBusy) return;
      const email = document.getElementById('auth-email')?.value.trim() || '';
      if (!email) {
        setAuthError('Ketik alamat emailmu terlebih dahulu di kolom Email, lalu tekan Lupa kata sandi.');
        document.getElementById('auth-email')?.focus();
        return;
      }
      setAuthLoading(true);
      try {
        await resetPassword(email);
        setAuthError(`Tautan reset kata sandi telah dikirim ke ${email}. Periksa kotak masuk atau spam.`, true);
      } catch (err) {
        setAuthError(mapAuthError(err));
      } finally {
        setAuthLoading(false);
      }
    }
  });

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'auth-email-form') return;
    e.preventDefault();
    if (authBusy) return;
    setAuthError('');
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const displayName = String(f.get('displayName') || '').trim();

    setAuthLoading(true);
    try {
      if (authMode === 'register') {
        await registerWithEmail(email, password, displayName);
        toast('Akun berhasil dibuat.');
      } else {
        await loginWithEmail(email, password);
        toast('Selamat datang kembali!');
      }
    } catch (err) {
      setAuthError(mapAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  });
}

export function renderUserMenuHeader(user) {
  const box = document.getElementById('user-menu-summary');
  if (!box) return;
  if (!user) {
    box.innerHTML = '';
    return;
  }
  const email = user.email || 'Akun Terhubung';
  const name = user.displayName || email.split('@')[0];
  const initial = (name[0] || 'A').toUpperCase();
  const avatar = user.photoURL
    ? `<img src="${esc(user.photoURL)}" alt="" class="user-avatar" referrerpolicy="no-referrer">`
    : `<span class="user-avatar-fallback">${esc(initial)}</span>`;

  box.innerHTML = `<div class="user-summary-row">${avatar}<div class="user-summary-text"><strong>${esc(
    name
  )}</strong><small>${esc(email)}</small></div></div>`;
}

