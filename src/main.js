// src/main.js — Application bootstrap, navigation, event delegation, QuickAdd, JSON export/import, and Auth/Sync lifecycle

import { icon, esc } from './ui/icons.js';
import {
  uid,
  localToday,
  fmt,
  pad,
  minutesToTime,
  quickParse,
  parseDayPlanText,
  detectTimeConflicts,
} from './dates.js';
import {
  db,
  setDB,
  example,
  upsertItem,
  removeItem,
  saveSettings,
  getTypesMap,
   getTypeLabel,
  cloneDefaultTypes,
  migrateDB,
} from './store.js';
import { toast, askConfirm, initPickerAndConfirm, gid } from './ui/picker.js';
import { renderHome } from './ui/home.js';
import {
  renderTasks,
  setTaskSegment,
  setTaskFilter,
  setTaskQuery,
  taskSegment,
} from './ui/tasks.js';
import {
  renderCalendar,
  calendarMode,
  setCalendarMode,
  picked,
  setPickedDate,
  shiftMonth,
  shiftPickedDay,
} from './ui/calendar.js';
import {
  renderNotes,
  setNoteQuery,
  setNoteSubjectFilter,
} from './ui/notes.js';
import {
  editing,
  modalType,
  draftSubtasks,
  draftStages,
  modalOpen,
  modalClose,
  setModalType,
  renderModal,
  captureDraftForm,
  commitDraftInputs,
  openRecord,
  submitForm,
  showAIReview,
  openDayPlanModal,
  closeDayPlanModal,
  addDayPlanRow,
  removeDayPlanRow,
  switchDayPlanMode,
  saveDayPlan,
  commitDayPlanDomToState,
  openTypeSettingsModal,
  closeTypeSettingsModal,
  renderTypeSettingsModal,
  showAISettings,
  closeAISettings,
  switchAIModalProvider,
  saveAISettingsFromModal,
  getActiveAIModalValues,
  renderAISettingsModal,
} from './ui/modals.js';
import { AI } from './ai/index.js';
import { initAuth, onAuthChange, logoutUser } from './auth.js';
import { startSyncForUser, stopSync, registerSyncCallbacks } from './sync.js';
import { renderLoginGate, initLoginEvents, renderUserMenuHeader } from './ui/login.js';

const navs = [
  ['home', 'Home', 'home'],
  ['tasks', 'Tasks', 'tasks'],
  ['calendar', 'Calendar', 'calendar'],
  ['notes', 'Notes', 'notes'],
];

let view = 'home';
let quickBusy = false;
let lastPickTap = { date: '', time: 0 };

