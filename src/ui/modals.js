// src/ui/modals.js — Entry modal (all types + notes + personal agenda), Day Plan modal, Calendar Type settings modal, and AI Settings modal (Gemini + OpenRouter)

import { icon, esc } from './icons.js';
import {
  uid,
  localToday,
  parseISO,
  fmt,
  timeToMinutes,
  minutesToTime,
  parseDayPlanText,
  detectTimeConflicts,
} from '../dates.js';
import {
  db,
  upsertItem,
  removeItem,
  saveSettings,
  getTypesMap,
  getTypeLabel,
  TYPE_PALETTE,
  NOTE_COLORS,
  DEFAULT_TYPES,
} from '../store.js';
import { enhanceControls, syncPick, toast, askConfirm, gid } from './picker.js';
import { AI } from '../ai/index.js';

export let editing = null;
export let modalType = 'task';
export let draftSubtasks = [];
export let draftStages = [];
export let modalDraft = null;
export let aiReviewWarnings = null;

// Day Plan state
let dayplanDate = localToday();
let dayplanMode = 'rows'; // 'rows' | 'text'
let dayplanRows = [];
let dayplanRawText = '';
let dayplanRepeatWeekly = false;

export const formField = (label, name, value = '', type = 'text', props = '') =>
  `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(
    value
  )}" enterkeyhint="next" autocomplete="off" ${props}></div>`;

export const selectField = (label, name, items, value = '', extraAttrs = '') =>
  `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" ${extraAttrs}>${items
    .map(
      ([v, n, sub]) =>
        `<option value="${esc(v)}" ${sub ? `data-sub="${esc(sub)}"` : ''} ${
          v === value ? 'selected' : ''
        }>${esc(n)}</option>`
    )
    .join('')}</select></div>`;

function noteAttachSelect(currentNoteId = '') {
  const notes = db.notes || [];
  if (!notes.length) return '';
  const opts = [
    ['', 'Tidak melampirkan catatan'],
    ...notes.map((n) => [n.id, n.title + (n.subject ? ` (${n.subject})` : '')]),
  ];
  return selectField('Lampirkan catatan (opsional)', 'noteId', opts, currentNoteId || '');
}

function subtaskEditors(label = 'Tambah subtask (opsional)') {
  return `<div class="subtask-list" id="subtask-editors">${draftSubtasks
    .map(
      (s, i) =>
        `<div class="subtask-edit"><input type="checkbox" data-subtask-check="${i}" ${
          s.done ? 'checked' : ''
        } aria-label="Status subtugas"><input type="text" data-subtask-text="${i}" value="${esc(
          s.title
        )}" placeholder="Nama item checklist" maxlength="120"><button type="button" title="Hapus item" data-subtask-remove="${i}">${icon(
          'close',
          'sm'
        )}</button></div>`
    )
    .join('')}</div><button class="add-inline" type="button" id="add-subtask">${icon(
    'plus',
    'sm'
  )} ${esc(label)}</button>`;
}

function stageEditors() {
  return `<div class="stages-list" id="stage-editors">${draftStages
    .map(
      (s, i) =>
        `<div class="stage-edit"><input type="text" data-stage-title="${i}" value="${esc(
          s.title
        )}" placeholder="Nama tahap" aria-label="Nama tahapan ${
          i + 1
        }" maxlength="80"><input type="date" data-stage-date="${i}" value="${esc(
          s.date || ''
        )}" aria-label="Tanggal tahapan ${
          i + 1
        }"><button title="Hapus tahap" type="button" data-stage-remove="${i}">${icon(
          'close',
          'sm'
        )}</button></div>`
    )
    .join('')}</div><button class="add-inline" id="add-stage" type="button">${icon(
    'plus',
    'sm'
  )} Tambah tahapan</button><div class="tiny muted" style="margin-top:8px">Isi nama dan tanggal setiap tahap. Semua tahap muncul di kalender.</div>`;
}

export function renderAIReview() {
  const el = gid('ai-review');
  if (!el) return;
  if (!aiReviewWarnings) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML =
    `<strong>Periksa hasil ${esc(AI.getProviderName())} sebelum menyimpan</strong><div>AI mengisi kolom di bawah secara otomatis. Kamu bebas menyesuaikan sebelum menyimpan.</div>` +
    (aiReviewWarnings.length
      ? '<ul>' + aiReviewWarnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>'
      : '');
}

export function getEditing() {
  if (!editing) return null;
  if (modalType === 'task') return db.tasks.find((t) => t.id === editing);
  if (modalType === 'competition') return db.competitions.find((c) => c.id === editing);
  if (modalType === 'note') return (db.notes || []).find((n) => n.id === editing);
  return db.activities.find((a) => a.id === editing);
}

export function captureDraftForm() {
  const form = gid('entry-form');
  if (form) {
    const f = new FormData(form);
    modalDraft = Object.fromEntries(f.entries());
    const pinEl = form.querySelector('[name="pinned"]');
    if (pinEl) modalDraft.pinned = pinEl.checked;
  }
}

export function commitDraftInputs() {
  document.querySelectorAll('[data-subtask-text]').forEach((el) => {
    const n = Number(el.dataset.subtaskText);
    if (draftSubtasks[n]) draftSubtasks[n].title = el.value;
  });
  document.querySelectorAll('[data-subtask-check]').forEach((el) => {
    const n = Number(el.dataset.subtaskCheck);
    if (draftSubtasks[n]) draftSubtasks[n].done = el.checked;
  });
  document.querySelectorAll('[data-stage-title]').forEach((el) => {
    const n = Number(el.dataset.stageTitle);
    if (draftStages[n]) draftStages[n].title = el.value;
  });
  document.querySelectorAll('[data-stage-date]').forEach((el) => {
    const n = Number(el.dataset.stageDate);
    if (draftStages[n]) draftStages[n].date = el.value;
  });
}

function getModalTypeDisplayTitle(type) {
  if (type === 'note') return 'Catatan';
  return getTypeLabel(type);
}

