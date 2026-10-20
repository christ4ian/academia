// src/ui/shared.js — Shared row renderers with visible note previews, subtasks, and competition status

import { icon, esc } from './icons.js';
import { fmt, parseISO, localToday, daysBetween, compStatus } from '../dates.js';
import { db, getTypeLabel, getTypeColor, getLinkedNote } from '../store.js';

export function taskDue(t) {
  return t.due ? fmt(t.due) : 'Tanpa tenggat';
}

export function taskPercent(t) {
  const a = t.subtasks || [];
  return a.length ? Math.round((100 * a.filter((s) => s.done).length) / a.length) : null;
}

export function isOverdue(t) {
  return !t.done && t.due && t.due < localToday();
}

export function tasksOrdered() {
  return [...db.tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') ||
      String(a.title).localeCompare(String(b.title))
  );
}

export function personalsOrdered() {
  return db.activities
    .filter((a) => a.type === 'personal')
    .sort(
      (a, b) =>
        Number(Boolean(a.done)) - Number(Boolean(b.done)) ||
        (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31') ||
        String(a.title).localeCompare(String(b.title))
    );
}

export function formatEventTime(e) {
  if (e.time) return e.endTime ? `${e.time}–${e.endTime}` : e.time;
  if (e.kind === 'task') return 'Deadline';
  if (e.kind === 'holiday') return 'Hari libur';
  return 'Sepanjang hari';
}

// Fase 2: Preview catatan 1-2 baris di mana-mana
export function notePreviewHTML(item, openAttr = '') {
  const linked = getLinkedNote(item);
  const text = String(item?.notes || '').trim();
  const linkedTitle = linked ? linked.title : '';
  const linkedBody = linked ? linked.body : '';
  if (!text && !linked) return '';

  const display = text || (linkedTitle ? `${linkedTitle}: ${linkedBody}` : linkedBody);
  const badge = linked && text ? `<span class="note-link-chip">${icon('notes', 'sm')} ${esc(linkedTitle)}</span>` : '';

  return `<div class="note-preview" ${openAttr} title="Ketuk untuk melihat catatan">${icon(
    'notes',
    'sm'
  )}<span class="note-preview-text">${esc(display)}</span>${badge}</div>`;
}

export function taskRow(t) {
  const subtasks = t.subtasks || [];
  const subtasksHTML = subtasks.length
    ? `<div class="subtask-checklist">${subtasks
        .map(
          (s, i) =>
            `<div class="subtask-item"><button type="button" class="sub-tick ${
              s.done ? 'done' : ''
            }" data-toggle-subtask="${esc(t.id)}" data-subtask-index="${i}" title="${
              s.done ? 'Batalkan' : 'Selesai'
            }" aria-label="Tandai subtugas ${esc(s.title)}">${
              s.done ? icon('check', 'sm') : ''
            }</button><span class="sub-title ${s.done ? 'done' : ''}">${esc(s.title)}</span></div>`
        )
        .join('')}</div>`
    : '';
  const pct = taskPercent(t);
  const noteHTML = notePreviewHTML(t, `data-edit-task="${esc(t.id)}"`);

  return `<div class="task-line"><button class="tick ${
    t.done ? 'done' : ''
  }" data-toggle-task="${esc(t.id)}" title="${
    t.done ? 'Tandai belum selesai' : 'Tandai selesai'
  }" aria-label="${t.done ? 'Batalkan selesai' : 'Selesaikan'} ${esc(t.title)}">${
    t.done ? icon('check', 'sm') : ''
  }</button><div class="item-text"><strong class="${
    t.done ? 'finished' : ''
  }" data-edit-task="${esc(t.id)}" style="cursor:pointer">${esc(t.title)}</strong><div class="row-sub">${esc(
    t.subject || 'Umum'
  )} · ${esc(taskDue(t))}${
    isOverdue(t) ? ' · <span style="color:var(--red)">Terlambat</span>' : ''
  }</div>${noteHTML}${subtasksHTML}</div>${
    pct !== null ? `<span class="tail" title="Progres subtugas">${pct}%</span>` : ''
  }<button class="row-open" data-edit-task="${esc(t.id)}" title="Lihat detail tugas" aria-label="Buka ${esc(
    t.title
  )}">${icon('right', 'sm')}</button></div>`;
}

