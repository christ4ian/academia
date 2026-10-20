// src/store.js — State, DEFAULT_TYPES, migration v3 -> v4, CRUD, and sync hooks

import { uid, localToday, addDays, parseISO, occurrences } from './dates.js';

export const STORAGE = 'academia-clean-v03';

// Palet 8 warna untuk tipe kalender & catatan (Fase 3)
export const TYPE_PALETTE = [
  { id: 'blue', hex: '#3b648c', name: 'Biru' },
  { id: 'amber', hex: '#c2781b', name: 'Kuning Tua' },
  { id: 'green', hex: '#2e7d5a', name: 'Hijau' },
  { id: 'purple', hex: '#6b528a', name: 'Ungu' },
  { id: 'rose', hex: '#a8566d', name: 'Merah Muda' },
  { id: 'red', hex: '#c03c4f', name: 'Merah' },
  { id: 'terra', hex: '#c86745', name: 'Terakota' },
  { id: 'teal', hex: '#1d7a74', name: 'Toska' },
];

export const NOTE_COLORS = [
  { id: '', label: 'Standar', bg: '#ffffff' },
  { id: 'sage', label: 'Hijau Lembut', bg: '#eaf2ed' },
  { id: 'warm', label: 'Krem Hangat', bg: '#faece6' },
  { id: 'amber', label: 'Kuning Muda', bg: '#fdf4e3' },
  { id: 'lavender', label: 'Ungu Muda', bg: '#f0eaf7' },
  { id: 'sky', label: 'Biru Muda', bg: '#eaf1f8' },
];

export const DEFAULT_TYPES = {
  holiday: { label: 'Libur', color: '#c03c4f', visible: true, builtin: true },
  exam: { label: 'Ulangan', color: '#c2781b', visible: true, builtin: true },
  task: { label: 'Tugas', color: '#3b648c', visible: true, builtin: true },
  study: { label: 'Belajar', color: '#2e7d5a', visible: true, builtin: true },
  personal: { label: 'Agenda pribadi', color: '#1d7a74', visible: true, builtin: true },
  event: { label: 'Acara sekolah', color: '#a8566d', visible: true, builtin: true },
  extracurricular: { label: 'Ekskul', color: '#c86745', visible: true, builtin: true },
  reminder: { label: 'Pengingat', color: '#6b528a', visible: true, builtin: true },
  competition: { label: 'Lomba', color: '#6b528a', visible: true, builtin: true },
};

export function cloneDefaultTypes() {
  return JSON.parse(JSON.stringify(DEFAULT_TYPES));
}

export function migrateDB(raw) {
  const now = localToday();
  const ts = Date.now();
  const base = raw && typeof raw === 'object' ? raw : {};

  const mergedTypes = cloneDefaultTypes();
  if (base.settings && base.settings.types && typeof base.settings.types === 'object') {
    for (const [k, v] of Object.entries(base.settings.types)) {
      if (v && typeof v === 'object' && typeof v.label === 'string') {
        mergedTypes[k] = {
          label: v.label.trim() || mergedTypes[k]?.label || k,
          color: v.color || mergedTypes[k]?.color || '#3b648c',
          visible: v.visible !== false,
          builtin: Boolean(DEFAULT_TYPES[k]),
        };
      }
    }
  }

  const tasks = Array.isArray(base.tasks)
    ? base.tasks
        .filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string' && !x.deleted)
        .map((x) => ({
          id: x.id,
          title: x.title,
          subject: x.subject || '',
          due: x.due || '',
          notes: x.notes || '',
          noteId: x.noteId || '',
          done: Boolean(x.done),
          subtasks: Array.isArray(x.subtasks) ? x.subtasks : [],
          createdAt: x.createdAt || now,
          updatedAt: Number(x.updatedAt) || ts,
        }))
    : [];

  const activities = Array.isArray(base.activities)
    ? base.activities
        .filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string' && !x.deleted)
        .map((x) => ({
          id: x.id,
          type: x.type || 'event',
          title: x.title,
          subject: x.subject || '',
          startDate: x.startDate || '',
          endDate: x.endDate || x.startDate || '',
          startTime: x.startTime || '',
          endTime: x.endTime || '',
          repeat: x.repeat || 'none',
          repeatDays: Array.isArray(x.repeatDays) ? x.repeatDays : [],
          repeatUntil: x.repeatUntil || '',
          competitionId: x.competitionId || '',
          notes: x.notes || '',
          noteId: x.noteId || '',
          done: Boolean(x.done),
          subtasks: Array.isArray(x.subtasks) ? x.subtasks : [],
          updatedAt: Number(x.updatedAt) || ts,
        }))
    : [];

  const competitions = Array.isArray(base.competitions)
    ? base.competitions
        .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && !x.deleted)
        .map((x) => ({
          id: x.id,
          name: x.name,
          subject: x.subject || '',
          mode: x.mode || 'Individu',
          location: x.location || '',
          notes: x.notes || '',
          noteId: x.noteId || '',
          stages: Array.isArray(x.stages) ? x.stages : [],
          updatedAt: Number(x.updatedAt) || ts,
        }))
    : [];

  const notes = Array.isArray(base.notes)
    ? base.notes
        .filter((x) => x && typeof x.id === 'string' && !x.deleted)
        .map((x) => ({
          id: x.id,
          title: String(x.title || '').trim() || 'Catatan',
          body: String(x.body || ''),
          pinned: Boolean(x.pinned),
          color: String(x.color || ''),
          subject: String(x.subject || ''),
          link: x.link && typeof x.link === 'object' ? { kind: x.link.kind, id: x.link.id } : null,
          createdAt: x.createdAt || now,
          updatedAt: Number(x.updatedAt) || ts,
        }))
    : [];

  return {
    version: 4,
    settings: {
      ...(base.settings || {}),
      types: mergedTypes,
      updatedAt: Number(base.settings?.updatedAt) || ts,
    },
    tasks,
    activities,
    competitions,
    notes,
  };
}