export function renderModal(r = null) {
  const current = r || modalDraft || getEditing();
  const typeTitle = getModalTypeDisplayTitle(modalType);
  gid('modal-title').textContent = (editing ? 'Edit ' : 'Tambah ') + typeTitle;
  gid('modal-delete').classList.toggle('hidden', !editing);

  const typesMap = getTypesMap();
  const typeButtons = [
    ['task', typesMap.task?.label || 'Tugas'],
    ['personal', typesMap.personal?.label || 'Agenda pribadi'],
    ['study', typesMap.study?.label || 'Belajar'],
    ['exam', typesMap.exam?.label || 'Ulangan'],
    ['note', 'Catatan'],
    ['holiday', typesMap.holiday?.label || 'Libur'],
    ['competition', typesMap.competition?.label || 'Lomba'],
    ['extracurricular', typesMap.extracurricular?.label || 'Ekskul'],
    ['reminder', typesMap.reminder?.label || 'Pengingat'],
    ['event', typesMap.event?.label || 'Acara sekolah'],
    ...Object.entries(typesMap)
      .filter(([k]) => !DEFAULT_TYPES[k])
      .map(([k, v]) => [k, v.label]),
  ];

  gid('modal-types').innerHTML = editing
    ? ''
    : typeButtons
        .map(
          ([k, label]) =>
            `<button type="button" data-modal-type="${esc(k)}" class="${
              k === modalType ? 'active' : ''
            }">${esc(label)}</button>`
        )
        .join('');

  let content = '';
  const today = localToday();

  if (modalType === 'task') {
    content =
      formField(
        'Nama tugas *',
        'title',
        current?.title || '',
        'text',
        'required maxlength="180" placeholder="Misalnya: Latihan soal Kimia"'
      ) +
      formField(
        'Mata pelajaran',
        'subject',
        current?.subject || '',
        'text',
        'maxlength="80" placeholder="Kimia"'
      ) +
      formField('Deadline (opsional)', 'due', current?.due || '', 'date') +
      `<div class="field"><label for="f-notes">Catatan (tampil langsung di daftar)</label><textarea id="f-notes" name="notes" placeholder="Instruksi, halaman buku, atau tautan penting...">${esc(
        current?.notes || ''
      )}</textarea></div>` +
      noteAttachSelect(current?.noteId) +
      `<div class="divider"></div><div class="section-head"><h3>Subtasks</h3><span class="tiny muted">Tidak wajib</span></div>` +
      subtaskEditors();
  } else if (modalType === 'personal') {
    const d = current || {};
    content =
      formField(
        'Nama agenda pribadi *',
        'title',
        d.title || '',
        'text',
        'required maxlength="180" placeholder="Misalnya: Bikin rangkuman Sejarah"'
      ) +
      formField(
        'Mata pelajaran / topik (opsional)',
        'subject',
        d.subject || '',
        'text',
        'maxlength="80" placeholder="Sejarah"'
      ) +
      `<div class="fieldrow">${formField(
        'Tanggal rencana (opsional)',
        'startDate',
        d.startDate || '',
        'date'
      )}${formField('Jam mulai (opsional)', 'startTime', d.startTime || '', 'time')}</div>` +
      `<div class="field"><label for="f-notes">Catatan (tampil di daftar)</label><textarea id="f-notes" name="notes" placeholder="Poin-poin yang mau dirangkum atau dipelajari...">${esc(
        d.notes || ''
      )}</textarea></div>` +
      noteAttachSelect(d.noteId) +
      `<div class="divider"></div><div class="section-head"><h3>Checklist langkah</h3><span class="tiny muted">Tidak wajib</span></div>` +
      subtaskEditors('Tambah item checklist');
  } else if (modalType === 'note') {
    const d = current || {};
    const colorOptions = NOTE_COLORS.map((c) => [c.id, c.label]);
    content =
      formField(
        'Judul catatan *',
        'title',
        d.title || '',
        'text',
        'required maxlength="140" placeholder="Misalnya: Rumus Cepat Stoikiometri"'
      ) +
      `<div class="fieldrow">${formField(
        'Mata pelajaran (opsional)',
        'subject',
        d.subject || '',
        'text',
        'maxlength="60" placeholder="Kimia"'
      )}${selectField('Warna kartu', 'color', colorOptions, d.color || '')}</div>` +
      `<div class="field"><label for="f-body">Isi catatan *</label><textarea id="f-body" name="body" rows="5" placeholder="Tulis rangkuman, rumus, atau catatan penting di sini..." required>${esc(
        d.body ?? d.notes ?? ''
      )}</textarea></div>` +
      `<label class="switchrow"><input type="checkbox" name="pinned" ${
        d.pinned ? 'checked' : ''
      }> Sematkan di halaman depan (Home)</label>`;
  } else if (modalType === 'competition') {
    content =
      formField(
        'Nama lomba *',
        'title',
        current?.name ?? current?.title ?? '',
        'text',
        'required maxlength="160" placeholder="Misalnya: Olimpiade Matematika"'
      ) +
      `<div class="fieldrow">${formField(
        'Bidang',
        'subject',
        current?.subject || '',
        'text',
        'placeholder="Matematika"'
      )}${selectField(
        'Kategori',
        'mode',
        [
          ['Individu', 'Individu'],
          ['Tim', 'Tim'],
          ['Lainnya', 'Lainnya'],
        ],
        current?.mode || 'Individu'
      )}</div>` +
      formField(
        'Lokasi / penyelenggara',
        'location',
        current?.location || '',
        'text',
        'placeholder="Opsional"'
      ) +
      `<div class="field"><label for="f-notes">Catatan</label><textarea name="notes" id="f-notes" placeholder="Ketentuan, link pendaftaran, hal penting">${esc(
        current?.notes || ''
      )}</textarea></div>` +
      noteAttachSelect(current?.noteId) +
      `<div class="divider"></div><div class="section-head"><h3>Timeline lomba</h3><span class="tiny muted">Bisa tambah tahap sebanyak perlu</span></div>` +
      stageEditors();
  } else if (modalType === 'exam') {
    const d = current || {};
    content =
      formField(
        'Nama ulangan *',
        'title',
        d.title || '',
        'text',
        'required maxlength="180" placeholder="Misalnya: UH Biologi Sel"'
      ) +
      formField(
        'Mata pelajaran (opsional)',
        'subject',
        d.subject || '',
        'text',
        'maxlength="80" placeholder="Biologi"'
      ) +
      formField('Tanggal ulangan *', 'startDate', d.startDate || today, 'date', 'required') +
      `<div class="field"><label for="f-notes">Catatan (kisi-kisi / materi)</label><textarea name="notes" id="f-notes" placeholder="Kisi-kisi atau materi ulangan...">${esc(
        d.notes || ''
      )}</textarea></div>` +
      noteAttachSelect(d.noteId);
  } else if (modalType === 'holiday') {
    const d = current || {};
    content =
      formField(
        'Nama hari libur *',
        'title',
        d.title || '',
        'text',
        'required maxlength="180" placeholder="Misalnya: Libur Semester / Tanggal Merah"'
      ) +
      formField(
        'Keterangan (opsional)',
        'subject',
        d.subject || '',
        'text',
        'maxlength="80" placeholder="Libur Nasional"'
      ) +
      `<div class="fieldrow">${formField(
        'Tanggal mulai *',
        'startDate',
        d.startDate || today,
        'date',
        'required'
      )}${formField(
        'Tanggal selesai',
        'endDate',
        d.endDate || d.startDate || today,
        'date'
      )}</div>` +
      `<div class="field"><label for="f-notes">Catatan (opsional)</label><textarea name="notes" id="f-notes" placeholder="Catatan tambahan...">${esc(
        d.notes || ''
      )}</textarea></div>`;
  } else if (modalType === 'study') {
    const d = current || {};
    const compOptions = [
      ['', 'Tidak terhubung'],
      ...db.competitions.map((c) => [c.id, c.name]),
    ];
    content =
      formField(
        'Sesi belajar *',
        'title',
        d.title || '',
        'text',
        'required maxlength="180" placeholder="Misalnya: Merangkum Sejarah"'
      ) +
      formField(
        'Mata pelajaran (opsional)',
        'subject',
        d.subject || '',
        'text',
        'maxlength="80" placeholder="Sejarah"'
      ) +
      formField('Tanggal belajar *', 'startDate', d.startDate || today, 'date', 'required') +
      `<div class="fieldrow">${formField(
        'Jam mulai',
        'startTime',
        d.startTime || '',
        'time'
      )}${formField('Jam selesai', 'endTime', d.endTime || '', 'time')}</div>` +
      selectField(
        'Pengulangan',
        'repeat',
        [
          ['none', 'Satu kali saja'],
          ['daily', 'Setiap hari'],
          ['weekly', 'Setiap minggu di hari yang sama'],
        ],
        d.repeat || 'none'
      ) +
      selectField('Terkait lomba (opsional)', 'competitionId', compOptions, d.competitionId || '') +
      `<div class="field"><label for="f-notes">Catatan (opsional)</label><textarea name="notes" id="f-notes" placeholder="Rincian materi yang ingin dipelajari...">${esc(
        d.notes || ''
      )}</textarea></div>` +
      noteAttachSelect(d.noteId);
  } else {
    // event, extracurricular, reminder, or custom_*
    const d = current || {};
    content =
      formField(
        `Nama ${typeTitle.toLowerCase()} *`,
        'title',
        d.title || '',
        'text',
        `required maxlength="180" placeholder="Nama ${esc(typeTitle.toLowerCase())}"`
      ) +
      formField(
        'Keterangan / Mapel (opsional)',
        'subject',
        d.subject || '',
        'text',
        'maxlength="80" placeholder="Umum"'
      ) +
      `<div class="fieldrow">${formField(
        'Tanggal mulai *',
        'startDate',
        d.startDate || today,
        'date',
        'required'
      )}${formField(
        'Tanggal selesai (opsional)',
        'endDate',
        d.endDate || d.startDate || today,
        'date'
      )}</div>` +
      `<div class="fieldrow">${formField(
        'Jam mulai',
        'startTime',
        d.startTime || '',
        'time'
      )}${formField('Jam selesai', 'endTime', d.endTime || '', 'time')}</div>` +
      selectField(
        'Pengulangan',
        'repeat',
        [
          ['none', 'Tidak berulang'],
          ['weekly', 'Setiap minggu'],
          ['daily', 'Setiap hari'],
        ],
        d.repeat || (modalType === 'extracurricular' ? 'weekly' : 'none')
      ) +
      `<div class="field"><label for="f-notes">Catatan (opsional)</label><textarea name="notes" id="f-notes" placeholder="Rincian kegiatan...">${esc(
        d.notes || ''
      )}</textarea></div>` +
      noteAttachSelect(d.noteId);
  }

  gid('modal-fields').innerHTML = content;
  enhanceControls(gid('modal-fields'));
  renderAIReview();
}