export function personalRow(p) {
  const subtasks = p.subtasks || [];
  const subtasksHTML = subtasks.length
    ? `<div class="subtask-checklist">${subtasks
        .map(
          (s, i) =>
            `<div class="subtask-item"><button type="button" class="sub-tick ${
              s.done ? 'done' : ''
            }" data-toggle-personal-subtask="${esc(p.id)}" data-subtask-index="${i}" title="${
              s.done ? 'Batalkan' : 'Selesai'
            }" aria-label="Tandai checklist ${esc(s.title)}">${
              s.done ? icon('check', 'sm') : ''
            }</button><span class="sub-title ${s.done ? 'done' : ''}">${esc(s.title)}</span></div>`
        )
        .join('')}</div>`
    : '';
  const pct = taskPercent(p);
  const dateInfo = p.startDate
    ? `${fmt(p.startDate)}${p.startTime ? ' · ' + p.startTime : ''}`
    : 'Fleksibel (tanpa tenggat)';
  const noteHTML = notePreviewHTML(p, `data-open-event="${esc(p.id)}" data-kind="personal"`);

  return `<div class="task-line"><button class="tick ${
    p.done ? 'done' : ''
  }" data-toggle-personal="${esc(p.id)}" title="${
    p.done ? 'Tandai belum selesai' : 'Tandai selesai'
  }" aria-label="${p.done ? 'Batalkan selesai' : 'Selesaikan'} ${esc(p.title)}">${
    p.done ? icon('check', 'sm') : ''
  }</button><div class="item-text"><strong class="${
    p.done ? 'finished' : ''
  }" data-open-event="${esc(p.id)}" data-kind="personal" style="cursor:pointer">${esc(
    p.title
  )}</strong><div class="row-sub">${esc(p.subject || 'Agenda pribadi')} · ${esc(
    dateInfo
  )}</div>${noteHTML}${subtasksHTML}</div>${
    pct !== null ? `<span class="tail" title="Progres checklist">${pct}%</span>` : ''
  }<button class="row-open" data-open-event="${esc(
    p.id
  )}" data-kind="personal" title="Lihat detail agenda" aria-label="Buka ${esc(p.title)}">${icon(
    'right',
    'sm'
  )}</button></div>`;
}

export function eventRow(e) {
  const color = getTypeColor(e.kind);
  const dObj = parseISO(e.date);
  const noteHTML = notePreviewHTML(e, `data-open-event="${esc(e.id)}" data-kind="${esc(e.kind)}"`);

  return `<div class="agenda-row clickable" data-open-event="${esc(e.id)}" data-kind="${esc(
    e.kind
  )}"><div class="daybox"><small>${fmt(e.date, { month: 'short' })}</small><strong>${
    dObj ? dObj.getDate() : ''
  }</strong></div><div class="agenda-info"><strong><span class="type-dot" style="background:${esc(
    color
  )}"></span>${esc(e.title)}</strong><span class="row-sub">${esc(e.subtitle)} · ${esc(
    formatEventTime(e)
  )}</span>${noteHTML}</div><button class="row-open" data-open-event="${esc(e.id)}" data-kind="${esc(
    e.kind
  )}" title="Lihat detail">${icon('right', 'sm')}</button></div>`;
}

// Fase 1 & Fase 6: Kartu Lomba Aktif dengan compStatus yang memperbaiki bug tanggal lampau
export function competitionCardHTML(c, today = localToday()) {
  const { st, upcoming, state } = compStatus(c, today);
  const pillLabel =
    state === 'active' ? 'Aktif' : state === 'finished' ? 'Selesai' : 'Tanpa jadwal';
  const pillClass = state === 'active' ? 'on' : '';

  let bottomText = 'Tambahkan jadwal tahapan';
  if (upcoming) {
    const diff = daysBetween(today, upcoming.date);
    const countdown = diff === 0 ? 'Hari ini' : diff > 0 ? `H-${diff}` : '';
    bottomText = `Berikutnya: ${esc(upcoming.title)} · ${fmt(upcoming.date)}${
      countdown ? ` (${countdown})` : ''
    }`;
  } else if (state === 'finished') {
    bottomText = 'Semua tahap sudah lewat';
  }

  const noteHTML = notePreviewHTML(c, `data-open-comp="${esc(c.id)}"`);

  const stagesHTML = st.length
    ? st
        .map((s) => {
          const isPast = s.date < today;
          const isMissed = !s.done && isPast;
          const isNext = upcoming?.id === s.id;
          return `<div class="stage ${s.done ? 'passed' : ''} ${isMissed ? 'missed' : ''} ${
            isNext ? 'next' : ''
          }"><button type="button" class="round" data-stage-toggle="${esc(c.id)}" data-stage-id="${esc(
            s.id
          )}" aria-label="${s.done ? 'Batalkan selesai' : 'Tandai selesai'} tahap ${esc(s.title)}">${
            s.done ? icon('check', 'sm') : ''
          }</button><strong>${esc(s.title)}</strong><small>${fmt(s.date)}${
            isMissed ? ' · <span class="stage-missed-tag">terlewat</span>' : ''
          }</small></div>`;
        })
        .join('')
    : '<span class="muted tiny">Belum ada tahapan.</span>';

  return `<section class="competition-card"><div class="competition-top"><div><h2>${esc(
    c.name
  )}</h2><div class="competition-meta">${esc(
    [c.subject, c.mode, c.location].filter(Boolean).join(' · ') || 'Lomba akademik'
  )}</div>${noteHTML}</div><span class="pill ${pillClass}">${pillLabel}</span></div><div class="timeline-scroll"><div class="timeline">${stagesHTML}</div></div><div class="comp-bottom"><span class="tiny muted">${bottomText}</span><button class="text-link" data-open-comp="${esc(
    c.id
  )}">Detail & edit ${icon('right', 'sm')}</button></div></section>`;
}

