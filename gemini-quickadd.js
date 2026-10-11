/**
 * Academia Gemini QuickAdd Integration
 * Menghubungkan input bahasa alami pengguna dengan model Google Gemini
 */
const AcademiaGemini = (() => {
  const STORAGE_KEY = 'academia_gemini_cfg';
  const SESSION_KEY = 'academia_gemini_session_key';
  const DEFAULT_MODEL = 'gemini-3.8-flash';

  function resolveModel(m) {
    if (m === 'gemini-3.5-flash-lite' || m === '3.5-flash-lite') return 'gemini-3.5-flash-lite';
    return 'gemini-3.8-flash';
  }

  function getConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const sessionKey = sessionStorage.getItem(SESSION_KEY) || '';
      return {
        key: saved.key || sessionKey || '',
        model: resolveModel(saved.model),
        persist: !!saved.key
      };
    } catch (e) {
      return { key: '', model: DEFAULT_MODEL, persist: false };
    }
  }

  function setConfig({ key, model, persist }) {
    const trimmedKey = (key || '').trim();
    const chosenModel = resolveModel(model);

    if (persist) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: trimmedKey, model: chosenModel }));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      if (trimmedKey) sessionStorage.setItem(SESSION_KEY, trimmedKey);
      else sessionStorage.removeItem(SESSION_KEY);
    }
  }

  function getKey() {
    return getConfig().key;
  }

  function getModel() {
    return getConfig().model;
  }

  function isPersistent() {
    return getConfig().persist;
  }

  function clearKey() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function buildSystemPrompt() {
    const today = new Date().toISOString().slice(0, 10);
    return `Kamu adalah asisten pintar untuk aplikasi perencana akademik "Academia".
Hari ini adalah tanggal: ${today}.
Tugasmu adalah menganalisis kalimat singkat pengguna (bahasa Indonesia) menjadi data aktivitas terstruktur dalam JSON murni.

Kategori tipe ('type'):
- 'task': PR, tugas, proyek, latihan soal, pekerjaan rumah.
- 'exam': Ulangan, UH, UTS, UAS, kuis, tes, ujian (hanya tanggal, tanpa jam/waktu).
- 'study': Sesi belajar mandiri, merangkum, review materi (tidak berulang/tanpa pengulangan).
- 'competition': Lomba, babak olimpiade (penyisihan, semifinal, final - hanya tanggal tahapan, tanpa jam).
- 'event': Pertemuan, rapat, upacara, acara sekolah.

Format output JSON yang WAJIB dipatuhi tanpa markdown pembungkus:
{
  "type": "task" | "exam" | "study" | "competition" | "event",
  "title": "Nama kegiatan ringkas",
  "subject": "Mata pelajaran jika ada atau string kosong",
  "startDate": "YYYY-MM-DD" atau "",
  "endDate": "YYYY-MM-DD" atau "",
  "startTime": "HH:mm" atau "",
  "endTime": "HH:mm" atau "",
  "repeat": "none",
  "repeatDays": [],
  "repeatUntil": "",
  "stageName": "Nama babak jika tipe competition (misal: Semifinal)",
  "competitionName": "Nama lomba jika tipe competition",
  "notes": "Catatan tambahan jika ada",
  "warnings": ["Peringatan jika ada tanggal yang ambigu atau tidak jelas"]
}`;
  }

  async function parse(text, overrideConfig = null) {
    const cfg = overrideConfig || getConfig();
    const apiKey = cfg.key;
    const model = cfg.model || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error('API key Gemini belum diisi. Masukkan API key di menu Pengaturan.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: text }]
        }
      ],
      systemInstruction: {
        parts: [{ text: buildSystemPrompt() }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `HTTP ${res.status}: Gagal menghubungi server Gemini.`;
      throw new Error(msg);
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini tidak memberikan respon teks yang valid.');
    }

    try {
      const parsed = JSON.parse(candidateText);
      parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
      return parsed;
    } catch (e) {
      throw new Error('Gagal membaca format JSON dari balasan Gemini.');
    }
  }

  return {
    getConfig,
    setConfig,
    getKey,
    getModel,
    isPersistent,
    clearKey,
    parse
  };
})();