export const example = () => {
  const now = localToday();
  const ts = Date.now();
  return migrateDB({
    version: 4,
    settings: { types: cloneDefaultTypes(), updatedAt: ts },
    tasks: [
      {
        id: uid(),
        title: 'Print materi Geografi',
        subject: 'Geografi',
        due: addDays(now, 1),
        notes: 'Siapkan file sebelum berangkat sekolah.',
        done: false,
        subtasks: [],
        createdAt: now,
        updatedAt: ts,
      },
      {
        id: uid(),
        title: 'Latihan soal Kimia',
        subject: 'Kimia',
        due: addDays(now, 3),
        notes: 'Latihan mandiri bab kesetimbangan',
        done: false,
        subtasks: [],
        createdAt: now,
        updatedAt: ts,
      },
      {
        id: uid(),
        title: 'Latihan Trigonometri',
        subject: 'Olimpiade Matematika',
        due: addDays(now, 5),
        notes: 'Bisa pecah menjadi beberapa bagian kalau perlu.',
        done: false,
        subtasks: [
          { id: uid(), title: 'Identitas trigonometri', done: false },
          { id: uid(), title: 'Soal latihan', done: false },
        ],
        createdAt: now,
        updatedAt: ts,
      },
    ],
    activities: [
      {
        id: uid(),
        type: 'exam',
        title: 'UH Biologi',
        subject: 'Biologi',
        startDate: addDays(now, 4),
        endDate: addDays(now, 4),
        startTime: '08:00',
        endTime: '09:00',
        repeat: 'none',
        repeatDays: [],
        repeatUntil: '',
        notes: 'Bab struktur & fungsi sel.',
        competitionId: '',
        updatedAt: ts,
      },
      {
        id: uid(),
        type: 'study',
        title: 'Merangkum Sejarah',
        subject: 'Sejarah',
        startDate: now,
        endDate: now,
        startTime: '19:00',
        endTime: '20:30',
        repeat: 'none',
        repeatDays: [],
        repeatUntil: '',
        notes: 'Fokus masa pergerakan nasional.',
        competitionId: '',
        updatedAt: ts,
      },
      {
        id: uid(),
        type: 'personal',
        title: 'Bikin rangkuman Fisika Dinamika',
        subject: 'Fisika',
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
        repeat: 'none',
        repeatDays: [],
        repeatUntil: '',
        notes: 'Ringkas rumus hukum Newton & gaya gesek.',
        done: false,
        subtasks: [
          { id: uid(), title: 'Hukum I, II, III Newton', done: true },
          { id: uid(), title: 'Bidang miring & katrol', done: false },
        ],
        competitionId: '',
        updatedAt: ts,
      },
    ],
    competitions: [
      {
        id: uid(),
        name: 'PHI Mathematics',
        subject: 'Matematika',
        mode: 'Individu',
        location: 'Online',
        notes: 'Contoh lomba, kamu bisa mengubah atau menghapusnya.',
        stages: [
          { id: uid(), title: 'Penyisihan', date: addDays(now, -6), time: '09:00', done: true },
          { id: uid(), title: 'Semifinal', date: addDays(now, 3), time: '09:00', done: false },
          { id: uid(), title: 'Final', date: addDays(now, 14), time: '09:00', done: false },
        ],
        updatedAt: ts,
      },
    ],
    notes: [
      {
        id: uid(),
        title: 'Rumus Cepat Stoikiometri',
        body: 'n = gr / Mr = M × V = V_stp / 22,4. Ingat setarakan koefisien reaksi sebelum membandingkan mol!',
        pinned: true,
        color: 'sage',
        subject: 'Kimia',
        link: null,
        createdAt: now,
        updatedAt: ts,
      },
    ],
  });
};

