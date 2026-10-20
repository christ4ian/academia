// src/ui/icons.js — SVG icons and HTML escape helpers

export const ICON = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  tasks: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="m7 10 2 2 3-3M14 10h4M7 16h11"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  notes: '<path d="M6 3h9l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 11h6M9 15h6"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v5M8 21h8M9 19h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l-1.7 1.7a1.8 1.8 0 0 0-2-.4l-1 .4a1.8 1.8 0 0 0-1.1 1.6h-2.4a1.8 1.8 0 0 0-1.1-1.6l-1-.4a1.8 1.8 0 0 0-2 .4l-1.7-1.7a1.8 1.8 0 0 0 .4-2l-.4-1A1.8 1.8 0 0 0 4 12.9v-2.4a1.8 1.8 0 0 0 1.6-1.1l.4-1a1.8 1.8 0 0 0-.4-2l1.7-1.7a1.8 1.8 0 0 0 2 .4l1-.4A1.8 1.8 0 0 0 11.4 3h2.4a1.8 1.8 0 0 0 1.1 1.6l1 .4a1.8 1.8 0 0 0 2-.4l1.7 1.7a1.8 1.8 0 0 0-.4 2l.4 1a1.8 1.8 0 0 0 1.6 1.1v2.4a1.8 1.8 0 0 0-1.6 1.1z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M4 4.5C7 3 10 3 12 5c2-2 5-2 8-.5V20c-3-1.5-6-1.5-8 .5-2-2-5-2-8-.5zM12 5v15"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/>',
  flag: '<path d="M5 21V4m0 1c6-3 8 3 14 0v10c-6 3-8-3-14 0"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  spark: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  file: '<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8"/>',
  pin: '<path d="m15 4 5 5-4 4-2 6-6-6 6-2 4-4M9 15l-5 5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.8-3.8 5-6 8-6s6.2 2.2 8 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  google:
    '<path d="M21.35 11.1h-9.17v2.73h5.51c-.24 1.48-1.67 4.35-5.51 4.35-3.31 0-6.01-2.75-6.01-6.18s2.7-6.18 6.01-6.18c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.99 3.18 14.79 2.2 12.18 2.2 6.76 2.2 2.4 6.58 2.4 12s4.36 9.8 9.78 9.8c5.65 0 9.39-3.97 9.39-9.56 0-.64-.07-1.13-.22-1.64z" fill="currentColor" stroke="none"/>',
};

export const icon = (name, cl = '') =>
  `<svg class="icon ${cl}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ICON.file}</svg>`;

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function heading(label, title, desc) {
  return `<div class="page-intro"><div class="eyebrow">${label}</div><h1>${title}</h1><p>${desc}</p></div>`;
}

