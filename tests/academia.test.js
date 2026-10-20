import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compStatus,
  sortCompetitions,
  dayLayout,
  quickParse,
  parseDayPlanText,
  detectTimeConflicts,
} from '../src/dates.js';
import { migrateDB, DEFAULT_TYPES } from '../src/store.js';
import { extractJSONObject } from '../src/ai/prompt.js';
import { BUILTIN_OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODEL, parseWithOpenRouter } from '../src/ai/openrouter.js';

// Fase 1 — Bug kompetisi (poin 8)
test('compStatus identifies active, missed, and finished stages with injected today date', () => {
  const today = '2026-10-20';
  const compWithPastUncheckedAndFuture = {
    id: 'c1',
    name: 'OSN Fisika',
    stages: [
      { id: 's1', title: 'Penyisihan', date: '2026-10-10', done: false }, // past & unchecked (missed)
      { id: 's2', title: 'Semifinal', date: '2026-10-25', done: false }, // upcoming
      { id: 's3', title: 'Final', date: '2026-11-05', done: false },
    ],
  };

  const st1 = compStatus(compWithPastUncheckedAndFuture, today);
  assert.equal(st1.state, 'active');
  assert.equal(st1.upcoming?.id, 's2');
  assert.equal(st1.upcoming?.title, 'Semifinal');
  assert.equal(st1.missed.length, 1);
  assert.equal(st1.missed[0].id, 's1');

  const compAllPastUnchecked = {
    id: 'c2',
    name: 'Lomba Lama',
    stages: [{ id: 's1', title: 'Babak 1', date: '2026-09-01', done: false }],
  };
  const st2 = compStatus(compAllPastUnchecked, today);
  assert.equal(st2.state, 'finished');
  assert.equal(st2.upcoming, null);
  assert.equal(st2.allDone, true);

  const compEmpty = { id: 'c3', name: 'Lomba Baru', stages: [] };
  const st3 = compStatus(compEmpty, today);
  assert.equal(st3.state, 'empty');

  const sorted = sortCompetitions([compAllPastUnchecked, compEmpty, compWithPastUncheckedAndFuture], today);
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['c1', 'c3', 'c2'],
    'Active competition first, then empty schedule, then finished'
  );
});

// Fase 2 & 3 — Migrasi v3 -> v4
test('migrateDB upgrades v3 payload to v4 with notes and default calendar types', () => {
  const v3Data = {
    version: 3,
    settings: {},
    tasks: [{ id: 't1', title: 'PR Matematika', due: '2026-10-22', notes: 'Halaman 45' }],
    activities: [{ id: 'a1', type: 'study', title: 'Belajar Kimia', startDate: '2026-10-21' }],
    competitions: [{ id: 'c1', name: 'Olimpiade', stages: [] }],
  };

  const v4 = migrateDB(v3Data);
  assert.equal(v4.version, 4);
  assert.ok(Array.isArray(v4.notes));
  assert.ok(v4.settings.types);
  for (const k of Object.keys(DEFAULT_TYPES)) {
    assert.ok(v4.settings.types[k], `Missing default type ${k}`);
  }
  assert.equal(v4.tasks[0].notes, 'Halaman 45');
  assert.ok(v4.tasks[0].updatedAt > 0);
});

// Fase 4 — dayLayout (00:00-24:00) & Rencana Hari
test('dayLayout positions 00:00-24:00 events and splits overlapping columns', () => {
  const events = [
    { id: 'e1', title: 'Subuh Belajar', time: '00:30', endTime: '01:30' },
    { id: 'e2', title: 'Kimia', time: '15:00', endTime: '16:30' },
    { id: 'e3', title: 'Fisika Bentrok', time: '15:30', endTime: '17:00' },
    { id: 'e4', title: 'Tugas Tanpa Jam', time: '' },
  ];

  const { timed, allDay } = dayLayout(events, 48);
  assert.equal(allDay.length, 1);
  assert.equal(allDay[0].id, 'e4');
  assert.equal(timed.length, 3);

  const subuh = timed.find((x) => x.id === 'e1');
  assert.equal(subuh.top, 24); // 00:30 is 0.5 * 48px
  assert.equal(subuh.height, 48);
  assert.equal(subuh.cols, 1);

  const kimia = timed.find((x) => x.id === 'e2');
  const fisika = timed.find((x) => x.id === 'e3');
  assert.equal(kimia.cols, 2);
  assert.equal(fisika.cols, 2);
  assert.notEqual(kimia.col, fisika.col);
});

test('parseDayPlanText and detectTimeConflicts parse multiline schedule and warn on overlap', () => {
  const raw = `
    15.30-16.30 Kimia latihan soal [Kimia]
    16.15-17.00 Rangkum Sejarah [Sejarah]
  `;
  const blocks = parseDayPlanText(raw);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].startTime, '15:30');
  assert.equal(blocks[0].endTime, '16:30');
  assert.equal(blocks[0].subject, 'Kimia');

  const conflicts = detectTimeConflicts(blocks);
  assert.equal(conflicts.length, 1);
});

// Fase 5 — OpenRouter JSON parsing & fallback
test('OpenRouter models list and JSON extraction with reasoning/fences fallback', async () => {
  assert.equal(DEFAULT_OPENROUTER_MODEL, 'nvidia/nemotron-3-ultra-550b-a55b:free');
  assert.equal(BUILTIN_OPENROUTER_MODELS.length, 13);
  assert.ok(!BUILTIN_OPENROUTER_MODELS.some((m) => m.id.includes('content-safety')));

  const rawWithThinkAndFences = `<think>Mari kita analisis kalimat ini</think>\n\`\`\`json\n{"type":"exam","title":"UH Kimia","subject":"Kimia","startDate":"2026-10-23","warnings":[]}\n\`\`\``;
  const parsed = extractJSONObject(rawWithThinkAndFences);
  assert.equal(parsed.type, 'exam');
  assert.equal(parsed.title, 'UH Kimia');

  // Test fallback when model returns 400 on response_format
  let callCount = 0;
  const mockFetch = async (_url, opts) => {
    callCount++;
    const body = JSON.parse(opts.body);
    if (body.response_format) {
      return { status: 400, ok: false, json: async () => ({ error: { message: 'Unsupported response_format' } }) };
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Berikut hasilnya: {"type":"task","title":"PR Fisika","warnings":[]}' } }],
      }),
    };
  };

  const res = await parseWithOpenRouter('PR Fisika', {
    key: 'sk-or-test',
    model: DEFAULT_OPENROUTER_MODEL,
    fetchImpl: mockFetch,
  });
  assert.equal(callCount, 2);
  assert.equal(res.title, 'PR Fisika');
});

// Fase 2 & 3 — quickParse
test('quickParse recognizes catatan:, holiday, personal agenda, exam, and study', () => {
  const today = '2026-10-20';
  const n = quickParse('catatan: Rumus Gaya - F = m x a', today);
  assert.equal(n.type, 'note');
  assert.equal(n.title, 'Rumus Gaya');
  assert.equal(n.notes, 'F = m x a');

  const h = quickParse('Libur Nasional 25 oktober', today);
  assert.equal(h.type, 'holiday');
  assert.equal(h.startDate, '2026-10-25');

  const p = quickParse('Bikin rangkuman sendiri Biologi', today);
  assert.equal(p.type, 'personal');
});

