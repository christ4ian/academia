// src/ui/tasks.js — Tasks & Personal Agenda view (Fase 2, poin 3)

import { icon, esc, heading } from './icons.js';
import { tasksOrdered, personalsOrdered, taskRow, personalRow } from './shared.js';

export let taskSegment = 'task'; // 'task' | 'personal'
export let taskFilter = 'active'; // 'active' | 'done' | 'all'
export let taskQuery = '';

export function setTaskSegment(seg) {
  taskSegment = seg === 'personal' ? 'personal' : 'task';
}

export function setTaskFilter(f) {
  taskFilter = f;
}

export function setTaskQuery(q) {
  taskQuery = q;
}

export function renderTasks() {
  const q = taskQuery.toLocaleLowerCase('id');
  const isPersonal = taskSegment === 'personal';

  const source = isPersonal ? personalsOrdered() : tasksOrdered();
  const list = source.filter(
    (item) =>
      (taskFilter === 'all' || (taskFilter === 'active' ? !item.done : Boolean(item.done))) &&
      `${item.title} ${item.subject || ''} ${item.notes || ''}`.toLocaleLowerCase('id').includes(q)
  );

  const segmentTabs = `<div class="segment-switch" style="margin-bottom:14px">
    <button type="button" class="seg-btn ${!isPersonal ? 'active' : ''}" data-task-segment="task">${icon(
    'tasks',
    'sm'
  )} Tugas Sekolah</button>
    <button type="button" class="seg-btn ${isPersonal ? 'active' : ''}" data-task-segment="personal">${icon(
    'book',
    'sm'
  )} Agenda Pribadi</button>
  </div>`;

  const emptyMsg = isPersonal
    ? `<div class="empty">Belum ada agenda pribadi (seperti bikin rangkuman mandiri atau checklist belajar).<br><button type="button" class="secondary" style="margin-top:10px" data-add-type="personal">${icon(
        'plus',
        'sm'
      )} Tambah Agenda Pribadi</button></div>`
    : '<div class="empty">Tidak ada tugas yang cocok.</div>';

  document.getElementById('tasks').innerHTML =
    heading(
      isPersonal ? 'SELF-PACED AGENDA' : 'ASSIGNMENTS',
      isPersonal ? 'Agenda Pribadi' : 'My Tasks',
      isPersonal
        ? 'Rencana belajar mandiri, merangkum materi, atau target pribadi tanpa tenggat wajib dari guru.'
        : 'Semua PR, proyek, latihan mandiri, dan pekerjaan kelas dengan preview catatan langsung terlihat.'
    ) +
    segmentTabs +
    `<div class="toolrow"><div class="tabs">${[
      ['active', 'Aktif'],
      ['done', 'Selesai'],
      ['all', 'Semua'],
    ]
      .map(
        ([v, n]) =>
          `<button class="tab ${taskFilter === v ? 'active' : ''}" data-task-filter="${v}">${n}</button>`
      )
      .join('')}</div><div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:flex-end"><input class="search" id="task-search" type="search" placeholder="${
      isPersonal ? 'Cari agenda atau mapel...' : 'Cari tugas atau mapel...'
    }" value="${esc(taskQuery)}" aria-label="Cari"><button type="button" class="secondary" data-add-type="${
      isPersonal ? 'personal' : 'task'
    }">${icon('plus', 'sm')} ${isPersonal ? 'Agenda' : 'Tugas'}</button></div></div><div class="panel task-table">${
      list.length ? list.map(isPersonal ? personalRow : taskRow).join('') : emptyMsg
    }</div>`;
}

