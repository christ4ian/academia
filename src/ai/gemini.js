// src/ai/gemini.js — Google Gemini provider

import { buildSystemPrompt, extractJSONObject } from './prompt.js';

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', ctx: '1M' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', ctx: '1M' },
];

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function resolveGeminiModel(m) {
  if (m === 'gemini-3.5-flash-lite' || m === '3.5-flash-lite') return 'gemini-3.5-flash-lite';
  return m || DEFAULT_GEMINI_MODEL;
}

export async function parseWithGemini(text, { key, model }) {
  const apiKey = (key || '').trim();
  const chosenModel = resolveGeminiModel(model);

  if (!apiKey) {
    throw new Error('API key Gemini belum diisi. Masukkan API key di menu Pengaturan.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

  return extractJSONObject(candidateText);
}

