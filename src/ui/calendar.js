// src/ui/calendar.js — Month (GCal chips + holiday highlights), Agenda, and Daily View (00:00–24:00)

import { icon, esc, heading } from './icons.js';
import {
  MONTHS,
  localToday,
  addDays,
  parseISO,
  toISO,
  fmt,
  fmtFull,
  pad,
  HOUR_HEIGHT,
  dayLayout,
} from '../dates.js';
import {
  filteredEvents,
  getTypesMap,
  getTypeColor,
  isTypeVisible,
} from '../store.js';
import { eventRow, formatEventTime } from './shared.js';

export let calendarMode = 'month'; // 'month' | 'agenda' | 'day'
export let calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
export let picked = localToday();

export function setCalendarMode(m) {
  if (['month', 'agenda', 'day'].includes(m)) {
    calendarMode = m;
  }
}

export function setPickedDate(d) {
  if (parseISO(d)) {
    picked = d;
    const dt = parseISO(d);
    calCursor = new Date(dt.getFullYear(), dt.getMonth(), 1);
  }
}

export function shiftMonth(delta) {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + Number(delta), 1);
}

export function shiftPickedDay(delta) {
  const next = addDays(picked, Number(delta));
  if (next) setPickedDate(next);
}

function filtersHTML() {
  const types = getTypesMap();
  const chips = Object.entries(types)
    .map(([k, cfg]) => {
      const on = isTypeVisible(k);
      return `<button type="button" class="filterchip ${
        on ? '' : 'off'
      }" data-cal-filter="${esc(k)}" aria-pressed="${on}"><span class="type-dot" style="background:${esc(
        cfg.color || '#3b648c'
      )};margin-right:0"></span>${esc(cfg.label)}</button>`;
    })
    .join('');

  return `<div class="filterrow">${chips}<button type="button" class="filterchip" data-open-type-settings="1" title="Atur warna & tipe kalender">${icon(
    'settings',
    'sm'
  )} Atur Tipe</button></div>`;
}