export function modalOpen(type = 'task', record = null, initialDraft = null) {
  aiReviewWarnings = null;
  modalType = type;
  editing = record ? record.id : null;
  draftSubtasks = (record?.subtasks || []).map((s) => ({ ...s }));
  draftStages = (record?.stages || []).map((s) => ({ ...s }));
  modalDraft = initialDraft || null;
  gid('modal-wrap').classList.add('show');
  document.body.style.overflow = 'hidden';
  renderModal(record);
  if (window.matchMedia('(pointer:fine)').matches) {
    setTimeout(() => document.querySelector('#modal-fields [name="title"]')?.focus(), 40);
  }
}

export function modalClose() {
  aiReviewWarnings = null;
  gid('modal-wrap')?.classList.remove('show');
  document.body.style.overflow = '';
  editing = null;
  modalDraft = null;
}

export function setModalType(newType) {
  modalType = newType;
  draftSubtasks = [];
  draftStages = [];
  modalDraft = null;
  renderModal();
}

export function openRecord(id, kind) {
  if (kind === 'task') {
    const item = db.tasks.find((t) => t.id === id);
    if (item) modalOpen('task', item);
    return;
  }
  if (kind === 'competition') {
    const item = db.competitions.find((c) => c.id === id);
    if (item) modalOpen('competition', item);
    return;
  }
  if (kind === 'note') {
    const item = (db.notes || []).find((n) => n.id === id);
    if (item) modalOpen('note', item);
    return;
  }
  const item = db.activities.find((a) => a.id === id);
  if (item) modalOpen(item.type, item);
}