function go(next) {
  if (!navs.some((n) => n[0] === next)) next = 'home';
  view = next;
  location.hash = next;
  gid('settings-menu')?.classList.remove('show');
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderNav() {
  const links = navs
    .map(
      ([key, name, ic]) =>
        `<a href="#${key}" data-view="${key}" class="${view === key ? 'active' : ''}" ${
          view === key ? 'aria-current="page"' : ''
        }>${icon(ic)}<span>${name}</span></a>`
    )
    .join('');
  gid('desktop-nav').innerHTML = links;
  gid('mobile-nav').innerHTML = links;
  gid('breadcrumb').textContent = 'Workspace / ' + (navs.find((n) => n[0] === view)?.[1] || 'Home');
}

export function render() {
  renderNav();
  for (const [key] of navs) {
    gid(key)?.classList.toggle('active', key === view);
  }
  gid('today-label').textContent = fmt(localToday(), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (view === 'home') renderHome();
  if (view === 'tasks') renderTasks();
  if (view === 'calendar') renderCalendar();
  if (view === 'notes') renderNotes();
}

function quickSave(input) {
  const p = quickParse(input);
  if (!p.title) return;

  if (p.type === 'note') {
    upsertItem('notes', {
      id: uid(),
      title: p.title,
      body: p.notes || p.title,
      subject: '',
      color: 'sage',
      pinned: true,
      link: null,
      createdAt: localToday(),
    });
    render();
    toast('Catatan cepat disimpan dan disematkan.');
    return;
  }

  if (p.type === 'task') {
    upsertItem('tasks', {
      id: uid(),
      title: p.title,
      subject: '',
      due: p.startDate || '',
      notes: '',
      noteId: '',
      done: false,
      subtasks: [],
      createdAt: localToday(),
    });
  } else if (p.type === 'personal') {
    upsertItem('activities', {
      id: uid(),
      type: 'personal',
      title: p.title,
      subject: '',
      startDate: p.startDate || '',
      endDate: p.startDate || '',
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      notes: '',
      noteId: '',
      done: false,
      subtasks: [],
      competitionId: '',
    });
  } else if (p.type === 'competition') {
    const label = /\b(final|semifinal|penyisihan)\b/i.exec(p.title)?.[1] || 'Babak';
    const name =
      p.title.replace(/^(babak\s+)?(final|semifinal|penyisihan)\s*/i, '').trim() || p.title;
    const found = db.competitions.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const stage = p.startDate
      ? { id: uid(), title: label[0].toUpperCase() + label.slice(1), date: p.startDate, time: '', done: false }
      : null;
    if (found && stage) {
      upsertItem('competitions', { ...found, stages: [...(found.stages || []), stage] });
    } else if (!found) {
      upsertItem('competitions', {
        id: uid(),
        name,
        subject: '',
        mode: 'Individu',
        location: '',
        notes: stage ? '' : 'Tambahkan tanggal tahap ' + label + '.',
        noteId: '',
        stages: stage ? [stage] : [],
      });
    }
  } else if (p.type === 'exam') {
    if (!p.startDate) {
      modalOpen('exam', null, { title: p.title });
      toast('Tambahkan tanggal ulangan.');
      return;
    }
    upsertItem('activities', {
      id: uid(),
      type: 'exam',
      title: p.title,
      subject: '',
      startDate: p.startDate,
      endDate: p.startDate,
      startTime: '',
      endTime: '',
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      notes: '',
      noteId: '',
      competitionId: '',
    });
  } else {
    if (!p.startDate) {
      modalOpen(p.type, null, { title: p.title, startTime: p.startTime, endTime: p.endTime });
      toast('Tambahkan tanggal agar jadwal bisa disimpan.');
      return;
    }
    upsertItem('activities', {
      id: uid(),
      type: p.type,
      title: p.title,
      subject: '',
      startDate: p.startDate,
      endDate: p.endDate || p.startDate,
      startTime: p.startTime,
      endTime: p.endTime,
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
      notes: '',
      noteId: '',
      competitionId: '',
    });
  }

  render();
  toast('Ditambahkan. Ketuk aktivitas untuk mengubah detailnya.');
}

async function handleQuickAdd() {
  const input = gid('quick-input');
  const text = input?.value.trim();
  if (!text || quickBusy) return;

  // Immediate local note prefix handling if starts with "catatan:"
  if (/^catatan\s*:/i.test(text) && !AI.hasKey()) {
    quickSave(text);
    input.value = '';
    return;
  }

  if (!AI.hasKey()) {
    quickSave(text);
    input.value = '';
    return;
  }

  quickBusy = true;
  const btn = document.querySelector('#quick-form button[type=submit]');
  const feedback = gid('quick-feedback');
  const provName = AI.getProviderName();
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = `${provName} sedang memahami kegiatan...`;
  }
  try {
    const result = await AI.parse(text);
    input.value = '';
    showAIReview(result);
    if (feedback) feedback.textContent = 'Hasil siap. Periksa formulir sebelum menyimpan.';
  } catch (err) {
    if (feedback) {
      feedback.classList.add('error');
      feedback.textContent = err.message || `${provName} gagal memproses input.`;
    }
    toast(`${provName} gagal: ${err.message || 'Periksa pengaturan AI.'}`);
  } finally {
    quickBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
}

async function exportJSON() {
  const fileName = `academia-backup-${localToday()}.json`;
  const jsonStr = JSON.stringify(db, null, 2);
  const Cap = window.Capacitor;
  const isNative = Boolean(
    Cap &&
      (typeof Cap.isNativePlatform === 'function'
        ? Cap.isNativePlatform()
        : Cap.getPlatform && Cap.getPlatform() !== 'web')
  );
  const FS = Cap?.Plugins?.Filesystem;
  const SH = Cap?.Plugins?.Share;

  if (FS && SH) {
    try {
      const res = await FS.writeFile({
        path: fileName,
        data: jsonStr,
        directory: 'CACHE',
        encoding: 'utf8',
      });
      try {
        await FS.writeFile({
          path: fileName,
          data: jsonStr,
          directory: 'DOCUMENTS',
          encoding: 'utf8',
        });
      } catch (_) {}
      await SH.share({
        title: fileName,
        text: `Cadangan data Academia (${localToday()})`,
        url: res.uri,
        dialogTitle: 'Simpan atau Bagikan Cadangan JSON',
      });
      toast('Cadangan JSON siap.');
      return;
    } catch (err) {
      if (err && String(err).toLowerCase().includes('cancel')) return;
      console.warn('Capacitor native share error:', err);
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined'
  ) {
    try {
      const file = new File([jsonStr], fileName, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: `Cadangan data Academia (${localToday()})`,
        });
        toast('Cadangan JSON siap.');
        return;
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || String(err).toLowerCase().includes('cancel')))
        return;
    }
  }

  try {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Cadangan JSON siap diunduh.');
  } catch (err) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(jsonStr);
      toast('Data cadangan disalin ke papan klip.');
    }
  }
}