// Fase 3: Tampilan Bulan dengan chip bergaya GCal & highlight Libur
function calendarHTML() {
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  const start = new Date(year, month, 1);
  const offset = (start.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  const first = toISO(gridStart);
  const end = addDays(first, 41);

  const evs = filteredEvents(first, end);
  const byDate = new Map();
  for (const e of evs) {
    const ar = byDate.get(e.date) || [];
    ar.push(e);
    byDate.set(e.date, ar);
  }

  let out = '';
  const today = localToday();

  for (let i = 0; i < 42; i++) {
    const date = addDays(first, i);
    const d = parseISO(date);
    const ev = byDate.get(date) || [];
    const hasHoliday = ev.some((e) => e.kind === 'holiday');
    const holidayColor = getTypeColor('holiday');

    const visibleChips = ev.slice(0, 3);
    const extraCount = ev.length - visibleChips.length;

    const chipsHTML = visibleChips
      .map((e) => {
        const color = getTypeColor(e.kind);
        const isMulti = e.startDate && e.endDate && e.endDate > e.startDate;
        const colIdx = i % 7;
        let spanCls = '';
        if (isMulti) {
          const isStart = e.date === e.startDate || colIdx === 0;
          const isEnd = e.date === e.endDate || colIdx === 6;
          spanCls = isStart && isEnd ? '' : isStart ? 'span-start' : isEnd ? 'span-end' : 'span-mid';
        }
        return `<span class="cal-chip ${spanCls}" style="--c:${esc(color)}" title="${esc(
          e.title
        )}">${esc(e.title)}</span>`;
      })
      .join('');

    const moreHTML =
      extraCount > 0 ? `<span class="cal-more">+${extraCount} lagi</span>` : '';

    out += `<button type="button" class="cal-cell ${
      d.getMonth() !== month ? 'outside' : ''
    } ${date === picked ? 'selected' : ''} ${date === today ? 'today' : ''} ${
      hasHoliday ? 'holiday' : ''
    }" style="${hasHoliday ? `--c:${esc(holidayColor)}` : ''}" data-pick="${date}" aria-label="${fmtFull(
      date
    )}${ev.length ? ', ' + ev.length + ' agenda' : ''}"><span class="daynum">${d.getDate()}</span><span class="cal-chips">${chipsHTML}${moreHTML}</span></button>`;
  }

  return `<div class="cal-week">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
    .map((s) => `<span>${s}</span>`)
    .join('')}</div><div class="cal-grid">${out}</div>`;
}

// Fase 4: Tampilan Hari (00:00 - 24:00)
function renderDayViewHTML() {
  const today = localToday();
  const events = filteredEvents(picked, picked);
  const { timed, allDay } = dayLayout(events, HOUR_HEIGHT);

  const allDayHTML = allDay.length
    ? `<div class="day-allday-row"><div class="day-allday-label">Sepanjang hari</div><div class="day-allday-items">${allDay
        .map((e) => {
          const color = getTypeColor(e.kind);
          return `<button type="button" class="day-allday-chip" style="--c:${esc(
            color
          )}" data-open-event="${esc(e.id)}" data-kind="${esc(e.kind)}"><span class="type-dot" style="background:${esc(
            color
          )}"></span><span>${esc(e.title)}</span>${
            e.notes ? `<small class="day-chip-note">· ${esc(e.notes)}</small>` : ''
          }</button>`;
        })
        .join('')}</div></div>`
    : '';

  let hoursGrid = '';
  for (let h = 0; h < 24; h++) {
    const label = `${pad(h)}:00`;
    hoursGrid += `<div class="day-hour-slot" data-day-slot-hour="${h}" style="height:${HOUR_HEIGHT}px">
      <span class="day-hour-label">${label}</span>
      <div class="day-hour-line"></div>
    </div>`;
  }
  // Closing 24:00 label at bottom
  hoursGrid += `<div class="day-hour-end"><span class="day-hour-label">24:00</span><div class="day-hour-line"></div></div>`;

  let nowIndicator = '';
  if (picked === today) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const topPx = (mins / 60) * HOUR_HEIGHT;
    const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    nowIndicator = `<div class="day-now-line" style="top:${topPx}px"><span class="day-now-badge">${nowTime}</span><i></i></div>`;
  }

  const blocksHTML = timed
    .map((b) => {
      const color = getTypeColor(b.kind);
      const widthPct = 100 / b.cols;
      const leftPct = b.col * widthPct;
      const showNotes = b.height >= 44 && b.notes;
      return `<button type="button" class="day-event-block" data-open-event="${esc(
        b.id
      )}" data-kind="${esc(b.kind)}" style="top:${b.top}px;height:${b.height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);--c:${esc(
        color
      )}">
        <div class="day-block-head"><strong>${esc(b.title)}</strong><span>${esc(
        formatEventTime(b)
      )}</span></div>
        ${b.height >= 36 ? `<div class="day-block-sub">${esc(b.subtitle)}</div>` : ''}
        ${showNotes ? `<div class="day-block-note">${esc(b.notes)}</div>` : ''}
      </button>`;
    })
    .join('');

  return `<section class="panel dayview-panel" id="dayview-swipe-area">
    <div class="dayview-toolbar">
      <div>
        <div class="eyebrow">DAILY SCHEDULE (00:00–24:00)</div>
        <h2>${fmt(picked, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
      </div>
      <div class="dayview-actions">
        <button type="button" class="secondary" data-open-dayplan="${picked}">${icon(
    'spark',
    'sm'
  )} Atur hari ini</button>
        <button type="button" class="secondary" data-day-today="1">Hari ini</button>
        <div class="cal-nav">
          <button type="button" class="iconbtn" data-day-shift="-1" title="Hari sebelumnya">${icon(
    'left',
    'sm'
  )}</button>
          <button type="button" class="iconbtn" data-day-shift="1" title="Hari berikutnya">${icon(
    'right',
    'sm'
  )}</button>
        </div>
      </div>
    </div>
    <div class="tiny muted" style="margin:0 0 10px">Ketuk baris jam kosong untuk menambah sesi belajar pada jam tersebut, atau tekan <b>Atur hari ini</b> untuk menyusun jadwal seharian sekaligus.</div>
    ${allDayHTML}
    <div class="day-grid-scroll" id="day-grid-scroll">
      <div class="day-grid-canvas" id="day-grid-canvas" style="height:${24 * HOUR_HEIGHT}px">
        ${hoursGrid}
        <div class="day-events-layer">${blocksHTML}${nowIndicator}</div>
      </div>
    </div>
  </section>`;
}