export function submitForm(form, onSaved) {
  commitDraftInputs();
  const f = new FormData(form);
  const title = String(f.get('title') || '').trim();
  if (!title) {
    toast('Isi judul atau nama kegiatan terlebih dahulu.');
    return;
  }
  const notes = String(f.get('notes') || '').trim();
  const noteId = String(f.get('noteId') || '');
  const wasEditing = Boolean(editing);

  if (modalType === 'task') {
    const prev = getEditing();
    const record = {
      id: editing || uid(),
      title,
      subject: String(f.get('subject') || '').trim(),
      due: String(f.get('due') || ''),
      notes,
      noteId,
      done: prev?.done || false,
      subtasks: draftSubtasks
        .filter((s) => s.title.trim())
        .map((s) => ({ id: s.id || uid(), title: s.title.trim(), done: Boolean(s.done) })),
      createdAt: prev?.createdAt || localToday(),
    };
    upsertItem('tasks', record);
  } else if (modalType === 'personal') {
    const prev = getEditing();
    const startDate = String(f.get('startDate') || '');
    const startTime = String(f.get('startTime') || '');
    const startMin = timeToMinutes(startTime);
    const endTime = startMin !== null ? minutesToTime(startMin + 60) : '';
    const record = {
      id: editing || uid(),
      type: 'personal',
      title,
      subject: String(f.get('subject') || '').trim(),
      startDate: parseISO(startDate) ? startDate : '',
      endDate: parseISO(startDate) ? startDate : '',
      startTime,
      endTime,
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      competitionId: '',
      notes,
      noteId,
      done: prev?.done || false,
      subtasks: draftSubtasks
        .filter((s) => s.title.trim())
        .map((s) => ({ id: s.id || uid(), title: s.title.trim(), done: Boolean(s.done) })),
    };
    upsertItem('activities', record);
  } else if (modalType === 'note') {
    const prev = getEditing();
    const body = String(f.get('body') || '').trim();
    const pinned = Boolean(form.querySelector('[name="pinned"]')?.checked);
    const record = {
      id: editing || uid(),
      title,
      body,
      subject: String(f.get('subject') || '').trim(),
      color: String(f.get('color') || ''),
      pinned,
      link: prev?.link || null,
      createdAt: prev?.createdAt || localToday(),
    };
    upsertItem('notes', record);
  } else if (modalType === 'competition') {
    const stages = [];
    for (const s of draftStages) {
      if (!s.title.trim() && !s.date) continue;
      if (!s.title.trim() || !parseISO(s.date)) {
        toast('Isi nama dan tanggal untuk setiap tahapan lomba.');
        return;
      }
      stages.push({
        id: s.id || uid(),
        title: s.title.trim(),
        date: s.date,
        time: '',
        done: Boolean(s.done),
      });
    }
    stages.sort((a, b) => a.date.localeCompare(b.date));
    const record = {
      id: editing || uid(),
      name: title,
      subject: String(f.get('subject') || '').trim(),
      mode: String(f.get('mode') || 'Individu'),
      location: String(f.get('location') || '').trim(),
      notes,
      noteId,
      stages,
    };
    upsertItem('competitions', record);
  } else if (modalType === 'exam') {
    const startDate = String(f.get('startDate') || '');
    if (!parseISO(startDate)) {
      toast('Periksa tanggal ulangan.');
      return;
    }
    const record = {
      id: editing || uid(),
      type: 'exam',
      title,
      subject: String(f.get('subject') || '').trim(),
      startDate,
      endDate: startDate,
      startTime: '',
      endTime: '',
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      competitionId: '',
      notes,
      noteId,
    };
    upsertItem('activities', record);
  } else if (modalType === 'holiday') {
    const startDate = String(f.get('startDate') || '');
    const endDate = String(f.get('endDate') || startDate) || startDate;
    if (!parseISO(startDate) || !parseISO(endDate) || endDate < startDate) {
      toast('Periksa rentang tanggal libur.');
      return;
    }
    const record = {
      id: editing || uid(),
      type: 'holiday',
      title,
      subject: String(f.get('subject') || '').trim() || 'Hari Libur',
      startDate,
      endDate,
      startTime: '',
      endTime: '',
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      competitionId: '',
      notes,
      noteId: '',
    };
    upsertItem('activities', record);
  } else {
    const startDate = String(f.get('startDate') || '');
    const endDate = String(f.get('endDate') || startDate) || startDate;
    if (!parseISO(startDate) || !parseISO(endDate)) {
      toast('Periksa tanggal kegiatan.');
      return;
    }
    if (endDate < startDate) {
      toast('Tanggal akhir tidak boleh mendahului tanggal mulai.');
      return;
    }
    const startTime = String(f.get('startTime') || '');
    const endTime = String(f.get('endTime') || '');
    if (startTime && endTime && endTime <= startTime) {
      toast('Jam selesai harus lebih besar daripada jam mulai.');
      return;
    }
    const repeat = String(f.get('repeat') || 'none');
    const record = {
      id: editing || uid(),
      type: modalType,
      title,
      subject: String(f.get('subject') || '').trim(),
      startDate,
      endDate,
      startTime,
      endTime,
      repeat,
      repeatDays: repeat === 'weekly' ? [parseISO(startDate).getDay()] : [],
      repeatUntil: '',
      competitionId: modalType === 'study' ? String(f.get('competitionId') || '') : '',
      notes,
      noteId,
    };
    upsertItem('activities', record);
  }

  modalClose();
  if (onSaved) onSaved();
  toast(wasEditing ? 'Perubahan tersimpan.' : 'Berhasil ditambahkan.');
}