function importJSON(file) {
  if (file.size > 3e6) {
    toast('File terlalu besar.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || (!Array.isArray(d.tasks) && !Array.isArray(d.activities))) throw Error('format');
      if (
        !(await askConfirm(
          'Impor ini akan mengganti semua data Academia di perangkat & akun ini. Lanjutkan?',
          { title: 'Impor cadangan', ok: 'Impor', danger: true }
        ))
      )
        return;
      setDB(migrateDB(d));
      render();
      toast('Data berhasil diimpor.');
    } catch (err) {
      toast('Format cadangan tidak valid.');
    }
  };
  reader.readAsText(file);
}

function onClick(e) {
  const closest = (selector) => e.target.closest(selector);

  const nav = closest('[data-view]');
  if (nav) {
    e.preventDefault();
    go(nav.dataset.view);
    return;
  }

  // Task & Personal Agenda controls
  const seg = closest('[data-task-segment]');
  if (seg) {
    setTaskSegment(seg.dataset.taskSegment);
    renderTasks();
    return;
  }
  const filter = closest('[data-task-filter]');
  if (filter) {
    setTaskFilter(filter.dataset.taskFilter);
    renderTasks();
    return;
  }
  const toggleSub = closest('[data-toggle-subtask]');
  if (toggleSub) {
    const t = db.tasks.find((x) => x.id === toggleSub.dataset.toggleSubtask);
    const idx = Number(toggleSub.dataset.subtaskIndex);
    if (t && t.subtasks && t.subtasks[idx] !== undefined) {
      t.subtasks[idx].done = !t.subtasks[idx].done;
      if (t.subtasks.every((s) => s.done)) t.done = true;
      upsertItem('tasks', t);
      render();
      toast(t.subtasks[idx].done ? 'Subtugas selesai.' : 'Subtugas kembali aktif.');
    }
    return;
  }
  const toggle = closest('[data-toggle-task]');
  if (toggle) {
    const t = db.tasks.find((x) => x.id === toggle.dataset.toggleTask);
    if (t) {
      t.done = !t.done;
      upsertItem('tasks', t);
      render();
      toast(t.done ? 'Tugas selesai.' : 'Tugas kembali aktif.');
    }
    return;
  }
  const togglePersSub = closest('[data-toggle-personal-subtask]');
  if (togglePersSub) {
    const p = db.activities.find((x) => x.id === togglePersSub.dataset.togglePersonalSubtask);
    const idx = Number(togglePersSub.dataset.subtaskIndex);
    if (p && p.subtasks && p.subtasks[idx] !== undefined) {
      p.subtasks[idx].done = !p.subtasks[idx].done;
      if (p.subtasks.every((s) => s.done)) p.done = true;
      upsertItem('activities', p);
      render();
      toast(p.subtasks[idx].done ? 'Item checklist selesai.' : 'Item checklist aktif.');
    }
    return;
  }
  const togglePers = closest('[data-toggle-personal]');
  if (togglePers) {
    const p = db.activities.find((x) => x.id === togglePers.dataset.togglePersonal);
    if (p) {
      p.done = !p.done;
      upsertItem('activities', p);
      render();
      toast(p.done ? 'Agenda pribadi selesai.' : 'Agenda pribadi kembali aktif.');
    }
    return;
  }

  // Calendar controls
  const calMode = closest('[data-calendar-mode]');
  if (calMode) {
    setCalendarMode(calMode.dataset.calendarMode);
    renderCalendar();
    return;
  }
  const calFilter = closest('[data-cal-filter]');
  if (calFilter) {
    const k = calFilter.dataset.calFilter;
    const types = getTypesMap();
    if (types[k]) {
      types[k].visible = types[k].visible === false;
      saveSettings({ types });
      renderCalendar();
    }
    return;
  }
  if (closest('[data-open-type-settings]')) {
    openTypeSettingsModal();
    return;
  }
  const pickedBtn = closest('[data-pick]');
  if (pickedBtn) {
    const d = pickedBtn.dataset.pick;
    const nowMs = Date.now();
    // Double-tap on date cell opens Daily view (00:00-24:00)
    if (lastPickTap.date === d && nowMs - lastPickTap.time < 400) {
      setPickedDate(d);
      setCalendarMode('day');
      renderCalendar();
      lastPickTap = { date: '', time: 0 };
      return;
    }
    lastPickTap = { date: d, time: nowMs };
    setPickedDate(d);
    renderCalendar();
    return;
  }
  const goDayBtn = closest('[data-go-day]');
  if (goDayBtn) {
    setPickedDate(goDayBtn.dataset.goDay);
    setCalendarMode('day');
    if (view !== 'calendar') go('calendar');
    else renderCalendar();
    return;
  }
  const shift = closest('[data-month-shift]');
  if (shift) {
    shiftMonth(shift.dataset.monthShift);
    renderCalendar();
    return;
  }
  const dayShift = closest('[data-day-shift]');
  if (dayShift) {
    shiftPickedDay(dayShift.dataset.dayShift);
    renderCalendar();
    return;
  }
  if (closest('[data-day-today]')) {
    setPickedDate(localToday());
    renderCalendar();
    return;
  }
  const slotEl = closest('[data-day-slot-hour]');
  if (slotEl && !closest('.day-event-block')) {
    const h = Number(slotEl.dataset.daySlotHour);
    const rect = slotEl.getBoundingClientRect();
    const offsetY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const quarter = Math.min(3, Math.floor((offsetY / rect.height) * 4));
    const startMin = h * 60 + quarter * 15;
    const endMin = Math.min(1439, startMin + 60);
    modalOpen('study', null, {
      title: '',
      subject: '',
      startDate: picked,
      endDate: picked,
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
    });
    return;
  }

  // Day Plan modal controls
  const openDp = closest('[data-open-dayplan]');
  if (openDp) {
    openDayPlanModal(openDp.dataset.openDayplan || picked);
    return;
  }
  const dpMode = closest('[data-dp-mode]');
  if (dpMode) {
    switchDayPlanMode(dpMode.dataset.dpMode);
    return;
  }
  if (closest('#dayplan-add-row')) {
    addDayPlanRow();
    return;
  }
  const dpRm = closest('[data-dp-remove]');
  if (dpRm) {
    removeDayPlanRow(Number(dpRm.dataset.dpRemove));
    return;
  }
  const dpPickTask = closest('[data-dp-pick-task]');
  if (dpPickTask) {
    addDayPlanRow({
      title: dpPickTask.dataset.dpPickTask,
      subject: dpPickTask.dataset.dpPickSubj || '',
    });
    return;
  }
  if (closest('#dayplan-close') || closest('#dayplan-cancel') || e.target.id === 'dayplan-wrap') {
    closeDayPlanModal();
    return;
  }

  // Type Settings modal controls
  const typeColorBtn = closest('[data-type-color]');
  if (typeColorBtn) {
    const key = typeColorBtn.dataset.typeColor;
    const hex = typeColorBtn.dataset.hex;
    const types = getTypesMap();
    if (types[key]) {
      types[key].color = hex;
      saveSettings({ types });
      renderTypeSettingsModal();
      render();
    }
    return;
  }
  const typeDelBtn = closest('[data-type-del]');
  if (typeDelBtn) {
    const key = typeDelBtn.dataset.typeDel;
    const types = getTypesMap();
    if (types[key] && !types[key].builtin) {
      delete types[key];
      saveSettings({ types });
      renderTypeSettingsModal();
      render();
      toast('Tipe kustom dihapus.');
    }
    return;
  }
  if (closest('#btn-add-custom-type')) {
    const inp = gid('new-custom-type');
    const name = inp?.value.trim();
    if (!name) {
      toast('Masukkan nama tipe terlebih dahulu.');
      return;
    }
    const key = 'custom_' + Date.now().toString(36);
    const types = getTypesMap();
    types[key] = { label: name, color: '#1d7a74', visible: true, builtin: false };
    saveSettings({ types });
    renderTypeSettingsModal();
    render();
    toast(`Tipe "${name}" ditambahkan.`);
    return;
  }
  if (
    closest('#type-settings-close') ||
    closest('#type-settings-done') ||
    e.target.id === 'type-settings-wrap'
  ) {
    closeTypeSettingsModal();
    return;
  }

  // Notes controls
  const noteSubj = closest('[data-note-subj]');
  if (noteSubj) {
    setNoteSubjectFilter(noteSubj.dataset.noteSubj);
    renderNotes();
    return;
  }
  const pinToggle = closest('[data-toggle-pin]');
  if (pinToggle) {
    e.stopPropagation();
    const n = (db.notes || []).find((x) => x.id === pinToggle.dataset.togglePin);
    if (n) {
      n.pinned = !n.pinned;
      upsertItem('notes', n);
      render();
      toast(n.pinned ? 'Catatan disematkan ke Home.' : 'Sematan catatan dilepas.');
    }
    return;
  }
  const openNote = closest('[data-open-note]');
  if (openNote) {
    openRecord(openNote.dataset.openNote, 'note');
    return;
  }

  // Open records & competitions
  const addTypeBtn = closest('[data-add-type]');
  if (addTypeBtn) {
    modalOpen(addTypeBtn.dataset.addType);
    return;
  }
  const openTask = closest('[data-edit-task]');
  if (openTask) {
    openRecord(openTask.dataset.editTask, 'task');
    return;
  }
  const openComp = closest('[data-open-comp]');
  if (openComp) {
    openRecord(openComp.dataset.openComp, 'competition');
    return;
  }
  const openEvent = closest('[data-open-event]');
  if (openEvent) {
    openRecord(openEvent.dataset.openEvent, openEvent.dataset.kind);
    return;
  }
  const step = closest('[data-stage-toggle]');
  if (step) {
    const c = db.competitions.find((x) => x.id === step.dataset.stageToggle);
    const s = c?.stages?.find((x) => x.id === step.dataset.stageId);
    if (c && s) {
      s.done = !s.done;
      upsertItem('competitions', c);
      render();
      toast(s.done ? 'Tahap lomba selesai.' : 'Tahap kembali aktif.');
    }
    return;
  }

  // Entry modal controls
  const changeType = closest('[data-modal-type]');
  if (changeType) {
    setModalType(changeType.dataset.modalType);
    return;
  }
  if (closest('#add-subtask')) {
    captureDraftForm();
    commitDraftInputs();
    draftSubtasks.push({ id: uid(), title: '', done: false });
    renderModal();
    document.querySelector('[data-subtask-text="' + (draftSubtasks.length - 1) + '"]')?.focus();
    return;
  }
  if (closest('#add-stage')) {
    captureDraftForm();
    commitDraftInputs();
    draftStages.push({ id: uid(), title: '', date: '', time: '', done: false });
    renderModal();
    document.querySelector('[data-stage-title="' + (draftStages.length - 1) + '"]')?.focus();
    return;
  }
  const rmSub = closest('[data-subtask-remove]');
  if (rmSub) {
    captureDraftForm();
    commitDraftInputs();
    draftSubtasks.splice(Number(rmSub.dataset.subtaskRemove), 1);
    renderModal();
    return;
  }
  const rmStage = closest('[data-stage-remove]');
  if (rmStage) {
    captureDraftForm();
    commitDraftInputs();
    draftStages.splice(Number(rmStage.dataset.stageRemove), 1);
    renderModal();
    return;
  }
  if (closest('#modal-close') || closest('#modal-cancel') || e.target.id === 'modal-wrap') {
    modalClose();
    return;
  }
  if (closest('#modal-delete')) {
    if (!editing) return;
    const id = editing;
    const mt = modalType;
    askConfirm('Item ini akan dihapus permanen.', {
      title: 'Hapus item?',
      ok: 'Hapus',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      if (mt === 'task') removeItem('tasks', id);
      else if (mt === 'competition') removeItem('competitions', id);
      else if (mt === 'note') removeItem('notes', id);
      else removeItem('activities', id);
      modalClose();
      render();
      toast('Item dihapus.');
    });
    return;
  }

  // AI Settings modal controls
  const aiProv = closest('[data-ai-provider]');
  if (aiProv) {
    switchAIModalProvider(aiProv.dataset.aiProvider);
    return;
  }
  if (closest('#ai-refresh-models')) {
    const btn = gid('ai-refresh-models');
    const status = gid('gemini-settings-feedback');
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Mengambil daftar model gratis dari OpenRouter...';
    AI.refreshOpenRouterModels()
      .then((models) => {
        const cur = AI.getConfig();
        cur.provider = 'openrouter';
        const keyIn = gid('ai-api-key');
        if (keyIn) cur.openrouterKey = keyIn.value.trim();
        renderAISettingsModal(cur);
        const st = gid('gemini-settings-feedback');
        if (st) st.textContent = `Berhasil memuat ${models.length} model gratis OpenRouter.`;
      })
      .catch((err) => {
        if (status) status.textContent = err.message || 'Gagal menyegarkan daftar model.';
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
    return;
  }

  // Header settings menu
  if (closest('#settings-button')) {
    gid('settings-menu').classList.toggle('show');
    return;
  }
  const action = closest('[data-action]');
  if (action) {
    gid('settings-menu').classList.remove('show');
    switch (action.dataset.action) {
      case 'ai-settings':
        showAISettings();
        break;
      case 'type-settings':
        openTypeSettingsModal();
        break;
      case 'export':
        void exportJSON();
        break;
      case 'import':
        gid('import-input').click();
        break;
      case 'empty':
        askConfirm(
          'Kosongkan semua data? Unduh cadangan jika ingin menyimpan data sekarang.',
          { title: 'Mulai dari kosong?', ok: 'Kosongkan', danger: true }
        ).then((ok) => {
          if (ok) {
            setDB({
              version: 4,
              settings: { types: cloneDefaultTypes() },
              tasks: [],
              activities: [],
              competitions: [],
              notes: [],
            });
            render();
            toast('Workspace kosong, siap kamu isi.');
          }
        });
        break;
      case 'reset':
        askConfirm('Pulihkan data contoh? Ini akan mengganti data sekarang.', {
          title: 'Pulihkan data contoh?',
          ok: 'Pulihkan',
          danger: true,
        }).then((ok) => {
          if (ok) {
            setDB(example());
            render();
            toast('Data contoh dipulihkan.');
          }
        });
        break;
      case 'logout':
        askConfirm('Keluar dari akun Academia di perangkat ini?', {
          title: 'Keluar akun?',
          ok: 'Keluar',
          danger: true,
        }).then(async (ok) => {
          if (!ok) return;
          stopSync();
          await logoutUser();
          toast('Berhasil keluar.');
        });
        break;
    }
    return;
  }
  if (!closest('#settings-menu')) gid('settings-menu')?.classList.remove('show');
}

function initEvents() {
  document.addEventListener('click', onClick);

  document.addEventListener('input', (e) => {
    if (e.target.id === 'task-search') {
      setTaskQuery(e.target.value);
      const s = e.target.selectionStart;
      renderTasks();
      const el = gid('task-search');
      if (el) {
        el.focus();
        el.setSelectionRange(s, s);
      }
      return;
    }
    if (e.target.id === 'note-search') {
      setNoteQuery(e.target.value);
      const s = e.target.selectionStart;
      renderNotes();
      const el = gid('note-search');
      if (el) {
        el.focus();
        el.setSelectionRange(s, s);
      }
      return;
    }
    if (e.target.dataset.typeLabel) {
      const k = e.target.dataset.typeLabel;
      const types = getTypesMap();
      if (types[k]) {
        types[k].label = e.target.value.trim() || k;
        saveSettings({ types });
        render();
      }
      return;
    }
    if (
      e.target.closest('#dayplan-body') &&
      (e.target.id === 'dayplan-textarea' ||
        e.target.dataset.dpStart !== undefined ||
        e.target.dataset.dpEnd !== undefined ||
        e.target.dataset.dpTitle !== undefined)
    ) {
      commitDayPlanDomToState();
      if (e.target.id === 'dayplan-textarea') {
        const rows = parseDayPlanText(e.target.value);
        const conflicts = detectTimeConflicts(rows);
        const cz = gid('dayplan-conflict-zone');
        if (cz) {
          cz.innerHTML = conflicts.length
            ? `<div class="ai-review" style="background:var(--terra-pale);color:var(--terra);border-color:var(--terra)"><strong>Perhatian: Ada jadwal yang bertabrakan</strong><ul>${conflicts
                .map((c) => `<li>${esc(c)}</li>`)
                .join('')}</ul></div>`
            : '';
        }
      }
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.typeVis) {
      const k = e.target.dataset.typeVis;
      const types = getTypesMap();
      if (types[k]) {
        types[k].visible = e.target.checked;
        saveSettings({ types });
        render();
      }
    }
    if (e.target.closest('#dayplan-body')) {
      commitDayPlanDomToState();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'quick-form') {
      e.preventDefault();
      void handleQuickAdd();
    } else if (e.target.id === 'entry-form') {
      e.preventDefault();
      submitForm(e.target, render);
    } else if (e.target.id === 'dayplan-form') {
      e.preventDefault();
      saveDayPlan((savedDate) => {
        setPickedDate(savedDate);
        render();
      });
    } else if (e.target.id === 'ai-settings-form') {
      e.preventDefault();
      try {
        saveAISettingsFromModal(render);
      } catch (err) {
        gid('gemini-settings-feedback').textContent = err.message;
      }
    }
  });

  // Swipe left/right on Daily View
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener(
    'touchstart',
    (e) => {
      if (!e.target.closest('#dayview-swipe-area')) return;
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchend',
    (e) => {
      if (!e.target.closest('#dayview-swipe-area') || !touchStartX) return;
      const dx = e.changedTouches[0].screenX - touchStartX;
      const dy = e.changedTouches[0].screenY - touchStartY;
      touchStartX = 0;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        shiftPickedDay(dx < 0 ? 1 : -1);
        renderCalendar();
      }
    },
    { passive: true }
  );

  gid('header-create').innerHTML = icon('plus', 'sm') + ' Tambah';
  gid('header-create').onclick = () => {
    if (view === 'notes') modalOpen('note');
    else if (view === 'tasks' && taskSegment === 'personal') modalOpen('personal');
    else if (view === 'calendar' && calendarMode === 'day')
      modalOpen('study', null, { startDate: picked, endDate: picked });
    else modalOpen('task');
  };

  gid('settings-button').innerHTML = icon('settings', 'sm');
  gid('modal-close').innerHTML = icon('close', 'sm');
  gid('dayplan-close').innerHTML = icon('close', 'sm');
  gid('type-settings-close').innerHTML = icon('close', 'sm');
  gid('side-backup').innerHTML = icon('download', 'sm') + ' Cadangkan datamu';
  gid('side-backup').onclick = exportJSON;

  gid('import-input').addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });

  // AI Settings listeners
  gid('ai-settings-close').addEventListener('click', closeAISettings);
  gid('ai-settings-wrap').addEventListener('click', (e) => {
    if (e.target.id === 'ai-settings-wrap') closeAISettings();
  });
  gid('gemini-forget').addEventListener('click', () => {
    const { provider } = getActiveAIModalValues();
    AI.clearKey(provider);
    const keyIn = gid('ai-api-key');
    if (keyIn) keyIn.value = '';
    const status = gid('gemini-settings-feedback');
    if (status) status.textContent = 'Kunci API dihapus dari perangkat ini.';
  });
  gid('gemini-test').addEventListener('click', async () => {
    const status = gid('gemini-settings-feedback');
    const button = gid('gemini-test');
    const { provider, key, model } = getActiveAIModalValues();
    const provLabel = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
    button.disabled = true;
    status.textContent = `Menguji koneksi ${provLabel}...`;
    try {
      const parsed = await AI.parse('PR Kimia besok', { provider, key, model });
      status.textContent = `Koneksi berhasil! ${provLabel} mengenali: "${parsed.title}" (${getTypeLabel(
        parsed.type
      )}). Tekan Simpan untuk mengaktifkan.`;
    } catch (err) {
      status.textContent = 'Uji koneksi gagal: ' + err.message;
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (gid('modal-wrap').classList.contains('show')) modalClose();
      if (gid('dayplan-wrap').classList.contains('show')) closeDayPlanModal();
      if (gid('type-settings-wrap').classList.contains('show')) closeTypeSettingsModal();
      if (gid('ai-settings-wrap').classList.contains('show')) closeAISettings();
    }
    if (
      e.key === '/' &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) &&
      view === 'home'
    ) {
      e.preventDefault();
      gid('quick-input')?.focus();
    }
  });

  window.addEventListener('popstate', () => {
    if (gid('modal-wrap').classList.contains('show')) modalClose();
    if (gid('dayplan-wrap').classList.contains('show')) closeDayPlanModal();
    if (gid('type-settings-wrap').classList.contains('show')) closeTypeSettingsModal();
    if (gid('ai-settings-wrap').classList.contains('show')) closeAISettings();
  });

  if (location.hash && navs.some((n) => '#' + n[0] === location.hash)) {
    view = location.hash.slice(1);
  }
  window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (navs.some((n) => n[0] === next) && next !== view) {
      view = next;
      render();
    }
  });
}