export function renderCalendar() {
  const now = localToday();
  const views = `<div class="calendar-modes">${[
    ['month', 'Bulan'],
    ['agenda', 'Agenda'],
    ['day', 'Hari'],
  ]
    .map(
      ([k, n]) =>
        `<button type="button" data-calendar-mode="${k}" class="${
          calendarMode === k ? 'active' : ''
        }">${n}</button>`
    )
    .join('')}</div>`;

  const top =
    heading(
      'ONE CALENDAR',
      'Calendar',
      'Tenggat tugas, ulangan, libur, sesi belajar harian, dan tahapan lomba dalam satu kalender.'
    ) +
    `<div class="cal-main-head">${views}</div>${filtersHTML()}`;

  if (calendarMode === 'month') {
    const events = filteredEvents(picked, picked);
    document.getElementById('calendar').innerHTML =
      top +
      `<div class="calendar-layout"><section class="panel cal-panel"><div class="cal-toolbar"><h2>${
        MONTHS[calCursor.getMonth()]
      } ${calCursor.getFullYear()}</h2><div class="cal-nav"><button type="button" class="secondary" style="min-height:38px;padding:6px 12px" data-day-today="1">Hari ini</button><button class="iconbtn" data-month-shift="-1" title="Bulan sebelumnya">${icon(
        'left',
        'sm'
      )}</button><button class="iconbtn" data-month-shift="1" title="Bulan berikutnya">${icon(
        'right',
        'sm'
      )}</button></div></div>${calendarHTML()}<div class="tiny muted" style="margin:8px 6px 0">Tip: Ketuk dua kali tanggal untuk membuka tampilan Hari (00:00–24:00).</div></section><section class="panel day-panel"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><div class="eyebrow">SELECTED DAY</div><div class="selected-day">${fmt(
        picked,
        { weekday: 'long', day: 'numeric', month: 'long' }
      )}</div><div class="selected-day-sub">Agenda pada tanggal ini</div></div><div style="display:flex;gap:6px"><button type="button" class="secondary" style="min-height:36px;padding:6px 12px;font-size:12px" data-open-dayplan="${picked}">Atur hari</button><button type="button" class="secondary" style="min-height:36px;padding:6px 12px;font-size:12px" data-go-day="${picked}">Jam ${icon(
        'right',
        'sm'
      )}</button></div></div>${
        events.length
          ? events.map(eventRow).join('')
          : '<div class="empty">Tidak ada agenda di tanggal ini.</div>'
      }</section></div>`;
    return;
  }

  if (calendarMode === 'day') {
    document.getElementById('calendar').innerHTML = top + renderDayViewHTML();
    // Scroll to 06:00 or current hour smoothly on initial render
    const scroller = document.getElementById('day-grid-scroll');
    if (scroller) {
      const targetHour = picked === now ? Math.max(0, new Date().getHours() - 2) : 6;
      scroller.scrollTop = targetHour * HOUR_HEIGHT;
    }
    return;
  }

  // Agenda 60 hari ke depan
  const start = now;
  const end = addDays(now, 59);
  const events = filteredEvents(start, end);
  const group = new Map();
  for (const e of events) {
    if (!group.has(e.date)) group.set(e.date, []);
    group.get(e.date).push(e);
  }
  const groups = [...group.entries()]
    .map(
      ([d, rows]) =>
        `<div class="agenda-group"><strong>${fmt(d, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}</strong>${rows.map(eventRow).join('')}</div>`
    )
    .join('');

  document.getElementById('calendar').innerHTML =
    top +
    `<section class="panel panel-pad"><div class="section-head"><h2>Agenda 60 hari ke depan</h2><span class="tiny muted">${
      events.length
    } kegiatan</span></div>${
      groups || '<div class="empty">Belum ada kegiatan dalam rentang ini.</div>'
    }</section>`;
}