export function showAIReview(result) {
  const type = result.type || 'task';
  const existingCompetition =
    type === 'competition'
      ? db.competitions.find(
          (c) =>
            c.name.toLocaleLowerCase('id') ===
            (result.competitionName || result.title || '').toLocaleLowerCase('id')
        )
      : null;

  modalOpen(type, existingCompetition || null);
  aiReviewWarnings = [...(result.warnings || [])];

  if (type === 'task') {
    modalDraft = {
      title: result.title,
      subject: result.subject,
      due: result.startDate,
      notes: result.notes,
    };
  } else if (type === 'personal') {
    modalDraft = {
      title: result.title,
      subject: result.subject,
      startDate: result.startDate || '',
      startTime: result.startTime || '',
      notes: result.notes || '',
    };
  } else if (type === 'note') {
    modalDraft = {
      title: result.title,
      subject: result.subject || '',
      body: result.notes || result.title || '',
      pinned: true,
    };
  } else if (type === 'competition') {
    const stage = result.stageName || '';
    modalDraft = {
      name: result.competitionName || result.title,
      subject: result.subject || existingCompetition?.subject || '',
      mode: existingCompetition?.mode || 'Individu',
      notes: result.notes || existingCompetition?.notes || '',
      location: existingCompetition?.location || '',
    };
    if (stage && result.startDate) {
      const duplicate = draftStages.some(
        (s) =>
          s.title.toLocaleLowerCase('id') === stage.toLocaleLowerCase('id') &&
          s.date === result.startDate
      );
      if (!duplicate)
        draftStages.push({ id: uid(), title: stage, date: result.startDate, time: '', done: false });
      else aiReviewWarnings.push('Tahap lomba sudah tercatat. Tidak menambahkan duplikat.');
    }
    if (stage && !result.startDate)
      aiReviewWarnings.push('Tanggal tahap ' + stage + ' belum jelas. Tambahkan melalui timeline.');
  } else if (type === 'exam') {
    modalDraft = {
      title: result.title,
      subject: result.subject,
      startDate: result.startDate || localToday(),
      endDate: result.startDate || localToday(),
      startTime: '',
      endTime: '',
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      notes: result.notes || '',
      competitionId: '',
    };
  } else {
    modalDraft = {
      title: result.title,
      subject: result.subject,
      startDate: result.startDate || localToday(),
      endDate: result.endDate || result.startDate || localToday(),
      startTime: result.startTime,
      endTime: result.endTime,
      repeat: result.repeat || 'none',
      repeatDays: [],
      repeatUntil: '',
      notes: result.notes || '',
      competitionId: '',
    };
  }
  renderModal();
  document.querySelector('#modal-fields [name="title"]')?.focus();
}

// ==========================================================
// Fase 4: Modal "Rencana Hari" (Susun satu hari sekaligus)
// ==========================================================
export function openDayPlanModal(dateStr = localToday()) {
  dayplanDate = parseISO(dateStr) ? dateStr : localToday();
  dayplanMode = 'rows';
  dayplanRepeatWeekly = false;

  // Pre-populate with existing study blocks on this day or 2 blank starter rows
  const existingStudy = db.activities
    .filter((a) => a.type === 'study' && a.startDate === dayplanDate)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  if (existingStudy.length) {
    dayplanRows = existingStudy.map((a) => ({
      id: a.id,
      startTime: a.startTime || '15:30',
      endTime: a.endTime || '16:30',
      title: a.title || '',
      subject: a.subject || '',
    }));
  } else {
    dayplanRows = [
      { id: null, startTime: '15:30', endTime: '16:30', title: '', subject: '' },
      { id: null, startTime: '19:00', endTime: '20:00', title: '', subject: '' },
    ];
  }
  dayplanRawText = dayplanRows
    .filter((r) => r.title)
    .map((r) => `${r.startTime}-${r.endTime} ${r.title}${r.subject ? ` [${r.subject}]` : ''}`)
    .join('\n');

  renderDayPlanModal();
  gid('dayplan-wrap').classList.add('show');
  document.body.style.overflow = 'hidden';
}

export function closeDayPlanModal() {
  gid('dayplan-wrap')?.classList.remove('show');
  document.body.style.overflow = '';
}

export function commitDayPlanDomToState() {
  const dateInput = gid('dayplan-date');
  if (dateInput && parseISO(dateInput.value)) dayplanDate = dateInput.value;
  const repInput = gid('dayplan-repeat-weekly');
  if (repInput) dayplanRepeatWeekly = repInput.checked;

  if (dayplanMode === 'rows') {
    document.querySelectorAll('.dayplan-row').forEach((rowEl) => {
      const idx = Number(rowEl.dataset.dpIdx);
      const r = dayplanRows[idx];
      if (!r) return;
      const st = rowEl.querySelector('[data-dp-start]');
      const et = rowEl.querySelector('[data-dp-end]');
      const ti = rowEl.querySelector('[data-dp-title]');
      const su = rowEl.querySelector('[data-dp-subj]');
      if (st) r.startTime = st.value;
      if (et) r.endTime = et.value;
      if (ti) r.title = ti.value;
      if (su) r.subject = su.value;
    });
  } else {
    const ta = gid('dayplan-textarea');
    if (ta) {
      dayplanRawText = ta.value;
      const parsed = parseDayPlanText(dayplanRawText);
      if (parsed.length) dayplanRows = parsed;
    }
  }
}