export function load() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE) : null;
    if (raw) {
      const d = JSON.parse(raw);
      if (d && (Array.isArray(d.tasks) || Array.isArray(d.activities))) {
        return migrateDB(d);
      }
    }
  } catch (e) {}
  return example();
}

export let db = load();

let syncAdapter = null;
let onChangeCallback = null;

export function registerSyncAdapter(adapter) {
  syncAdapter = adapter;
}

export function registerOnChange(cb) {
  onChangeCallback = cb;
}

export function setDB(newDb, { skipSync = false } = {}) {
  db = migrateDB(newDb);
  save({ skipSync: true });
  if (!skipSync && syncAdapter) {
    syncAdapter.pushAll(db);
  }
  if (onChangeCallback) onChangeCallback();
}

export function save({ skipSync = false } = {}) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE, JSON.stringify(db));
    }
  } catch (e) {
    if (typeof window !== 'undefined' && window.__academiaToast) {
      window.__academiaToast('Penyimpanan browser penuh atau tidak tersedia. Ekspor cadangan.');
    }
  }
}

// CRUD helpers that automatically stamp updatedAt and notify sync
export function upsertItem(collection, item) {
  const stamped = { ...item, updatedAt: Date.now() };
  const list = db[collection] || [];
  const exists = list.some((x) => x.id === stamped.id);
  db[collection] = exists
    ? list.map((x) => (x.id === stamped.id ? stamped : x))
    : [stamped, ...list];
  save();
  if (syncAdapter) syncAdapter.pushItem(collection, stamped);
  return stamped;
}

export function removeItem(collection, id) {
  db[collection] = (db[collection] || []).filter((x) => x.id !== id);
  if (collection === 'competitions') {
    db.activities = db.activities.map((a) =>
      a.competitionId === id ? { ...a, competitionId: '', updatedAt: Date.now() } : a
    );
  }
  save();
  if (syncAdapter) syncAdapter.deleteItem(collection, id);
}

export function saveSettings(newSettings) {
  db.settings = {
    ...db.settings,
    ...newSettings,
    updatedAt: Date.now(),
  };
  save();
  if (syncAdapter) syncAdapter.pushSettings(db.settings);
}

export function getTypesMap() {
  if (!db.settings || !db.settings.types) {
    db.settings = { ...(db.settings || {}), types: cloneDefaultTypes() };
  }
  return db.settings.types;
}

export function getTypeLabel(key) {
  const types = getTypesMap();
  return types[key]?.label || DEFAULT_TYPES[key]?.label || 'Acara';
}

export function getTypeColor(key) {
  const types = getTypesMap();
  return types[key]?.color || DEFAULT_TYPES[key]?.color || '#3b648c';
}

export function isTypeVisible(key) {
  const types = getTypesMap();
  if (types[key] === undefined) return true;
  return types[key].visible !== false;
}

export function getLinkedNote(item) {
  if (!item?.noteId) return null;
  return (db.notes || []).find((n) => n.id === item.noteId) || null;
}

export function allEvents(start, end) {
  const result = [];
  for (const t of db.tasks) {
    if (t.due && t.due >= start && t.due <= end) {
      const linked = getLinkedNote(t);
      result.push({
        id: t.id,
        kind: 'task',
        date: t.due,
        startDate: t.due,
        endDate: t.due,
        title: t.title,
        subtitle: t.subject || getTypeLabel('task'),
        notes: t.notes || linked?.body || '',
        noteId: t.noteId || '',
        time: '',
        endTime: '',
        done: t.done,
      });
    }
  }
  for (const a of db.activities) {
    if (!a.startDate) continue;
    for (const occ of occurrences(a, start, end)) {
      const linked = getLinkedNote(a);
      result.push({
        id: a.id,
        kind: a.type,
        date: occ.date,
        startDate: a.startDate,
        endDate: a.endDate || a.startDate,
        title: a.title,
        subtitle: a.subject || getTypeLabel(a.type),
        notes: a.notes || linked?.body || '',
        noteId: a.noteId || '',
        time: a.startTime || '',
        endTime: a.endTime || '',
        done: Boolean(a.done),
      });
    }
  }
  for (const c of db.competitions) {
    const linked = getLinkedNote(c);
    for (const s of c.stages || []) {
      if (s.date && s.date >= start && s.date <= end) {
        result.push({
          id: c.id,
          stageId: s.id,
          kind: 'competition',
          date: s.date,
          startDate: s.date,
          endDate: s.date,
          title: s.title + ' · ' + c.name,
          subtitle: c.subject || getTypeLabel('competition'),
          notes: c.notes || linked?.body || '',
          noteId: c.noteId || '',
          time: s.time || '',
          endTime: '',
          done: s.done,
        });
      }
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time || '99:99').localeCompare(b.time || '99:99') ||
      a.title.localeCompare(b.title)
  );
}

export function filteredEvents(start, end) {
  return allEvents(start, end).filter((e) => isTypeVisible(e.kind));
}

