// src/ui/picker.js — Custom select/date/time bottom-sheet picker, confirm modal, and toast

import { icon, esc } from './icons.js';
import { MONTHS, parseISO, toISO, localToday, fmt, fmtFull, pad } from '../dates.js';

let toastTimer = null;

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
}

if (typeof window !== 'undefined') {
  window.__academiaToast = toast;
}

export const gid = (id) => document.getElementById(id);

const picker = { el: null, kind: '', y: 0, m: 0, h: 7, mi: 0, query: '' };
const pickKind = (el) => (el.tagName === 'SELECT' ? 'select' : el.type);

export function pickLabelText(el) {
  if (el.tagName === 'SELECT') {
    const o = el.options[el.selectedIndex];
    return o ? o.textContent : '';
  }
  if (el.type === 'date') {
    if (!parseISO(el.value)) return '';
    if (el.closest && (el.closest('.stage-edit') || el.closest('.dayplan-row'))) {
      return fmt(el.value, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return fmt(el.value, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return el.value || '';
}

export function syncPick(el) {
  const b = el && el._btn;
  if (!b) return;
  const kind = pickKind(el);
  const txt = pickLabelText(el);
  const ph = kind === 'date' ? 'Pilih tanggal' : kind === 'time' ? 'Pilih jam' : 'Pilih';
  b.innerHTML = `<span class="pick-val${txt ? '' : ' is-empty'}">${esc(txt || ph)}</span>${icon(
    kind === 'date' ? 'calendar' : kind === 'time' ? 'clock' : 'down',
    'sm'
  )}`;
}

export function enhanceControls(root) {
  if (!root) return;
  root
    .querySelectorAll('select:not([data-enh]),input[type=date]:not([data-enh]),input[type=time]:not([data-enh])')
    .forEach((el) => {
      el.dataset.enh = '1';
      el.dataset.req = el.required ? '1' : '';
      el.required = false;
      el.classList.add('pick-native');
      el.tabIndex = -1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick-btn';
      b.setAttribute('aria-haspopup', 'dialog');
      const lab = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
      b.setAttribute(
        'aria-label',
        ((lab && lab.textContent) || el.getAttribute('aria-label') || 'Pilih').replace(/\s*\*\s*$/, '')
      );
      b._el = el;
      el._btn = b;
      el.after(b);
      syncPick(el);
    });
}

export function pickerOpen(el) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  picker.el = el;
  picker.kind = pickKind(el);
  picker.query = '';
  gid('picker-title').textContent = el._btn.getAttribute('aria-label');
  if (picker.kind === 'date') {
    const d = parseISO(el.value) || parseISO(localToday());
    picker.y = d.getFullYear();
    picker.m = d.getMonth();
    renderDatePicker();
  } else if (picker.kind === 'time') {
    const v = /^(\d{2}):(\d{2})$/.exec(el.value);
    const n = new Date();
    picker.h = v ? +v[1] : n.getHours();
    picker.mi = v ? +v[2] : n.getMinutes();
    renderTimePicker();
  } else {
    renderSelectPicker();
  }
  el._btn.classList.add('open');
  gid('picker-wrap').classList.add('show');
  if (picker.kind === 'time') {
    document.querySelectorAll('#picker-body .tp-col').forEach((c) => {
      const s = c.querySelector('.sel');
      if (s) c.scrollTop = s.offsetTop - (c.clientHeight - s.offsetHeight) / 2;
    });
  } else if (picker.kind === 'select') {
    gid('picker-body').querySelector('.pk-opt.sel')?.scrollIntoView({ block: 'center' });
  }
}

export function pickerClose() {
  gid('picker-wrap')?.classList.remove('show');
  if (picker.el && picker.el._btn) picker.el._btn.classList.remove('open');
  picker.el = null;
}

export function pickerSet(v) {
  const el = picker.el;
  if (!el) return;
  el.value = v;
  syncPick(el);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  pickerClose();
}

function renderSelectOptionsList() {
  const el = picker.el;
  if (!el) return '';
  const q = picker.query.trim().toLowerCase();
  const opts = [...el.options].filter(
    (o) => !q || o.textContent.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
  );
  if (!opts.length) {
    return '<div class="empty">Tidak ada pilihan yang cocok.</div>';
  }
  return opts
    .map((o) => {
      const on = o.value === el.value;
      const sub = o.dataset.sub || '';
      return `<button type="button" class="pk-opt${on ? ' sel' : ''}" data-pk-val="${esc(o.value)}"><div><span>${esc(
        o.textContent
      )}</span>${sub ? `<small class="pk-sub">${esc(sub)}</small>` : ''}</div>${
        on ? icon('check', 'sm') : ''
      }</button>`;
    })
    .join('');
}

export function renderSelectPicker() {
  const el = picker.el;
  const searchable = el.dataset.searchable === '1' || el.options.length > 7;
  const searchHTML = searchable
    ? `<div style="margin-bottom:8px"><input type="search" id="pk-search-input" class="search" style="height:40px;font-size:14px" placeholder="Cari pilihan..." value="${esc(
        picker.query
      )}"></div>`
    : '';
  gid('picker-body').innerHTML =
    searchHTML + `<div class="pk-list" id="pk-list-items">${renderSelectOptionsList()}</div>`;
  gid('picker-foot').innerHTML = '';
}

export function renderDatePicker() {
  const { y, m, el } = picker;
  const cur = el.value;
  const today = localToday();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - offset + i, 12);
    const iso = toISO(d);
    cells += `<button type="button" class="dp-cell${d.getMonth() !== m ? ' out' : ''}${
      iso === cur ? ' sel' : ''
    }${iso === today ? ' today' : ''}" data-pk-date="${iso}" aria-label="${fmtFull(iso)}">${d.getDate()}</button>`;
  }
  gid('picker-body').innerHTML = `<div class="dp-top"><strong class="dp-month">${MONTHS[m]} ${y}</strong><div class="cal-nav"><button type="button" class="iconbtn" data-pk-shift="-1" aria-label="Bulan sebelumnya">${icon(
    'left',
    'sm'
  )}</button><button type="button" class="iconbtn" data-pk-shift="1" aria-label="Bulan berikutnya">${icon(
    'right',
    'sm'
  )}</button></div></div><div class="dp-week">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
    .map((s) => `<span>${s}</span>`)
    .join('')}</div><div class="dp-grid">${cells}</div>`;
  gid('picker-foot').innerHTML =
    (el.dataset.req ? '' : '<button type="button" class="ghost destructive" data-pk-clear>Hapus</button>') +
    '<button type="button" class="secondary" data-pk-today>Hari ini</button>';
}

export function renderTimePicker() {
  const col = (n, sel, attr) =>
    '<div class="tp-col">' +
    Array.from(
      { length: n },
      (_, i) => `<button type="button" class="tp-item${i === sel ? ' sel' : ''}" ${attr}="${i}">${pad(i)}</button>`
    ).join('') +
    '</div>';
  gid('picker-body').innerHTML = `<div class="tp-cols">${col(24, picker.h, 'data-pk-h')}<span class="tp-sep">:</span>${col(
    60,
    picker.mi,
    'data-pk-mi'
  )}</div>`;
  gid('picker-foot').innerHTML =
    (picker.el.dataset.req ? '' : '<button type="button" class="ghost destructive" data-pk-clear>Hapus</button>') +
    '<button type="button" class="primary" data-pk-timeok>Selesai</button>';
}

let confirmResolve = null;

export function confirmDone(v) {
  gid('confirm-wrap')?.classList.remove('show');
  const r = confirmResolve;
  confirmResolve = null;
  if (r) r(v);
}

export function askConfirm(msg, { title = 'Konfirmasi', ok = 'Lanjutkan', cancel = 'Batal', danger = false } = {}) {
  if (confirmResolve) confirmDone(false);
  gid('confirm-title').textContent = title;
  gid('confirm-msg').textContent = msg;
  const y = gid('confirm-yes');
  const n = gid('confirm-no');
  y.textContent = ok;
  if (n) n.textContent = cancel;
  y.classList.toggle('dangerfill', danger);
  gid('confirm-wrap').classList.add('show');
  return new Promise((r) => {
    confirmResolve = r;
  });
}

export function initPickerAndConfirm() {
  gid('picker-close').innerHTML = icon('close', 'sm');

  document.addEventListener('input', (e) => {
    if (e.target.id === 'pk-search-input') {
      picker.query = e.target.value;
      const list = gid('pk-list-items');
      if (list) list.innerHTML = renderSelectOptionsList();
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    const c = (s) => t.closest(s);
    const pb = c('.pick-btn');
    if (pb && pb._el) {
      e.preventDefault();
      pickerOpen(pb._el);
      return;
    }
    if (!gid('picker-wrap')?.classList.contains('show')) return;
    if (t.id === 'picker-wrap' || c('#picker-close')) {
      pickerClose();
      return;
    }
    let n;
    if ((n = c('[data-pk-val]'))) {
      pickerSet(n.dataset.pkVal);
      return;
    }
    if ((n = c('[data-pk-date]'))) {
      pickerSet(n.dataset.pkDate);
      return;
    }
    if ((n = c('[data-pk-shift]'))) {
      const d = new Date(picker.y, picker.m + Number(n.dataset.pkShift), 1);
      picker.y = d.getFullYear();
      picker.m = d.getMonth();
      renderDatePicker();
      return;
    }
    if (c('[data-pk-today]')) {
      pickerSet(localToday());
      return;
    }
    if (c('[data-pk-clear]')) {
      pickerSet('');
      return;
    }
    if ((n = c('[data-pk-h]'))) {
      picker.h = Number(n.dataset.pkH);
      n.parentNode.querySelector('.sel')?.classList.remove('sel');
      n.classList.add('sel');
      return;
    }
    if ((n = c('[data-pk-mi]'))) {
      picker.mi = Number(n.dataset.pkMi);
      n.parentNode.querySelector('.sel')?.classList.remove('sel');
      n.classList.add('sel');
      return;
    }
    if (c('[data-pk-timeok]')) {
      pickerSet(pad(picker.h) + ':' + pad(picker.mi));
      return;
    }
  });

  gid('confirm-yes')?.addEventListener('click', () => confirmDone(true));
  gid('confirm-no')?.addEventListener('click', () => confirmDone(false));
  gid('confirm-wrap')?.addEventListener('click', (e) => {
    if (e.target.id === 'confirm-wrap') confirmDone(false);
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (gid('confirm-wrap')?.classList.contains('show')) {
        e.stopImmediatePropagation();
        confirmDone(false);
        return;
      }
      if (gid('picker-wrap')?.classList.contains('show')) {
        e.stopImmediatePropagation();
        pickerClose();
      }
    },
    true
  );
}