export function addDayPlanRow(prefill = null) {
  commitDayPlanDomToState();
  const last = dayplanRows[dayplanRows.length - 1];
  const lastEndMin = last ? timeToMinutes(last.endTime) : null;
  const startMin = lastEndMin !== null ? Math.min(1380, lastEndMin + 15) : 930; // +15m break or 15:30
  const endMin = Math.min(1439, startMin + 60);
  dayplanRows.push({
    id: null,
    startTime: prefill?.startTime || minutesToTime(startMin),
    endTime: prefill?.endTime || minutesToTime(endMin),
    title: prefill?.title || '',
    subject: prefill?.subject || '',
  });
  if (dayplanMode === 'text') {
    dayplanRawText = dayplanRows
      .map((r) => `${r.startTime}-${r.endTime} ${r.title}${r.subject ? ` [${r.subject}]` : ''}`)
      .join('\n');
  }
  renderDayPlanModal();
}

export function removeDayPlanRow(idx) {
  commitDayPlanDomToState();
  dayplanRows.splice(idx, 1);
  renderDayPlanModal();
}

export function switchDayPlanMode(nextMode) {
  commitDayPlanDomToState();
  if (nextMode === 'text' && dayplanMode === 'rows') {
    dayplanRawText = dayplanRows
      .filter((r) => r.title || r.startTime)
      .map(
        (r) =>
          `${r.startTime || '15:30'}-${r.endTime || '16:30'} ${r.title || 'Sesi belajar'}${
            r.subject ? ` [${r.subject}]` : ''
          }`
      )
      .join('\n');
  } else if (nextMode === 'rows' && dayplanMode === 'text') {
    const parsed = parseDayPlanText(dayplanRawText);
    if (parsed.length) dayplanRows = parsed;
  }
  dayplanMode = nextMode;
  renderDayPlanModal();
}

