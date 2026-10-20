// src/ui/notes.js — Dedicated Notes tab (Fase 2, poin 1)

import { icon, esc, heading } from './icons.js';
import { fmt } from '../dates.js';
import { db, NOTE_COLORS } from '../store.js';

export let noteQuery = '';
export let noteSubjectFilter = '';

export function setNoteQuery(q) {
  noteQuery = q;
}

export function setNoteSubjectFilter(s) {
  noteSubjectFilter = s;
}

export function renderNotes() {
  const allNotes = [...(db.notes || [])].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      (b.updatedAt || 0) - (a.updatedAt || 0)
  );

  const subjects = [
    ...new Set(
      allNotes
        .map((n) => String(n.subject || '').trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const q = noteQuery.toLocaleLowerCase('id');
  const filtered = allNotes.filter((n) => {
    if (noteSubjectFilter && (n.subject || '').trim() !== noteSubjectFilter) return false;
    if (!q) return true;
    return `${n.title} ${n.body} ${n.subject || ''}`.toLocaleLowerCase('id').includes(q);
  });

  const subjectChips = subjects.length
    ? `<div class="filterrow"><button type="button" class="filterchip ${
        !noteSubjectFilter ? '' : 'off'
      }" data-note-subj="">Semua Mapel</button>${subjects
        .map(
          (s) =>
            `<button type="button" class="filterchip ${
              noteSubjectFilter === s ? '' : 'off'
            }" data-note-subj="${esc(s)}">${esc(s)}</button>`
        )
        .join('')}</div>`
    : '';

  const cards = filtered
    .map((n) => {
      const colObj = NOTE_COLORS.find((c) => c.id === n.color);
      const bg = colObj && colObj.id ? colObj.bg : 'var(--surface)';
      return `<article class="note-card" style="background:${bg}" data-open-note="${esc(n.id)}">
        <div class="note-card-head">
          <div style="min-width:0;flex:1">
            <h3>${esc(n.title)}</h3>
            ${n.subject ? `<span class="note-subj">${esc(n.subject)}</span>` : ''}
          </div>
          <button type="button" class="iconbtn pin-btn ${
            n.pinned ? 'pinned' : ''
          }" data-toggle-pin="${esc(n.id)}" title="${
        n.pinned ? 'Lepas sematan' : 'Sematkan ke Home'
      }" aria-label="${n.pinned ? 'Lepas sematan' : 'Sematkan'}">${icon('pin', 'sm')}</button>
        </div>
        <p class="note-card-body">${esc(n.body)}</p>
        <div class="note-card-foot">
          <span class="tiny muted">${fmt(n.createdAt)}</span>
          <span class="text-link">Buka ${icon('right', 'sm')}</span>
        </div>
      </article>`;
    })
    .join('');

  document.getElementById('notes').innerHTML =
    heading(
      'KNOWLEDGE & QUICK NOTES',
      'Notes',
      'Simpan rumus, rangkuman singkat, tautan materi, atau pengingat. Sematkan catatan agar tampil langsung di halaman depan.'
    ) +
    `<div class="toolrow"><div style="display:flex;gap:8px;align-items:center"><button type="button" class="primary" data-add-type="note">${icon(
      'plus',
      'sm'
    )} Catatan Baru</button></div><input class="search" id="note-search" type="search" placeholder="Cari isi atau judul catatan..." value="${esc(
      noteQuery
    )}" aria-label="Cari catatan"></div>` +
    subjectChips +
    (cards
      ? `<div class="notes-grid">${cards}</div>`
      : `<div class="panel empty">Belum ada catatan yang cocok. Tekan <b>Catatan Baru</b> untuk membuat catatan pertamamu.</div>`);
}

