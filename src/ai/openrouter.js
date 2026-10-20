// src/ai/openrouter.js — OpenRouter provider with 13 built-in free models & live refresh

import { buildSystemPrompt, extractJSONObject } from './prompt.js';

export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

// 13 built-in free models from user specification (Content Safety excluded as moderation model)
export const BUILTIN_OPENROUTER_MODELS = [
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA: Nemotron 3 Ultra (free)',
    ctx: '1M',
    sunset: '',
  },
  {
    id: 'minimax/minimax-m3.1-flash:free',
    name: 'MiniMax: MiniMax M3.1 Flash (free)',
    ctx: '1M',
    sunset: '',
  },
  {
    id: 'xingchen-agi/xing4.0-29b-a4b:free',
    name: 'XingChen: Xing4.0 29B A4B (free)',
    ctx: '262K',
    sunset: '',
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'NVIDIA: Nemotron 3.5 Super VL (free)',
    ctx: '1M',
    sunset: '',
  },
  {
    id: 'dots-studio/dots-3-note-preview:free',
    name: 'Dots Studio: Dots3-Note Preview (free)',
    ctx: '512K',
    sunset: 'Hilang 31 Des 2026',
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'LiquidAI: LFM2.5-2.6B (free)',
    ctx: '66K',
    sunset: '',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA: Nemotron 3.5 Lightning (free)',
    ctx: '1M',
    sunset: '',
  },
  {
    id: 'thinkingmachines/inkling-small:free',
    name: 'Thinking Machines: Inkling Small (free)',
    ctx: '1.05M',
    sunset: '',
  },
  {
    id: 'poolside/laguna-s-2.1:free',
    name: 'Poolside: Laguna S 2.1 (free)',
    ctx: '262K',
    sunset: 'Hilang 31 Okt 2026',
  },
  {
    id: 'thinkingmachines/inkling:free',
    name: 'Thinking Machines: Inkling (free)',
    ctx: '1.05M',
    sunset: '',
  },
  {
    id: 'poolside/laguna-xs-2.1:free',
    name: 'Poolside: Laguna XS 2.1 (free)',
    ctx: '262K',
    sunset: 'Hilang 31 Okt 2026',
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere: North Mini Code (free)',
    ctx: '256K',
    sunset: '',
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    name: 'NVIDIA: Nemotron 3 Nano Omni (free)',
    ctx: '256K',
    sunset: '',
  },
];

const MODELS_CACHE_KEY = 'academia_openrouter_models_cache_v1';

export function getCachedOpenRouterModels() {
  try {
    if (typeof localStorage === 'undefined') return BUILTIN_OPENROUTER_MODELS;
    const raw = localStorage.getItem(MODELS_CACHE_KEY);
    if (!raw) return BUILTIN_OPENROUTER_MODELS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Merge built-in models first so the 13 curated models are always available
      const byId = new Map();
      for (const m of BUILTIN_OPENROUTER_MODELS) byId.set(m.id, m);
      for (const m of parsed) {
        if (m && m.id && !byId.has(m.id)) byId.set(m.id, m);
      }
      return [...byId.values()];
    }
  } catch (_) {}
  return BUILTIN_OPENROUTER_MODELS;
}

function formatCtx(ctxLen) {
  const n = Number(ctxLen || 0);
  if (!n) return '';
  if (n >= 1000000) return `${+(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export async function refreshOpenRouterModels() {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Gagal memuat daftar model OpenRouter.`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  const freeModels = list
    .filter((m) => {
      if (!m || !m.id) return false;
      if (m.id.includes('content-safety')) return false;
      const pPrompt = String(m.pricing?.prompt ?? '');
      const pComp = String(m.pricing?.completion ?? '');
      const isZero =
        (pPrompt === '0' || pPrompt === '0.0' || Number(pPrompt) === 0) &&
        (pComp === '0' || pComp === '0.0' || Number(pComp) === 0);
      return isZero || m.id.endsWith(':free');
    })
    .map((m) => {
      const builtin = BUILTIN_OPENROUTER_MODELS.find((b) => b.id === m.id);
      return {
        id: m.id,
        name: m.name || builtin?.name || m.id,
        ctx: builtin?.ctx || formatCtx(m.context_length),
        sunset: builtin?.sunset || '',
      };
    });

  const mergedMap = new Map();
  for (const b of BUILTIN_OPENROUTER_MODELS) mergedMap.set(b.id, b);
  for (const f of freeModels) {
    if (!mergedMap.has(f.id)) mergedMap.set(f.id, f);
  }
  const finalModels = [...mergedMap.values()];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(finalModels));
    }
  } catch (_) {}
  return finalModels;
}

export async function parseWithOpenRouter(text, { key, model, fetchImpl = fetch }) {
  const apiKey = (key || '').trim();
  const chosenModel = (model || '').trim() || DEFAULT_OPENROUTER_MODEL;

  if (!apiKey) {
    throw new Error('API key OpenRouter belum diisi. Masukkan API key di menu Pengaturan AI.');
  }

  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://academia.app',
    'X-Title': 'Academia',
  };

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: text },
  ];

  const makeRequest = async (useJsonFormat) => {
    const body = {
      model: chosenModel,
      messages,
      temperature: 0.1,
    };
    if (useJsonFormat) {
      body.response_format = { type: 'json_object' };
    }
    return fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  };

  let res = await makeRequest(true);

  // Fallback: some free models reject response_format with 400
  if (res.status === 400) {
    res = await makeRequest(false);
  }

  if (res.status === 429 || res.status === 402) {
    throw new Error('Model gratis sedang penuh atau batas kuota tercapai, coba pilih model lain.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const rawMsg = errBody?.error?.message || `HTTP ${res.status}: Gagal menghubungi OpenRouter.`;
    throw new Error(rawMsg);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const content = msg?.content || '';
  if (!content) {
    throw new Error('OpenRouter tidak memberikan respon teks yang valid.');
  }

  return extractJSONObject(content);
}