export function renderDayPlanModal() {
  const activeTasks = [
    ...db.tasks.filter((t) => !t.done).map((t) => ({ title: t.title, subject: t.subject || '' })),
    ...db.activities
      .filter((a) => a.type === 'personal' && !a.done)
      .map((a) => ({ title: a.title, subject: a.subject || '' })),
  ].slice(0, 8);

  const pickTasksHTML = activeTasks.length
    ? `<div class="dayplan-pick-box"><div class="tiny muted" style="margin-bottom:6px;font-weight:700">Ambil cepat dari tugas / agenda aktif (ketuk untuk tambah blok):</div><div class="dayplan-task-chips">${activeTasks
        .map(
          (t) =>
            `<button type="button" class="filterchip" data-dp-pick-task="${esc(
              t.title
            )}" data-dp-pick-subj="${esc(t.subject)}">${icon('plus', 'sm')} ${esc(t.title)}</button>`
        )
        .join('')}</div></div>`
    : '';

  const previewRows = dayplanMode === 'text' ? parseDayPlanText(dayplanRawText) : dayplanRows;
  const conflicts = detectTimeConflicts(previewRows);
  const conflictHTML = conflicts.length
    ? `<div class="ai-review" style="background:var(--terra-pale);color:var(--terra);border-color:var(--terra)"><strong>Perhatian: Ada jadwal yang bertabrakan</strong><ul>${conflicts
        .map((c) => `<li>${esc(c)}</li>`)
        .join('')}</ul></div>`
    : '';

  let editorHTML = '';
  if (dayplanMode === 'rows') {
    editorHTML = `<div class="dayplan-rows-list">${dayplanRows
      .map(
        (r, i) => `<div class="dayplan-row" data-dp-idx="${i}">
        <div class="dayplan-times">
          <input type="time" data-dp-start="${i}" value="${esc(r.startTime)}" aria-label="Jam mulai blok ${
          i + 1
        }">
          <span>–</span>
          <input type="time" data-dp-end="${i}" value="${esc(r.endTime)}" aria-label="Jam selesai blok ${
          i + 1
        }">
        </div>
        <div class="dayplan-inputs">
          <input type="text" data-dp-title="${i}" value="${esc(
          r.title
        )}" placeholder="Kegiatan belajar (mis. Latihan Kimia)" maxlength="140">
          <input type="text" data-dp-subj="${i}" value="${esc(
          r.subject
        )}" placeholder="Mapel (opsional)" maxlength="60">
        </div>
        <button type="button" class="iconbtn" data-dp-remove="${i}" title="Hapus baris">${icon(
          'close',
          'sm'
        )}</button>
      </div>`
      )
      .join('')}</div>
      <button type="button" class="add-inline" id="dayplan-add-row">${icon(
        'plus',
        'sm'
      )} Tambah blok jam berikutnya</button>`;
  } else {
    const previewList = previewRows.length
      ? `<div class="dayplan-preview"><div class="tiny muted" style="margin-bottom:6px;font-weight:700">Pratinjau (${
          previewRows.length
        } blok terdeteksi):</div>${previewRows
          .map(
            (p) =>
              `<div class="dayplan-prev-item"><b>${esc(p.startTime)}–${esc(
                p.endTime
              )}</b> <span>${esc(p.title)}</span> ${
                p.subject ? `<em class="note-subj">${esc(p.subject)}</em>` : ''
              }</div>`
          )
          .join('')}</div>`
      : `<div class="tiny muted" style="margin-top:6px">Tulis satu kegiatan per baris, contoh: <code>15.30-16.30 Kimia latihan soal [Kimia]</code></div>`;

    editorHTML = `<div class="field"><label for="dayplan-textarea">Ketik jadwal sekaligus (satu baris per blok jam)</label><textarea id="dayplan-textarea" rows="6" placeholder="15.30-16.30 Kimia latihan soal [Kimia]&#10;16.45-17.30 Rangkum Sejarah [Sejarah]&#10;19.00-20.30 Latihan OSN Matematika">${esc(
      dayplanRawText
    )}</textarea></div>${previewList}`;
  }

  gid('dayplan-body').innerHTML = `
    <div class="fieldrow" style="align-items:center;margin-bottom:10px">
      ${formField('Tanggal Rencana Hari', 'dayplanDate', dayplanDate, 'date')}
      <div class="field">
        <label>Mode penyusunan</label>
        <div class="segment-switch">
          <button type="button" class="seg-btn ${
            dayplanMode === 'rows' ? 'active' : ''
          }" data-dp-mode="rows">Baris Cepat</button>
          <button type="button" class="seg-btn ${
            dayplanMode === 'text' ? 'active' : ''
          }" data-dp-mode="text">Ketik Teks</button>
        </div>
      </div>
    </div>
    ${pickTasksHTML}
    <div id="dayplan-conflict-zone">${conflictHTML}</div>
    ${editorHTML}
    <label class="switchrow" style="margin-top:14px"><input type="checkbox" id="dayplan-repeat-weekly" ${
      dayplanRepeatWeekly ? 'checked' : ''
    }> Ulang jadwal ini setiap minggu pada hari yang sama</label>
  `;
  const dateEl = gid('f-dayplanDate');
  if (dateEl) dateEl.id = 'dayplan-date';
  enhanceControls(gid('dayplan-body'));
}

export function saveDayPlan(onSaved) {
  commitDayPlanDomToState();
  const rows = (dayplanMode === 'text' ? parseDayPlanText(dayplanRawText) : dayplanRows).filter(
    (r) => String(r.title || '').trim()
  );

  if (!rows.length) {
    toast('Isi minimal satu blok kegiatan belajar terlebih dahulu.');
    return;
  }

  for (const r of rows) {
    const s = timeToMinutes(r.startTime);
    const e = timeToMinutes(r.endTime);
    if (s === null || e === null || e <= s) {
      toast(`Periksa jam pada kegiatan "${r.title}" (jam selesai harus setelah jam mulai).`);
      return;
    }
  }

  // Remove old study blocks on this exact date that were replaced if editing
  const keptIds = new Set(rows.map((r) => r.id).filter(Boolean));
  const existingOnDay = db.activities.filter(
    (a) => a.type === 'study' && a.startDate === dayplanDate && a.repeat === 'none'
  );
  for (const old of existingOnDay) {
    if (!keptIds.has(old.id)) {
      removeItem('activities', old.id);
    }
  }

  const repeat = dayplanRepeatWeekly ? 'weekly' : 'none';
  const repeatDays = dayplanRepeatWeekly ? [parseISO(dayplanDate).getDay()] : [];

  for (const r of rows) {
    upsertItem('activities', {
      id: r.id || uid(),
      type: 'study',
      title: r.title.trim(),
      subject: (r.subject || '').trim(),
      startDate: dayplanDate,
      endDate: dayplanDate,
      startTime: r.startTime,
      endTime: r.endTime,
      repeat,
      repeatDays,
      repeatUntil: '',
      competitionId: '',
      notes: '',
      noteId: '',
    });
  }

  closeDayPlanModal();
  if (onSaved) onSaved(dayplanDate);
  toast(`${rows.length} blok belajar disimpan untuk ${fmt(dayplanDate)}.`);
}

// ==========================================================
// Fase 3: Modal Pengaturan Tipe Kalender (warna, nama, tampil, tipe kustom)
// ==========================================================
export function openTypeSettingsModal() {
  renderTypeSettingsModal();
  gid('type-settings-wrap').classList.add('show');
  document.body.style.overflow = 'hidden';
}

export function closeTypeSettingsModal() {
  gid('type-settings-wrap')?.classList.remove('show');
  document.body.style.overflow = '';
}

export function renderTypeSettingsModal() {
  const types = getTypesMap();
  const rows = Object.entries(types)
    .map(([key, cfg]) => {
      const paletteDots = TYPE_PALETTE.map(
        (p) =>
          `<button type="button" class="color-swatch ${
            cfg.color === p.hex ? 'active' : ''
          }" style="background:${p.hex}" data-type-color="${esc(key)}" data-hex="${
            p.hex
          }" title="${esc(p.name)}" aria-label="${esc(p.name)}"></button>`
      ).join('');

      return `<div class="type-cfg-row" data-type-key="${esc(key)}">
        <div class="type-cfg-main">
          <input type="checkbox" data-type-vis="${esc(key)}" ${
        cfg.visible !== false ? 'checked' : ''
      } title="Tampilkan di kalender">
          <input type="text" class="type-cfg-label" data-type-label="${esc(key)}" value="${esc(
        cfg.label
      )}" maxlength="40">
          ${
            !DEFAULT_TYPES[key]
              ? `<button type="button" class="iconbtn destructive" data-type-del="${esc(
                  key
                )}" title="Hapus tipe kustom">${icon('close', 'sm')}</button>`
              : ''
          }
        </div>
        <div class="type-cfg-swatches">${paletteDots}</div>
      </div>`;
    })
    .join('');

  gid('type-settings-body').innerHTML = `
    <div class="tiny muted" style="margin-bottom:10px">Ubah nama, warna chip kalender, atau sembunyikan tipe tertentu. Kamu juga bisa menambahkan tipe kustom baru.</div>
    <div class="type-cfg-list">${rows}</div>
    <div class="divider"></div>
    <div class="field">
      <label for="new-custom-type">Tambah tipe kalender kustom</label>
      <div style="display:flex;gap:8px">
        <input type="text" id="new-custom-type" placeholder="Misalnya: Les Privat / Organisasi" maxlength="40">
        <button type="button" class="secondary" id="btn-add-custom-type">${icon('plus', 'sm')} Tambah</button>
      </div>
    </div>
  `;
}

// ==========================================================
// Fase 5: Modal Pengaturan AI (Gemini + OpenRouter)
// ==========================================================
let aiModalProvider = 'gemini';

export function showAISettings() {
  const cfg = AI.getConfig();
  aiModalProvider = cfg.provider || 'gemini';
  renderAISettingsModal(cfg);
  gid('ai-settings-wrap').classList.add('show');
  document.body.style.overflow = 'hidden';
}

export function closeAISettings() {
  gid('ai-settings-wrap')?.classList.remove('show');
  document.body.style.overflow = '';
}

export function renderAISettingsModal(cfgOverride = null) {
  const cfg = cfgOverride || AI.getConfig();
  const isOR = aiModalProvider === 'openrouter';
  const orModels = AI.getOpenRouterModels();

  const modelOptions = isOR
    ? orModels.map((m) => [
        m.id,
        m.name,
        [m.ctx ? `${m.ctx} ctx` : '', m.sunset || ''].filter(Boolean).join(' · '),
      ])
    : AI.GEMINI_MODELS.map((m) => [m.id, m.name, m.ctx ? `${m.ctx} ctx` : '']);

  const selectedModel = isOR ? cfg.openrouterModel : cfg.geminiModel;

  gid('ai-settings-body').innerHTML = `
    <div class="segment-switch" style="margin-bottom:14px">
      <button type="button" class="seg-btn ${
        !isOR ? 'active' : ''
      }" data-ai-provider="gemini">Google Gemini</button>
      <button type="button" class="seg-btn ${
        isOR ? 'active' : ''
      }" data-ai-provider="openrouter">OpenRouter (Free Models)</button>
    </div>

    <div class="field">
      <label for="ai-api-key">${isOR ? 'OpenRouter API Key' : 'Gemini API Key'}</label>
      <input id="ai-api-key" name="apiKey" type="password" value="${esc(
        isOR ? cfg.openrouterKey : cfg.geminiKey
      )}" placeholder="${
    isOR ? 'Tempel key sk-or-v1-... dari OpenRouter' : 'Tempel API key dari Google AI Studio'
  }" autocomplete="off" autocapitalize="off" spellcheck="false">
      <small>Kunci hanya disimpan di perangkat ini (tidak ikut disinkronkan ke cloud atau cadangan JSON).</small>
    </div>

    <div class="field">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <label for="ai-model">Model ${isOR ? 'OpenRouter' : 'Gemini'}</label>
        ${
          isOR
            ? `<button type="button" class="text-link" id="ai-refresh-models" style="padding:0;font-size:11.5px">${icon(
                'repeat',
                'sm'
              )} Segarkan daftar</button>`
            : ''
        }
      </div>
      <select id="ai-model" name="model" data-searchable="1">
        ${modelOptions
          .map(
            ([val, label, sub]) =>
              `<option value="${esc(val)}" ${sub ? `data-sub="${esc(sub)}"` : ''} ${
                val === selectedModel ? 'selected' : ''
              }>${esc(label)}</option>`
          )
          .join('')}
      </select>
    </div>

    ${
      isOR
        ? `<div class="field">
            <label for="ai-custom-model">ID Model Kustom (opsional)</label>
            <input id="ai-custom-model" type="text" value="${esc(
              cfg.customOpenrouterModel || ''
            )}" placeholder="Misal: nvidia/nemotron-3-ultra-550b-a55b:free" autocomplete="off" spellcheck="false">
            <small>Jika diisi, ID model kustom ini akan dipakai menggantikan pilihan dropdown di atas.</small>
          </div>`
        : ''
    }

    <label class="switchrow">
      <input type="checkbox" id="ai-persist" ${cfg.persist ? 'checked' : ''}> Ingat API key di perangkat ini
    </label>

    <div class="ai-note ai-settings-help">
      ${
        isOR
          ? `Gunakan berbagai model AI gratis di OpenRouter. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">Buat key gratis di openrouter.ai/keys</a>.`
          : `Tanpa centang, key hanya tersimpan selama sesi browser. <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Dapatkan API key di Google AI Studio</a>.`
      }
    </div>
    <p id="gemini-settings-feedback" class="ai-note" role="status"></p>
  `;

  enhanceControls(gid('ai-settings-body'));
}

export function switchAIModalProvider(nextProvider) {
  const curCfg = AI.getConfig();
  const keyInput = gid('ai-api-key');
  const modelSelect = gid('ai-model');
  const customInput = gid('ai-custom-model');
  const persistInput = gid('ai-persist');

  if (keyInput) {
    if (aiModalProvider === 'openrouter') curCfg.openrouterKey = keyInput.value.trim();
    else curCfg.geminiKey = keyInput.value.trim();
  }
  if (modelSelect) {
    if (aiModalProvider === 'openrouter') curCfg.openrouterModel = modelSelect.value;
    else curCfg.geminiModel = modelSelect.value;
  }
  if (customInput && aiModalProvider === 'openrouter') {
    curCfg.customOpenrouterModel = customInput.value.trim();
  }
  if (persistInput) curCfg.persist = persistInput.checked;

  aiModalProvider = nextProvider === 'openrouter' ? 'openrouter' : 'gemini';
  curCfg.provider = aiModalProvider;
  renderAISettingsModal(curCfg);
}

export function saveAISettingsFromModal(onSaved) {
  const curCfg = AI.getConfig();
  const keyVal = gid('ai-api-key')?.value.trim() || '';
  const modelVal = gid('ai-model')?.value || '';
  const customVal = gid('ai-custom-model')?.value.trim() || '';
  const persist = Boolean(gid('ai-persist')?.checked);

  if (aiModalProvider === 'openrouter') {
    curCfg.openrouterKey = keyVal;
    curCfg.openrouterModel = modelVal;
    curCfg.customOpenrouterModel = customVal;
  } else {
    curCfg.geminiKey = keyVal;
    curCfg.geminiModel = modelVal;
  }
  curCfg.provider = aiModalProvider;
  curCfg.persist = persist;

  AI.setConfig(curCfg);
  closeAISettings();
  if (onSaved) onSaved();
  toast(
    AI.hasKey()
      ? `${AI.getProviderName()} AI siap dipakai.`
      : `Pengaturan ${AI.getProviderName()} disimpan.`
  );
}

export function getActiveAIModalValues() {
  const key = gid('ai-api-key')?.value.trim() || '';
  const model =
    aiModalProvider === 'openrouter'
      ? gid('ai-custom-model')?.value.trim() || gid('ai-model')?.value
      : gid('ai-model')?.value;
  return { provider: aiModalProvider, key, model };
}

