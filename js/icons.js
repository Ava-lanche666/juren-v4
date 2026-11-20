/* 聚仁 · 线性图标与天气图标（内联 SVG，离线可用） */

const P = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h2M14 14h2M8 17.5h2"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 9.2 9.2 0 0 1-3.8-.8L4 20l1.2-4a8 8 0 0 1-1.2-4.2A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/><path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/><path d="M8 7h7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.4 7 7.2 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L20 7.2l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M7 12h10"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 16.5 19.8 19l2.2.8-2.2.7L19 23l-.8-2.5-2.2-.7 2.2-.8.8-2.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.4 3.4 0 0 0 7 18Z"/>',
  partly: '<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 3v1.6M3 8.5h1.6M4.6 4.6l1.1 1.1"/><path d="M9 19h9a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.7 1.3A2.9 2.9 0 0 0 9 19Z"/>',
  rain: '<path d="M7 15h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.4 3.4 0 0 0 7 15Z"/><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.4 3.4 0 0 0 7 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01"/>',
  storm: '<path d="M7 15h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.4 3.4 0 0 0 7 15Z"/><path d="m12 16-2 4h3l-1 3 4-5h-3l1.5-2"/>',
  fog: '<path d="M6 10h12M5 14h14M8 18h9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 5.3"/><path d="M20 4v7h-7"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 6 3 3"/>',
  send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
  weather: '<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.4 3.4 0 0 0 7 18Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};

export function icon(name, size = 20, className = '') {
  const body = P[name] || P.spark;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const WEATHER = {
  0: { label: '晴', icon: 'sun', tone: 'sun' },
  1: { label: '大部晴', icon: 'partly', tone: 'sun' },
  2: { label: '多云', icon: 'partly', tone: 'cloud' },
  3: { label: '阴', icon: 'cloud', tone: 'cloud' },
  45: { label: '有雾', icon: 'fog', tone: 'fog' },
  48: { label: '雾凇', icon: 'fog', tone: 'fog' },
  51: { label: '小毛毛雨', icon: 'rain', tone: 'rain' },
  53: { label: '毛毛雨', icon: 'rain', tone: 'rain' },
  55: { label: '密毛毛雨', icon: 'rain', tone: 'rain' },
  56: { label: '冻毛毛雨', icon: 'rain', tone: 'rain' },
  57: { label: '冻毛毛雨', icon: 'rain', tone: 'rain' },
  61: { label: '小雨', icon: 'rain', tone: 'rain' },
  63: { label: '中雨', icon: 'rain', tone: 'rain' },
  65: { label: '大雨', icon: 'rain', tone: 'rain' },
  66: { label: '冻雨', icon: 'rain', tone: 'rain' },
  67: { label: '冻雨', icon: 'rain', tone: 'rain' },
  71: { label: '小雪', icon: 'snow', tone: 'snow' },
  73: { label: '中雪', icon: 'snow', tone: 'snow' },
  75: { label: '大雪', icon: 'snow', tone: 'snow' },
  77: { label: '米雪', icon: 'snow', tone: 'snow' },
  80: { label: '阵雨', icon: 'rain', tone: 'rain' },
  81: { label: '强阵雨', icon: 'rain', tone: 'rain' },
  82: { label: '暴雨', icon: 'storm', tone: 'storm' },
  85: { label: '阵雪', icon: 'snow', tone: 'snow' },
  86: { label: '强阵雪', icon: 'snow', tone: 'snow' },
  95: { label: '雷阵雨', icon: 'storm', tone: 'storm' },
  96: { label: '雷阵雨夹冰雹', icon: 'storm', tone: 'storm' },
  99: { label: '强雷暴冰雹', icon: 'storm', tone: 'storm' },
};

export function weatherMeta(code) {
  return WEATHER[code] || { label: '未知', icon: 'cloud', tone: 'cloud' };
}

export function weatherIcon(code, size = 18, className = '') {
  return icon(weatherMeta(code).icon, size, className);
}

export function weatherTip(code, precip = 0) {
  const tone = weatherMeta(code).tone;
  if (tone === 'storm') return '有雷雨，尽量把户外安排改到室内，通勤多留 20 分钟。';
  if (tone === 'rain' || precip >= 50) return '有降水，记得带伞；路上多留 10 分钟。';
  if (tone === 'snow') return '有雪，路面可能湿滑，提前出门。';
  if (tone === 'sun' && precip < 20) return '天气不错，适合把需要专注的任务放在靠窗的位置。';
  if (tone === 'fog') return '能见度较低，通勤注意安全。';
  return '天气平稳，按原计划推进即可。';
}
