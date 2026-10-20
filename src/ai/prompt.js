// src/ai/prompt.js — Shared system prompt and JSON extractor for Gemini & OpenRouter

import { localToday } from '../dates.js';

export function buildSystemPrompt(today = localToday()) {
  return `Kamu adalah asisten pintar untuk aplikasi perencana akademik "Academia".
Hari ini adalah tanggal: ${today}.
Tugasmu adalah menganalisis kalimat singkat pengguna (bahasa Indonesia) menjadi data aktivitas terstruktur dalam JSON murni.

Kategori tipe ('type'):
- 'task': PR, tugas dari guru/sekolah, proyek, latihan soal dengan tenggat.
- 'personal': Agenda belajar pribadi tanpa tenggat resmi dari guru (misal: bikin rangkuman sendiri, baca bab, checklist belajar).
- 'exam': Ulangan, UH, UTS, UAS, kuis, tes, ujian (hanya tanggal, tanpa jam/waktu).
- 'study': Sesi belajar mandiri terjadwal pada jam tertentu.
- 'competition': Lomba, babak olimpiade (penyisihan, semifinal, final - hanya tanggal tahapan).
- 'holiday': Hari libur, cuti bersama, libur semester (rentang tanggal, tanpa jam).
- 'extracurricular': Kegiatan ekskul (pramuka, futsal, OSIS, KIR, dll).
- 'reminder': Pengingat singkat pada tanggal/jam tertentu.
- 'event': Pertemuan, rapat, upacara, acara sekolah.
- 'note': Catatan materi, rumus, ide, atau informasi yang ingin disimpan sebagai catatan.

Format output JSON yang WAJIB dipatuhi tanpa markdown pembungkus:
{
  "type": "task" | "personal" | "exam" | "study" | "competition" | "holiday" | "extracurricular" | "reminder" | "event" | "note",
  "title": "Nama kegiatan atau judul catatan ringkas",
  "subject": "Mata pelajaran jika ada atau string kosong",
  "startDate": "YYYY-MM-DD" atau "",
  "endDate": "YYYY-MM-DD" atau "",
  "startTime": "HH:mm" atau "",
  "endTime": "HH:mm" atau "",
  "repeat": "none" | "daily" | "weekly",
  "repeatDays": [],
  "repeatUntil": "",
  "stageName": "Nama babak jika tipe competition (misal: Semifinal)",
  "competitionName": "Nama lomba jika tipe competition",
  "notes": "Catatan tambahan atau isi catatan jika tipe note",
  "warnings": ["Peringatan jika ada tanggal yang ambigu atau tidak jelas"]
}`;
}

export function extractJSONObject(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Balasan AI kosong.');
  }
  let cleaned = rawText.trim();
  // Strip <think>...</think> blocks if reasoning model outputs them
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object') {
      direct.warnings = Array.isArray(direct.warnings) ? direct.warnings : [];
      return direct;
    }
  } catch (_) {}

  // Find first balanced {...}
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(slice);
      parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
      return parsed;
    } catch (_) {}
  }
  throw new Error('Gagal membaca format JSON dari balasan AI.');
}

