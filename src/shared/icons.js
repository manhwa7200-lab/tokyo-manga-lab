// One place for every icon. Each value is the inner markup of a 24x24, stroke-based SVG.
export const ICONS = Object.freeze({
  home: '<path d="M3.5 11 12 3.5 20.5 11"/><path d="M5.5 9.8V20h4.5v-5.5h4V20h4.5V9.8"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5z"/>',
  library: '<rect x="4" y="4" width="4.5" height="16" rx="1"/><rect x="10" y="4" width="4.5" height="16" rx="1"/><path d="m16.4 6.2 3.8 1-3.4 12.6-3.8-1"/>',
  manage: '<path d="M5 4h10a2 2 0 0 1 2 2v3"/><path d="M5 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/><path d="M7 9h6M7 13h3"/><path d="m14 20 1-3 6-6a1.4 1.4 0 0 1 2 2l-6 6z"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-3.8 3.8-6 7.5-6s6.9 2.2 7.5 6"/>',
  sliders: '<path d="M4 7h9M19 7h1"/><circle cx="16" cy="7" r="2.2"/><path d="M4 17h1M11 17h9"/><circle cx="8" cy="17" r="2.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  bookmark: '<path d="M7 4h10v16.5l-5-4-5 4z"/>',
  bookmarkFill: '<path class="fill" d="M7 4h10v16.5l-5-4-5 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2-.5-1.2.1-2.5 1.5-2.5H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.8 3.5 12 3.5z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.8" r="1"/><circle cx="16" cy="10" r="1"/>',
  bookOpen: '<path d="M3 5.5c3-1.2 6-1 9 1v13c-3-2-6-2.2-9-1z"/><path d="M21 5.5c-3-1.2-6-1-9 1v13c3-2 6-2.2 9-1z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.2 3.2 3.2 14.8 0 18M12 3c-3.2 3.2-3.2 14.8 0 18"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.6 3.2 7.6 7.5 9 4.3-1.4 7.5-4.4 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 2H4.2z"/><path d="M10 21.5h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/>',
  flask: '<path d="M9.5 3h5M10 3v5.8L4.8 18.4a1.6 1.6 0 0 0 1.4 2.4h11.6a1.6 1.6 0 0 0 1.4-2.4L14 8.8V3"/><path d="M7.5 15h9"/>',
  heart: '<path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.5c0 6.1-8 11-8 11z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.8"/>',
  external: '<path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  cloud: '<path d="M7 18.5a4.2 4.2 0 0 1-.6-8.3A6 6 0 0 1 18 9.6a4.45 4.45 0 0 1-.5 8.9z"/>',
  pen: '<path d="m4 20 .9-4.2L16.5 4.2l3.3 3.3L8.2 19.1z"/><path d="m14.5 6.2 3.3 3.3"/>',
  moon: '<path d="M20 14.3A8 8 0 0 1 9.7 4a8 8 0 1 0 10.3 10.3z"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  type: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r=".8"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  plug: '<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9z"/>',
  wifi: '<path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a7.7 7.7 0 0 1 11 0M9.6 16a3.4 3.4 0 0 1 4.8 0"/><circle cx="12" cy="19" r=".8"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 13h9.4l.8-13"/>',
  layers: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5z"/>'
});

export function icon(name, className = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Fills any <span data-icon="home"></span> in static HTML.
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => {
    if (node.dataset.iconReady) return;
    node.innerHTML = icon(node.dataset.icon);
    node.dataset.iconReady = '1';
  });
}
