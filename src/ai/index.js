// src/ai/index.js — Unified AI facade (Gemini + OpenRouter)
// Keys remain strictly in localStorage / sessionStorage on device (never synced to Firestore)

import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL, parseWithGemini, resolveGeminiModel } from './gemini.js';
import {
  BUILTIN_OPENROUTER_MODELS,
  DEFAULT_OPENROUTER_MODEL,
  getCachedOpenRouterModels,
  refreshOpenRouterModels,
  parseWithOpenRouter,
} from './openrouter.js';
import { extractJSONObject } from './prompt.js';

const STORAGE_KEY = 'academia_gemini_cfg';
const SESSION_KEY = 'academia_gemini_session_key';
const OR_SESSION_KEY = 'academia_openrouter_session_key';

export const AI = {
  GEMINI_MODELS,
  BUILTIN_OPENROUTER_MODELS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  extractJSONObject,
  getOpenRouterModels: getCachedOpenRouterModels,
  refreshOpenRouterModels,

  getConfig() {
    try {
      const saved = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || '{}');
      const geminiSession = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) || '';
      const orSession = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(OR_SESSION_KEY)) || '';

      const provider = saved.provider === 'openrouter' ? 'openrouter' : 'gemini';
      const geminiKey = saved.geminiKey ?? saved.key ?? geminiSession ?? '';
      const openrouterKey = saved.openrouterKey ?? orSession ?? '';
      const geminiModel = resolveGeminiModel(saved.geminiModel || saved.model);
      const openrouterModel = saved.openrouterModel || DEFAULT_OPENROUTER_MODEL;
      const customOpenrouterModel = saved.customOpenrouterModel || '';
      const persist = Boolean(saved.persist ?? (saved.key || saved.geminiKey || saved.openrouterKey));

      return {
        provider,
        geminiKey,
        openrouterKey,
        geminiModel,
        openrouterModel,
        customOpenrouterModel,
        persist,
        // backwards compatible properties
        key: provider === 'openrouter' ? openrouterKey : geminiKey,
        model:
          provider === 'openrouter'
            ? customOpenrouterModel.trim() || openrouterModel
            : geminiModel,
      };
    } catch (e) {
      return {
        provider: 'gemini',
        geminiKey: '',
        openrouterKey: '',
        geminiModel: DEFAULT_GEMINI_MODEL,
        openrouterModel: DEFAULT_OPENROUTER_MODEL,
        customOpenrouterModel: '',
        persist: false,
        key: '',
        model: DEFAULT_GEMINI_MODEL,
      };
    }
  },

  setConfig({
    provider = 'gemini',
    geminiKey = '',
    openrouterKey = '',
    geminiModel = DEFAULT_GEMINI_MODEL,
    openrouterModel = DEFAULT_OPENROUTER_MODEL,
    customOpenrouterModel = '',
    persist = true,
  }) {
    const cleanGeminiKey = String(geminiKey || '').trim();
    const cleanOrKey = String(openrouterKey || '').trim();
    const chosenProvider = provider === 'openrouter' ? 'openrouter' : 'gemini';

    if (typeof localStorage === 'undefined') return;

    if (persist) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          provider: chosenProvider,
          key: cleanGeminiKey,
          geminiKey: cleanGeminiKey,
          openrouterKey: cleanOrKey,
          model: resolveGeminiModel(geminiModel),
          geminiModel: resolveGeminiModel(geminiModel),
          openrouterModel: openrouterModel || DEFAULT_OPENROUTER_MODEL,
          customOpenrouterModel: String(customOpenrouterModel || '').trim(),
          persist: true,
        })
      );
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(OR_SESSION_KEY);
    } else {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          provider: chosenProvider,
          model: resolveGeminiModel(geminiModel),
          geminiModel: resolveGeminiModel(geminiModel),
          openrouterModel: openrouterModel || DEFAULT_OPENROUTER_MODEL,
          customOpenrouterModel: String(customOpenrouterModel || '').trim(),
          persist: false,
        })
      );
      if (cleanGeminiKey) sessionStorage.setItem(SESSION_KEY, cleanGeminiKey);
      else sessionStorage.removeItem(SESSION_KEY);
      if (cleanOrKey) sessionStorage.setItem(OR_SESSION_KEY, cleanOrKey);
      else sessionStorage.removeItem(OR_SESSION_KEY);
    }
  },

  hasKey() {
    const cfg = this.getConfig();
    return Boolean(cfg.key && cfg.key.trim());
  },

  getProviderName() {
    return this.getConfig().provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
  },

  clearKey(provider = null) {
    const cfg = this.getConfig();
    const target = provider || cfg.provider;
    if (target === 'openrouter') {
      this.setConfig({ ...cfg, openrouterKey: '' });
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(OR_SESSION_KEY);
    } else {
      this.setConfig({ ...cfg, geminiKey: '' });
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
    }
  },

  async parse(text, override = null) {
    const cfg = { ...this.getConfig(), ...(override || {}) };
    const provider = cfg.provider === 'openrouter' ? 'openrouter' : 'gemini';

    if (provider === 'openrouter') {
      const key = override?.key !== undefined ? override.key : cfg.openrouterKey;
      const model =
        override?.model !== undefined
          ? override.model
          : (cfg.customOpenrouterModel || '').trim() || cfg.openrouterModel;
      return parseWithOpenRouter(text, { key, model });
    } else {
      const key = override?.key !== undefined ? override.key : cfg.geminiKey;
      const model = override?.model !== undefined ? override.model : cfg.geminiModel;
      return parseWithGemini(text, { key, model });
    }
  },
};

if (typeof window !== 'undefined') {
  window.AcademiaGemini = AI;
}

