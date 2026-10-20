// src/dates.js — Date, time, recurrence, competition status, daily layout, and natural language parser

export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const DAYS = {
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6
};

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d, 12);
  return toISO(t) === s ? t : null;
};

export const addDays = (s, n) => {
  const d = parseISO(s);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const localToday = () => toISO(new Date());

export const fmt = (s, opt = { day: 'numeric', month: 'short' }) => {
  const d = parseISO(s);
  return d ? new Intl.DateTimeFormat('id-ID', opt).format(d) : 'Belum dijadwalkan';
};

export const fmtFull = (s) =>
  fmt(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function daysBetween(a, b) {
  const d = parseISO(a), e = parseISO(b);
  return d && e ? Math.round((e - d) / 86400000) : 0;
}

export function timeToMinutes(t) {
  const m = /^([01]?\d|2[0-4]):([0-5]\d)$/.exec(String(t || '').trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh === 24 && mm > 0) return null;
  return hh * 60 + mm;
}

export function minutesToTime(mins) {
  const clamped = Math.max(0, Math.min(1440, Math.round(mins)));
  if (clamped === 1440) return '23:59';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${pad(h)}:${pad(m)}`;
}

// Fase 1 — Bug kompetisi (poin 8)
export function compStatus(c, today = localToday()) {
  const st = [...(c.stages || [])]
    .filter((s) => s && s.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = st.find((s) => !s.done && s.date >= today) || null;
  const missed = st.filter((s) => !s.done && s.date < today);
  const allDone = st.length > 0 && st.every((s) => s.done || s.date < today);
  const state = upcoming ? 'active' : st.length ? 'finished' : 'empty';
  return { st, upcoming, missed, allDone, state };
}

export function sortCompetitions(competitions, today = localToday()) {
  const rank = { active: 0, empty: 1, finished: 2 };
  return [...(competitions || [])].sort((a, b) => {
    const sa = compStatus(a, today);
    const sb = compStatus(b, today);
    if (rank[sa.state] !== rank[sb.state]) {
      return rank[sa.state] - rank[sb.state];
    }
    if (sa.state === 'active') {
      return sa.upcoming.date.localeCompare(sb.upcoming.date) || String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (sa.state === 'finished') {
      const lastA = sa.st[sa.st.length - 1]?.date || '';
      const lastB = sb.st[sb.st.length - 1]?.date || '';
      return lastB.localeCompare(lastA) || String(a.name || '').localeCompare(String(b.name || ''));
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

// Recurrence occurrences
export function occurrences(act, start, end) {
  const result = [];
  if (!parseISO(act.startDate)) return result;
  const s = act.startDate;
  const limit = act.repeatUntil || (act.endDate && act.endDate > s ? act.endDate : end);
  const final = (!act.repeat || act.repeat === 'none') ? (act.endDate || s) : limit;

  if (!act.repeat || act.repeat === 'none') {
    if (final < start || s > end) return result;
    let cursor = s, ctr = 0;
    while (cursor && cursor <= final && ctr < 500) {
      if (cursor >= start && cursor <= end) result.push({ date: cursor });
      cursor = addDays(cursor, 1);
      ctr++;
    }
    return result;
  }

  if (final < start || s > end) return result;
  let cursor = s, ctr = 0;
  const wd = act.repeatDays || [];
  while (cursor && cursor <= final && ctr < 740) {
    const day = parseISO(cursor).getDay();
    if (
      cursor >= start &&
      cursor <= end &&
      (act.repeat === 'daily' ||
        (act.repeat === 'weekly'
          ? wd.length
            ? wd.includes(day)
            : day === parseISO(s).getDay()
          : false))
    ) {
      result.push({ date: cursor });
    }
    cursor = addDays(cursor, 1);
    ctr++;
  }
  return result;
}

// Fase 4 — Daily view layout (00:00 - 24:00, 48px/hour)
export const HOUR_HEIGHT = 48;

export function dayLayout(events, hourHeight = HOUR_HEIGHT) {
  const timed = [];
  const allDay = [];

  for (const ev of events || []) {
    const startMin = timeToMinutes(ev.time || ev.startTime);
    if (startMin === null) {
      allDay.push(ev);
      continue;
    }
    let endMin = timeToMinutes(ev.endTime);
    if (endMin === null || endMin <= startMin) {
      endMin = Math.min(1440, startMin + 60);
    }
    timed.push({
      ...ev,
      startMin,
      endMin,
      top: (startMin / 60) * hourHeight,
      height: Math.max(22, ((endMin - startMin) / 60) * hourHeight),
      col: 0,
      cols: 1,
    });
  }

  timed.sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  // Group overlapping clusters and assign columns
  let cluster = [];
  let clusterEnd = -1;

  const flushCluster = (items) => {
    if (!items.length) return;
    const colEnds = [];
    for (const item of items) {
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= item.startMin) {
          placed = c;
          colEnds[c] = item.endMin;
          break;
        }
      }
      if (placed === -1) {
        placed = colEnds.length;
        colEnds.push(item.endMin);
      }
      item.col = placed;
    }
    const totalCols = Math.max(1, colEnds.length);
    for (const item of items) {
      item.cols = totalCols;
    }
  };

  for (const item of timed) {
    if (!cluster.length) {
      cluster.push(item);
      clusterEnd = item.endMin;
    } else if (item.startMin < clusterEnd) {
      cluster.push(item);
      if (item.endMin > clusterEnd) clusterEnd = item.endMin;
    } else {
      flushCluster(cluster);
      cluster = [item];
      clusterEnd = item.endMin;
    }
  }
  flushCluster(cluster);

  return { timed, allDay };
}

// Natural language date/time parser
export function extractDate(s, todayStr = localToday()) {
  const lower = String(s || '').toLocaleLowerCase('id');
  let date = '', endDate = '', matched = '';
  const base = parseISO(todayStr) || new Date();
  const monthPattern = 'januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des';
  const mapMonth = (m) => {
    const n = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
    const pref = m.substring(0, 3);
    return pref === 'ags' ? 7 : n.indexOf(pref);
  };

  let m = lower.match(new RegExp('\\b(\\d{1,2})\\s*(?:-|–|sampai|sd|s\\/d)\\s*(\\d{1,2})\\s*(' + monthPattern + ')(?:\\s+(20\\d{2}))?\\b', 'i'));
  if (m) {
    const y = Number(m[4] || base.getFullYear()), mo = mapMonth(m[3]);
    const a = toISO(new Date(y, mo, Number(m[1]), 12));
    const b = toISO(new Date(y, mo, Number(m[2]), 12));
    if (parseISO(a) && parseISO(b) && a <= b && parseISO(a).getMonth() === mo && parseISO(b).getMonth() === mo) {
      date = a; endDate = b; matched = m[0];
    }
  }
  if (!date) {
    m = lower.match(new RegExp('\\b(\\d{1,2})\\s*(' + monthPattern + ')(?:\\s+(20\\d{2}))?\\b', 'i'));
    if (m) {
      const y = Number(m[3] || base.getFullYear()), mo = mapMonth(m[2]), d = Number(m[1]);
      let raw = toISO(new Date(y, mo, d, 12));
      if (parseISO(raw)?.getDate() === d && parseISO(raw).getMonth() === mo) {
        if (!m[3] && raw < todayStr) raw = toISO(new Date(y + 1, mo, d, 12));
        date = raw; endDate = raw; matched = m[0];
      }
    }
  }
  if (!date) {
    m = lower.match(/\b(hari ini|besok|lusa)\b/);
    if (m) {
      const v = m[1];
      date = addDays(todayStr, v === 'hari ini' ? 0 : v === 'besok' ? 1 : 2);
      endDate = date; matched = m[0];
    }
  }
  if (!date) {
    const daynames = Object.keys(DAYS).join('|');
    m = lower.match(new RegExp('\\b(?:hari\\s+)?(' + daynames + ')\\b'));
    if (m) {
      const diff = (DAYS[m[1]] - base.getDay() + 7) % 7;
      date = addDays(todayStr, diff);
      endDate = date; matched = m[0];
    }
  }
  return { date, endDate, matched };
}

export function extractTimes(raw) {
  const s = String(raw || '').toLowerCase().replace(/\b(pukul|pk|jam)\b/g, '').trim();
  const r = /(^|\s)(\d{1,2})([.:](\d{2}))?\s*(?:-|–|sampai|sd|s\/d)\s*(\d{1,2})([.:](\d{2}))?\s*(pagi|siang|sore|malam)?\b/i;
  let m = s.match(r);
  const convert = (h, min, part) => {
    let hh = Number(h);
    const mm = Number(min || 0);
    if (hh > 23 || mm > 59) return '';
    if (part === 'malam' && hh < 12) hh += 12;
    if (part === 'sore' && hh < 12) hh += 12;
    if (part === 'siang' && hh < 11) hh += 12;
    if (part === 'pagi' && hh === 12) hh = 0;
    return pad(hh) + ':' + pad(mm);
  };
  if (m) {
    const isExplicit = !!m[3] || !!m[6] || !!m[8] || Number(m[2]) > 12 || Number(m[5]) > 12;
    if (isExplicit) {
      const start = convert(m[2], m[4], m[8]);
      const end = convert(m[5], m[7], m[8]);
      if (start && end && start < end) return { startTime: start, endTime: end, matched: m[0].trim() };
    }
  }
  m = String(raw || '').toLowerCase().match(/\b(?:jam|pukul|pk)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(pagi|siang|sore|malam)?\b/);
  if (m) {
    if (m[2] || m[3] || Number(m[1]) > 12) {
      const time = convert(m[1], m[2], m[3]);
      if (time) return { startTime: time, endTime: '', matched: m[0] };
    }
  }
  m = String(raw || '').match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (m) return { startTime: pad(m[1]) + ':' + m[2], endTime: '', matched: m[0] };
  return { startTime: '', endTime: '', matched: '' };
}

export function quickParse(input, todayStr = localToday()) {
  const text = String(input || '').trim();
  const lowered = text.toLowerCase();

  // Fase 2: awalan "catatan:" membuat catatan
  const noteMatch = /^catatan\s*:\s*(.+)$/is.exec(text);
  if (noteMatch) {
    const rawNote = noteMatch[1].trim();
    const parts = rawNote.split(/\s*[—–\-|:]\s*/);
    const title = (parts[0] || rawNote).slice(0, 120).trim();
    const body = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawNote;
    return {
      type: 'note',
      title: title || 'Catatan cepat',
      notes: body,
      subject: '',
      startDate: '',
      endDate: '',
      startTime: '',
      endTime: '',
      repeat: 'none',
      repeatDays: [],
      repeatUntil: '',
    };
  }

  const date = extractDate(text, todayStr);
  const clock = extractTimes(date.matched ? text.replace(date.matched, ' ') : text);

  let type = 'task';
  if (/\b(libur|cuti|tanggal merah)\b/i.test(lowered)) {
    type = 'holiday';
  } else if (/\b(uh|ulangan|uts|uas|ujian|asesmen|kuis)\b/i.test(lowered)) {
    type = 'exam';
  } else if (/\b(agenda pribadi|target pribadi)\b/i.test(lowered) || (/\b(bikin rangkuman|buat rangkuman|rangkuman sendiri|catatan mandiri)\b/i.test(lowered) && !clock.startTime)) {
    type = 'personal';
  } else if (
    /\b(belajar|merangkum|rangkum|mengulang materi|review materi)\b/i.test(lowered) ||
    (/\b(latihan osn|latihan olimpiade)\b/i.test(lowered) && /setiap|pukul|jam|\d{1,2}[.:]\d{2}/i.test(lowered))
  ) {
    type = 'study';
  } else if (/\b(final|semifinal|penyisihan|babak)\b/i.test(lowered) && /\b(phi|osn|olimpiade|lomba|kompetisi)\b/i.test(lowered)) {
    type = 'competition';
  } else if (/\b(ekskul|ekstrakurikuler|pramuka|futsal|basket|osis|rohis|paskibra|kir)\b/i.test(lowered)) {
    type = 'extracurricular';
  } else if (/\b(ingatkan|pengingat|reminder)\b/i.test(lowered)) {
    type = 'reminder';
  } else if (/\b(rapat|upacara|kunjungan|acara|pertemuan)\b/i.test(lowered)) {
    type = 'event';
  }

  let title = text;
  if (date.matched) title = title.replace(new RegExp(date.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  if (clock.matched) title = title.replace(new RegExp(clock.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  title = title
    .replace(/\b(setiap hari|setiap senin|setiap selasa|setiap rabu|setiap kamis|setiap jumat|setiap sabtu|setiap minggu|jam|pukul|setiap)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,:;-]+$/, '')
    .trim();
  if (!title) title = text;

  const noTime = type === 'exam' || type === 'competition' || type === 'holiday';
  const startTime = noTime ? '' : clock.startTime;
  const endTime = noTime ? '' : clock.endTime;

  return {
    type,
    title,
    startDate: date.date || '',
    endDate: date.endDate || date.date || '',
    startTime,
    endTime,
    repeat: 'none',
    repeatDays: [],
    repeatUntil: '',
  };
}

// Parse multiline Day Plan ("15.30-16.30 Kimia latihan soal")
export function parseDayPlanText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const blocks = [];

  for (const line of lines) {
    const m = /^(\d{1,2})[.:](\d{2})\s*(?:-|–|sampai|sd|s\/d)\s*(\d{1,2})[.:](\d{2})\s+(.+)$/i.exec(line);
    if (m) {
      const startTime = `${pad(m[1])}:${m[2]}`;
      const endTime = `${pad(m[3])}:${m[4]}`;
      const rest = m[5].trim();
      let title = rest;
      let subject = '';
      const bracket = /\[([^\]]+)\]$/.exec(rest) || /\(([^)]+)\)$/.exec(rest);
      if (bracket) {
        subject = bracket[1].trim();
        title = rest.slice(0, bracket.index).trim();
      }
      blocks.push({ startTime, endTime, title: title || rest, subject });
      continue;
    }
    const clock = extractTimes(line);
    if (clock.startTime) {
      const startMin = timeToMinutes(clock.startTime);
      const endTime = clock.endTime || minutesToTime((startMin ?? 900) + 60);
      const title = line
        .replace(clock.matched, '')
        .replace(/\b(jam|pukul|pk)\b/gi, '')
        .trim() || line;
      blocks.push({ startTime: clock.startTime, endTime, title, subject: '' });
    }
  }
  return blocks;
}

export function detectTimeConflicts(blocks) {
  const conflicts = [];
  const valid = (blocks || [])
    .map((b, i) => ({
      ...b,
      idx: i,
      s: timeToMinutes(b.startTime),
      e: timeToMinutes(b.endTime),
    }))
    .filter((b) => b.s !== null && b.e !== null && b.e > b.s && String(b.title || '').trim());

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i], b = valid[j];
      if (a.s < b.e && b.s < a.e) {
        conflicts.push(`${a.startTime}–${a.endTime} (${a.title}) bertabrakan dengan ${b.startTime}–${b.endTime} (${b.title})`);
      }
    }
  }
  return conflicts;
}