// Mobile Keyboard Smart-Scroll & Focus-Aware Handling
function initKeyboardHandling() {
  const isField = (el) => el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  let timer = 0;
  function reveal() {
    const el = document.activeElement;
    if (!isField(el)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const header = el.closest('.dialog-body') ? 0 : 70;
      if (r.top < header + 8 || r.bottom > vh - 16) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 60);
  }
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) {
      document.documentElement.classList.add('kb-open');
      setTimeout(reveal, 320);
    }
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isField(document.activeElement)) document.documentElement.classList.remove('kb-open');
    }, 120);
  });
  window.addEventListener('resize', reveal);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', reveal);
  const K = window.Capacitor?.Plugins?.Keyboard;
  if (K && K.addListener) {
    K.addListener('keyboardDidShow', reveal);
    K.addListener('keyboardDidHide', () => document.documentElement.classList.remove('kb-open'));
  }
}

// Bootstrap
function bootstrap() {
  initPickerAndConfirm();
  initEvents();
  initLoginEvents();
  initKeyboardHandling();
  renderLoginGate();
  render();

  registerSyncCallbacks({
    onRemoteUpdate: () => render(),
    askFirstUpload: () =>
      askConfirm('Unggah data yang ada di perangkat ini ke akunmu?', {
        title: 'Sinkronisasi Pertama Kali',
        ok: 'Unggah ke Akun',
        cancel: 'Mulai Kosong',
        danger: false,
      }),
  });

  onAuthChange((user) => {
    const gate = gid('login-gate');
    const appShell = gid('app-shell');
    renderUserMenuHeader(user);
    if (!user) {
      stopSync();
      gate?.classList.remove('hidden');
      appShell?.classList.add('hidden');
      renderLoginGate();
    } else {
      gate?.classList.add('hidden');
      appShell?.classList.remove('hidden');
      render();
      void startSyncForUser(user);
    }
  });

  initAuth();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

bootstrap();

