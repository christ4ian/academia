// src/ui/home.js — Home view with Today mini-timeline, Tasks with note preview, 14-day Agenda, Active Competitions, and Pinned Notes

import { icon, esc } from './icons.js';
import {
  localToday,
  addDays,
  fmt,
  daysBetween,
  timeToMinutes,
  compStatus,
  sortCompetitions,
} from '../dates.js';
import { db, allEvents, getTypeColor, NOTE_COLORS } from '../store.js';
import {
  tasksOrdered,
  isOverdue,
  taskRow,
  eventRow,
  notePreviewHTML,
  formatEventTime,
} from './shared.js';
import { AI } from '../ai/index.js';

function renderTodayMiniPanel(today) {
  const todayEvents = allEvents(today, today).filter((e) => !(e.kind === 'task' && e.done));
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const timed = todayEvents
    .map((e) => ({ ...e, sMin: timeToMinutes(e.time), eMin: timeToMinutes(e.endTime) }))
    .filter((e) => e.sMin !== null)
    .sort((a, b) => a.sMin - b.sMin);

  const untimed = todayEvents.filter((e) => timeToMinutes(e.time) === null);

  // Find next upcoming or ongoing timed event today
  const nextTimed =
    timed.find((e) => e.sMin >= nowMins || (e.eMin && e.eMin > nowMins)) || null;

  let nextBanner = '';
  if (nextTimed) {
    const diffMins = nextTimed.sMin - nowMins;
    let relText = 'Sedang berlangsung';
    if (diffMins > 0) {
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      relText = h > 0 ? `dalam ${h}j${m ? ' ' + m + 'm' : ''}` : `dalam ${m} menit`;
    }
    const color = getTypeColor(nextTimed.kind);
    nextBanner = `<div class="today-next-card clickable" data-open-event="${esc(
      nextTimed.id
    )}" data-kind="${esc(nextTimed.kind)}" style="--c:${esc(color)}"><div class="today-next-dot"></div><div class="today-next-info"><strong>Berikutnya: ${esc(
      nextTimed.title
    )}</strong><span>${esc(formatEventTime(nextTimed))} · ${esc(relText)}</span></div>${icon(
      'right',
      'sm'
    )}</div>`;
  }

  let timelineRows = '';
  let nowLineInserted = false;
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
    2,
    '0'
  )}`;

  for (const ev of timed) {
    if (!nowLineInserted && ev.sMin > nowMins) {
      timelineRows += `<div class="mini-now-line"><span>Sekarang · ${nowStr}</span><i></i></div>`;
      nowLineInserted = true;
    }
    const color = getTypeColor(ev.kind);
    const noteHTML = notePreviewHTML(ev, `data-open-event="${esc(ev.id)}" data-kind="${esc(ev.kind)}"`);
    timelineRows += `<div class="mini-time-row clickable" data-open-event="${esc(
      ev.id
    )}" data-kind="${esc(ev.kind)}"><span class="mini-time-stamp">${esc(
      ev.time
    )}</span><div class="mini-time-bar" style="background:${esc(
      color
    )}"></div><div class="mini-time-body"><strong>${esc(ev.title)}</strong><span class="row-sub">${esc(
      ev.subtitle
    )}${ev.endTime ? ' · s/d ' + esc(ev.endTime) : ''}</span>${noteHTML}</div></div>`;
  }

  if (timed.length && !nowLineInserted) {
    timelineRows += `<div class="mini-now-line"><span>Sekarang · ${nowStr}</span><i></i></div>`;
  }

  const untimedHTML = untimed.length
    ? `<div class="mini-allday-list">${untimed
        .map((e) => {
          const color = getTypeColor(e.kind);
          return `<button type="button" class="mini-allday-chip" data-open-event="${esc(
            e.id
          )}" data-kind="${esc(e.kind)}" style="--c:${esc(color)}"><span class="type-dot" style="background:${esc(
            color
          )}"></span>${esc(e.title)}</button>`;
        })
        .join('')}</div>`
    : '';

  const bodyHTML =
    todayEvents.length > 0
      ? `${nextBanner}${untimedHTML}${
          timelineRows
            ? `<div class="mini-timeline">${timelineRows}</div>`
            : ''
        }`
      : `<div class="empty">Belum ada blok belajar atau jadwal hari ini.<br>Susun jadwal belajarmu dari jam ke jam.</div>`;

  return `<section class="panel panel-pad"><div class="section-head"><h2><span class="sh-ic">${icon(
    'clock',
    'sm'
  )}</span>Hari Ini <span class="count">${
    todayEvents.length
  }</span></h2><div style="display:flex;gap:10px;align-items:center"><button type="button" class="text-link" data-open-dayplan="${today}">${icon(
    'plus',
    'sm'
  )} Atur hari ini</button><button type="button" class="text-link" data-go-day="${today}">Grid hari ${icon(
    'right',
    'sm'
  )}</button></div></div>${bodyHTML}</section>`;
}

function renderActiveCompetitionsCard(today) {
  if (!db.competitions || db.competitions.length === 0) return '';
  const sorted = sortCompetitions(db.competitions, today);
  const rows = sorted
    .map((c) => {
      const { st, upcoming, state } = compStatus(c, today);
      let subText = 'Tambahkan jadwal tahapan';
      let badgeHTML = `<span class="pill">Tanpa jadwal</span>`;

      if (upcoming) {
        const diff = daysBetween(today, upcoming.date);
        const hText = diff === 0 ? 'Hari ini' : `H-${diff}`;
        subText = `Berikutnya: ${upcoming.title} · ${fmt(upcoming.date)}`;
        badgeHTML = `<span class="pill on">${esc(hText)}</span>`;
      } else if (state === 'finished') {
        subText = 'Semua tahap sudah lewat';
        badgeHTML = `<span class="pill">Selesai</span>`;
      }

      const dotsHTML = st.length
        ? `<div class="comp-mini-dots" title="Tahapan lomba">${st
            .map((s) => {
              const isPast = s.date < today;
              const cls = s.done
                ? 'done'
                : upcoming?.id === s.id
                ? 'next'
                : isPast
                ? 'missed'
                : '';
              return `<span class="comp-dot ${cls}" title="${esc(s.title)} (${fmt(s.date)})${
                !s.done && isPast ? ' - terlewat' : ''
              }"></span>`;
            })
            .join('')}</div>`
        : '';

      const noteHTML = notePreviewHTML(c, `data-open-comp="${esc(c.id)}"`);

      return `<div class="agenda-row clickable" data-open-comp="${esc(
        c.id
      )}"><div class="daybox trophy">${icon(
        'trophy',
        'sm'
      )}</div><div class="agenda-info"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong>${esc(
        c.name
      )}</strong>${badgeHTML}</div><span class="row-sub">${esc(
        subText
      )}</span>${dotsHTML}${noteHTML}</div></div>`;
    })
    .join('');

  return `<section class="panel panel-pad"><div class="section-head"><h2><span class="sh-ic purple">${icon(
    'trophy',
    'sm'
  )}</span>Lomba Aktif <span class="count">${
    db.competitions.length
  }</span></h2><button type="button" class="text-link" data-add-type="competition">${icon(
    'plus',
    'sm'
  )} Lomba</button></div>${rows}</section>`;
}

function renderPinnedNotesCard() {
  const allNotes = [...(db.notes || [])].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0)
  );
  const pinned = allNotes.filter((n) => n.pinned).slice(0, 3);
  const displayList = pinned.length ? pinned : allNotes.slice(0, 3);

  const cards = displayList.length
    ? `<div class="home-notes-list">${displayList
        .map((n) => {
          const colObj = NOTE_COLORS.find((c) => c.id === n.color);
          const bg = colObj && colObj.id ? colObj.bg : 'var(--bg)';
          return `<div class="home-note-card clickable" data-open-note="${esc(
            n.id
          )}" style="background:${bg}"><div class="home-note-top"><strong>${esc(
            n.title
          )}</strong>${
            n.pinned ? `<span class="pin-badge" title="Disematkan">${icon('pin', 'sm')}</span>` : ''
          }</div>${
            n.subject ? `<span class="note-subj">${esc(n.subject)}</span>` : ''
          }<p class="home-note-body">${esc(n.body)}</p></div>`;
        })
        .join('')}</div>`
    : `<div class="empty">Belum ada catatan disematkan. Simpan rumus, rangkuman, atau pengingat penting agar langsung terlihat di depan.</div>`;

  return `<section class="panel panel-pad"><div class="section-head"><h2><span class="sh-ic">${icon(
    'notes',
    'sm'
  )}</span>Catatan Disematkan <span class="count">${
    pinned.length || allNotes.length
  }</span></h2><div style="display:flex;gap:10px;align-items:center"><button type="button" class="text-link" data-add-type="note">${icon(
    'plus',
    'sm'
  )} Catatan cepat</button><button type="button" data-view="notes" class="text-link">Semua ${icon(
    'right',
    'sm'
  )}</button></div></div>${cards}</section>`;
}

export function renderHome() {
  const today = localToday();
  const end = addDays(today, 13);
  const upcoming = allEvents(today, end)
    .filter((e) => !(e.kind === 'task' && e.done))
    .slice(0, 6);
  const active = db.tasks.filter((t) => !t.done).length;
  const overdue = db.tasks.filter(isOverdue).length;
  const greeting =
    new Date().getHours() < 11
      ? 'Selamat pagi'
      : new Date().getHours() < 15
      ? 'Selamat siang'
      : new Date().getHours() < 18
      ? 'Selamat sore'
      : 'Selamat malam';

  const ts = tasksOrdered()
    .filter((t) => !t.done)
    .slice(0, 5);
  const homeTasksHTML = ts.length
    ? ts.map(taskRow).join('')
    : `<div class="empty">Tidak ada tugas aktif. Kamu bisa menambahkan tugas lewat Quick Add.</div>`;

  const aiBadge = AI.hasKey()
    ? `<span class="quick-mode">${icon('spark', 'sm')} ${esc(AI.getProviderName())} AI aktif</span>`
    : '';

  const heroHTML = `<section class="hero" aria-label="Ringkasan Utama">
    <div class="hero-top">
      <span class="hero-date">${icon('calendar', 'sm')} ${fmt(today, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })}</span>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${aiBadge}
        <span class="hero-chip ${overdue ? 'warn' : ''}"><i></i>${
    overdue ? `${overdue} tugas terlambat` : active ? `${active} tugas menanti` : 'Semua tugas selesai'
  }</span>
      </div>
    </div>
    <h1 class="hero-title">${greeting}, <em>pelajar.</em></h1>
    <p class="hero-sub">Kelola ritme belajarmu, pantau tenggat tugas, lihat catatan penting, dan susun jadwal harian dalam satu ruang kerja yang tenang.</p>
    
    <form class="hero-quick" id="quick-form">
      ${icon('spark', 'sm')}
      <input id="quick-input" autocomplete="off" maxlength="260" aria-label="Tambah tugas, jadwal, atau catatan cepat" placeholder="Tulis tugas, jadwal, atau 'catatan: ...' (Enter)..." required>
      <button type="submit" aria-label="Tambah">${icon('arrow', 'sm')}</button>
    </form>
    <div id="quick-feedback" class="tiny muted" style="margin-top:6px;min-height:16px"></div>
  </section>`;

  const compSection = renderActiveCompetitionsCard(today);
  const notesSection = renderPinnedNotesCard();

  document.getElementById('home').innerHTML =
    heroHTML +
    `<div class="home-layout"><div class="home-left">${renderTodayMiniPanel(
      today
    )}<section class="panel panel-pad"><div class="section-head"><h2><span class="sh-ic">${icon(
      'tasks',
      'sm'
    )}</span>Tugas Terdekat <span class="count">${active}</span></h2><button data-view="tasks" class="text-link">Lihat semua ${icon(
      'right',
      'sm'
    )}</button></div><div class="metric-line"><div><div class="tiny muted">${
      overdue
        ? `<b style="color:var(--red)">${overdue} melewati tenggat</b> · prioritaskan sekarang`
        : 'Selesaikan tugas sesuai jadwal dan targetmu.'
    }</div></div></div>${homeTasksHTML}</section></div><div class="home-right"><section class="panel panel-pad"><div class="section-head"><h2><span class="sh-ic green">${icon(
      'calendar',
      'sm'
    )}</span>Agenda 14 Hari <span class="count">${
      upcoming.length
    }</span></h2><button data-view="calendar" class="text-link">Kalender ${icon(
      'right',
      'sm'
    )}</button></div>${
      upcoming.length
        ? upcoming.map((e) => eventRow(e)).join('')
        : '<div class="empty">Belum ada agenda dalam dua minggu ke depan.</div>'
    }</section>${compSection}${notesSection}</div></div>`;
}

